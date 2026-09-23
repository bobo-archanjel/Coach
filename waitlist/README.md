# FitPilot — čakacia listina (waitlist)

Úplne samostatná statická stránka, nezávislá od zvyšku appky (Next.js buildu sa
vôbec nedotýka). Celý obsah tohto priečinka (`waitlist/`) sa dá nahrať priamo
na Websupport hosting bez akéhokoľvek build kroku.

**Finálna doména je `myfitpilot.sk`** — `myfitpilot.eu` je len presmerovanie
(nastavuje sa vo Websupporte pri správe domény `.eu`, nie v kóde). Táto stránka
aj Resend (potvrdzovací e-mail, krok 4 nižšie) sa vážu na `myfitpilot.sk`.

## Čo to je

- `index.html` — hlavná landing page s formulárom na čakaciu listinu
- `privacy.html` — krátka stránka ochrany súkromia (len pre túto čakaciu listinu)
- `css/tailwind-input.css` → skompilovaný do `css/tailwind.css` (netreba nahrávať
  `tailwind-input.css` na hosting, len výsledný `tailwind.css` — je to zdrojový
  súbor, nie výstup; prekompiluje sa pri zmene tried, viď nižšie)
- `css/style.css` — brand tokeny (farby z DESIGN.md) + malé doplnky k Tailwindu
- `js/main.js` — GSAP scroll reveal, FAQ accordion, odoslanie formulára cez
  edge function `submit-waitlist` (nie priamo do Supabase — pozri bod 3 nižšie)
- `assets/` — logo, favicon, OG obrázok (skopírované z hlavnej appky)
- `robots.txt`, `sitemap.xml` — **vlastné pre túto doménu, oddelené od appky.**
  Hlavná appka má vlastný `robots.ts`/`sitemap.ts` (Next.js), ale ten sa uplatní
  až keď appka bude bežať na `myfitpilot.sk` — dovtedy je na doméne len táto
  statická čakacia listina, takže potrebuje vlastné súbory (pozri bod 5 nižšie).

Štýlovanie ide cez **vopred skompilovaný Tailwind** (`css/tailwind.css`, viď
nižšie) — žiadny Node na samotnom hostingu, kompiluje sa len tu, jedenkrát,
predtým než sa priečinok nahrá. Animácie cez **GSAP** (CDN) — len na sekciách
pod hero, nikdy na H1/CTA (JS-viazaná animácia na prvej viditeľnej veci škodí
LCP — poučenie z opravy `/v4` v hlavnej appke). Ak GSAP z akéhokoľvek dôvodu
zlyhá (blokovač reklám, výpadok), `js/main.js` má zabudovanú poistku — obsah
sa aj tak ukáže cez natívny IntersectionObserver namiesto GSAP.

> **Prečo skompilovaný CSS, nie Tailwind CDN skript:** stránka pôvodne používala
> `<script src="https://cdn.tailwindcss.com">`, čo je jednoduchšie na nasadenie,
> ale beží AŽ po stiahnutí a vykonaní JS a triedy prepočítava za behu v
> prehliadači — reálny Lighthouse audit ukázal 1.58s "render-blocking" práve
> kvôli tomuto (plus Google Fonts `@import`, tiež opravené). Skompilovaný CSS
> (12 kB) je rovnako jednoduchý na nahratie (jeden statický súbor), len sa
> musí prekompilovať pri KAŽDEJ zmene Tailwind tried v `index.html`/`privacy.html`:
> ```bash
> cd waitlist
> npx @tailwindcss/cli -i css/tailwind-input.css -o css/tailwind.css --minify
> ```
> `css/tailwind-input.css` obsahuje brand farby/font/radius (`@theme` blok) —
> zmena farby sa robí tam, nie v `css/tailwind.css` (ten sa vždy prepíše nanovo).

## 1. Lokálne vyskúšanie

Netreba nič inštalovať — stačí otvoriť `index.html` priamo v prehliadači, alebo:

```bash
cd waitlist
python -m http.server 8000
# http://localhost:8000
```

## 2. Databáza — spustiť migrácie

V Supabase Dashboarde → SQL Editor → New query → postupne vlož a spusti (v
tomto poradí, každú ako samostatný Run):
`supabase/migrations/0038_waitlist.sql` → `0039_waitlist_role_client.sql` →
`0040_waitlist_antispam.sql`.

Vytvorí tabuľku `waitlist_signups` s RLS (anon nemá k tabuľke ŽIADNY priamy
prístup — zápis ide výhradne cez edge function `submit-waitlist`, pozri
bod 3.5 nižšie; nikto okrem service_role zoznam nikdy nevidí).

Supabase URL a anon kľúč sú už v `js/main.js` — rovnaký projekt ako hlavná
appka (anon kľúč je verejný by design; hranicu tu drží kombinácia edge
function + CAPTCHA, nie RLS ako pri bežných tabuľkách appky).

## 3. Ochrana proti spamu a botom (Cloudflare Turnstile) — POVINNÉ

