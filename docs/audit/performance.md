# Audit výkonu FitPilot (branch feature/polish)

Stav: Next 15.5 (App Router, React 19), Supabase, next-intl, Vercel. Merané produkčným buildom
(`QA_DIST_DIR=.next-perf npx next build`) pred a po úpravách, plus `curl` na dev server pre verejné trasy.
Prihlásené trasy sa nedali merať (CAPTCHA) — tam je hodnotenie z čítania kódu (počet sekvenčných round-tripov).

Kód už mal za sebou veľa optimalizácií (React `cache()` na getUser/getProfile/getMyClient, `Promise.all`
v loaderoch, getClaims namiesto getUser, middleware len na /dashboard a /portal, `staleTimes`, CSS chunking,
cache knižnice cvikov). Nižšie je to, čo zostalo.

## Zmerané čísla (First Load JS, produkčný build)

| Trasa | Pred | Po |
|---|---|---|
| /dashboard/nastavenia | 339 kB | 146 kB |
| /dashboard/nastavenia/stranka-nahlad | 263 kB | 132 kB |
| /dashboard/zaujemcovia/[id] | 259 kB | 128 kB |
| /t/[handle] (verejná stránka trénera) | 262 kB | 130 kB |
| /prihlasenie | 206 kB | 136 kB |
| /portal/profil | 203 kB | 134 kB |
| ostatné trasy | beze zmeny (±1 kB) | |

Zdieľané JS všetkých trás: 104 kB (bez zmeny). Middleware 93,5 kB.
Veľkosť HTML (dev server, nekomprimované): /prihlasenie 214 kB -> 63 kB, /cookies 241 kB -> 90 kB
(zmizol ~150 kB JSON s textami v každom dokumente).
Dev TTFB verejných trás (teplé): /prihlasenie ~0,10 s, / ~0,22–0,30 s, /cookies ~0,29 s (prvý štart 0,5–1,5 s = kompilácia).

## Zoznam, zoradený podľa dopadu

### 1. Polyfill Node `crypto` v prehliadačovom balíku — OPRAVENÉ
- Dôkaz: chunk `aaea2bcf` (318 kB raw) + `3614` (82 kB raw) obsahujú bn.js/asn1/Buffer polyfill; v `/t/[handle]`,
  `/dashboard/nastavenia`, detaile záujemcu, náhľade stránky.
- Príčina: `lib/mail/sanitize.ts` importoval `createHmac` z `crypto` kvôli `hashRecipient`, ale ten istý súbor
  importujú klientske komponenty (`LeadForm` cez `lib/publicPage/leads.ts`, `ClientCommsCard`).
- Dopad: ~110–190 kB First Load JS navyše (gzip ~100 kB) na verejnej stránke trénera, ktorá je určená pre cudzích návštevníkov z mobilu.
- Oprava: `hashRecipient` -> `lib/mail/recipientHash.ts` (len server). Test `e2e/mail.spec.ts` upravený na nový import.

### 2. Všetky preklady v každom HTML — OPRAVENÉ
- Dôkaz: `app/layout.tsx` posielal `clientMessages(MESSAGES[locale])` = ~187 kB JSON (v dokumente aj pri prihlásení).
- Oprava: koreň posiela len `CLIENT_BASE` (auth, language, password, publicPage, theme); `/dashboard` a `/portal`
  si ostatné pridajú cez `app/components/ScopedMessages.tsx` (zlúčenie s už načítanými — po sieti ide len doplnok).
  Priestory, ktoré nepoužíva žiadny klientsky komponent (errors, mail, portalData, meta…), sa neposielajú vôbec.
- Poistka: `scripts/i18n-scopes.mjs --check` (spúšťa ho `e2e/i18n.spec.ts`) prejde importy z koreňov oblastí a zhodí test,
  ak nejaký komponent použije priestor, ktorý v jeho rozsahu chýba. Nový `useTranslations(premenná)` skript odmietne
  (rozsah by sa nedal overiť) — treba použiť literál.
- Riziko: zmena je plošná. Odporúčam po nasadení prejsť prihlásenie, dashboard, portál a /t/<handle> a pozrieť konzolu
  na `MISSING_MESSAGE`. Návrat: `clientMessages.ts` vrátiť na staré telo a odstrániť dva `ScopedMessages` obaly.

