/**
 * Rozpracovaný vlastný jedálniček klienta (ClientMealBuilder) mimo React state — prepnutie
 * tabu v portáli, uspatie telefónu alebo refresh builder zavrú a koncept by sa stratil.
 * Ukladá sa pri každej zmene (len keď sa líši od východiska), maže po uložení, zahodení
 * alebo keď sa klient vráti k pôvodnému stavu. Po návrate na Stravu ponúkne
 * NutritionSection „Pokračovať“ — rovnaký vzor ako vlastný tréning (trening/builderDraft.ts).
 * Kľúč obsahuje id prihláseného (`draftOwner`), nech koncept nevidí iný účet v prehliadači.
 */
import type { MealPlanEntryData } from "@/lib/portal/types";

const KEY_PREFIX = "fitpilot.meal.draft.v1:";
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // týždeň

export interface MealDraftDay {
  /** id uloženého dňa (úprava) alebo null = nový deň */
  id: string | null;
  name: string;
  meals: MealPlanEntryData[];
}

export interface MealBuilderDraft {
  /** upravovaný jedálniček, null = nový */
  planId: string | null;
  name: string;
  days: MealDraftDay[];
}

type DraftRecord = MealBuilderDraft & { at: number };

const keyFor = (owner: string) => `${KEY_PREFIX}${owner}`;

export function saveMealDraft(owner: string, draft: MealBuilderDraft): void {
  if (!owner) return;
  try {
    const rec: DraftRecord = { ...draft, at: Date.now() };
    localStorage.setItem(keyFor(owner), JSON.stringify(rec));
  } catch {
    /* private mode / plný storage — koncept žije len v tomto mounte */
  }
}

export function loadMealDraft(owner: string): MealBuilderDraft | null {
  if (!owner) return null;
  try {
    const raw = localStorage.getItem(keyFor(owner));
    if (!raw) return null;
    const rec = JSON.parse(raw) as Partial<DraftRecord>;
    if (typeof rec?.at !== "number" || Date.now() - rec.at >= TTL_MS) return null;
    if (typeof rec.name !== "string" || !Array.isArray(rec.days)) return null;
    const days = rec.days
      .filter((d): d is MealDraftDay => !!d && typeof d.name === "string" && Array.isArray(d.meals))
      .map((d) => ({ id: typeof d.id === "string" ? d.id : null, name: d.name, meals: d.meals }));
    return { planId: typeof rec.planId === "string" ? rec.planId : null, name: rec.name, days };
  } catch {
    return null;
  }
}

export function clearMealDraft(owner: string): void {
  if (!owner) return;
  try {
    localStorage.removeItem(keyFor(owner));
  } catch {
    /* ignoruj */
  }
}

/** Porovnateľný otlačok konceptu (bez React kľúčov) — „zmenil klient niečo?“ */
export function mealDraftSignature(draft: Omit<MealBuilderDraft, "planId">): string {
  return JSON.stringify([draft.name.trim(), draft.days]);
}
