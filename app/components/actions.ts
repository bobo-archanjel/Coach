"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Odhlásenie bežalo doteraz cez browser Supabase klient (`lib/supabase/client.ts`)
 * v "use client" SignOutButton — jediný dôvod, prečo sa celý balík
 * `@supabase/supabase-js` (Auth aj nepoužité Realtime/Storage/Functions moduly,
 * ~250 kB nekomprimovaného JS) posielal do prehliadača na KAŽDEJ /portal aj
 * /dashboard stránke (tlačidlo je v spodnej lište/sidebari, teda v layoute).
 * Server Action robí presne to isté (`supabase.auth.signOut()` cez existujúci
 * server klient) bez toho, aby čokoľvek z toho muselo bežať v prehliadači.
 */
export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/prihlasenie");
}
