---
# FitPilot — Marketingový audit a growth stratégia (v1)
Pripravené: 2026-08-31 · Rola: senior CMO / Head of Growth / Organic Growth Strategist
Status: **NÁVRH NA SCHVÁLENIE.** Nič sa nepublikuje, nespúšťa ani nemení bez tvojho súhlasu.
---

## Ako čítať tento dokument

Pri každom tvrdení rozlišujem:

- **FACT** — overené z produktových dokumentov (PRODUCT.md, DESIGN.md, ROADMAP.md, brief, kód landing page) alebo priamo z webu konkurenta, ktorý som načítal.
- **RESEARCH** — zistené webovým prieskumom (recenzie, fóra, blogy), reprezentuje to, čo je verejne dostupné, nie interné dáta konkurenta.
- **HYPOTHESIS** — moja pracovná domnienka, ktorá by sa mala overiť (napr. rozhovorom s trénermi).
- **RECOMMENDATION** — čo navrhujem urobiť.
- **NEMÁM DÁTA** — presné číslo (search volume, CPC, difficulty, konverzný pomer) mi nie je dostupné bez SEO/ads nástroja (Ahrefs, GSC, Keyword Planner). Neuvádzam vymyslené čísla — ak chceš presné volume/CPC dáta, potrebujem prístup k Google Search Console/Keyword Planner/Ahrefs alebo mi dodaj export.

Žiadne testimoniály, čísla používateľov, recenzie ani "case studies" v tomto dokumente nie sú vymyslené — FitPilot ešte nemá reálnych platiacich zákazníkov (AI moduly sú podľa `ROADMAP.md` vedome odložené, appka ešte nie je live launchnutá). Kde je to relevantné, na to explicitne upozorňujem.

---

## 1. EXECUTIVE SUMMARY

