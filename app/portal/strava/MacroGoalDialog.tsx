"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { BuilderDialog } from "@/app/components/BuilderDialog";
import d from "@/app/components/builderDialog.module.css";
import {
  ACTIVITY_VALUES,
  GOAL_VALUES,
  SEX_VALUES,
  applyManualMacros,
  calculateNutrition,
  caloriesFromMacros,
  validateManualMacros,
  type NutritionResult,
} from "@/lib/nutrition";
import type { PortalMacroInputs, PortalMacroSetup, PortalMacroValues } from "@/lib/portal/types";
import styles from "../portal.module.css";
import { saveOwnMacrosAction, setMacroSourceAction } from "./actions";

/* Okno „Nastaviť makrá“ v Strave: klient si zadá vstupy ako tréner (pohlavie, vek, váha, výška, aktivita,
   cieľ), vidí živý výpočet (calculateNutrition, ten istý ako server) a môže makrá upraviť ručne.
   Ak má aj trénerove makrá, vyberie si, ktoré platia (vlastné hodnoty ostávajú uložené). */

const MACRO_KEYS = [
  { key: "proteinG", label: "protein" },
  { key: "carbsG", label: "carbs" },
  { key: "fatG", label: "fat" },
] as const;

const str = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "" : String(n));

export function MacroGoalDialog({
  setup,
  currentSource,
  onClose,
}: {
  setup: PortalMacroSetup;
  currentSource: "client" | "trainer" | null;
  onClose: () => void;
}) {
  const t = useTranslations("portal.nutrition.macroDialog");
  const tl = useTranslations("labels");
  const tn = useTranslations("portal.nutrition");
  const { own, trainer, defaults } = setup;
  const seed: Partial<PortalMacroInputs> = own?.inputs ?? trainer?.inputs ?? {};

  const [choice, setChoice] = useState<"own" | "trainer">("own");
  const [sex, setSex] = useState<PortalMacroInputs["sex"]>(seed.sex ?? "muz");
  const [age, setAge] = useState(str(seed.age ?? defaults.age));
  const [weightKg, setWeightKg] = useState(str(seed.weightKg ?? defaults.weightKg));
  const [heightCm, setHeightCm] = useState(str(seed.heightCm ?? defaults.heightCm));
  const [activityLevel, setActivityLevel] = useState<PortalMacroInputs["activityLevel"]>(seed.activityLevel ?? "stredna");
  const [goal, setGoal] = useState<PortalMacroInputs["goal"]>(seed.goal ?? "udrzanie");

  // Uložené vlastné makrá, ktoré sa líšia od výpočtu z ich vstupov, boli upravené ručne → ručný režim.
  const ownWasManual = useMemo(() => {
    if (!own) return false;
    const auto = calculateNutrition(own.inputs);
    return auto.proteinG !== own.proteinG || auto.carbsG !== own.carbsG || auto.fatG !== own.fatG || auto.caloriesTarget !== own.caloriesTarget;
  }, [own]);
  const [manualOn, setManualOn] = useState(ownWasManual);
  const [mP, setMP] = useState(ownWasManual && own ? String(own.proteinG) : "");
  const [mC, setMC] = useState(ownWasManual && own ? String(own.carbsG) : "");
  const [mF, setMF] = useState(ownWasManual && own ? String(own.fatG) : "");

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const auto: NutritionResult | null = useMemo(() => {
    const a = Number(age);
    const w = Number(weightKg);
    const h = Number(heightCm);
    if (!a || !w || !h) return null;
    return calculateNutrition({ sex, age: a, weightKg: w, heightCm: h, activityLevel, goal });
  }, [sex, age, weightKg, heightCm, activityLevel, goal]);

  const toInt = (v: string) => (v.trim() === "" ? NaN : Number(v));
  const manualValues = { proteinG: toInt(mP), carbsG: toInt(mC), fatG: toInt(mF) };
  const manualFilled = Object.values(manualValues).every(Number.isFinite);
  const manualKcal = manualFilled ? Math.round(caloriesFromMacros(manualValues)) : null;
  const manualCheck = manualOn && manualFilled ? validateManualMacros(manualValues) : null;
  const result: NutritionResult | null =
    auto && manualOn && manualCheck?.ok ? applyManualMacros(auto, manualCheck.value) : auto;
  const autoFor = (key: (typeof MACRO_KEYS)[number]["key"]) => auto?.[key];

  const startManual = () => {
    if (!auto) return;
    setMP(String(auto.proteinG));
    setMC(String(auto.carbsG));
    setMF(String(auto.fatG));
    setManualOn(true);
  };

  const fmt = (v: PortalMacroValues) => t("values", { kcal: v.caloriesTarget, protein: v.proteinG, carbs: v.carbsG, fat: v.fatG });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      let res: { error: string | null };
      if (choice === "trainer") {
        // vlastné makrá ostávajú uložené, len sa vypnú; ak už platia trénerove, nie je čo ukladať
        res = currentSource === "client" ? await setMacroSourceAction(false) : { error: null };
      } else {
        res = await saveOwnMacrosAction(
          { sex, age: Number(age), weightKg: Number(weightKg), heightCm: Number(heightCm), activityLevel, goal },
          manualOn ? manualValues : null,
        );
      }
      if (res.error) setError(res.error);
      else onClose();
    });
  };

  const showForm = choice === "own";

  return (
    <BuilderDialog title={t("title")} closeLabel={t("close")} onClose={() => !pending && onClose()} wide>
      <form className={d.form} onSubmit={submit} data-testid="macro-dialog">
        {!trainer && <p className={styles.macroDlgIntro}>{t("intro")}</p>}

        {trainer && (
          <div className={d.field} role="radiogroup" aria-label={t("sourceLabel")}>
            <span className={d.label}>{t("sourceLabel")}</span>
            <div className={styles.macroChoice}>
              <button
                type="button"
                role="radio"
                aria-checked={choice === "own"}
                className={`${styles.macroChoiceBtn} ${choice === "own" ? styles.macroChoiceOn : ""}`}
                onClick={() => setChoice("own")}
                disabled={pending}
                data-testid="macro-choice-own"
              >
                <strong>{t("sourceOwn")}</strong>
                <small>{own ? fmt(own) : t("notSetYet")}</small>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={choice === "trainer"}
                className={`${styles.macroChoiceBtn} ${choice === "trainer" ? styles.macroChoiceOn : ""}`}
                onClick={() => setChoice("trainer")}
                disabled={pending}
                data-testid="macro-choice-trainer"
              >
                <strong>{t("sourceTrainer")}</strong>
                <small>{fmt(trainer)}</small>
              </button>
            </div>
          </div>
        )}

        {!showForm && <p className={styles.macroDlgIntro}>{t("trainerHint")}</p>}

        {showForm && (
          <>
            <div className={styles.macroRow2}>
              <div className={d.field}>
                <label htmlFor="mg-sex" className={d.label}>
                  {t("sex")}
                </label>
                <select id="mg-sex" className={d.input} value={sex} onChange={(e) => setSex(e.target.value as typeof sex)} disabled={pending}>
                  {SEX_VALUES.map((v) => (
                    <option key={v} value={v}>
                      {tl(`sex.${v}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div className={d.field}>
                <label htmlFor="mg-age" className={d.label}>
                  {t("age")}
                </label>
                <input id="mg-age" type="number" inputMode="numeric" min={10} max={119} className={d.input} value={age} onChange={(e) => setAge(e.target.value)} disabled={pending} required />
              </div>
              <div className={d.field}>
                <label htmlFor="mg-weight" className={d.label}>
                  {t("weight")}
                </label>
                <input id="mg-weight" type="number" inputMode="decimal" min={20} max={500} step="0.1" className={d.input} value={weightKg} onChange={(e) => setWeightKg(e.target.value)} disabled={pending} required />
              </div>
              <div className={d.field}>
                <label htmlFor="mg-height" className={d.label}>
                  {t("height")}
                </label>
                <input id="mg-height" type="number" inputMode="decimal" min={80} max={300} step="0.1" className={d.input} value={heightCm} onChange={(e) => setHeightCm(e.target.value)} disabled={pending} required />
              </div>
            </div>
            <div className={d.field}>
              <label htmlFor="mg-activity" className={d.label}>
                {t("activity")}
              </label>
              <select id="mg-activity" className={d.input} value={activityLevel} onChange={(e) => setActivityLevel(e.target.value as typeof activityLevel)} disabled={pending}>
                {ACTIVITY_VALUES.map((v) => (
                  <option key={v} value={v}>
                    {tl(`activity.${v}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className={d.field}>
              <label htmlFor="mg-goal" className={d.label}>
                {t("goal")}
              </label>
              <select id="mg-goal" className={d.input} value={goal} onChange={(e) => setGoal(e.target.value as typeof goal)} disabled={pending}>
                {GOAL_VALUES.map((v) => (
                  <option key={v} value={v}>
                    {tl(`goal.${v}`)}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.macroResult} data-testid="macro-dialog-result">
              <div className={styles.macroResultHead}>
                <span className={d.label}>{t("result")}</span>
                {manualOn ? (
                  <span className={styles.macroManualTag} data-testid="macro-dialog-manual">
                    {t("manualBadge")}
                  </span>
                ) : null}
                <button
                  type="button"
                  className={styles.macroLinkBtn}
                  onClick={manualOn ? () => setManualOn(false) : startManual}
                  disabled={pending || (!manualOn && !auto)}
                  data-testid="macro-dialog-edit"
                >
                  {manualOn ? t("resetValues") : t("editValues")}
                </button>
              </div>
              {result ? (
                <>
                  <p className={styles.macroResultMeta}>
                    BMR {result.bmr} kcal · TDEE {result.tdee} kcal
                  </p>
                  <div className={styles.macroResultKcal} data-testid="macro-dialog-kcal">
                    {manualOn && !manualCheck?.ok ? (manualKcal ?? "—") : result.caloriesTarget}
                    <small> {tn("kcalPerDay")}</small>
                  </div>
                  {manualOn ? (
                    <div className={styles.macroEditList}>
                      {MACRO_KEYS.map(({ key, label }) => {
                        const value = key === "proteinG" ? mP : key === "carbsG" ? mC : mF;
                        const set = key === "proteinG" ? setMP : key === "carbsG" ? setMC : setMF;
                        return (
                          <label key={key} className={styles.macroEditRow}>
                            <span>{t(label)}</span>
                            <span className={styles.macroEditField}>
                              <input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                step={1}
                                className={d.input}
                                value={value}
                                onChange={(e) => set(e.target.value)}
                                disabled={pending}
                                aria-label={t("macroAria", { name: t(label) })}
                              />
                              <span>g</span>
                            </span>
                            <span className={styles.macroEditAuto}>{t("autoValue", { g: autoFor(key) ?? "—" })}</span>
                          </label>
                        );
                      })}
                      <p className={styles.macroResultMeta}>{manualKcal != null ? t("kcalFromMacros", { kcal: manualKcal }) : "—"}</p>
                    </div>
                  ) : (
                    <div className={styles.macroGrid} style={{ marginTop: 10 }}>
                      {MACRO_KEYS.map(({ key, label }) => (
                        <div key={key} className={styles.macroTile}>
                          <div className={styles.macroTileVal}>
                            {result[key]}
                            <small>g</small>
                          </div>
                          <div className={styles.macroTileLabel}>{t(label)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className={styles.macroResultMeta}>{t("fillHint")}</p>
              )}
            </div>
          </>
        )}

        {error && (
          <p className={d.error} role="alert">
            {error}
          </p>
        )}
        <div className={d.actions}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={pending}>
            {t("cancel")}
          </button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={pending || (showForm && !result)} data-testid="macro-dialog-save">
            {pending ? t("saving") : choice === "trainer" ? t("useTrainer") : t("save")}
          </button>
        </div>
      </form>
    </BuilderDialog>
  );
}
