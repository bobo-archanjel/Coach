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

- **2026-08-28** — Klientsky portál `/portal` napojený na Supabase + auth guard (impeccable, prierezová Fáza B–D). Migrácia **`0003_portal_client.sql`** — aditívne k builderu kolegu (`0002_workout_builder`): `workout_days.weekday` (ktorý deň v týždni sa cvičí), `workout_logs`, `coach_notes` (RLS v štýle buildera). `lib/portal/data.ts` skladá dnešnú session, týždenný pás aj sériu z reálnych dát v zóne `Europe/Bratislava`; „aktívny" plán = najnovší plán klienta, cviky z `workout_days.exercises` (JSONB). Auth guard v `app/portal/layout.tsx`: bez session → `/prihlasenie`, tréner → `/dashboard` (v `next dev` bez session neredirectuje — `DEV_OPEN`, dočasné kým nie sú reálne kľúče). Prázdne/chybové stavy `Notice` (neprepojený klient / bez plánu / chyba, `role="alert"` + fokus na retry). Nový týždenný stav `missed`; pás „Séria" nesie informáciu (odcvičené / voľno / vynechané). `lib/mock/portal.ts` zmazaný, typy v `lib/portal/types.ts`. Demo dáta `supabase/seed/0001_portal_demo.sql`; `?preview=` na náhľad stavov bez DB. **Kontrast `.btn-primary` vyriešený:** plné tlačidlá dostali `--iron-red-deep` `#c3341f` (Warm Paper AA 4.78:1). Prešlo impeccable finish review (verdikt ship, 6 fixov). `DESIGN.md` aktualizované.
- **2026-08-27** — Klientsky portál `/portal` — Fáza A (Track 2, impeccable, mock dáta, bez backendu): nový mobile-first povrch, kde klient vidí dnešný tréning. Kompozícia „Oblúk tréningového dňa" (seed `7c5000e8`) — domov sa číta zhora nadol: pozdrav + odkaz trénera → coral prstenec postupu obopínajúci dnešný blok cvikov + CTA „Začať tréning" → séria + týždenný pás → tichý záver. Mobilný shell so spodnou navigáciou (Dnes / Tréning / Strava / Chat / Profil); Dnes je hotová, ostatné taby sú `coming-soon` (Fázy B/C/D). Stavy dnešného dňa: tréning / voľno / hotové. Prešlo impeccable finish review (7 fixov aplikovaných, verdikt ship). Makrá zámerne odložené. `DESIGN.md` doplnené o povrch `/portal`.
- **2026-08-27** — Vyčistený repozitár: odstránený `.claude/skills/impeccable/` (72-tisíc riadkov cudzej globálnej inštalácie skillu, omylom commitnuté iným prispievateľom priamo do `dev`), pridané `.claude/skills/` do `.gitignore`, nech sa to nezopakuje.
- **2026-08-27** — Funkčný frontend trénerského dashboardu (impeccable extend-existing-surface): sidebar navigácia so 4 sekciami (Klienti, Tréningy, Výživa, Nastavenia), zoznam klientov + detail (`/dashboard/klienti/[id]`), makro a tréningové vizualizácie — všetko na mock dátach (`lib/mock/dashboard.ts`), bez novej backend práce. Auth guard presunutý do `app/dashboard/layout.tsx` (platí pre celú sekciu). `DESIGN.md` doplnené o rozšírenú štruktúru dashboardu.
- **2026-08-27** — Dátový model: prvá migrácia `supabase/migrations/0001_profiles_clients.sql` (`profiles` s rolou trainer/client + trigger na auto-vytvorenie pri registrácii, `clients` s RLS scoped na `trainer_id`/`user_id`). `/dashboard` prerobený z holého placeholderu na skutočný roster-list čítajúci klientov z DB (empty state, kým nie je postavené pridávanie klientov). `DESIGN.md` doplnené o prvý draft dashboardu.
- **2026-08-27** — Supabase auth integrácia: cloud projekt `fitpilot` napojený (`@supabase/supabase-js` + `@supabase/ssr`, browser/server klienti, middleware na refresh session cookies). `/prihlasenie` prihlasuje a registruje naozaj (`signInWithPassword`/`signUp` namiesto `setTimeout` simulácie), rola `trainer` sa zatiaľ ukladá do `user_metadata` (DB tabuľky ešte nie sú, pozri ďalší krok). Pridaný chránený placeholder `/dashboard` (redirect na `/prihlasenie` bez session).
- **2026-08-27** — Landing page a Prihlásenie/Registrácia naostro: Next.js 15 (App Router, TS) + Tailwind v4 kostra založená v koreni repa, oba mockupy portované 1:1 (CSS Modules, farebné tokeny z DESIGN.md, Inter cez `next/font/google`, auth ako riadená React komponenta s reálnou validáciou/loading/success stavmi namiesto vanilla JS). Nahradené `design/*.html` mockupy zmazané. Nainštalovaný skill **impeccable** (`/impeccable init` spustený, `PRODUCT.md` potvrdený ako aktuálny, build workflow nastavený na code-first).
- **2026-08-27** — Bod 0 rozhodnutý: Next.js app pôjde do koreňa repa (`design/` ostáva ako referencia počas portovania), Supabase vývoj na cloud projekte (self-hosted `nexus` presun až pred produkciou), secrets cez `.env.local` podľa novej `.env.local.example` šablóny. Zdokumentované v README sekcii "Infra rozhodnutia".
- **2026-08-27** — Repozitár napojený na GitHub (`bobo-archanjel/Coach`), založené vetvy `main`/`dev`/`test`, pridaný README s povinnosťou aktualizácie pri každom push.
- **2026-08-27** — Rebrand na **FitPilot** podľa dodaného brand kitu (logo, farby, Inter typografia, zaoblené UI, ikonové dlaždice) — aplikované na landing page aj auth stránku.
- **2026-08-27** — Prepojenie landing page ↔ Prihlásenie/Registrácia (nav CTA, cenníkové tlačidlá, `#register` deep-link, logo späť na landing).
- **2026-08-27** — Vytvorená stránka **Prihlásenie / Registrácia** (`design/fitcoach-auth.html`) — Operate povrch, reálne validácie a stavy (loading, error, success), pozývací kód pre klienta.
- **2026-08-27** — Vytvorený **landing page** koncept (`design/fitcoach-landing.html`) — svet "Plate Math" (pôvodná iterácia pred rebrandom), založené `PRODUCT.md` a `DESIGN.md`.
