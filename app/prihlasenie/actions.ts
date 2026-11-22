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

import { syncLocaleCookieFromProfile } from "@/lib/i18n/sync";
import { getUserLocale } from "@/lib/i18n/server";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { TERMS_VERSION } from "@/lib/legal/terms";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { verifyTurnstile, isHoneypotTripped } from "@/lib/turnstile";
import { checkPassword } from "@/lib/passwordStrength";
import { getTranslations } from "next-intl/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { isCompleteSignupCode, normalizeSignupCode } from "@/lib/auth/signupCode";

export interface LoginState {
  error: string | null;
  redirectTo: string | null;
  /** správne heslo, ale neoverený e-mail — poslali sme nový kód, appka ukáže krok s kódom */
  needsCode?: boolean;
  email?: string;
}

export interface RegisterState {
  error: string | null;
  redirectTo: string | null;
  needsConfirm: boolean;
  /** pri `needsConfirm` — na ktorý e-mail odišiel kód */
  email?: string;
}

export interface VerifyCodeState {
  error: string | null;
  redirectTo: string | null;
}

export interface ResendCodeState {
  error: string | null;
  /** o koľko sekúnd sa dá poslať ďalší kód */
  cooldown: number;
}

/** Chybové hlášky v jazyku používateľa (messages/<jazyk>/auth.json → errors). Registrácia
 *  už použitého e-mailu (emailInUse) je výslovná (požiadavka produktu), zisťovanie účtov
 *  brzdí Turnstile a rate limit Supabase. */
async function authErrors() {
  const t = await getTranslations("auth.errors");
  return {
    GENERIC_ERROR: t("generic"),
    LOCKOUT_ERROR: t("lockout"),
    CAPTCHA_ERROR: t("captcha"),
    REGISTER_GENERIC_ERROR: t("registerGeneric"),
    EMAIL_IN_USE_ERROR: t("emailInUse"),
    t,
  };
}

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
  const { GENERIC_ERROR, LOCKOUT_ERROR, CAPTCHA_ERROR, t } = await authErrors();
  // Honeypot skôr než čokoľvek iné — bot dostane rovnakú generickú chybu ako
  // zlé heslo, žiadny odlišný signál, ktorý by mu prezradil, že bol odhalený.
  if (isHoneypotTripped(formData)) return { error: GENERIC_ERROR, redirectTo: null };

  const email = ((formData.get("email") as string | null) ?? "").trim();
  const password = (formData.get("password") as string | null) ?? "";
  if (!email || !password) return { error: t("fillEmailPassword"), redirectTo: null };
  if (email.length > MAX_INPUT_LENGTH || password.length > 1024) return { error: GENERIC_ERROR, redirectTo: null };

  const ip = await clientIp();
  const turnstileToken = (formData.get("turnstile_token") as string | null) ?? "";
  const turnstile = await verifyTurnstile(turnstileToken, ip === "unknown" ? null : ip);
  if (!turnstile.ok) return { error: CAPTCHA_ERROR, redirectTo: null };

  const supabase = await createClient();

  const ipHash = shortHash(ip);
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
  // Neoverený e-mail: Supabase to hlási len pri SPRÁVNOM hesle — nie je to zlý pokus.
  // Pošleme nový kód a appka ukáže krok s kódom (overenie e-mailu prihlási).
  if (error && (error.code === "email_not_confirmed" || /email not confirmed/i.test(error.message))) {
    await supabase.auth.resend({ type: "signup", email });
    return { error: null, redirectTo: null, needsCode: true, email };
  }
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
    // Až po odoslaní odpovede (after) — presmerovanie na to nemusí čakať.
    after(async () => {
      await Promise.all([ids.email, ids.pair].map((id) => admin.rpc("clear_login_attempts", { p_identifier: id })));
    });
  }

  return { error: null, redirectTo: await afterSignIn(supabase, data.user) };
}

/**
 * Spoločné kroky po prihlásení (heslo aj overenie kódu z registrácie): jazyk účtu → cookie,
 * klientovi poistka `clients` riadku + starý pozývací kód. Vráti cieľ presmerovania podľa roly.
 */
async function afterSignIn(supabase: SupabaseClient, user: User): Promise<string> {
  const [{ data: profile }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    // jazyk účtu → cookie (feature/cestina), nech appka hovorí jazykom účtu aj na novom zariadení
    syncLocaleCookieFromProfile(supabase, user.id),
  ]);

  if (profile?.role === "client") {
    // Poistka: každý klient má mať vlastný `clients` riadok + kód (feature/registracia-update).
    // Normálne ho vytvorí DB trigger pri registrácii, ale účet mohol vzniknúť inak
    // (Dashboard "Add user", starší účet pred migráciou 0032) — RPC je idempotentné,
    // vráti existujúci riadok alebo dovytvorí chýbajúci.
    await supabase.rpc("ensure_self_client");

    // Doklaimovanie starého pozývacieho kódu, ak zostal z pôvodného flow (backward compat).
    const inviteCode = user.user_metadata?.invite_code as string | undefined;
    if (inviteCode && inviteCode.length <= 64) {
      await supabase.rpc("claim_client_by_invite", { p_invite_code: inviteCode });
    }
  }

  return profile?.role === "client" ? "/portal" : "/dashboard";
}

