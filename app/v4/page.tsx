import type { Metadata } from "next";
import { V4Experience } from "./V4Experience";

export const metadata: Metadata = {
  title: "FitPilot — náhľad v4 (interné testovanie)",
  robots: { index: false, follow: false },
};

export default function V4Page() {
  return <V4Experience />;
}
