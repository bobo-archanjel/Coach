import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "FitPilot",
  description: "AI-native platforma pre fitness trénerov a ich klientov — tréning, výživa, komunikácia, rast.",
};

// viewportFit: "cover" umožňuje env(safe-area-inset-*) — potrebné pre fixnú
// bottom tab bar na dashboarde (notch/home indicator na telefónoch).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: niektoré browser extensions (napr. prekladače) vkladajú
    // vlastné atribúty do <html> pred hydratáciou (napr. webcrx-bridged) — nie je to náš bug.
    <html lang="sk" suppressHydrationWarning>
      <body className={inter.variable}>{children}</body>
    </html>
  );
}
