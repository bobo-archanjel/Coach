import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { effectiveTier, type SubscriptionRow } from "@/lib/billing/entitlements";
import { loadBrandingForTrainer } from "@/lib/branding/server";
import { loadWeeklySummary } from "@/lib/gamification/weeklyServer";
import { summaryWeekFor } from "@/lib/gamification/weekly";
import { isLocale, type Locale } from "@/lib/i18n/locales";
import { addDaysIso, todayIso } from "@/lib/reports/period";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { getMailSecret, getSmtpConfig, mailSiteUrl } from "./config";
import { buildFrom, buildMessage, buildReplyTo, type MailTransport } from "./message";
import { firstNameOf } from "./welcome";
import { mailBrandFrom, renderWeeklyMail, type MailBrand } from "./templates";
import { signUnsubToken } from "./token";
import { sendMail } from "./transport";
import { decideWeeklyEmail, type WeeklySkipReason } from "./weeklyRules";

// FitPilot — týždenné zhrnutie „Tvoj týždeň“ e-mailom klientom (cron, Vercel). Číta cez service role
// (cron nemá session), ale KAŽDÝ dopyt je ohraničený na jedného klienta (client_id) a súhrn sa posiela
// výhradne na adresu účtu toho istého klienta — dáta sa nemiešajú medzi klientmi. Idempotentné:
// weekly_summary_log má primárny kľúč (client_id, week_start), takže opakovaný beh nič nezdvojí
// (a po prerušení — napr. časový limit — dobehne zvyšok).

const PAGE = 200;
const CONCURRENCY = 5;
const SUB_COLUMNS =
  "trainer_id, stripe_customer_id, stripe_subscription_id, tier, status, trial_ends_at, current_period_end, cancel_at_period_end, past_due_since, comped, client_limit, scheduled_tier, scheduled_client_limit, scheduled_change_at";

export interface WeeklyJobStats {
  configured: boolean;
  week: string | null;
  considered: number;
  sent: number;
  failed: number;
  skipped: Record<WeeklySkipReason | "already_sent", number>;
  /** časový rozpočet vypršal skôr, než sa spracovali všetci (ďalší beh dokončí zvyšok) */
  truncated: boolean;
}

export interface WeeklyJobOptions {
  now?: Date;
  /** po tomto čase sa nezačínajú noví klienti (ms) */
  budgetMs?: number;
  admin?: SupabaseClient | null;
  transport?: MailTransport;
}

interface ClientRow {
  id: string;
  user_id: string;
  full_name: string | null;
  trainer_id: string;
  active_plan_id: string | null;
}

interface TrainerCtx {
  active: boolean;
  brand: MailBrand;
  email: string | null;
  name: string;
}

