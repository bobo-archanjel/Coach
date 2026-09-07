// See the IMPECCABLE DIRECTION CONTRACT at the top of ./V2Experience.tsx for
// this rebuild's thesis, form, and finish notes.
import type { Metadata } from "next";
import { V2Experience } from "./V2Experience";

export const metadata: Metadata = {
  title: "FitPilot — náhľad v2 (interné testovanie)",
  robots: { index: false, follow: false },
};

export default function LandingV2() {
  return <V2Experience />;
}
