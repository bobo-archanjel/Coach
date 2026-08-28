# FitPilot — Roadmap

Živý dokument — aktualizuje sa, keď sa mení plán, nie len pri pushi (rovnako ako `PRODUCT.md`/`DESIGN.md`). AI funkcie (chat pre klienta, generátor plánov pre trénera) sú **vedome odložené na koniec** — riešime najprv základ appky bez nich.

## Ako čítať tento dokument

Dve paralelné vetvy podľa toho, kto s kým pracuje — **Track "Tréner"** a **Track "Klient"** — navrhnuté tak, aby sa čo najmenej dotýkali rovnakých súborov naraz. Sekcia **Zdieľané** je to, čo potrebuje koordináciu medzi oboma (napr. číslovanie DB migrácií, spoločné komponenty v `app/components/`).

Odporúčaný postup pri branchovaní: `feature/<track>-<vec>` z čistého `dev`, malé PR/merge späť do `dev` čo najčastejšie (nie jeden obrovský branch na týždne — čím dlhšie žije bokom, tým bolestivejší merge).

---

## Stav k 2026-08-28

**Hotovo:** auth (obe role, pozývací kód), klienti (CRUD + aktivita), tréningový builder (plány/dni/cviky), výživa (BMR/TDEE, makro cieľ, jedálničky), klientský portál (Dnes/Tréning/Strava/Denník, rotácia dní), odklikávanie tréningu Fáza A (existencia záznamu = splnené), food diary klienta (`/portal/dennik`, `0007`), mobile-first responzívny dizajn na oboch stranách.

**Číslovanie migrácií — ďalšie voľné číslo je `0007`.** Dohodnite si vopred, kto berie ktoré číslo, nech sa nezraziť dva rovnaké súbory na dvoch vetvách:

| # | Súbor | Track |
|---|---|---|
| 0001 | `profiles_clients.sql` | spoločné |
| 0002 | `workout_builder.sql` | Tréner |
| 0003 | `portal_client.sql` | Klient |
| 0004 | `nutrition.sql` | Tréner |
| 0005 | `meal_plans.sql` | Tréner |
| 0006 | `client_invite_claim.sql` | Klient |
| 0007 | `food_logs.sql` | Klient |
| 0008+ | — voľné — | dohodnúť |

---

## Track "Tréner"

1. **Fáza B tréningu — per-cvik odškrtávanie + skutočné hodnoty**
   Teraz "odcvičil" = prázdny záznam v `workout_logs` (existencia = splnené). `workout_logs.entries` (jsonb, `[{entry_id, sets:[{reps,weight}]}]`) **už existuje v DB** (0003), stačí appka: pri "Ukončiť tréning" nech klient zadá skutočné série/opakovania/váhu ku každému cviku namiesto prázdneho poľa; tréner to potom vidí v karte "Posledná aktivita" na detaile klienta (teraz len dátum + názov dňa). Žiadna nová migrácia.
2. **Notifikácie trénerovi** — e-mail/prehľad o klientoch, ktorí meškajú s tréningom alebo logovaním. Pravdepodobne nová tabuľka (queue/preferencie) → rezervovať migračné číslo vopred.
3. **Skutočné logo assety** namiesto SVG rekonštrukcie (`app/components/LogoMark.tsx`) — čaká sa na finálny export z brand kitu.
4. *(neskôr, po AI bloku)* AI generátor plánov pre trénera.

## Track "Klient"

1. ~~**Food diary**~~ **HOTOVO 2026-08-28** — `/portal/dennik` (6. tab): klient loguje z knižnice potravín (+ rýchle pridanie z trénerovho jedálnička), vidí dnešný príjem oproti makro cieľu. Migrácia `0007_food_logs.sql`. Follow-up: karta „adherencia stravy" na strane trénera (analogicky ku karte aktivity tréningu).
2. **Chat tréner↔klient (obojsmerný)** — teraz je len jednosmerný odkaz trénera (`coach_notes`, zobrazený v karte Dnes). Skutočný chat je väčšia vec (realtime alebo aspoň refresh-based vlákno) — rozmyslieť si rozsah pred štartom.
3. **Progres tracking** — grafy váhy/výkonov v čase, prípadne foto porovnania. Závisí od Fázy B (potrebuje skutočné odcvičené hodnoty, nie len "splnené/nesplnené").
4. *(neskôr, po AI bloku)* AI chat pre klienta — **zdravotné hranice sú tvrdé pravidlo** (Product Principle #5): eskalácia na trénera pri bolesti/zranení, nikdy diagnostika. Toto sa musí navrhnúť *pri* stavbe chatu, nie dolepiť dodatočne.

## Zdieľané / potrebuje koordináciu

- **Vyčistiť `main` branch** — stále obsahuje znovu-zavlečený `.claude/skills/impeccable/` bloat z priameho PR mergu (`feature/insert-client` → `main`, obišlo `dev`). Nahlásené skôr, zatiaľ neopravené. Netreba na to čakať s ďalšou prácou (`dev` je čistý), ale treba to niekedy dobehnúť pred prvým reálnym tagom/release.
- **Zabudnuté heslo / e-mailová verifikácia** — `/prihlasenie` je zdieľaná stránka pre obe role, chýbajú vlastné obrazovky (teraz len holý odkaz).
- **Self-hosted Supabase presun** (z cloud dev projektu na `nexus`, rovnaká architektúra ako `crm.vanasenior.sk`) — úloha **pred produkčným nasadením**, nie teraz.
- **Platby (Stripe)**, **kalendár**, **fakturačná/biznis vrstva**, **white-label** — explicitne mimo MVP podľa `PRODUCT.md`, riešiť až keď je zvyšok hotový.

---

## Čo je vedome mimo tohto plánu (zatiaľ)

- AI generátor plánov (tréner) a AI chat (klient) — dohodnuté odložiť na koniec, kým nie je jasná zvyšná štruktúra appky.
- Pokročilé reporty nad rámec základného progres trackingu.
