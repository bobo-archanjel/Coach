# FitPilot — "Čoskoro" intro/teaser reklama (10s + 30s)

Toto sú dva scenáre na predstavenie appky ako **coming-soon oznam**, nie predajná/konverzná reklama (tá je pre neskoršiu fázu, keď appka bude reálne live a cenník finálny — viď `FitPilot_Growth_Strategy_v1.md`). CTA je preto "sleduj nás / buď prvý", nie "skús zadarmo".

## Prečo tento koncept (a nie ďalší "telefón priletí do rámu")

Skoro každá SaaS reklama dnes používa rovnaký trik — telefón priletí, ukáže sa screenshot, hotovo. Chcel som niečo, čo je **zakorenené vo vašom vlastnom brande**, nie univerzálna šablóna:

**FitPilot logo je šípka/dart** (dva šikmé pruhy + trojuholníkový hrot) — meno "Pilot" je doslova o navigácii/riadení. Koncept preto stavia na metafore **"prestaň lietať naslepo"** — chaos nástrojov sa vizuálne "prereže" tvarom vášho vlastného loga, ktoré sa následne stane bránou k appke. Je to jediný vizuálny hák, ktorý mi konkurencia (Trainerize, Everfit, TrueCoach, GYMIFY, MOSUDA — viď predchádzajúci competitor research) fyzicky nemôže skopírovať, lebo nemá vašu značku ani jej tvar. Toto je presne tá "unikátnosť", čo si pýtal.

Dá sa to natočiť/animovať aj bez zložitého 3D — hlavná záťaž je na After Effects (shape layers, masking), Blender je tu voliteľný bonus na jeden detail (pozri poznámky nižšie), nie nutnosť.

---

## VARIANT 1 — 10 SEKÚND (teaser, čistý brand moment)

