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

- **2026-08-28** — Odklikávanie tréningu (Fáza A) + aktivita na strane trénera (`feature/client-side`): klient v portáli klikne "Začať tréning" (lokálny prepínač, cviky sú už vypísané v karte Dnes) a potom "Ukončiť tréning" — nová Server Action `finishWorkoutAction` (`app/portal/actions.ts`) vloží riadok do `workout_logs` (RLS aj unique index na `(client_id, workout_day_id, performed_on)` už boli pripravené v `0003_portal_client.sql`). Po úspechu sa `/portal` zrevaliduje, "Dnes" karta prejde do stavu "Tréning hotový". Na strane trénera pribudla tretia karta "Posledná aktivita" na `/dashboard/klienti/[id]` — posledných 8 odcvičených dní. Db schéma trainer/client (1 tréner → veľa klientov cez `clients.trainer_id`, klient môže mať aj viacero trénerov naraz) ostáva bezo zmeny, potvrdené ako zámerné.

- **2026-08-28** — Portál responzívny ako dashboard trénera (`feature/client-side`): predtým bol natrvalo v `max-width: 460px` stĺpci aj na desktope — vyzeralo to ako telefón uprostred veľkého okna. Nad 880px je teraz `.viewport` CSS grid `240px 1fr` presne ako `dashboard.module.css`: `PortalNav` sa stáva ľavým sidebarom (brand, položky, odhlásenie dole), obsah sa rozšíri na `max-width: 760px`. Pod 880px sa nič nemenilo — pôvodný mobilný "Oblúk tréningového dňa" shell (centrovaný stĺpec, bottom tab bar) ostáva presne taký, ako ho postavil Mato.

- **2026-08-28** — Odhlásenie v klientskom portáli (`feature/client-side`): `SignOutButton` presunuté z `app/dashboard/` do zdieľanej `app/components/`, nech ho môžu používať obe strany bez krížového importu medzi trénerskou a klientskou vetvou. Zobrazuje sa na `/portal/profil`.

- **2026-08-28** — Opravené presmerovanie po prihlásení + dostavané taby Tréning/Strava v klientskom portáli (`feature/client-side`): prihlásenie posielalo úplne každého na `/dashboard` bez ohľadu na rolu, takže klient skončil na trénerskom dashboarde (opravené — presmerovanie podľa `profiles.role`, symetrický guard doplnený aj do `app/dashboard/layout.tsx`). `/portal/trening` a `/portal/strava` boli len "ComingSoon" placeholder — klient nevidel plán/makrá/jedálniček, ktoré mu tréner nastavil. Teraz `/portal/trening` ukazuje celý aktívny tréningový plán a `/portal/strava` makro cieľ + najnovší jedálniček (nové loadery `getPortalTraining`/`getPortalNutrition` v `lib/portal/data.ts`). Vizuálne zatiaľ znovupoužívajú primitíva karty Dnes (`.panel`, `.exList`), vlastný redizajn nebol súčasťou tejto úlohy.

- **2026-08-28** — Registrácia trénera vs. klienta explicitne rozdelená (`feature/client-side`): predtým bol pozývací kód schovaný za voliteľný "mám kód" prepínač dole pod formulárom — klient, ktorý o ňom nevedel, sa nevedomky zaregistroval ako tréner. Teraz je hneď na začiatku záložky Registrácia segmentovaný prepínač "Som tréner" / "Som klient — mám kód", ktorý mení nadpis, poradie polí (kód je pri klientovi prvé povinné pole) aj text tlačidla. Odstránené mŕtve kusy starého UI (`.dividerRow`, `.inviteToggle`, `.invitePanel`).

- **2026-08-28** — Opravená registrácia klienta cez pozývací kód (`feature/client-side`): panel "Som klient a mám pozývací kód" na `/prihlasenie` bol vizuálne hotový, ale funkčne mŕtvy — input mimo `<form>`, tlačidlo "Overiť kód" bez handlera, registrácia vždy vytvorila trénera bez ohľadu na kód. Teraz vyplnený kód nastaví rolu klienta a po registrácii sa účet spáruje s riadkom v `clients` cez novú RPC `claim_client_by_invite` (migrácia `0006_client_invite_claim.sql`, `security definer` — priamy RLS update by dovolil komukoľvek nárokovať si cudzí nespárovaný riadok bez znalosti kódu). Úspech → `/portal`; neplatný/použitý kód → čitateľná chyba.

