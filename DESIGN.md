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
| `--iron-red` | `#e0402a` | Signal Coral — accent, postup, ikonografia, dôraz |
| `--iron-red-deep` | `#c3341f` | Signal Coral pre plné tlačidlá — Warm Paper naň prejde AA (4.78:1) |
| `--iron-red-dim` | `#a83322` | tlmený coral — okraje/podčiarknutia na landingu, portálový `missed` stav |
| `--plate-yellow` | `#e6b23a` | Amber Dot Accent — AI kontext, highlighty |
| `--steel` / `--steel-line` | `#7f8a95` / `#38352f` | neutrálne dáta, hairline delenia |
| `--moss` | `#4c7a5e` | úspešný/aktívny stav (sémantické) |

Strednodobo Persuade povrchy (landing) nesú Committed rozsah farby (coral naprieč CTA/dôrazom), Operate povrchy (auth) zostávajú Restrained (coral len na primárnej akcii a focus stavoch).

**Pravidlo jedného accentu.** Coral (`--iron-red`) nesie postup a primárnu akciu; Amber (`--plate-yellow`) nesie kontext trénera a "dnes"; Moss (`--moss`) nesie hotový/splnený stav. Tri role, tri farby — nemiešať (napr. coral nie je "dnes", amber nie je CTA).

**Coral má dva odtiene, jednu identitu.** `--iron-red` (`#e0402a`) na plochách, kde nenesie text — accenty, prstenec postupu, ikony aktívneho stavu, headline dôraz, hairline okraje. `--iron-red-deep` (`#c3341f`) výhradne ako pozadie plných tlačidiel (`.btn-primary`, auth `.btnSubmit`, portálový `.startBtn`), aby Warm Paper label prešiel WCAG AA pre normálny text (4.78:1); hover `#b82f1b`. Nie je to druhá brand farba — je to prístupná verzia tej istej pre text-nesúce plochy.

## Type

**Inter** (400–900), jediná rodina naprieč celým produktom — nadpisy Bold/ExtraBold (800), text Regular/Medium. Veľké nadpisy majú `letter-spacing: -0.025em` (na portáli pozdrav `-0.03em`), sentence case (nie uppercase). Čísla (makrá, váhy, ceny, série, dátumy) používajú `font-variant-numeric: tabular-nums` na Inter samotnom — žiadny samostatný mono font.

**Výnimka — portálový pozdrav.** `.greeting` používa `clamp(1.5rem, 6vw, 1.85rem)` napriek Operate pravidlu fixných rem veľkostí: je to jediný expresívny nadpis na inak úžitkovom povrchu (osobné privítanie menom), a v 460px-capnutom stĺpci sa rozsah clampu zmestí do ~23–29px. Zámerný brand-moment, nie fluidná typografia naprieč povrchom.

Malé trackované uppercase labely (napr. `.demo-top .who`, `.bubble .tag`, `.position-row .label`, portálový `.panelLabel` na `0.12em`, `.ringCenterSub`) ostávajú ako legitímny mikro-label vzor, nezávislý od headline typografie.

## Layout

Nezmenené z prvej iterácie: striedavé (alternating) full-bleed sekcie s asymetrickými riadkami funkcií, každá s vlastnou mini-vizualizáciou zo skutočných produktových dát namiesto rovnakých kariet ikona+nadpis+text.

Portál (`/portal`) má **responzívny shell rovnakým vzorom ako dashboard trénera** (2026-08-28, opravené — predtým bol centrovaný `max-width: 460px` stĺpec natrvalo, aj na desktope, čo pôsobilo ako telefón zaseknutý uprostred veľkého okna): pod 880px ostáva pôvodný mobilný shell nezmenený — centrovaný stĺpec `max-width: 460px`, `min-height: 100dvh`, `overflow-x: hidden`, nad 600px zvislé hairline okraje (`--steel-line`) a 6% coral radiálny vignette zhora, fixná bottom tab bar (`.nav`, 5 položiek). **Nad 880px** sa `.viewport` stáva CSS grid `240px 1fr` (`app/portal/PortalNav.tsx` sa presunul zo sibling-u vnútri stĺpca na priameho grid-child), bottom tab bar sa stáva ľavým sidebarom (`.navShell` — brand FitPilot hore, položky ako vertikálny zoznam, odhlásenie dole cez `margin-top: auto`, presne štruktúra `app/dashboard/DashboardNav.tsx`), obsahový stĺpec sa rozšíri na `max-width: 760px` bez hairline okrajov. Vnútorné kompozície (prstenec postupu, `.exList`, `.week` mriežka) zostali nezmenené — len dostali viac priestoru, žiadny nový multi-column layout obsahu. Obsahové sekcie sú oddelené len whitespace (`gap: 26px`), nie deliacim prvkom.

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