### 3. Supabase prehliadačový klient v prvom načítaní prihlásenia a profilu — OPRAVENÉ
- `AuthView` a `ChangePasswordForm` importovali `@supabase/ssr` browser klienta (~230 kB raw, ~60 kB gzip) hneď;
  používajú ho len pri Google prihlásení / zabudnutom hesle / odoslaní formulára. Teraz dynamický import pri použití.
- `/prihlasenie/nove-heslo` ho potrebuje hneď pri načítaní (onAuthStateChange) — ponechané (198 kB).

### 4. Sekvenčný vodopád v layoute portálu (každá navigácia klienta) — OPRAVENÉ
- `app/portal/layout.tsx` + `portalShell.ts`: getUser -> [profil, počet správ, klient] -> `trainerAllowsCoach` (dopyt) ->
  `loadBrandingForTrainer` (ďalší dopyt na tú istú `trainer_subscriptions`) -> `loadCosmetics` -> `getTourSeen`.
  Spolu 5 stupňov za sebou a riadok predplatného sa čítal 3x (AI Kouč, značka, výzvy/rebríček).
- Oprava: riadok predplatného je jedna request-cache funkcia (`loadTrainerSubscriptionRow`, lib/gamification/access.ts)
  zdieľaná s `trainerAllowsCoach` a značkou; značka sa zahrieva v `loadPortalShell`; rámik/téma a tour bežia súbežne so shellom.
  Zostávajú 3 stupne (user -> profil+klient -> predplatné+značka).
- Dopad: ~2 round-tripy na Supabase (~40–100 ms každý) z kritickej cesty každého kliku v portáli.

### 5. Nastavenia trénera: 6 sekvenčných stupňov dopytov — OPRAVENÉ
- `app/dashboard/nastavenia/page.tsx`: tarifa -> značka (+ fallback) -> 4 dopyty verejnej stránky -> uvítacia správa ->
  kvóta pozvánok -> AI využitie + profil. Okrem „tarifa -> značka/verejná stránka“ nič od ničoho nezávisí.
- Oprava: tarifa, potom všetko ostatné súbežne (`Promise.all`). Správanie rovnaké (ten istý fallback pre migráciu 0081).

### 6. Predplatné: Stripe API pri každom otvorení stránky — OPRAVENÉ
- `app/dashboard/predplatne/page.tsx`: `stripe.prices.retrieve` pre každý variant (3–4 volania) pri každom zobrazení.
- Oprava: `unstable_cache` (1 h) na formátované ceny; neúplný výsledok (výpadok Stripe) sa nezacachuje.
- Pozor: zmena ceny v Stripe sa na stránke prejaví do hodiny (checkout používa vždy skutočnú cenu zo Stripe).

### 7. Zoznam klientov: odcvičenosť plánov — OPRAVENÉ (výkon + správnosť)
- `app/dashboard/page.tsx` + `lib/dashboard/planCompletion.ts`: `getPlanCompletion` robil `.in("workout_day_id", [všetky dni všetkých plánov])`
  a čítal riadok za každý log. Rastie s históriou; PostgREST strop 1000 riadkov by ticho orezal logy (plán by sa tváril ako neodcvičený);
  stovky UUID v URL môžu prekročiť limit dĺžky požiadavky.
- Oprava: embed `workout_days(id, workout_logs(count))` + `completionFromLogCounts` (jeden riadok na deň), a odpadol jeden round-trip.
  Detail klienta / builder plánu ostali na `getPlanCompletion` (jeden klient / jeden plán — bezpečné).

### 8. FUNKČNÁ CHYBA: analytika klientov ticho orezaná na 1000 riadkov — OPRAVENÉ
- `lib/dashboard/analytics.ts` (`/dashboard/analytika`, AI súhrn portfólia, reporty): zápisy jedla za 90 dní × všetci klienti jedným dopytom.
  Pri ~3 klientoch s bežným logovaním (4 zápisy/deň) sa strop prekročí a % adherencie sa počítalo z náhodnej vzorky.
