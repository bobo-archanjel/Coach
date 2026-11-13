# E-mailové šablóny (Supabase Auth)

Tieto šablóny sa **nenastavujú v kóde** — Supabase Auth odosiela systémové e-maily
(registrácia, reset hesla) podľa šablón uložených v Supabase Dashboarde, nie podľa
ničoho v tomto repozitári. Tento priečinok je len zdroj pravdy/verziovanie —
HTML treba skopírovať do dashboardu manuálne.

## Ktoré šablóny appka reálne potrebuje

FitPilot používa Supabase Auth len na heslom chránené prihlásenie (+ Google OAuth)
a reset hesla. Z 6 šablón, ktoré Supabase ponúka, appka reálne spúšťa len **2**:

| Šablóna v Supabase | Kedy sa odošle | Súbor tu |
|---|---|---|
| **Confirm signup** | Po registrácii (`registerAction` → `supabase.auth.signUp`), ak má projekt zapnuté "Confirm email" | `potvrdenie-registracie.html` |
| **Reset Password** | Po kliknutí "Zabudnuté heslo?" na `/prihlasenie` (`resetPasswordForEmail`) | `reset-hesla.html` |

Zvyšné (**Magic Link**, **Invite user**, **Change Email Address**, **Reauthentication**)
appka nikdy nespúšťa — žiadny flow v kóde ich nevyvoláva (klient sa pridáva
pozývacím kódom, nie Supabase Invite; appka nemá magic-link prihlásenie; zmena
e-mailu ešte nemá UI). Netreba ich teraz riešiť — ak sa niektorá z týchto funkcií
nasadí neskôr, doplň šablónu vtedy.

## Ako ich nastaviť v Supabase

1. Supabase Dashboard → tvoj projekt → **Authentication → Email Templates**.
2. Vyber šablónu zo zoznamu (**Confirm signup** / **Reset Password**).
3. Do poľa **Subject heading** vlož (predmet je tiež šablóna — slovensky alebo česky podľa jazyka účtu):
   - Confirm signup:
     `{{ if eq .Data.locale "cs" }}Potvrď svou registraci ve FitPilotu{{ else }}Potvrď svoju registráciu vo FitPilote{{ end }}`
   - Reset Password:
     `{{ if eq .Data.locale "cs" }}Obnovení hesla ve FitPilotu{{ else }}Reset hesla vo FitPilote{{ end }}`
4. Do poľa **Message body** (HTML editor) vlož **celý obsah** príslušného `.html`
   súboru z tohto priečinka (vymaž pôvodný obsah poľa, vlož nový).
5. Klikni **Save**.

Supabase do šablóny pri odosielaní doplní premenné v `{{ .Premenna }}` tvare —
v týchto dvoch šablónach sa používajú:

- `{{ .ConfirmationURL }}` — hotový odkaz s tokenom (potvrdenie e-mailu / reset hesla).
- `{{ .Data.locale }}` — jazyk účtu (`sk` / `cs`) z `user_metadata` (feature/cestina).

### Jazyk e-mailu (slovenčina / čeština)

Obe šablóny aj predmety sú dvojjazyčné: každý text je v tvare
`{{ if eq .Data.locale "cs" }}česky{{ else }}slovensky{{ end }}`. `.Data` je
`user_metadata` používateľa:

- **registrácia** — `registerAction` posiela `locale` (jazyk, ktorý mal používateľ
  zvolený pri registrácii) v `options.data`, takže potvrdzovací e-mail príde v ňom,
- **reset hesla** — tesne pred odoslaním `syncRecoveryLocaleAction` (app/prihlasenie/actions.ts)
  prepíše `locale` účtu na jazyk, ktorý je práve zvolený na webe (prepínač SK/CZ) — e-mail
  teda príde v jazyku stránky, z ktorej o reset požiadal, aj keď sa registroval v inom
  (potrebuje `SUPABASE_SERVICE_ROLE_KEY`; bez neho príde v jazyku účtu),
- jazyk účtu sa mení aj pri každej zmene jazyka prihláseného používateľa
  (`setLocaleAction`: Nastavenia / Profil / prepínač na úvodnej stránke).

