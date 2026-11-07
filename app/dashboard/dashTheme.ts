import { cache } from "react";
import { cookies } from "next/headers";
import { V6_THEME_COOKIE, parseV6Theme, type V6Theme } from "@/app/v6design/theme";

/** Téma dashboardu (svetlá/tmavá/auto) — tá istá cookie ako portál a prihlásenie v6. */
export const v6Theme = cache(async (): Promise<V6Theme> => {
  return parseV6Theme((await cookies()).get(V6_THEME_COOKIE)?.value);
});