| Čas | Čo sa deje | Ako to natočiť/animovať |
|---|---|---|
| 0:00–0:02 | **HOOK.** Tmavá obrazovka (#121110). Naraz (nie postupne) sa objavia 4-5 malých, generických, sivých ikoniek/tvarov rozhádzaných po obrazovke — tabuľka/mriežka, bublina správy, papierový dokument, kalkulačka. Žiadny text, žiadne logá tretích strán. | AE: shape layers, `scale` keyframe z 0→100% s Overshoot (nie lineárne), všetky naraz v 1 snímke. |
| 0:02–0:04 | Cez celý rám preletí **jeden ostrý coral (#E0402A) šípkovitý tvar** presne v uhle FitPilot loga — rozhádže/odfúkne tie ikonky mimo záber (motion blur v smere letu). | AE: `Position` + `Rotation` keyframe na shape layer s vaším presným logo-tvarom, `Directional Blur` počas pohybu, ikonky majú vlastný "knockback" animovaný tesne po prelete šípky. |
| 0:04–0:06 | Šípka sa spomalí a **zosúladí s FitPilot logom** — z jednoduchého tvaru sa "poskladá" celé logo (pridá sa druhý pruh + wordmark "FitPilot"). | AE: `Trim Paths` alebo jednoduchý cross-dissolve medzi tvarom šípky a finálnym logo assetom (dodaný súbor, nemeniť). |
| 0:06–0:09 | Krátky, jeden-jediný záblesk reálneho screenshotu (portál "Dnes", coral prstenec) — cez malé okienko/kartu, nie cez celý rám, akoby logo "odhalilo pohľad dovnútra". | Buď 2D (screenshot ako layer s jednoduchým `scale`/`opacity` reveal v AE), alebo ak chceš použiť Blender: len tu, jeden statický 3D telefón s screenshotom ako emission textúra, žiadna kamera animácia netreba. |
| 0:09–0:10 | Text: **"Čoskoro."** pod logom, malý amber (#E6B23A) label. | AE, jednoduchý fade/scale-in. |

**Voiceover:** žiadny (nechaj len hudbu + text) — 10s je príliš krátkych na hovorené slovo, ktoré by stihlo dýchať.
**Hudba:** krátky riser + jeden bass hit presne na moment "zosúladenia loga" (0:04-0:05), potom ticho do konca.
**On-screen text:** len "Čoskoro." na konci — nič iné, nechaj vizuál (šípka/chaos/logo) hovoriť sám.

---

## VARIANT 2 — 30 SEKÚND (plnší brand príbeh, stále coming-soon, nie predajný)

| Čas | Čo sa deje | Poznámka |
|---|---|---|
| 0:00–0:03 | **HOOK.** Rovnaký chaos ako vo variante 1 (rozhádzané ikonky), ale tentokrát s textom, ktorý sa objaví súčasne: **"Riadiť trénerský biznis naslepo?"** | Otázka, nie tvrdenie — necháva diváka domyslieť si vlastnú frustráciu, silnejšie než generický pain-point výrok. |
| 0:03–0:06 | Coral šípka prereže chaos (rovnaká mechanika ako 10s verzia, len s trochu dlhším doznením/motion blurom). | — |
| 0:06–0:10 | Šípka sa poskladá do FitPilot loga + wordmark + tagline **"Tréning. Výživa. Komunikácia. Rast."** | Tagline sa objaví word-by-word, malé, pod logom. |
| 0:10–0:14 | Prvý reálny screenshot: **portál "Dnes"** (coral prstenec) vo vnútri jednoduchej kartovej kompozície (nie nutne 3D telefón — stačí displej ako "okno" s jemným tieňom). Text vedľa: **"Klient má svoj tréning jasne, priamo v telefóne."** | — |
| 0:14–0:18 | Druhý screenshot: **zoznam klientov trénera** (dashboard). Text: **"Ty vidíš všetkých na jednom mieste."** | Rýchly, sebavedomý strih, nie pomalý dolly ako v predajnej verzii — toto je teaser, tempo môže byť rezkejšie. |
| 0:18–0:22 | Tretí screenshot: **Makro cieľ + Adherencia stravy**. Text: **"Výživa nie je doplnok. Je súčasť od začiatku."** | Priamy odkaz na diferenciáciu z positioningu. |
| 0:22–0:26 | Krátka, čestná zmienka o AI — **žiadny fake screenshot**, len abstraktný vizuál (jemné dátové línie/pulzujúci bod v coral/amber, žiadne UI). Text: **"A AI, ktoré si pamätá klienta, prichádza."** | Presne v súlade s tým, že AI ešte nie je hotové — nesľubuj viac než appka reálne má. |
| 0:26–0:30 | Logo + tagline sa vrátia, pod tým: **"FitPilot. Čoskoro pre trénerov na Slovensku a v Česku."** + menší riadok: **"Sleduj nás →"** (Instagram handle) | CTA je "sleduj", nie "skús zadarmo" — appka ešte nie je verejne live, toto je budovanie publika pred launchom (presne stratégia z growth dokumentu). |

**Voiceover (voliteľný, pridáva sa len ak chceš — bez neho funguje aj čisto textovo):**
> "Riadiť trénerský biznis naslepo? FitPilot preberá kormidlo. Klient má svoj tréning jasne, priamo v telefóne. Ty vidíš všetkých na jednom mieste. A výživa nie je doplnok — je súčasť od začiatku. AI, ktoré si pamätá klienta, prichádza. FitPilot. Čoskoro pre trénerov na Slovensku a v Česku."

**Hudba:** tichšia/napätá pod hookom (0-6s) → nárast pri logo reveale (6-10s) → sebavedomé, stabilné tempo pod screenshotmi (10-22s) → tlmenie pri AI zmienke (22-26s, dať priestor abstraktnému vizuálu) → pokojný, sebavedomý záver (26-30s).

---

## Praktické poznámky k výrobe (Blender / AE / Premiere)

- **Kde je Blender skutočne užitočný tu:** len na jeden detail, ak chceš — realistickejší tieň/odlesk pod kartou so screenshotom, alebo jemná 3D rotácia loga pri "poskladaní" (0:04-0:06 / 0:06-0:10). Netreba naň stavať celú reklamu — 2D shape-layer prístup v AE bude rýchlejší aj lacnejší na iterácie.
- **Šípka/dart tvar** — vytiahni presné body/uhol priamo z dodaného loga (`docs/Design/logo.png`) ako reference vo AE, nekresli ju od oka, nech sedí 1:1 s brandom.
- **Žiadny fake AI screenshot** — dodržať aj tu, presne ako v predchádzajúcich verziách.
- **Font:** Inter, Bold/ExtraBold pre nadpisy, presne podľa `DESIGN.md`.
- **Farby:** `#121110` pozadie, `#E0402A` coral (šípka, primárny akcent), `#E6B23A` amber (len sekundárne — tagline label, AI zmienka), `#F3EFE6` biely/teplý text.
- **Export pre Instagram:** 1080×1920, 9:16, H.264, 30fps, ~10-12 Mbps.

---

## O konkurencii — čo sme si už overili (žiadna nová položka nezistená pri tomto zadaní)

Konkurenčný prieskum (Trainerize, Everfit, TrueCoach, GYMIFY Coach, MOSUDA) je už hotový v `FitPilot_Growth_Strategy_v1.md` — žiadny z nich nerobí SK/CZ launch/teaser video marketing ani obsah okolo vlastného brand motívu, takže tento "šípka prereže chaos" koncept nemá v SK/CZ priestore priamu paralelu, ktorú by som musel obchádzať alebo sa jej vyhýbať.
