import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { getTranslations } from "next-intl/server";
import { createClient, getMyClient, getProfile, getUser } from "@/lib/supabase/server";
import { getUserLocale } from "@/lib/i18n/server";
import { intlLocale } from "@/lib/i18n/locales";
import { loadBrandingForTrainer } from "@/lib/branding/server";
import { badgeById, canonicalBadgeId } from "@/lib/gamification/badges";
import { loadWeeklySummary } from "@/lib/gamification/weeklyServer";
import { addDaysIso, todayIso, weekStartOf } from "@/lib/reports/period";
import {
  SHARE_H,
  SHARE_W,
  firstNameOf,
  pickAchievementCard,
  pickShareBrand,
  pickWeeklyCard,
  type ShareCardData,
} from "@/lib/gamification/shareCard";
import { shareCardElement, type ShareCardText } from "@/lib/gamification/shareCardView";

/* GET /api/gamification/share?a=<id úspechu> | ?w=<pondelok týždňa>
   Zdieľacia karta 1080×1920 (PNG) pre rekord, odznak, dokončenú výzvu alebo týždenný súhrn.
   Bezpečnosť: vyžaduje session; úspech sa číta cez RLS (klient vidí len svoje, tréner len
   svojich súčasných klientov) a vlastníctvo sa overí aj výslovne; týždenný súhrn len pre
   prihláseného klienta. Na karte je len krstné meno, dátum a úspech (žiadne PII). Odpoveď je
   no-store, aby sa karta nikdy neocachovala medzi používateľmi. Značka: tréner s Business
   (loadBrandingForTrainer) → jeho logo/názov/farba, inak FitPilot. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_STORE = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };

const err = (status: number, message: string) => new Response(message, { status, headers: { ...NO_STORE, "Content-Type": "text/plain; charset=utf-8" } });

let fontCache: { name: string; data: Buffer; weight: 400 | 600 | 700 }[] | null = null;
async function fonts() {
  if (!fontCache) {
    const dir = path.join(process.cwd(), "assets", "fonts");
    const [regular, semi, bold] = await Promise.all(["Inter-Regular.ttf", "Inter-SemiBold.ttf", "Inter-Bold.ttf"].map((f) => readFile(path.join(dir, f))));
    fontCache = [
      { name: "Inter", data: regular, weight: 400 },
      { name: "Inter", data: semi, weight: 600 },
      { name: "Inter", data: bold, weight: 700 },
    ];
  }
  return fontCache;
}

/** Logo trénera → PNG data URL (satori nepodporuje WebP). Len naša verejná URL úložiska; chyba = bez loga. */
async function logoDataUrl(url: string | null): Promise<string | null> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!url || !base || !url.startsWith(`${base}/storage/v1/object/public/branding/`)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000), cache: "no-store" });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 2_000_000) return null;
    const png = await sharp(buf).resize(208, 208, { fit: "inside" }).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const {
    data: { user },
  } = await getUser();
  if (!user) return err(401, "unauthorized");

  const params = new URL(request.url).searchParams;
  const achievementId = params.get("a");
  const week = params.get("w");
  if ((achievementId == null) === (week == null)) return err(400, "bad request");

  const supabase = await createClient();
  const { data: profile } = await getProfile(user.id);
  const isTrainer = profile?.role === "trainer";
  const today = todayIso();

  let card: ShareCardData;

  if (achievementId != null) {
    if (!UUID.test(achievementId)) return err(400, "bad request");
    // RLS: klient vidí len svoje úspechy, tréner len úspechy svojich súčasných klientov
    const { data: row } = await supabase
      .from("client_achievements")
      .select("id, client_id, kind, badge_id, exercise_name, value, reps, achieved_on, meta, clients!inner(full_name, trainer_id, user_id)")
      .eq("id", achievementId)
      .maybeSingle();
    const owner = (Array.isArray(row?.clients) ? row?.clients[0] : row?.clients) as { full_name: string; trainer_id: string | null; user_id: string | null } | undefined;
    if (!row || !owner) return err(404, "not found");
    if (isTrainer ? owner.trainer_id !== user.id : owner.user_id !== user.id) return err(404, "not found");
    const picked = pickAchievementCard(
      {
        kind: row.kind as "pr" | "badge" | "challenge",
        badgeId: (row.badge_id as string | null) ?? null,
        exerciseName: (row.exercise_name as string | null) ?? null,
        value: row.value != null ? Number(row.value) : null,
        reps: (row.reps as number | null) ?? null,
        achievedOn: row.achieved_on as string,
        meta: row.meta as { challenge_name?: unknown } | null,
      },
      firstNameOf(owner.full_name),
      pickShareBrand(await loadBrandingForTrainer(owner.trainer_id)),
    );
    if (!picked) return err(404, "not found");
    card = picked;
  } else {
    if (isTrainer) return err(403, "forbidden");
    if (!week || !/^\d{4}-\d{2}-\d{2}$/.test(week) || weekStartOf(week) !== week || week > today || week < addDaysIso(today, -63)) return err(400, "bad request");
    const { data: client } = await getMyClient(user.id);
    if (!client) return err(404, "not found");
    const summary = await loadWeeklySummary(supabase, { clientId: client.id, activePlanId: client.active_plan_id ?? null }, week, today);
    if (!summary || !summary.hasActivity) return err(404, "not found");
    card = pickWeeklyCard(
      {
        weekStart: summary.weekStart,
        workouts: summary.workouts.done,
        target: summary.workouts.target,
        prs: summary.prs.count,
        volumeKg: summary.volume.thisKg,
        badges: summary.badgeIds.length + summary.challengeNames.length,
        streakWeeks: summary.streakWeeks,
      },
      summary.weekEnd,
      firstNameOf(client.full_name),
      pickShareBrand(await loadBrandingForTrainer(client.trainer_id ?? null)),
    );
  }

  const locale = await getUserLocale();
  const t = await getTranslations({ locale, namespace: "gamification.share" });
  const tb = await getTranslations({ locale, namespace: "gamification.badges" });
  const nf = new Intl.NumberFormat(intlLocale(locale));
  const dateLabel = new Date(`${card.date}T12:00:00Z`).toLocaleDateString(intlLocale(locale), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

  const text: ShareCardText = { kicker: "", headline: "", sub: "", stats: [], who: `${card.firstName ? `${card.firstName} · ` : ""}${dateLabel}`, footer: "" };
  if (card.kind === "pr") {
    text.kicker = t("pr.kicker");
    text.headline = t("pr.headline", { weight: nf.format(card.weightKg ?? 0) });
    text.sub = card.reps ? t("pr.subReps", { exercise: card.exerciseName ?? "", reps: card.reps }) : (card.exerciseName ?? "");
  } else if (card.kind === "badge") {
    const def = card.badgeId ? badgeById(canonicalBadgeId(card.badgeId)) : undefined;
    if (!def) return err(404, "not found");
    text.kicker = t("badge.kicker");
    text.headline = tb(`${def.id}.name` as never);
    text.sub = tb(`${def.id}.desc` as never);
  } else if (card.kind === "challenge") {
    text.kicker = t("challenge.kicker");
    text.headline = card.challengeName ?? "";
  } else if (card.weekly) {
    const w = card.weekly;
    text.kicker = t("weekly.kicker");
    text.headline = t("weekly.headline", { done: w.workouts });
    const stats: [string, string][] = [
      [`${w.workouts}/${w.target}`, t("weekly.workouts")],
    ];
    if (w.prs > 0) stats.push([String(w.prs), t("weekly.prs")]);
    if (w.volumeKg > 0) stats.push([`${nf.format(w.volumeKg)} kg`, t("weekly.volume")]);
    if (w.streakWeeks >= 2) stats.push([String(w.streakWeeks), t("weekly.streak")]);
    text.stats = stats.slice(0, 4);
  }
  text.footer = card.brand.isDefault ? t("footerDefault") : t("footerBranded");

  const logo = await logoDataUrl(card.brand.logoUrl);
  return new ImageResponse(shareCardElement(card.kind, text, card.brand, logo), {
    width: SHARE_W,
    height: SHARE_H,
    fonts: await fonts(),
    headers: NO_STORE,
  });
}

