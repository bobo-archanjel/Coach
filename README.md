# FitPilot

AI-native SaaS platforma pre fitness trénerov na slovenskom a českom trhu. Tréner spravuje klientov, tréningové plány a jedálničky na jednom mieste; klient má vlastný portál s plánom, progresom a AI chatom. Plný popis produktu: [docs/projektbrief.md](docs/projektbrief.md).

> ⚠️ **Pravidlo tohto repozitára: pri KAŽDOM push sa musí aktualizovať sekcia [Novinky](#novinky) nižšie** — jeden záznam, dátum + čo sa zmenilo. Bez aktualizácie README push nepovažujeme za dokončený.

## Štruktúra repozitára

```
docs/
  projektbrief.md      — kompletný produktový koncept (moduly, AI, monetizácia, tech stack)
  Design/               — pôvodné obrázky brand kitu (logo, farby, typografia, UI vzory)
design/
  fitcoach-landing.html — landing page (Persuade), FitPilot brand systém
  fitcoach-auth.html    — Prihlásenie / Registrácia (Operate), prepojená s landing page
PRODUCT.md              — durable produktová pravda (users, positioning, capabilities, brand)
DESIGN.md               — vizuálny systém (farby, typografia, komponenty, otvorené rozhodnutia)
```

`PRODUCT.md` a `DESIGN.md` sú živé dokumenty — aktualizujú sa pri každej väčšej produktovej alebo dizajnovej zmene, nie len pri pushi.

## Vetvy

| Vetva | Účel |
|---|---|
| `main` | stabilný základ |
| `dev`  | bežná práca — sem sa pushuje najčastejšie |
| `test` | QA/staging pred nasadením |

## Tech stack (plán)

React (Next.js) + Tailwind CSS, mobile-first. Backend: Supabase (Postgres, Auth, Storage, RLS), self-hosted. AI: Claude API, výhradne server-side. Platby: Stripe. Detaily v [docs/projektbrief.md](docs/projektbrief.md).

## Brand

FitPilot — Signal Coral `#E0402A`, Amber Dot Accent `#E6B23A`, Almost Black `#121110`, Warm Paper Text `#F3EFE6`, typografia Inter. Plný vizuálny systém: [DESIGN.md](DESIGN.md).

---

## Novinky

_Najnovšie hore. Formát: `YYYY-MM-DD — čo sa zmenilo`._

- **2026-08-27** — Repozitár napojený na GitHub (`bobo-archanjel/Coach`), založené vetvy `main`/`dev`/`test`, pridaný README s povinnosťou aktualizácie pri každom push.
- **2026-08-27** — Rebrand na **FitPilot** podľa dodaného brand kitu (logo, farby, Inter typografia, zaoblené UI, ikonové dlaždice) — aplikované na landing page aj auth stránku.
- **2026-08-27** — Prepojenie landing page ↔ Prihlásenie/Registrácia (nav CTA, cenníkové tlačidlá, `#register` deep-link, logo späť na landing).
- **2026-08-27** — Vytvorená stránka **Prihlásenie / Registrácia** (`design/fitcoach-auth.html`) — Operate povrch, reálne validácie a stavy (loading, error, success), pozývací kód pre klienta.
- **2026-08-27** — Vytvorený **landing page** koncept (`design/fitcoach-landing.html`) — svet "Plate Math" (pôvodná iterácia pred rebrandom), založené `PRODUCT.md` a `DESIGN.md`.
