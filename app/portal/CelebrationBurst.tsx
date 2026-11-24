import type { CelebrationId } from "@/lib/gamification/rewards";
import g2 from "../components/gamificationV2.module.css";

/* Oslava v dialógu (UnlockModal / FinishSummaryModal): častice podľa zvoleného štýlu osláv. Čisto dekoratívne
   (aria-hidden), len CSS transform/opacity. Pri prefers-reduced-motion sa častice nezobrazia a ostane jednoduché
   jemné zjavenie svetla (pozri gamificationV2.module.css). Hodnoty sú deterministické (rovnaké na serveri aj v prehliadači). */

const COLORS = ["var(--accent)", "var(--moss)", "var(--plate-yellow)", "var(--info)"];

const CONFETTI = Array.from({ length: 16 }, (_, i) => ({
  "--x": `${6 + ((i * 37) % 88)}%`,
  "--d": `${(i % 6) * 90}ms`,
  "--r": `${(i % 2 ? 1 : -1) * (200 + ((i * 53) % 260))}deg`,
  "--c": COLORS[i % 4],
}));

const STARS = Array.from({ length: 14 }, (_, i) => ({
  "--x": `${8 + ((i * 41) % 84)}%`,
  "--y": `${10 + ((i * 29) % 70)}%`,
  "--d": `${(i % 7) * 120}ms`,
  "--c": i % 3 === 0 ? "var(--plate-yellow)" : COLORS[i % 4],
}));

// 3 výbuchy po 8 iskier; smer a vzdialenosť sa zaokrúhlia, aby boli čísla rovnaké všade
const FIREWORKS = [
  [22, 30],
  [74, 22],
  [48, 48],
].flatMap(([cx, cy], b) =>
  Array.from({ length: 8 }, (_, k) => {
    const a = (k / 8) * Math.PI * 2;
    const r = 44 + ((k * 7) % 3) * 8;
    return {
      "--cx": `${cx}%`,
      "--cy": `${cy}%`,
      "--tx": `${Math.round(Math.cos(a) * r)}px`,
      "--ty": `${Math.round(Math.sin(a) * r)}px`,
      "--d": `${b * 280 + (k % 2) * 60}ms`,
      "--c": COLORS[(b + k) % 4],
    };
  }),
);

const PARTICLES: Record<CelebrationId, Record<string, string>[]> = { confetti: CONFETTI, stars: STARS, fireworks: FIREWORKS };

export function CelebrationBurst({ style }: { style: CelebrationId }) {
  const particles = PARTICLES[style] ?? CONFETTI;
  return (
    <div className={g2.celeb} data-style={style} data-testid="celebration" aria-hidden="true">
      <span className={g2.celebFade} />
      {particles.map((p, i) => (
        <i key={i} className={g2.celebP} style={p as React.CSSProperties} />
      ))}
    </div>
  );
}
