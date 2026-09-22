# FitPilot — čakacia listina (waitlist)

Úplne samostatná statická stránka, nezávislá od zvyšku appky (Next.js buildu sa
vôbec nedotýka). Celý obsah tohto priečinka (`waitlist/`) sa dá nahrať priamo
na Websupport hosting bez akéhokoľvek build kroku.

## Čo to je

- `index.html` — hlavná landing page s formulárom na čakaciu listinu
- `privacy.html` — krátka stránka ochrany súkromia (len pre túto čakaciu listinu)
- `css/style.css` — brand tokeny (farby z DESIGN.md) + malé doplnky k Tailwindu
- `js/main.js` — GSAP scroll reveal, FAQ accordion, odoslanie formulára do Supabase
- `assets/` — logo, favicon, OG obrázok (skopírované z hlavnej appky)

Štýlovanie ide cez **Tailwind CDN** (`<script src="https://cdn.tailwindcss.com">`)
— žiadny build krok, žiadny Node. Animácie cez **GSAP** (CDN) — len na sekciách
pod hero, nikdy na H1/CTA (JS-viazaná animácia na prvej viditeľnej veci škodí
LCP — poučenie z opravy `/v4` v hlavnej appke).

> **Prečo Tailwind CDN, nie kompilovaný CSS:** pre jednu nízko-návštevovú
> waitlist stránku je jednoduchosť nasadenia (žiadny build, žiadny Node na
> hostingu) dôležitejšia než pár desiatok kB navyše. Ak appka pred launchom
> dostane vyššiu návštevnosť a bude sa oplatiť Lighthouse skóre doladiť,
> najjednoduchšia cesta je skompilovať Tailwind CLI lokálne (`npx tailwindcss
> -o css/tailwind.css --minify`) a nahradiť CDN script tag odkazom na tento
> súbor — netreba meniť HTML štruktúru ani triedy.

## 1. Lokálne vyskúšanie

Netreba nič inštalovať — stačí otvoriť `index.html` priamo v prehliadači, alebo:

```bash
cd waitlist
python -m http.server 8000
# http://localhost:8000
```

## 2. Databáza — spustiť migráciu

V Supabase Dashboarde → SQL Editor → New query → vlož celý obsah
`supabase/migrations/0038_waitlist.sql` → Run. Vytvorí tabuľku
`waitlist_signups` s RLS (anon smie len INSERT, nikto iný zoznam nevidí).

Supabase URL a anon kľúč sú už v `js/main.js` — rovnaký projekt ako hlavná
appka (anon kľúč je verejný by design, bezpečnosť drží RLS, nie jeho utajenie).

## 3. Nahratie na Websupport hosting

1. Websupport administrácia → tvoj hosting → **Súbory / File Manager** (alebo FTP
   prihlasovacie údaje, ktoré nájdeš v administrácii hostingu).
2. Nahraj **celý obsah priečinka `waitlist/`** (nie priečinok samotný, ale to čo je
   v ňom) do koreňového priečinka webu (zvyčajne `public_html` alebo `www`).
3. Over že `index.html` je priamo v koreni (t.j. `myfitpilot.eu/index.html`, nie
   `myfitpilot.eu/waitlist/index.html`).
4. Otestuj `myfitpilot.eu` v prehliadači, vyplň formulár, over že sa e-mail objaví
   v Supabase (Dashboard → Table Editor → waitlist_signups).

## 4. Potvrdzovací e-mail (voliteľné, ale chceli ste ho)

Potvrdzovací e-mail posiela Supabase Edge Function cez [Resend](https://resend.com)
(free tier: 100 e-mailov/deň, 3000/mesiac — na waitlist viac než dosť).

**a) Založ účet na resend.com** (zadarmo) a over doménu `myfitpilot.eu`:
   - Resend Dashboard → Domains → Add Domain → `myfitpilot.eu`
   - Pridá ti DNS záznamy (SPF, DKIM) — vlož ich vo Websupporte pri správe domény
     (DNS záznamy sekcia). Bez tohto Resend nedovolí odosielať z `info@myfitpilot.eu`.
   - Počkaj na "Verified" stav (zvyčajne pár minút až hodín).
   - Skopíruj si API kľúč (Resend Dashboard → API Keys → Create).

**b) Nasaď edge function** (potrebuješ [Supabase CLI](https://supabase.com/docs/guides/cli)):
   ```bash
   supabase login
   supabase link --project-ref egpnjtmxproprtwgcwbg
   supabase functions deploy send-waitlist-confirmation
   supabase secrets set RESEND_API_KEY=re_tvoj_kluc_z_resend
   ```

**c) Zapoj Database Webhook** (Supabase Dashboard → Database → Webhooks → Create a new hook):
   - Name: `waitlist-confirmation`
   - Table: `waitlist_signups`, Event: `Insert`
   - Type: **Supabase Edge Functions**
   - Edge Function: `send-waitlist-confirmation`
   - Ulož.

**d) Over end-to-end:** vyplň formulár na `myfitpilot.eu`, do pár sekúnd by mal
prísť e-mail. Ak nie, skontroluj Supabase Dashboard → Edge Functions →
`send-waitlist-confirmation` → Logs (zobrazí presnú chybu — najčastejšie
nedokončená DNS verifikácia domény v Resende).

**Ak potvrdzovací e-mail zatiaľ nechceš riešiť:** formulár funguje aj bez neho —
e-mail sa uloží do databázy, len sa neodošle potvrdenie. Kroky a)-c) vyššie
môžeš spraviť aj neskôr, bez zásahu do `index.html`/`js/main.js`.

## 5. Pri spustení appky naostro

1. Appku nasaď na Node hosting (napr. Vercel — pozri poznámku v hlavnom README appky).
2. Vo Websupporte pri doméne `myfitpilot.eu` preptrni DNS záznamy z tohto hostingu
   na nový hosting appky.
3. Tento hosting (Websupport Simple 1GB) môžeš zrušiť alebo nechať dobehnúť do
   konca predplateného obdobia — doména ostáva tvoja, mení sa len kam smeruje.
