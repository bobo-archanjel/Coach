# Prompt pre Claude Code — FitPilot landing page /v4 (skutočný redesign, nie kozmetika)

Skopíruj celý text nižšie do Claude Code v priečinku projektu (`X:\Dev\FitCoach`, branch `feature/front-end`).

---

## PROMPT (copy-paste do Claude Code)

Uprav `app/v4` na FitPilot landing page. Toto **nie je refresh v3** — je to skutočný redesign kompozície a interakcie, nie premenovanie premenných.

### Diagnóza, prečo súčasné v4 zlyhalo

Porovnal som `app/v3` a `app/v4` súbor po súbore. Je to takmer 1:1 klon:
- `PhoneHero.tsx`: 74 vs 75 riadkov
- `PhoneCanvasInner.tsx`: 125 vs 126 riadkov
- `MagneticButton.tsx`: 65 vs 66 riadkov
- `page.module.css`: 776 vs 768 riadkov
- Rovnaké poradie sekcií: Hero (phone mockup) → Social proof → Problem → Solution zig-zag → AI coach (memory web) → How it works → Pricing cards → FAQ → Final CTA
- Jediné reálne rozdiely: premenované easing konštanty, oprava R3F freeze bugu, `motion/react` namiesto pôvodného

**Nerob to isté znova.** Zmena tokenov/textu/verzie čísla nie je redesign. Potrebujem inú kompozíciu, iný rozprávačský princíp a jeden signature interakčný prvok, ktorý v3 ani predchádzajúce v4 nemali.

### Skilly — použi VŠETKY súčasne, nie postupne

Pracuj s `impeccable`, `taste`, Emil Kowalski's design-eng skillom a Figma MCP **naraz počas celého procesu**, nie ako jednorazovú konzultáciu na začiatku:

- **impeccable** — vlastní celý proces. Spusti ho v `new-work` režime (redesign, nie refinement) — stará vizuálna identita v3/v4 je "evidence and anti-reference", nie základ na stavanie. Rešpektuj `DESIGN.md` ako fixný brand svet (farby, Inter font, logo, radius tokeny) — to je dodaný brand kit, nie moje rozhodnutie, nemeň ho. Redesign sa týka **kompozície a interakcie**, nie palety.
- **taste** — kalibruj proti generickému AI-slop vzoru (hero s telefónom naklonený 15°, 3-stĺpcové ikona+nadpis+text karty, gradient text, glassmorphism dekorácia). `DESIGN.md` má sekciu "What to avoid" — dodržuj ju doslovne.
- **Emil Kowalski (design-eng)** — timing, easing, spring physics pre každú mikro-interakciu. Žiadny bounce/overshoot na produktových prvkoch (critically damped springs), Apple `cubic-bezier(0.25, 0.1, 0.25, 1)` alebo lepšie zdôvodnené vlastné krivky — nie defaultný `ease-in-out`.
- **Figma MCP** — over aktuálny stav voči dodanému brand kitu (`docs/Design/`) skôr, než čokoľvek nakreslíš. Ak Figma MCP nie je v tejto session dostupný, over to a povedz to nahlas namiesto tichého preskočenia — `DESIGN.md` je zdokumentovaný fallback zdroj pravdy.
- **Playwright** — vizuálna verifikácia je súčasť buildu, nie posledný krok. Screenshot passes na desktop (1440px) aj mobile (390px) po každej väčšej sekcii, `prefers-reduced-motion: reduce` pass (musí kolabovať na statický stav, nie len spomaliť), scroll cez celú stránku bez freeze/black-screen (over WebGL/Canvas frameloop správanie).

### Kompozičný koncept — "Dva hodiny" (Two Clocks)

Namiesto vertikálneho stacku hero→features→pricing→CTA:

**Trvalý split-screen motív** naprieč celou stránkou (nie len v hero sekcii): vľavo tréner plánuje večer (tichšia, tmavšia kompozícia — jeho scéna z `DESIGN.md`: "tréner pri večernom plánovaní"), vpravo klient cvičí v posilňovni s telefónom (energickejšia, coral-aktívnejšia — "klient s telefónom v posilňovni"). Oba príbehy bežia **paralelne s scrollom**, nie sekvenčne za sebou:

1. **Otvorenie** — split hneď od prvého viewportu, nie hero-potom-split. Vľavo tréner otvára plán, vpravo klientovi pípne notifikácia.
2. **Stred** (predtým "Problem"/"Solution"/"AI coach" ako oddelené sekcie) — obe strany sa odvíjajú synchrónne: tréner pridáva cvik → vpravo sa objaví klientovi v appke; klient sa v noci pýta AI kouča → vľavo tréner ráno vidí tiché FYI (presne workflow zdokumentovaný v `DESIGN.md` AI Kouč sekcii — použi **skutočnú** produktovú logiku, nie vymyslenú). Toto nahrádza zig-zag feature rows aj samostatnú AI sekciu — je to jeden plynulý paralelný príbeh.
3. **Pricing** — nie 3 karty vedľa seba. Jeden pokojný, čitateľný cenník (číta sa okamžite, per `DESIGN.md` "Pricing deliberately calm").
4. **Konvergencia** — obe strany sa spoja až pri finálnom CTA (napr. obe siluety zhasínajú svetlo / oba telefóny stmavnú — "obaja idú spať s istotou na zajtra"). Toto je jediné miesto, kde sa split-screen zruší — vizuálne odmení scroll až do konca.

Toto je signature štrukturálny nápad, ktorý ani v3 ani doterajšie v4 nemali — obe boli single-column s phone mockupom.

### Technické požiadavky

- Ak používaš R3F/Canvas kdekoľvek: `frameloop="demand"` + `IntersectionObserver` unmount mimo viewportu — v3 pred opravou zamŕzal presne pre chýbajúci tento pattern.
- `padding` shorthand nikdy na tom istom elemente ako `.wrap` (spôsobilo v3 bug s mobilnými okrajmi) — vždy `padding-top`/`padding-bottom` longhand.
- `useReducedMotion` gate na každom transition, nie len na vybraných.
- Cursor-parallax a magnetic button efekty vypnuté na touch zariadeniach (nemajú tam zmysel).
- `tsc` aj `next build` musia prejsť bez chýb pred odovzdaním.

### Rozsah zmeny

Uprav priamo `app/v4` (nie novú `app/v5` zložku) — existujúce súbory (`V4Experience.tsx`, `components/*`, `page.module.css`) prepíš/nahraď podľa nového konceptu, čo nesedí zahoď. `app/v3` a produkčný `app/page.tsx` sa nedotýkaj.

### Definícia hotového

- Build + tsc + e2e (`e2e/smoke.spec.ts` aspoň prejde na `/v4`) zelené.
- Playwright screenshoty desktop/mobile/reduced-motion priložené alebo popísané v commit message/PR.
- Krátky "IMPECCABLE DIRECTION CONTRACT" komentár na vrchu `V4Experience.tsx` (rovnaký vzor ako vo v3) vysvetľujúci THESIS/STRUCTURE/MOTION/STABILITY/FINISH pre túto konkrétnu verziu — nie skopírovaný z v3/starého v4.