- **2026-08-28** — Klientsky portál `/portal` napojený na Supabase + auth guard (Track "Klient", `feature/client-side`, impeccable, prierezová Fáza B–D). Migrácia **`0003_portal_client.sql`** — aditívne k builderu (`0002_workout_builder`): `workout_days.weekday` (ktorý deň v týždni sa cvičí), `workout_logs`, `coach_notes` (RLS v štýle buildera). `lib/portal/data.ts` skladá dnešnú session, týždenný pás aj sériu z reálnych dát v zóne `Europe/Bratislava`; „aktívny" plán = najnovší plán klienta, cviky z `workout_days.exercises` (JSONB). Auth guard v `app/portal/layout.tsx`: bez session → `/prihlasenie`, tréner → `/dashboard` (v `next dev` bez session neredirectuje — `DEV_OPEN`, dočasné kým nie sú reálne kľúče). Prázdne/chybové stavy `Notice` (neprepojený klient / bez plánu / chyba, `role="alert"` + fokus na retry). Nový týždenný stav `missed`; pás „Séria" nesie informáciu (odcvičené / voľno / vynechané). `lib/mock/portal.ts` zmazaný, typy v `lib/portal/types.ts`. Demo dáta `supabase/seed/0001_portal_demo.sql`; `?preview=` na náhľad stavov bez DB. **Kontrast `.btn-primary` vyriešený:** plné tlačidlá dostali `--iron-red-deep` `#c3341f` (Warm Paper AA 4.78:1). Prešlo impeccable finish review (verdikt ship, 6 fixov). `DESIGN.md` aktualizované. **Follow-up pre builder:** nastavovať `workout_days.weekday`, inak portál ukáže „voľno".
- **2026-08-28** — Jedálničky naostro (Track "Tréner"): migrácia `0005_meal_plans.sql` (`foods` — globálna knižnica potravín s makrami na 100 g + vlastné potraviny trénera, `meal_plans`, `meal_days` s jedlami ako jsonb pole, RLS aj pre klientský portál). `/dashboard/vyziva/[clientId]` má teraz aj zoznam jedálničkov klienta + vytvorenie nového. Detail jedálničku (`/dashboard/vyziva/jedalnicek/[planId]`) je rovnaká split-view architektúra ako tréningový builder — knižnica potravín vľavo (klik = 100 g do aktívneho dňa), dni ako tabs vpravo, položky zoskupené podľa jedla dňa (raňajky/desiata/obed/olovrant/večera/iné) s inline úpravou jedla dňa a gramáže, súčet makier za celý deň hore. `lib/meals.ts` prepočítava makrá z gramáže (rovnaký vzor ako `lib/nutrition.ts`). `node detect.mjs` bez nálezov.
- **2026-08-28** — Opravená nekonzistentná výška top baru (logo + odhlásiť) na mobile: `.sidebar` mala `height: auto`, takže na stránkach bez vertikálneho scrollbaru (Nastavenia, Výživa s málo obsahom) vychádzala inak vysoká než na stránkach so scrollbarom (ten uberá ~15-17px šírky a mení, ako sa "Odhlásiť sa" zmestí vedľa loga). Pevná `height: 56px` + menšie odhlasovacie tlačidlo a `white-space: nowrap` na branding, nech je bar rovnaký na každej stránke.
- **2026-08-28** — Potlačené falošné hydration varovanie na `<html>`: spôsobené browser extension (napr. prekladač) vkladajúcim vlastné atribúty (`webcrx`) pred hydratáciou, nie bugom v kóde. Pridané `suppressHydrationWarning` na `<html>` v `app/layout.tsx`.
- **2026-08-28** — Mobile-first responzívny pass cez celý frontend (Track "Tréner", cez impeccable `adapt`): appka smeruje primárne na telefón pre obe role (upresnené v PRODUCT.md), nielen klienta. Dashboard shell dostal namiesto horizontálneho top-scroll nav **fixnú bottom tab bar** (`env(safe-area-inset-bottom)`, `viewport.viewportFit: "cover"` v `app/layout.tsx`). Tréningový builder: na mobile ide plátno (aktívny deň) prvé, knižnica cvikov je defaultne zbalená (toggle), `.exerciseRow` a `.editForm` prerobené z natlačeného jedného riadku na prehľadný grid s viditeľnými labelmi. Opravený iOS Safari zoom-bug (inputy pod 16px font-size) naprieč auth aj dashboardom, ikonové tlačidlá a `.btn-sm` dotiahnuté na min. 44px dotykový cieľ. `node detect.mjs` bez nálezov.
- **2026-08-28** — Nutričný modul naostro (Track "Tréner", `feature/trener`): migrácia `0004_nutrition.sql` (`nutrition_profiles`, jeden aktuálny profil na klienta, RLS aj pre budúci klientský portál). BMR/TDEE výpočet (Mifflin-St Jeor, `lib/nutrition.ts`) + makro cieľ (bielkoviny/sacharidy/tuky) podľa pohlavia/veku/váhy/výšky/aktivity/cieľa. `/dashboard/vyziva`: zoznam klientov s náhľadom makier; `/dashboard/vyziva/[clientId]`: formulár so live náhľadom výsledku pri písaní. Detail klienta teraz zobrazuje aj priradený makro cieľ.
- **2026-08-28** — Detail klienta zobrazuje reálne tréningové plány (Track "Tréner", `feature/trener`): karta "Tréningy a výživa" na `/dashboard/klienti/[id]` bola zastaraný placeholder z čias pred tréningovým builderom — po vytvorení plánu ho tréner na karte klienta nevidel. Nahradené zoznamom skutočných `workout_plans` klienta (link na builder), nutričný placeholder ostáva.
- **2026-08-28** — Opravený latentný crash na `/dashboard` a `/dashboard/treningy` (Track "Tréner", `feature/trener`): obe stránky robili vlastný `supabase.auth.getUser()` call nezávislý od auth guardu v `layout.tsx` a spoliehali sa na `user!.id` bez kontroly. Pri studenom štarte servera (session cookie ešte neoverená) sa výsledky mohli rozísť a stránka spadla s `TypeError: Cannot read properties of null (reading 'id')`. Pridaný rovnaký `if (!user) redirect("/prihlasenie")` guard ako v layout.
- **2026-08-27** — Klientsky portál `/portal` — Fáza A (Track 2, impeccable, mock dáta, bez backendu): nový mobile-first povrch, kde klient vidí dnešný tréning. Kompozícia „Oblúk tréningového dňa" (seed `7c5000e8`) — domov sa číta zhora nadol: pozdrav + odkaz trénera → coral prstenec postupu obopínajúci dnešný blok cvikov + CTA „Začať tréning" → séria + týždenný pás → tichý záver. Mobilný shell so spodnou navigáciou (Dnes / Tréning / Strava / Chat / Profil); Dnes je hotová, ostatné taby sú `coming-soon` (Fázy B/C/D). Stavy dnešného dňa: tréning / voľno / hotové. Prešlo impeccable finish review (7 fixov aplikovaných, verdikt ship). Makrá zámerne odložené. `DESIGN.md` doplnené o povrch `/portal`.
- **2026-08-27** — Redizajn tréningového buildera (Track "Tréner", `feature/trener`, cez impeccable): pôvodné naukladané formuláre na `/dashboard/treningy/[planId]` nahradené split-view builderom (knižnica cvikov vľavo s vyhľadávaním a klik-na-pridanie, dni ako tabs vpravo, inline edit/delete cvikov bez modálov). Zvolené z 3 navrhnutých štruktúr (programový hárok / knižnica+plátno / kanban stĺpce). Nové Server Actions: `updateExerciseEntryAction`, `removeExerciseEntryAction`; cviky v `workout_days.exercises` majú teraz vlastné `entry_id` pre spoľahlivú úpravu/mazanie.
- **2026-08-27** — Tréningový builder naostro (Track "Tréner", `feature/trener`): migrácia `0002_workout_builder.sql` (`exercises` s globálnou knižnicou + vlastné cviky trénera, `workout_plans`, `workout_days` s cvikmi ako jsonb pole, RLS aj pre budúci klientský portál). `/dashboard/treningy`: vytvorenie plánu pre klienta, pridávanie dní a cvikov (série/opakovania/záťaž/tempo/pauza), správa knižnice cvikov.
- **2026-08-27** — Pridávanie klientov naostro (Track "Tréner", `feature/trener`): formulár na `/dashboard` (Server Action `addClientAction`, `useActionState`), zoznam a detail klienta čítajú reálne dáta z `clients` tabuľky namiesto mock dát. Odstránený status chip aktívny/meškanie (nebola za ním reálna dáta) a `lib/mock/dashboard.ts`. Tréningy/Výživa teraz honestne "ešte nepostavené", kým nepribudnú príslušné tabuľky.
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
