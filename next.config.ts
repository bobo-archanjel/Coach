import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Jazyky (feature/cestina): next-intl bez i18n routingu, jazyk z cookie — i18n/request.ts
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// Supabase projekt, na ktorý sa smie prehliadač pripájať (REST/Auth/Realtime). Predtým
// `*.supabase.co` — povolilo by odoslať dáta na ĽUBOVOĽNÝ Supabase projekt (kanál na
// exfiltráciu, keby sa podarilo vložiť skript). Host sa berie z env; ak by chýbal
// (napr. build bez env), padá sa späť na wildcard, nie na nefunkčnú appku.
function supabaseConnectHosts(): string {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (url) {
      const host = new URL(url).host;
      return `https://${host} wss://${host}`;
    }
  } catch {
    // neplatná URL → wildcard nižšie
  }
  return "https://*.supabase.co wss://*.supabase.co";
}

const nextConfig: NextConfig = {
  // QA_DIST_DIR (test/qa-dual-agent): umožňuje spustiť viac `next dev` inštancií
  // nad tým istým repom bez toho, aby si navzájom kazili `.next` build cache
  // (súbežný zápis do zdieľaného .next spôsoboval ENOENT/404 pády). Bez env
  // premennej sa správanie vôbec nemení (default ".next").
  ...(process.env.QA_DIST_DIR ? { distDir: process.env.QA_DIST_DIR } : {}),
  // Testovanie na mobile cez LAN IP (`npm run dev:mobile`) — bez toho Next blokuje
  // dev požiadavky (HMR, /_next) z iného originu než localhost. Len dev, produkcia ignoruje.
  // *.trycloudflare.com — HTTPS tunel (`cloudflared tunnel --url http://localhost:3000`),
  // kamera skenera čiarových kódov na telefóne funguje len cez HTTPS.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "*.trycloudflare.com"],
  // Default ("loose") CSS chunking duplikoval celý portal.module.css (64 kB)
  // do KAŽDÉHO page-level CSS chunku popri layout.css, ktorý ho už obsahuje —
  // /portal/trening tak sťahoval 128 kB CSS namiesto 64 kB (viď commit). "strict"
  // drží chunky presne podľa poradia importov namiesto zlučovania do bežných
  // skupín, čím sa táto duplicita neobjavuje.
  experimental: {
    cssChunking: "strict",
    // Klientska router cache pre dynamické stránky (feature/faster-app): návrat na tab,
    // kde používateľ bol pred chvíľou (Dnes ↔ Tréning ↔ Strava, Klienti ↔ detail), sa
    // vykreslí okamžite z pamäte namiesto nového server renderu. Default v Next 15 je 0.
    // Bezpečné, lebo každá zapisujúca server action volá revalidatePath (alebo nastaví
    // cookies pri prihlásení), čo celú túto cache v prehliadači zahodí — vlastné zmeny
    // sú vždy hneď vidieť. Zmeny od druhej strany (tréner ↔ klient) sa na už navštívenej
    // stránke ukážu najneskôr po 30 s; chat má vlastný poll + Realtime.
    staleTimes: {
      dynamic: 30,
    },
  },
  // Hlavička X-Powered-By: Next.js zbytočne prezrádza technológiu (usmerňuje útočníka
  // na známe zraniteľnosti konkrétneho frameworku) — nič nerobí, tak preč.
  poweredByHeader: false,
  // PDF exporty čítajú fonty a logo z disku cez readFileSync(path.join(process.cwd(), ...)) —
  // dynamicky poskladanú cestu Vercel pri pribaľovaní serverless funkcie nevidí, takže na
  // produkcii súbory chýbali a export padal (lokálne fungoval, disk tam je celý).
  outputFileTracingIncludes: {
    "/api/export/**": ["./assets/fonts/*.ttf", "./public/brand/logo-mark.png"],
  },
  // Sekcia „Výživa“ sa premenovala na „Jedálničky“ — staré odkazy (záložky, notifikácie,
  // e-maily) nech trvalo vedú na novú adresu vrátane podstránok (klient, jedálniček).
  async redirects() {
    return [
      { source: "/dashboard/vyziva", destination: "/dashboard/jedalnicky", permanent: true },
      { source: "/dashboard/vyziva/:path*", destination: "/dashboard/jedalnicky/:path*", permanent: true },
      // Nový dizajn portálu bol do 11/2026 dizajnový experiment na /v6design/portal — teraz je
      // jediný a beží na /portal; staré odkazy (záložky) vedú tam.
      { source: "/v6design", destination: "/portal", permanent: true },
      { source: "/v6design/portal", destination: "/portal", permanent: true },
      { source: "/v6design/portal/:path*", destination: "/portal/:path*", permanent: true },
      // Prihlásenie v novom dizajne bolo na /v6design/prihlasenie — od 11/2026 je /prihlasenie.
      { source: "/v6design/prihlasenie", destination: "/prihlasenie", permanent: true },
    ];
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
    // obvyklých 8). Uvoľnené je to VÝHRADNE pri `NODE_ENV === "development"`
    // (feature/security: predtým `!== "production"`, takže chybne nastavené alebo
    // chýbajúce NODE_ENV na serveri by pustilo eval; teraz je predvolené prísne).
    // Plausible (feature/security#2) — script aj beacon idú na ich vlastnú
    // doménu, treba explicitne povoliť v CSP, inak by script-src/connect-src
    // tichým zamietnutím zablokoval analytics bez akejkoľvek chyby v konzole.
    // 'wasm-unsafe-eval' (feature/barcode-scanner) — povolí LEN kompiláciu WebAssembly
    // (ZXing čítačka čiarových kódov z /wasm/, skener v denníku na iPhone), nie eval() JS.
    const isDev = process.env.NODE_ENV === "development";
    // Cloudflare Turnstile (feature/security, bot ochrana na /prihlasenie) —
    // script aj CAPTCHA výzva bežia z challenges.cloudflare.com, treba ich
    // explicitne povoliť v troch smeroch: script-src (načítanie api.js),
    // frame-src (samotný widget je iframe — bez tejto direktívy by spadol pod
    // prísnejší default-src 'self' a nikdy by sa nezobrazil) a connect-src
    // (interná komunikácia widgetu so serverom Cloudflare).
    const scriptSrc = isDev
      ? "'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://plausible.io https://challenges.cloudflare.com"
      : "'self' 'unsafe-inline' 'wasm-unsafe-eval' https://plausible.io https://challenges.cloudflare.com";
    const csp = [
      "default-src 'self'",
      `script-src ${scriptSrc}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://raw.githubusercontent.com",
      // app/v5's scroll-world engine (public/v5/scrub-engine.js) loads each
      // clip as a Blob and assigns it to <video src> for guaranteed
      // seekability regardless of byte-range support — that blob: URL falls
      // under media-src (default-src 'self' has no blob: exception on its
      // own, confirmed via a real CSP violation while wiring this in).
      "media-src 'self' blob:",
      "font-src 'self' data:",
      "frame-src https://challenges.cloudflare.com",
      // wss:// je pre Supabase Realtime (ChatThread, NotificationBell) — `https://` v
      // connect-src WebSocket NEpokrýva; bez toho prehliadač spojenie ticho zablokuje.
      `connect-src 'self' ${supabaseConnectHosts()} https://plausible.io https://challenges.cloudflare.com`,
      "object-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      ...(isDev ? [] : ["upgrade-insecure-requests"]),
    ].join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // camera=(self) — skener čiarových kódov v denníku (len vlastná doména, nie vložené rámce)
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          // Izoluje okno od cudzích okien (ochrana pred tabnabbingom a únikmi cez
          // window.opener). Appka nepoužíva popup OAuth, takže nič nerozbije.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
      {
        // Exporty (PDF/CSV) obsahujú osobné a zdravotné dáta — nesmú sa ukladať do
        // zdieľaných cache (reverzné proxy, CDN, prehliadač na zdieľanom zariadení).
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
