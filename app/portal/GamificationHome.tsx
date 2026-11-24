import { useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import { AppLink as Link } from "../components/AppLink";
import type { GamificationHome as HomeData } from "@/lib/gamification/stats";
import type { Ring } from "@/lib/gamification/rings";
import { displayAmount } from "@/lib/gamification/badges";
import g from "../components/gamification.module.css";
import g2 from "../components/gamificationV2.module.css";

/* Týždenné prstence + úroveň pod týždňom na karte Dnes (lib/gamification, fáza A + v2).
   Server komponent bez stavu: prstence sú SVG s role="img" a textovým popisom
   („Tréningy: 1 z 3“), farba nenesie význam sama — hodnota je vždy aj ako číslo.
   v2: úroveň má titul (1–20), pod ňou riadok „Ešte N do odznaku …“ a počet zmrazení série. */

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

export function GamificationHome({ home, freezes = null }: { home: HomeData; freezes?: number | null }) {
  const t = useTranslations("gamification");
  const { level, detail } = home;
  const percent = Math.round(detail.fraction * 100);
  const title = t(`levelTitles.${detail.n}` as never);
  const next = home.next[0];
  return (
    <div className={g.homeBlock} data-testid="gamification-home">
      <ul className={g.rings} aria-label={t("home.ringsAria")}>
        {home.rings.map((r) => (
          <RingItem key={r.id} ring={r} />
        ))}
      </ul>

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
          <Link href="/portal/uspechy" className={g.moreLink} aria-label={t("home.openAria")}>
            {t("home.badges", { count: home.badgeCount, total: home.badgeTotal })} · {t("home.open")}
          </Link>
        </div>
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
            {t("freeze.chip", { count: freezes })}
          </span>
        )}
      </div>
    </div>
  );
}
