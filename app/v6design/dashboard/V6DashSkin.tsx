"use client";

import type { ReactNode } from "react";
import { SkinProvider } from "@/app/components/uiSkin";
import dashboard from "./styles/dashboard.module.css";
import builder from "./styles/builder.module.css";
import mealBuilder from "./styles/mealBuilder.module.css";
import completed from "./styles/completed.module.css";
import infoTip from "./styles/infoTip.module.css";
import templates from "./styles/templates.module.css";
import clientPicker from "./styles/clientPicker.module.css";

/* Klientske komponenty dashboardu (tie isté ako bez skinu) dostanú štýly v6 —
   layout /dashboard ho nasadí len pri zapnutom experimente (cookie fp-dash-skin). */
const V6_DASH_SKIN = {
  styles: { dashboard, builder, mealBuilder, completed, infoTip, templates, clientPicker },
  portalBase: "/portal",
};

export function V6DashSkin({ children }: { children: ReactNode }) {
  return <SkinProvider skin={V6_DASH_SKIN}>{children}</SkinProvider>;
}