Záložka Registrácia má **explicitný segmentovaný prepínač** hneď na začiatku — "Som tréner" / "Som klient — mám kód" (`.tabs`/`.tabBtn`, rovnaký vizuál ako vonkajšie záložky Prihlásiť sa/Registrácia, `aria-pressed` namiesto `aria-selected` keďže nejde o skutočný tablist). Voľba mení nadpis/podtext, pridáva pole pozývacieho kódu ako prvé povinné pole a mení text tlačidla. Predtým bol kód skrytý za voliteľný toggle dole pod formulárom — klient bez znalosti tohto UI prvku sa nevedomky zaregistroval ako tréner (opravené 2026-08-28).

## Surfaces (pokračovanie)

### Dashboard trénera (`/dashboard`, `app/dashboard/`)
Operate, Restrained farba (rovnako ako auth). Sidebar navigácia (240px, `--ink-2` pozadie, zbaľuje sa na horný pruh pod 880px) so 4 sekciami — Klienti, Tréningy, Výživa, Nastavenia — každá vlastná route, aktívny stav cez `aria-current` + `--ink-3` pozadie. Zdieľaný `dashboard.module.css` naprieč sekciami (karty `--ink-2`/`--steel-line`, status chipy aktívny/meškanie, makro-bar a exercise-row vizualizácie prevzaté z landing page jazyka).

Klienti sekcia je naostro: formulár "Pridať klienta" (Server Action → INSERT do `clients`, `useActionState` pre pending/error stav) a zoznam/detail čítajú reálne dáta z DB (RLS scoped na `trainer_id`). Status chip aktívny/meškanie bol odstránený zo zoznamu — v čase písania nebola za ním reálna adherencia dáta, fake stav by klamal. Detail klienta (`/dashboard/klienti/[id]`) teraz zobrazuje aj jeho reálne tréningové plány (`.roster`/`.clientCard` znovupoužité z Tréningy sekcie) namiesto pôvodného "ešte nepostavené" placeholderu — ten ostal len pre nutričný modul. **Doplnené 2026-08-28:** tretia karta "Posledná aktivita" v `.cardStack` — posledných 8 záznamov z `workout_logs` (názov dňa + dátum, `.clientCard` znovupoužité na `<div>` bez linku), odkedy klient vie odklikávať tréningy (viď portál nižšie).

Tréningy sekcia je naostro. Zoznam plánov (`/dashboard/treningy`) v pôvodnom karta-štýle; detail plánu (`/dashboard/treningy/[planId]`) prešiel druhou iteráciou po spätnej väzbe, že pôvodná forma-na-forme pôsobila neprofesionálne — nahradený **split-view builderom** (knižnica + plátno, zvolené z 3 predložených štruktúr): vľavo sticky knižnica cvikov s vyhľadávaním (klik na cvik = okamžité pridanie do aktívneho dňa s defaultmi 3×10/pauza 90s, rovno pripravené na inline úpravu), vpravo dni ako tabs (aktívny stav vizuálne "zliaty" so panelom pod ním) a zoznam cvikov s inline edit/delete (ceruzka/kôš ikony, `.editForm` prepína riadok priamo na formulár bez modálu). Vlastné vizuálne triedy v `builder.module.css` (samostatný modul pre tento povrch). Builder nemá žiadne UI na "deň v týždni" — portál teraz pracuje na rotácii dní (viď Klientsky portál nižšie), nie na pevnom rozvrhu.

Výživa je naostro (BMR/TDEE + makro cieľ, `0004_nutrition.sql`): `/dashboard/vyziva` je zoznam klientov (`.roster`/`.clientCard` znovupoužité) s náhľadom makier alebo "zatiaľ nenastavený"; `/dashboard/vyziva/[clientId]` má formulár vstupov (pohlavie/vek/váha/výška/aktivita/cieľ, `.addClientForm` vzor) a vedľa výsledok — BMR, TDEE, kalorický cieľ a tri `.macroBarRow` vizualizácie (bielkoviny/sacharidy/tuky, percento z celkových kalórií). Výpočet (`lib/nutrition.ts`, Mifflin-St Jeor) beží live v prehliadači ako náhľad pri písaní aj server-side pri uložení (server je zdroj pravdy, klient len ukazuje). Detail klienta (`/dashboard/klienti/[id]`) má tretiu kartu s aktuálnym makro cieľom a odkazom na úpravu. `.comingSoon` odznaky ostávajú pri Notifikáciách/Fakturácii v Nastaveniach.

