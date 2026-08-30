import { getPortalFoodDiary } from "@/lib/portal/data";
import type { PortalDiaryData, PortalDiaryResult } from "@/lib/portal/types";
import { AlertIcon, Notice } from "../Notice";
import { ProfileIcon } from "../icons";
import { RetryButton } from "../RetryButton";
import styles from "../portal.module.css";
import { AddFoodDiaryEntry } from "./AddFoodDiaryEntry";
import { DiaryRow } from "./DiaryRow";

/* /portal/dennik — food diary. Klient loguje, čo skutočne zjedol, oproti makro cieľu.
   Protikus k /portal/strava (čo MÁ jesť podľa trénera). Dáta: lib/portal/data.ts,
   migrácia 0007_food_logs.sql. */

/** Podiel naplnenia (0–1) — min. viditeľný pruh, keď je nejaká hodnota. */
function fillScale(value: number, goal: number): number {
  const raw = goal > 0 ? Math.min(1, value / goal) : 0;
  return raw > 0 ? Math.max(raw, 0.02) : 0;
}

function MacroBar({ label, value, goal }: { label: string; value: number; goal: number | null }) {
  // Bez cieľa: len label + hodnota, žiadny pruh (inak by 100% coral pôsobilo ako "splnené").
  if (goal == null) {
    return (
      <div className={styles.macroNoGoal}>
        <span className={styles.macroLabel}>{label}</span>
        <span className={styles.macroVal}>{Math.round(value)} g</span>
      </div>
    );
  }
  const over = value > goal;
  return (
    <div className={styles.macro}>
      <span className={styles.macroLabel}>{label}</span>
      <span className={styles.macroTrack}>
        <span
          className={`${styles.macroFill} ${over ? styles.macroOver : ""}`}
          style={{ transform: `scaleX(${fillScale(value, goal)})` }}
        />
      </span>
      <span className={`${styles.macroVal} ${over ? styles.macroOver : ""}`}>
        {Math.round(value)} / {Math.round(goal)} g
      </span>
    </div>
  );
}

function DiaryView({ data }: { data: PortalDiaryData }) {
  const { goal, groups, totals, planFoods, library, hour } = data;
  const kcalGoal = goal?.caloriesTarget ?? null;
  const kcalOver = kcalGoal != null && totals.kcal > kcalGoal;
  const hasEntries = groups.length > 0;

  return (
    <section className={styles.diary} aria-label="Denník jedla">
      <div className={`${styles.panel} ${styles.diaryHero}`}>
        <h1 className={styles.diaryHeading}>Dnešný príjem</h1>
        <div className={styles.kcalLine}>
          <span className={`${styles.diaryKcal} ${kcalOver ? styles.macroOver : ""}`}>{totals.kcal}</span>
          <span className={styles.diaryKcalGoal}>
            {kcalGoal != null ? `/ ${kcalGoal} kcal` : "kcal spolu"}
          </span>
        </div>
        {kcalGoal != null && (
          <span className={styles.macroTrack} style={{ marginBottom: 14 }}>
            <span
              className={`${styles.macroFill} ${kcalOver ? styles.macroOver : ""}`}
              style={{ transform: `scaleX(${fillScale(totals.kcal, kcalGoal)})` }}
            />
          </span>
        )}
        <MacroBar label="Bielkoviny" value={totals.proteinG} goal={goal?.proteinG ?? null} />
        <MacroBar label="Sacharidy" value={totals.carbsG} goal={goal?.carbsG ?? null} />
        <MacroBar label="Tuky" value={totals.fatG} goal={goal?.fatG ?? null} />
        {!goal && (
          <p className={styles.diaryMeta} style={{ marginTop: 10 }}>
            Tréner ti zatiaľ nenastavil makro cieľ — zobrazuje sa len súčet zjedeného.
          </p>
        )}
      </div>

      {hasEntries ? (
        groups.map((group) => (
          <div key={group.slot} className={styles.panel}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <p className={styles.panelLabel} style={{ marginBottom: 0 }}>
                {group.slotLabel}
              </p>
              <span className={styles.chip}>{group.kcal} kcal</span>
            </div>
            <ul className={styles.diaryList}>
              {group.entries.map((entry) => (
                <DiaryRow key={entry.id} entry={entry} />
              ))}
            </ul>
          </div>
        ))
      ) : (
        <div className={styles.panel}>
          <div className={styles.sessionQuiet}>
            <p>Dnes si si ešte nič nezapísal. Pridaj prvé jedlo nižšie.</p>
          </div>
        </div>
      )}

      <AddFoodDiaryEntry planFoods={planFoods} library={library} hour={hour} />
    </section>
  );
}

