# Design

<!-- impeccable:design-schema 1 -->

## World

**FitPilot brand kit** (dodaný používateľom 2026-08-27, nahrádza pôvodnú vlastnú "Plate Math" iteráciu). Tmavý grafitový svet (žiadna light téma) zostal — scéna je tréner pri večernom plánovaní a klient s telefónom v posilňovni. Logo je "F"/šípka zložená z dvoch šikmých červeno-oranžových pruhov a jantárovo-červeného "dart" trojuholníka. Jediné písmo naprieč celým produktom je **Inter** — žiadny kondenzovaný display font, žiadny mono pre čísla; sentence case, nie uppercase headliny.

Podpisový prvok **bar-rule** (deliaca čiara s "kotúčmi" na koncoch) je zachovaný ako kompatibilný sekundárny motív z prvej iterácie — nie je súčasťou dodaného brand kitu, ale nekoliduje s ním.

## Color

Farby dodaného kitu sa zhodou okolností takmer presne prekryli s pôvodnou paletou — tokeny ostali rovnaké, len prerámované pod oficiálne názvy.

| Token | Hex | Brand kit rola |
|---|---|---|
| `--ink` | `#121110` | Almost Black — základná plocha |
| `--ink-2` / `--ink-3` | `#1b1a18` / `#262421` | Card Ember — vrstvené panely |
| `--paper` | `#f3efe6` | Warm Paper Text — primárny text |
| `--paper-dim` / `--paper-faint` | `#cfc9bd` / `#8f897d` | odvodené sekundárne/terciárne |
| `--iron-red` | `#e0402a` | Signal Coral — primárny accent, CTA |
| `--plate-yellow` | `#e6b23a` | Amber Dot Accent — AI kontext, highlighty |
| `--steel` / `--steel-line` | `#7f8a95` / `#38352f` | neutrálne dáta, hairline delenia |
| `--moss` | `#4c7a5e` | úspešný/aktívny stav (sémantické) |

Strednodobo Persuade povrchy (landing) nesú Committed rozsah farby (coral naprieč CTA/dôrazom), Operate povrchy (auth) zostávajú Restrained (coral len na primárnej akcii a focus stavoch).

**Pravidlo jedného accentu.** Coral (`--iron-red`) nesie postup a primárnu akciu; Amber (`--plate-yellow`) nesie kontext trénera a "dnes"; Moss (`--moss`) nesie hotový/splnený stav. Tri role, tri farby — nemiešať (napr. coral nie je "dnes", amber nie je CTA).

## Type

**Inter** (400–900), jediná rodina naprieč celým produktom — nadpisy Bold/ExtraBold (800), text Regular/Medium. Veľké nadpisy majú `letter-spacing: -0.025em` (na portáli pozdrav `-0.03em`), sentence case (nie uppercase). Čísla (makrá, váhy, ceny, série, dátumy) používajú `font-variant-numeric: tabular-nums` na Inter samotnom — žiadny samostatný mono font.

Malé trackované uppercase labely (napr. `.demo-top .who`, `.bubble .tag`, `.position-row .label`, portálový `.panelLabel` na `0.12em`, `.ringCenterSub`) ostávajú ako legitímny mikro-label vzor, nezávislý od headline typografie.

## Layout

Nezmenené z prvej iterácie: striedavé (alternating) full-bleed sekcie s asymetrickými riadkami funkcií, každá s vlastnou mini-vizualizáciou zo skutočných produktových dát namiesto rovnakých kariet ikona+nadpis+text.

Mobilný Operate povrch (portál) má vlastný shell: centrovaný stĺpec `max-width: 460px`, `min-height: 100dvh`, `overflow-x: hidden`; nad 600px dostane stĺpec zvislé hairline okraje (`--steel-line`) a scéna 6% coral radiálny vignette zhora (`radial-gradient(120% 60% at 50% 0%, rgba(224,64,42,0.06), transparent 70%)`). Obsahové sekcie sú oddelené len whitespace (`gap: 26px`), nie deliacim prvkom.

## Components

- **Logo mark** (`.logo-mark`) — vlastná SVG rekonštrukcia dodaného loga (dva pruhy + dart trojuholník, gradient coral→amber). Nie je pixel-presná kópia originálnych brand kit súborov — nahradiť skutočným exportom pri produkčnom nasadení.
- **Icon tiles** (`.icon-tile`) — ikony funkcií teraz sedia v tmavej zaoblenej dlaždici (44×46px, `--ink-3` pozadie, `--steel-line` okraj), podľa ikonového jazyka z brand kitu.
- **Kreslený ikonový set** (`app/portal/icons.tsx`) — vlastné SVG, viewBox 24, jednotný stroke 1.7 pre líniové ikony, `currentColor` (coral v aktívnom stave). Žiadny icon font, žiadna externá knižnica; rozšíriteľný pattern pre ďalšie mobilné povrchy.
- Zaoblenie zjemnené podľa kitu: `--radius-s: 9px`, `--radius-m: 12px` (predtým 3px/6px, industriálne ostré). Malé kruhové/pilulkové prvky (chipy, streak segmenty, plate strip) používajú `border-radius: 999px`.
- Primárne CTA majú šípku (`→` SVG) vpravo od textu, podľa "PRIMÁRNE CTA →" vzoru z kitu.
- **Pilulkový chip** — `border-radius: 999px`, `--ink-3` pozadie, `--steel-line` okraj, `--paper-dim` text, ~11px/600, `tabular-nums`. Zdieľaný naprieč povrchmi (metadáta session, atď.).
- `.demo`, `.feature-row`/`.reverse`, `.bar-rule`, `.trust-banner`, `.price-card.featured` — nezmenené zo štruktúrnej stránky, len typograficky/farebne zarovnané na nový systém.
- Auth brand panel má teraz `.brand-tagline` — malý amber label "Tréning. Výživa. Komunikácia. Rast." pod logom, podľa lockupu z kitu.

