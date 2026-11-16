import { SwipeBack } from "@/app/components/SwipeBack";
import { AppLink as Link } from "../../../../components/AppLink";
import { notFound, redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { getUserLocale } from "@/lib/i18n/server";
import { foodNameForLocale } from "@/lib/foodStaples";
import type { FoodSource } from "@/lib/portal/types";
import { PlanRecipients } from "@/app/dashboard/PlanRecipients";
import { listPlanRecipients } from "@/lib/planRecipients";
import { MealPlanBuilder } from "./MealPlanBuilder";
import { MealPlanFooterActions, MealPublishBadge } from "./MealPlanControls";
import { PlanTitle } from "../../../treningy/[planId]/PlanTitle";
import { renameMealPlanAction } from "../actions";
import styles from "@/app/dashboard/dashboard.module.css";

export default async function MealPlanDetailPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await getUser();

  if (!user) {
    redirect("/prihlasenie");
  }

  // Stĺpec name_cs vznikne až migráciou 0064 a unit_base/piece_g/package_g až 0066; kým nie
  // sú spustené, select zlyhá (42703 / PGRST). Builder nesmie ostať bez knižnice, preto sa
  // zopakuje postupne bez nových stĺpcov.
  type FoodRow = {
    id: string;
    name: string;
    name_cs?: string | null;
    source: FoodSource;
    kcal_100g: number;
    protein_100g: number;
    carbs_100g: number;
    fat_100g: number;
    serving_g?: number | null;
    unit_base?: string | null;
    piece_g?: number | null;
    package_g?: number | null;
  };
  const loadFoods = async (): Promise<FoodRow[] | null> => {
    const base = "id, name, source, kcal_100g, protein_100g, carbs_100g, fat_100g, serving_g";
    let rows: FoodRow[] | null = null;
    for (const cols of [`${base}, name_cs, unit_base, piece_g, package_g`, `${base}, name_cs`, base]) {
      const res = await supabase
        .from("foods")
        .select(cols)
        // bez produktov uložených skenerom klientov (source='off', 0050) — knižnica by nimi rástla
        .neq("source", "off")
        .order("name");
      rows = res.data as unknown as FoodRow[] | null;
      if (!res.error) break;
    }
    return rows;
  };

  // `plan`, `days` aj `foods` berú `planId`/nič z route parametra — nezávislé,
  // paralelne namiesto čakania na `plan` pred spustením zvyšných dvoch.
  const [{ data: plan }, { data: days }, foods] = await Promise.all([
    supabase
      .from("meal_plans")
      .select("id, name, client_id, published, created_at, clients(full_name)")
      .eq("id", planId)
      .maybeSingle(),
    supabase.from("meal_days").select("id, day_number, name, meals").eq("plan_id", planId).order("day_number"),
    loadFoods(),
  ]);

  if (!plan) {
    notFound();
  }

  const locale = await getUserLocale();
  const library = (foods ?? []).map((f) => ({
    id: f.id,
    name: foodNameForLocale(f, locale),
    source: f.source,
    kcal_100g: f.kcal_100g,
    protein_100g: f.protein_100g,
    carbs_100g: f.carbs_100g,
    fat_100g: f.fat_100g,
    serving_g: f.serving_g ?? null,
    unit_base: f.unit_base === "ml" ? ("ml" as const) : ("g" as const),
    piece_g: f.piece_g ?? null,
    package_g: f.package_g ?? null,
  }));

  const clientName = (plan.clients as unknown as { full_name: string } | null)?.full_name ?? "?";
  // šablóna použitá pre viacerých klientov (0052) — pri odoslaní dostanú jedálniček aj títo
  const recipients = await listPlanRecipients(supabase, "meal", planId);

  // Portál ukazuje najnovší zverejnený jedálniček — je to tento?
  let visibleToClient = false;
  if (plan.published) {
    const { data: newerPublished } = await supabase
      .from("meal_plans")
      .select("id")
      .eq("client_id", plan.client_id)
      .eq("published", true)
      .gt("created_at", plan.created_at)
      .limit(1);
    visibleToClient = (newerPublished ?? []).length === 0;
  }

  return (
    // Späť na zoznam jedálničkov: na mobile potiahnutím zľava doprava (SwipeBack), na počítači bočné menu.
    <SwipeBack href="/dashboard/jedalnicky">
      {/* Rovnaké rozloženie ako detail tréningového plánu: názov s ceruzkou + stav vpravo,
          pod tým súmerná mriežka akcií konceptu, menej časté akcie dole za čiarou. */}
      <div className={styles.detailHead}>
        <div className={styles.detailTitle}>
          <PlanTitle planId={planId} name={plan.name} rename={renameMealPlanAction} />
          <div className={styles.clientGoal}>
            <Link href={`/dashboard/klienti/${plan.client_id}`}>{clientName}</Link>
          </div>
          <PlanRecipients kind="meal" planId={planId} published={plan.published} recipients={recipients} />
        </div>
        <MealPublishBadge published={plan.published} visibleToClient={visibleToClient} />
      </div>

      {/* Akcie konceptu (Zverejniť | Zmazať koncept) renderuje builder — potrebujú vedieť
          o neuložených zmenách. */}
      <MealPlanBuilder
        planId={planId}
        published={plan.published}
        days={days ?? []}
        library={library}
        recipientCount={recipients.length}
      />

      <div className={styles.planFooterActions} data-tour="meal-footer">
        <MealPlanFooterActions
          planId={planId}
          planName={plan.name}
          published={plan.published}
          visibleToClient={visibleToClient}
        />
      </div>
    </SwipeBack>
  );
}
