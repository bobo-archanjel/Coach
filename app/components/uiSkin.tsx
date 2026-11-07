"use client";

import { createContext, useContext, type ReactNode } from "react";

/* Vymeniteľný vzhľad prihlásenia bez zmeny správania: AuthView je zdieľaný medzi
   /prihlasenie (pôvodný vzhľad) a /v6design/prihlasenie (nový dizajn) a štýly si berie
   cez useSkinStyles("auth", predvolený modul). /v6design/prihlasenie ho obalí
   providerom s vlastným CSS modulom s rovnakými názvami tried (V6AuthSkin).
   Appka po prihlásení (dashboard, portál) má už len jeden dizajn a štýly importuje priamo. */

export type CssModule = { readonly [key: string]: string };
export type SkinNamespace = "auth";

type Skin = { styles: Partial<Record<SkinNamespace, CssModule>> };

const SkinContext = createContext<Skin>({ styles: {} });

export function SkinProvider({ skin, children }: { skin: Skin; children: ReactNode }) {
  return <SkinContext.Provider value={skin}>{children}</SkinContext.Provider>;
}

/** CSS modul pre daný menný priestor — prepísaný providerom, inak predvolený. */
export function useSkinStyles<T extends CssModule>(namespace: SkinNamespace, defaults: T): T {
  return (useContext(SkinContext).styles[namespace] as T | undefined) ?? defaults;
}
