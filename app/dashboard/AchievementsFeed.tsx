import { getLocale, getTranslations } from "next-intl/server";
import { createClient, getUser } from "@/lib/supabase/server";
import { describeAchievement, loadAchievementsFeed } from "@/lib/gamification/trainerFeed";
import { intlLocale } from "@/lib/i18n/locales";
import { FeedList, FeedRow, HighFiveButton } from "./HighFiveButton";
import g from "../components/gamification.module.css";
import styles from "./dashboard.module.css";

/* „Úspechy klientov“ — feed nových rekordov, odznakov a splnených výziev (posledných 14 dní, bez spätne
   dopočítaných, len bez high five) s jednoťukovým high five. Na dashboarde (všetci klienti) aj v detaile klienta
   (`clientId`). Server komponent obalený v <Suspense>, aby nespomaľoval zvyšok stránky. */
export async function AchievementsFeed({ clientId, hideTitle = false }: { clientId?: string; hideTitle?: boolean }) {
  const {
    data: { user },
  } = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const [loaded, t, locale] = await Promise.all([
    // len úspechy bez high five (vybavené sa nezobrazujú) — filter je v dopyte, limit ich nezaberá
    loadAchievementsFeed(supabase, user.id, { clientId, limit: clientId ? 10 : 8, onlyPending: true }),
    getTranslations("gamification"),
    getLocale(),
  ]);
  const rows = loaded.map((i) => ({ i, text: describeAchievement(i, t as never) })).filter((r) => r.text);
  // na dashboarde bez úspechov sekciu nezobrazíme vôbec (nie je to prvotná akcia trénera)
  if (rows.length === 0 && !clientId) return null;

  const when = (iso: string) =>
    new Date(iso).toLocaleDateString(intlLocale(locale as "sk" | "cs"), { day: "numeric", month: "numeric", timeZone: "Europe/Bratislava" });

  return (
    <section className={`${styles.card} ${clientId ? "" : g.feedSection}`} aria-label={t("trainer.feedTitle")} data-testid="achievements-feed">
      {!hideTitle && <h3>{clientId ? t("trainer.clientTitle") : t("trainer.feedTitle")}</h3>}
      {rows.length === 0 ? (
        <p className={g.empty}>{t("trainer.clientEmpty")}</p>
      ) : (
        <FeedList className={g.feed} total={rows.length} emptyText={t("trainer.clientEmpty")} emptyClassName={g.empty}>
          {rows.map(({ i, text }) => (
            <FeedRow key={i.id} id={i.id} className={g.feedRow}>
              <span className={g.feedText}>
                {!clientId && <span className={g.feedClient}>{i.clientName}</span>}
                <span className={g.feedWhat}>{text}</span>
                <span className={g.feedWhen}>{when(i.achievedAt)}</span>
              </span>
              <HighFiveButton achievementId={i.id} clientName={i.clientName} what={text} done={i.highFived} />
            </FeedRow>
          ))}
        </FeedList>
      )}
    </section>
  );
}
