"use server";

// FitPilot — feature/optimalizacia (security audit). Prihlásenie predtým bežalo
// priamo z prehliadača (supabase.auth.signInWithPassword volané z "use client"
// AuthPage) — náš server request vôbec nevidel, takže sa nedal ani rate-limitovať,
// ani počítať zlyhania na account lockout. Server Action presúva rozhodovanie na
// server: kontrola zámku (0028_login_lockout.sql) PRED pokusom, jedna generická
// chybová správa nezávisle od dôvodu zlyhania (žiadna enumerácia účtov cez rôzne
// chybové texty), zápis neúspechu, vyčistenie počítadla po úspechu.

import { createClient } from "@/lib/supabase/server";

export interface LoginState {
  error: string | null;
  redirectTo: string | null;
}

const GENERIC_ERROR = "Nesprávny e-mail alebo heslo.";
const LOCKOUT_ERROR = "Príliš veľa neúspešných pokusov. Skús to znova o 15 minút, alebo si obnov heslo.";

export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = ((formData.get("email") as string | null) ?? "").trim();
  const password = (formData.get("password") as string | null) ?? "";
  if (!email || !password) return { error: "Vyplň e-mail aj heslo.", redirectTo: null };

  const supabase = await createClient();

  const { data: locked, error: lockoutCheckError } = await supabase.rpc("check_login_lockout", {
    p_identifier: email,
  });
  // Zámok nesmie byť "fail closed" pri chybe RPC (napr. migrácia 0028 ešte
  // nebola spustená) — appka má degradovať na "bez lockoutu", nie zablokovať
  // prihlasovanie úplne kvôli chýbajúcej funkcii v DB.
  if (!lockoutCheckError && locked) {
    return { error: LOCKOUT_ERROR, redirectTo: null };
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    await supabase.rpc("record_failed_login", { p_identifier: email }); // RPC vracia {error}, nikdy nehádže
    // Jedna správa nezávisle od príčiny (zlé heslo, neexistujúci účet, aj iné
    // Supabase chyby) — predtým sa pri nerozpoznanej chybe posielal surový
    // error.message ďalej do UI.
    return { error: GENERIC_ERROR, redirectTo: null };
  }

  await supabase.rpc("clear_login_attempts", { p_identifier: email });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();

  if (profile?.role === "client") {
    // Poistka: každý klient má mať vlastný `clients` riadok + kód (feature/registracia-update).
    // Normálne ho vytvorí DB trigger pri registrácii, ale účet mohol vzniknúť inak
    // (Dashboard "Add user", starší účet pred migráciou 0032) — RPC je idempotentné,
    // vráti existujúci riadok alebo dovytvorí chýbajúci.
    await supabase.rpc("ensure_self_client");

    // Doklaimovanie starého pozývacieho kódu, ak zostal z pôvodného flow (backward compat).
    const inviteCode = data.user.user_metadata?.invite_code as string | undefined;
    if (inviteCode) {
      await supabase.rpc("claim_client_by_invite", { p_invite_code: inviteCode });
    }
  }

  return { error: null, redirectTo: profile?.role === "client" ? "/portal" : "/dashboard" };
}
