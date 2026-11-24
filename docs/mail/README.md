# E-maily klientom a uvítacia správa (branding, bod 2)

Tri veci, všetky dostupné vo **všetkých tarifách** (značka trénera v e-mailoch je len pri **Business**):

1. **Uvítacia správa v chate** — tréner napíše text raz (Nastavenia → Komunikácia s klientmi, max. 1000 znakov, `{meno}` = krstné meno klienta). Keď sa klient spáruje s trénerom (kód FP-… cez `add_client_by_code` aj pozvánka cez `claim_invite`), dostane ho ako bežnú správu v chate **od trénera**.
2. **Pozvánka e-mailom** — tréner zadá e-mail (+ voliteľne meno), klient dostane e-mail s odkazom. Business: logo, názov, farba trénera a odkaz `/pozvanka/<odkaz>` (jedným klikom sa pripojí). Ostatné tarify: e-mail FitPilot s odkazom na registráciu a návodom (po registrácii nájde v Profile svoj kód FP-… a pošle ho trénerovi).
3. **Týždenné zhrnutie „Tvoj týždeň“ e-mailom** — Vercel Cron každý pondelok ráno. Klient ho môže vypnúť v Profile alebo odkazom v e-maile.

## Migrácia

Spusti `supabase/migrations/0082_branding_comms.sql` v Supabase SQL Editore (idempotentná). Bez nej: uvítacia správa a e-maily sa nespustia (appka nespadne, len nič neurobí). Spusti ju **pred** nasadením kódu.

## Premenné prostredia (lokálne `.env.local` aj Vercel → Settings → Environment Variables)

| Premenná | Čo | Príklad |
|---|---|---|
| `SMTP_HOST` | SMTP server (Websupport) | `smtp.m1.websupport.sk` |
| `SMTP_PORT` | port; 465 = implicitné TLS, iné porty vyžadujú STARTTLS | `465` |
| `SMTP_USER` | prihlasovacie meno | `info@myfitpilot.sk` |
| `SMTP_PASSWORD` | heslo schránky | tajné, nikdy do repozitára |
| `MAIL_FROM_ADDRESS` | adresa odosielateľa (musí patriť schránke) | `info@myfitpilot.sk` |
| `CRON_SECRET` | tajomstvo cronu (min. 16 znakov, náhodné). Vercel ho posiela ako `Authorization: Bearer …` | `openssl rand -hex 32` |
| `MAIL_UNSUBSCRIBE_SECRET` | (voliteľné) kľúč na podpis odhlasovacích odkazov a hashovanie adries; bez neho sa odvodí z `CRON_SECRET` | `openssl rand -hex 32` |
| `NEXT_PUBLIC_SITE_URL` | verejná doména — základ všetkých odkazov v e-mailoch (musí byť nastavená aj na Verceli!) | `https://myfitpilot.sk` |

Bez `SMTP_*` / `MAIL_FROM_ADDRESS` je odosielanie zalogovaný no-op (formulár v Nastaveniach to oznámi, nič nespadne). Bez `CRON_SECRET` cron endpoint odmieta všetky požiadavky (401). **Zmena `MAIL_UNSUBSCRIBE_SECRET` / `CRON_SECRET` zneplatní už rozoslané odhlasovacie odkazy** a hashe adries odhlásených z pozvánok.

## Vercel Cron

`vercel.json` obsahuje dva záznamy na `/api/cron/weekly-summary`:

- `0 6 * * 1` — pondelok 06:00 UTC (= 07:00 v zime / 08:00 v lete v Bratislave),
- `30 6 * * 1` — druhý beh o pol hodiny neskôr, ktorý dokončí zvyšok, ak prvý nestihol (časový rozpočet 45 s).

Beh je **idempotentný** (tabuľka `weekly_summary_log`, jedinečné `(client_id, week_start)`): jeden e-mail na klienta a týždeň, opakovanie nič nezdvojí. Na Verceli nastav `CRON_SECRET` — Vercel potom cron volá s `Authorization: Bearer <CRON_SECRET>`.

Pravidlá posielania: klient má účet s e-mailom, nevypol zhrnutie, tréner má aktívny prístup. Týždeň s aktivitou → plné zhrnutie; týždeň bez aktivity, ale aktivita v 2 týždňoch predtým → jemné povzbudenie; **3 a viac týždňov bez aktivity → nič**.

