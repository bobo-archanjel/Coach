# FitPilot — Video reklama: KONCEPT (Časť 1/2)
Pripravené: 2026-08-31 · Zatiaľ BEZ scén/Higgsfield promptov — tie prídu v Časti 2, hneď ako budem mať reálne screenshoty appky (čakám, kým mi napíšeš, že beží `npm run dev`).

---

## ⚠️ Dôležitá vec, ktorú musíš vyriešiť skôr, než dokončím scénar

Zadanie žiada scénu s **AI diferenciátorom** (bod 7 štruktúry, bod 19 zadania — "AI feature musí vyzerať premium", s "real FitPilot AI screenshot").

**PRODUCT TRUTH problém:** Podľa `ROADMAP.md` a briefu **AI chat pre klienta ani AI generátor plánov pre trénera ešte vôbec nie sú postavené** — sú vedome odložené na koniec. Neexistuje teda žiadny reálny screenshot AI funkcie, ktorý by som mohol použiť ako "fixed screen replacement" (bod 5 zadania — nevymýšľať UI, ktoré neexistuje).

Landing page (`app/page.tsx`) má v hero sekcii ilustračnú HTML/CSS maketu AI chat bubliny ("Čo mám dnes zjesť...") — ale je to dizajnová ukážka, nie screenshot bežiacej appky, a footer landing page to sám explicitne priznáva ("dáta sú ilustračné ukážky, nie reálne referencie").

**Potrebujem od teba rozhodnutie (vyber jednu z troch ciest, poviem ti to na "later"):**

- **A. AI scénu vynechať úplne** — reklama sa postaví na 4-5 reálnych, hotových funkciách (klienti, tréning, výživa, adherencia, chat tréner↔klient) a AI sa spomenie len jednou vetou v CTA ("AI asistent už čoskoro") bez akéhokoľvek screenshotu.
- **B. AI scénu urobiť abstraktne, bez UI** — vizuál dátových liniek/particles + voiceover sľubujúci AI, ale bez akejkoľvek napodobeniny chatového rozhrania (nehrozí klamanie, lebo sa nič nezobrazuje ako "toto appka robí dnes").
- **C. Použiť landing page ilustračnú maketu ako explicitne označenú koncepciu** ("takto bude AI chat vyzerať" s jasným vizuálnym rámcovaním "coming soon", nie ako reálny screenshot appky).

Moje odporúčanie: **B** — najbezpečnejšie pre dôveryhodnosť aj pre Higgsfield (žiadne riziko, že model "domýšľa" fake UI text). Píšem scénar zatiaľ s touto voľbou, ale ľahko sa dá prepnúť na A/C, keď mi povieš.

---

## 1. ADVERTISING ANGLE

**"Stop Excel + WhatsApp chaos. Get a real client system — built for SK/CZ trainers."**

Nie "AI fitness appka" (kategória, kde je dnes najviac šumu a najmenej dôvery), ale **"nástroj, ktorý ti vráti čas"** — pain-first, nie feature-first. AI je bonus na konci, nie hák na začiatku (súlad s marketingovou stratégiou — sekcia 2 predchádzajúceho dokumentu: AI ešte nie je hotové, takže nemôže niesť hlavnú váhu sľubu).

## 2. WHY THIS ANGLE

