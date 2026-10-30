"use client";

import { createContext, useContext, type ReactNode } from "react";

/* Vymeniteľný vzhľad bez zmeny správania (dizajnový experiment /v6design).
   Komponenty portálu (a zdieľané komponenty, ktoré portál používa) si štýly berú
   cez useSkinStyles(menný priestor, predvolený CSS modul). Mimo <SkinProvider>
   dostanú svoj pôvodný modul a pôvodnú cestu "/portal" — existujúca appka sa
   nemení. /v6design obalí portál providerom s vlastnými CSS modulmi s rovnakými
   názvami tried, takže tlačidlá, stavy aj flow sú tie isté komponenty. Dashboard
   rovnako, len skin vyberá cookie (app/dashboard/dashSkin.ts), nie adresa. */

export type CssModule = { readonly [key: string]: string };
export type SkinNamespace =
  | "portal"
  | "builder"
  | "chat"
  | "exerciseDetail"
  | "exerciseThumb"
  | "dashboard"
  | "mealBuilder"
  | "completed"
  | "infoTip";

type Skin = {
  styles: Partial<Record<SkinNamespace, CssModule>>;
  /** základ ciest portálu pre odkazy v zdieľaných komponentoch */
  portalBase: string;
};

const DEFAULT_SKIN: Skin = { styles: {}, portalBase: "/portal" };
const SkinContext = createContext<Skin>(DEFAULT_SKIN);

export function SkinProvider({ skin, children }: { skin: Skin; children: ReactNode }) {
  return <SkinContext.Provider value={skin}>{children}</SkinContext.Provider>;
}

/** CSS modul pre daný menný priestor — prepísaný providerom, inak predvolený. */
export function useSkinStyles<T extends CssModule>(namespace: SkinNamespace, defaults: T): T {
  return (useContext(SkinContext).styles[namespace] as T | undefined) ?? defaults;
}

/** "/portal" alebo "/v6design/portal" — pre odkazy a návraty v zdieľaných komponentoch. */
export function usePortalBase(): string {
  return useContext(SkinContext).portalBase;
}
