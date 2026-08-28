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

## Type

**Inter** (400–900), jediná rodina naprieč celým produktom — nadpisy Bold/ExtraBold (800), text Regular/Medium. Veľké nadpisy majú `letter-spacing: -0.025em`, sentence case (nie uppercase). Čísla (makrá, váhy, ceny) používajú `font-variant-numeric: tabular-nums` na Inter samotnom — žiadny samostatný mono font.

Malé trackované uppercase labely (napr. `.demo-top .who`, `.bubble .tag`, `.position-row .label`) ostávajú ako legitímny mikro-label vzor, nezávislý od headline typografie.

## Layout

Nezmenené z prvej iterácie: striedavé (alternating) full-bleed sekcie s asymetrickými riadkami funkcií, každá s vlastnou mini-vizualizáciou zo skutočných produktových dát namiesto rovnakých kariet ikona+nadpis+text.

## Components

- **Logo mark** (`.logo-mark`) — vlastná SVG rekonštrukcia dodaného loga (dva pruhy + dart trojuholník, gradient coral→amber). Nie je pixel-presná kópia originálnych brand kit súborov — nahradiť skutočným exportom pri produkčnom nasadení.
- **Icon tiles** (`.icon-tile`) — ikony funkcií teraz sedia v tmavej zaoblenej dlaždici (44×46px, `--ink-3` pozadie, `--steel-line` okraj), podľa ikonového jazyka z brand kitu.
- Zaoblenie zjemnené podľa kitu: `--radius-s: 9px`, `--radius-m: 12px` (predtým 3px/6px, industriálne ostré).
- Primárne CTA majú šípku (`→` SVG) vpravo od textu, podľa "PRIMÁRNE CTA →" vzoru z kitu.
- `.demo`, `.feature-row`/`.reverse`, `.bar-rule`, `.trust-banner`, `.price-card.featured` — nezmenené zo štruktúrnej stránky, len typograficky/farebne zarovnané na nový systém.
- Auth brand panel má teraz `.brand-tagline` — malý amber label "Tréning. Výživa. Komunikácia. Rast." pod logom, podľa lockupu z kitu.

## What to avoid (per craft floor)

Žiadne rovnaké 3-stĺpcové ikona+nadpis+text karty, žiadny gradient text, žiadny kicker/eyebrow nad nadpismi, žiadne section čísla mimo skutočnej sekvencie (fázovanie), žiadny glass/blur ako dekorácia, žiadny farebný border-left na kartách.

## Surfaces

### Landing page
Persuade. Plný Committed farebný rozsah. Pozri `.demo`, `.feature-row`, `.trust-banner`, `.price-card` vyššie.

### Prihlásenie / Registrácia (`fitcoach-auth.html`)
Operate. Farba Restrained — coral len na primárnej akcii, focus stavoch a odkazoch. Prepojená obojsmerne s landing page (nav "Prihlásiť sa"/"Vyskúšať zadarmo" → auth stránka; cenníkové CTA a finálne CTA → `#register` deep-link na auth stránke; logo na auth stránke → späť na landing).

## Surfaces (pokračovanie)

### Dashboard trénera (`/dashboard`, `app/dashboard/`)
Operate, Restrained farba (rovnako ako auth). Sidebar navigácia (240px, `--ink-2` pozadie, zbaľuje sa na horný pruh pod 880px) so 4 sekciami — Klienti, Tréningy, Výživa, Nastavenia — každá vlastná route, aktívny stav cez `aria-current` + `--ink-3` pozadie. Zdieľaný `dashboard.module.css` naprieč sekciami (karty `--ink-2`/`--steel-line`, status chipy aktívny/meškanie, makro-bar a exercise-row vizualizácie prevzaté z landing page jazyka).

Klienti sekcia je naostro: formulár "Pridať klienta" (Server Action → INSERT do `clients`, `useActionState` pre pending/error stav) a zoznam/detail čítajú reálne dáta z DB (RLS scoped na `trainer_id`). Status chip aktívny/meškanie bol odstránený zo zoznamu — nebola za ním reálna adherencia dáta (žiadne `workout_logs` zatiaľ), fake stav by klamal. Detail klienta (`/dashboard/klienti/[id]`) teraz zobrazuje aj jeho reálne tréningové plány (`.roster`/`.clientCard` znovupoužité z Tréningy sekcie) namiesto pôvodného "ešte nepostavené" placeholderu — ten ostal len pre nutričný modul.

Tréningy sekcia je naostro. Zoznam plánov (`/dashboard/treningy`) v pôvodnom karta-štýle; detail plánu (`/dashboard/treningy/[planId]`) prešiel druhou iteráciou po spätnej väzbe, že pôvodná forma-na-forme pôsobila neprofesionálne — nahradený **split-view builderom** (knižnica + plátno, zvolené z 3 predložených štruktúr): vľavo sticky knižnica cvikov s vyhľadávaním (klik na cvik = okamžité pridanie do aktívneho dňa s defaultmi 3×10/pauza 90s, rovno pripravené na inline úpravu), vpravo dni ako tabs (aktívny stav vizuálne "zliaty" so panelom pod ním) a zoznam cvikov s inline edit/delete (ceruzka/kôš ikony, `.editForm` prepína riadok priamo na formulár bez modálu). Vlastné vizuálne triedy v `builder.module.css` (samostatný modul pre tento povrch).

Výživa ostáva honestný `.emptyState` ("ešte nepostavené"), kým nepribudne `meal_plans` tabuľka. `.comingSoon` odznaky ostávajú pri Notifikáciách/Fakturácii v Nastaveniach.

## Open decisions

- Logo je vlastná SVG rekonštrukcia z referenčných obrázkov, nie originálny export — nahradiť pri finálnom nasadení.
- Klientský portál (Operate povrch) ešte nie je navrhnutý — rozšíriť tento súbor pri jeho stavbe, so zachovaním FitPilot systému.
- Dashboard trénera: Klienti aj Tréningy sú naostro (vyššie); zostavovanie jedálničkov (Výživa) ešte chýba.
- Ceny v cenníku sú orientačné (z brief-u), nie finálne potvrdené.
- Onboarding flow pre klienta cez pozývací kód (`fitcoach-auth.html`) je len navrhnutý predpoklad — potrebuje potvrdenie.
- Zabudnuté heslo a e-mailová verifikácia nemajú vlastnú obrazovku — len odkaz z prihlásenia.