- VOC research (viď `docs/marketing/FitPilot_Growth_Strategy_v1.md`, sekcia 5) potvrdzuje: administratíva/roztrúsené nástroje sú najuniverzálnejší, najviac zdieľaný pain bod naprieč trénermi (Excel/WhatsApp/MyFitnessPal).
- Je to jediný angle, ktorý sa dá **100 % postaviť na hotových, reálnych funkciách appky** bez rizika sľubovať niečo, čo ešte nefunguje.
- Rieši aj marketing/produkt nesúlad, ktorý som identifikoval v predchádzajúcom audite (P0 riziko #1) — reklama nebude sľubovať AI, ktoré klient hneď po registrácii nedostane.

## 3. 5 HOOK OPTIONS

| # | HOOK TEXT | VISUAL HOOK | TARGET PAIN | WHY IT SHOULD WORK |
|---|---|---|---|---|
| 1 | "Jeden klient. Päť aplikácií?" | Chaos vizuál — telefón so 4-5 notifikáciami naraz (WhatsApp, Excel, MyFitnessPal, mail) | Fragmentácia nástrojov | Konkrétny, vizuálne okamžite čitateľný, tréner sa v tom spozná za 1 sekundu |
| 2 | "Koľko klientov ti dnes napísalo o 22:00?" | Telefón rozsvieti sériu notifikácií v tme | Práca mimo pracovného času, work-life balance | Emocionálne najsilnejší, dotýka sa vyhorenia, nie len administratívy |
| 3 | "Stále posielaš plány cez WhatsApp?" | Split-screen: WhatsApp text plán vs. FitPilot karta | Vnímaná neprofesionalita | Priamy, provokatívny, dobrý pre trénerov, ktorí sa už považujú za "biznis" |
| 4 | "Tvoji klienti si zaslúžia viac ako Word dokument." | Word dokument sa "roztrhne"/rozpustí a odhalí FitPilot | Kvalita klientského zážitku (nie trénerov pain, ale jeho ambícia) | Aspiratívny rámec, menej "problém", viac "upgrade" |
| 5 | "Excel. WhatsApp. MyFitnessPal. A ešte tréningové plány?" | Rýchly cut medzi 4 ikonami appiek | Presne pomenovaný status quo stack | Najkonkrétnejší zo všetkých — priamo pomenúva status-quo konkurentov identifikovaných v market research |

## RECOMMENDED HOOK

**#5 — "Excel. WhatsApp. MyFitnessPal. A ešte tréningové plány?"**

Dôvod: je to jediný hook, ktorý priamo pomenúva overený status quo (VOC research + priznanie zakladateľa konkurenčnej appky MOSUDA, že presne toto je dôvod vzniku takýchto appiek). Funguje ako "pattern interrupt" pri scrollovaní — vymenovanie 3 konkrétnych, rozpoznateľných appiek je konkrétnejšie než abstraktná otázka, a rytmicky sa dobre strihá (4 rýchle logo/ikona cuty za 2 sekundy).

## 4. VIDEO LENGTH

**40 sekúnd.** Retention > length (bod 9 zadania). Pri 4-6 benefitoch + AI teaseri + CTA sa 60 sekúnd zbytočne naťahuje pre social-first formát (Reels/TikTok/Shorts) — 40s drží tempo, každá scéna má jasný dôvod byť tam.

## 5. CORE MESSAGE

"Tvoji klienti a ich tréningy, výživa aj komunikácia na jednom mieste — po slovensky/česky, s výživou od základu, nie ako doplnok. AI, ktoré si pamätá klienta, prichádza čoskoro."

## 6. SCREENSHOT ANALYSIS (predbežná, na základe DESIGN.md — nahradím reálnymi screenshotmi v Časti 2)

Namiesto skutočných screenshotov mám zatiaľ presný **popis reálnych, existujúcich obrazoviek** z `DESIGN.md`/kódu. Keď dostanem screenshoty, doplním do tejto tabuľky presné súbory/URL a upravím výber, ak sa niečo zmenilo:

| Obrazovka | Čo zobrazuje | Hlavná funkcia | Hlavný benefit | Marketing value | Visual potential | Best use | Device | Camera move (predbežne) | Transition (predbežne) |
|---|---|---|---|---|---|---|---|---|---|
| `/portal` — karta "Dnes" | Pozdrav menom, prstenec postupu (coral), zoznam cvikov dňa, coral CTA "Začať tréning" | Denný tréning klienta | Klient má jasný, motivujúci prehľad — nie papier | Vysoká — coral progress ring je vizuálne najsilnejší natívny prvok appky | Vysoký — animovaný prstenec sa dá rozšíriť do 3D | **HERO shot produktu** | 3D smartphone | Dolly-in na prstenec | Match cut cez prstenec do dashboardu |
| `/dashboard` — zoznam klientov + `.alertPanel` | Roster klientov, status chip "meškanie", coral alert panel | Prehľad všetkých klientov naraz | Tréner vidí za pár sekúnd kto potrebuje pozornosť | Vysoká — priamo rieši JTBD #4 | Stredný-vysoký — karty sa dajú "vysunúť" do 3D | Dashboard/floating monitor scéna | Floating laptop/monitor | Orbit okolo monitora | KPI karta preletí ako mask |
| `/dashboard/klienti/[id]` — karta "Adherencia stravy" | % z kalorického cieľa dnes + 7-dňový bodkový pás | Sledovanie dodržiavania výživy klienta | Tréner vidí adherenciu bez pýtania sa | Vysoká — priamo dokazuje "výživa = core, nie add-on" | Stredný — bodky sa dajú animovať ako "napĺňanie" | Nutrition/výživa scéna | Phone alebo floating card | Macro zoom na bodkový pás | Bodka sa rozšíri na celý frame |
| `/dashboard/vyziva/[clientId]` — makro bary | BMR/TDEE + 3 farebné `.macroBarRow` (bielkoviny/sacharidy/tuky) | Výpočet a cieľ makier | Konkrétne čísla, nie odhad | Stredná-vysoká | Vysoký — bary sa vizuálne dobre animujú ako "rastúce" | Nutrition detail scéna | Phone alebo full-screen UI | Push-in na bary | Bar sa roztiahne cez frame |
| Tréningový builder (split-view) | Knižnica cvikov vľavo, dni ako tabs vpravo, inline edit | Tvorba tréningového plánu | Plán za minúty, nie hodiny v Exceli | Vysoká — priamo rieši JTBD #1 | Stredný — veľa textu, treba opatrný crop/zoom na jeden cvik | Desktop/laptop scéna (komplexnejšia obrazovka) | Floating laptop | Orbit + push-in | Screen morph |
| `/portal/chat` | Obojsmerné vlákno tréner↔klient | Komunikácia bez WhatsAppu | Všetko na jednom mieste, nie roztrúsené v iných appkách | Vysoká — priamo kontruje hook (WhatsApp) | Stredný | Payoff scéna po hook-u (WhatsApp → FitPilot chat) | Phone | Whip pan z "WhatsApp ikony" do telefónu s FitPilot chatom | Screen replacement |
| Landing page hero demo | Ilustračná maketa dashboardu (nie reálny screenshot appky) | — | — | Nízka pre "product truth" účely — nepoužiť ako "toto appka robí" dôkaz | — | Nepoužiť priamo, max ako brand/logo moment | — | — | — |

**Vybraných 5 funkcionalít pre reklamu** (podľa "vyber len 4-6 najsilnejších", bod 7 zadania):
1. Klienti/dashboard prehľad (rieši "5 aplikácií" hook priamo)
2. Denný tréning klienta (`/portal` Dnes) — najvizuálnejšia, coral ring
3. Adherencia stravy + makrá (výživa ako core, kľúčový diferenciátor)
4. Tréningový builder (rýchlosť tvorby plánu)
5. Chat tréner↔klient (payoff na WhatsApp hook)

*(AI zatiaľ NEPOČÍTAM medzi 5 — rieši sa samostatne ako teaser, viď rozhodnutie A/B/C vyššie.)*

## 7. STORYBOARD OVERVIEW (8 scén, ~40s)

| Scéna | Čas | Trvanie | Účel |
|---|---|---|---|
| 1 — Hook | 0–3s | 3s | Pattern interrupt, pomenovanie chaosu (4 appky) |
| 2 — Problem | 3–7s | 4s | Zosilnenie problému, tréner "medzi appkami" |
| 3 — FitPilot Reveal | 7–11s | 4s | Chaos sa "poskladá" do jedného produktu |
| 4 — Dashboard/klienti | 11–16s | 5s | Benefit #1: prehľad všetkých klientov |
| 5 — Tréning (Dnes) | 16–21s | 5s | Benefit #2: klientský zážitok, hero shot |
| 6 — Výživa/adherencia | 21–27s | 6s | Benefit #3: výživa ako core |
| 7 — Builder + Chat (rýchly dvojzáber) | 27–33s | 6s | Benefit #4+5: rýchlosť tvorby + komunikácia (payoff na hook) |
| 8 — AI teaser + CTA | 33–40s | 7s | AI (abstraktne) + logo + CTA |

## 8. FULL VOICEOVER (VERSION A — slovenský voiceover)

> [0–3s] "Excel. WhatsApp. MyFitnessPal. A ešte tréningové plány?"
> [3–7s] "Piati klienti, päť rôznych appiek — a ty si ten, kto to všetko drží pokope."
> [7–11s] "FitPilot to spája do jedného miesta."
> [11–16s] "Vidíš všetkých klientov, kto trénuje a kto mešká — na jeden pohľad."
> [16–21s] "Klient má svoj tréning, jasne a prehľadne, priamo v telefóne."
> [21–27s] "A výživa nie je doplnok — makrá, jedálniček, adherencia, od základu."
> [27–33s] "Plán postavíš za minúty. Správy idú priamo v appke, žiadny ďalší chat."
> [33–40s] "A AI, ktoré si pamätá tvojho klienta, už prichádza. FitPilot. Skús to zadarmo na 14 dní."

## 9. FULL ON-SCREEN TEXT (kinetic typography, max 2-6 slov na text)

1. "Päť appiek. Jeden tréner." *(scéna 1-2)*
2. "FitPilot." *(scéna 3, logo reveal)*
3. "Všetci klienti. Jedno miesto." *(scéna 4)*
4. "Tréning, jasne a prehľadne." *(scéna 5)*
5. "Výživa nie je doplnok." *(scéna 6)*
6. "Plán za minúty." *(scéna 7a)*
7. "Bez ďalšieho chatu." *(scéna 7b)*
8. "AI, ktoré si pamätá klienta. Čoskoro." *(scéna 8a)*
9. "FitPilot — Tréning. Výživa. Komunikácia. Rast." + "Skús 14 dní zadarmo →" *(scéna 8b, CTA)*

## 10. MUSIC DIRECTION

- **Štýl:** moderný, tmavý, "tech/SaaS commercial" beat — syntetický bas, minimalistické perkusie, žiadna melodická "fitness motivačná" hudba (to by ťahalo do generického fitness content žánru namiesto premium SaaS).
- **BPM range:** 120–128 BPM (energický, ale nie EDM-drop štýl).
- **Energy curve:** nízka/tlmená pod hook a problém (0-11s, aby vynikol voiceover a "chaos" pocit) → postupný nárast od Reveal (11s) → vrchol pri Builder+Chat (27-33s) → krátky "drop"/riser do AI teasera (33s) → stabilizácia na CTA (nie ticho, ale bez rušenia loga/textu).
- **SFX (používať cielene, nie pri každom strihu):** whoosh pri hook cutoch (appky sa strihajú), digital impact/riser pri FitPilot Reveal (scéna 3), jemný UI tap pri interakciách na obrazovke (scéna 5 tapnutie "Začať tréning"), subtle notification "ping" pri chat scéne (payoff na hook appiek), nízky bass hit pri logo reveal (scéna 8b).

---

## Čo nasleduje v Časti 2 (po tvojom rozhodnutí o AI scéne a po reálnych screenshotoch)

Pre každú z 8 scén: presný SOURCE ASSET (konkrétny súbor screenshotu), kompletný **HIGGSFIELD GENERATION PROMPT** (anglicky, production-ready, s presnou ochranou UI), **NEGATIVE PROMPT**, **TRANSITION PROMPT** do ďalšej scény, plus B-roll prompty pre scény 1-2 (chaos vizuál), Product Reveal varianty (3 možnosti s odporúčaním), CTA scéna s vlastným promptom, edit timeline, asset checklist a odhad počtu generácií.
