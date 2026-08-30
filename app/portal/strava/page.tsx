import { getPortalNutrition } from "@/lib/portal/data";
import { ProfileIcon } from "../icons";
import { AlertIcon, Notice } from "../Notice";
import { RetryButton } from "../RetryButton";
import styles from "../portal.module.css";

/* /portal/strava — makro cieľ (BMR/TDEE/makrá) + najnovší jedálniček klienta.
   Obe časti sú nezávislé, preto majú vlastné empty-state riadky namiesto
   jedného veľkého "nič tu nie je" — klient môže mať jedno bez druhého. */

export default async function StravaPage() {
  const result = await getPortalNutrition();

  if (result.state === "error") {
    return (
      <Notice icon={<AlertIcon />} title="Nepodarilo sa načítať výživu" tone="alert" action={<RetryButton />}>
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

  const { macroGoal, mealPlanName, mealDays } = result.data;

  return (
    <section aria-label="Výživa" style={{ display: "grid", gap: 20 }}>
      <div className={styles.panel}>
        <p className={styles.panelLabel}>Makro cieľ</p>
        {macroGoal ? (
          <>
            <div className={styles.streakHead}>
              <span className={styles.streakNum}>{macroGoal.caloriesTarget}</span>
              <span className={styles.streakUnit}>kcal / deň</span>
            </div>
            <div className={styles.sessionChips} style={{ marginTop: 10 }}>
              <span className={styles.chip}>{macroGoal.proteinG} g bielkoviny</span>
              <span className={styles.chip}>{macroGoal.carbsG} g sacharidy</span>
              <span className={styles.chip}>{macroGoal.fatG} g tuky</span>
            </div>
            <p className={styles.sessionFocus} style={{ marginTop: 10 }}>
              BMR {macroGoal.bmr} kcal · TDEE {macroGoal.tdee} kcal
            </p>
          </>
        ) : (
          <div className={styles.sessionQuiet}>
            <p>Tréner ti zatiaľ nenastavil makro cieľ.</p>
          </div>
        )}
      </div>

      <div>
        <p className={styles.panelLabel}>{mealPlanName ?? "Jedálniček"}</p>
        {mealDays.length === 0 ? (
          <div className={styles.sessionQuiet}>
            <p>Tréner ti zatiaľ nezostavil jedálniček.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 16, marginTop: 8 }}>
            {mealDays.map((day) => (
              <div key={day.id} className={styles.panel}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
                  <span className={styles.sessionTitle} style={{ fontSize: "1.05rem" }}>
                    {day.name}
                  </span>
                  <span className={styles.chip}>{day.totalKcal} kcal</span>
                </div>
                {day.groups.length === 0 ? (
                  <div className={styles.sessionQuiet}>
                    <p>Tento deň zatiaľ nemá žiadne jedlá.</p>
                  </div>
                ) : (
                  day.groups.map((group) => (
                    <div key={group.slotLabel} style={{ marginTop: 10 }}>
                      <p className={styles.exMeta} style={{ marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        {group.slotLabel}
                      </p>
                      <ol className={styles.exList}>
                        {group.entries.map((entry, i) => (
                          <li key={i} className={styles.exRow}>
                            <span className={styles.exIdx}>{i + 1}</span>
                            <span className={styles.exBody}>
                              <span className={styles.exName}>{entry.name}</span>
                              <span className={styles.exMeta}>
                                {entry.grams} g · {entry.proteinG}g B · {entry.carbsG}g S · {entry.fatG}g T
                              </span>
                            </span>
                            <span className={styles.exLoad}>{entry.kcal} kcal</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