// ---------- DEV náhľad bez DB ----------
const PREVIEW: PortalDiaryData = {
  today: "2026-08-28",
  hour: 14,
  goal: { bmr: 1780, tdee: 2560, caloriesTarget: 2350, proteinG: 175, carbsG: 240, fatG: 70 },
  totals: { kcal: 1420, proteinG: 118, carbsG: 132, fatG: 44 },
  groups: [
    {
      slot: "ranajky",
      slotLabel: "Raňajky",
      kcal: 520,
      entries: [
        { id: "p1", slot: "ranajky", name: "Ovsené vločky", grams: 80, kcal: 300, proteinG: 10.4, carbsG: 48, fatG: 5.6 },
        { id: "p2", slot: "ranajky", name: "Grécky jogurt (0-2 %)", grams: 200, kcal: 120, proteinG: 18, carbsG: 8, fatG: 1 },
        { id: "p3", slot: "ranajky", name: "Banán", grams: 110, kcal: 98, proteinG: 1.2, carbsG: 25.3, fatG: 0.3 },
      ],
    },
    {
      slot: "obed",
      slotLabel: "Obed",
      kcal: 620,
      entries: [
        { id: "p4", slot: "obed", name: "Kuracie prsia (surové)", grams: 200, kcal: 220, proteinG: 46, carbsG: 0, fatG: 3 },
        { id: "p5", slot: "obed", name: "Ryža basmati (varená)", grams: 250, kcal: 325, proteinG: 6.8, carbsG: 70, fatG: 0.8 },
        { id: "p6", slot: "obed", name: "Brokolica (varená)", grams: 200, kcal: 70, proteinG: 4.8, carbsG: 14, fatG: 0.8 },
      ],
    },
  ],
  planFoods: [
    { foodId: null, name: "Tvaroh (polotučný)", kcal100g: 98, protein100g: 12, carbs100g: 3.5, fat100g: 4.3, plannedGrams: 250, plannedSlot: "vecera" },
    { foodId: null, name: "Losos (surový)", kcal100g: 208, protein100g: 20, carbs100g: 0, fat100g: 13, plannedGrams: 150, plannedSlot: "vecera" },
  ],
  library: [
    { foodId: "l1", name: "Kuracie prsia (surové)", kcal100g: 110, protein100g: 23, carbs100g: 0, fat100g: 1.5 },
    { foodId: "l2", name: "Ryža basmati (varená)", kcal100g: 130, protein100g: 2.7, carbs100g: 28, fat100g: 0.3 },
    { foodId: "l3", name: "Ovsené vločky", kcal100g: 375, protein100g: 13, carbs100g: 60, fat100g: 7 },
    { foodId: "l4", name: "Vajcia (celé)", kcal100g: 155, protein100g: 13, carbs100g: 1.1, fat100g: 11 },
    { foodId: "l5", name: "Banán", kcal100g: 89, protein100g: 1.1, carbs100g: 23, fat100g: 0.3 },
  ],
};

function previewResult(kind: string): PortalDiaryResult | null {
  if (process.env.NODE_ENV === "production") return null;
  if (kind === "ok") return { state: "ok", data: PREVIEW };
  if (kind === "nogoal") return { state: "ok", data: { ...PREVIEW, goal: null } };
  if (kind === "over")
    return { state: "ok", data: { ...PREVIEW, totals: { kcal: 2610, proteinG: 190, carbsG: 250, fatG: 88 } } };
  if (kind === "empty") return { state: "ok", data: { ...PREVIEW, groups: [], totals: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 } } };
  if (kind === "unlinked") return { state: "unlinked", firstName: "Ján" };
  if (kind === "error") return { state: "error" };
  return null;
}

export default async function DennikPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const { preview } = await searchParams;
  const result = (preview && previewResult(preview)) || (await getPortalFoodDiary());

  if (result.state === "error") {
    return (
      <Notice icon={<AlertIcon />} title="Nepodarilo sa načítať denník" tone="alert" action={<RetryButton />}>
        Skús to o chvíľu znova. Ak to potrvá, napíš svojmu trénerovi.
      </Notice>
    );
  }

  if (result.state === "unlinked") {
    return (
      <Notice icon={<ProfileIcon />} title={result.firstName ? `Vitaj, ${result.firstName}` : "Vitaj vo FitPilot"}>
        Tvoj účet ešte nie je prepojený s trénerom. Prepojenie spraví tréner zo svojej strany.
      </Notice>
    );
  }

  return <DiaryView data={result.data} />;
}
