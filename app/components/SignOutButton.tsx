import { signOutAction } from "./actions";
import { getTranslations } from "next-intl/server";
import pa from "./planActions.module.css";
import { ActionSignOutIcon } from "./ActionIcons";

/**
 * Server Component + form action (nie "use client" + browser Supabase SDK —
 * viď actions.ts) — odhlásenie nepotrebuje žiadny client-side JS, funguje aj
 * bez hydratácie.
 */
export async function SignOutButton() {
  const t = await getTranslations("components");
  return (
    <form action={signOutAction}>
      <button type="submit" className={`${pa.action} ${pa.small} ${pa.inline}`}>
        <ActionSignOutIcon />
        {t("signOut")}
      </button>
    </form>
  );
}