**Jedálničky** (`0005_meal_plans.sql`) žijú pod tou istou Výživa sekciou — na `/dashboard/vyziva/[clientId]` je pod makro cieľom karta so zoznamom jedálničkov klienta (`.roster`/`.clientCard` znovupoužité) + formulár na vytvorenie nového. Detail jedálničku (`/dashboard/vyziva/jedalnicek/[planId]`) je **1:1 rovnaká split-view architektúra ako tréningový builder** (`app/dashboard/vyziva/jedalnicek/[planId]/`, vlastný `builder.module.css` skopírovaný z tréningového a rozšírený): vľavo sticky knižnica potravín (globálna + vlastné, makrá na 100 g) s vyhľadávaním, klik = pridanie 100 g do aktívneho dňa (raňajky, hneď editovateľné); vpravo dni ako tabs, panel dňa má hore súčet za celý deň (`.dayTotals`) a položky zoskupené podľa jedla dňa (`.mealGroup` — raňajky/desiata/obed/olovrant/večera/iné), inline edit mení jedlo dňa aj gramáž (makrá sa dopočítajú z `lib/meals.ts`, nie sú duplicitne uložené — food_id + makrá na 100g sú snapshot v zázname, rovnaký dôvod ako `exercise_name` v tréningových dňoch). Číslovanie migrácií: `0003` rezervované pre Track "Klient" (kolega).

## Responsive / mobile-first pass (2026-08-28)

Appka smeruje primárne na telefón pre obe role (upresnené v PRODUCT.md Operating Context) — toto bol prvý kompletný responzívny pass cez celý trénerský frontend, adaptačný (`impeccable adapt`), nie redesign vzhľadu.

- **Dashboard shell** (`dashboard.module.css`, `DashboardNav.tsx`): pod 880px sa hlavná navigácia (`.navList`) odpojí z toku sidebaru (`position: fixed`) a stane sa **fixnou bottom tab bar** (ikona nad labelom, `env(safe-area-inset-bottom)` pre notch) — nie horizontálny scroll top bar ako predtým. Sidebar nad ňou ostáva len tenký sticky top bar s brandom a odhlásením. `.content` má pridaný `padding-bottom`, aby posledná karta nebola pod lištou. `app/layout.tsx` má `viewport.viewportFit: "cover"`, nech `env(safe-area-inset-*)` reálne funguje.
- **Tréningový builder** (`builder.module.css`, `[planId]/*.tsx`): na mobile ide **plátno (aktívny deň) prvé** (`order`), knižnica cvikov je pod ním a **defaultne zbalená** (`ExerciseLibrary` toggle so šípkou) — tréner nescrolluje cez celú knižnicu, kým sa dostane k dňu. `.exerciseRow` je na mobile grid (meno+akcie hore, zhrnutie/meta pod tým na celú šírku) namiesto natlačeného jedného riadku. `.editForm` dostal viditeľné labely (predtým len `aria-label`) a 2-stĺpcový grid namiesto neoznačených úzkych políčok vedľa seba.
- **Dotykové ciele:** ikonové tlačidlá (`.iconBtn` edit/delete) 28px → 44px na mobile; `.btn-sm` (used naprieč celým dashboardom) dostal min. výšku ~44px pod 640px; bottom-tab položky min. 48px.
- **iOS zoom bug:** všetky `<input>`/`<select>`/`<textarea>` pod 16px font-size (auth `.field input`, `.addClientInput`, knižnica/deň/edit polia v builderi) spôsobovali na iOS Safari automatický zoom pri focuse — zjednotené na 16px na mobile (auth stránka rovno natrvalo, keďže rozdiel 15→16px je vizuálne zanedbateľný).
- Landing page a auth mali už rozumné breakpointy z prvej iterácie — dotknuté len pri konkrétnom náleze (input font-size), nie prerobené.

## Klientsky portál (`/portal`, `app/portal/`)
Operate, mobile-first. Track "Klient" (`feature/client-side`). Farba Restrained: coral len na postupe a primárnej akcii, amber na kontexte trénera / "dnes", moss na hotovom stave. FitPilot svet a tokeny nezmenené — povrch konzumuje `app/globals.css`; jediný lokálny stylesheet je `portal.module.css`.

