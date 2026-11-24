import pc from "./planCard.module.css";

/**
 * Oranžový sklenený pás karty tréningového plánu: názov, počet tréningov vpravo a čipy
 * (Aktívny biely, ✓ Hotovo, činka Od trénera, Vlastný, Koncept). Aktívny plán má pás do
 * červena. Zdieľané klientom (Tréning) aj trénerom (detail klienta → Tréningy) — bez
 * hookov, funguje v server aj client komponentoch.
 */
export type PlanBandChip = { kind: "done" | "trainer" | "client" | "draft"; label: string };

const CheckIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const DumbbellIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

export function PlanBand({
  name,
  countLabel,
  activeLabel,
  chips,
}: {
  name: string;
  /** „3 tréningy“ — odznak vedľa názvu */
  countLabel: string;
  /** text bielej pilulky „Aktívny“; null = plán nie je aktívny (pás oranžový) */
  activeLabel: string | null;
  chips: PlanBandChip[];
}) {
  return (
    <header className={`${pc.band} ${activeLabel ? pc.bandActive : ""}`}>
      <div className={pc.titleRow}>
        <h3 className={pc.name}>{name}</h3>
        <span className={pc.count} data-testid="plan-count">
          {countLabel}
        </span>
      </div>
      {(activeLabel || chips.length > 0) && (
        <span className={pc.chips}>
          {activeLabel && <span className={pc.activePill}>{activeLabel}</span>}
          {chips.map((c) => (
            <span key={c.kind} className={pc.chip} data-kind={c.kind}>
              {c.kind === "done" && <CheckIcon />}
              {c.kind === "trainer" && <DumbbellIcon />}
              {c.label}
            </span>
          ))}
        </span>
      )}
    </header>
  );
}
