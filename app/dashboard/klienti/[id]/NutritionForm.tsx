"use client";

import { useActionState, useMemo, useState } from "react";
import { saveNutritionProfileAction, type ActionState } from "@/app/dashboard/jedalnicky/actions";
import { useTranslations } from "next-intl";
import {
  ACTIVITY_LABELS,
  GOAL_LABELS,
  calculateNutrition,
  type ActivityLevel,
  type Goal,
  type NutritionResult,
  type Sex,
} from "@/lib/nutrition";
import styles from "../../dashboard.module.css";

const initialState: ActionState = { error: null };

interface SavedProfile {
  sex: Sex;
  age: number;
  weight_kg: number;
  height_cm: number;
  activity_level: ActivityLevel;
  goal: Goal;
  notes: string | null;
  bmr: number;
  tdee: number;
  calories_target: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export function NutritionForm({
  clientId,
  profile,
  defaults,
}: {
  clientId: string;
  profile: SavedProfile | null;
  /** bez uloženého profilu: vek/váha/výška z karty klienta (Pridať klienta, 0009) */
  defaults?: { age: number | null; weight_kg: number | null; height_cm: number | null };
}) {
  const [state, formAction, pending] = useActionState(saveNutritionProfileAction, initialState);
  const t = useTranslations("clientDetail.nutritionForm");
  const tl = useTranslations("labels");

  const [sex, setSex] = useState<Sex>(profile?.sex ?? "muz");
  const [age, setAge] = useState((profile?.age ?? defaults?.age)?.toString() ?? "");
  const [weightKg, setWeightKg] = useState((profile?.weight_kg ?? defaults?.weight_kg)?.toString() ?? "");
  const [heightCm, setHeightCm] = useState((profile?.height_cm ?? defaults?.height_cm)?.toString() ?? "");
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(profile?.activity_level ?? "stredna");
  const [goal, setGoal] = useState<Goal>(profile?.goal ?? "udrzanie");

  // Live náhľad prepočítaný priamo v prehliadači (rovnaká funkcia ako server action) —
  // tréner vidí výsledok skôr, než formulár uloží; server si pri uložení prepočíta znova.
  const preview: NutritionResult | null = useMemo(() => {
    const a = Number(age);
    const w = Number(weightKg);
    const h = Number(heightCm);
    if (!a || !w || !h) return null;
    return calculateNutrition({ sex, age: a, weightKg: w, heightCm: h, activityLevel, goal });
  }, [sex, age, weightKg, heightCm, activityLevel, goal]);

  const result =
    preview ??
    (profile
      ? {
          bmr: profile.bmr,
          tdee: profile.tdee,
          caloriesTarget: profile.calories_target,
          proteinG: profile.protein_g,
          carbsG: profile.carbs_g,
          fatG: profile.fat_g,
        }
      : null);

  // isUnsavedPreview predtým znamenalo len "dá sa spočítať náhľad" (preview !== null),
  // čo bolo pravda takmer vždy hneď ako profil existoval (polia sú pred-vyplnené jeho
  // hodnotami) — label tak hlásil "(neuložený náhľad)" aj tesne po uložení a reloade,
  // hoci zobrazené číslo BOLO presne uložený cieľ (QA nález #4). Teraz sa porovnáva
  // proti skutočne uloženému profilu — "neuložený" znamená, že sa naozaj niečo zmenilo.
  const isDirty =
    !profile ||
    sex !== profile.sex ||
    Number(age) !== profile.age ||
    Number(weightKg) !== profile.weight_kg ||
    Number(heightCm) !== profile.height_cm ||
    activityLevel !== profile.activity_level ||
    goal !== profile.goal;
  const isUnsavedPreview = preview !== null && isDirty;
  const totalMacroKcal = result ? result.proteinG * 4 + result.carbsG * 4 + result.fatG * 9 : 0;

  return (
    <div className={styles.detailGrid}>
      <div className={styles.card}>
        <h3>{t("inputs")}</h3>
        <form action={formAction}>
          <input type="hidden" name="client_id" value={clientId} readOnly />
          <div className={styles.fieldGrid}>
            <label>
              <span className={styles.timeFieldLabel}>{t("sex")}</span>
              <select
                name="sex"
                value={sex}
                onChange={(e) => setSex(e.target.value as Sex)}
                className={styles.addClientInput}
                disabled={pending}
              >
                <option value="muz">{tl("sex.muz")}</option>
                <option value="zena">{tl("sex.zena")}</option>
              </select>
            </label>
            <label>
              <span className={styles.timeFieldLabel}>{t("age")}</span>
              <input
                name="age"
                type="number"
                inputMode="numeric"
                min={1}
                max={119}
                placeholder={t("agePlaceholder")}
                required
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className={styles.addClientInput}
                disabled={pending}
              />
            </label>
            <label>
              <span className={styles.timeFieldLabel}>{t("weight")}</span>
              <input
                name="weight_kg"
                type="number"
                inputMode="decimal"
                min={1}
                step="0.1"
                placeholder={t("weightPlaceholder")}
                required
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                className={styles.addClientInput}
                disabled={pending}
              />
            </label>
            <label>
              <span className={styles.timeFieldLabel}>{t("height")}</span>
              <input
                name="height_cm"
                type="number"
                inputMode="decimal"
                min={1}
                step="0.1"
                placeholder={t("heightPlaceholder")}
                required
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                className={styles.addClientInput}
                disabled={pending}
              />
            </label>
            <label className={styles.fieldGridFull}>
              <span className={styles.timeFieldLabel}>{t("activity")}</span>
              <select
                name="activity_level"
                value={activityLevel}
                onChange={(e) => setActivityLevel(e.target.value as ActivityLevel)}
                className={styles.addClientInput}
                disabled={pending}
              >
                {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((value) => (
                  <option key={value} value={value}>
                    {tl(`activity.${value}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.fieldGridFull}>
              <span className={styles.timeFieldLabel}>{t("goal")}</span>
              <select
                name="goal"
                value={goal}
                onChange={(e) => setGoal(e.target.value as Goal)}
                className={styles.addClientInput}
                disabled={pending}
              >
                {(Object.keys(GOAL_LABELS) as Goal[]).map((value) => (
                  <option key={value} value={value}>
                    {tl(`goal.${value}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.fieldGridFull}>
              <span className={styles.timeFieldLabel}>{t("note")}</span>
              <textarea
                name="notes"
                placeholder={t("optional")}
                defaultValue={profile?.notes ?? ""}
                className={styles.addClientInput}
                disabled={pending}
                rows={2}
              />
            </label>
            <button type="submit" className={`btn btn-primary btn-sm ${styles.fieldGridFull}`} disabled={pending}>
              {pending ? t("saving") : profile ? t("update") : t("save")}
            </button>
          </div>
          {state.error && <p className={styles.addClientError}>{state.error}</p>}
        </form>
      </div>

      <div className={styles.card}>
        <h3>
          {t("result")}
          {isUnsavedPreview && profile ? t("unsavedPreview") : isUnsavedPreview ? t("preview") : ""}
        </h3>
        {result ? (
          <>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>BMR</span>
              <span className={styles.infoValue}>{t("bmr", { kcal: result.bmr })}</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>TDEE</span>
              <span className={styles.infoValue}>{t("tdee", { kcal: result.tdee })}</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>{t("calorieGoal")}</span>
              <span className={styles.infoValue}>{t("kcalPerDay", { kcal: result.caloriesTarget })}</span>
            </div>

            <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
              <div className={styles.macroBarRow}>
                <div className={styles.macroTop}>
                  <span>{t("protein")}</span>
                  <span className={styles.macroVal}>{result.proteinG} g</span>
                </div>
                <div className={styles.macroTrack}>
                  <div
                    className={`${styles.macroFill} ${styles.protein}`}
                    style={{ width: `${totalMacroKcal ? Math.round(((result.proteinG * 4) / totalMacroKcal) * 100) : 0}%` }}
                  />
                </div>
              </div>
              <div className={styles.macroBarRow}>
                <div className={styles.macroTop}>
                  <span>{t("carbs")}</span>
                  <span className={styles.macroVal}>{result.carbsG} g</span>
                </div>
                <div className={styles.macroTrack}>
                  <div
                    className={`${styles.macroFill} ${styles.carbs}`}
                    style={{ width: `${totalMacroKcal ? Math.round(((result.carbsG * 4) / totalMacroKcal) * 100) : 0}%` }}
                  />
                </div>
              </div>
              <div className={styles.macroBarRow}>
                <div className={styles.macroTop}>
                  <span>{t("fat")}</span>
                  <span className={styles.macroVal}>{result.fatG} g</span>
                </div>
                <div className={styles.macroTrack}>
                  <div
                    className={`${styles.macroFill} ${styles.fat}`}
                    style={{ width: `${totalMacroKcal ? Math.round(((result.fatG * 9) / totalMacroKcal) * 100) : 0}%` }}
                  />
                </div>
              </div>
            </div>
          </>
        ) : (
          <p className={styles.noWorkouts}>{t("fillHint")}</p>
        )}
      </div>
    </div>
  );
}
