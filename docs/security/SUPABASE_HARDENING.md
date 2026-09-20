# Supabase — nastavenia, ktoré sa nedajú urobiť z kódu

Migrácia `0036` a kód zatvárajú všetko, čo sa dá vyriešiť na úrovni databázy a aplikácie. Tieto veci sa
nastavujú ručne v Supabase dashboarde (Authentication / Project Settings) a bez nich ostáva slabé miesto.

## Authentication → Providers → Email
- [ ] **Confirm email: ON** — bez toho sa dá zaregistrovať cudzí e-mail a účet je hneď aktívny.
- [ ] **Minimum password length ≥ 10** a **Password requirements** (malé/veľké/číslo/symbol). Kontrola v
      `app/prihlasenie/page.tsx` beží len v prehliadači — server ju musí vynútiť sám.
- [ ] **Leaked password protection: ON** (HaveIBeenPwned).
- [ ] **Secure password change** a **Secure email change: ON**.

## Authentication → Attack Protection
- [ ] **CAPTCHA (Turnstile/hCaptcha)** na registráciu, prihlásenie a obnovu hesla. Zámok v aplikácii chráni
      cestu cez našu server action, ale priamy POST na Supabase Auth API ide mimo nej — tam pomôže len toto.
- [ ] Skontrolovať **Rate Limits** (sign-ups/sign-ins, e-maily za hodinu, OTP) — nastaviť konzervatívne.

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
