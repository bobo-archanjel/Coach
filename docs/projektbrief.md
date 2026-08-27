# FitCoach SK/CZ – Projektový brief

## O čo ide

Webová SaaS aplikácia pre fitness trénerov na slovenskom a českom trhu. Tréner
si v nej vedie svojich klientov – pre každého osobitne vytvára a zaraďuje
tréningy, kontroluje makrá, prípadne zostavuje jedálniček. Aplikácia má dve
role: **tréner** (admin panel) a **klient** (vlastný portál/účet).

Diferenciácia oproti existujúcej konkurencii (Trainerize, Everfit, TrueCoach,
GYMIFY): natívna slovenčina/čeština, AI chat s kontextovou pamäťou (nie len
generátor plánov), nutrícia ako plnohodnotná core funkcia od začiatku (nie
platený add-on), transparentný cenový model.

---

## Funkčný rozsah

### 1. Správa klientov
- Databáza klientov – kontakt, ciele, zdravotné obmedzenia, poznámky
- Onboarding formulár (vek, výška, váha, aktivita, ciele, alergie)
- História merania (váha, obvody, % tuku, fotky progresu)
- Tagy/skupiny klientov (napr. "chudnutie", "naberanie", "rehab")

### 2. Tréningový modul
- Knižnica cvikov (názov, svalová partia, video/GIF, popis techniky)
- Builder tréningov – zostavenie plánu (série, opakovania, záťaž, tempo, pauzy)
- Zaraďovanie tréningov klientom podľa dní/týždňov (mezocykly)
- Klient si odklikáva tréning, zapisuje skutočne odcvičené váhy/opakovania
- Progresívne preťaženie – návrhy zvýšenia záťaže na základe histórie

### 3. Výživa / makrá
- Výpočet BMR/TDEE a odporúčaných makier podľa cieľa klienta
- Tréner vytvára jedálniček alebo len makro/kalorický cieľ
- Klient loguje stravu (food diary)
- Prehľad plnenia makier deň/týždeň (graf)

### 4. Komunikácia
- Chat tréner ↔ klient v appke
- Notifikácie (pripomienky tréningu, správa od trénera)
- Feedback po tréningu (RPE, pocit, poznámka)

### 5. Progres tracking & reporting
- Grafy vývoja váhy, síl (1RM odhad), obvodov
- Porovnanie fotiek pred/po
- Automatické týždenné/mesačné reporty

### 6. Business vrstva
- Kalendár/rezervácie konzultácií
- Balíčky služieb, fakturácia, platby (Stripe)
- Multi-klient dashboard – kto má aktívny plán, kto meškal s logovaním

---

## AI moduly

### AI chat pre klienta
- Klient sa pýta v kontexte svojho profilu (ciele, aktuálny plán, makrá,
  posledné logy) – nie generický chat
- Jasné hranice: pri zmienke o bolesti/zranení AI odporučí kontaktovať
  trénera priamo, nediagnostikuje
- História konverzácie sa ukladá per klient (tabuľky `ai_conversations`,
  `ai_messages`)

### AI asistent pre trénera
- Generovanie návrhu tréningového plánu na základe profilu/histórie klienta
  (štruktúrovaný JSON výstup, tréner si ho pred priradením upraví)
- Generovanie návrhu jedálnička na základe makro cieľov a preferencií
- Sumarizácia klientovho progresu (report pre klienta)
- Upozornenia trénerovi na nízku adherenciu (vynechané tréningy, nesplnené
  makrá viac dní po sebe)

**Princíp:** AI je nástroj trénera a doplnok pre klienta. Finálne rozhodnutia
o pláne robí vždy tréner – appka nikdy neposiela AI návrh klientovi
automaticky bez schválenia.

---

## Dátový model (základ)

```
users (id, role, name, email)
clients (id, trainer_id, user_id, goal, weight_history[], body_measurements[], notes)
exercises (id, name, muscle_group, video_url, description)
workout_plans (id, client_id, name, created_by_trainer_id)
workout_days (id, plan_id, day_number, exercises[] s sets/reps/weight/tempo/rest)
workout_logs (id, client_id, workout_day_id, date, actual_sets_reps_weight, rpe, note)
meal_plans (id, client_id, daily_calories, macros_target, meals[])
food_logs (id, client_id, date, meals_eaten[], macros_actual)
messages (id, sender_id, receiver_id, text, timestamp)
ai_conversations (id, client_id, trainer_id, created_at)
ai_messages (id, conversation_id, role, content, timestamp)
```
Neskôr pribudnú `subscriptions` / `billing` tabuľky pre Stripe integráciu.

