// FitPilot — cron: mazanie účtov s NEOVERENÝM e-mailom starších ako 7 dní.
// Prečo (GDPR, minimalizácia údajov): registráciu možno spraviť na cudzí/náhodný e-mail; trigger
// handle_new_user zakladá `profiles` (e-mail, meno) a klientovi aj vlastný riadok v `clients`
// s menom — aj keď overovací e-mail nikto nepotvrdil. Zmazanie zároveň uvoľní e-mail obsadený
// cudzou neoverenou registráciou.
// Kritériá (lib/auth/unconfirmedPurge.ts): bez email/phone potvrdenia, nepozvaný, nikdy
// neprihlásený, starší ako 7 dní, len e-mailová identita (OAuth nikdy), nie anonymný.
// Poistky: max 200 zmazaní na beh; preskočí účet, ktorý má v DB klientov (tréner) alebo je
// spárovaný s trénerom; chyba jedného účtu nezastaví beh; `?dry=1` nič nemaže, len vráti počty
// (bezpečné overenie v produkcii). Odpoveď a logy bez e-mailov a mien.
// Zmazanie: najprv vlastný `clients` riadok (user_id → profiles je on delete set null, inak by
// ostal osirotený riadok s menom), potom auth.users (profiles ide cez on delete cascade).
// `terms_acceptances` je zámerne bez FK (0065) a ostáva — právny záznam so snímkou e-mailu,
// maže ho až samostatný cron 4 roky po zmazaní účtu.
// Vercel Cron (vercel.json), `Authorization: Bearer ${CRON_SECRET}`. Idempotentné.

import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { cronAuthorized } from "@/lib/cronAuth";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { isPurgeableUnconfirmedUser } from "@/lib/auth/unconfirmedPurge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PER_PAGE = 1000;
const MAX_PAGES = 50; // poistka proti nekonečnému stránkovaniu
const MAX_PURGE_PER_RUN = 200;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = tryCreateAdminClient();
  if (!admin) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const now = new Date();
  let scanned = 0;
  const candidates: User[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) {
      console.error("cron.unconfirmed-purge: listUsers:", error.message);
      return NextResponse.json({ error: "failed" }, { status: 500 });
    }
    const users = data?.users ?? [];
    scanned += users.length;
    for (const u of users) if (isPurgeableUnconfirmedUser(u, now)) candidates.push(u);
    if (users.length < PER_PAGE) break;
  }

  let deleted = 0;
  let skipped = 0;
  let failed = 0;

  for (const user of candidates) {
    if (deleted >= MAX_PURGE_PER_RUN) break;
    try {
      // Poistka: tréner s klientmi alebo klient spárovaný s trénerom — nemazať.
      const { count: trained, error: e1 } = await admin
        .from("clients").select("id", { count: "exact", head: true }).eq("trainer_id", user.id);
      const { count: paired, error: e2 } = await admin
        .from("clients").select("id", { count: "exact", head: true }).eq("user_id", user.id).not("trainer_id", "is", null);
      if (e1 || e2) throw new Error((e1 ?? e2)!.message);
      if ((trained ?? 0) > 0 || (paired ?? 0) > 0) { skipped++; continue; }

      if (dry) { deleted++; continue; }

      // Mazanie je nevratné: tesne pred ním znova načítať aktuálny stav účtu (medzi zoznamom
      // a týmto momentom mohol človek e-mail overiť alebo sa prihlásiť).
      const { data: fresh, error: fe } = await admin.auth.admin.getUserById(user.id);
      if (fe || !fresh?.user) throw new Error(fe?.message ?? "user not found");
      if (!isPurgeableUnconfirmedUser(fresh.user, new Date())) { skipped++; continue; }

      const { error: ce } = await admin.from("clients").delete().eq("user_id", user.id).is("trainer_id", null);
      if (ce) throw new Error(ce.message);
      const { error: de } = await admin.auth.admin.deleteUser(user.id);
      if (de) throw new Error(de.message);
      deleted++;
    } catch (err) {
      failed++;
      console.error("cron.unconfirmed-purge: user", user.id, err instanceof Error ? err.message : "error");
    }
  }

  // V dry režime `deleted` = koľko by sa zmazalo.
  return NextResponse.json(
    { scanned, candidates: candidates.length, deleted, skipped, failed, dry },
    { headers: { "Cache-Control": "no-store" } },
  );
}
