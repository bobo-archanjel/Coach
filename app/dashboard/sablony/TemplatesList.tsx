"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { TemplateCard } from "./TemplateCard";
import styles from "./templates.module.css";

export interface TemplateItem {
  id: string;
  name: string;
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
  const t = useTranslations("templates");
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
        placeholder={kind === "workout" ? t("searchWorkout") : t("searchMeal")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label={t("searchAria")}
      />
      {shown.length > 0 ? (
        <div className={styles.grid}>
          {shown.map((item) => (
            <TemplateCard key={item.id} kind={kind} item={item} clients={clients} />
          ))}
        </div>
      ) : (
        <p className={styles.empty}>{query.trim() ? t("noNameMatch") : t("noGoalMatch")}</p>
      )}
    </>
  );
}
