"use client";

import { useActionState, useMemo, useState } from "react";
import { saveNutritionProfileAction, type ActionState } from "../actions";
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

export function NutritionForm({ clientId, profile }: { clientId: string; profile: SavedProfile | null }) {
  const [state, formAction, pending] = useActionState(saveNutritionProfileAction, initialState);

  const [sex, setSex] = useState<Sex>(profile?.sex ?? "muz");
  const [age, setAge] = useState(profile?.age?.toString() ?? "");
  const [weightKg, setWeightKg] = useState(profile?.weight_kg?.toString() ?? "");
  const [heightCm, setHeightCm] = useState(profile?.height_cm?.toString() ?? "");
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

  const isUnsavedPreview = preview !== null;
  const totalMacroKcal = result ? result.proteinG * 4 + result.carbsG * 4 + result.fatG * 9 : 0;

  return (
    <div className={styles.detailGrid}>
      <div className={styles.card}>
        <h3>Vstupné údaje</h3>
        <form action={formAction} className={styles.addClientForm}>
          <input type="hidden" name="client_id" value={clientId} readOnly />
          <div className={styles.addClientFields} style={{ flexDirection: "column", alignItems: "stretch" }}>
            <select
              name="sex"
              value={sex}
              onChange={(e) => setSex(e.target.value as Sex)}
              className={styles.addClientInput}
              disabled={pending}
            >
              <option value="muz">Muž</option>
              <option value="zena">Žena</option>
            </select>
            <input
              name="age"
              type="number"
              min={1}
              max={119}
              placeholder="Vek (roky)"
              required
              value={age}
              onChange={(e) => setAge(e.target.value)}
              className={styles.addClientInput}
              disabled={pending}
            />
            <input
              name="weight_kg"
              type="number"
              min={1}
              step="0.1"
              placeholder="Váha (kg)"
              required
              value={weightKg}
              onChange={(e) => setWeightKg(e.target.value)}
              className={styles.addClientInput}
              disabled={pending}
            />
            <input
              name="height_cm"
              type="number"
              min={1}
              step="0.1"
              placeholder="Výška (cm)"
              required
              value={heightCm}
              onChange={(e) => setHeightCm(e.target.value)}
              className={styles.addClientInput}
              disabled={pending}
            />
            <select
              name="activity_level"
              value={activityLevel}
              onChange={(e) => setActivityLevel(e.target.value as ActivityLevel)}
              className={styles.addClientInput}
              disabled={pending}
            >
              {Object.entries(ACTIVITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              name="goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value as Goal)}
              className={styles.addClientInput}
              disabled={pending}
            >
              {Object.entries(GOAL_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <textarea
              name="notes"
              placeholder="Poznámka (voliteľné)"
              defaultValue={profile?.notes ?? ""}
              className={styles.addClientInput}
              disabled={pending}
              rows={2}
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
              {pending ? "Ukladám…" : profile ? "Aktualizovať makro cieľ" : "Uložiť makro cieľ"}
            </button>
          </div>
          {state.error && <p className={styles.addClientError}>{state.error}</p>}
        </form>
      </div>

      <div className={styles.card}>
        <h3>Výsledok{isUnsavedPreview && profile ? " (neuložený náhľad)" : isUnsavedPreview ? " (náhľad)" : ""}</h3>
        {result ? (
          <>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>BMR</span>
              <span className={styles.infoValue}>{result.bmr} kcal/deň — bazálny metabolizmus</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>TDEE</span>
              <span className={styles.infoValue}>{result.tdee} kcal/deň — s aktivitou</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Kalorický cieľ</span>
              <span className={styles.infoValue}>{result.caloriesTarget} kcal/deň</span>
            </div>

            <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
              <div className={styles.macroBarRow}>
                <div className={styles.macroTop}>
                  <span>Bielkoviny</span>
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
                  <span>Sacharidy</span>
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
                  <span>Tuky</span>
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
          <p className={styles.noWorkouts}>Vyplň vek, váhu a výšku vľavo — výsledok sa dopočíta automaticky.</p>
        )}
      </div>
    </div>
  );
}
