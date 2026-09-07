import type { Metadata } from "next";

export const metadata: Metadata = {
  // Plain string tu prechádza cez title.template z root layout.tsx ("%s · FitPilot")
  // — nepridávať "FitPilot" manuálne, inak vznikne duplicita ("FitPilot — X · FitPilot").
  title: "Prihlásenie",
  description: "Prihlás sa do svojho trénerského konta alebo si vytvor nový účet na FitPilot — 14 dní zadarmo.",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
