# Predplatné trénerov (Stripe)

Platia len tréneri, klienti nikdy. Prístup udeľuje **výlučne webhook** — návratová stránka po platbe nič neodomyká.

## Tarify (`lib/billing/plans.ts`)

Tarifa určuje funkcie, **variant** (to, čo si tréner kupuje) určuje limit aktívnych klientov. Mesačne v EUR:

| Variant | Tarifa | Aktívni klienti | Cena | Obsah |
|---|---|---|---|---|
| Starter 5 | starter | max. 5 | 15 € | tréningový builder, prehľad plánov, jedálničky a food diary, základný dashboard, vlastné šablóny, **bez AI** |
| Starter 10 | starter | max. 10 | 20 € | to isté ako Starter 5 |
| Pro | pro | max. 30 | 30 € | Starter + AI generátor plánov a jedálničkov, AI Kouč pre klientov, AI zhrnutia, pokročilé reporty (`advancedReports`) |
| Business | business | bez limitu | 99 € | Pro + branding (`branding`) |

- Pokročilé reporty a branding sú zatiaľ len príznaky v `plans.ts` (funkcie vzniknú pred spustením, kým sa nezamyká nič konkrétne).
- **Limit klientov sa ukladá per tréner** v `trainer_subscriptions.client_limit` (migrácia 0074): nastavuje ho webhook z ceny predplatného, skúška má 10, komped Business `null` (bez limitu). `null` znamená predvolený limit tarify (`TIER_DEFAULT_LIMIT`: starter 10, pro 30, business bez limitu) — chýbajúci limit u Starter/Pro nikdy neznamená „bez limitu“. Rovnaké pravidlo má SQL `billing_client_limit`.
- **Skúška:** každý nový tréner dostane 14 dní tarify Starter s limitom **10 klientov** bez karty (od vytvorenia účtu). Stav v DB je `app_trial` (zámerne nie Stripe `trialing`).
- **Existujúci tréneri** (v čase spustenia migrácie 0073) sú natrvalo zadarmo: `comped = true`, tarifa Business.
- **Aktívny klient** = riadok `clients` s `trainer_id` tohto trénera, bez `ended_at` a bez `deletion_requested_at`.

### Read-only režim

Tréner vidí všetko, ale každá trénerská zápisová akcia je odmietnutá s lokalizovanou hláškou, keď:

1. skúška skončila a nie je predplatné, alebo
2. predplatné je `canceled` / `unpaid` / `incomplete` / `incomplete_expired` / `paused`, alebo
3. `past_due` dlhšie než 7 dní od prvého zlyhania platby (odklad = `PAST_DUE_GRACE_DAYS`), alebo
4. aktívnych klientov je viac než limit (napr. po downgrade — read-only nastane až keď downgrade reálne nastane, nie keď sa naplánuje).

Klienti read-only trénera naďalej používajú portál (tréningy, strava, chat). AI Kouč klienta funguje len ak má jeho tréner aktívnu tarifu Pro/Business. Pridanie klienta nad limit je zablokované aj mimo read-only. Akcie billingu (Checkout/Portal) fungujú vždy.

## Architektúra

- **DB** (`supabase/migrations/0073_subscriptions.sql`): `trainer_subscriptions` (tréner si smie len prečítať vlastný riadok; píše výhradne service role), `stripe_events` (idempotencia webhooku), funkcie `billing_effective_tier` / `billing_client_limit` (interné, nevolateľné z API), `my_trainer_can_write()` (verejná, len o sebe), trigger `profiles_billing_trial` (skúška pre nových trénerov aj OAuth; pri zmene roly na klienta sa nepoužitý riadok zmaže).
- **Dve vrstvy vynútenia:**
  - aplikačná: `trainerBlock()` v `lib/billing/server.ts` volá každá trénerská server action (lokalizovaná hláška, fail-closed),
  - databázová (nad rámec akcií, chráni pred priamym PostgREST): trigger `clients_billing_limit` (limit aktívnych klientov, serializovaný advisory lockom) a `billing_write_guard` na tabuľkách plánov/šablón/termínov/poznámok (`workout_plans`, `workout_days`, `meal_plans`, `meal_days`, `plan_templates`, `plan_template_days`, `meal_templates`, `meal_template_days`, `appointments`, `trainer_private_notes`, `nutrition_profiles`, `plan_recipients`, `coach_notes`). Kaskádové mazanie (odstránenie klienta) prejde.
