import { getLocale, getTranslations } from "next-intl/server";
import { createClient, getUser } from "@/lib/supabase/server";
import { badgeById, canonicalBadgeId } from "@/lib/gamification/badges";
import { loadAchievementsFeed, type FeedItem } from "@/lib/gamification/trainerFeed";
import { intlLocale } from "@/lib/i18n/locales";
import { HighFiveButton } from "./HighFiveButton";
import g from "../components/gamification.module.css";
import styles from "./dashboard.module.css";

/* „Úspechy klientov“ — feed nových rekordov a odznakov (posledných 14 dní, bez spätne
   dopočítaných) s jednoťukovým high five. Na dashboarde (všetci klienti) aj v detaile klienta
   (`clientId`). Server komponent obalený v <Suspense>, aby nespomaľoval zvyšok stránky. */
export async function AchievementsFeed({ clientId, hideTitle = false }: { clientId?: string; hideTitle?: boolean }) {
  const {
    data: { user },
  } = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const [loaded, t, locale] = await Promise.all([
    // na dashboarde sa úspechy, ku ktorým už tréner poslal high five, nezobrazujú (vybavené) —
    // načíta sa viac a po odfiltrovaní sa zobrazí najviac 8; v detaile klienta ostáva celá história
    loadAchievementsFeed(supabase, user.id, { clientId, limit: clientId ? 10 : 24 }),
    getTranslations("gamification"),
    getLocale(),
  ]);
  const items = clientId ? loaded : loaded.filter((i) => !i.highFived).slice(0, 8);
  // na dashboarde bez úspechov sekciu nezobrazíme vôbec (nie je to prvotná akcia trénera)
  if (items.length === 0 && !clientId) return null;

  const what = (i: FeedItem): string => {
    if (i.kind === "pr" && i.exerciseName && i.value != null) {
      return i.reps ? t("trainer.prReps", { exercise: i.exerciseName, weight: i.value, reps: i.reps }) : t("trainer.pr", { exercise: i.exerciseName, weight: i.value });
    }
    if (i.kind === "challenge") return i.challengeName ? t("trainer.challenge", { name: i.challengeName }) : "";
    const def = i.badgeId ? badgeById(canonicalBadgeId(i.badgeId)) : undefined;
    return def ? t("trainer.badge", { badge: t(`badges.${def.id}.name` as never) }) : "";
  };
  const when = (iso: string) =>
    new Date(iso).toLocaleDateString(intlLocale(locale as "sk" | "cs"), { day: "numeric", month: "numeric", timeZone: "Europe/Bratislava" });

  return (
    <section className={`${styles.card} ${clientId ? "" : g.feedSection}`} aria-label={t("trainer.feedTitle")} data-testid="achievements-feed">
      {!hideTitle && <h3>{clientId ? t("trainer.clientTitle") : t("trainer.feedTitle")}</h3>}
      {items.length === 0 ? (
        <p className={g.empty}>{t("trainer.clientEmpty")}</p>
      ) : (
        <ul className={g.feed}>
          {items.map((i) => {
            const text = what(i);
            if (!text) return null;
            return (
              <li key={i.id} className={g.feedRow}>
                <span className={g.feedText}>
                  {!clientId && <span className={g.feedClient}>{i.clientName}</span>}
                  <span className={g.feedWhat}>{text}</span>
                  <span className={g.feedWhen}>{when(i.achievedAt)}</span>
                </span>
                <HighFiveButton achievementId={i.id} clientName={i.clientName} what={text} done={i.highFived} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
