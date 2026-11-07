import type { Metadata } from "next";

// Sekcia „Jedálničky“ (predtým „Výživa“ na /dashboard/vyziva — trvalý redirect v next.config.ts).
export const metadata: Metadata = {
  title: "FitPilot — Jedálničky",
};

export default function JedalnickyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
