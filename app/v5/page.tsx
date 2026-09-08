import type { Metadata } from "next";
import { V5Experience } from "./V5Experience";

export const metadata: Metadata = {
  title: "FitPilot — náhľad v5 (interné testovanie)",
  robots: { index: false, follow: false },
};

export default function V5Page() {
  return <V5Experience />;
}