### Prstenec postupu (`/portal` — podpisový prvok)

Coral prstenec obopínajúci dnešný blok cvikov: ghost dráha (`rgba(224,64,42,0.16)`, `stroke-width: 8`) + štartový bod (coral `r=4` na 12. hodine) + hodnotový oblúk (`--iron-red`, `stroke-width: 8`, `stroke-linecap: round`), v strede `N/M` (17px/800) a mikro-label `CVIKOV`. viewBox 92, polomer 40, oblúk začína o `-90°`. Funguje aj pri stave 0/6. **Autorský moment:** pri načítaní sa poskladá — ghost dráha sa obkreslí (`ringDraw` 900ms), štartový bod dosadne (`ringStartDrop` 420ms, delay 620ms), coral hodnota sa dokreslí (`ringFill` 1000ms, delay 120ms), ease `cubic-bezier(0.16, 1, 0.3, 1)`. Jediná entrance animácia povrchu; žiadne per-sekciové reveal efekty; plne potlačená pri `prefers-reduced-motion`.

### Spodná navigácia (`/portal`)

Fixná lišta (`position: fixed; bottom: 0`), centrovaná, `max-width: 460px`, `z-index: 20`, 5 rovnakých stĺpcov (Dnes / Tréning / Strava / Chat / Profil). Pozadie `color-mix(in srgb, var(--ink-2) 92%, transparent)` + `backdrop-filter: blur(12px)`, horný hairline `--steel-line`, `padding-bottom: env(safe-area-inset-bottom)`. Položka: kreslená ikona 22px + label 10px/600, `--paper-faint` default → `--iron-red` aktívny (riadené `aria-current="page"`). `backdrop-filter` je tu funkčný (čitateľnosť fixnej lišty nad scrollom), nie dekoratívne sklo.

## What to avoid (per craft floor)

Žiadne rovnaké 3-stĺpcové ikona+nadpis+text karty, žiadny gradient text, žiadny kicker/eyebrow nad nadpismi, žiadne section čísla mimo skutočnej sekvencie (fázovanie), žiadny glass/blur ako dekorácia (funkčný `backdrop-filter` na fixnej navigácii je v poriadku), žiadny farebný border-left na kartách.

## Surfaces

### Landing page
Persuade. Plný Committed farebný rozsah. Pozri `.demo`, `.feature-row`, `.trust-banner`, `.price-card` vyššie.

### Prihlásenie / Registrácia (`fitcoach-auth.html`)
Operate. Farba Restrained — coral len na primárnej akcii, focus stavoch a odkazoch. Prepojená obojsmerne s landing page (nav "Prihlásiť sa"/"Vyskúšať zadarmo" → auth stránka; cenníkové CTA a finálne CTA → `#register` deep-link na auth stránke; logo na auth stránke → späť na landing).

## Surfaces (pokračovanie)

### Dashboard trénera (`/dashboard`, `app/dashboard/`)
Operate, Restrained farba (rovnako ako auth). Sidebar navigácia (240px, `--ink-2` pozadie, zbaľuje sa na horný pruh pod 880px) so 4 sekciami — Klienti, Tréningy, Výživa, Nastavenia — každá vlastná route, aktívny stav cez `aria-current` + `--ink-3` pozadie. Zdieľaný `dashboard.module.css` naprieč sekciami (karty `--ink-2`/`--steel-line`, status chipy aktívny/meškanie, makro-bar a exercise-row vizualizácie prevzaté z landing page jazyka).

Frontend je zatiaľ na mock dátach (`lib/mock/dashboard.ts`) — reálne pridávanie klientov, tréningový builder a jedálničky nie sú postavené, preto žiadne funkčné "Pridať klienta"/"Vytvoriť plán" CTA (len `.comingSoon` odznaky pri Notifikáciách/Fakturácii v Nastaveniach). Auth guard (redirect na `/prihlasenie` bez session) a Nastavenia → Profil sú skutočné Supabase volania, zvyšok obsahu nie.

