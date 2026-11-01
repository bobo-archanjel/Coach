import { cache } from "react";
import { cookies } from "next/headers";
import { DASH_SKIN_COOKIE, V6_THEME_COOKIE, parseV6Theme, type V6Theme } from "@/app/v6design/theme";
import dashboardStyles from "./dashboard.module.css";
import completedDefault from "./klienti/[id]/treningy/[logId]/completed.module.css";
import v6Dashboard from "@/app/v6design/dashboard/styles/dashboard.module.css";
import v6Completed from "@/app/v6design/dashboard/styles/completed.module.css";

/* Vzhľad dashboardu pre serverové komponenty (stránky, layout). Klientske komponenty
   dostanú ten istý výber cez SkinProvider (useSkinStyles) — layout ho nasadí, keď je
   zapnutý dizajnový experiment v6 (cookie fp-dash-skin, app/v6design/dashboard).
   Bez cookie vráti pôvodné moduly — existujúci dashboard sa nemení. */

export const isV6Dashboard = cache(async (): Promise<boolean> => {
  return (await cookies()).get(DASH_SKIN_COOKIE)?.value === "v6";
});

/** téma v6 (svetlá/tmavá/auto) — rovnaká cookie ako portál v6 */
export const v6Theme = cache(async (): Promise<V6Theme> => {
  return parseV6Theme((await cookies()).get(V6_THEME_COOKIE)?.value);
});

export async function dashStyles(): Promise<typeof dashboardStyles> {
  return (await isV6Dashboard()) ? v6Dashboard : dashboardStyles;
}

export async function completedStyles(): Promise<typeof completedDefault> {
  return (await isV6Dashboard()) ? v6Completed : completedDefault;
}