**Po vložení do Supabase over oba jazyky:** zaregistruj testovací účet raz so
slovenčinou a raz s češtinou (prepínač SK/CZ na úvodnej stránke pred registráciou)
a skontroluj predmet aj text. Ak by Supabase pri účte bez `locale` hlásil chybu
šablóny (staršia verzia Go šablón), nahraď podmienku za
`{{ if and .Data.locale (eq .Data.locale "cs") }}`.

Hlavička šablóny používa **`logo-mark.png`** (farebná značka, 26×26) + samostatný
text "FitPilot" — rovnaký vzor ako `/prihlasenie` a `DashboardNav.tsx`. **Nie**
`logo-wordmark.png` — ten je raster so svetlým textom pre tmavé pozadie
(pôvodná tmavá téma appky); na svetlej "liquid glass" karte by zmizol (biele
na bielom). `DashboardNav.tsx` má presne tento problém zdokumentovaný v
komentári a z toho dôvodu na svetlom skle tiež nepoužíva wordmark.

Obrázok má pevne zapísanú absolútnu URL
`https://coach-pi-bice.vercel.app/brand/logo-mark.png`, **nie**
`{{ .SiteURL }}/...`. Dôvod: `{{ .SiteURL }}` sa vyhodnotí presne na to, čo má
Supabase nastavené v Authentication → URL Configuration v momente odoslania —
ak tam ostane localhost alebo prázdna hodnota (bežné pri prvom teste), obrázok
sa v e-maile vôbec nezobrazí. Pevná URL na produkčnú doménu je spoľahlivejšia.
**Keď appka prejde na finálnu doménu (napr. `myfitpilot.sk`), treba túto URL
ručne upraviť v oboch `.html` súboroch tu AJ znova prekopírovať do Supabase
Dashboardu** — zmena domény v Supabase Site URL toto pole v šablóne
automaticky neopraví.

Nič iné meniť netreba — Supabase samo pozná typ šablóny podľa toho, ktorú upravuješ
v zozname (nie podľa obsahu).

### Prečo sa logo (alebo čokoľvek) niekedy nezobrazí v e-maile

Dve odlišné veci sa tu ľahko pomýlia:

1. **Nesprávna/chýbajúca URL obrázka, alebo svetlý obrázok na svetlom pozadí**
   — vyriešené vyššie (pevná absolútna URL na `logo-mark.png`, nie `logo-wordmark.png`).
2. **Klient e-mailu obrázky blokuje defaultne** (Gmail, Outlook) — toto je
   normálne správanie väčšiny poštových klientov, nie chyba šablóny ani appky.
   Nedá sa to úplne odstrániť, len zmierniť: značka má `alt=""` (prázdny, aby
   čítačky obrazovky nehlásili zbytočné "FitPilot" dvakrát) a vedľa nej stojí
   samostatný HTML text "FitPilot" (nie súčasť obrázka) — ten sa zobrazí vždy,
   nezávisle od toho, či klient obrázky blokuje.

## Nastavenie pre produkciu (Vercel)

E-maily odosiela **Supabase**, nie Vercel — Vercel appku len hostuje. Aby odkazy
v e-mailoch (a logo v nich) smerovali na skutočnú produkčnú appku a nie na
localhost alebo starý preview, treba v Supabase správne nastaviť 2 veci:

### 1. Site URL

Supabase Dashboard → **Authentication → URL Configuration → Site URL**:

```
https://coach-pi-bice.vercel.app
```

(alebo finálna doména, keď bude `myfitpilot.sk` presmerovaná — vtedy sem daj tú).
Toto je:
- adresa, na ktorú Supabase presmeruje po potvrdení e-mailu (**Confirm signup**
  posiela klienta sem, keď `signUp()` nedostal vlastný `emailRedirectTo` —
  presne tento prípad, `app/prihlasenie/actions.ts` ho nenastavuje),
- základ pre `{{ .SiteURL }}` v šablóne, teda aj pre logo (`{{ .SiteURL
  }}/brand/logo-wordmark.png`) — ak je tu localhost alebo stará URL, logo
  v e-maile sa nenačíta a signup presmeruje na nefunkčnú adresu.

