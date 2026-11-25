# Supabase — nastavenia, ktoré sa nedajú urobiť z kódu

Migrácia `0036` a kód zatvárajú všetko, čo sa dá vyriešiť na úrovni databázy a aplikácie. Tieto veci sa
nastavujú ručne v Supabase dashboarde (Authentication / Project Settings) a bez nich ostáva slabé miesto.

## Authentication → Providers → Email
- [ ] **Confirm email: ON** — bez toho sa dá zaregistrovať cudzí e-mail a účet je hneď aktívny.
- [ ] **Minimum password length ≥ 10** a **Password requirements** (malé/veľké/číslo/symbol). Kontrola v
      `app/prihlasenie/page.tsx` beží len v prehliadači — server ju musí vynútiť sám.
- [ ] **Leaked password protection: ON** (HaveIBeenPwned).
- [ ] **Secure password change** a **Secure email change: ON**.
- [ ] **Email OTP Expiration ≤ 600 s** (default 3600) — kód z e-mailu (registrácia) sa overuje cez `verifyOtp`,
      ktorý Supabase CAPTCHOU nechráni, a priame volanie Auth API obíde náš zámok (5 pokusov / e-mail / 15 min
      v `verifySignupCodeAction`); kratšia platnosť zmenšuje okno na hádanie 6 číslic. Voliteľne **Email OTP Length 8**.

## Authentication → Attack Protection
- [ ] **CAPTCHA (Turnstile/hCaptcha)** na registráciu, prihlásenie a obnovu hesla. Zámok v aplikácii chráni
      cestu cez našu server action, ale priamy POST na Supabase Auth API ide mimo nej — tam pomôže len toto.
- [ ] **Rate Limits**: **Rate limit for sending emails** je spoločný pre celý projekt (jeho vyčerpanie = skutoční
      používatelia nedostanú kód) — nastaviť primerane; **Token verifications** (overovanie kódu) a
      **Sign-ups and sign-ins** per IP nastaviť konzervatívne. Aplikácia má vlastné limity: prihlásenie
      (e-mail 10 / e-mail+IP 5 / IP 30 za 15 min), registrácia (IP 10 / e-mail 3 za 15 min), overenie kódu,
      nový kód a sync jazyka pri obnove hesla — všetko cez `login_attempts` (0028/0036), best effort bez
      service role kľúča; priamy POST na Supabase Auth API ich neobchádza len vďaka týmto nastaveniam.

## Authentication → Sessions
- [ ] **Access token (JWT expiry)**: nechať predvolených 3600 s alebo kratšie (Project Settings → JWT Keys /
      Auth → Sessions). Dlhší by predĺžil platnosť ukradnutého tokenu; refresh v middleware ho aj tak potichu obnovuje.
- [ ] **Detect and revoke potentially compromised refresh tokens** (refresh token rotation + reuse detection): **ON**,
      reuse interval ponechať krátky (default 10 s).
- [ ] **Time-box user sessions** a **Inactivity timeout** — zvážiť (napr. inactivity 30 dní). Cookie má Max-Age
      400 dní (default @supabase/ssr), takže skutočnú dĺžku prihlásenia určuje len toto nastavenie Supabase
      (vyžaduje Pro plán).
- [ ] **Single session per user** — nezapínať (klient aj tréner používajú mobil aj počítač).

**Ako je session uložená:** cookie `sb-…-auth-token`, SameSite=Lax, Secure v produkcii
(`lib/supabase/cookieOptions.ts`), nie httpOnly (prehliadačový klient ju potrebuje pre Realtime) — hlavná obrana
proti krádeži tokenu je preto CSP v `next.config.ts`. Odhlásenie `signOutAction` volá `auth.signOut()` bez
parametra; predvolený scope v auth-js je `global`, takže zruší refresh tokeny na všetkých zariadeniach.

## Authentication → URL Configuration
- [ ] **Site URL** = produkčná doména; **Redirect URLs** len presné adresy (`/prihlasenie/nove-heslo`, …),
      žiadne wildcardy na cudzie domény.

## Project Settings → API
- [ ] `service_role` kľúč iba na serveri (`SUPABASE_SERVICE_ROLE_KEY`, nikdy `NEXT_PUBLIC_`). Po úniku rotovať.
- [ ] Exposed schemas nechať len `public`; **Data API → extra search path** prázdne.

## Database
- [ ] Zapnúť **Point-in-Time Recovery / denné zálohy** (osobné a zdravotné dáta).
- [ ] Po každej migrácii spustiť `bash supabase/tests/run-local.sh`.

## Mimo Supabase
- [ ] Anthropic konzola: **mesačný spend limit** (druhá poistka za `AI_GLOBAL_DAILY_CALL_CAP`).
- [ ] Hosting: HTTPS všade, HSTS už posiela `next.config.ts`; pravidelne `npm audit`.
- [ ] Zvážiť MFA pre trénerské účty a pravidelnú kontrolu logov (`check_login_lockout` chyby, `rate_limited:` správy).
