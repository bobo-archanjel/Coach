import { getTranslations } from "next-intl/server";
import { getPortalNutrition } from "@/lib/portal/data";
import { FoodIcon, ProfileIcon } from "@/app/portal/icons";
import { RetryButton } from "@/app/portal/RetryButton";
import { AlertIcon, Notice } from "../Notice";
import s from "../portal.module.css";

/* /portal/strava — makro cieľ + najnovší zverejnený jedálniček (getPortalNutrition):
   dlaždice makier, jedlá ako riadky v karte dňa. */

const MACRO_TILES = [
  { key: "proteinG", label: "protein", color: "var(--accent)" },
  { key: "carbsG", label: "carbs", color: "var(--plate-yellow)" },
  { key: "fatG", label: "fat", color: "var(--moss)" },
] as const;

export default async function StravaPage() {
  const [result, tp, t] = await Promise.all([
    getPortalNutrition(),
    getTranslations("portal"),
    getTranslations("portal.nutrition"),
  ]);

  if (result.state === "error") {
    return (
      <Notice icon={<AlertIcon />} title={t("loadFailed")} tone="alert" action={<RetryButton />}>
        {tp("retryLater")}
      </Notice>
    );
  }

  if (result.state === "unlinked") {
    return (
      <Notice icon={<ProfileIcon />} title={result.firstName ? tp("welcomeName", { name: result.firstName }) : tp("welcome")}>
        {tp("unlinkedShort")}
      </Notice>
    );
  }

  const { macroGoal, mealPlanId, mealPlanName, mealDays } = result.data;

  return (
    <>
      <header>
        <h1 className={s.pageTitle}>{t("title")}</h1>
        <p className={s.pageSub}>{t("sub")}</p>
      </header>

      <div className={s.panel}>
        <div className={s.panelHead}>
          <p className={s.panelLabel}>{t("macroGoal")}</p>
          <span className={s.panelIcon}>
            <FoodIcon />
          </span>
        </div>
        {macroGoal ? (
          <>
            <div className={s.kcalBig}>
              {macroGoal.caloriesTarget}
              <span className={s.kcalUnit}>{t("kcalPerDay")}</span>
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
                  <div className={s.macroTileLabel}>{t(label)}</div>
                  <span className={s.macroTileBar} style={{ background: color }} aria-hidden="true" />
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className={s.sessionQuiet}>
            <p>{t("noGoal")}</p>
          </div>
        )}
      </div>

      <section aria-label={t("mealPlan")}>
        <div className={s.sectionHead}>
          <h2 className={s.sectionTitle}>{mealPlanName ?? t("mealPlan")}</h2>
        </div>
        {mealDays.length === 0 ? (
          <div className={s.panel}>
            <div className={s.sessionQuiet}>
              <p>{t("noMealPlan")}</p>
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
                    <p>{t("noMeals")}</p>
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
        {/* PDF až pod jedálničkom (nie v hlavičke sekcie) */}
        {mealPlanId && mealDays.length > 0 && (
          <div className={s.mealPdfRow}>
            <a href={`/api/export/meal-plan/${mealPlanId}/pdf`} className="btn btn-ghost btn-sm">
              {t("downloadPdf")}
            </a>
          </div>
        )}
      </section>
    </>
  );
}
