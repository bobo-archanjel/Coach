# FitPilot — Roadmap

Živý dokument — aktualizuje sa, keď sa mení plán, nie len pri pushi (rovnako ako `PRODUCT.md`/`DESIGN.md`). AI chat pre klienta ("AI Kouč") je hotový — viď sekciu **AI blok** nižšie. AI generátor plánov pre trénera zostáva **vedome odložený**.

## Ako čítať tento dokument

Dve paralelné vetvy podľa toho, kto s kým pracuje — **Track "Tréner"** a **Track "Klient"** — navrhnuté tak, aby sa čo najmenej dotýkali rovnakých súborov naraz. Sekcia **Zdieľané** je to, čo potrebuje koordináciu medzi oboma (napr. číslovanie DB migrácií, spoločné komponenty v `app/components/`).

Odporúčaný postup pri branchovaní: `feature/<track>-<vec>` z čistého `dev`, malé PR/merge späť do `dev` čo najčastejšie (nie jeden obrovský branch na týždne — čím dlhšie žije bokom, tým bolestivejší merge).

---

## Stav k 2026-09-02

**Hotovo:** auth (obe role, pozývací kód, zabudnuté heslo/e-mailová verifikácia), klienti (CRUD + aktivita), tréningový builder (plány/dni/cviky), výživa (BMR/TDEE, makro cieľ, jedálničky, adherencia stravy pre trénera), klientský portál (Dnes/Tréning/Strava/Denník/Chat/AI Kouč, rotácia dní, história týždňov), odklikávanie tréningu Fáza B (skutočné série/opakovania/váha), food diary klienta (`/portal/dennik`, `0007`), obojsmerný chat tréner↔klient (`0008`, refresh-based), vlastný tréning klienta + stopky, notifikácie o meškajúcich klientoch (v appke, bez e-mailu), skutočné logo/favicon z brand kitu, mobile-first responzívny dizajn na oboch stranách, **globálna knižnica cvikov s obrázkami (876, Free Exercise DB) a rozšírená knižnica potravín (83, USDA) + live vyhľadávanie značiek (Open Food Facts)**, **AI Kouč pre klienta** — viď sekcie nižšie.

**Číslovanie migrácií — ďalšie voľné číslo je `0023`.** Dohodnite si vopred, kto berie ktoré číslo, nech sa nezraziť dva rovnaké súbory na dvoch vetvách:

| # | Súbor | Track |
|---|---|---|
| 0001 | `profiles_clients.sql` | spoločné |
| 0002 | `workout_builder.sql` | Tréner |
| 0003 | `portal_client.sql` | Klient |
| 0004 | `nutrition.sql` | Tréner |
| 0005 | `meal_plans.sql` | Tréner |
| 0006 | `client_invite_claim.sql` | Klient |
| 0007 | `food_logs.sql` | Klient |
| 0008 | `messages.sql` | Klient |
| 0009 | `client_basics.sql` (vek/váha/výška na `clients`) | Tréner |
| 0010 | `client_own_workouts.sql` (vlastné tréningy klienta, `clients.active_plan_id`, `ensure_self_client`/`set_active_plan` RPC) | Klient |
| 0011 | `exercise_images.sql` (obrázky/inštrukcie/SK preklad na `exercises`) | Zdieľané |
| 0012 | `food_external_id.sql` (`foods.external_id` pre idempotentný import) | Zdieľané |
| 0013 | `ai_usage.sql` (log volaní Claude API) | Zdieľané |
| 0014 | `ai_chat.sql` (`ai_conversations`/`ai_messages`, AI Kouč) | Zdieľané |
| 0015 | `ai_escalation.sql` (sender `system` na `messages`, eskalácia trénerovi) | Zdieľané |
| 0016 | `ai_conversation_delete.sql` (RLS delete pre "Začať odznova") | Zdieľané |
| 0017 | `ai_chat_private.sql` (zúženie RLS — tréner nemá prístup k AI chatu) | Zdieľané |
| 0018 | `client_deletion.sql` (GDPR výmaz, `feature/gdpr-retention` — pôvodne 0013, prečíslované pri mergi kvôli kolízii s AI Kočom) | Klient |
| 0019 | `deletion_chat_notice.sql` (systémová správa o GDPR zmazaní, `feature/gdpr-retention` — pôvodne 0014) | Klient |
| 0020 | `client_cooperation_pause.sql` (ukončenie spolupráce bez straty dát, `feature/gdpr-retention` — pôvodne 0015) | Klient |
| 0021 | `workout_plan_publish.sql` (koncept/publikovanie tréningového plánu, `feature/gdpr-retention` — pôvodne 0016) | Tréner |
| 0022 | `active_day_override.sql` (explicitný výber dňa má prednosť pred rotáciou, `feature/gdpr-retention` — pôvodne 0017) | Klient |
| 0023+ | — voľné — | dohodnúť |