- Oprava: stránkovanie (`range` po 1000, poradie podľa id) pre food_logs, workout_logs, body_metrics.

### 9. Chýbajúce indexy — pripravené v `supabase/migrations/0085_performance.sql` (VYŽADUJE SPUSTENIE MAJITEĽOM)
Obsah (všetko `create index if not exists`, nič iné):
- `workout_logs_day_idx` na `workout_logs (workout_day_id, performed_on desc) where workout_day_id is not null` — jediný FK bez indexu v prvom stĺpci;
  používajú ho embedy odcvičenosti, `.in(workout_day_id…)` v detaile klienta a `on delete set null` pri mazaní dňa/plánu a pri každom uložení úpravy plánu (0071).
- `workout_days_source_day_idx` na `workout_days (source_day_id) where not null` — FK `on delete set null` z 0071.
- `clients_active_plan_idx`, `clients_active_day_idx` (čiastočné) — FK `on delete set null` pri mazaní plánu/dňa.
- `food_logs_food_idx` na `food_logs (food_id) where not null` — FK pri mazaní potravín najrýchlejšie rastúcej tabuľky.
Ostatné FK a filtre sú už pokryté (0037, 0076, 0078, 0084). Dopad je dnes malý (tabuľky sú malé), rastie s históriou.

## Čo zostáva (navrhnuté / vyžaduje rozhodnutie)

- **Landing a verejné stránky nie sú statické/ISR**: root layout číta cookie (jazyk, téma) -> každá stránka je dynamická (`ƒ`), bez CDN cache.
  Vyžaduje rozhodnutie (jazyk/tému riešiť na klientovi alebo cez samostatné route-skupiny); `/t/[handle]` má vlastnú dátovú cache.
- **Experimentálne trasy /v2, /v3, /v4, /v5 sú v produkčnom builde** (/v2 = 418 kB First Load, three.js). Ak nie sú potrebné, odstrániť/skryť (nemenil som).
- **Zápisy pri renderovaní (GET)**: `MissionsHost` (generovanie misií), `ChallengesHost` (účasť vo výzvach) a prvý `loadGamificationRaw` (backfill)
  zapisujú do DB počas renderu karty Dnes. Sú idempotentné a v `Suspense` (neblokujú shell), ale môžu bežať viackrát (prefetch, opakovanie).
  Presun do `after()` by zmenil, kedy sa misie ukážu — nechané, navrhujem rozhodnúť s majiteľom.
- **Neprečítané správy trénera** sa počítajú dvakrát (layout `count` + stránka `client_id` zoznam). Zanedbateľné; dalo by sa zdieľať cez `cache()`.
- **`.in("client_id", ids)` s veľkým zoznamom** (zoznam klientov, analytika) pri stovkách klientov narazí na dĺžku URL — pri raste na ~150+ klientov na trénera
  prejsť na RPC / delenie do dávok.
- **`HISTORY_LIMIT = 2000` v lib/gamification/server.ts**: PostgREST vráti max. 1000, takže limit 2000 nič nerobí (klient s >1000 tréningami je nereálny, len upozornenie).
- **`/portal/trening` (getPortalTraining)** ťahá všetky logy (vrátane `entries`, `plan_snapshot`) všetkých plánov klienta; rastie s históriou — pri väčších účtoch zvážiť
  načítanie detailov logov až na požiadanie.
- Dev server pri meraní raz vrátil 500 na /t/<neexistujúci> a /obchodne-podmienky počas kompilácie (nereprodukované, pravdepodobne HMR počas mojich úprav) — nepotvrdená chyba.

## Testy a build
- `tsc --noEmit`: bez chýb po každej skupine úprav.
- `node scripts/i18n-check.mjs`: bez nálezov; nový `scripts/i18n-scopes.mjs --check`: OK.
- Čisté unit špecifikácie (billing, gamification*, reports, branding, mail, public-page, mealGenerator, mealRules, mealComposition, aiChatTools, i18n, streak): všetko prešlo (491 + 35 testov; jeden flaky UI test analytika PR widget prešiel pri opakovaní).
- Produkčný build (`.next-perf`): bez chýb, čísla vyššie.
