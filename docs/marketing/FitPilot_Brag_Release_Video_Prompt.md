# /brag prompt — FitPilot "killer" release video

Pripravené: 2026-09-27. Toto je hotový prompt na vloženie do `/brag` (nie `/brag-slim`) — chceme plný Hyperframes motion-graphics engine (registry blocks, GSAP choreografia), nie self-built kompozíciu ako v predchádzajúcom `brag-output/` behu.

Inšpirácia: [Impractical Launch Video Library](https://impractical.ai/launch-videos) (kurátorská zbierka najlepších SaaS release videí — Linear, Arc, Raycast, Superhuman) + aktuálne (2026) najsilnejšie B2B SaaS motion vzory: Notion (kinetic typography + 2D ikony, priamočiary rýchly strih), ClickUp (line-icon geometrické animácie + UI-led narrácia), "Apple-grade spring physics a custom easing" ako referenčná krivka kvality namiesto lineárnych/ease-in-out fadeov.

---

## PROMPT (skopíruj celé nižšie do /brag)

Postav "killer" release video pre FitPilot — nie jednoduchý screenshot-slideshow, ale skutočný motion-graphics kúsok na úrovni najlepších SaaS launch videí (Linear, Arc, Raycast, Superhuman — pozri impractical.ai/launch-videos ako referenčnú latku kvality). Cieľom je niečo, čo pôsobí ako z produkčného štúdia, nie ako šablóna.

**Predtým než začneš, over si v repozitári aktuálny stav** (`ROADMAP.md`, `PRODUCT.md`, `git log`) — appka je pred launchom, beží waitlist (`waitlist/index.html`), AI moduly môžu, ale nemusia byť ešte live. Nikdy nepoužívaj screenshot ani tvrdenie o funkcii, ktorá reálne (v aktuálnom stave kódu) nefunguje. Žiadne vymyslené čísla používateľov, testimoniály ani "case studies" — appka ešte nemá platiacich zákazníkov.

### Signature vizuálny hook (nepoužívaj generický "telefón priletí do rámu")

FitPilot logo je šípka/dart (dva šikmé pruhy + trojuholníkový hrot coral→amber gradient). Postav úvod okolo metafory **"prestaň riadiť naslepo"**:
1. Rozhádzané, generické sivé ikonky (tabuľka, bublina správy, papierový dokument, kalkulačka) — chaos nástrojov, ktoré tréner dnes žongluje (Excel, WhatsApp, MyFitnessPal).
2. Presne v uhle a proporciách skutočného loga (vytiahni tvar z `docs/Design/` assetov, nekresli od oka) prereže obrazovkou ostrý coral dart tvar — motion blur v smere letu, ikonky sa "odfúknu" mimo záber.
3. Dart sa spomalí a **poskladá do skutočného FitPilot loga** (pridá sa druhý pruh + wordmark) — toto je moment, ktorý si žiadna konkurencia (Trainerize, Everfit, TrueCoach, GYMIFY, MOSUDA) nemôže skopírovať, lebo nemá tento tvar loga.

Toto je JEDEN memorable signature moment videa — nech je to najsilnejšia sekunda, nie odbavená rýchlo.

### Craft úroveň (toto odlišuje "killer" od priemerného)

- Spring-physics/overshoot easing na kľúčových reveáloch (logo poskladanie, kinetic type nájazdy), nie lineárne/ease-in-out všade rovnako.
- Kinetic typography pre headline/tagline slová — slovo po slove alebo znak po znaku nájazd, synchronizované na hudobný beat, nie statický fade-in celej vety.
- Skutočné screenshoty appky (`docs/marketing/screenshots/`) nezobrazuj ako ploché statické obrázky — daj im "screen-in-window" prezentáciu: jemný depth shadow, mierny parallax/zoom pri vstupe (nie generický pin-scroll), makro pruhy/čísla ktoré sa animovane "vypĺňajú" na beat namiesto skoku na hotovú hodnotu.
- Jeden opakujúci sa prechod/motív (napr. coral line-draw wipe v uhle loga) použi konzistentne medzi scénami namiesto rôznej "cut efekt na scénu" nahádzanej šablóny.
- Tri-aktová štruktúra: Problém (chaos) → Riešenie/dôkaz (dart→logo, potom 2-3 reálne proof body) → CTA (waitlist).

### Reálne zdroje pravdy (čítaj naživo, nekopíruj naslepo z tohto promptu)

- Hero copy a positioning: `app/page.tsx`
- Waitlist copy a CTA text: `waitlist/index.html`
- Skutočné UI zábery: `docs/marketing/screenshots/`
- Brand tokeny (farby, typografia, komponenty): `DESIGN.md`
- Logo asset (presný tvar/uhol dartu): `docs/Design/`
- Existujúci "dart cuts chaos" koncept (over frame-by-frame timing nápad): `docs/marketing/FitPilot_Intro_Teaser_Scripts.md`

### Beaty (orientačne, uprav podľa dĺžky ktorú /brag zvolí)

1. Hook — chaos ikoniek + otázka/tenzia v texte.
2. Dart prereže chaos → poskladá sa do loga + wordmark + tagline "Tréning. Výživa. Komunikácia. Rast." (slovo po slove).
3. Proof beat 1 — reálny dashboard/zoznam klientov, text vecne pomenúva čo tréner získa.
4. Proof beat 2 — tréningový builder alebo food diary/makrá (podľa toho, čo je aktuálne najsilnejšie hotové), makro-bary sa animovane vypĺňajú.
5. (Len ak je AI funkcia overene live) krátky, čestný AI beat — inak abstraktný "prichádza" vizuál bez UI mockupu.
6. Outro — logo + tagline + waitlist CTA ("Zapísať sa na čakaciu listinu" — presná fráza z `waitlist/index.html`, nie "skús zadarmo", appka ešte nie je verejne live).

### Formát

Primárny cut: **landscape 1920×1080** (webová hero sekcia / YouTube) — toto je "release video", nie Instagram Stories klip. Ak to nástroj podporuje bez extra námahy, priprav aj 9:16 rez tých istých assetov pre social (predchádzajúci `brag-output/` už mal vertical variant, tento nový release cut je primárne landscape). Dĺžka ~28–35s — dosť na tri-aktovú štruktúru, dosť krátke na to, aby to niekto pozrel celé.

### Zvuk

Postav beat mapu: napätie/ticho pod hookom → riser + jeden výrazný bass hit presne na moment poskladania loga → sebavedomý stabilný rytmus pod proof beatmi → mierne stíšenie pri AI zmienke (ak je) → pokojný, sebavedomý záver na CTA. Žiadny voiceover (necháva priestor vizuálu a kinetickému textu).

### Kontrola pred odovzdaním

Porovnaj výsledok oproti referenčnej latke (Linear/Arc/Raycast/Superhuman štýl) — ak to vyzerá ako generická AE šablóna ("ikony + fade + stock hudba"), nie je to hotové. Signature dart→logo moment musí byť to, čo si niekto zapamätá o hodinu neskôr.