---

## Track "Tréner"

1. ~~**Fáza B tréningu — per-cvik odškrtávanie + skutočné hodnoty**~~ **HOTOVO 2026-08-28** (branch `feature/trener-training`, zmergované do `dev`) — pri "Ukončiť tréning" klient zadáva skutočné série/opakovania/váhu ku každému cviku (predvyplnené podľa plánu z buildera), tréner ich vidí v rozbaliteľnom detaile karty "Posledná aktivita". `workout_logs.entries` (jsonb, 0003) sa už reálne využíva. Žiadna nová migrácia.
2. ~~**Notifikácie trénerovi**~~ **HOTOVO 2026-08-28** — v appke (bez e-mailu, bez novej migrácie): `/dashboard` počíta priamo z `workout_plans`/`workout_logs`, klient bez odklikaného tréningu 5+ dní dostane status chip "meškanie" a objaví sa v alert paneli nad zoznamom klientov. E-mailové zhrnutie ostáva placeholder "čoskoro" v Nastaveniach.
3. ~~**Skutočné logo assety**~~ **HOTOVO 2026-08-30** (branch `feature/identita`) — favicon (`app/icon.png`) hotový od 28.8.; teraz aj `LogoMark.tsx` nahradený skutočným exportom (`docs/Design/logo.png` → `public/brand/logo-mark.png`, cez `next/image`) namiesto SVG rekonštrukcie, použitý na landing headeri/footeri, dashboard sidebari, portál sidebari aj auth stránke. `FitPilot_Logo.png` (mark+wordmark) a `long_logo.png` (+ tagline) sú tiež dodané, zatiaľ nepoužité (existujúci vzor mark-ako-obrázok + "FitPilot" ako HTML text v Inter sa zachoval).
4. **AI generátor tréningových plánov pre trénera** — základ AI bloku (Anthropic SDK, `ai_usage`, draft-then-approve princípy) je hotový vďaka AI Koučovi nižšie, samotný generátor plánov ešte nezačatý.

## Track "Klient"

1. ~~**Food diary**~~ **HOTOVO 2026-08-28** — `/portal/dennik` (6. tab): klient loguje z knižnice potravín (+ rýchle pridanie z trénerovho jedálnička), vidí dnešný príjem oproti makro cieľu. Migrácia `0007_food_logs.sql`. ~~Follow-up: karta „adherencia stravy" na strane trénera~~ **HOTOVO 2026-08-30** (branch `feature/verification-adherencia`) — nová karta na `/dashboard/klienti/[id]`: dnešný % z kalorického cieľa + 7-dňový pás bodiek. `lib/dashboard/adherence.ts`, žiadna nová migrácia (RLS na `food_logs` to už dovoľovala).
2. ~~**Chat tréner↔klient (obojsmerný)**~~ **HOTOVO 2026-08-28** — `messages` (`0008`), jedno vlákno na klienta, **refresh-based** (poll ~12 s kým je karta viditeľná + na focus, Server Actions revalidujú — bez Realtime, upgrade neskôr bez zmeny schémy). Klient: `/portal/chat` (bodka na tabe pri neprečítanej správe). Tréner: karta „Správy" na `/dashboard/klienti/[id]` + odznak počtu neprečítaných v zozname klientov. `coach_notes` ostáva samostatný (dnešný odkaz na karte Dnes). Zdieľaný `app/components/ChatThread.tsx`. ~~Follow-up: `/dashboard/spravy` inbox~~ **HOTOVO 2026-09-03** (branch `feature/spravy-inbox`) — centrálna schránka všetkých vlákien naraz, zoradená podľa poslednej aktivity, s náhľadom poslednej správy a odznakom neprečítaných (aj v sidebar nave). Výber vlákna cez `?client=<id>`, dvojstĺpcový layout na desktope, na mobile sa po výbere skryje zoznam (len vlákno + "Späť"). Žiadna nová migrácia/logika písania — znovupoužíva `sendTrainerMessageAction`/`markTrainerChatSeenAction`/`ChatThread`. Realtime zostáva otvorené.
3. ~~**Vlastný tréning klienta**~~ **HOTOVO 2026-08-30** (branch `feature/stopwatch`) — klient si v sekcii Tréning vytvorí vlastný tréning (aj bez trénera): naklikanie cvikov z globálnej knižnice alebo voľným textom, dni, série/opakovania/váha/pauza/tempo, uloží jedným ťukom. `/portal/trening` je teraz zoznam plánov (od trénera aj vlastné) — ťuk nastaví plán ako aktívny (`clients.active_plan_id`, null → najnovší) a ten riadi kartu Dnes presne ako plán od trénera (Začať tréning, stopky, logovanie). Plná editácia aj zmazanie vlastného plánu. Migrácia `0010_client_own_workouts.sql` (uvoľní `clients.trainer_id` a `workout_plans.trainer_id` na nullable pre self-klienta, `ensure_self_client` + `set_active_plan` security-definer RPC, klientské CUD RLS na `workout_plans`/`workout_days`).
4. **Progres tracking** — grafy váhy/výkonov v čase, prípadne foto porovnania. Fáza B (skutočné odcvičené hodnoty) je už hotová vyššie — táto položka je teraz odblokovaná.
   - ~~**História týždňov v páse „Tento týždeň"**~~ **HOTOVO 2026-08-31** (branch `feature/week-history`, cez impeccable) — prvý krok k spätnému pohľadu: pás na karte Dnes sa dá prelistovať na minulé týždne (šípky, strop ≈ 1 rok) a ťuk na odcvičený deň otvorí náhľad toho, čo klient v ten deň spravil (série/opakovania/váha z `workout_logs.entries`; pri Fáze A záznamoch „bez zápisu sérií"). Bez migrácie — `lib/portal/data.ts` (`buildWeekView`, `getPortalWeek`) číta `workout_logs`/`workout_days` naprieč všetkými plánmi klienta. Grafy váhy/výkonov v čase ešte chýbajú.