**FACT:** FitPilot je pred launchom. Produkt má hotové jadro (klienti, tréningový builder, výživa/makrá, food diary, chat tréner↔klient, adherenčné notifikácie, branding) na `dev` branchi, ale **AI moduly (AI chat pre klienta, AI generátor plánov pre trénera) — hlavný diferenciátor v positioningu — ešte vôbec nie sú postavené** a sú vedome odložené na koniec. Landing page pritom AI chat prezentuje ako súčasť MVP fázy. To je dôležité pre marketingové sekvenovanie (pozri riziko #1 v sekcii 23).

**RESEARCH:** SK/CZ trh má jedného skutočného natívneho konkurenta pre B2B coaching software — **GYMIFY Coach** (SK/CZ, žiadne AI, cenník podľa počtu klientov, orientovaný skôr na booking/rezervácie a fitness centrá než na tréningovo-výživový coaching). Objavil sa aj rodiaci sa priamy konkurent **MOSUDA** (SK, freemium — tréner platí, klient zadarmo, **AI generovanie jedálničkov** — veľmi blízko FitPilot positioningu). Globálni hráči (Trainerize, Everfit, TrueCoach) sú EN-first, drahnú s pridávaním AI/výživy ako add-onov, a **nemajú SK/CZ jazyk ani lokálny marketing** — teda tu nekonkurujú priamo v SEO ani v distribúcii, len v kategórii.

**RECOMMENDATION:** Pri malom rozpočte je jediná obranná pozícia "prvý, kto to urobí poriadne pre SK/CZ trénerov" — čo znamená **rýchlo dostať čo najviac SK/CZ trénerov do produktu skôr, než to spraví niekto iný** (GYMIFY môže pridať AI, MOSUDA môže pridať plnohodnotný tréningový builder). Preto je prioritou #1 organic + word of mouth engine, ktorý začne bežať **pred** dokončením AI vrstvy — obsah a distribúcia sa dajú stavať už teraz, produkt AI dobehne.

**Top 3 odporúčania na najbližších 30 dní** (detaily v sekcii 24–25):
1. Postaviť 3–5 BOFU stránok (FitPilot vs GYMIFY, vs Trainerize/Everfit, "Excel + WhatsApp vs software pre trénera", pricing page) — nulová závislosť od AI dokončenia.
2. Založiť founder-led obsah (LinkedIn/Instagram/TikTok podľa sekcie 13) dokumentujúci budovanie produktu — buduje distribúciu skôr, než je čo predávať.
3. Manuálny, hodnotný outreach na 30–50 trénerov (kurzy, FB skupiny, komunity) na "beta testerov výmenou za doživotnú zľavu" — prvých 10 zákazníkov nikdy nepríde zo SEO, príde z rozhovorov.

---

## 2. WHAT FITPILOT ACTUALLY SELLS

**FACT (z PRODUCT.md/brief):** FitPilot nepredáva "fitness app". Predáva trénerovi/coachovi **čas späť** — jedno miesto na správu klientov, tréningových plánov, výživy a komunikácie namiesto roztrúsených nástrojov (Excel/Sheets + WhatsApp/Messenger + MyFitnessPal + ručné reportovanie), plus AI, ktoré robí návrhy (plán, jedálniček, sumarizácia progresu), ale tréner má vždy posledné slovo.

Produkt v skutočnosti predáva tri veci naraz:
1. **Administratívnu úsporu** (menej copy-paste medzi Excelom, WhatsAppom a hlavou trénera).
2. **Profesionálny dojem u klienta** (klient má appku, nie zošit alebo PDF v maile — vyzerá to ako seriózny biznis).
3. **Výživu ako plnohodnotnú súčasť** — konkurencia ju predáva ako drahý add-on, FitPilot ju má od základu, čo je relevantné najmä pre trénerov, ktorí dnes riešia stravu cez samostatný nástroj alebo vôbec.

**HYPOTHESIS:** AI vrstva (keď bude hotová) nebude prvým dôvodom prečo si tréner appku kúpi — bude dôvodom prečo **zostane** a odporučí ju ďalej (menej času na tvorbu plánov = viac kapacity na klientov = vyšší príjem trénera). Marketing by preto mal predávať "časovú úsporu a poriadok" ako hlavný háčik už teraz, AI ako "bonus, ktorý prichádza" — nie naopak.

---

## 3. ICP (Ideal Customer Profile)

Podľa pravidla #5 zo zadania: **USER ≠ BUYER**. USER je klient trénera (necieľová skupina pre marketing softvéru). **BUYER je tréner/online coach — jediný, koho marketing má za úlohu získať.**

### Primárny ICP
**Nezávislý osobný tréner / online coach, SK alebo CZ, 5–50 platiacich klientov**, ktorý:
- dnes kombinuje Excel/Google Sheets + WhatsApp/Messenger + prípadne MyFitnessPal alebo papier,
- rieši výživu klientov manuálne alebo vôbec (nie je to jeho silná stránka, ale klienti si to pýtajú),
- trávi večer/nedeľu prepisovaním plánov namiesto tréningov s klientmi,
- chce pôsobiť profesionálne (appka = "seriózny biznis", nie "kámoš s tabuľkou"),
- je cenovo citlivý — softvér v EUR/USD s americkým pricingom (20–70 $/mes a viac s add-onmi) je pre neho psychologicky aj reálne drahší než v SK/CZ kontexte, navyše v cudzom jazyku.

### Sekundárny ICP
**Malé fitness štúdio / gym s 1–3 trénermi**, ktorí zdieľajú klientsku databázu a chcú jednotný nástroj pre celý tím (neskorší upsell — multi-tréner/Business tier).

### Terciárny (watch, nie teraz)
Nutriční coachi bez tréningovej zložky — FitPilot má silnú výživu, ale predávať sa im ako čisto nutrition tool by riedilo positioning; sledovať ako potenciálny segment neskôr, nie teraz.

**USER (klient trénera):** 20–45 rokov, cvičí s trénerom kvôli výsledkom aj zodpovednosti, väčšinu interakcie robí na mobile v posilňovni. Marketing sa naňho necieli priamo — je to "produkt v produkte", ktorý zvyšuje hodnotu appky pre trénera (pekný klientský portál = tréner vyzerá lepšie).

---

## 4. JOBS TO BE DONE

Formulované jazykom trénera, nie feature-listom:

1. "Keď prijmem nového klienta, chcem mu do 10 minút poslať plán aj jedálniček, nie stráviť večer v Exceli."
2. "Keď klient tri dni nič neodcvičil, chcem to vedieť skôr, než mi to povie sám (alebo to nepovie vôbec a odíde)."
3. "Keď mi klient napíše o 22:00 'čo mám dnes zjesť', nechcem to riešiť ja osobne v ten moment."
4. "Keď mám 30 klientov, chcem vidieť za 2 minúty ráno kto mešká, nie prechádzať 30 chatov vo WhatsAppe."
5. "Chcem vyzerať ako profesionálny biznis, nie ako kamarát so zošitom — najmä keď si účtujem 40–80 €/mesiac za koučing."
6. "Nechcem platiť 70 $ mesačne za nástroj, ktorý je napoly po anglicky preložený a nerozumie slovenským jednotkám/potravinám."

**RECOMMENDATION:** Tieto vety (alebo ich variácie) použiť priamo ako headline-y v ads, hookoch videí a on-page copy — je to jazyk trénera, nie marketingová abstrakcia.

---

## 5. VOICE OF CUSTOMER

**RESEARCH — zdroje a čo hovoria (kvalitatívne, z verejne dostupných recenzií/blogov, nie SK/CZ špecifické priamo, ale prenosné pain body naprieč trhom):**

| Kategória | Citácia / zistenie | Zdroj |
|---|---|---|
| PRICING | "pricing can feel a little expensive, particularly as your client base grows"; "I do wish I didn't have to pay more money for every 10+ clients" | [Capterra – Everfit reviews](https://www.capterra.com/p/202837/Everfit/reviews/?page=2) |
| NUTRÍCIA | "can't really personalize meal plan for my client without paying extra" | [Capterra – Everfit reviews](https://www.capterra.com/p/202837/Everfit/reviews/?page=2) |
| WORKFLOW | "certain workflows require more clicks than expected"; sťažnosti na bugy v timeroch/pauzách | [Capterra – Everfit reviews](https://www.capterra.com/p/202837/Everfit/reviews/?page=2) |
| INTEGRÁCIE | Existuje samostatný "troubleshooting" support článok len na riešenie nesynchronizácie MyFitnessPalu s klientmi — teda ide o bežný, opakovaný problém | [ABC Fitness help center](https://help.abcfitness.com/ignite/Engagement/Coach/Support/MyFitnessPal.htm), [Trainerize help](https://help.trainerize.com/hc/en-us/articles/360039694052-Troubleshooting-MyFitnessPal-Not-Syncing-For-Clients) |
| STATUS QUO | Slovenský zakladateľ appky MOSUDA explicitne pomenoval dôvod vzniku: tréneri riešia plány cez "Excel, Word a ďalšie" nástroje | [Refresher.sk](https://refresher.sk/150203-Koucing-tabulky-jedalnicek-a-AI-v-jednom-Slovaci-vymysleli-fitnes-apku-ktoru-si-zamiluju-aj-treneri) |
| DÁTOVÁ HISTÓRIA | "gathering and reviewing full client history over extended periods can sometimes be a bit challenging" | [Capterra – Everfit reviews](https://www.capterra.com/p/202837/Everfit/reviews/?page=2) |

**HYPOTHESIS (potrebuje overenie priamym rozhovorom so SK/CZ trénermi, nie extrapoláciu z anglických recenzií):**
- SWITCHING TRIGGER: tréner prekročí ~15–20 klientov a Excel/WhatsApp sa fyzicky prestane dať zvládať (strata prehľadu, zabudnuté správy).
- OBJECTION #1: "Mám to vo Worde/Exceli, funguje mi to, prečo platiť za niečo nové?" (setup friction, nie hodnota).
- OBJECTION #2: "Skúšal som Trainerize/Everfit, bolo to v angličtine a drahé s doplnkami."
- FEATURE REQUEST (extrapolácia z Everfit recenzií, treba overiť pre SK trh): jednoduchosť nad komplexnosťou, nechcú "ďalší Trainerize" s 50 nastaveniami.

**RECOMMENDATION:** Toto je najslabšie podložená časť celého auditu — **odporúčam urobiť 10–15 krátkych rozhovorov (15 min) s reálnymi SK/CZ trénermi** (z kurzov, FB skupín, vlastnej siete) ešte pred písaním veľkého objemu obsahu. Toto je zároveň spôsob, ako získať prvých beta testerov (pozri sekciu 21) — jeden rozhovor, dva ciele.

---

## 6. SK MARKET

**RESEARCH:**
- Existuje zavedená štruktúra certifikácie osobných trénerov (FTVŠ UMB akreditované kurzy, EfectFit Akadémia v Bratislave/Košiciach/Žiline/Nitre, informs.sk, kurz.mojcoach.com) — teda existuje **stály prílev nových trénerov**, ktorí si práve teraz vyberajú prvý softvér/proces. To je ideálny partnership a top-of-funnel bod (sekcia 16, 20).
- Priamy natívny konkurent: **GYMIFY Coach** (coach.gymify.sk) — SK/CZ/EN, freemium podľa počtu klientov (<5/<15/<30/<50), 14-dňový trial bez karty, workout builder + chat + kalendár (Google Calendar sync) + knižnica cvikov. **Bez AI, bez zmienky o pokročilej výžive/makrách v marketingu.**
- Rodiaci sa priamy konkurent: **MOSUDA** — SK app, CEO Matúš Špirko, plán workoutov + jedálniček + AI generovanie jedálničkov + prístup k certifikovaným trénerom, momentálne zadarmo, plánovaný freemium (tréner platí, klient zadarmo) — **toto je najbližší koncepčný konkurent FitPilotu na SK trhu** a treba ho sledovať priebežne.
- Adjacentné, nie priame: FitJam (B2C wellness app so slovenskými trénermi ako content tvorcami, nie B2B nástroj pre trénerov), rezervačné/booking systémy pre fitness centrá a trénerov (SuperSaaS, Zenamu, CLUBERIO, OnGym) — konkurujú v SEO výraze "aplikácia/softvér pre osobných trénerov", ale riešia iný problém (rezervácie, nie tréningový/výživový coaching).
- Komunity: Facebook skupiny a stránky ako "Fitness Trenéři" (CZ), "Česká komora fitness", EfectFit.sk — priestor na distribúciu (sekcia 16).

**NEMÁM DÁTA:** presný počet aktívnych osobných trénerov na Slovensku, presné search volume kľúčových slov, veľkosť trhu v EUR. Odporúčam pri schválení stratégie skúsiť odhad cez počet certifikačných kurzov ročne × odhad miery, koľko z nich zostane aktívnych 1+ rok (dá sa spraviť ako samostatný odhadový model, ak chceš).

---

## 7. CZ MARKET

**RESEARCH:** CZ trh nie je len preklad SK — má vlastnú štruktúru a vlastných hráčov v "booking" kategórii (EasyWeek.cz, Tymeslot.app/cs, CronixOne.cz, Anolla.com/cs, Fitsuite.co) — teda **v ČR je SEO priestor okolo "software pro osobní trenéry" viac obsadený** booking/rezervačnými nástrojmi než na Slovensku. GYMIFY Coach pôsobí aj v ČR (rovnaká platforma, CZ jazyk). Komunita "Fitness Trenéři" a "Česká komora fitness" na Facebooku ukazujú existenciu organizovanej trénerskej scény.

**HYPOTHESIS:** CZ trh je pravdepodobne o niečo väčší a konkurenčne "hlučnejší" v SEO (viac lokálnych SaaS hráčov v adjacentnej kategórii), ale jazykovo a kultúrne dostatočne blízky SK na to, aby sa dal obsluhovať **rovnakým produktom a takmer rovnakým obsahom s CZ lokalizáciou** (nie separátny produkt) — čo šetrí náklady. Treba ale samostatné CZ landing/SEO stránky (nie len prepnutý jazyk v tej istej URL bez CZ kľúčových slov), pretože Google indexuje SK a CZ ako odlišné jazykové/geografické signály.

**RECOMMENDATION:** Content plán (sekcia 14) robiť súbežne SK+CZ variantami tých istých BOFU/MOFU stránok od začiatku, nie CZ ako "fázu 2" — je to nízky dodatočný náklad (rovnaká štruktúra, preklad + lokálne príklady) s dvojnásobným adresovateľným trhom.

---

## 8. COMPETITOR MATRIX

| | Trainerize | Everfit | TrueCoach | **GYMIFY Coach** | **MOSUDA** | Excel+WhatsApp+MFP (status quo) |
|---|---|---|---|---|---|---|
| Typ | Direct (global) | Direct (global) | Direct (global) | **Direct (SK/CZ)** | **Direct (SK, emerging)** | Status quo |
| Jazyk | EN | EN | EN | SK/CZ/EN | SK | natívny |
| Cena (RESEARCH, USD/mes) | od $22, до $175–200 s add-onmi | free do 5 kl., od $19, do $134–150 | $26–70 + 5% transakčný poplatok | freemium podľa počtu klientov (<5/<15/<30/<50) | zatiaľ zadarmo, plánovaný freemium | "zadarmo" (ale časová cena) |
| AI | AI workout builder (RESEARCH: slabý pri komplexných progresiách) | AI workout/meal/recipe builder, AI meal scanner | žiadne | žiadne | **AI generovanie jedálničkov** | žiadne |
| Výživa | add-on, ~10k potravín | silná, 15k potravín, ale plný rozsah za príplatok | žiadna natívna | nespomínaná v marketingu | áno, jadro produktu | MyFitnessPal (zle synchronizuje s trénerom) |
| Trial | trial only | free tier 5 klientov | trial only | 14 dní bez karty | zadarmo momentálne | — |
| Zdroj | [pricing](https://www.quickcoach.fit/trainerize-pricing-2026.html) | [porovnanie](https://blog.everfit.io/everfit-vs-trainerize-vs-truecoach) | [porovnanie](https://blog.everfit.io/everfit-vs-trainerize-vs-truecoach) | [coach.gymify.sk](https://coach.gymify.sk/) | [Refresher.sk](https://refresher.sk/150203-Koucing-tabulky-jedalnicek-a-AI-v-jednom-Slovaci-vymysleli-fitnes-apku-ktoru-si-zamiluju-aj-treneri) | pozorovanie trhu |

**Status quo hypotéza — OVERENÁ (čiastočne):** Priamy citát zakladateľa MOSUDA potvrdzuje, že "Excel/Word" je reálne vnímaný ako súčasný spôsob práce trénerov, ktorý appky ako MOSUDA/FitPilot nahrádzajú. Toto je najsilnejší nepriamy konkurent — nemá marketing, nemá webstránku, ale má 100 % market share, kým ho niekto nenahradí.

**Kľúčové zistenie:** Ani jeden z troch globálnych hráčov nerobí SK/CZ SEO ani lokálny content — **teda v SK/CZ jazyku nie je prakticky žiadna organic konkurencia v kategórii "AI-native tréningovo-výživový coaching software"**. Konkurencia v SK/CZ SERP-och pre "aplikácia pre osobných trénerov" je dnes hlavne GYMIFY a booking softvéry — nie plnohodnotné coaching platformy. To je najväčšia SEO príležitosť FitPilotu (sekcia 11).

---

## 9. POSITIONING

**FACT (už je to na landing page, potvrdzujem že je to správne a mal by zostať jadrom):**

> "Trénerský softvér, nie preklad z angličtiny." FitPilot je stavaný natívne pre slovenských a českých trénerov — výživa je plnohodnotná súčasť od prvého dňa (nie platený doplnok) a AI chat má pamäť klientovho profilu a histórie (nie generátor na jedno použitie).

**RECOMMENDATION — doostriť pre marketing mimo landing page:**

> Pre trénerov na Slovensku a v Česku, ktorí dnes žonglujú Excel, WhatsApp a MyFitnessPal: FitPilot je jediný softvér, ktorý hovorí po slovensky/česky, berie výživu rovnako vážne ako tréning, a dá vám AI, ktoré si pamätá vášho klienta — nie AI, ktoré len vypľuje šablónu.

Kategória, do ktorej sa FitPilot zaraďuje v hlavách trénerov, by nemala byť "ďalšia fitness appka" ale **"softvér na správu klientov pre trénera"** (blízko ku kategórii, v ktorej dnes existuje dopyt: "aplikácia pre osobných trénerov", "software pre fitness trénerov").

---

## 10. KEY DIFFERENTIATION

1. **Natívna slovenčina/čeština** — FACT, jediný plnohodnotný konkurent s SK/CZ jazykom (GYMIFY) nemá AI ani plnohodnotnú výživu.
2. **Výživa ako core, nie add-on** — FACT z produktu; RESEARCH potvrdzuje, že Everfit/Trainerize ju spoplatňujú extra a TrueCoach ju vôbec nemá.
3. **AI chat s kontextovou pamäťou** — **zatiaľ nepostavené** (FACT z ROADMAP.md). Toto je najsilnejší budúci diferenciátor, ale momentálne sa nedá marketingovo dokázať produktom — treba to komunikovať ako "prichádza", nie "je hotové", kým naozaj hotové nebude.
4. **Transparentná cena** — FACT (positioning), ale aktuálny cenník na landing page (15–20/40–50/80–100 €) je explicitne označený ako "orientačný pre spustenie" — treba finalizovať pred akoukoľvek platenou kampaňou, ktorá by naň smerovala (viď riziko #2, sekcia 23).
5. **Tréner má vždy posledné slovo nad AI** — FACT, produktový princíp #1. Toto je aj marketingová poistka dôvery (najmä pri zdravotných témach) — vhodné pre content pilier "AI" aj "myty o AI v coachingu".

---

## 11. SEO OPPORTUNITY

**RESEARCH + HYPOTHESIS:** SK/CZ SERP-y pre kľúčové výrazy okolo "softvér pre trénerov" sú dnes rozdelené medzi (a) generický booking/rezervačný softvér (SuperSaaS, EasyWeek, Zenamu, CLUBERIO, Tymeslot, Anolla, CronixOne, OnGym) a (b) GYMIFY Coach. **Nikto z nich nerobí obsahový marketing okolo výživy, AI alebo "Excel vs. softvér" naratívu** — čo je presne priestor, kde môže FitPilot vyhrať bez toho, aby súťažil s globálnymi hráčmi (tí v SK/CZ jazyku prakticky nesúťažia).

**NEMÁM DÁTA** o presnom search volume/difficulty/CPC pre SK/CZ výrazy — bez Ahrefs/Semrush/Google Keyword Planner prístupu viem pracovať len s kvalitatívnym odhadom (existencia SERP konkurencie, existencia "People Also Ask" tém, existencia dedikovaných landing stránok konkurentov ako signál dopytu). **Odporúčam pripojiť Google Search Console k landing page hneď teraz** (aj pred plným launchom) — je to zadarmo a od prvého dňa začne zbierať skutočné dáta o tom, na čo ľudia klikajú/hľadajú v súvislosti s FitPilotom.

**RECOMMENDATION — SEO architektúra (návrh, treba overiť dopyt pred plným rozstavaním):**

```
/                       — landing (existuje)
/pre-trenerov/          — hub stránka BUYER-focused
/vyziva/                — nutrition ako samostatný pilier (diferenciátor)
/ai-asistent/           — AI positioning (komunikovať opatrne, kým nie je hotové)
/cennik/                — dedikovaná pricing stránka (SEO + CRO, nie len #cennik anchor)
/porovnanie/            — /porovnanie/gymify, /porovnanie/trainerize, /porovnanie/everfit, /porovnanie/excel-whatsapp
/blog/                  — BOFU/MOFU/TOFU obsah podľa sekcie 14
/nastroje/               — free tools (kalkulačky, sekcia 11 zadania → detail v sekcii "Free tools" nižšie)
```

CZ verzia buď na `fitpilot.cz` alebo `/cz/` subpath s vlastným hreflang a CZ kľúčovými slovami (nie strojový preklad SK verzie).

---

## 12. KEYWORD UNIVERSE

**NEMÁM DÁTA** pre presné search volume, difficulty a CPC (žiadny Ahrefs/GSC/Keyword Planner prístup v tejto session). Nižšie je kvalitatívny keyword universe podľa search intent a funnel stage, s odporúčanou stránkou. Volume/difficulty treba doplniť pred finálnou prioritizáciou — navrhujem to ako prvý krok execution fázy (sekcia 25, Days 8–30).

| Keyword (SK) | Keyword (CZ) | Intent | Funnel | Odporúčaná stránka | Priorita |
|---|---|---|---|---|---|
| softvér pre fitness trénerov | software pro fitness trenéry | Commercial | BOFU | /pre-trenerov | P0 |
| aplikácia pre osobných trénerov | aplikace pro osobní trenéry | Commercial | BOFU | /pre-trenerov | P0 |
| FitPilot vs GYMIFY | FitPilot vs GYMIFY | Comparison | BOFU | /porovnanie/gymify | P0 |
| GYMIFY Coach alternatíva | GYMIFY Coach alternativa | Comparison/Alternative | BOFU | /porovnanie/gymify | P0 |
| Trainerize alternatíva slovensky | Trainerize alternativa česky | Alternative | BOFU | /porovnanie/trainerize | P1 |
| Everfit alternatíva | Everfit alternativa | Alternative | BOFU | /porovnanie/everfit | P1 |
| ako spravovať klientov ako fitness tréner | jak spravovat klienty jako fitness trenér | Problem-aware | MOFU | /blog | P1 |
| Excel vs softvér pre trénera | Excel vs software pro trenéra | Problem-aware | MOFU | /porovnanie/excel-whatsapp | P0 |
| tréningový plán aplikácia | tréninkový plán aplikace | Solution-aware | MOFU | /pre-trenerov | P1 |
| jedálniček pre klientov aplikácia | jídelníček pro klienty aplikace | Solution-aware | MOFU | /vyziva | P1 |
| sledovanie progresu klientov | sledování progresu klientů | Solution-aware | MOFU | /pre-trenerov | P2 |
| BMR kalkulačka | BMR kalkulačka | Informational/tool | TOFU | /nastroje/bmr-kalkulacka | P1 (lead magnet) |
| TDEE kalkulačka | TDEE kalkulačka | Informational/tool | TOFU | /nastroje/tdee-kalkulacka | P1 (lead magnet) |
| makro kalkulačka pre klientov | makro kalkulačka pro klienty | Informational/tool | TOFU | /nastroje/makro-kalkulacka | P2 |
| ako si vypočítať cenu za osobný tréning | jak si spočítat cenu za osobní trénink | Informational (biznis trénera) | TOFU | /blog | P2 |
| ako začať ako online kouč | jak začít jako online kouč | Informational | TOFU | /blog | P2 |
| AI v osobnom tréningu | AI v osobním tréninku | Informational, AI/GEO | TOFU | /ai-asistent, /blog | P3 (počkať na hotové AI) |

**RECOMMENDATION:** Prvý sprint obsahu = riadky P0 (5 stránok). Sú to stránky s najbližšou väzbou na registráciu a najnižším počtom potrebných strán textu na naplnenie search intentu.

---

## 13. BOFU CONTENT OPPORTUNITIES (min. 20, prioritizované)

| # | Téma | Intent | Formát | CTA | Priorita |
|---|---|---|---|---|---|
| 1 | FitPilot vs GYMIFY Coach | Comparison | Stránka + tabuľka | Trial | P0 |
| 2 | FitPilot vs Trainerize (pre SK/CZ trénerov) | Comparison | Stránka | Trial | P0 |
| 3 | FitPilot vs Everfit | Comparison | Stránka | Trial | P1 |
| 4 | Excel + WhatsApp vs softvér pre trénera: kedy je čas prejsť | Problem/switch | Stránka + blog | Trial | P0 |
| 5 | Najlepšia aplikácia pre fitness trénerov na Slovensku (2026) | "Best of" / vlastná kategória | Blog (dlhý) | Trial | P0 |
| 6 | Software pre osobného trénera — kompletný sprievodca výberom | Solution-aware guide | Blog (dlhý) | Trial | P1 |
| 7 | MyFitnessPal pre trénerov: prečo to nefunguje a čo namiesto toho | Problem-aware | Blog | Trial | P1 |
| 8 | Ako previesť existujúcich klientov z Excelu do softvéru za 30 minút | Switching friction | Blog/guide | Trial | P0 (znižuje najväčšiu objekciu) |
| 9 | Koľko si mám pýtať za online koučing? (cenník + kalkulačka) | Biznis trénera, adjacentné BOFU | Blog + nástroj | Trial (soft) | P1 |
| 10 | GYMIFY Coach recenzia — čo robí dobre a kde chýba AI/výživa | Competitor review | Blog | Trial | P1 |
| 11 | Trainerize pricing v EUR — koľko to naozaj stojí pre SK/CZ trénera | Pricing/comparison | Blog | Trial | P1 |
| 12 | Prečo výživa nemá byť platený doplnok (pre trénerov) | Diferenciačný obsah | Blog | Trial | P2 |
| 13 | Ako vyzerá AI asistent, ktorý si pamätá klienta (keď bude live) | Product education | Blog/video | Trial | P3 — počkať na hotové AI |
| 14 | FitPilot cenník vysvetlený — čo dostanem v každom tieri | Pricing | Dedikovaná /cennik stránka | Trial | P0 |
| 15 | Šablóna onboardingu nového klienta pre trénera (lead magnet) | Template/tool | Landing + PDF/Notion | Email + trial | P1 |
| 16 | 5 znakov, že vaša appka na trénerov vás stojí viac ako platíte | Objection handling (add-on creep) | Blog | Trial | P2 |
| 17 | Ako fitness tréner na Slovensku legálne fakturuje online koučing | Adjacentné biznis TOFU/MOFU | Blog | Newsletter | P2 |
| 18 | Prečo americký fitness softvér nefunguje pre SK/CZ trénera (jazyk, jednotky, potraviny) | Positioning content | Blog | Trial | P1 |
| 19 | FitPilot vs TrueCoach | Comparison | Stránka | Trial | P2 |
| 20 | Checklist: čo si pred kúpou softvéru pre trénerov overiť | Comparison/decision aid | Blog/PDF | Trial | P1 |

*(MOFU a TOFU zoznamy — po 20 opportunít každý — pripravím v execution fáze po tvojom schválení stratégie, aby sa nepísalo dopredu obsah pre fázu, ktorá ešte nie je aktuálna; BOFU je zámerne jediný plne rozpísaný teraz, v súlade s "BOFU first" pravidlom zo zadania.)*

---

## 14. CONTENT STRATEGY

**RECOMMENDATION:** Sekvenovanie presne opačné než väčšina nových SaaS projektov robí:

1. **Najprv 5 P0 BOFU stránok** (comparison + Excel/WhatsApp switch + cenník) — toto sú stránky, ktoré môžu konvertovať návštevníka na trial hneď teraz, bez ohľadu na to, či AI je hotové.
2. **Súbežne SK aj CZ verzia** každej stránky (nie sekvenčne) — dvojnásobný trh za nízky dodatočný náklad.
3. **MOFU obsah** (guides, "ako previesť klientov", "koľko si pýtať za koučing") — začať v 2. mesiaci, keď P0 BOFU stojí.
4. **TOFU/free tools** (kalkulačky) — programmatic SEO potenciál, ale vyžaduje vývojársky čas → naplánovať do sekcie 11 zadania (nižšie).
5. Obsah o AI module **odložiť do momentu, keď je funkcia aspoň v internom beta stave** — publikovanie marketingu o niečom nehotovom je riziko #1 (sekcia 23) a poškodilo by dôveru presne u prvých 10–50 zákazníkov, ktorí produkt reálne otestujú.

Formát: písané stránky (SEO-first), nie len blog posty — každá BOFU stránka má vlastnú URL, meta popis, štruktúrovaný FAQ blok (dôležité aj pre GEO, sekcia nižšie).

---

## 15. VIDEO STRATEGY

**RECOMMENDATION — piliere (vybrané podľa VOC a JTBD vyššie, nie generický zoznam):**

1. **PROBLÉM** — deň v živote trénera s Excelom/WhatsAppom (relatable, žiadny predaj).
2. **BUILD IN PUBLIC** — founder ukazuje, čo práve stavia (aj chyby, aj rozhodnutia).
3. **EDUKÁCIA (biznis trénera)** — ceny, retencia klientov, ako neprísť o klienta po 2 mesiacoch.
4. **PRODUCT DEMO** — krátke, konkrétne (jedna funkcia = jedno video, nie "tour").
5. **MYTY O AI V COACHINGU** — kde je hranica AI vs tréner (viaže sa na produktový princíp #1/#5, silný dôveryhodnostný obsah).
6. **COMPARISON** — "toto robí Excel, toto appka" v 30 sekundách.

Formát natáčania: mobil, screen recording, voiceover, jednoduché titulky — presne ako žiada zadanie, žiadna drahá produkcia. Pomer 80 % užitočné/zaujímavé : 20 % produkt, s výnimkou fázy, keď treba priamo hnať trial signupy okolo launch momentu (sekcia 30).

**Poznámka k rozsahu:** Zadanie žiada 50 konkrétnych video ideas s plnými scriptmi a 100+ hook knižnicu. To je **execution-fázová práca s vysokým objemom výstupu** — pripravím ju hneď po tvojom schválení tejto stratégie (aby scripty odkazovali na správne, schválené posolstvo a neprerábali sa). Ak chceš, môžem prvých 10 kompletných scriptov (s hook/shot list/CTA) pripraviť už teraz ako ukážku formátu na tvoje schválenie štýlu.

---

## 16. DISTRIBUTION STRATEGY

**RECOMMENDATION — kde a ako (hodnota, nie spam):**

| Kanál | Prečo | Ako (hodnota, nie spam) |
|---|---|---|
| Certifikačné kurzy trénerov (EfectFit Akadémia, informs.sk, kurz.mojcoach.com, FTVŠ UMB) | Stály prílev nových trénerov práve rozhodujúcich o prvom softvéri | Partnership — pozri sekciu partnerships nižšie |
| FB skupiny/stránky (Fitness Trenéři CZ, Česká komora fitness, EfectFit.sk komunita) | Existujúca organizovaná trénerská scéna | Odpovedať na reálne otázky o softvéri/organizácii klientov, nie postovať odkazy |
| Reddit (r/personaltraining a lokálne SK/CZ subreddity, ak existujú aktívne) | Nefiltrovaný VOC aj distribúcia | Odpovede na vlákna o "ako organizovať klientov", zmienka len keď relevantná |
| YouTube (dlhší formát) | Evergreen, SEO cez YouTube search aj Google | Deep-dive edukácia + demo |
| Instagram/TikTok (short-form) | Kde tréneri aj tak už sú (budujú si tam vlastnú klientelu) | Founder-led + problem/education piliere |
| Newsletter (vlastný, malý) | Nurture leads z BOFU stránok, ktorí ešte nekonvertovali | Krátky, praktický, nie predajný |

**RECOMMENDATION:** Nesnažiť sa byť všade naraz — 1–3 hlavné kanály (sekcia 18 dole rozoberá prioritizáciu social).

---

## 17. FOUNDER-LED STRATEGY

**RECOMMENDATION:** Founder (majiteľ projektu) je najsilnejší asset, ktorý FitPilot má a ktorý stojí 0 € navyše. Obsah:
- Prečo vzniká FitPilot (frustrácia z toho, že SK/CZ tréneri nemajú nič poriadne).
- Rozhodnutia počas vývoja (prečo výživa od začiatku, prečo AI má tvrdé zdravotné hranice, prečo nie je "ďalší Trainerize clone").
- Zákulisie — čo sa práve rieši, aj chyby/opravy (viď skutočné položky z `README.md` Novinky — autentický, nezveličený materiál).
- Rozhovory s reálnymi trénermi (VOC zber = zároveň content).

Toto sa dá stavať **už teraz**, nezávisle od AI dokončenia — je to najrýchlejšia cesta k prvým 10–50 dôverujúcim sledovateľom, ktorí sa neskôr stanú beta testermi.

*(Konkrétny 30-dňový content kalendár pripravím v execution fáze po schválení — vyžaduje si to tvoj vstup, čo presne si ochotný verejne zdieľať zo zákulisia, pozri sekciu 26.)*

---

## 18. PRODUCT-LED GROWTH

**FACT-based loop (na základe reálnych funkcií produktu):**

TRÉNER pozve KLIENTA cez appku (existuje: pozývací kód) → KLIENT používa appku denne v posilňovni (portál, chat, food diary) → KLIENT vidí branding FitPilot (nie biele logo v Starter/Pro tieroch — to je až Business feature) → KLIENT sa sám stane trénerom alebo odporučí appku inému trénerovi, ktorého pozná (fitness komunita je prepojená).

**RECOMMENDATION:**
- **Referral mechanika pre trénerov** (odporuč iného trénera → mesiac zadarmo/zľava) — jednoduchá, netreba komplexný systém na začiatok.
- **Klientský portál ako "showroom"** — kvalitný, pekný klientský zážitok je nepriamy marketing (klient, ktorý je aj sám trénerom alebo o tom uvažuje, vidí produkt v akcii).
- Zvážiť do budúcna "free self-client mode" (appka už umožňuje klientovi vytvoriť si vlastný tréning aj bez trénera, podľa ROADMAPu) ako ľahký vstupný bod, ktorý neskôr konvertuje na "staň sa aj ty trénerom v appke" — ale toto by riedilo B2B positioning, ak sa urobí nesprávne — **watch, neaktivovať teraz**.

---

## 19. LOW-BUDGET PAID ADS STRATEGY

**RECOMMENDATION:** Platené reklamy teraz slúžia výhradne na (a) validáciu messagingu, (b) BOFU search intent, (c) retargeting návštevníkov BOFU stránok. Nie na budovanie awareness od nuly.

Navrhované experimenty (nie kampane):
- **Google Ads, €5–10/deň, 2 týždne:** len na najsilnejšie transakčné výrazy z keyword universe (P0 riadky sekcie 12) — najmä brand+comparison výrazy ("GYMIFY alternatíva", "softvér pre fitness trénerov") — kde je nákupný zámer najvyšší a rozpočet sa minie na málo, ale kvalitných kliknutí.
- **Meta Ads, 3 creatives × €5/deň × 7 dní:** validácia 2–3 angles z bodu 27 zadania (SAVE TIME, STOP USING EXCEL + WHATSAPP, AI ASSISTANT) na malej SK/CZ audience fitness trénerov (interest-based + lookalike, ak/keď bude email list).
- Stop/scale kritériá nastaviť **pred** spustením každého testu (napr. CTR pod X % alebo CPC nad Y € po 3 dňoch = stop), nie posudzovať priebežne emocionálne.

**RECOMMENDATION:** Nespúšťať žiadny platený test skôr, než (a) je cenník finálny (nie "orientačný"), (b) landing page prejde CRO auditom (sekcia 20) — inak sa platí za traffic na stránku, ktorá ešte nekonvertuje čo najlepšie.

*(Presné ad copy, headlines, keywords, negatívne kľúčové slová pripravím v execution fáze — je to rýchla práca, len po schválení stratégie a po finalizácii cenníka.)*

---

## 20. LANDING PAGE / CRO AUDIT

Auditovaná aktuálna `/` (app/page.tsx, FACT zo zdrojového kódu).

**Čo funguje dobre:**
- Jasný headline priamo s USP ("Tréningy, výživa aj AI kouč. Na jednom mieste.").
- Positioning blok priamo porovnáva "oni vs my" (jazyk, výživa, AI, cena) — presne to, čo BOFU návštevník potrebuje.
- Footer má čestný disclaimer, že dáta sú ilustračné — správne, žiadne fabrikované social proof.
- Cenník je transparentne označený ako orientačný.

**Zistenia a odporúčania (P0–P3):**

| Priorita | Zistenie | Odporúčanie |
|---|---|---|
| **P0** | Landing page prezentuje AI chat pre klienta a AI generátor plánov ako súčasť "01 MVP" fázy, ale podľa ROADMAP.md tieto funkcie **ešte vôbec nie sú postavené**. Ak niekto začne trial teraz, AI mu chýba. | Buď preformulovať fázový blok (AI označiť ako "prichádza čoskoro" jasne), alebo nespúšťať marketing/trial signupy skôr, než je aspoň interná AI beta funkčná. Toto je najdôležitejšie zistenie celého auditu — nesúlad medzi marketingovým sľubom a stavom produktu priamo poškodí dôveru prvých používateľov. |
| **P0** | Cenník (15–20 / 40–50 / 80–100 €) je široký rozsah s poznámkou "orientačný" — pre platenú kampaň alebo akýkoľvek trial signup to vytvára neistotu ("čo nakoniec zaplatím?"). | Finalizovať presné čísla pred akoukoľvek platenou akvizíciou; rozsah je OK pre "coming soon" fázu, nie pre aktívny trial CTA. |
| **P1** | Žiadna FAQ sekcia na landing page — BOFU návštevník s objekciami (prechod z Excelu, cena, AI zdravotné hranice) nemá kde nájsť odpoveď bez kontaktovania. | Pridať FAQ blok (aj kvôli GEO/AI Search, sekcia nižšie) s otázkami z VOC sekcie 5. |
| **P1** | CTA "Vyskúšať zadarmo" vedie na `/prihlasenie`, čo je spoločná auth stránka pre obe role — treba overiť, či je od prvého kroku jasné, že si tréner vyberá "som tréner" (nie klient), aby sa nezvyšovalo trenie/zámena. | Skontrolovať/potvrdiť rolový rozdeľovač hneď na `/prihlasenie` (mimo rozsahu tohto auditu — vyžaduje pohľad na tú stránku). |
| **P2** | Demo blok v hero (dashboard preview) je silný vizuál, ale je statický obrázok kódu/textu — nie skutočný screenshot appky. | Pred verejným launchom nahradiť skutočným (rozmazaným/demo-dátovým) screenshotom appky — zvyšuje dôveryhodnosť, že produkt reálne existuje. |
| **P2** | Chýba dedikovaná `/cennik` URL (cenník je len anchor `#cennik` na landing page) — obmedzuje SEO potenciál pre "FitPilot cenník" a znemožňuje platenú kampaň smerovať priamo na pricing intent. | Presunúť/duplikovať cenník na vlastnú indexovateľnú URL. |
| **P3** | Sekcia "Ako sa appka bude stavať" (fázový roadmap) je transparentná a sympatická, ale verejné vystavenie interného roadmapu môže konkurencii (GYMIFY, MOSUDA) ukázať presne, čo a kedy plánujete. | Zvážiť, či fázový detail patrí na verejný landing, alebo len do build-in-public obsahu s kontrolovanejším rámcovaním. |

---

## 21. FIRST 10 USERS STRATEGY

**RECOMMENDATION:** Nula zo SEO alebo ads. Manuálne, 1:1:
1. Zoznam 30–50 trénerov z vlastnej siete + FB skupín + absolventov kurzov (kontakty verejne dostupné cez inštruktorov/akadémie, nie scraping).
2. Priamy, osobný odkaz (nie masový) — pozícia "buduješ appku pre nich, chceš ich názor skôr, než je hotová" (VOC rozhovor zo sekcie 5, dvojúčelovo).
3. Ponuka: doživotná zľava / prvý rok zadarmo výmenou za feedback a otvorenosť byť referenciou neskôr (ak budú spokojní — nič sa nesľubuje vopred ako isté).
4. Cieľ nie je "10 registrácií", ale **10 trénerov, ktorí appku reálne 2 týždne používajú s aspoň 1 klientom** — aktivácia, nie len signup.

---

## 22. FIRST 100 USERS STRATEGY

**RECOMMENDATION:** Rozšírenie toho istého motora, nie zmena kanála:
- Prvých 10 (aktivovaných) trénerov požiadať o odporúčanie 1–2 kolegov (referral loop zo sekcie 18) — teraz už s reálnym, nie hypotetickým produktom za sebou.
- P0 BOFU stránky + Google Search Console dáta z prvého mesiaca ukážu, ktoré výrazy reálne prinášajú návštevnosť — škálovať obsah presne tam, nie podľa dohadov.
- Partnership s 1–2 certifikačnými kurzmi (sekcia 20 zadania nižšie) — jeden kurz s desiatkami absolventov ročne môže sám osebe priniesť viac než platená kampaň za rovnaký rozpočet.
- Founder-led obsah (sekcia 17) by mal mať za 60–90 dní narastajúcu, aj keď malú, sledovanosť — prvý skutočný organic kanál nezávislý od SEO.

**NEMÁM DÁTA** na to, koľko z 500 by realisticky prišlo z ktorého kanála — toto sa dá modelovať až s reálnymi konverznými dátami z prvých 100, nie teraz.

---

## 23. BIGGEST RISKS

1. **P0 — Marketing/produkt nesúlad:** Landing page a positioning stavajú na AI ako hlavnom diferenciátore, ale AI ešte nie je postavené. Riziko: prví používatelia sklamaní, negatívne prvé dojmy sa v malej komunite (SK/CZ tréneri sa poznajú) šíria rýchlo a sú ťažko opraviteľné. **Mitigácia:** sekvenovať marketing tak, aby "časová úspora + výživa + poriadok" niesli posolstvo teraz, AI sa komunikuje ako "prichádza" až do momentu, keď je aspoň v beta.
2. **Cenník nie je finálny:** "Orientačný cenník" bráni akejkoľvek platenej kampani a znižuje dôveru pri organic BOFU návšteve (návštevník s vysokým nákupným zámerom nechce vidieť rozsah cien).
3. **Rodiaci sa konkurent MOSUDA** má prekvapivo blízky positioning (AI výživa, dual-sided freemium) — ak pridá tréningový builder skôr, než FitPilot dokončí AI, prekryv sa zväčší. Sledovať priebežne (Google Alerts, App Store).
4. **Malý tím (2 ľudia) vs veľký rozsah zadania:** 26-bodová stratégia + 50 video scriptov + 100 hookov + kompletná content/ads exekúcia je objem práce na mesiace, nie týždne — riziko rozptýlenia na príliš veľa kanálov naraz namiesto 1–3 fungujúcich. **Mitigácia:** prísna P0/P1 prioritizácia (sekcia 24), nie paralelné spustenie všetkého.
5. **Chýbajúci reálny VOC dátový základ pre SK/CZ špecificky** — väčšina VOC v sekcii 5 je z anglických recenzií globálnych nástrojov, nie priamo od SK/CZ trénerov. Riziko: obsah/copy môže sedieť na globálny trh, ale netrafiť presný jazyk SK/CZ trénera. **Mitigácia:** 10–15 rozhovorov pred veľkým objemom contentu (sekcia 5, 21).

---

## 24. TOP 10 QUICK WINS (nízky náklad, vysoký dosah, dá sa spraviť rýchlo)

| # | Quick win | Impact | Effort | Náklad |
|---|---|---|---|---|
| 1 | Pripojiť Google Search Console + Google Analytics (alebo privacy-friendly alternatívu) na landing page | Vysoký (dáta pre všetko ostatné) | Nízky | 0 € |
| 2 | Postaviť `/porovnanie/gymify` BOFU stránku | Vysoký | Stredný | 0 € (čas) |
| 3 | Postaviť dedikovanú `/cennik` URL namiesto anchoru | Stredný–Vysoký | Nízky | 0 € |
| 4 | Pridať FAQ blok na landing page (VOC objekcie) | Stredný | Nízky | 0 € |
| 5 | Opraviť/preformulovať AI-v-MVP nesúlad na landing page | Vysoký (riziko #1) | Nízky | 0 € |
| 6 | 10 VOC rozhovorov s reálnymi trénermi | Vysoký (základ pre všetko ďalšie) | Stredný | 0 € |
| 7 | Založiť 1 hlavný social kanál (founder-led, build-in-public) | Stredný, compounding | Stredný (priebežný) | 0 € |
| 8 | Kontaktovať 1–2 trénerské akadémie s partnership ponukou | Vysoký (ak vyjde) | Nízky | 0 € |
| 9 | Napísať "Excel vs softvér pre trénera" stránku | Vysoký (rieši najväčšiu objekciu) | Stredný | 0 € |
| 10 | Nastaviť Google Alerts na GYMIFY, MOSUDA, "software pro osobní trenéry" | Nízky, ale prevencia | Nízky | 0 € |

---

## 25. 30 / 60 / 90 DAY PLAN

### First 7 days
- QW #1, #5, #10 (analytics, oprava AI nesúladu, alerts) — P0, effort nízky, cost 0€, impact vysoký, owner: founder/dev.
- Naplánovať a začať VOC rozhovory (QW #6) — kontaktovať prvých 10–15 ľudí.
- Rozhodnúť finálny cenník (blokuje kroky nižšie).

### Days 8–30
- Postaviť P0 BOFU stránky (comparison ×2–3, Excel/WhatsApp, /cennik) — SK aj CZ verzie.
- Spustiť 1 hlavný social/founder-led kanál, 2–3 posty týždenne.
- Dokončiť VOC rozhovory, aktualizovať VOC sekciu tohto dokumentu reálnymi citáciami.
- Kontaktovať 1–2 trénerské akadémie/kurzy (partnership).
- Manuálny outreach na prvých 10 beta trénerov (sekcia 21).

### Days 31–60
- Rozšíriť BOFU o zvyšné P1 stránky, prvé MOFU stránky.
- Vyhodnotiť prvé GSC dáta → upraviť keyword prioritizáciu reálnymi číslami.
- Prvý malý platený test (Google Ads P0 výrazy, €5–10/deň, 2 týždne) — **len ak** je cenník finálny a landing prešiel CRO opravami.
- Založiť referral mechaniku pre existujúcich (beta) trénerov.
- Prvé video scripty a natáčanie podľa pilierov (sekcia 15).

### Days 61–90
- Škálovať to, čo funguje podľa dát (nie podľa pocitu) — ktorý kanál/stránka reálne priniesol aktivovaných trénerov.
- Druhá vlna partnership outreach.
- Rozhodnúť o druhom platenom experimente (Meta Ads creative test) na základe výsledkov Google testu.
- Vyhodnotiť, či je AI modul dostatočne hotový na to, aby sa stal hlavným marketingovým posolstvom (posun z "časová úspora" na "AI, ktoré si pamätá klienta").

*(Každá úloha v pláne má priradenú prioritu/effort/cost/impact v tabuľkách vyššie namiesto duplicitného opakovania — presné dátumové priradenie odporúčam spraviť až po tvojom schválení, keďže závisí od reálnej kapacity dvoch ľudí popri vývoji produktu.)*

---

## 26. WHAT YOU NEED FROM ME (rozhodnutia a vstupy, ktoré potrebujem)

1. **Schválenie tejto stratégie** (alebo úprav) — až potom prechádzam do execution módu (písanie stránok, scriptov, kampaní).
2. **Finálny cenník** — presné čísla namiesto rozsahov, inak nemôžem pripraviť pricing stránku ani žiadny platený test.
3. **Rozhodnutie o AI komunikácii** — komunikovať AI ako "prichádza" od teraz, alebo počkať s marketingom AI úplne až do beta? Ovplyvňuje celý content/video plán.
4. **Prístup k dátam:** Google Search Console / Analytics (ak už existuje účet), prípadne Ahrefs/Semrush ak máte — inak SEO prioritizácia zostáva kvalitatívna.
5. **Súhlas s rozsahom "build in public"** — čo presne si ochotný verejne zdieľať zo zákulisia vývoja (rozhodnutia, chyby, roadmap) — ovplyvňuje founder-led content calendar.
6. **Kontakty/prístup** na trénerské akadémie/kurzy, ak už také existujú vo vašej sieti (EfectFit, informs.sk a pod.) — urýchli partnership outreach.
7. **Rozhodnutie, kto robí VOC rozhovory** (ty, kolega, alebo mám pripraviť len script a otázky na to, aby ste ich viedli vy).
8. **Potvrdenie, že mám pokračovať do execution módu presne v poradí:** VOC rozhovory → P0 BOFU stránky → founder-led kanál štart → partnership outreach → prvý platený test — alebo chceš iné poradie.

---

### Zdroje použité v tomto dokumente

- [GYMIFY Coach](https://coach.gymify.sk/) · [GYMIFY cenník kontext](https://gymify.sk/nova-aplikacia-gymify)
- [Refresher.sk — MOSUDA](https://refresher.sk/150203-Koucing-tabulky-jedalnicek-a-AI-v-jednom-Slovaci-vymysleli-fitnes-apku-ktoru-si-zamiluju-aj-treneri)
- [FitJam](https://fitjam.app/)
- [Everfit vs Trainerize vs TrueCoach](https://blog.everfit.io/everfit-vs-trainerize-vs-truecoach)
- [Trainerize pricing 2026](https://www.quickcoach.fit/trainerize-pricing-2026.html)
- [Capterra — Everfit reviews](https://www.capterra.com/p/202837/Everfit/reviews/?page=2)
- [ABC Fitness help center — MyFitnessPal sync](https://help.abcfitness.com/ignite/Engagement/Coach/Support/MyFitnessPal.htm)
- [Trainerize help — MyFitnessPal sync](https://help.trainerize.com/hc/en-us/articles/360039694052-Troubleshooting-MyFitnessPal-Not-Syncing-For-Clients)
- [EfectFit Akadémia — trénerské kurzy](https://trenerske-kurzy.efectfit.sk/)
- [FTVŠ UMB — kondičný tréner kurz](https://www.ftvsz.umb.sk/trenerske-vzdelavacie-centrum/ponuka-akreditovanych-kurzov-v-specializaciach-a-kvalifikaciach/kondicny-trener-1-kvalifikacneho-stupna.html)
- Interné zdroje: `PRODUCT.md`, `DESIGN.md`, `ROADMAP.md`, `README.md`, `docs/projektbrief.md`, `app/page.tsx` (repozitár `FitCoach`/FitPilot)
