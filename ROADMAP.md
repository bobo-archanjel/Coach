# FitPilot — Roadmap

Živý dokument — aktualizuje sa, keď sa mení plán, nie len pri pushi (rovnako ako `PRODUCT.md`/`DESIGN.md`). AI funkcie (chat pre klienta, generátor plánov pre trénera) sú **vedome odložené na koniec** — riešime najprv základ appky bez nich.

## Ako čítať tento dokument

Dve paralelné vetvy podľa toho, kto s kým pracuje — **Track "Tréner"** a **Track "Klient"** — navrhnuté tak, aby sa čo najmenej dotýkali rovnakých súborov naraz. Sekcia **Zdieľané** je to, čo potrebuje koordináciu medzi oboma (napr. číslovanie DB migrácií, spoločné komponenty v `app/components/`).

Odporúčaný postup pri branchovaní: `feature/<track>-<vec>` z čistého `dev`, malé PR/merge späť do `dev` čo najčastejšie (nie jeden obrovský branch na týždne — čím dlhšie žije bokom, tým bolestivejší merge).

---

## Stav k 2026-08-28

**Hotovo:** auth (obe role, pozývací kód), klienti (CRUD + aktivita), tréningový builder (plány/dni/cviky), výživa (BMR/TDEE, makro cieľ, jedálničky), klientský portál (Dnes/Tréning/Strava/Denník/Chat, rotácia dní), odklikávanie tréningu Fáza B (skutočné série/opakovania/váha, nielen splnené/nesplnené), food diary klienta (`/portal/dennik`, `0007`), obojsmerný chat tréner↔klient (`0008`, refresh-based), notifikácie o meškajúcich klientoch (v appke, bez e-mailu), skutočný favicon z brand kitu, mobile-first responzívny dizajn na oboch stranách.

**Číslovanie migrácií — ďalšie voľné číslo je `0010`.** Dohodnite si vopred, kto berie ktoré číslo, nech sa nezraziť dva rovnaké súbory na dvoch vetvách:

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
| 0011+ | — voľné — | dohodnúť |

---

## Track "Tréner"

1. ~~**Fáza B tréningu — per-cvik odškrtávanie + skutočné hodnoty**~~ **HOTOVO 2026-08-28** (branch `feature/trener-training`, zmergované do `dev`) — pri "Ukončiť tréning" klient zadáva skutočné série/opakovania/váhu ku každému cviku (predvyplnené podľa plánu z buildera), tréner ich vidí v rozbaliteľnom detaile karty "Posledná aktivita". `workout_logs.entries` (jsonb, 0003) sa už reálne využíva. Žiadna nová migrácia.
2. ~~**Notifikácie trénerovi**~~ **HOTOVO 2026-08-28** — v appke (bez e-mailu, bez novej migrácie): `/dashboard` počíta priamo z `workout_plans`/`workout_logs`, klient bez odklikaného tréningu 5+ dní dostane status chip "meškanie" a objaví sa v alert paneli nad zoznamom klientov. E-mailové zhrnutie ostáva placeholder "čoskoro" v Nastaveniach.
3. ~~**Skutočné logo assety**~~ **HOTOVO 2026-08-30** (branch `feature/identita`) — favicon (`app/icon.png`) hotový od 28.8.; teraz aj `LogoMark.tsx` nahradený skutočným exportom (`docs/Design/logo.png` → `public/brand/logo-mark.png`, cez `next/image`) namiesto SVG rekonštrukcie, použitý na landing headeri/footeri, dashboard sidebari, portál sidebari aj auth stránke. `FitPilot_Logo.png` (mark+wordmark) a `long_logo.png` (+ tagline) sú tiež dodané, zatiaľ nepoužité (existujúci vzor mark-ako-obrázok + "FitPilot" ako HTML text v Inter sa zachoval).
4. *(neskôr, po AI bloku)* AI generátor plánov pre trénera.

## Track "Klient"