---

## Tech stack

- **Frontend:** React (Next.js), Tailwind CSS, mobile-first (klienti používajú
  appku hlavne na telefóne v posilňovni)
- **Backend/DB:** Supabase (Postgres, Auth, Storage, Row Level Security),
  self-hosted na vlastnom serveri (nexus) – rovnaká architektúra ako existujúci
  CRM na crm.vanasenior.sk
- **Auth:** email/heslo, role `trainer` a `client` cez RLS policies
- **AI:** Claude API, volania výhradne server-side (Edge Function / API route),
  API kľúč nikdy na frontende
- **Platby:** Stripe

---

## Monetizácia

**Model:** SaaS predplatné pre trénera (nie platba od klientov priamo).

- Voliteľne tiered podľa počtu klientov, alebo per-klient pricing
- AI funkcie ako prémiová/vyššia úroveň (limit AI requestov/mesiac v cene,
  extra sa dokupuje) – kvôli nákladom na Claude API tokeny
- White-label/branding appky ako doplnkový upsell (neskoršia fáza)
- MVP odporúčanie: free trial (14–30 dní) → jeden platený tier s AI limitom,
  zložitejšie tiery a white-label pridať až po reálnej spätnej väzbe od
  používateľov

**Vyhnúť sa:** freemium s reklamami, priama platba od klientov appke (platobný
vzťah ostáva tréner↔klient).

---

## Konkurenčná analýza – zhrnutie

| Oblasť | Konkurencia | Naša pozícia |
|---|---|---|
| AI | Len generovanie plánu, žiadny kontextový chat | AI chat s pamäťou (tréning+výživa+história) pre klienta aj trénera |
| Nutrícia | Add-on, orezaná | Natívna súčasť core produktu od MVP |
| Jazyk | Prevažne EN, SK konkurent (GYMIFY) funkčne slabý, bez AI | Natívne SK/CZ, plnohodnotný produkt |
| Cena | Škáluje neprehľadne s klientmi, add-ony | Jeden jasný tier + AI limit, transparentne |
| Rýchlosť | Sťažnosti na loading (napr. Everfit) | Moderný stack, mobile-first |
| Lokálny trh | GYMIFY (slabý, bez AI, bez natívnej nutrície) | Priama medzera – nikto nerobí AI-native SK/CZ nástroj |

Hlavní globálni hráči: Trainerize (najznámejší, $5–100/mes), Everfit (AI
workout builder, free do 5 klientov, $16–88/mes), TrueCoach (čistý workflow),
PT Distinction (automatizácia). Žiadny z nich nemá natívnu slovenčinu/češtinu
ani AI chat s reálnou pamäťou kontextu.

**Stratégia:** necieliť na "konkurovať Everfitu vo všetkom" (roky náskoku,
200k+ koučov), ale byť prvá skutočne AI-native, natívne slovenská/česká
platforma s nutríciou ako rovnocennou súčasťou a jednoduchou cenou.

---

## Fázovanie

**MVP (fáza 1):** Klienti + tréningový builder + zaraďovanie plánov +
jednoduchý food/makro tracking + základný dashboard + AI chat (klient) +
AI generátor plánov (tréner)

**Fáza 2:** Chat medzi trénerom a klientom, notifikácie, progres grafy,
knižnica cvikov s videami, AI insighty/upozornenia na adherenciu

**Fáza 3:** Platby/predplatné, kalendár rezervácií, pokročilé reporty,
white-label branding, mobilná optimalizácia/PWA

---

## Kontext o mne (relevantné pre projekt)

Prevádzkujem VanaSenior (bathtub accessibility firma) so self-hosted server
infraštruktúrou ("nexus") a Supabase CRM (crm.vanasenior.sk). Robím technickú
prácu sám – server administrácia, web development, marketing automation.
Skúsený vývojár (Unity, Unreal Engine 5). Komunikujem primárne po slovensky,
preferujem priame konkrétne riešenia pred dlhými vysvetleniami.
