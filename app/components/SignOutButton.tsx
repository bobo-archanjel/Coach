import { signOutAction } from "./actions";

/**
 * Server Component + form action (nie "use client" + browser Supabase SDK —
 * viď actions.ts) — odhlásenie nepotrebuje žiadny client-side JS, funguje aj
 * bez hydratácie.
 */
export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <button type="submit" className="btn btn-ghost">
        Odhlásiť sa
      </button>
    </form>
  );
}