/**
 * Registrácia cez Server Action (feature/security) — predtým bežala priamo z
 * prehliadača (`supabase.auth.signUp` v page.tsx), server o pokuse vôbec
 * nevedel, takže sa nedala chrániť Turnstile/honeypotom rovnako ako prihlásenie.
 * Kontrola sily hesla beží aj tu (nielen na klientovi) — priame volanie tejto
 * akcie (mimo formulára) by inak vedelo obísť klientskú kontrolu úplne.
 */
export async function registerAction(_prevState: RegisterState, formData: FormData): Promise<RegisterState> {
  const { REGISTER_GENERIC_ERROR, CAPTCHA_ERROR, EMAIL_IN_USE_ERROR, t } = await authErrors();
  if (isHoneypotTripped(formData)) return { error: REGISTER_GENERIC_ERROR, redirectTo: null, needsConfirm: false };

  const name = ((formData.get("name") as string | null) ?? "").trim();
  const email = ((formData.get("email") as string | null) ?? "").trim();
  const password = (formData.get("password") as string | null) ?? "";
  const role = (formData.get("role") as string | null) === "client" ? "client" : "trainer";
  if (!name || !email || !password) {
    return { error: t("fillRequired"), redirectTo: null, needsConfirm: false };
  }
  // súhlas s podmienkami kontroluje aj server (nielen prehliadač) — zapíše sa s verziou (0063)
  if (formData.get("terms") !== "on") {
    return { error: (await getTranslations("auth"))("termsRequired"), redirectTo: null, needsConfirm: false };
  }
  if (name.length > MAX_INPUT_LENGTH || email.length > MAX_INPUT_LENGTH || password.length > 1024) {
    return { error: REGISTER_GENERIC_ERROR, redirectTo: null, needsConfirm: false };
  }

  const pwCheck = checkPassword(password, [name, email.split("@")[0] ?? ""]);
  const tp = await getTranslations("password");
  if (!pwCheck.ok) {
    return {
      error: pwCheck.issues[0] ? tp(`issue.${pwCheck.issues[0]}`) : tp("fallback"),
      redirectTo: null,
      needsConfirm: false,
    };
  }

  const ip = await clientIp();
  const turnstileToken = (formData.get("turnstile_token") as string | null) ?? "";
  const turnstile = await verifyTurnstile(turnstileToken, ip === "unknown" ? null : ip);
  if (!turnstile.ok) return { error: CAPTCHA_ERROR, redirectTo: null, needsConfirm: false };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    // locale: jazyk profilu (0059, handle_new_user) aj potvrdzovacieho e-mailu (docs/email-templates)
    // terms_version: súhlas s touto verziou podmienok (0063, handle_new_user ho zapíše do profilu)
    options: { data: { full_name: name, role, locale: await getUserLocale(), terms_version: TERMS_VERSION } },
  });
  // E-mail už má účet: s potvrdzovaním e-mailu Supabase nevráti chybu, ale „falošného“
  // používateľa bez identít (ochrana pred zisťovaním účtov) — appka by ukázala „skontroluj
  // si e-mail“. Bez potvrdzovania príde chyba „User already registered“. Oboje = jasná hláška.
  const emailTaken =
    (error && (error.code === "user_already_exists" || error.message === "User already registered")) ||
    (!error && data.user && (data.user.identities?.length ?? 1) === 0);
  if (emailTaken) {
    return { error: EMAIL_IN_USE_ERROR, redirectTo: null, needsConfirm: false };
  }
  if (error) {
    const msg = error.message.toLowerCase();
    return {
      error: msg.includes("rate limit")
            ? t("registerRateLimit")
            : msg.includes("password")
              ? (await getTranslations("password"))("fallback")
              : REGISTER_GENERIC_ERROR,
      redirectTo: null,
      needsConfirm: false,
    };
  }

  if (!data.session) {
    // Predvolené nastavenie Supabase: treba potvrdiť e-mail skôr, než vznikne session —
    // prišiel kód (šablóna Confirm signup), appka ukáže krok s kódom.
    return { error: null, redirectTo: null, needsConfirm: true, email };
  }

  return { error: null, redirectTo: role === "client" ? "/portal" : "/dashboard", needsConfirm: false };
}

const MAX_CODE_PER_EMAIL = 5;
const MAX_CODE_PER_IP = 30;
const MAX_RESEND_PER_EMAIL = 5;