### Klientsky portál (`/portal`, `app/portal/`)
Operate, mobile-first, Fáza A Track 2. Farba Restrained: coral len na postupe a primárnej akcii, amber na kontexte trénera / "dnes", moss na hotovom stave. Mock dáta (`lib/mock/portal.ts`), žiadny backend ani auth guard v tejto fáze. FitPilot svet a tokeny nezmenené — povrch konzumuje `app/globals.css` a **nepridáva žiadne nové tokeny**; jediný lokálny stylesheet je `portal.module.css`.

**Kompozícia "Oblúk tréningového dňa"** (seed `7c5000e8`, direction contract je HTML komentár v `app/portal/layout.tsx`). Home sa číta zhora nadol ako priebeh jednej tréningovej jednotky, nie ako mriežka status-dlaždíc dashboardu:

1. **Príprava** — pozdrav menom (`clamp(1.5rem, 6vw, 1.85rem)` / 800 / `-0.03em`) + dátum + odkaz trénera v amber páse (`rgba(230,178,58,0.08)` pozadie, `rgba(230,178,58,0.24)` okraj, `--radius-m`, iniciálová dlaždica `--ink-3`/`--steel-line` s amber monogramom).
2. **Práca** — panel dňa: `--ink-2` pozadie, `--steel-line` okraj, `--radius-m`, `padding: 18px`, `--shadow-2`. Vľavo prstenec postupu (viď Components), vpravo názov a fokus dňa + pilulkové chipy. Cviky sú **hairline-oddelené riadky vnútri panela** (`border-top: 1px solid --steel-line`, `min-height: 52px`, grid `28px / 1fr / auto` = index-pilulka / názov+meta / záťaž v amber) — zámerne NIE dlaždicová mriežka dashboardu. Na spodku panela full-width coral CTA "Začať tréning →".
3. **Dozvuk** — dva `--ink-2` panely: séria (`--iron-red` číslo `2rem`/900 + plate strip: segmenty `--steel-line`, splnené `--iron-red`) a týždenný pás (7-stĺpcová mriežka; dnešná bunka amber okraj + wash; bodky: done = coral, today = väčšia amber, upcoming = steel obrys, rest = krátka steel čiarka). `.panelLabel` = trackovaný uppercase mikro-label (`0.12em`).
4. **Tichý close** — riadok "Ďalší tréning · [deň] — [plán]" v `--paper-faint`.

**Tri stavy session:** `training` (prstenec + zoznam + CTA), `rest` (tichý panel bez prstenca a CTA), `done` (prstenec plný, moss "Tréning hotový" značka, bez CTA).

**Primárne CTA `.startBtn`** rozširuje globálne `.btn.btn-primary` — full-width, centrované, `padding-block: 16px`, **zväčšené na 19px / 800**, aby kontrast Warm Paper na Signal Coral prešiel ako AA large-text (≥3:1). Coral zostáva token-identický s `.btn-primary`; šípka `→` SVG (18px) vpravo podľa arrow-CTA vzoru.

**Ostatné taby** (Tréning / Strava / Chat / Profil) sú zdieľaná `ComingSoon` obrazovka — centrovaná `--ink-3` dlaždica ikony (52px, `--radius-m`), nadpis `1.4rem`/800, amber pilulka "Pripravujeme". Stavajú ich fázy B/C/D.

**Dostupná rezerva:** bar-rule ("kotúče") motív systém má, ale tento povrch ho nepoužíva — fázy oddelené whitespace (`gap: 26px`). Pri budúcich portálových obrazovkách je k dispozícii.

## Open decisions

- Logo je vlastná SVG rekonštrukcia z referenčných obrázkov, nie originálny export — nahradiť pri finálnom nasadení.
- **Kontrast `.btn-primary` (Warm Paper na Signal Coral) pri globálnych 15px má ~3.75:1 — pod AA pre normálny text.** Portál to lokálne obchádza zväčšením `.startBtn` na 19px/800 (kvalifikuje ako large-text, ≥3:1). Token-pár coral/paper na malých tlačidlách landing/auth/dashboardu potrebuje samostatný prechod (stmaviť coral, alebo zväčšiť/prefarbiť label) — nie je vyriešené, nie je kanonizované ako prijateľné.
- Dashboard trénera má teraz plnú navigačnú štruktúru na mock dátach (vyššie) — reálne pridávanie klientov (backend + UI), tréningový builder a zostavovanie jedálničkov v ňom ešte chýbajú.
- Klientsky portál: Fáza A (`/portal` "Dnes") je postavená na mock dátach (viď Surfaces vyššie), FitPilot systém zachovaný. Chýba backend (workout_logs, client_onboarding), auth guard, odklikávanie cvikov (`completedCount` je natvrdo 0) a taby Tréning/Strava/Chat/Profil (fázy B/C/D).
- Ceny v cenníku sú orientačné (z brief-u), nie finálne potvrdené.
- Onboarding flow pre klienta cez pozývací kód (`fitcoach-auth.html`) je len navrhnutý predpoklad — potrebuje potvrdenie.
- Zabudnuté heslo a e-mailová verifikácia nemajú vlastnú obrazovku — len odkaz z prihlásenia.
