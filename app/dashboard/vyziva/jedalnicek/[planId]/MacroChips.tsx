import styles from "./builder.module.css";

/**
 * B / S / T ako výrazné čipy (farebná bodka + tučné gramy) — predtým drobný sivý text
 * „22g B · 22g S · 51g T", hoci makrá sú pri jedálničku to podstatné. Farby zhodné
 * s pruhmi makier na detaile výživy klienta (dashboard.module.css .macroFill).
 */
export function MacroChips({
  proteinG,
  carbsG,
  fatG,
  size = "md",
}: {
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** "lg" = súčet za deň nad zoznamom */
  size?: "md" | "lg";
}) {
  const items = [
    { key: "protein", letter: "B", title: "Bielkoviny", value: proteinG },
    { key: "carbs", letter: "S", title: "Sacharidy", value: carbsG },
    { key: "fat", letter: "T", title: "Tuky", value: fatG },
  ] as const;

  return (
    <span className={`${styles.macroChips} ${size === "lg" ? styles.macroChipsLg : ""}`}>
      {items.map((m) => (
        <span key={m.key} className={`${styles.macroChip} ${styles[`macro_${m.key}`]}`} title={`${m.title}: ${m.value} g`}>
          <span className={styles.macroChipLetter}>{m.letter}</span>
          <span className={styles.macroChipValue}>{m.value} g</span>
        </span>
      ))}
    </span>
  );
}
