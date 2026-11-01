import Link from "next/link";
import { createClient, getUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PLAN_GOALS, PLAN_GOAL_LABEL_SK, isPlanGoal } from "@/lib/planGoals";
import { InfoTip } from "@/app/components/InfoTip";
import { dashStyles, isV6Dashboard } from "@/app/dashboard/dashSkin";
import { TemplatesList, type TemplateItem } from "./TemplatesList";
import templatesModule from "./templates.module.css";
import v6Templates from "@/app/v6design/dashboard/styles/templates.module.css";

type Kind = "workout" | "meal";

type DayRow = { day_number: number; name: string; exercises?: unknown; meals?: unknown };

/** Dni šablóny → náhľad: názov dňa a položky (cviky / potraviny s gramážou). */
function toDays(rows: DayRow[] | null, kind: Kind): TemplateItem["days"] {
  return [...(rows ?? [])]
    .sort((a, b) => a.day_number - b.day_number)
    .map((d) => {
      const raw = (kind === "workout" ? d.exercises : d.meals) as unknown;
      const entries = (Array.isArray(raw) ? raw : []) as { exercise_name?: string; food_name?: string; grams?: number }[];
      const items = entries
        .map((e) => (kind === "workout" ? e.exercise_name : e.food_name ? `${e.food_name}${e.grams ? ` ${e.grams} g` : ""}` : null))
        .filter((x): x is string => Boolean(x));
      return { name: d.name, items };
    });
}

/**
 * Šablóny trénera — záložky Tréningy / Jedálničky (?typ=), pri tréningoch filter cieľa
 * (?goal=), hľadanie podľa názvu a náhľad obsahu na karte; „Použiť“ otvorí výber klienta
 * a vytvorí koncept (TemplateCard / ApplyTemplateDialog). Šablóny vznikajú na detaile
 * plánu tlačidlom „Uložiť ako šablónu“.
 */
export default async function SablonyPage({ searchParams }: { searchParams: Promise<{ typ?: string; goal?: string }> }) {
  const styles = await dashStyles();
  const t = (await isV6Dashboard()) ? v6Templates : templatesModule;
  const {
    data: { user },
  } = await getUser();
  if (!user) redirect("/prihlasenie");
  const supabase = await createClient();

  const { typ, goal: goalParam } = await searchParams;
  const kind: Kind = typ === "jedalnicky" ? "meal" : "workout";
  const activeGoal = kind === "workout" && isPlanGoal(goalParam) ? goalParam : null;

  const [{ data: clients }, { data: planTemplates }, { data: mealTemplates }] = await Promise.all([
    supabase.from("clients").select("id, full_name").eq("trainer_id", user.id).order("full_name"),
    supabase
      .from("plan_templates")
      .select("id, name, goal, created_at, plan_template_days(day_number, name, exercises)")
      .eq("trainer_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("meal_templates")
      .select("id, name, created_at, meal_template_days(day_number, name, meals)")
      .eq("trainer_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const workoutItems: TemplateItem[] = (planTemplates ?? []).map((tpl) => ({
    id: tpl.id,
    name: tpl.name,
    goal: tpl.goal,
    days: toDays(tpl.plan_template_days as DayRow[] | null, "workout"),
  }));
  const mealItems: TemplateItem[] = (mealTemplates ?? []).map((tpl) => ({
    id: tpl.id,
    name: tpl.name,
    goal: null,
    days: toDays(tpl.meal_template_days as DayRow[] | null, "meal"),
  }));
  // Filter podľa cieľa je len pri tréningových šablónach — jedálničkové goal nemajú
  // (0025_templates.sql: `goal` stĺpec existuje iba na plan_templates).
  const items =
    kind === "workout" ? (activeGoal ? workoutItems.filter((i) => i.goal === activeGoal) : workoutItems) : mealItems;

  const tab = (value: Kind, label: string, count: number) => (
    <Link
      href={value === "meal" ? "/dashboard/sablony?typ=jedalnicky" : "/dashboard/sablony"}
      className={`${t.tab} ${kind === value ? t.tabActive : ""}`}
      aria-current={kind === value ? "page" : undefined}
    >
      {label} <span className={t.tabCount}>{count}</span>
    </Link>
  );

  return (
    <>
      <div className={styles.pageHead}>
        <h1>
          Šablóny{" "}
          <InfoTip title="Šablóny">
            Ulož si tréningový plán alebo jedálniček ako šablónu na detaile plánu (&bdquo;Uložiť ako šablónu&ldquo;) a znovu
            ju použi pre ďalšieho klienta — vytvorí sa bežný koncept na doladenie, nič sa neposiela klientovi automaticky.
          </InfoTip>
        </h1>
      </div>

      <nav className={t.tabs} aria-label="Druh šablón">
        {tab("workout", "Tréningy", workoutItems.length)}
        {tab("meal", "Jedálničky", mealItems.length)}
      </nav>

      {kind === "workout" && workoutItems.length > 0 && (
        <div className={t.goals} role="group" aria-label="Cieľ">
          <Link href="/dashboard/sablony" className={`${t.goal} ${!activeGoal ? t.goalActive : ""}`}>
            Všetky
          </Link>
          {PLAN_GOALS.map((g) => (
            <Link key={g} href={`/dashboard/sablony?goal=${g}`} className={`${t.goal} ${activeGoal === g ? t.goalActive : ""}`}>
              {PLAN_GOAL_LABEL_SK[g]}
            </Link>
          ))}
        </div>
      )}

      {(kind === "workout" ? workoutItems : mealItems).length === 0 ? (
        <p className={t.empty}>
          {kind === "workout" ? (
            <>
              Zatiaľ žiadne tréningové šablóny — otvor plán na <Link href="/dashboard/treningy">Tréningy</Link> a ulož ho
              ako šablónu.
            </>
          ) : (
            <>
              Zatiaľ žiadne jedálničkové šablóny — otvor jedálniček v sekcii <Link href="/dashboard/jedalnicky">Jedálničky</Link> a ulož
              ho ako šablónu.
            </>
          )}
        </p>
      ) : (
        <TemplatesList key={`${kind}-${activeGoal ?? ""}`} kind={kind} items={items} clients={clients ?? []} />
      )}
    </>
  );
}
