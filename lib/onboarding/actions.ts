"use server";

// FitPilot — feature/navod: stav "videl/preskočil onboarding tour" (migrácia
// 0041, profiles.tour_completed_at). Zámerne ODDELENÉ od lib/supabase/server.ts
// getProfile() (ktoré layout.tsx používa pre role-guard redirect) — ak migrácia
// ešte nebežala na tejto DB, select na neexistujúci stĺpec by celý getProfile
// dopyt zhodil chybou a rozbil by redirect tréner↔klient. Táto vrstva preto číta
// tour_completed_at samostatným dopytom a chybu (vrátane "stĺpec neexistuje")
// ticho považuje za "ešte nevidel" — tour sa jednoducho nezobrazí, appka nespadne.
//
// Cookie fast-path (doplnené po náleze z reálneho použitia): appka na tomto
// projekte si dáva veľmi záležať, aby layout.tsx (beží pri KAŽDEJ navigácii
// v /dashboard aj /portal) nerobil zbytočné round-tripy navyše — pôvodná verzia
// volala getTourSeen() ako ĎALŠÍ sekvenčný Supabase dopyt na každý jeden klik
// v menu, aj keď tour bol dávno hotový. `TOUR_SEEN_COOKIE` sa nastaví raz pri
// dokončení/preskočení a odvtedy layout tour vôbec nekontroluje v DB — číta
// len cookie (synchrónne, žiadna sieť). DB zostáva zdroj pravdy len pre úplne
// prvú návštevu (bez cookie) alebo iné zariadenie/prehliadač.

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient, getUser } from "@/lib/supabase/server";

const DEV_NO_SESSION = process.env.NODE_ENV === "development";
const TOUR_SEEN_COOKIE = "fitpilot_tour_seen";
const COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365; // 1 rok — rovnaký rád ako "zapamätaný" stav v appke

/** Rýchla synchrónna kontrola bez DB — zavolať PRED getTourSeen, nie namiesto neho. */
export async function hasTourSeenCookie(): Promise<boolean> {
  const store = await cookies();
  return store.get(TOUR_SEEN_COOKIE)?.value === "1";
}

/**
 * Zavolať pri odhlásení (signOutAction). Cookie je viazaná len na prehliadač,
 * nie na konkrétny účet — bez tohto by si v rovnakom prehliadači po odhlásení
 * trénera (ktorý tour dokončil/preskočil) a prihlásení iným účtom appka
 * "pamätala" cudzí stav a automatický tour by sa novému účtu nikdy nespustil,
 * aj keby ho reálne ešte nevidel (nájdené pri reálnom testovaní viacerých účtov).
 */
export async function clearTourSeenCookie(): Promise<void> {
  const store = await cookies();
  store.delete(TOUR_SEEN_COOKIE);
}

/**
 * `true` = tour už bol dokončený/preskočený, layout ho nemá spúšťať automaticky.
 * Bez session (DEV_OPEN preview) vraciame `true` (tour sa v dev-preview bez
 * prihlásenia nezobrazuje samé od seba) — manuálne spustenie cez `?tour=1` v
 * OnboardingTour funguje nezávisle od tejto hodnoty. Volať len keď cookie
 * fast-path (`hasTourSeenCookie`) vráti `false` — inak zbytočný round-trip.
 */
export async function getTourSeen(userId: string | null): Promise<boolean> {
  if (!userId) return true;
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("tour_completed_at").eq("id", userId).maybeSingle();
  if (error || !data) return true;
  return data.tour_completed_at != null;
}

/** Zavolá sa pri dokončení AJ pri preskočení — obe znamenajú "už nezobrazovať automaticky". */
export async function completeTourAction(): Promise<{ ok: boolean }> {
  // Cookie sa nastaví VŽDY, nezávisle od DB zápisu nižšie — aj keď DB zápis
  // zlyhá (napr. chýbajúca migrácia/grant na inej DB), appka aspoň v TOMTO
  // prehliadači tour znova nenanúti pri každej navigácii.
  const store = await cookies();
  store.set(TOUR_SEEN_COOKIE, "1", { maxAge: COOKIE_MAX_AGE_S, path: "/", sameSite: "lax" });

  const {
    data: { user },
  } = await getUser();
  if (!user) return { ok: DEV_NO_SESSION };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ tour_completed_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) {
    console.error("completeTourAction:", error.message);
    return { ok: false };
  }

  revalidatePath("/dashboard");
  revalidatePath("/portal");
  return { ok: true };
}
