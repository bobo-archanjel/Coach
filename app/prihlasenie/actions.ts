"use server";

// FitPilot — prihlásenie cez Server Action (feature/optimalizacia, security audit;
// prepracované v feature/security). Prihlásenie predtým bežalo priamo z prehliadača,
// náš server request nevidel, takže sa nedal ani rate-limitovať. Server Action
// presúva rozhodovanie na server: kontrola zámku PRED pokusom, jedna generická
// chybová správa nezávisle od dôvodu zlyhania (žiadna enumerácia účtov), zápis
// neúspechu, vyčistenie počítadla po úspechu.
//
// Lockout funkcie (0036) smie volať iba server so service role — predtým boli
// dostupné anonymne cez verejný anon kľúč, takže ktokoľvek vedel cudzí účet zamknúť
// alebo počítadlo vynulovať. Tri nezávislé počítadlá:
//  - per e-mail (vyššia hranica) — bráni distribuovanému hádaniu hesla jedného účtu,
//  - per e-mail + IP (nízka hranica) — cieľový útočník z jednej adresy,
//  - per IP (vysoká hranica) — credential stuffing naprieč mnohými účtami.
// Zámok jednej IP+e-mailu tak nezamkne obeť pred jej vlastnou adresou.
//
// Pozn.: IP sa berie z x-forwarded-for/x-real-ip (za reverzným proxy dôveryhodné,
// inak spoofovateľné) a ukladá sa len ako skrátený SHA-256 (žiadne surové IP),
// záznamy sa mažú po dni. Priamy prístup na Supabase Auth API tieto limity NEobchádza
// len vďaka nastaveniam projektu — viď docs/security/SUPABASE_HARDENING.md.

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { tryCreateAdminClient } from "@/lib/supabase/admin";

export interface LoginState {
  error: string | null;
  redirectTo: string | null;
}

const GENERIC_ERROR = "Nesprávny e-mail alebo heslo.";
const LOCKOUT_ERROR = "Príliš veľa neúspešných pokusov. Skús to znova o 15 minút, alebo si obnov heslo.";

const MAX_PER_EMAIL = 10;
const MAX_PER_EMAIL_AND_IP = 5;
const MAX_PER_IP = 30;
/** Rozumný strop dĺžky vstupov — nezahlcuje DB ani hashovanie zbytočne dlhými reťazcami. */
const MAX_INPUT_LENGTH = 320;

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip")?.trim() || "unknown";
}

export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = ((formData.get("email") as string | null) ?? "").trim();
  const password = (formData.get("password") as string | null) ?? "";
  if (!email || !password) return { error: "Vyplň e-mail aj heslo.", redirectTo: null };
  if (email.length > MAX_INPUT_LENGTH || password.length > 1024) return { error: GENERIC_ERROR, redirectTo: null };

  const supabase = await createClient();

  const ipHash = shortHash(await clientIp());
  const emailKey = email.toLowerCase();
  const ids = {
    email: emailKey,
    pair: `pair:${shortHash(emailKey)}:${ipHash}`,
    ip: `ip:${ipHash}`,
  };

  // Lockout je "best effort": ak chýba service role kľúč alebo RPC zlyhá (napr. migrácia
  // 0036 ešte nebola spustená), appka degraduje na prihlásenie BEZ lockoutu (ostáva
  // ochrana Supabase Auth), nezablokuje ho — ale chybu nahlási do logu.
  const admin = tryCreateAdminClient();
  if (admin) {
    const [byEmail, byPair, byIp] = await Promise.all([
      admin.rpc("check_login_lockout", { p_identifier: ids.email, p_max: MAX_PER_EMAIL }),
      admin.rpc("check_login_lockout", { p_identifier: ids.pair, p_max: MAX_PER_EMAIL_AND_IP }),
      admin.rpc("check_login_lockout", { p_identifier: ids.ip, p_max: MAX_PER_IP }),
    ]);
    const firstError = byEmail.error ?? byPair.error ?? byIp.error;
    if (firstError) console.error("check_login_lockout:", firstError.message);
    if (byEmail.data === true || byPair.data === true || byIp.data === true) {
      return { error: LOCKOUT_ERROR, redirectTo: null };
    }
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (admin) {
      await Promise.all(
        [ids.email, ids.pair, ids.ip].map((id) => admin.rpc("record_failed_login", { p_identifier: id })),
      );
    }
    // Jedna správa nezávisle od príčiny (zlé heslo, neexistujúci účet, aj iné Supabase chyby).
    return { error: GENERIC_ERROR, redirectTo: null };
  }

  if (admin) {
    // Po úspechu sa vynuluje počítadlo účtu a dvojice; IP počítadlo ostáva (jedno úspešné
    // prihlásenie nesmie zmazať stopu credential stuffingu z tej istej adresy).
    await Promise.all([ids.email, ids.pair].map((id) => admin.rpc("clear_login_attempts", { p_identifier: id })));
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();

  if (profile?.role === "client") {
    // Poistka: každý klient má mať vlastný `clients` riadok + kód (feature/registracia-update).
    // Normálne ho vytvorí DB trigger pri registrácii, ale účet mohol vzniknúť inak
    // (Dashboard "Add user", starší účet pred migráciou 0032) — RPC je idempotentné,
    // vráti existujúci riadok alebo dovytvorí chýbajúci.
    await supabase.rpc("ensure_self_client");

    // Doklaimovanie starého pozývacieho kódu, ak zostal z pôvodného flow (backward compat).
    const inviteCode = data.user.user_metadata?.invite_code as string | undefined;
    if (inviteCode && inviteCode.length <= 64) {
      await supabase.rpc("claim_client_by_invite", { p_invite_code: inviteCode });
    }
  }

  return { error: null, redirectTo: profile?.role === "client" ? "/portal" : "/dashboard" };
}
