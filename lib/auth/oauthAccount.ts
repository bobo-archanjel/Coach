// FitPilot — rozpoznanie účtu, ktorý vznikol práve týmto OAuth prihlásením (feature/google-rola).
//
// Supabase Auth má pre registráciu aj prihlásenie cez Google jeden endpoint
// (signInWithOAuth) — neexistujúci účet pri „prihlásení“ jednoducho vytvorí. Callback
// podľa tohto rozhodne, či ide o nový účet (pri prihlásení → „nie si zaregistrovaný“).

/** Okno, v ktorom sa účet počíta za vytvorený týmto requestom. */
const FRESH_MS = 60_000;
/** Max. rozdiel vytvorenia účtu a prihlásenia pri úplne prvom prihlásení. */
const FIRST_SIGN_IN_MS = 10_000;

type OAuthUser = { created_at: string; last_sign_in_at?: string | null };

/**
 * `true` = účet vznikol práve teraz (OAuth registrácia). Prihlásenie existujúceho účtu
 * (aj takého, čo vznikol pred pár sekundami a prihlasuje sa znova) má `last_sign_in_at`
 * citeľne neskôr než `created_at`, takže sa za nový nepočíta.
 */
export function isBrandNewOAuthAccount(user: OAuthUser, now: number = Date.now()): boolean {
  const created = new Date(user.created_at).getTime();
  if (!Number.isFinite(created) || now - created >= FRESH_MS) return false;
  if (!user.last_sign_in_at) return true;
  const signedIn = new Date(user.last_sign_in_at).getTime();
  if (!Number.isFinite(signedIn)) return true;
  return Math.abs(signedIn - created) < FIRST_SIGN_IN_MS;
}
