import { getPortalNutrition } from "@/lib/portal/data";
import { FoodIcon, ProfileIcon } from "@/app/portal/icons";
import { RetryButton } from "@/app/portal/RetryButton";
import { AlertIcon, Notice } from "../V6Notice";
import s from "../styles/portal.module.css";

/* /v6design/portal/strava — makro cieľ + najnovší jedálniček (getPortalNutrition),
   rovnaké dáta a stavy ako /portal/strava, nové rozloženie: dlaždice makier, jedlá
   ako riadky v karte dňa. */

const MACRO_TILES = [
  { key: "proteinG", label: "Bielkoviny", color: "var(--accent)" },
  { key: "carbsG", label: "Sacharidy", color: "var(--plate-yellow)" },
  { key: "fatG", label: "Tuky", color: "var(--moss)" },
] as const;

export default async function V6StravaPage() {
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

  const { macroGoal, mealPlanId, mealPlanName, mealDays } = result.data;

  return (
    <>
      <header>
        <h1 className={s.pageTitle}>Strava</h1>
        <p className={s.pageSub}>Denný cieľ a jedálniček od trénera.</p>
      </header>

      <div className={s.panel}>
        <div className={s.panelHead}>
          <p className={s.panelLabel}>Makro cieľ</p>
          <span className={s.panelIcon}>
            <FoodIcon />
          </span>
        </div>
        {macroGoal ? (
          <>
            <div className={s.kcalBig}>
              {macroGoal.caloriesTarget}
              <span className={s.kcalUnit}>kcal / deň</span>
            </div>
            <p className={s.kcalSub}>
              BMR {macroGoal.bmr} kcal · TDEE {macroGoal.tdee} kcal
            </p>
            <div className={s.macroGrid}>
              {MACRO_TILES.map(({ key, label, color }) => (
                <div key={key} className={s.macroTile}>
                  <div className={s.macroTileVal}>
                    {macroGoal[key]}
                    <small>g</small>
                  </div>
                  <div className={s.macroTileLabel}>{label}</div>
                  <span className={s.macroTileBar} style={{ background: color }} aria-hidden="true" />
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className={s.sessionQuiet}>
            <p>Tréner ti zatiaľ nenastavil makro cieľ.</p>
          </div>
        )}
      </div>

      <section aria-label="Jedálniček">
        <div className={s.sectionHead}>
          <h2 className={s.sectionTitle}>{mealPlanName ?? "Jedálniček"}</h2>
          {mealPlanId && mealDays.length > 0 && (
            <a href={`/api/export/meal-plan/${mealPlanId}/pdf`} className="btn btn-ghost btn-sm">
              Stiahnuť PDF
            </a>
          )}
        </div>
        {mealDays.length === 0 ? (
          <div className={s.panel}>
            <div className={s.sessionQuiet}>
              <p>Tréner ti zatiaľ nezostavil jedálniček.</p>
            </div>
          </div>
        ) : (
          <div className={s.stack}>
            {mealDays.map((day) => (
              <div key={day.id} className={s.panel}>
                <div className={s.mealDayHead}>
                  <span className={s.mealDayName}>{day.name}</span>
                  <span className={s.chip}>{day.totalKcal} kcal</span>
                </div>
                {day.groups.length === 0 ? (
                  <div className={s.sessionQuiet}>
                    <p>Tento deň zatiaľ nemá žiadne jedlá.</p>
                  </div>
                ) : (
                  day.groups.map((group) => (
                    <div key={group.slotLabel}>
                      <p className={s.mealSlot}>{group.slotLabel}</p>
                      <ol className={s.mealList}>
                        {group.entries.map((entry, i) => (
                          <li key={i} className={s.mealRow}>
                            <span>
                              <span className={s.mealName}>{entry.name}</span>
                              <span className={s.mealMeta}>
                                {entry.grams} g · {entry.proteinG}g B · {entry.carbsG}g S · {entry.fatG}g T
                              </span>
                            </span>
                            <span className={s.mealKcal}>{entry.kcal} kcal</span>
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
      </section>
    </>
  );
}