### 2. Redirect URLs (allowlist)

Supabase Dashboard → **Authentication → URL Configuration → Redirect URLs** —
sem musí byť pridaná presná cesta, na ktorú reset hesla presmeruje
(`handleForgotSubmit` v `AuthView.tsx` posiela `redirectTo: window.location.origin +
"/prihlasenie/nove-heslo"`). Bez tohto záznamu v allowliste Supabase odkaz
odmietne a presmeruje len na Site URL (stránka s formulárom na nové heslo sa
vôbec neotvorí). Pridaj:

```
https://coach-pi-bice.vercel.app/prihlasenie/nove-heslo
http://localhost:3000/prihlasenie/nove-heslo
```

(druhý riadok len pre lokálny dev — nechaj ho tam, nevadí v produkcii).

Ak už máš v tomto zozname záznamy z nastavenia Google OAuth (`/auth/callback`),
táto nová položka sa len **pridáva** k nim, nič sa nemaže.

### 3. (odporúčané, nie povinné) NEXT_PUBLIC_SITE_URL vo Verceli

Appka má vlastnú env premennú `NEXT_PUBLIC_SITE_URL` (Vercel → Settings →
Environment Variables) používanú na SEO metadata, nie na e-maily — ale je dobré
mať ju nastavenú na **tú istú** doménu ako Site URL v Supabase, aby sa appka
a e-maily nerozchádzali v tom, čo je "domov".

### Overenie, že to naozaj funguje na Verceli

1. Otvor produkčnú appku (`https://coach-pi-bice.vercel.app/prihlasenie`), nie
   localhost.
2. Zaregistruj testovací účet s reálnym e-mailom → prišiel e-mail s logom a
   funguje tlačidlo "Potvrdiť e-mail"? Po kliknutí ťa má hodiť späť na produkčnú
   appku (Site URL), nie na localhost.
3. "Zabudnuté heslo?" s existujúcim účtom → prišiel e-mail → tlačidlo "Nastaviť
   nové heslo" ťa má hodiť na `https://coach-pi-bice.vercel.app/prihlasenie/nove-heslo`
   s funkčným formulárom (nie na chybovú stránku "odkaz neplatí").

Ak v kroku 3 skončíš na "Odkaz už neplatí" hneď po kliknutí, prvá vec na
kontrolu je presne tento Redirect URLs zoznam — chýbajúca/nepresná položka je
najčastejšia príčina.

## Dôležité: limit Supabase vlastnej e-mailovej služby

Supabase projekt bez nastaveného **Custom SMTP** posiela systémové e-maily cez
vlastnú zdieľanú poštu, ktorá má **veľmi nízky limit** (cca pár e-mailov za hodinu
na celý projekt, dokumentované ako "for testing only"). Pri reálnej prevádzke
(viac registrácií/resetov za hodinu) to začne zlyhávať bez chybovej hlášky vo
appke — používateľ len nedostane e-mail.

Odporúčanie pred spustením appky pre viac ako pár ľudí: **Authentication → SMTP
Settings** → zapni Custom SMTP a napoj ho na vlastnú e-mailovú službu (napr.
[Resend](https://resend.com) — bežná kombinácia so Supabase, má zadarmo
100 e-mailov/deň). Toto je samostatný krok navyše k šablónam vyššie — šablóny
fungujú rovnako nezávisle od toho, aký SMTP projekt používa.

## Ako to odskúšať

- **Confirm signup**: zaregistruj si testovací účet na `/prihlasenie` (tab
  "Registrácia") s reálnou e-mailovou adresou, na ktorú máš prístup.
- **Reset Password**: na `/prihlasenie` → "Zabudnuté heslo?" → zadaj e-mail
  existujúceho účtu.

Oba e-maily chodia z adresy, ktorú má projekt nastavenú v **Authentication →
SMTP Settings** (pri Supabase default pošte je to generická adresa Supabase,
nie `@myfitpilot.sk` — ďalší dôvod nastaviť Custom SMTP skôr než neskôr).