- **Logika prístupu** je v TS (`lib/billing/entitlements.ts`, čistá, testovaná) a zrkadlí SQL `billing_effective_tier` — pri zmene pravidiel upraviť OBE miesta.
- **Webhook** (`app/api/stripe/webhook/route.ts` + `lib/billing/webhook.ts`): overenie podpisu nad surovým telom, idempotencia cez `stripe_events` (processing → done, pri chybe sa uvoľní pre retry, zaseknutý pokus >5 min sa prevezme), pri každej udalosti sa **znova načíta aktuálne predplatné zo Stripe** (poradie udalostí nehrá rolu), tarifa a limit klientov sa určujú z ceny predplatného (ID z `STRIPE_PRICE_*`, pri archivovaných starších cenách z ich `lookup_key`; nikdy nie z metadát predplatného/Checkoutu), `past_due_since` sa odvodzuje z prechodu stavu, udalosť staršieho predplatného neprepíše živé, komped účet nikdy nestratí tarifu, nedokončená prvá platba neprepíše platnú skúšku.
- **Checkout/Portal** (`app/dashboard/predplatne/actions.ts`): z klienta chodí len názov varianta (`starter5` / `starter10` / `pro` / `business`); cenu určuje server. Portal používa konfiguráciu z `STRIPE_PORTAL_CONFIGURATION`, ak je nastavená (inak predvolenú konfiguráciu účtu). Tréner so živým predplatným ide radšej do Portalu (nie dve predplatné). Zákazník Stripe sa zakladá lazy a idempotentne (`fitpilot-customer-<id>`), vždy sa znovu používa. Komped tréner si predplatné kúpiť nemôže.
- **UI:** `/dashboard/predplatne` (odkaz z Nastavení a z bannerov), globálny banner v shelli (`BillingBanner`: skúška končí ≤3 dni, read-only, odklad po zlyhanej platbe), zamknuté funkcie (`FeatureGate`, `ClientLimitNotice`).

## Zmena tarify: upgrade hneď, downgrade na konci obdobia

Nastavuje to Customer Portal (konfiguráciu zakladá/aktualizuje `scripts/stripe-setup.mjs`):

- `subscription_update` zapnuté pre všetky 4 ceny, `proration_behavior: always_invoice` → **upgrade** sa spoplatní okamžite (pomerná doplatka sa hneď fakturuje; `create_prorations` by ju pripísalo až k ďalšej faktúre), tarifa aj limit sa zmenia hneď (webhook `customer.subscription.updated`),
- `schedule_at_period_end.conditions` = `decreasing_item_amount` + `shortening_interval` → **downgrade** (nižšia suma, napr. Pro → Starter 10, Starter 10 → Starter 5) Stripe naplánuje cez *subscription schedule* na koniec zaplateného obdobia. Do tej doby je cena predplatného stále pôvodná (overené cez API), takže webhook, ktorý tarifu odvodzuje z AKTUÁLNEJ ceny, nechá Pro až do konca obdobia; pri prepnutí fázy príde `customer.subscription.updated` s novou cenou a tarifa/limit sa prepíšu,
- zrušenie len `at_period_end`, zmena platobnej metódy, história faktúr, bez zmeny množstva (`adjustable_quantity` vypnuté),
- **Naplánovaná zmena** sa ukladá do `scheduled_tier` / `scheduled_client_limit` / `scheduled_change_at` (webhook ju číta z budúcej fázy schedule) a stránka Predplatné ukáže „Pro do 24. 12. 2026, potom Starter 10“; pri zrušení ku koncu obdobia „Predplatné skončí 24. 12. 2026“.
- **Varovanie pred nadlimitom:** keď má tréner viac klientov než limit nižšej tarify, stránka aj globálny banner ukážu „Po prechode na Starter 10 (24. 12. 2026) budeš mať 25 klientov z 10 — účet bude len na čítanie, kým ich neznížiš.“ Účet je do prechodu plnohodnotný.

## Čo je za bránou (zoznam)

Každá akcia volá `trainerBlock()` hneď na začiatku (read-only → chyba). AI akcie navyše vyžadujú funkciu tarify.

