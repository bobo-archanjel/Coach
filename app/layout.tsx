import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-inter",
  display: "swap",
});

// feature/security#2 — SEO/social metadata sa predtým riešilo len jedným
// statickým title/description v celej appke. `metadataBase` + `openGraph`/
// `twitter` tu sú DEFAULTY, ktoré verejné stránky (landing, /prihlasenie,
// právne stránky) môžu prebiť vlastným `export const metadata` — dashboard/
// portal (za loginom) sa o SEO nestarajú, dedia len title (kartička v
// prehliadači), nič viac netreba.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://fitpilot.sk";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "FitPilot", template: "%s · FitPilot" },
  description: "AI-native platforma pre fitness trénerov a ich klientov — tréning, výživa, komunikácia, rast.",
  openGraph: {
    siteName: "FitPilot",
    locale: "sk_SK",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "FitPilot — tréning, výživa, AI kouč" }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og-image.png"],
  },
};

// viewportFit: "cover" umožňuje env(safe-area-inset-*) — potrebné pre fixnú
// bottom tab bar na dashboarde (notch/home indicator na telefónoch).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const plausibleDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: niektoré browser extensions (napr. prekladače) vkladajú
    // vlastné atribúty do <html> pred hydratáciou (napr. webcrx-bridged) — nie je to náš bug.
    <html lang="sk" suppressHydrationWarning>
      <body className={inter.variable}>
        {children}
        {/* Plausible (feature/security#2) — cookieless, žiadne osobné údaje, preto
            bez cookie banneru. Načíta sa len keď je nastavená doména (env), nech appka
            pred založením účtu na plausible.io neposiela requesty nikam navyše. */}
        {plausibleDomain && (
          <Script
            defer
            data-domain={plausibleDomain}
            src="https://plausible.io/js/script.js"
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  );
}