**Dáta a prístup:** auth guard v `app/portal/layout.tsx` — bez session → `/prihlasenie`, rola `trainer` → `/dashboard` (v `next dev` bez session guard nepodmienene neredirectuje — `DEV_OPEN`, kým nie sú reálne Supabase kľúče). Obsah "Dnes" číta reálne Supabase dáta cez `lib/portal/data.ts` — **schéma z `0002_workout_builder` kolegu** (`workout_plans` bez `is_active` → „aktívny" = najnovší plán klienta; cviky ako JSONB v `workout_days.exercises`, nie samostatná tabuľka). Migrácia `0003_portal_client.sql` k tomu **aditívne** dopĺňa `workout_days.weekday` (1–7, ktorý deň v týždni sa cvičí — builder ho zatiaľ nenastavuje, kým je `null` portál ukáže „voľno"), `workout_logs` a `coach_notes` (RLS v štýle buildera — inline `exists`, `auth.uid()`). Séria aj týždenný pás sa počítajú z `workout_logs` v zóne `Europe/Bratislava`. `focus`/`durationLabel` dňa builder nemá — na portáli sa nezobrazujú. Demo dáta: `supabase/seed/0001_portal_demo.sql`. `?preview=unlinked|no_plan|error|ok` vynúti stav bez DB (len mimo produkcie).

