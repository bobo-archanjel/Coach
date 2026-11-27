import { getTranslations } from "next-intl/server";
import type { CSSProperties } from "react";
import { AppLink as Link } from "@/app/components/AppLink";
import { createClient, getMyClient, getUser } from "@/lib/supabase/server";
import { intlLocale, type Locale } from "@/lib/i18n/locales";
import { getUserLocale } from "@/lib/i18n/server";
import { loadClientChallenges, type ClientChallenge } from "@/lib/gamification/challengesServer";
import { todayIso } from "@/lib/reports/period";
import g from "@/app/components/gamification.module.css";

/* Výzvy od trénera (Pro/Business) — progres sa počíta na serveri z tréningov, jedla a rekordov
   (lib/gamification/challenges.ts), klient ho nijako nezadáva. Na karte Dnes kompaktne
   (najviac 3), na stránke Úspechy celé. Bez výziev sa karta nezobrazí. */

const dateShort = (iso: string, locale: Locale) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString(intlLocale(locale), { day: "numeric", month: "numeric", timeZone: "UTC" });

const whenShort = (iso: string, locale: Locale) =>
  new Date(iso).toLocaleString(intlLocale(locale), { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Bratislava" });

export async function ChallengesHost({ compact = false }: { compact?: boolean }) {
  const {
    data: { user },
  } = await getUser();
  if (!user) return null;
  const { data: client } = await getMyClient(user.id);
  if (!client) return null;
  const items = await loadClientChallenges(await createClient(), client.id, client.trainer_id ?? null, todayIso());
  if (items.length === 0) return null;
  return <ChallengesCard items={compact ? items.slice(0, 3) : items} total={items.length} compact={compact} />;
}

export async function ChallengesCard({ items, total, compact }: { items: ClientChallenge[]; total: number; compact: boolean }) {
  const [t, locale] = await Promise.all([getTranslations("gamification.challenges"), getUserLocale()]);
  return (
    <section className={g.card} aria-label={t("title")} data-testid="challenges-card">
      <h2 className={g.cardTitle}>{t("title")}</h2>
      <ul className={g.chList}>
        {items.map((c) => {
          const percent = Math.round(c.progress.fraction * 100);
          return (
            <li key={c.id} className={`${g.chItem} ${c.state === "done" ? g.chItemDone : ""}`} data-challenge={c.id} data-state={c.state}>
              <div className={g.chHead}>
                <span className={g.chName}>{c.name}</span>
                <span className={g.chVal}>{t("progress", { value: c.progress.value, target: c.target })}</span>
              </div>
              <div
                className={g.bar}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                aria-label={t("barAria", { name: c.name, percent })}
              >
                <span className={g.barFill} style={{ "--p": percent / 100 } as CSSProperties} />
              </div>
              <p className={g.chDesc}>
                {(t as unknown as (k: string, v: { target: number }) => string)(`metric.${c.metric}`, { target: c.target })}
              </p>
              {c.description && !compact ? <p className={g.chDesc}>{c.description}</p> : null}
              <div className={g.chFoot}>
                {c.state === "done" ? (
                  <span className={g.chDone}>{t("done")}</span>
                ) : c.state === "upcoming" ? (
                  <span>{t("startsOn", { date: dateShort(c.startsOn, locale) })}</span>
                ) : (
                  <span>
                    {t("endsOn", { date: dateShort(c.endsOn, locale) })}
                    {compact ? null : ` · ${t("countsFrom", { when: whenShort(c.countsFrom, locale) })}`}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {compact ? (
        <p className={g.chMore}>
          <span>{total > items.length ? t("more", { count: total - items.length }) : null}</span>
          <Link href="/portal/uspechy" className={`${g.moreLink} ${g.moreLinkChev}`}>
            {t("seeAll")}
          </Link>
        </p>
      ) : null}
    </section>
  );
}