export function emptyStats(configured: boolean): WeeklyJobStats {
  return {
    configured,
    week: null,
    considered: 0,
    sent: 0,
    failed: 0,
    skipped: { opted_out: 0, no_email: 0, trainer_inactive: 0, dormant: 0, already_sent: 0 },
    truncated: false,
  };
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

async function hadRecentActivity(admin: SupabaseClient, clientId: string, week: string): Promise<boolean> {
  const from = addDaysIso(week, -14);
  const [w, f] = await Promise.all([
    admin.from("workout_logs").select("id", { head: true, count: "exact" }).eq("client_id", clientId).eq("status", "completed").gte("performed_on", from).lt("performed_on", week),
    admin.from("food_logs").select("id", { head: true, count: "exact" }).eq("client_id", clientId).gte("eaten_on", from).lt("eaten_on", week),
  ]);
  return (w.count ?? 0) > 0 || (f.count ?? 0) > 0;
}

export async function runWeeklySummaryJob(opts: WeeklyJobOptions = {}): Promise<WeeklyJobStats> {
  const cfg = getSmtpConfig();
  const secret = getMailSecret();
  if (!cfg || !secret) {
    console.warn("mail.weeklyJob: SMTP alebo tajný kľúč nie je nastavený, nič sa neposielalo");
    return emptyStats(false);
  }
  const admin = opts.admin === undefined ? tryCreateAdminClient() : opts.admin;
  if (!admin) return emptyStats(true);

  const now = opts.now ?? new Date();
  const deadline = now.getTime() + (opts.budgetMs ?? 50_000);
  const today = todayIso(now);
  const week = summaryWeekFor(today);
  const site = mailSiteUrl();
  const stats = emptyStats(true);
  stats.week = week;

  const trainers = new Map<string, TrainerCtx>();
  async function trainerCtx(ids: string[]): Promise<void> {
    const missing = ids.filter((id) => !trainers.has(id));
    if (missing.length === 0) return;
    const [subs, profs] = await Promise.all([
      admin!.from("trainer_subscriptions").select(SUB_COLUMNS).in("trainer_id", missing),
      admin!.from("profiles").select("id, full_name, email").in("id", missing),
    ]);
    const subBy = new Map(((subs.data ?? []) as SubscriptionRow[]).map((s) => [s.trainer_id, s]));
    const profBy = new Map(((profs.data ?? []) as { id: string; full_name: string | null; email: string | null }[]).map((p) => [p.id, p]));
    for (const id of missing) {
      const active = effectiveTier(subBy.get(id) ?? null, now) !== null;
      const branding = active ? await loadBrandingForTrainer(id) : null;
      const p = profBy.get(id);
      trainers.set(id, { active, brand: mailBrandFrom(branding, site), email: p?.email ?? null, name: p?.full_name ?? "" });
    }
  }

  let lastId = "";
  for (;;) {
    if (Date.now() > deadline) {
      stats.truncated = true;
      break;
    }
    let q = admin
      .from("clients")
      .select("id, user_id, full_name, trainer_id, active_plan_id")
      .not("trainer_id", "is", null)
      .not("user_id", "is", null)
      .is("ended_at", null)
      .is("deletion_requested_at", null)
      .order("id", { ascending: true })
      .limit(PAGE);
    if (lastId) q = q.gt("id", lastId);
    const { data, error } = await q;
    if (error) {
      console.error("mail.weeklyJob clients:", error.message);
      break;
    }
    const page = (data ?? []) as ClientRow[];
    if (page.length === 0) break;
    lastId = page[page.length - 1].id;

    const clientIds = page.map((c) => c.id);
    const [profs, prefs, logged] = await Promise.all([
      admin.from("profiles").select("id, email, locale").in("id", page.map((c) => c.user_id)),
      admin.from("client_email_prefs").select("client_id, weekly_summary").in("client_id", clientIds),
      admin.from("weekly_summary_log").select("client_id").eq("week_start", week).in("client_id", clientIds),
    ]);
    if (logged.error) {
      // tabuľka (0082) ešte neexistuje → nič neposielať (bez idempotencie by sa dalo zdvojiť)
      console.error("mail.weeklyJob log:", logged.error.message);
      break;
    }
    const profBy = new Map(((profs.data ?? []) as { id: string; email: string | null; locale: string | null }[]).map((p) => [p.id, p]));
    const optedOut = new Set(((prefs.data ?? []) as { client_id: string; weekly_summary: boolean }[]).filter((p) => p.weekly_summary === false).map((p) => p.client_id));
    const already = new Set(((logged.data ?? []) as { client_id: string }[]).map((r) => r.client_id));
    await trainerCtx([...new Set(page.map((c) => c.trainer_id))]);

    const todo: ClientRow[] = [];
    for (const c of page) {
      stats.considered++;
      if (already.has(c.id)) stats.skipped.already_sent++;
      else todo.push(c);
    }

    await pool(todo, CONCURRENCY, async (c) => {
      if (Date.now() > deadline) {
        stats.truncated = true;
        return;
      }
      try {
        const trainer = trainers.get(c.trainer_id)!;
        const prof = profBy.get(c.user_id);
        const email = prof?.email ?? null;
        // levný predfilter bez načítania dát klienta
        const pre = decideWeeklyEmail({ optedIn: !optedOut.has(c.id), hasEmail: !!email, trainerActive: trainer.active, weekHasActivity: true, recentActivity: true });
        if (!pre.send) {
          stats.skipped[pre.reason]++;
          return;
        }
        const summary = await loadWeeklySummary(admin, { clientId: c.id, activePlanId: c.active_plan_id }, week, today);
        if (!summary) {
          stats.failed++;
          return;
        }
        const recent = summary.hasActivity ? true : await hadRecentActivity(admin, c.id, week);
        const decision = decideWeeklyEmail({ optedIn: true, hasEmail: true, trainerActive: true, weekHasActivity: summary.hasActivity, recentActivity: recent });
        if (!decision.send) {
          stats.skipped[decision.reason]++;
          return;
        }

        // rezervácia (client_id, týždeň): kto ju získa, ten posiela; súbežný beh narazí na duplicitu
        const claim = await admin.from("weekly_summary_log").insert({ client_id: c.id, week_start: week });
        if (claim.error) {
          if (claim.error.code === "23505") stats.skipped.already_sent++;
          else stats.failed++;
          return;
        }

        const locale: Locale = isLocale(prof?.locale) ? prof.locale : "sk";
        const unsubscribeUrl = `${site}/api/mail/unsubscribe?t=${encodeURIComponent(signUnsubToken({ k: "weekly", s: c.id, l: locale }, secret))}`;
        const rendered = renderWeeklyMail({
          locale,
          brand: trainer.brand,
          summary,
          nudge: decision.kind === "nudge",
          firstName: firstNameOf(c.full_name),
          appUrl: `${site}/portal`,
          unsubscribeUrl,
        });
        const message = buildMessage({
          from: buildFrom(trainer.brand.isTrainerBrand ? trainer.brand.name : null, cfg.fromAddress),
          replyTo: buildReplyTo(trainer.email, trainer.name),
          to: email!,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
          unsubscribeUrl,
        });
        const res = await sendMail(message, opts.transport);
        if (res.ok) stats.sent++;
        else {
          // neodoslané → uvoľniť rezerváciu, nech to ďalší beh skúsi znova
          await admin.from("weekly_summary_log").delete().eq("client_id", c.id).eq("week_start", week);
          stats.failed++;
        }
      } catch (err) {
        console.error("mail.weeklyJob client:", err instanceof Error ? err.message : "unknown");
        stats.failed++;
      }
    });

    if (page.length < PAGE) break;
  }
  return stats;
}