/**
 * Overenie e-mailu kódom z registrácie (feature/overenie-kodom). Správny kód e-mail potvrdí
 * a vytvorí session — rovno prihlási (klient → /portal, tréner → /dashboard). Hádanie
 * 6 číslic brzdí lockout (0028/0036: počítadlá v 15-min okne) na e-mail aj IP.
 */
export async function verifySignupCodeAction(rawEmail: string, rawCode: string): Promise<VerifyCodeState> {
  const t = await getTranslations("auth.verify");
  const email = (typeof rawEmail === "string" ? rawEmail : "").trim().toLowerCase();
  const code = normalizeSignupCode(typeof rawCode === "string" ? rawCode : "");
  if (!email || email.length > MAX_INPUT_LENGTH || !isCompleteSignupCode(code)) {
    return { error: t("codeIncomplete"), redirectTo: null };
  }

  const ipHash = shortHash(await clientIp());
  const ids = { email: `otp:${shortHash(email)}`, ip: `otp-ip:${ipHash}` };
  const admin = tryCreateAdminClient();
  if (admin) {
    const [byEmail, byIp] = await Promise.all([
      admin.rpc("check_login_lockout", { p_identifier: ids.email, p_max: MAX_CODE_PER_EMAIL }),
      admin.rpc("check_login_lockout", { p_identifier: ids.ip, p_max: MAX_CODE_PER_IP }),
    ]);
    if (byEmail.data === true || byIp.data === true) return { error: t("lockout"), redirectTo: null };
  }

  const supabase = await createClient();
  // typ „email“ overí aj kód z registrácie (Confirm signup) — overené proti Supabase
  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error || !data.user) {
    if (admin) await Promise.all([ids.email, ids.ip].map((id) => admin.rpc("record_failed_login", { p_identifier: id })));
    return { error: t("codeInvalid"), redirectTo: null };
  }
  if (admin) after(async () => void (await admin.rpc("clear_login_attempts", { p_identifier: ids.email })));

  return { error: null, redirectTo: await afterSignIn(supabase, data.user) };
}

/**
 * Nový kód na overenie e-mailu. Odpoveď neprezrádza, či účet existuje; Supabase pošle
 * na jeden e-mail najviac jeden kód za minútu (429 „after N seconds“ → odpočet), navyše
 * najviac MAX_RESEND_PER_EMAIL za 15 minút (lockout počítadlo).
 */
export async function resendSignupCodeAction(rawEmail: string): Promise<ResendCodeState> {
  const t = await getTranslations("auth.verify");
  const email = (typeof rawEmail === "string" ? rawEmail : "").trim().toLowerCase();
  if (!email || email.length > MAX_INPUT_LENGTH) return { error: t("resendFailed"), cooldown: 0 };

  const key = `otp-resend:${shortHash(email)}`;
  const admin = tryCreateAdminClient();
  if (admin) {
    const { data: limited } = await admin.rpc("check_login_lockout", { p_identifier: key, p_max: MAX_RESEND_PER_EMAIL });
    if (limited === true) return { error: t("resendLimit"), cooldown: 0 };
    await admin.rpc("record_failed_login", { p_identifier: key });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({ type: "signup", email });
  if (error) {
    const wait = error.message.match(/after (\d+) seconds?/);
    if (error.status === 429 && wait) return { error: null, cooldown: Number(wait[1]) };
    if (error.status === 429 || /rate limit/i.test(error.message)) return { error: t("resendLimit"), cooldown: 0 };
    // iné chyby (napr. e-mail už overený / neexistuje) — neutrálne, bez prezradenia účtu
  }
  return { error: null, cooldown: 60 };
}

/**
 * Pred odoslaním "Zabudnuté heslo": jazyk e-mailu má byť ten, ktorý je práve zvolený na
 * webe (prepínač SK/CZ), nie ten, s ktorým sa účet kedysi registroval. Šablóna Reset
 * Password vyberá text podľa user_metadata.locale (docs/email-templates), tak ho tu
 * zosúladíme s jazykom webu. Nič nevracia — neprezrádza, či účet s e-mailom existuje.
 */
export async function syncRecoveryLocaleAction(rawEmail: unknown): Promise<void> {
  if (typeof rawEmail !== "string") return;
  const email = rawEmail.trim().toLowerCase();
  if (!email || email.length > MAX_INPUT_LENGTH) return;
  const admin = tryCreateAdminClient();
  if (!admin) return;

  const [locale, { data: profile }] = await Promise.all([
    getUserLocale(),
    admin.from("profiles").select("id").eq("email", email).maybeSingle(),
  ]);
  if (!profile) return;

  const { data: existing } = await admin.auth.admin.getUserById(profile.id);
  const meta = existing.user?.user_metadata ?? {};
  if (meta.locale === locale) return;
  const { error } = await admin.auth.admin.updateUserById(profile.id, { user_metadata: { ...meta, locale } });
  if (error) console.error("syncRecoveryLocaleAction:", error.message);
}
