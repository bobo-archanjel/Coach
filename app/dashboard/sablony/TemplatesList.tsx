"use client";

import { useMemo, useState } from "react";
import { TemplateCard } from "./TemplateCard";
import templatesModule from "./templates.module.css";
import { useSkinStyles } from "@/app/components/uiSkin";

export interface TemplateItem {
  id: string;
  name: string;
  goal: string | null;
  /** náhľad: dni šablóny s položkami (cviky / potraviny s gramážou) */
  days: { name: string; items: string[] }[];
}

/** bez diakritiky a veľkosti písmen — „cvicenie“ nájde aj „Cvičenie“ */
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Zoznam šablón jednej záložky — hľadanie podľa názvu a mriežka kariet. */
export function TemplatesList({
  kind,
  items,
  clients,
}: {
  kind: "workout" | "meal";
  items: TemplateItem[];
  clients: { id: string; full_name: string }[];
}) {
  const styles = useSkinStyles("templates", templatesModule);
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = normalize(query.trim());
    return q ? items.filter((i) => normalize(i.name).includes(q)) : items;
  }, [items, query]);

  return (
    <>
      <input
        className={styles.search}
        type="search"
        placeholder={kind === "workout" ? "Hľadať tréningovú šablónu…" : "Hľadať jedálničkovú šablónu…"}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Hľadať šablónu podľa názvu"
      />
      {shown.length > 0 ? (
        <div className={styles.grid}>
          {shown.map((item) => (
            <TemplateCard key={item.id} kind={kind} item={item} clients={clients} />
          ))}
        </div>
      ) : (
        <p className={styles.empty}>{query.trim() ? "Žiadna šablóna s takým názvom." : "Žiadna šablóna s týmto cieľom."}</p>
      )}
    </>
  );
}