## Ako to otestovať lokálne

1. Do `.env.local` daj `SMTP_*`, `MAIL_FROM_ADDRESS`, `CRON_SECRET` (aspoň 16 znakov). Spusti `npm run dev`.
2. Pozvánka: Nastavenia → Komunikácia s klientmi → „Pozvať klienta e-mailom“ (pošli si ju na vlastnú adresu).
3. Cron ručne (PowerShell/bash; secret nikam nevypisuj):
   `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/weekly-summary`
   Odpoveď je JSON so štatistikou (`sent`, `skipped`, `failed`, `truncated`). Bez hlavičky / s nesprávnym secretom je 401.
   Pozor: pošle SKUTOČNÉ e-maily všetkým klientom v databáze, na ktorú je appka napojená — lokálne na dev DB s testovacími účtami, nie na produkčnej.
4. Opakované volanie za ten istý týždeň nepošle nič nové (`skipped.already_sent`). Na nový pokus zmaž riadok z `weekly_summary_log`.
5. Odhlásenie: odkaz v e-maile → potvrdzovacia stránka (GET nič nemení) → tlačidlo (POST). Rovnaká adresa prijíma aj „One-Click“ POST z poštových klientov (hlavičky `List-Unsubscribe`, `List-Unsubscribe-Post`).
6. Automatické testy (bez siete, bez SMTP): `npx playwright test e2e/mail.spec.ts`.

## Ochrana proti zneužitiu (pozvánky = potenciálny spam relay)

- Server action: prihlásený **tréner**, `trainerBlock()` (read-only účet nepošle nič), formát e-mailu a mena (len písmená, max. 40 znakov) — **žiadny voľný text od trénera** sa do e-mailu nedostane okrem už validovaného uvítacieho textu z pozvánky (max. 300 znakov, Business). Všetko sa pri vykreslení escapuje.
- Limity na trénera v DB (atómovo, `reserve_mail_send`): **20 / hodinu, 50 / 24 hodín**; tá istá adresa od toho istého trénera najviac **1× za 24 h**; globálny strop **500 pozvánok / 24 h** na celú appku. Navyše krátky limit v pamäti (6 / min).
- V DB sa ukladá len **HMAC hash adresy** (nie e-mail), nad `mail_send_log` majú prístup len service role.
- Príjemca sa môže z pozvánok **odhlásiť celoplošne** (`mail_suppressions`); tréner sa nedozvie, že sa odhlásil (odpoveď vyzerá ako úspech).
- Hlavičky: CR/LF a riadiace znaky sa odstraňujú; `From` má vždy adresu z `MAIL_FROM_ADDRESS` a meno `"<Značka> (FitPilot)"` (nedá sa vydávať za iného odosielateľa); `Reply-To` = e-mail účtu trénera (odpoveď ide jemu).
- Odhlasovací token je HMAC-podpísaný, s expiráciou (400 dní), porovnanie v konštantnom čase; GET nič nemení.
- Cron: `Authorization: Bearer ${CRON_SECRET}` (porovnanie hashov, fail-closed bez secretu); service role číta dáta vždy po jednom klientovi a posiela len na adresu jeho účtu.
- Zlyhané odoslanie uvoľní rezerváciu limitu (tréner o limit neprichádza).

## Poznámky a obmedzenia

- Logo v e-maile je verejná URL zo Supabase bucketu `branding` (WebP). Outlook pre desktop WebP nezobrazí — vtedy sa ukáže názov značky (alt text). Gmail, Apple Mail a mobilní klienti WebP zobrazujú.
- Uvítacia správa sa **neposiela pri obnovení spolupráce** (klient trénera pozná a správu už dostal) ani pri spárovaní starým kódom `claim_client_by_invite` (klient vytvorený trénerom, ktorý už trénera má). Jedno uvítanie na dvojicu klient–tréner za 30 dní (ochrana pred zdvojením pri opakovanom spárovaní), a pri zaplavení chatu (25+ správ trénera za minútu) sa vynechá, nikdy nezruší spárovanie.
- `Reply-To` prezrádza klientovi e-mail účtu trénera (ktorého už pozná) — zámer, aby odpoveď šla priamo trénerovi.
- Posielanie z `info@myfitpilot.sk` vyžaduje správne **SPF, DKIM a DMARC** pre doménu (Websupport ich ponúka) — inak budú e-maily končiť v spame.
