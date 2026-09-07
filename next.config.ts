import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Default ("loose") CSS chunking duplikoval celý portal.module.css (64 kB)
  // do KAŽDÉHO page-level CSS chunku popri layout.css, ktorý ho už obsahuje —
  // /portal/trening tak sťahoval 128 kB CSS namiesto 64 kB (viď commit). "strict"
  // drží chunky presne podľa poradia importov namiesto zlučovania do bežných
  // skupín, čím sa táto duplicita neobjavuje.
  experimental: {
    cssChunking: "strict",
  },
  images: {
    // Obrázky cvikov z Free Exercise DB (scripts/import-exercises.mjs) — len
    // externé URL, žiadne kopírovanie do Supabase Storage (šetrí 2 GB free
    // tier). Namiesto `unoptimized` necháme Next optimalizátor stiahnuť
    // originál raz, zresizovať na skutočne potrebnú veľkosť a skonvertovať
    // na WebP — menší prenos aj menej requestov na GitHub. Tieto obrázky sa
    // nikdy nemenia (statická knižnica cvikov), takže dlhý cache TTL je bezpečný.
    remotePatterns: [{ protocol: "https", hostname: "raw.githubusercontent.com" }],
    minimumCacheTTL: 2678400, // 31 dní
  },

  // feature/optimalizacia (security audit) — predtým žiadne security headers.
  // CSP tu nejde na plný nonce-based strict-dynamic (vyžadovalo by to nonce
  // injektovaný cez middleware do každej stránky — väčší zásah, momentálne
  // middleware zámerne beží len na /dashboard a /portal, viď middleware.ts),
  // ale aj takto zužuje odkiaľ appka smie načítať/odoslať dáta a bráni
  // clickjackingu/MIME-sniffingu bez rizika rozbitia Next hydratácie
  // (tá potrebuje 'unsafe-inline' pre script-src, keďže nepoužívame nonce).
  async headers() {
    // Next dev server kompiluje s eval-based source mapmi (fast refresh) — bez
    // 'unsafe-eval' v dev móde CSP zhodí KAŽDÚ stránku hneď pri hydratácii
    // (zistené e2e sadou po prvom nasadení tejto CSP — 25 zlyhaní namiesto
    // obvyklých 8). Produkčný build eval nepoužíva, tam zostáva prísne.
    // Plausible (feature/security#2) — script aj beacon idú na ich vlastnú
    // doménu, treba explicitne povoliť v CSP, inak by script-src/connect-src
    // tichým zamietnutím zablokoval analytics bez akejkoľvek chyby v konzole.
    const scriptSrc = process.env.NODE_ENV === "production"
      ? "'self' 'unsafe-inline' https://plausible.io"
      : "'self' 'unsafe-inline' 'unsafe-eval' https://plausible.io";
    const csp = [
      "default-src 'self'",
      `script-src ${scriptSrc}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://raw.githubusercontent.com",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co https://plausible.io",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
