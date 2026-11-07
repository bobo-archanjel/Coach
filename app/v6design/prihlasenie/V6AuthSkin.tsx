"use client";

import type { ReactNode } from "react";
import { SkinProvider } from "@/app/components/uiSkin";
import auth from "./styles/auth.module.css";

/* Formulár prihlásenia (ten istý AuthView ako na /prihlasenie) dostane štýly v6. */
const V6_AUTH_SKIN = { styles: { auth } };

export function V6AuthSkin({ children }: { children: ReactNode }) {
  return <SkinProvider skin={V6_AUTH_SKIN}>{children}</SkinProvider>;
}
