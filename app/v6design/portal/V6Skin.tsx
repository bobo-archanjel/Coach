"use client";

import type { ReactNode } from "react";
import { SkinProvider } from "@/app/components/uiSkin";
import portal from "./styles/portal.module.css";
import builder from "./styles/builder.module.css";
import chat from "./styles/chat.module.css";
import exerciseDetail from "./styles/exerciseDetail.module.css";
import exerciseThumb from "./styles/exerciseThumb.module.css";

/* Komponenty portálu (tie isté ako na /portal) dostanú pod /v6design štýly
   nového dizajnu a cesty /v6design/portal — správanie aj flow ostávajú ich. */
const V6_SKIN = {
  styles: { portal, builder, chat, exerciseDetail, exerciseThumb },
  portalBase: "/v6design/portal",
};

export function V6Skin({ children }: { children: ReactNode }) {
  return <SkinProvider skin={V6_SKIN}>{children}</SkinProvider>;
}
