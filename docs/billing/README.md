# Predplatné trénerov (Stripe)

Platia len tréneri, klienti nikdy. Prístup udeľuje **výlučne webhook** — návratová stránka po platbe nič neodomyká.

## Tarify (`lib/billing/plans.ts`)

| Tarifa | Aktívni klienti | Obsah |
|---|---|---|
| Starter | max. 10 | tréningové plány, jedálničky, denník stravy, základný prehľad, **bez AI** |
| Pro | max. 50 | + AI Kouč pre klientov, AI generátor plánov, AI generátor jedálničkov, AI zhrnutia (progres klienta, týždenný digest) |
| Business | bez limitu | + príznak `advancedReports` a `branding` (funkcie zatiaľ neexistujú — viď nižšie) |

- **Skúška:** každý nový tréner dostane 14 dní tarify Starter bez karty (od vytvorenia účtu). Stav v DB je `app_trial` (zámerne nie Stripe `trialing`).
- **Existujúci tréneri** (v čase spustenia migrácie 0073) sú natrvalo zadarmo: `comped = true`, tarifa Business.
- **Aktívny klient** = riadok `clients` s `trainer_id` tohto trénera, bez `ended_at` a bez `deletion_requested_at`.

### Read-only režim

Tréner vidí všetko, ale každá trénerská zápisová akcia je odmietnutá s lokalizovanou hláškou, keď:

1. skúška skončila a nie je predplatné, alebo
2. predplatné je `canceled` / `unpaid` / `incomplete` / `incomplete_expired` / `paused`, alebo
3. `past_due` dlhšie než 7 dní od prvého zlyhania platby (odklad = `PAST_DUE_GRACE_DAYS`), alebo
4. aktívnych klientov je viac než limit tarify (napr. po downgrade).

Klienti read-only trénera naďalej používajú portál (tréningy, strava, chat). AI Kouč klienta funguje len ak má jeho tréner aktívnu tarifu Pro/Business. Pridanie klienta nad limit je zablokované aj mimo read-only. Akcie billingu (Checkout/Portal) fungujú vždy.

## Architektúra

- **DB** (`supabase/migrations/0073_subscriptions.sql`): `trainer_subscriptions` (tréner si smie len prečítať vlastný riadok; píše výhradne service role), `stripe_events` (idempotencia webhooku), funkcie `billing_effective_tier` / `billing_client_limit` (interné, nevolateľné z API), `my_trainer_can_write()` (verejná, len o sebe), trigger `profiles_billing_trial` (skúška pre nových trénerov aj OAuth; pri zmene roly na klienta sa nepoužitý riadok zmaže).
- **Dve vrstvy vynútenia:**
  - aplikačná: `trainerBlock()` v `lib/billing/server.ts` volá každá trénerská server action (lokalizovaná hláška, fail-closed),
  - databázová (nad rámec akcií, chráni pred priamym PostgREST): trigger `clients_billing_limit` (limit aktívnych klientov, serializovaný advisory lockom) a `billing_write_guard` na tabuľkách plánov/šablón/termínov/poznámok (`workout_plans`, `workout_days`, `meal_plans`, `meal_days`, `plan_templates`, `plan_template_days`, `meal_templates`, `meal_template_days`, `appointments`, `trainer_private_notes`, `nutrition_profiles`, `plan_recipients`, `coach_notes`). Kaskádové mazanie (odstránenie klienta) prejde.
- **Logika prístupu** je v TS (`lib/billing/entitlements.ts`, čistá, testovaná) a zrkadlí SQL `billing_effective_tier` — pri zmene pravidiel upraviť OBE miesta.
- **Webhook** (`app/api/stripe/webhook/route.ts` + `lib/billing/webhook.ts`): overenie podpisu nad surovým telom, idempotencia cez `stripe_events` (processing → done, pri chybe sa uvoľní pre retry, zaseknutý pokus >5 min sa prevezme), pri každej udalosti sa **znova načíta aktuálne predplatné zo Stripe** (poradie udalostí nehrá rolu), tarifa sa určuje z ID ceny (`STRIPE_PRICE_*`), `past_due_since` sa odvodzuje z prechodu stavu, udalosť staršieho predplatného neprepíše živé, komped účet nikdy nestratí tarifu, nedokončená prvá platba neprepíše platnú skúšku.
- **Checkout/Portal** (`app/dashboard/predplatne/actions.ts`): z klienta chodí len názov tarify; cenu určuje server. Tréner so živým predplatným ide radšej do Portalu (nie dve predplatné). Zákazník Stripe sa zakladá lazy a idempotentne (`fitpilot-customer-<id>`), vždy sa znovu používa. Komped tréner si predplatné kúpiť nemôže.
- **UI:** `/dashboard/predplatne` (odkaz z Nastavení a z bannerov), globálny banner v shelli (`BillingBanner`: skúška končí ≤3 dni, read-only, odklad po zlyhanej platbe), zamknuté funkcie (`FeatureGate`, `ClientLimitNotice`).

## Čo je za bránou (zoznam)

Každá akcia volá `trainerBlock()` hneď na začiatku (read-only → chyba). AI akcie navyše vyžadujú funkciu tarify.

