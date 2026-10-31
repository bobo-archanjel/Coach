import { signOutAction } from "./actions";

/**
 * Server Component + form action (nie "use client" + browser Supabase SDK —
 * viď actions.ts) — odhlásenie nepotrebuje žiadny client-side JS, funguje aj
 * bez hydratácie.
 */
export function SignOutButton({ to }: { to?: string }) {
  return (
    <form action={signOutAction}>
      {/* dizajnový experiment v6 → späť na jeho prihlásenie (actions.ts povolí len známe cesty) */}
      {to && <input type="hidden" name="to" value={to} />}
      <button type="submit" className="btn btn-ghost">
        Odhlásiť sa
      </button>
    </form>
  );
}
