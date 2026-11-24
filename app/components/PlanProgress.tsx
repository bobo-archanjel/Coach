import pp from "./planProgress.module.css";

const R = 17;
const CIRC = 2 * Math.PI * R;

/**
 * Postup tréningového plánu — malé koliesko s „1/2“ a text vedľa („Odcvičené 1 z 2“).
 * Celý plán odcvičený = zelené. Zdieľané kartou plánu u klienta (Tréning) aj trénera
 * (detail klienta → Tréningy); bez hookov, funguje v server aj client komponentoch.
 */
export function PlanProgress({ done, total, label }: { done: number; total: number; label: string }) {
  const fraction = total > 0 ? Math.min(1, done / total) : 0;
  const complete = total > 0 && done >= total;
  return (
    <div className={pp.wrap} data-complete={complete || undefined} data-testid="plan-progress">
      <svg className={pp.ring} viewBox="0 0 44 44" aria-hidden="true">
        <circle className={pp.track} cx="22" cy="22" r={R} />
        <circle
          className={pp.value}
          cx="22"
          cy="22"
          r={R}
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC * (1 - fraction)}
        />
        <text className={pp.center} x="22" y="22.5" textAnchor="middle" dominantBaseline="middle">
          {done}/{total}
        </text>
      </svg>
      <span className={pp.label}>{label}</span>
    </div>
  );
}
