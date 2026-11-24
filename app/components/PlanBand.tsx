import pc from "./planCard.module.css";

/**
 * Horná časť karty tréningového plánu: vľavo názov a pod ním zdroj (Od trénera / Vlastný)
 * ako tlmený text, vpravo počet tréningov a pod ním malý stav (Aktívny, ✓ Hotovo, Koncept). Zdieľané klientom (Tréning) aj trénerom (detail klienta → Tréningy) — bez
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
  /** „3 tréningy“ — tlmene vpravo vedľa názvu */
  countLabel: string;
  /** štítok „Aktívny“; null = plán nie je aktívny */
  activeLabel: string | null;
  chips: PlanBandChip[];
}) {
  // stav (Aktívny, Hotovo, Koncept) = farebné štítky; zdroj (Od trénera / Vlastný) = tlmený text
  const status = chips.filter((c) => c.kind === "done" || c.kind === "draft");
  const source = chips.find((c) => c.kind === "trainer" || c.kind === "client");
  return (
    <header className={`${pc.band} ${activeLabel ? pc.bandActive : ""}`}>
      <div className={pc.titleRow}>
        {/* vľavo názov a pod ním zdroj (tlmený text) */}
        <div className={pc.titleMain}>
          <h3 className={pc.name}>{name}</h3>
          {source && (
            <span className={pc.source} data-kind={source.kind}>
              {source.kind === "trainer" && <DumbbellIcon />}
              {source.label}
            </span>
          )}
        </div>
        {/* vpravo počet tréningov a pod ním malý stav (Aktívny / Hotovo / Koncept) */}
        <div className={pc.titleSide}>
          <span className={pc.count} data-testid="plan-count">
            {countLabel}
          </span>
          {(activeLabel || status.length > 0) && (
            <span className={pc.chips}>
              {activeLabel && <span className={pc.activePill}>{activeLabel}</span>}
              {status.map((c) => (
                <span key={c.kind} className={pc.chip} data-kind={c.kind}>
                  {c.kind === "done" && <CheckIcon />}
                  {c.label}
                </span>
              ))}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