1. ~~**Food diary**~~ **HOTOVO 2026-08-28** — `/portal/dennik` (6. tab): klient loguje z knižnice potravín (+ rýchle pridanie z trénerovho jedálnička), vidí dnešný príjem oproti makro cieľu. Migrácia `0007_food_logs.sql`. Follow-up: karta „adherencia stravy" na strane trénera (analogicky ku karte aktivity tréningu).
2. ~~**Chat tréner↔klient (obojsmerný)**~~ **HOTOVO 2026-08-28** — `messages` (`0008`), jedno vlákno na klienta, **refresh-based** (poll ~12 s kým je karta viditeľná + na focus, Server Actions revalidujú — bez Realtime, upgrade neskôr bez zmeny schémy). Klient: `/portal/chat` (bodka na tabe pri neprečítanej správe). Tréner: karta „Správy" na `/dashboard/klienti/[id]` + odznak počtu neprečítaných v zozname klientov. `coach_notes` ostáva samostatný (dnešný odkaz na karte Dnes). Zdieľaný `app/components/ChatThread.tsx`. Follow-up: `/dashboard/spravy` inbox (teraz sa píše len z detailu klienta), Realtime.
3. ~~**Vlastný tréning klienta**~~ **HOTOVO 2026-08-30** (branch `feature/stopwatch`) — klient si v sekcii Tréning vytvorí vlastný tréning (aj bez trénera): naklikanie cvikov z globálnej knižnice alebo voľným textom, dni, série/opakovania/váha/pauza/tempo, uloží jedným ťukom. `/portal/trening` je teraz zoznam plánov (od trénera aj vlastné) — ťuk nastaví plán ako aktívny (`clients.active_plan_id`, null → najnovší) a ten riadi kartu Dnes presne ako plán od trénera (Začať tréning, stopky, logovanie). Plná editácia aj zmazanie vlastného plánu. Migrácia `0010_client_own_workouts.sql` (uvoľní `clients.trainer_id` a `workout_plans.trainer_id` na nullable pre self-klienta, `ensure_self_client` + `set_active_plan` security-definer RPC, klientské CUD RLS na `workout_plans`/`workout_days`).
4. **Progres tracking** — grafy váhy/výkonov v čase, prípadne foto porovnania. Fáza B (skutočné odcvičené hodnoty) je už hotová vyššie — táto položka je teraz odblokovaná.
5. *(neskôr, po AI bloku)* AI chat pre klienta — **zdravotné hranice sú tvrdé pravidlo** (Product Principle #5): eskalácia na trénera pri bolesti/zranení, nikdy diagnostika. Toto sa musí navrhnúť *pri* stavbe chatu, nie dolepiť dodatočne.

## Zdieľané / potrebuje koordináciu

- **Vyčistiť `main` branch** — stále obsahuje znovu-zavlečený `.claude/skills/impeccable/` bloat z priameho PR mergu (`feature/insert-client` → `main`, obišlo `dev`). Nahlásené skôr, zatiaľ neopravené. Netreba na to čakať s ďalšou prácou (`dev` je čistý), ale treba to niekedy dobehnúť pred prvým reálnym tagom/release.
- **Zabudnuté heslo / e-mailová verifikácia** — `/prihlasenie` je zdieľaná stránka pre obe role, chýbajú vlastné obrazovky (teraz len holý odkaz).
- **Self-hosted Supabase presun** (z cloud dev projektu na `nexus`, rovnaká architektúra ako `crm.vanasenior.sk`) — úloha **pred produkčným nasadením**, nie teraz.
- **Platby (Stripe)**, **kalendár**, **fakturačná/biznis vrstva**, **white-label** — explicitne mimo MVP podľa `PRODUCT.md`, riešiť až keď je zvyšok hotový.

---

## Čo je vedome mimo tohto plánu (zatiaľ)

- AI generátor plánov (tréner) a AI chat (klient) — dohodnuté odložiť na koniec, kým nie je jasná zvyšná štruktúra appky.
- Pokročilé reporty nad rámec základného progres trackingu.
