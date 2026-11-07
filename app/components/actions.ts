"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { clearTourSeenCookie } from "@/lib/onboarding/actions";

/**
 * Odhlásenie bežalo doteraz cez browser Supabase klient (`lib/supabase/client.ts`)
 * v "use client" SignOutButton — jediný dôvod, prečo sa celý balík
 * `@supabase/supabase-js` (Auth aj nepoužité Realtime/Storage/Functions moduly,
 * ~250 kB nekomprimovaného JS) posielal do prehliadača na KAŽDEJ /portal aj
 * /dashboard stránke (tlačidlo je v spodnej lište/sidebari, teda v layoute).
 * Server Action robí presne to isté (`supabase.auth.signOut()` cez existujúci
 * server klient) bez toho, aby čokoľvek z toho muselo bežať v prehliadači.
 */
/** Kam po odhlásení — len známe prihlasovacie stránky (hodnota prichádza z formulára). */
const SIGN_OUT_TARGETS = ["/prihlasenie", "/v6design/prihlasenie"];

export async function signOutAction(formData: FormData) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // Cookie "tour videný" je viazaná len na prehliadač, nie na účet — bez tohto
  // by ďalší účet prihlásený v tom istom prehliadači zdedil cudzí stav a jeho
  // automatický onboarding tour by sa nikdy nespustil (viď lib/onboarding/actions.ts).
  await clearTourSeenCookie();
  const to = formData.get("to");
  redirect(typeof to === "string" && SIGN_OUT_TARGETS.includes(to) ? to : "/prihlasenie");
}
