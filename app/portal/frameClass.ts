import type { FrameId } from "@/lib/gamification/rewards";
import g2 from "../components/gamificationV2.module.css";

/** CSS trieda rámika avatara (prázdna pre „none“). Zdieľa ju hlavička portálu aj náhľady vo výbere odmien. */
export function frameClassName(frame: FrameId): string {
  switch (frame) {
    case "ember":
      return `${g2.frame} ${g2.frameEmber}`;
    case "mint":
      return `${g2.frame} ${g2.frameMint}`;
    case "steel":
      return `${g2.frame} ${g2.frameSteel}`;
    case "gold":
      return `${g2.frame} ${g2.frameGold}`;
    case "aurora":
      return `${g2.frame} ${g2.frameAurora}`;
    case "prism":
      return `${g2.frame} ${g2.framePrism}`;
    case "olympus":
      return `${g2.frame} ${g2.frameOlympus}`;
    default:
      return "";
  }
}

export const FRAME_TINTED_CLASS = g2.frameTinted;