- AI (Pro+): `generatePlanWithAiAction`, `generateAiPlanForClientAction` (`aiPlanGenerator`); `generateMealPlanWithAiAction` (`aiMealGenerator`); `generateProgressSummaryAction`, `generateRosterSummaryAction` (`aiSummaries`); `sendAiKoucMessageAction` + skrytie záložky a stránky AI Kouč v portáli klienta (`aiCoach`, podľa tarify jeho trénera).
- Pridanie klienta (read-only + limit): `addClientAction`, `addClientByCodeAction`, `resumeClientCooperationAction`, `cancelClientDeletionAction` (+ DB trigger).
- Ostatné zápisy: všetky akcie v `app/dashboard/treningy/actions.ts` (okrem čítania detailu cviku), `jedalnicky/jedalnicek/actions.ts`, `jedalnicky/actions.ts`, `kalendar/actions.ts`, `sablony/actions.ts`, `planRecipientActions.ts`, `klienti/actions.ts` (správy, hromadná správa, aktívny plán), `app/components/food/actions.ts` (vlastná potravina).
- **Zámerne povolené aj v read-only:** `endClientCooperationAction`, `requestClientDeletionAction`, `removeClientFromPortfolioAction` (znižujú počet klientov — cesta von z „nad limitom“); zmazanie účtu trénera (GDPR); stavové akcie bez obsahu (`markTrainerChatSeenAction`, `dismissNotificationsAction`, `markAllMessagesReadAction`, onboarding tour, odhlásenie); billing akcie.
- **Pokročilé reporty (Pro+) a branding (Business):** funkcie vzniknú pred spustením; `/dashboard/analytika` je zatiaľ základný prehľad portfólia dostupný všetkým, preto sa nezamyká nič. Príznaky `advancedReports` (Pro, Business) a `branding` (Business) sú v `plans.ts`.

## Nastavenie (kroky pre majiteľa)

1. **Stripe test mode:** v Stripe Dashboarde zapni Test mode, skopíruj `Secret key` (`sk_test_…`) do `.env.local` ako `STRIPE_SECRET_KEY`. Nikdy sem nedávaj živý kľúč pre vývoj — setup skript `sk_live_…` odmietne.
2. **Produkty, ceny a Portal:** `node scripts/stripe-setup.mjs` (idempotentný) založí produkty Starter 5, Starter 10, Pro, Business (každý s daňovým kódom `txcd_10103001`; Starter je na dva produkty, lebo Portal nepovoľuje dve ceny s rovnakým intervalom pod jedným produktom) s mesačnými cenami 15 / 20 / 30 / 99 EUR (lookup_key `fitpilot_starter5_monthly_eur`, `fitpilot_starter10_monthly_eur`, `fitpilot_pro30_monthly_eur`, `fitpilot_business_monthly_eur`), archivuje staré ceny (Starter 19 €, Pro 49 €), nastaví Customer Portal (viď vyššie) a vypíše riadky `STRIPE_PRICE_STARTER_5`, `STRIPE_PRICE_STARTER_10`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS` — vlož do `.env.local`. Premenná `STRIPE_PRICE_STARTER` už nie je potrebná (ak ju appka nájde, berie ju ako Starter 10 — spätná kompatibilita).
3. **Customer Portal:** nastaví ho skript (krok 2); v Dashboarde (Settings → Billing → Customer portal) ho stačí skontrolovať.
4. **Zlyhané platby** (Settings → Billing → Subscriptions and emails → Manage failed payments): opakované pokusy ~7 dní, po vyčerpaní zrušiť predplatné (alebo `unpaid`). Appka dáva 7 dní odkladu od prvého zlyhania.
5. **Webhook lokálne:** `stripe login` a `stripe listen --forward-to localhost:3000/api/stripe/webhook`; vypísaný `whsec_…` daj do `.env.local` ako `STRIPE_WEBHOOK_SECRET`, reštartuj `npm run dev`. Test: `stripe trigger invoice.payment_failed` alebo celý Checkout s kartou `4242 4242 4242 4242`.
6. **Migrácie:** v Supabase SQL Editore spusti celý `supabase/migrations/0073_subscriptions.sql` a potom `supabase/migrations/0074_billing_plans.sql` (obe idempotentné; 0074 spusti PRED nasadením kódu — ten číta nové stĺpce). Pozor: všetci existujúci tréneri sa nastavia na `comped` Business; poradie v súbore zaručuje, že nedostanú skúšku.
7. **Produkčný webhook:** Stripe Dashboard → Developers → Webhooks → Add endpoint `https://www.myfitpilot.sk/api/stripe/webhook`, udalosti: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed` a (naplánovaný downgrade) `subscription_schedule.created`, `subscription_schedule.updated`, `subscription_schedule.released`, `subscription_schedule.canceled`, `subscription_schedule.completed`, `subscription_schedule.aborted`. Lokálne `stripe listen` posiela všetky udalosti, netreba nič filtrovať. Signing secret → `STRIPE_WEBHOOK_SECRET`.
8. **Vercel → Environment Variables** (Production + Preview): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER_5`, `STRIPE_PRICE_STARTER_10`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS`, (voliteľne) `STRIPE_PORTAL_CONFIGURATION`, `NEXT_PUBLIC_SITE_URL=https://www.myfitpilot.sk`, `SUPABASE_SERVICE_ROLE_KEY` (už nastavený). Redeploy.