Bez tohto kroku formulár **nefunguje vôbec** (odošle sa vždy chyba
"Over prosím, že nie si robot") — nie je to voliteľné vylepšenie, je to
súčasť antispam ochrany popísanej nižšie.

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Turnstile** (v ľavom menu, zadarmo,
   netreba mať doménu už spravovanú cez Cloudflare).
2. **Add a site** → doména `myfitpilot.sk`, widget mode **Managed** (odporúčané —
   väčšine ľudí sa nič nezobrazí, len tichá kontrola na pozadí).
3. Dostaneš dva kľúče:
   - **Site Key** (verejný) → vlož do `waitlist/index.html`, nahraď
     `data-sitekey="TODO_TURNSTILE_SITE_KEY"` skutočnou hodnotou.
   - **Secret Key** → nastav ako function secret v kroku 3.5 nižšie, nikdy nie
     do HTML/JS súborov (na rozdiel od Site Key, tento je tajný).
4. Ulož zmenu v `index.html`.

**3.5 — nasadenie edge function `submit-waitlist`** (rovnaké CLI kroky ako pri
potvrdzovacom e-maile nižšie, ak si ich ešte nerobil):
```powershell
npx supabase login
npx supabase link --project-ref egpnjtmxproprtwgcwbg
npx supabase functions deploy submit-waitlist
npx supabase secrets set TURNSTILE_SECRET_KEY=0x_tvoj_secret_kluc_z_kroku_3
```

Ako to funguje: formulár teraz posiela zápis na túto funkciu (nie priamo do
databázy). Funkcia overí CAPTCHA token na serveri (token z prehliadača sa dá
sfalšovať, preto sa MUSÍ overiť tu), skryté honeypot pole a limit 5 zápisov
za 24h z jednej IP adresy — až potom zapíše cez service_role.

## 4. Nahratie na Websupport hosting

1. Websupport administrácia → tvoj hosting → **Súbory / File Manager** (alebo FTP
   prihlasovacie údaje, ktoré nájdeš v administrácii hostingu).
2. Nahraj **celý obsah priečinka `waitlist/`** (nie priečinok samotný, ale to čo je
   v ňom) do koreňového priečinka webu (zvyčajne `public_html` alebo `www`).
3. Over že `index.html` je priamo v koreni (t.j. `myfitpilot.sk/index.html`, nie
   `myfitpilot.sk/waitlist/index.html`).
4. Otestuj `myfitpilot.sk` v prehliadači, vyplň formulár, over že sa e-mail objaví
   v Supabase (Dashboard → Table Editor → waitlist_signups).

## 5. Potvrdzovací e-mail (voliteľné, ale chceli ste ho)

Potvrdzovací e-mail posiela Supabase Edge Function cez [Resend](https://resend.com)
(free tier: 100 e-mailov/deň, 3000/mesiac — na waitlist viac než dosť).

**a) Založ účet na resend.com** (zadarmo) a over doménu `myfitpilot.sk`:
   - Resend Dashboard → Domains → Add Domain → `myfitpilot.sk`
   - Pridá ti DNS záznamy (SPF, DKIM) — vlož ich vo Websupporte pri správe domény
     (DNS záznamy sekcia). Bez tohto Resend nedovolí odosielať z `info@myfitpilot.sk`.
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

**d) Over end-to-end:** vyplň formulár na `myfitpilot.sk`, do pár sekúnd by mal
prísť e-mail. Ak nie, skontroluj Supabase Dashboard → Edge Functions →
`send-waitlist-confirmation` → Logs (zobrazí presnú chybu — najčastejšie
nedokončená DNS verifikácia domény v Resende).

**Ak potvrdzovací e-mail zatiaľ nechceš riešiť:** formulár funguje aj bez neho —
e-mail sa uloží do databázy, len sa neodošle potvrdenie. Kroky a)-c) vyššie
môžeš spraviť aj neskôr, bez zásahu do `index.html`/`js/main.js`.

## 6. Pri spustení appky naostro

1. Appku nasaď na Node hosting (napr. Vercel — pozri poznámku v hlavnom README appky).
2. Vo Websupporte pri doméne `myfitpilot.sk` prepni DNS záznamy z tohto hostingu
   na nový hosting appky.
3. Tento hosting (Websupport Simple 1GB) môžeš zrušiť alebo nechať dobehnúť do
   konca predplateného obdobia — doména ostáva tvoja, mení sa len kam smeruje.
4. `robots.txt` a `sitemap.xml` z tohto priečinka (`waitlist/`) sa netreba mazať
   ručne — hneď ako DNS/hosting ukazuje na appku, prevezmú ich miesto appkine
   vlastné `app/robots.ts`/`app/sitemap.ts` (Next.js ich generuje na tých istých
   cestách). Uisti sa len, že appka má `NEXT_PUBLIC_SITE_URL=https://myfitpilot.sk`
   nastavené v produkčnom prostredí.
