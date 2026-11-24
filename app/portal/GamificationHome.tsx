import { useTranslations } from "next-intl";
import { AppLink as Link } from "../components/AppLink";
import type { GamificationHome as HomeData } from "@/lib/gamification/stats";
import type { Ring } from "@/lib/gamification/rings";
import g from "../components/gamification.module.css";

/* Týždenné prstence + úroveň pod týždňom na karte Dnes (lib/gamification, fáza A).
   Server komponent bez stavu: prstence sú SVG s role="img" a textovým popisom
   („Tréningy: 1 z 3“), farba nenesie význam sama — hodnota je vždy aj ako číslo. */

const R = 26;
const CIRC = 2 * Math.PI * R;
const ARC_CLASS = { training: g.ringTraining, food: g.ringFood, protein: g.ringProtein } as const;

function RingItem({ ring }: { ring: Ring }) {
  const t = useTranslations("gamification.rings");
  const label = t(ring.id);
  return (
    <li className={g.ringItem}>
      <svg
        className={g.ringSvg}
        viewBox="0 0 68 68"
        role="img"
        aria-label={t("aria", { label, value: ring.value, goal: ring.goal })}
        style={{ ["--ring-circ" as string]: `${CIRC}` }}
        data-testid={`ring-${ring.id}`}
        data-value={ring.value}
        data-goal={ring.goal}
      >
        <circle className={g.ringTrack} cx="34" cy="34" r={R} />
        {ring.fraction > 0 && (
          <circle
            className={`${g.ringArc} ${ARC_CLASS[ring.id]}`}
            cx="34"
            cy="34"
            r={R}
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - ring.fraction)}
          />
        )}
        <text className={g.ringNum} x="34" y="34" textAnchor="middle" dominantBaseline="central">
          {t("value", { value: ring.value, goal: ring.goal })}
        </text>
      </svg>
      <span className={g.ringLabel}>{label}</span>
      <span className={g.ringHint}>{t(`${ring.id}Hint`)}</span>
    </li>
  );
}

export function GamificationHome({ home }: { home: HomeData }) {
  const t = useTranslations("gamification");
  const { level } = home;
  const levelName = t(`levels.${level.level}`);
  const percent = Math.round(level.fraction * 100);
  return (
    <div className={g.homeBlock} data-testid="gamification-home">
      <ul className={g.rings} aria-label={t("home.ringsAria")}>
        {home.rings.map((r) => (
          <RingItem key={r.id} ring={r} />
        ))}
      </ul>

      <div className={g.level}>
        <div className={g.levelHead}>
          <span className={g.levelName}>{t("level.name", { name: levelName })}</span>
          <span className={g.levelXp}>{t("level.xp", { xp: level.xp })}</span>
        </div>
        <div
          className={g.bar}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={level.next ? t("level.progressAria", { next: t(`levels.${level.next}`), percent }) : t("level.maxAria")}
        >
          <span className={g.barFill} style={{ width: `${percent}%` }} />
        </div>
        <div className={g.levelFoot}>
          <span>
            {level.next && level.toNext != null
              ? t("level.toNext", { count: level.toNext, next: t(`levels.${level.next}`) })
              : t("level.max")}
          </span>
          <Link href="/portal/uspechy" className={g.moreLink} aria-label={t("home.openAria")}>
            {t("home.badges", { count: home.badgeCount, total: home.badgeTotal })} · {t("home.open")}
          </Link>
        </div>
      </div>
    </div>
  );
}
