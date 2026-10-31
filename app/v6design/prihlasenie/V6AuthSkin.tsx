"use client";

import type { ReactNode } from "react";
import { SkinProvider } from "@/app/components/uiSkin";
import auth from "./styles/auth.module.css";

/* Formulár prihlásenia (ten istý AuthView ako na /prihlasenie) dostane štýly v6
   a po prihlásení pošle klienta do /v6design/portal, trénera cez /v6design/dashboard
   (zapne v6 dashboard a otvorí /dashboard). */
const V6_AUTH_SKIN = {
  styles: { auth },
  portalBase: "/v6design/portal",
  dashboardEntry: "/v6design/dashboard",
};

export function V6AuthSkin({ children }: { children: ReactNode }) {
  return <SkinProvider skin={V6_AUTH_SKIN}>{children}</SkinProvider>;
}
