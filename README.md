# FitPilot

AI-native SaaS platforma pre fitness trénerov na slovenskom a českom trhu. Tréner spravuje klientov, tréningové plány a jedálničky na jednom mieste; klient má vlastný portál s plánom, progresom a AI chatom. Plný popis produktu: [docs/projektbrief.md](docs/projektbrief.md).

> ⚠️ **Pravidlo tohto repozitára: pri KAŽDOM push sa musí aktualizovať sekcia [Novinky](#novinky) nižšie** — jeden záznam, dátum + čo sa zmenilo. Bez aktualizácie README push nepovažujeme za dokončený.

## Štruktúra repozitára

```
app/
  layout.tsx            — root layout, Inter font, metadata
  globals.css           — design tokeny (DESIGN.md), reset, zdieľané .btn/.bar-rule primitívy
  page.tsx / page.module.css        — landing page (Persuade)
  prihlasenie/           — Prihlásenie / Registrácia (Operate), klientská komponenta (tabs, validácia)
  components/            — zdieľané kusy (LogoMark, RevealOnScroll)
docs/
  projektbrief.md      — kompletný produktový koncept (moduly, AI, monetizácia, tech stack)
  Design/               — pôvodné obrázky brand kitu (logo, farby, typografia, UI vzory)
PRODUCT.md              — durable produktová pravda (users, positioning, capabilities, brand)
DESIGN.md               — vizuálny systém (farby, typografia, komponenty, otvorené rozhodnutia)
```

`PRODUCT.md` a `DESIGN.md` sú živé dokumenty — aktualizujú sa pri každej väčšej produktovej alebo dizajnovej zmene, nie len pri pushi.

**Next.js app** (rozhodnuté 2026-08-27) žije priamo v koreni repozitára. Statické mockupy pôvodne v `design/` (landing + auth) boli 27. 8. 2026 plne nahradené reálnym Next.js kódom podľa dohodnutého pravidla a zložka bola zmazaná — `docs/Design/` (obrázky brand kitu) tým nie je dotknuté.

## Infra rozhodnutia (bod 0 — pred prvým riadkom Next.js kódu)

- **Supabase:** vývoj beží na cloud Supabase projekte (nie zatiaľ self-hosted na `nexus`). Presun na self-hosted inštanciu (rovnaká architektúra ako `crm.vanasenior.sk`) je úloha pred produkčným nasadením, nie pred MVP vývojom.
- **Env/secrets:** lokálne `.env.local` (negitované, šablóna v `.env.local.example`) — Supabase URL/anon key, `SUPABASE_SERVICE_ROLE_KEY` a `ANTHROPIC_API_KEY` len server-side. Produkčný secret store na `nexus` sa rieši pri nasadení.

## Vetvy

| Vetva | Účel |
|---|---|
| `main` | stabilný základ |
| `dev`  | bežná práca — sem sa pushuje najčastejšie |
| `test` | QA/staging pred nasadením |

## Tech stack

React (Next.js 15, App Router, TypeScript) + Tailwind CSS v4, mobile-first. Landing a auth stránky zatiaľ používajú CSS Modules pre vernú 1:1 zhodu s dizajnom; Tailwind je nastavený pre budúce Operate obrazovky (dashboard, klientský portál). Backend: Supabase (Postgres, Auth, Storage, RLS) — zatiaľ cloud projekt pre dev, self-hosted na `nexus` pred produkciou. AI: Claude API, výhradne server-side. Platby: Stripe. Detaily v [docs/projektbrief.md](docs/projektbrief.md).

Lokálny beh: `npm install && npm run dev`.

## Brand

FitPilot — Signal Coral `#E0402A`, Amber Dot Accent `#E6B23A`, Almost Black `#121110`, Warm Paper Text `#F3EFE6`, typografia Inter. Plný vizuálny systém: [DESIGN.md](DESIGN.md).

---

## Novinky

_Najnovšie hore. Formát: `YYYY-MM-DD — čo sa zmenilo`._

- **2026-08-27** — Landing page a Prihlásenie/Registrácia naostro: Next.js 15 (App Router, TS) + Tailwind v4 kostra založená v koreni repa, oba mockupy portované 1:1 (CSS Modules, farebné tokeny z DESIGN.md, Inter cez `next/font/google`, auth ako riadená React komponenta s reálnou validáciou/loading/success stavmi namiesto vanilla JS). Nahradené `design/*.html` mockupy zmazané. Nainštalovaný skill **impeccable** (`/impeccable init` spustený, `PRODUCT.md` potvrdený ako aktuálny, build workflow nastavený na code-first).
- **2026-08-27** — Bod 0 rozhodnutý: Next.js app pôjde do koreňa repa (`design/` ostáva ako referencia počas portovania), Supabase vývoj na cloud projekte (self-hosted `nexus` presun až pred produkciou), secrets cez `.env.local` podľa novej `.env.local.example` šablóny. Zdokumentované v README sekcii "Infra rozhodnutia".
- **2026-08-27** — Repozitár napojený na GitHub (`bobo-archanjel/Coach`), založené vetvy `main`/`dev`/`test`, pridaný README s povinnosťou aktualizácie pri každom push.
- **2026-08-27** — Rebrand na **FitPilot** podľa dodaného brand kitu (logo, farby, Inter typografia, zaoblené UI, ikonové dlaždice) — aplikované na landing page aj auth stránku.
- **2026-08-27** — Prepojenie landing page ↔ Prihlásenie/Registrácia (nav CTA, cenníkové tlačidlá, `#register` deep-link, logo späť na landing).
- **2026-08-27** — Vytvorená stránka **Prihlásenie / Registrácia** (`design/fitcoach-auth.html`) — Operate povrch, reálne validácie a stavy (loading, error, success), pozývací kód pre klienta.
- **2026-08-27** — Vytvorený **landing page** koncept (`design/fitcoach-landing.html`) — svet "Plate Math" (pôvodná iterácia pred rebrandom), založené `PRODUCT.md` a `DESIGN.md`.
