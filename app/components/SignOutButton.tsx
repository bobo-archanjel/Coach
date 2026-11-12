import { signOutAction } from "./actions";
import { getTranslations } from "next-intl/server";

/**
 * Server Component + form action (nie "use client" + browser Supabase SDK —
 * viď actions.ts) — odhlásenie nepotrebuje žiadny client-side JS, funguje aj
 * bez hydratácie.
 */
export async function SignOutButton() {
  const t = await getTranslations("components");
  return (
    <form action={signOutAction}>
      <button type="submit" className="btn btn-ghost">
        {t("signOut")}
      </button>
    </form>
  );
}