5. ~~**AI chat pre klienta ("AI Kouč")**~~ **HOTOVO 2026-09-02** — viď sekciu **AI blok** nižšie.

## Globálne knižnice (cviky, potraviny) — používajú obe strany

~~**Fáza A — Cviky s obrázkami**~~ **HOTOVO 2026-09-01** (`feature/macro-exercise` → `dev`) — knižnica cvikov rozšírená z 10 na 876 (Free Exercise DB, Unlicense), obrázky ako externé URL (žiadne kopírovanie do Storage), kroky cvičenia, ~150 najbežnejších preložených do SK. Klik na cvik (knižnica aj po pridaní do dňa/plánu) otvorí detail s obrázkami — dashboard builder aj klientský portál. Migrácia `0011`, jednorazový import `scripts/import-exercises.mjs`.

~~**Fáza B — Potraviny**~~ **HOTOVO 2026-09-01** (`features/macro-exercise/foodData` → `dev`) — knižnica potravín rozšírená z 10 na 83 surových/nespracovaných potravín (USDA FoodData Central) so SK názvami. Migrácia `0012`, import `scripts/import-foods.mjs`. **Otvorené:** ďalšie rozšírenie nad 83 položiek — zatiaľ nerozhodnuté, či a o koľko.

~~**Fáza C — Live vyhľadávanie značiek**~~ **HOTOVO 2026-09-01** — tretí tab "Značky (online)" v `/portal/dennik`, živé vyhľadávanie cez Open Food Facts (SK/CZ produkty uprednostnené), bez novej migrácie/kešovania. `lib/openFoodFacts.ts`.

**Follow-up nájdený počas testovania (opravené v rámci tej istej vetvy, netýka sa knižníc):** kritický bug PGRST201 — detail tréningového plánu vracal 404 a zoznam plánov bol vždy prázdny (nejednoznačná FK relácia `workout_plans↔clients` odkedy `0010` pridalo `clients.active_plan_id`). Opravené v `app/dashboard/treningy/page.tsx` a `[planId]/page.tsx`.

## AI blok — AI Kouč (klientský AI chat)

**HOTOVO 2026-09-02** (branch `feature/AI` → `dev`) — samostatný tab "AI Kouč" v klientskom portáli, dostupný len klientom s prideleným trénerom (self-klienti zatiaľ nie — bez trénera niet komu eskalovať). Postavené v krokoch:

