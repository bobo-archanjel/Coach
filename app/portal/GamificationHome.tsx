import { useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import { AppLink as Link } from "../components/AppLink";
import type { GamificationHome as HomeData } from "@/lib/gamification/stats";
import type { DailyRing } from "@/lib/gamification/rings";
import { RestDayControl } from "./RestDayControl";
import { displayAmount } from "@/lib/gamification/badges";
import g from "../components/gamification.module.css";
import g2 from "../components/gamificationV2.module.css";

/* Denné prstence + úroveň pod týždňom na karte Dnes (lib/gamification, denné prstence: Strava, Bielkoviny, Pohyb).
   Server komponent (tlačidlo „Dnes oddychujem“ je malý klientský ostrovček): prstence sú SVG s role="img"
   a textovým popisom („Strava: 2 z 3“), farba nenesie význam sama — hodnota je vždy aj ako číslo a stav ako text.
   Týždenný pohľad (série sú týždenné) ostáva ako malý riadok pod prstencami.
   v2: úroveň má titul (1–20), pod ňou riadok „Ešte N do odznaku …“ a počet zmrazení série. */

const R = 26;
const CIRC = 2 * Math.PI * R;

const Snowflake = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5" />
  </svg>
);

function RingItem({ ring }: { ring: DailyRing }) {
  const t = useTranslations("gamification.daily");
  const label = t(ring.id);
  // bielkoviny: v kruhu percentá cieľa (gramy by sa nezmestili), presné gramy v popise a pod kruhom
  const isProtein = ring.id === "protein";
  const center = isProtein ? t("proteinValue", { percent: Math.round((ring.value / Math.max(1, ring.goal)) * 100) }) : t("value", { value: ring.value, goal: ring.goal });
  const aria = isProtein ? t("proteinAria", { value: ring.value, goal: ring.goal }) : t("aria", { label, value: ring.value, goal: ring.goal });
  const hint =
    ring.id === "meals"
      ? t("mealsHint", { left: ring.goal - ring.value })
      : ring.id === "protein"
        ? ring.done
          ? t("proteinDone")
          : t("proteinHint", { value: ring.value, goal: ring.goal })
        : ring.via === "workout"
          ? ring.value > 1
            ? t("moveWorkouts", { count: ring.value })
            : t("moveWorkout")
          : ring.via === "rest"
            ? t("moveRest")
            : t("moveOpen");
  return (
    <li className={g.ringItem} data-done={ring.done ? "" : undefined}>
      <svg
        className={g.ringSvg}
        viewBox="0 0 68 68"
        role="img"
        aria-label={aria}
        style={{ ["--ring-circ" as string]: `${CIRC}` }}
        data-testid={`ring-${ring.id}`}
        data-value={ring.value}
        data-goal={ring.goal}
      >
        <circle className={g.ringTrack} cx="34" cy="34" r={R} />
        {ring.fraction > 0 && (
          <circle
            className={g.ringArc}
            cx="34"
            cy="34"
            r={R}
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - ring.fraction)}
          />
        )}
        <text className={g.ringNum} x="34" y="34" textAnchor="middle" dominantBaseline="central">
          {center}
        </text>
      </svg>
      <span className={g.ringLabel}>{label}</span>
      <span className={g.ringHint}>{hint}</span>
    </li>
  );
}

export function GamificationHome({ home, freezes = null, card = false }: { home: HomeData; freezes?: number | null; card?: boolean }) {
  const t = useTranslations("gamification");
  const { level, detail } = home;
  const percent = Math.round(detail.fraction * 100);
  const title = t(`levelTitles.${detail.n}` as never);
  const next = home.next[0];
  return (
    <div className={`${g.homeBlock} ${card ? g.homeBlockCard : ""}`} data-testid="gamification-home">
      {home.rings.length > 0 && (
        <ul className={g.rings} style={{ ["--ring-count" as string]: home.rings.length }} aria-label={t("daily.ringsAria")} data-testid="daily-rings">
          {home.rings.map((r) => (
            <RingItem key={r.id} ring={r} />
          ))}
        </ul>
      )}
      <div className={g.dayFoot}>
        <p className={g.weekLine} data-testid="week-line">
          {t("daily.weekLine", { done: home.week.done, target: home.week.target })}
        </p>
        <RestDayControl rest={home.rest} />
      </div>

      <div className={g.level}>
        <div className={g.levelHead}>
          <span className={g.levelName} data-testid="level-title">
            {t("levelDetail.detail", { n: detail.n, title })}
          </span>
          <span className={g.levelXp}>{t("level.xp", { xp: level.xp })}</span>
        </div>
        <div
          className={g.bar}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={detail.nextN ? t("level.progressAria", { next: t(`levelTitles.${detail.nextN}` as never), percent }) : t("level.maxAria")}
        >
          <span className={g.barFill} style={{ "--p": percent / 100 } as CSSProperties} />
        </div>
        <div className={g.levelFoot}>
          <span>
            {detail.nextN != null && detail.toNext != null
              ? t("levelDetail.toNext", { count: detail.toNext, n: detail.nextN })
              : t("level.max")}
          </span>
          <Link href="/portal/uspechy" className={g.badgesBtn} aria-label={t("home.openAria")}>
            {t("home.badges", { count: home.badgeCount, total: home.badgeTotal })}
          </Link>
        </div>
        {(next || (freezes != null && freezes > 0)) && (
          <div className={g.levelMeta}>
            {next && (
              <p className={g2.nextCompact} data-testid="next-badge">
                {t("next.line", {
                  amount: t(`next.units.${next.unit}` as never, { count: displayAmount(next.unit, next.remaining) } as never),
                  name: t(`badges.${next.id}.name` as never),
                })}
              </p>
            )}
            {freezes != null && freezes > 0 && (
              <span className={g2.freezeChip} aria-label={t("freeze.chipAria", { count: freezes })} data-testid="freeze-count">
                <Snowflake />
                {t("freeze.chip", { count: freezes })}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