## Ručné zadarmo (beta testeri)

```sql
-- zadarmo natrvalo s tarifou business (alebo 'pro' / 'starter')
update public.trainer_subscriptions
set comped = true, tier = 'business', status = 'active', updated_at = now()
where trainer_id = (select id from public.profiles where email = 'tester@example.com');

-- zrušiť comp (vráti sa k tomu, čo hovorí status/skúška)
update public.trainer_subscriptions set comped = false, updated_at = now()
where trainer_id = (select id from public.profiles where email = 'tester@example.com');

-- predĺžiť skúšku o 14 dní
update public.trainer_subscriptions
set status = 'app_trial', trial_ends_at = now() + interval '14 days', updated_at = now()
where trainer_id = (select id from public.profiles where email = 'tester@example.com') and stripe_subscription_id is null;
```

## Prechod na ostrý (live) režim neskôr

1. Skript vie bežať aj naostro: `STRIPE_SECRET_KEY=sk_live_… STRIPE_SETUP_ALLOW_LIVE=yes node scripts/stripe-setup.mjs --live` (bez oboch príznakov živý kľúč odmietne). Založí live produkty/ceny a nastaví live Customer Portal (názvy bez „(test)“). Kľúč nedávaj do `.env.local` — odovzdaj ho cez premennú prostredia na jedno spustenie.
2. Ručne nastav „Manage failed payments“ (nastavenia sú samostatne pre live).
3. Vytvor live webhook endpoint (rovnaké udalosti) → nový `whsec_…`.
4. Vo Vercel Production vymeň `STRIPE_SECRET_KEY` (`sk_live_…`), `STRIPE_WEBHOOK_SECRET` a štyri `STRIPE_PRICE_*` za live hodnoty; redeploy. Preview nechaj na test kľúčoch.
5. Test live na jednom účte s reálnou kartou (potom refund). Testovacie a live dáta sú oddelené — test zákazníci v DB sa nepoužijú; prípadné testovacie riadky v `trainer_subscriptions` vynuluj (`stripe_customer_id = null`).

## Testy

`npx playwright test e2e/billing.spec.ts` — čisté testy: tarify a varianty (limity 5 / 10 / 30 / bez limitu), mapovanie cena → variant (vrátane starších cien), read-only (skúška, past_due odklad, limit, comped), naplánovaný downgrade (tarifa platí do konca obdobia, varovanie pri nadlimite), mapovanie Stripe objektov, webhook stavový automat s falošným úložiskom (idempotencia, retry, staré predplatné, nepravé metadáta) a overenie podpisu cez `stripe.webhooks.generateTestHeaderString`.

## Známe obmedzenia

- DB stráž pre read-only sa týka tabuliek plánov/šablón/termínov/poznámok; správy trénera a „nad limitom“ (read-only z dôvodu počtu klientov) vynucuje len aplikačná vrstva. Limit pri pridávaní klienta vynucuje aj DB.
- Predplatné pri prechode zo skúšky sa nezačína „so zvyšnými dňami“ — platí sa od kúpy.
- Landing cenník ostáva s CTA na registráciu.
- Zmenu Starter 5 ↔ 10 a ostatné zmeny tarify robí tréner v Customer Portale; z appky (karty tarify) sa pri existujúcom predplatnom otvára Portal, nie Checkout.