- AI (Pro+): `generatePlanWithAiAction`, `generateAiPlanForClientAction` (`aiPlanGenerator`); `generateMealPlanWithAiAction` (`aiMealGenerator`); `generateProgressSummaryAction`, `generateRosterSummaryAction` (`aiSummaries`); `sendAiKoucMessageAction` + skrytie záložky a stránky AI Kouč v portáli klienta (`aiCoach`, podľa tarify jeho trénera).
- Pridanie klienta (read-only + limit): `addClientAction`, `addClientByCodeAction`, `resumeClientCooperationAction`, `cancelClientDeletionAction` (+ DB trigger).
- Ostatné zápisy: všetky akcie v `app/dashboard/treningy/actions.ts` (okrem čítania detailu cviku), `jedalnicky/jedalnicek/actions.ts`, `jedalnicky/actions.ts`, `kalendar/actions.ts`, `sablony/actions.ts`, `planRecipientActions.ts`, `klienti/actions.ts` (správy, hromadná správa, aktívny plán), `app/components/food/actions.ts` (vlastná potravina).
- **Zámerne povolené aj v read-only:** `endClientCooperationAction`, `requestClientDeletionAction`, `removeClientFromPortfolioAction` (znižujú počet klientov — cesta von z „nad limitom“); zmazanie účtu trénera (GDPR); stavové akcie bez obsahu (`markTrainerChatSeenAction`, `dismissNotificationsAction`, `markAllMessagesReadAction`, onboarding tour, odhlásenie); billing akcie.
- **Pokročilé reporty (Business):** v appke zatiaľ nie je samostatná „pokročilá analytika“ (`/dashboard/analytika` je základný prehľad portfólia, dostupný všetkým), preto sa nezamyká nič. Príznaky `advancedReports` a `branding` sú len v `plans.ts`.

## Nastavenie (kroky pre majiteľa)

1. **Stripe test mode:** v Stripe Dashboarde zapni Test mode, skopíruj `Secret key` (`sk_test_…`) do `.env.local` ako `STRIPE_SECRET_KEY`. Nikdy sem nedávaj živý kľúč pre vývoj — setup skript `sk_live_…` odmietne.
2. **Produkty a ceny:** `node scripts/stripe-setup.mjs` (idempotentný) vytvorí Starter/Pro/Business (testovacie sumy 19/49/99 EUR mesačne) a vypíše riadky `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS` — vlož do `.env.local`.
3. **Customer Portal** (Dashboard → Settings → Billing → Customer portal): povoľ zmenu tarify medzi tromi cenami, zrušenie „na konci obdobia“, aktualizáciu karty, históriu faktúr. Uložiť.
4. **Zlyhané platby** (Settings → Billing → Subscriptions and emails → Manage failed payments): opakované pokusy ~7 dní, po vyčerpaní zrušiť predplatné (alebo `unpaid`). Appka dáva 7 dní odkladu od prvého zlyhania.
5. **Webhook lokálne:** `stripe login` a `stripe listen --forward-to localhost:3000/api/stripe/webhook`; vypísaný `whsec_…` daj do `.env.local` ako `STRIPE_WEBHOOK_SECRET`, reštartuj `npm run dev`. Test: `stripe trigger invoice.payment_failed` alebo celý Checkout s kartou `4242 4242 4242 4242`.
6. **Migrácia:** v Supabase SQL Editore spusti celý `supabase/migrations/0073_subscriptions.sql` (idempotentná). Pozor: všetci existujúci tréneri sa nastavia na `comped` Business; poradie v súbore zaručuje, že nedostanú skúšku.
7. **Produkčný webhook:** Stripe Dashboard → Developers → Webhooks → Add endpoint `https://www.myfitpilot.sk/api/stripe/webhook`, udalosti: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`. Signing secret → `STRIPE_WEBHOOK_SECRET`.
8. **Vercel → Environment Variables** (Production + Preview): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS`, `NEXT_PUBLIC_SITE_URL=https://www.myfitpilot.sk`, `SUPABASE_SERVICE_ROLE_KEY` (už nastavený). Redeploy.

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

1. V Stripe prepni na Live mode a v Dashboarde ručne vytvor 3 produkty s mesačnými cenami v EUR (skript je len na test).
2. Znova nastav Customer Portal a „Manage failed payments“ (nastavenia sú samostatne pre live).
3. Vytvor live webhook endpoint (rovnaké udalosti) → nový `whsec_…`.
4. Vo Vercel Production vymeň `STRIPE_SECRET_KEY` (`sk_live_…`), `STRIPE_WEBHOOK_SECRET` a tri `STRIPE_PRICE_*` za live hodnoty; redeploy. Preview nechaj na test kľúčoch.
5. Test live na jednom účte s reálnou kartou (potom refund). Testovacie a live dáta sú oddelené — test zákazníci v DB sa nepoužijú; prípadné testovacie riadky v `trainer_subscriptions` vynuluj (`stripe_customer_id = null`).

## Testy

`npx playwright test e2e/billing.spec.ts` — čisté testy: tarify, read-only (skúška, past_due odklad, limit, comped), mapovanie Stripe objektov, webhook stavový automat s falošným úložiskom (idempotencia, retry, staré predplatné, nepravé metadáta) a overenie podpisu cez `stripe.webhooks.generateTestHeaderString`.

## Známe obmedzenia

- DB stráž pre read-only sa týka tabuliek plánov/šablón/termínov/poznámok; správy trénera a „nad limitom“ (read-only z dôvodu počtu klientov) vynucuje len aplikačná vrstva. Limit pri pridávaní klienta vynucuje aj DB.
- Predplatné pri prechode zo skúšky sa nezačína „so zvyšnými dňami“ — platí sa od kúpy.
- Landing cenník ostáva s CTA na registráciu.