**Prázdne / chybové stavy** (`Notice`, zdieľaný vizuál s `ComingSoon`: `--ink-3` dlaždica 52px, nadpis `1.4rem`/800, text `--paper-dim`, celoobrazovkovo centrované v shelli): *neprepojený klient* (účet existuje, tréner ho ešte nespároval), *bez plánu* (žiadny aktívny `workout_plan` alebo plán bez dní), *chyba načítania* (+ `.btn-ghost` „Skúsiť znova").

**Odklikávanie tréningu** (2026-08-28, Fáza A podľa `0003_portal_client.sql` — existencia záznamu v `workout_logs` = deň splnený, žiadne per-cvik odškrtávanie): "Začať tréning" je teraz `LogWorkoutButton` (`app/portal/LogWorkoutButton.tsx`) — lokálny prepínač bez zápisu (cviky sú už vypísané v karte, netreba nikam navigovať), po kliknutí ukáže "Ukončiť tréning", ktoré cez Server Action `finishWorkoutAction` (`app/portal/actions.ts`) vloží riadok do `workout_logs` (RLS aj unique index `(client_id, workout_day_id, performed_on)` už pripravené od buildu portálu). Po úspechu sa `/portal` zrevaliduje. `completedCount` ostáva `0` mimo stavu `done` (per-cvik odškrtávanie nie je súčasťou Fázy A).

**Rotačný model namiesto pevného rozvrhu** (2026-08-28, zmena po spätnej väzbe — klient si vyberá KEDY cvičí, plán nemá pripnuté dni na konkrétne dni v týždni): pôvodne `workout_days.weekday` určoval, čo je "dnes"; reálny klient so 4 dňami mal preto natrvalo "Dnes máš voľno", lebo builder toto pole nikdy nenastavoval. Namiesto opravy cez UI na nastavenie `weekday` (postavené a hneď zase zrušené v tom istom dni — pozri git históriu) je teraz "ďalší tréning" = **nasledujúci nedokončený deň v poradí plánu** (`day_number`), cyklicky, nezávisle od kalendára: `lib/portal/data.ts` nájde posledný odcvičený `workout_log`, vezme jeho `workout_day_id`, a ponúkne deň za ním v poli dní (bez histórie = prvý deň). `workout_days.weekday` stĺpec ostáva v DB (nepoužívaný, nepotrebuje down-migráciu), builder už nemá žiadny UI naň.

Dôsledky pre kartu Dnes: `TodaySession.kind` je už len `"training" | "done"` (stav `"rest"` odstránený — v rotácii niet "voľného" dňa podľa rozvrhu, klient si robí prestávky sám). Týždenný pás (`WeekDay`) už neukazuje "čo bolo naplánované" (žiadne `missed`/`upcoming`/`plan` pole) — len prehľad aktivity: `done` (v ten deň bol záznam), `today`, `none` (nič). "Séria" (`streakDays`, počítaná ako dni za sebou podľa rozvrhu) nedávala v rotácii zmysel — nahradená `totalSessions` ("Odcvičené spolu", jednoduchý súčet záznamov v tomto pláne). História (`streakHistory`, posledných 12 dní) ostala, len bez `missed` stavu (len `done`/`rest`). Footer "Ďalší tréning · [deň]" odstránený — hlavná karta už vždy ukazuje najbližší tréning, duplicitné.

**Kompozícia "Oblúk tréningového dňa"** (seed `7c5000e8`, direction contract je HTML komentár v `app/portal/layout.tsx`). Home sa číta zhora nadol ako priebeh jednej tréningovej jednotky, nie ako mriežka status-dlaždíc dashboardu:

1. **Príprava** — pozdrav menom (`clamp(1.5rem, 6vw, 1.85rem)` / 800 / `-0.03em`) + dátum + odkaz trénera v amber páse (`rgba(230,178,58,0.08)` pozadie, `rgba(230,178,58,0.24)` okraj, `--radius-m`, iniciálová dlaždica `--ink-3`/`--steel-line` s amber monogramom).
2. **Práca** — panel dňa: `--ink-2` pozadie, `--steel-line` okraj, `--radius-m`, `padding: 18px`, `--shadow-2`. Vľavo prstenec postupu (viď Components), vpravo názov dňa + kontextový riadok (fokus dňa; builder ho nemá, tak sa tam dá názov plánu) + pilulkové chipy. Cviky sú **hairline-oddelené riadky vnútri panela** (`border-top: 1px solid --steel-line`, `min-height: 52px`, grid `28px / 1fr / auto` = index-pilulka / názov+meta / záťaž v amber) — zámerne NIE dlaždicová mriežka dashboardu. Na spodku panela full-width coral CTA "Začať tréning →".
3. **Dozvuk** — dva `--ink-2` panely: séria (`--iron-red` číslo `2rem`/900 + plate strip za posledných 12 dní: odcvičené = `--iron-red`, voľno podľa plánu = `--steel` `opacity: 0.4`, vynechané = `--iron-red-dim` `opacity: 0.6` — pás nesie informáciu, nie jednoliaty coral) a týždenný pás (7-stĺpcová mriežka; dnešná bunka amber okraj + wash; bodky: done = coral, today = väčšia amber, upcoming = steel obrys, missed = dutý `--iron-red-dim` obrys `opacity: 0.9` — tichý, nie výčitka, rest = krátka steel čiarka). `.panelLabel` = trackovaný uppercase mikro-label (`0.12em`).
4. **Tichý close** — riadok "Ďalší tréning · [deň] — [plán]" v `--paper-faint`.

**Tri stavy session:** `training` (prstenec + zoznam + CTA), `rest` (tichý panel bez prstenca a CTA), `done` (prstenec plný, moss "Tréning hotový" značka, bez CTA).

**Primárne CTA `.startBtn`** rozširuje globálne `.btn.btn-primary` (pozadie `--iron-red-deep`, kontrast AA 4.78:1) — full-width, centrované, `padding-block: 16px`, `19px / 800`: zámerne veľký, palcovo dosiahnuteľný cieľ hlavnej mobilnej akcie, nie kontrastná barlička. Šípka `→` SVG (18px) vpravo podľa arrow-CTA vzoru.

**Ostatné taby:** Chat a Profil sú zdieľaná `ComingSoon` obrazovka — centrovaná `--ink-3` dlaždica ikony (52px, `--radius-m`), nadpis `1.4rem`/800, amber pilulka "Pripravujeme"; stavajú ich fázy C/D.

**Tréning a Strava sú naostro** (2026-08-28, nie viac ComingSoon — chýbali klientovi po tom, čo mu tréner nastavil plán/makrá/jedálniček a v portáli sa to nezobrazovalo): oba taby znovupoužívajú vizuálne primitíva z karty Dnes (`.panel`/`.panelLabel`, `.exList`/`.exRow`, `.chip`/`.sessionChips`, `.streakHead`) namiesto novej kompozície — vedomé rozhodnutie nechať dizajn karty Dnes ako je a len rozšíriť dátovú vrstvu, kým sa vizuál portálu prípadne neriešil samostatne. `/portal/trening` ukazuje **celý** aktívny tréningový plán (všetky dni, nie len dnešok, na rozdiel od karty Dnes). `/portal/strava` ukazuje makro cieľ (BMR/TDEE/makrá z `nutrition_profiles`) a najnovší jedálniček (`meal_plans`/`meal_days`, položky zoskupené podľa jedla dňa cez `lib/meals.ts` — rovnaká logika ako v trénerovom builderi). Obe časti Stravy sú nezávislé (klient môže mať jedno bez druhého) — vlastné empty-state riadky namiesto jedného veľkého "nič tu nie je". Zdieľaná `Notice`/`AlertIcon` komponenta (`app/portal/Notice.tsx`) vytiahnutá z `page.tsx`, aby ju mohli použiť aj tieto dve nové stránky. Nová funkcia `getLinkedClient()` v `lib/portal/data.ts` zjednocuje hľadanie prepojeného klienta naprieč všetkými troma dátovými loadermi.

**Dostupná rezerva:** bar-rule ("kotúče") motív systém má, ale tento povrch ho nepoužíva — fázy oddelené whitespace (`gap: 26px`). Pri budúcich portálových obrazovkách je k dispozícii.

## Open decisions

- Logo je vlastná SVG rekonštrukcia z referenčných obrázkov, nie originálny export — nahradiť pri finálnom nasadení.
- ~~Kontrast `.btn-primary`~~ **Vyriešené 2026-08-28:** plné tlačidlá dostali pozadie `--iron-red-deep` (`#c3341f`, 4.78:1 s Warm Paper), hover `#b82f1b`. Platí pre `.btn-primary` (landing), auth `.btnSubmit`, portálový `.startBtn`. `--iron-red` zostáva pre accenty a postup.
- Tréningový builder trénera (`0002_workout_builder`, vetva `feature/trener`) a klientský portál (`0003_portal_client`, `feature/client-side`) vznikli paralelne. Portál sa prispôsobil builderu (jeho `workout_plans`/`workout_days`). ~~Follow-up pre builder: nastavovať `workout_days.weekday`~~ **Nahradené rotačným modelom 2026-08-28** (pozri Klientsky portál vyššie) — namiesto pripínania dní na konkrétny deň v týždni portál ponúka ďalší nedokončený deň v poradí plánu, klient si vyberá kedy cvičí. `weekday` stĺpec ostáva v DB nepoužívaný. Ideálne `is_active` na pláne ostáva otvorené (zatiaľ "aktívny" = najnovší plán klienta).
- Klientsky portál: „Dnes", Tréning aj Strava čítajú reálne Supabase dáta (viď Surfaces), odklikávanie tréningu (Fáza A) funguje. Chýba per-cvik odškrtávanie a skutočné odcvičené hodnoty (`workout_logs.entries` ostáva `[]`) a taby Chat/Profil (fázy C/D). `DEV_OPEN` v `layout.tsx` je dočasná pomôcka pre lokál bez reálnych kľúčov — odstrániť po napojení.
- Portál Tréning/Strava zatiaľ vizuálne len znovupoužíva primitíva karty Dnes — nie je to zámerné trvalé rozhodnutie, len rozsah tej úlohy bol dátový, nie vizuálny. Zvážiť vlastnú kompozíciu pre tieto taby neskôr, podobne ako Dnes má svoj "Oblúk tréningového dňa". **Responzívny shell (sidebar na desktope) je vyriešený** (vyššie), toto sa týka len vnútorného obsahu jednotlivých kariet.
- ~~Spárovanie klienta cez pozývací kód~~ **Vyriešené 2026-08-28:** `/prihlasenie` malo panel "Som klient a mám pozývací kód" úplne nefunkčný — input bol mimo `<form>`, tlačidlo "Overiť kód" bez `onClick`, registrácia vždy nastavovala `role: "trainer"` bez ohľadu na kód. Opravené: panel presunutý do registračného formulára, vyplnený kód nastaví `role: "client"` a po úspešnom `signUp` sa zavolá nová RPC `claim_client_by_invite` (`0006_client_invite_claim.sql`, `security definer` — priamy RLS update by dovolil ktorémukoľvek prihlásenému účtu nárokovať si ľubovoľný nespárovaný riadok bez znalosti kódu). Úspech → redirect na `/portal`; neplatný/použitý kód → chybová hláška, účet ostáva vytvorený nespárovaný.
- Dashboard trénera: Klienti, Tréningy, Výživa (makro cieľ) aj Jedálničky sú naostro (vyššie); food diary (logovanie skutočne zjedeného klientom) ostáva budúca úloha, pravdepodobne Track "Klient".
- Ceny v cenníku sú orientačné (z brief-u), nie finálne potvrdené.
- ~~Onboarding flow pre klienta cez pozývací kód~~ implementovaný 2026-08-28 (viď vyššie `claim_client_by_invite`).
- Zabudnuté heslo a e-mailová verifikácia nemajú vlastnú obrazovku — len odkaz z prihlásenia.
