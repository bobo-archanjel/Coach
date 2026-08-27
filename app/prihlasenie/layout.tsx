import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FitPilot — Prihlásenie",
  description: "Prihlás sa do svojho trénerského konta alebo si vytvor nový účet na FitPilot.",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
