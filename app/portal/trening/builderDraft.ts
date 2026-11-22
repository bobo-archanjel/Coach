/**
 * Rozpracovaný vlastný tréning klienta (ClientPlanBuilder) mimo React state — prepnutie
 * tabu v portáli (Dnes, Chat…), uspatie telefónu alebo refresh builder zavrú a koncept by
 * sa stratil. Ukladá sa pri každej zmene (len keď sa líši od východiska), maže po uložení,
 * zahodení alebo keď sa klient vráti k pôvodnému stavu. Po návrate na Tréning ponúkne
 * TrainingSection „Pokračovať“ (vzor: workoutSession.ts — rozpísaný tréning).
 *
 * localStorage je spoločný pre všetky účty v prehliadači — kľúč obsahuje id prihláseného
 * (`draftOwner` z getPortalTraining), nech koncept nevidí iný účet na tom istom zariadení.
 */

const KEY_PREFIX = "fitpilot.plan.draft.v1:";
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // týždeň — potom je koncept skôr šum než pomoc

/** Cvik konceptu — rovnaké polia ako v builderi (bez React `key`). */
export interface DraftExercise {
  entryId?: string;
  exerciseId: string | null;
  name: string;
  sets: string;
  reps: string;
  loadKg: string;
  restSeconds: string;
  note: string;
  superset: string | null;
}

export interface DraftDay {
  /** id uloženého dňa (úprava plánu) alebo null = nový deň */
  id: string | null;
  name: string;
  exercises: DraftExercise[];
}

export interface PlanBuilderDraft {
  /** upravovaný plán, null = nový tréning */
  planId: string | null;
  name: string;
  days: DraftDay[];
}

type DraftRecord = PlanBuilderDraft & { at: number };

const keyFor = (owner: string) => `${KEY_PREFIX}${owner}`;

export function saveBuilderDraft(owner: string, draft: PlanBuilderDraft): void {
  try {
    const rec: DraftRecord = { ...draft, at: Date.now() };
    localStorage.setItem(keyFor(owner), JSON.stringify(rec));
  } catch {
    /* private mode / plný storage — koncept žije len v tomto mounte */
  }
}

export function loadBuilderDraft(owner: string): PlanBuilderDraft | null {
  try {
    const raw = localStorage.getItem(keyFor(owner));
    if (!raw) return null;
    const rec = JSON.parse(raw) as Partial<DraftRecord>;
    if (typeof rec?.at !== "number" || Date.now() - rec.at >= TTL_MS) return null;
    if (typeof rec.name !== "string" || !Array.isArray(rec.days)) return null;
    const days = rec.days
      .filter((d): d is DraftDay => !!d && typeof d.name === "string" && Array.isArray(d.exercises))
      .map((d) => ({ id: typeof d.id === "string" ? d.id : null, name: d.name, exercises: d.exercises }));
    return { planId: typeof rec.planId === "string" ? rec.planId : null, name: rec.name, days };
  } catch {
    return null;
  }
}

export function clearBuilderDraft(owner: string): void {
  try {
    localStorage.removeItem(keyFor(owner));
  } catch {
    /* ignoruj */
  }
}

/** Porovnateľný otlačok konceptu (bez React kľúčov) — „zmenil klient niečo?“ */
export function draftSignature(draft: Omit<PlanBuilderDraft, "planId">): string {
  return JSON.stringify([draft.name.trim(), draft.days]);
}