- **Základ** — `@anthropic-ai/sdk`, `ai_usage` (`0013`) loguje každé volanie (tréner/klient/druh/model/tokeny) ako základ pre budúci rate-limit podľa monetizácie. Modely: Haiku pre chat (lacný, časté volania), Sonnet vyhradený pre budúci generátor plánov.
- **Deterministický kontext** (`lib/ai/macroContext.ts`) — zostávajúce makrá dneška a aktuálny časový slot (raňajky/obed/olovrant/večera) sa počítajú v kóde, nie modelom — model dostane hotové čísla a len ich naformuluje.
- **Zdravotný pre-filter** (`lib/ai/healthFilter.ts`, Product Principle #5) — SK keyword detekcia beží PRED každým volaním Claude. Akútna téma bez žiadosti o cvik → hard block (pevná odpoveď, nulové náklady, upozornenie trénerovi). Zmienka o nepohodlí SPOLU so žiadosťou o náhradu cviku → mäkká cesta: AI smie odpovedať (výhradne z reálnej knižnice cvikov), tréner dostane len tiché FYI.
- **Denný rate limit** (`lib/ai/rateLimit.ts`) — `AI_CHAT_DAILY_LIMIT_PER_CLIENT` (default 20/deň), kontrolovaný PRED volaním modelu.
- **Reálne dáta namiesto halucinácií** — `lib/ai/exerciseAlternatives.ts` (fuzzy nájde spomínaný cvik, ponúkne modelu skutočné alternatívy rovnakej svalovej partie z 876 cvikov) a `lib/ai/foodContext.ts` (celá knižnica ~83 potravín sa pošle vždy, keď má klient makro cieľ — model navrhne konkrétne jedlo/gramáž/aj celý denný jedálniček výhradne z nej, nikdy sa nepýta "aké potraviny máš dostupné").
- **Súkromie (GDPR)** — AI Kouč je súkromná konverzácia klient↔AI. Tréner k nej **nemá prístup** (ani cez UI, ani cez RLS — `0017` po pôvodnom, neskôr prehodnotenom rozhodnutí v `0014`). Eskalácie idú výhradne cez krátku správu v skutočnom `messages` vlákne (`sender = 'system'`, `0015`), nikdy cez prístup k celému transkriptu. Klient si vie kedykoľvek vymazať celú históriu ("Začať odznova", `0016` — aj bežná potreba, aj právo na vymazanie).
- **Prehľad nákladov pre trénera** — karta "AI náklady" v `/dashboard/nastavenia` (`lib/ai/pricing.ts`, `usageSummary.ts`), orientačný odhad dnes/7 dní podľa cenníka modelu; záväzný limit sa nastavuje v Anthropic Console.
- Migrácie `0013`–`0017`, ďalšie voľné číslo `0018`.

**Otvorené:** AI generátor tréningových plánov pre trénera (Track "Tréner" bod 4) — draft-then-approve na reálnych `exercise_id`, zatiaľ nezačaté.

## Zdieľané / potrebuje koordináciu

- **Vyčistiť `main` branch** — stále obsahuje znovu-zavlečený `.claude/skills/impeccable/` bloat z priameho PR mergu (`feature/insert-client` → `main`, obišlo `dev`). Nahlásené skôr, zatiaľ neopravené. Netreba na to čakať s ďalšou prácou (`dev` je čistý), ale treba to niekedy dobehnúť pred prvým reálnym tagom/release.
- ~~**Zabudnuté heslo / e-mailová verifikácia**~~ **HOTOVO 2026-08-30** (branch `feature/verification-adherencia`) — "Zabudnuté heslo?" je funkčný inline panel (`supabase.auth.resetPasswordForEmail`), nová stránka `/prihlasenie/nove-heslo` na nastavenie nového hesla z e-mailového odkazu. Registrácia klienta cez pozývací kód opravená pre prípad zapnutého povinného potvrdenia e-mailu (kód sa doklaimuje pri prvom prihlásení, nie len pri signUp). Manuálne kroky v Supabase Dashboarde ("Confirm email" v Authentication → Providers → Email, redirect URL `<url>/prihlasenie/nove-heslo`) **potvrdené hotové 2026-09-01**.
- **Self-hosted Supabase presun** (z cloud dev projektu na `nexus`, rovnaká architektúra ako `crm.vanasenior.sk`) — úloha **pred produkčným nasadením**, nie teraz.
- **Platby (Stripe)**, **kalendár**, **fakturačná/biznis vrstva**, **white-label** — explicitne mimo MVP podľa `PRODUCT.md`, riešiť až keď je zvyšok hotový.

---

## Čo je vedome mimo tohto plánu (zatiaľ)

- AI generátor plánov pre trénera — viď AI blok vyššie, nezačaté.
- Pokročilé reporty nad rámec základného progres trackingu.
