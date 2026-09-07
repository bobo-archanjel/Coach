import type { Metadata } from "next";
import { V3Experience } from "./V3Experience";

export const metadata: Metadata = {
  title: "FitPilot — náhľad v3 (interné testovanie)",
  robots: { index: false, follow: false },
};

export default function LandingV3() {
  return <V3Experience />;
}
