import { getTranslations } from "next-intl/server";
import { AppLink as Link } from "../components/AppLink";
import { createClient } from "@/lib/supabase/server";
import { loadTeamWeek } from "@/lib/gamification/teamServer";
import { todayIso } from "@/lib/reports/period";
import g from "../components/gamification.module.css";
import styles from "./dashboard.module.css";

/* „Tím tento týždeň“ — súhrn aktuálneho týždňa (pondelok až dnes) pre trénera, všetky tarify:
   tréningy spolu, rekordy, odznaky, dokončené výzvy a klienti, ktorí potrebujú pozornosť.
   Jeden RPC dopyt (team_week_summary); pred migráciou 0079 sa karta nezobrazí. Server komponent
   v <Suspense>, aby nespomaľoval zoznam klientov. */
export async function TeamWeekCard({ totalClients, needAttention }: { totalClients: number; needAttention: number }) {
  if (totalClients === 0) return null;
  const [week, t] = await Promise.all([loadTeamWeek(await createClient(), todayIso(), totalClients, needAttention), getTranslations("gamification.team")]);
  if (!week) return null;

  return (
    <section className={styles.card} aria-label={t("title")} data-testid="team-week">
      <h3>{t("title")}</h3>
      <ul className={g.teamGrid}>
        <li className={g.teamTile}>
          <span className={g.teamNum}>{week.workouts}</span>
          <span className={g.teamLab}>{t("workouts", { clients: week.activeClients })}</span>
        </li>
        <li className={g.teamTile}>
          <span className={g.teamNum}>{week.prs}</span>
          <span className={g.teamLab}>{t("prs")}</span>
        </li>
        <li className={g.teamTile}>
          <span className={g.teamNum}>{week.badges}</span>
          <span className={g.teamLab}>{t("badges")}</span>
        </li>
        <li className={g.teamTile}>
          <span className={g.teamNum}>{week.challengesDone}</span>
          <span className={g.teamLab}>{t("challenges")}</span>
        </li>
        <li className={g.teamTile}>
          <span className={g.teamNum}>{week.needAttention}</span>
          <span className={g.teamLab}>{t("attention")}</span>
        </li>
      </ul>
      <p className={g.chDesc} style={{ marginTop: 10 }}>
        {week.hasActivity ? t("summary", { total: week.totalClients }) : t("quiet")}{" "}
        <Link href="/dashboard/vyzvy">{t("challengesLink")}</Link>
      </p>
    </section>
  );
}
