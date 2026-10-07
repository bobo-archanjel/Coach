# FitPilot — Video reklama: SCÉNY + HIGGSFIELD PROMPTY (Časť 2/2)

Nadväzuje na Časť 1 (koncept, hook, script, storyboard overview). Postavené na **reálnych screenshotoch**, ktoré som práve odfotil z bežiaceho dev servera (`localhost:3000`, prihlásený ako tréner + klientský preview mód).

**AI scéna:** zatiaľ rátam s variantom **B** (abstraktný data-vizuál, žiadne UI) z Časti 1 — dovtedy, kým mi nepovieš A/C. Scéna 8a je napísaná tak, aby sa dala prepnúť bez prerábania zvyšku reklamy.

---

## ⚠️ Dve veci, ktoré musíš vyriešiť pred generovaním (zistené priamo v odfotených screenshotoch)

1. **Testovacie dáta v UI.** Zoznam klientov obsahuje klientov s menom "test" a demo účet "Bobo Loki" (názov cieľa "naučiť sa yogu") — vyzerá to ako testovací obsah, nie dôveryhodná ukážka pre trénerov. **Odporúčam pred finálnym screenshotovaním premenovať/nahradiť týchto klientov reálnejšími demo menami** (napr. "Lucia K.", "Ján N." — tak ako už landing page používa vo svojej ilustračnej maiete). Nie je to môj zásah do UI, len návrh, čo si pred fotením appky priprav v DB.
2. **Nepoužiteľný screenshot: chat karta na strane trénera.** Pri klientovi "Mato Pavlenda" obsahuje posledná časť konverzácie testovacie/vulgárne správy ("mrdej nato", "fuck off"). **Tento screenshot som vedome NEPOUŽIL** ako zdroj pre žiadnu scénu. Namiesto neho používam čistú, profesionálnu konverzáciu z **klientskej strany chatu** (`/portal/chat`), ktorá je vecná a vhodná na reklamu. Než budeš fotiť finálne assety pre samotné generovanie, vyčisti/zmaž testovacie správy v DB, ak chceš aj trénerský pohľad na chat.

Zoznam presných screenshotov, ktoré som použil (URL + viewport), je v sekcii "HIGGSFIELD ASSET CHECKLIST" nižšie — vieš si ich sám znova otvoriť a exportovať v rovnakom stave (ideálne až po vyčistení dát z bodu 1).

---

## SCÉNA 01 — HOOK

**TIME:** 0:00–0:03 **DURATION:** 3s
**PURPOSE:** Scroll-stopper, pomenovať status quo (Excel/WhatsApp/MyFitnessPal/tréningové plány) v rytme 4 rýchlych záberov.
**SOURCE ASSET:** Žiadny screenshot appky — B-ROLL (4 generované ikony/logá zástupne, nie skutočné ochranné známky iných appiek vo forme loga/trademarku — pozri negative prompt).
**MARKETING MESSAGE:** "Piati klienti, päť rôznych appiek."
**VISUAL CONCEPT:** Štyri generické telefónové notifikačné bubliny (tabuľkový dokument, chatová bublina, jedálniček ikonka, papierový plán) sa rýchlo, rytmicky striedajú v strede tmavého rámu ako rýchly whip-cut montage, každá 0.6–0.7s, s efektom mierneho zoom-punch pri každom prestrihu.

**B-ROLL GENERATION PROMPT:**
"Create a fast-paced, high-energy montage of four generic abstract app notification icons appearing one after another in rapid succession, each filling the center of a vertical 9:16 dark frame for approximately 0.6 seconds before a hard cut to the next. Icon 1: a minimalist spreadsheet/grid icon in muted gray. Icon 2: a generic rounded chat bubble icon in muted green-gray (no real brand logos, no recognizable third-party trademarks). Icon 3: a simple bowl/nutrition icon in muted amber. Icon 4: a plain document/checklist icon in muted white. Each icon appears with a subtle punch-zoom (scale from 92% to 100%) and a short motion blur on the cut. Background is Almost Black (#121110), completely dark and minimal, no text, no environment detail. Fast whip-pan style transitions between icons using directional motion blur. Vertical 9:16 composition. Premium, minimal, technological aesthetic — not cartoonish, not cluttered. High contrast, restrained color use."

**NEGATIVE PROMPT:** distorted icons, real brand logos, third-party trademarks (WhatsApp logo, Excel logo, Meta logo, or any recognizable app icon), duplicated elements, warped shapes, cluttered composition, excessive particles, excessive glow, shaky uncontrolled camera, cartoon look, cheap commercial look, oversaturated colors, low contrast, blurry text, random text artifacts.

**TEXT OVERLAY:** "Päť appiek. Jeden tréner." *(word-by-word scale-in, sync s posledným icon cutom)*
**VOICEOVER:** "Excel. WhatsApp. MyFitnessPal. A ešte tréningové plány?"
**SFX:** 4× rýchly whoosh (jeden na každý cut), posledný o niečo silnejší (digital impact) pri prechode do textu.
**TRANSITION PROMPT (do Scény 02):** "On the final icon (the plain document/checklist), the camera performs a rapid punch-zoom into the icon until it fills the entire frame with dark negative space, then the icon dissolves into film-grain-like digital noise that resolves into a dim, cluttered desk environment — preserving the same fast motion-blurred energy without a hard cut, functioning as a seamless bridge into the next scene."

---

## SCÉNA 02 — PROBLEM

**TIME:** 0:03–0:07 **DURATION:** 4s
**PURPOSE:** Zosilniť problém — tréner fyzicky "medzi appkami", frustrácia, nočná práca.
**SOURCE ASSET:** Žiadny screenshot — B-ROLL (abstraktná scéna, nie skutočná osoba/tvár, aby sa nefabrikoval "used by" claim).
**MARKETING MESSAGE:** "Piati klienti, päť rôznych appiek — a ty si ten, kto to všetko drží pokope."
**VISUAL CONCEPT:** Detailný záber na ruky pri telefóne a notebooku súčasne, viacero notifikačných svetiel bliká v tme, atmosféra neskorého večera (jediné svetlo je z obrazoviek).

**B-ROLL GENERATION PROMPT:**
"Create a moody, cinematic close-up B-roll shot: a pair of hands resting near a smartphone and a laptop keyboard on a dark desk late at night, lit only by the cold blue-white glow of the two device screens (screen content on both devices intentionally left blank/abstract, not a real UI — soft glowing rectangles only). Multiple small notification light-pulses flicker rapidly on the phone screen in the background, out of focus. Shallow depth of field, the hands and desk surface are the sharp focal point. Slow, subtle handheld camera drift (not shaky, a gentle cinematic float) moving slightly left to right. Dark studio/home-office environment, Almost Black tones (#121110), minimal color, no text, no logos. Vertical 9:16 composition. Premium 2026 tech commercial aesthetic, restrained and moody, not overly dramatic."

**NEGATIVE PROMPT:** visible real faces, recognizable UI content on the blank screens, real app logos, distorted hands, extra fingers, warped anatomy, shaky uncontrolled camera, cartoon look, oversaturated colors, cheap stock-footage look, excessive lens flare.

**TEXT OVERLAY:** *(žiadny — necháva priestor pre voiceover a atmosféru)*
**VOICEOVER:** "Piati klienti, päť rôznych appiek — a ty si ten, kto to všetko drží pokope."
**SFX:** tichý, nízky ambient hum + jemné notification pingy v pozadí (nie hlasné).
**MUSIC CUE:** hudba nastupuje potichu tu (nízka energia, tlmený bass), nie od úplného začiatku.
**TRANSITION PROMPT (do Scény 03):** "The camera pulls back rapidly from the close-up of the hands and desk. As it pulls back, the entire dark environment compresses and is pulled, as if by gravity, toward a single bright point in the center of the frame — a small glowing Signal Coral (#E0402A) spark — using fast motion blur, functioning as a seamless whip-transition into the brand reveal."

---

## SCÉNA 03 — FITPILOT REVEAL

**TIME:** 0:07–0:11 **DURATION:** 4s
**PURPOSE:** Chaos sa "poskladá" do jedného produktu — najsilnejší brand moment reklamy.
**SOURCE ASSET:** `docs/Design/logo.png` / `FitPilot_Logo.png` (existujúce logo, NEVYTVÁRAM nové).

### 3 REVEAL VARIANTY (na výber)

**A. Logo particles → 3D phone → dashboard**
Coral/amber svetelné častice sa zbiehajú zo všetkých strán rámu a skladajú logo FitPilot, ktoré sa okamžite "rozbalí" do 3D smartfónu s aplikáciou.

**B. Chaos viacerých aplikácií sa rozletí → zostane FitPilot**
Štyri ikony zo Scény 01 sa na zlomok sekundy znovu objavia okolo rámu, rýchlo "vyletia" mimo záber (ako keby ich niečo odfúklo) a v strede zostane jediné, stabilné logo FitPilot.

**C. Kamera preletí cez displej notebooku → otvorí sa FitPilot dashboard**
Kamera letí smerom k tmavému, "vypnutému" displeju notebooku, ktorý sa pri priblížení "zapne" a odhalí FitPilot brandovú plochu.

### ✅ RECOMMENDED PRODUCT REVEAL: **B**

**Prečo:** priamo nadväzuje na hook (4 appky zo Scény 01) a vizuálne dokončuje myšlienku "toto všetko nahrádza jedno miesto" — je to najsilnejší, najkonkrétnejší reveal pre B2B publikum, ktoré presne pozná tie 4 appky. A aj C sú vizuálne krajšie, ale menej priamo nadväzujú na hook.

**HIGGSFIELD GENERATION PROMPT (variant B):**
"Create a premium, high-energy brand reveal shot in a dark minimalist studio environment (Almost Black #121110 background). Four small generic abstract app icons (matching the style from the opening montage: spreadsheet grid, chat bubble, nutrition bowl, checklist document) briefly reappear scattered around the edges of the frame, then rapidly fly outward and off-frame in four different directions as if blown away by a sudden gust, leaving fast directional motion blur trails in Signal Coral (#E0402A) light. As they clear, the camera holds on the empty center of the frame where the exact supplied FitPilot logo (unmodified, pixel-accurate, from the supplied brand asset file) fades and scales in smoothly, settling as a stable, sharply-lit 3D-feeling object with soft coral rim lighting and a subtle amber (#E6B23A) secondary glow beneath it. Do NOT redesign, distort, or recolor the supplied logo — it must remain pixel-accurate to the source file. Subtle lens flare only on the coral light trails, not on the logo itself. Vertical 9:16 composition. Premium 2026 SaaS commercial aesthetic, fast, clean, confident."

**NEGATIVE PROMPT:** modified logo, distorted logo, recolored logo, additional elements added to the logo, warped typography, duplicated logo, extra icons remaining in frame, cluttered composition, excessive glow washing out the logo, cartoon look, cheap commercial look, oversaturated colors, shaky camera, unreadable wordmark.

**TEXT OVERLAY:** "FitPilot." *(scale-in, centered, appears just as logo settles)*
**VOICEOVER:** "FitPilot to spája do jedného miesta."
**SFX:** 4× rýchly whoosh-out (appky letia preč) + jeden sýty digital impact/riser presne na dosadnutie loga.
**MUSIC CUE:** tu prichádza prvý výraznejší beat-drop/energy lift.
**TRANSITION PROMPT (do Scény 04):** "The camera performs a smooth, fast dolly-in directly through the center of the FitPilot logo. As it passes through, the logo's negative space becomes a seamless dark bridge, and the camera emerges on the other side already framed on a premium matte-black smartphone floating in the dark studio, preserving the same forward camera momentum without a hard cut."

---

## SCÉNA 04 — DASHBOARD / KLIENTI (Benefit #1)

**TIME:** 0:11–0:16 **DURATION:** 5s
**PURPOSE:** Ukázať prehľad všetkých klientov na jednom mieste — priamy payoff na "päť appiek" hook.
**SOURCE ASSET:** Skutočný screenshot `http://localhost:3000/dashboard` (mobile viewport 375×812), zoznam klientov — **odporúčam pred finálnym fotením vyčistiť testovacie mená klientov (viď upozornenie na začiatku dokumentu)**.
**MARKETING MESSAGE:** PROBLEM (rozhádzaní klienti v hlave trénera) → PRODUCT (jeden zoznam) → BENEFIT (nič nezabudneš, nikto nezapadne).
**VISUAL CONCEPT:** Screenshot zoznamu klientov vložený presne (fixed screen replacement) do 3D smartfónu, ktorý priletí z tmy a mierne sa pretočí, kým sa ustáli takmer čelne ku kamere.

**HIGGSFIELD GENERATION PROMPT:**
"Create a premium high-energy SaaS commercial shot in a dark minimalist studio (Almost Black #121110 background). Use the supplied FitPilot client-list dashboard screenshot as the EXACT screen content. Place the screenshot unchanged on the display of a premium matte-black modern smartphone. The smartphone rapidly flies into frame from the lower right while rotating approximately 20 degrees around its vertical axis, then smoothly decelerates in the center of the shot. The camera performs a subtle dolly-in toward the screen. Use dramatic soft rim lighting with a Signal Coral (#E0402A) accent reflecting on the metal edges of the device. Add realistic glass reflections, subtle motion blur during the entrance, and shallow depth of field on the studio background. The phone finishes almost front-facing so the FitPilot client list becomes perfectly readable. Do NOT regenerate, redesign, or modify the supplied application UI. Do NOT change any text, client names, numbers, icons, colors, or layout visible on the supplied screenshot. The supplied screenshot must remain pixel-accurate and act as a fixed screen replacement. Premium 2026 SaaS advertisement aesthetic — fast, polished, minimal, technological. Vertical 9:16 composition."

**NEGATIVE PROMPT:** distorted phone, duplicated device, warped screen, modified UI, fake UI, changed text, changed client names, unreadable text, random letters, altered logo, additional icons not in the original screenshot, deformed interface, excessive particles, excessive glow, shaky camera, cartoon look, cheap commercial look, oversaturated colors.

**TEXT OVERLAY:** "Všetci klienti. Jedno miesto."
**VOICEOVER:** "Vidíš všetkých klientov, kto trénuje a kto mešká — na jeden pohľad."
**SFX:** whoosh na príchod telefónu, jemný UI-tap keď kamera "zaostrí" na zoznam.
**TRANSITION PROMPT (do Scény 05):** "The camera performs a fast push-in toward the phone's screen until the UI fills the entire frame, using the screen's own dark background as a seamless visual bridge. Perform a motion-blurred match cut directly into the next scene, preserving the same forward camera direction and speed, revealing a different smartphone already showing the FitPilot client portal 'Dnes' screen."

---

## SCÉNA 05 — PORTÁL "DNES" (Hero shot, Benefit #2)

**TIME:** 0:16–0:21 **DURATION:** 5s
**PURPOSE:** Najsilnejší vizuálny moment produktu — klientský zážitok, coral progress ring.
**SOURCE ASSET:** Skutočný screenshot `http://localhost:3000/portal?preview=ok` (mobile 375×812) — karta "Dnes" s pozdravom, odkazom trénera a coral prstencom postupu.
**MARKETING MESSAGE:** PROBLEM (klient len s papierovým plánom/PDF) → PRODUCT (jasná, motivujúca karta dňa) → BENEFIT (klient sa cíti vedený, nie odbavený).
**VISUAL CONCEPT:** HERO shot — telefón sa pomaly otočí tak, aby coral prstenec postupu "chytil" svetlo, macro zoom na samotný prstenec, animovaný kurzor/ťuknutie na "Začať tréning".

**HIGGSFIELD GENERATION PROMPT:**
"Create a premium hero product shot in a dark minimalist studio (Almost Black #121110 background). Use the supplied FitPilot client portal 'Dnes' screenshot (showing the greeting, trainer note, and the signature coral progress ring with exercise list) as the EXACT screen content, placed unchanged on a premium matte-black modern smartphone held in a fixed, slightly angled position. The camera performs a slow, deliberate arc/orbit move around the phone (approximately 15 degrees), settling on a three-quarter angle, then executes a macro push-in that ends on a close, sharp view of the coral progress ring on screen. Dramatic soft studio lighting with a Signal Coral (#E0402A) rim light along the phone's edge that intensifies subtly as the camera approaches the ring, plus a very subtle amber (#E6B23A) secondary glow in the background bokeh. A minimal animated cursor/fingertip taps the primary coral button once, causing a soft, realistic light ripple exactly at the tap point (matching the ring's own accent color) — the underlying screenshot content itself does not change. Shallow depth of field on the dark background, realistic glass reflections on the phone. Do NOT regenerate, redesign or modify the supplied UI. Do NOT change any text, numbers, icons, or layout visible on the screenshot. Vertical 9:16 composition, premium 2026 SaaS commercial aesthetic."

**NEGATIVE PROMPT:** distorted phone, warped screen, modified UI, fake UI text, changed numbers or exercise names, unreadable text, altered logo, extra icons, deformed ring shape, excessive particles, excessive glow washing out the screen, shaky camera, cartoon look, cheap commercial look, oversaturated colors, motion smearing on the readable text.

**TEXT OVERLAY:** "Tréning, jasne a prehľadne."
**VOICEOVER:** "Klient má svoj tréning, jasne a prehľadne, priamo v telefóne."
**SFX:** jemný UI-tap zvuk presne na moment ťuknutia, tichý coral "light ripple" swoosh.
**TRANSITION PROMPT (do Scény 06):** "As the macro push-in on the coral progress ring completes and the ring fills most of the frame, the ring's glowing arc rapidly expands outward, becoming a full-frame coral wash that clears via a fast light-sweep transition — revealing the next scene already in progress, preserving directional motion energy."

---

## SCÉNA 06 — VÝŽIVA / ADHERENCIA (Benefit #3, kľúčový diferenciátor)

**TIME:** 0:21–0:27 **DURATION:** 6s
**PURPOSE:** Dokázať, že výživa je core funkcia, nie doplnok — priamy diferenciátor voči konkurencii.
**SOURCE ASSET:** Skutočný screenshot `http://localhost:3000/dashboard` (klient "Mato Pavlenda", karty "Makro cieľ" — kalorický cieľ + makrá B/S/T — a "Adherencia stravy" — dnešný príjem/% z cieľa).
**MARKETING MESSAGE:** PROBLEM (výživa riešená mimo appku alebo vôbec) → PRODUCT (makrá + adherencia priamo pri klientovi) → BENEFIT (tréner vidí realitu, nie odhad).
**VISUAL CONCEPT:** Floating card kompozícia — makro karta a adherenčná karta vystúpia z plochého screenshotu do jemného 3D priestoru vedľa seba, kamera medzi nimi preletí.

**HIGGSFIELD GENERATION PROMPT:**
"Create a premium floating-UI commercial shot in a dark minimalist studio (Almost Black #121110 background, subtle Card Ember #1E1917 ambient tone). Use the supplied FitPilot client-detail screenshot (showing the 'Makro cieľ' card with calorie/macro targets and the 'Adherencia stravy' card with today's intake percentage) as the exact source — extract the two cards as flat rectangular UI panels and place them floating in a shallow 3D space, slightly offset in depth (the macro card slightly behind, the adherence card slightly in front), both tilted very subtly toward the camera. The camera performs a slow lateral dolly move passing between the two floating cards, keeping both in focus via a moderate depth of field. Soft rim lighting in Amber (#E6B23A) on the macro card edge (amber carries nutrition/trainer-context per brand system) and Signal Coral (#E0402A) on the adherence percentage number. Subtle ambient light particles drift slowly in the background, kept minimal and out of focus. Do NOT regenerate, redesign, alter or re-typeset any text, numbers, or labels visible on the supplied cards — they must remain pixel-accurate fixed screen content, only their spatial placement and lighting change. Vertical 9:16 composition, premium 2026 SaaS commercial aesthetic, clean and readable."

**NEGATIVE PROMPT:** modified numbers or macro values, altered text or labels, distorted card shapes, warped typography, duplicated cards, excessive particles obscuring text, excessive glow washing out numbers, cartoon look, cheap commercial look, oversaturated colors, shaky camera, cards overlapping in a way that hides text.

**TEXT OVERLAY:** "Výživa nie je doplnok."
**VOICEOVER:** "A výživa nie je doplnok — makrá, jedálniček, adherencia, od základu."
**SFX:** jemný digital chime pri objavení každej karty, tichý ambient pad podkres.
**TRANSITION PROMPT (do Scény 07):** "The adherence card in the foreground rapidly expands toward the camera, becoming a full-frame transition mask in Signal Coral. As it passes the lens, it reveals the next scene behind it — a smartphone showing the FitPilot training plan list — using the coral color as a seamless connecting wipe."

---

## SCÉNA 07 — TRÉNING PLÁN + CHAT (Benefit #4+5, payoff na hook)

**TIME:** 0:27–0:33 **DURATION:** 6s (dve rýchle časti po ~3s)
**PURPOSE:** Ukázať, že plán je klientovi jasný a organizovaný (7a), a že komunikácia beží priamo v appke — priamy payoff na WhatsApp/hook z úvodu (7b).
**SOURCE ASSET 7a:** Skutočný screenshot `http://localhost:3000/portal/trening?preview=ok` (mobile) — zoznam plánov, tag "AKTÍVNY"/"Od trénera".
**SOURCE ASSET 7b:** Skutočný screenshot `http://localhost:3000/portal/chat?preview=ok` (mobile) — čistá konverzácia klient↔tréner o tréningu (koleno/RDL).
**MARKETING MESSAGE:** PRODUCT (plán aj správy na jednom mieste) → BENEFIT (žiadny ďalší chat, žiadna neistota, čo je aktuálny plán).

**HIGGSFIELD GENERATION PROMPT (7a):**
"Create a premium high-energy SaaS commercial shot in a dark minimalist studio (Almost Black #121110 background). Use the supplied FitPilot training-plan-list screenshot (showing the active plan card with 'AKTÍVNY' and 'Od trénera' pill tags and the exercise breakdown) as the EXACT screen content, placed unchanged on a premium matte-black smartphone. The phone rotates smoothly clockwise roughly 25 degrees while the camera follows the rotation in a tight arc, keeping the screen readable throughout. Soft coral (#E0402A) rim lighting tracing the rotating edge of the device. Shallow depth of field on the dark background. Do NOT regenerate, redesign, or modify the supplied UI — no changes to text, tags, numbers, or layout. Vertical 9:16 composition, premium 2026 SaaS commercial aesthetic, fast and confident motion."

**NEGATIVE PROMPT (7a):** distorted phone, modified plan text or tags, changed numbers, warped screen, altered logo, deformed interface, excessive glow, shaky camera, cartoon look, oversaturated colors.

**TRANSITION PROMPT (7a → 7b):** "As the rotating phone reaches its final three-quarter angle, the edge of the display — lit in coral — acts as a natural wipe: the light sweeps rapidly across the frame left to right, and behind it the next smartphone is already revealed, now showing the FitPilot chat conversation screen, preserving the same rotational energy and direction."

**HIGGSFIELD GENERATION PROMPT (7b):**
"Create a premium high-energy SaaS commercial shot in a dark minimalist studio (Almost Black #121110 background). Use the supplied FitPilot client-trainer chat screenshot (showing a clean, professional conversation about a training adjustment) as the EXACT screen content, placed unchanged on a premium matte-black smartphone floating centrally in frame. The camera performs a fast, confident push-in toward the screen, with a very subtle handheld-style micro-shake for energy (not excessive). Soft coral rim lighting on the phone edges, subtle glass reflections. As the push-in nearly fills the frame with the readable chat screen, hold briefly to let the message text register. Do NOT regenerate, redesign, or modify the supplied UI — no changes to message text, names, timestamps, or layout. Vertical 9:16 composition, premium 2026 SaaS commercial aesthetic."

**NEGATIVE PROMPT (7b):** distorted phone, modified message text, changed names or timestamps, warped screen, altered logo, deformed interface, excessive particles, excessive glow, extreme shaky camera, cartoon look, oversaturated colors.

**TEXT OVERLAY:** "Plán, ktorý dáva zmysel." *(7a)* → "Bez ďalšieho chatu." *(7b)*
**VOICEOVER:** "Plán je jasný klientovi aj tebe. A správy idú priamo v appke — žiadny ďalší chat."
**SFX:** whip-pan swoosh na rotáciu (7a), jemný notification "ping" presne pri nájazde na chat (7b) — tichý, vedomý kontrast k hlučným notifikáciám zo Scény 01-02.
**TRANSITION PROMPT (do Scény 08):** "The camera pulls back rapidly from the chat screen; the phone shrinks and dissolves into a soft coral particle trail that streams upward and converges into a small glowing point in the upper third of the frame, transitioning into an abstract dark data-visualization environment for the next scene."

---

## SCÉNA 08a — AI TEASER (abstraktný, variant B)

**TIME:** 0:33–0:37 **DURATION:** 4s
**PURPOSE:** Naznačiť AI diferenciátor bez sľubovania hotovej funkcie (viď upozornenie na začiatku — AI ešte nie je postavené).
**SOURCE ASSET:** Žiadny screenshot — čisto abstraktný vizuál (dátové línie/particles), zámerne bez akéhokoľvek chat/UI rozhrania.
**MARKETING MESSAGE:** "AI, ktoré si pamätá klienta, prichádza."

**GENERATION PROMPT:**
"Create an abstract, premium tech visualization in a dark minimalist studio (Almost Black #121110 background). Thin, glowing data-line threads in Signal Coral (#E0402A) and Amber (#E6B23A) slowly weave and converge toward the center of the frame, forming a soft pulsing orb of light — suggesting memory, context, and intelligence without depicting any literal chat interface, text, or UI. The lines pulse gently in rhythm, like a heartbeat or a neural network, never resolving into readable text or icons. Slow, elegant camera dolly-in toward the pulsing orb. Shallow depth of field, soft bokeh in the background. No text, no UI elements, no logos anywhere in this shot — purely abstract and atmospheric. Vertical 9:16 composition, premium 2026 SaaS commercial aesthetic, restrained and sophisticated, not busy or overloaded with particles."

**NEGATIVE PROMPT:** any readable text, any chat bubble or UI element, fake application interface, fabricated AI screenshot, cluttered particle explosion, excessive glow washing out the frame, cartoon look, cheap sci-fi look, oversaturated colors, shaky camera.

**TEXT OVERLAY:** "AI, ktoré si pamätá klienta. Čoskoro."
**VOICEOVER:** "A AI, ktoré si pamätá tvojho klienta, už prichádza."
**SFX:** jemný riser, tichý synth pad, žiadny "notification" zvuk (aby sa AI nekomunikovalo ako hotová funkcia).
**TRANSITION PROMPT (do Scény 08b):** "The pulsing orb of coral and amber light rapidly contracts inward into a single bright point, then expands outward in a soft flash that resolves into the FitPilot logo, settling centered in frame — a clean, confident brand-close transition."

---

## SCÉNA 08b — CTA (FINAL)

**TIME:** 0:37–0:40 (–0:45 ak treba o niečo dlhšie na čitateľnosť CTA) **DURATION:** 3–5s
**PURPOSE:** Logo + positioning + jasné CTA.
**SOURCE ASSET:** `FitPilot_Logo.png` / `long_logo.png` (existujúce logo s tagline "Tréning. Výživa. Komunikácia. Rast.").

### 5 CTA MOŽNOSTÍ

1. "Skús 14 dní zadarmo →"
2. "Vyskúšaj FitPilot zadarmo →"
3. "Začni bez viazanosti →"
4. "14 dní zadarmo. Bez karty. →" *(needs overenie: brief nešpecifikuje "bez karty" pre FitPilot — GYMIFY to má, FitPilot zatiaľ nie je isté → **needs verification pred použitím**)*
5. "Zisti viac na fitpilot.sk →"

### ✅ RECOMMENDED CTA: **#1 — "Skús 14 dní zadarmo →"**

Dôvod: presne zodpovedá tomu, čo landing page reálne ponúka ("Začať 14-dňové skúšobné obdobie", "bez viazanosti počas skúšobného obdobia") — bez rizika sľubovať niečo neoverené (napr. "bez karty", čo pri FitPilote nie je potvrdené, na rozdiel od GYMIFY).

**HIGGSFIELD GENERATION PROMPT (CTA scéna):**
"Create a premium hero closing shot in a dark minimalist studio (Almost Black #121110 background). The exact supplied FitPilot logo (unmodified, pixel-accurate) rests centered in frame with soft, confident coral (#E0402A) rim lighting and a subtle amber (#E6B23A) glow beneath it, gently floating with a very slow, almost imperceptible breathing motion (subtle scale pulse, under 2%). Around it, faint abstract reflections suggest a smartphone and a laptop silhouette just out of full focus in the background bokeh (soft, dark, not competing with the logo for attention), implying a product ecosystem without introducing any readable UI. Camera holds mostly static with only a very slow, subtle push-in over the duration of the shot. Do NOT modify, distort, or redesign the supplied logo. Vertical 9:16 composition, premium 2026 SaaS commercial aesthetic, calm and confident close."

**NEGATIVE PROMPT:** modified logo, distorted logo, recolored logo, extra elements overlapping the logo, warped typography, cluttered background competing with the logo, excessive glow washing out the wordmark, cartoon look, cheap commercial look, oversaturated colors, shaky camera.

**TEXT OVERLAY:** "FitPilot — Tréning. Výživa. Komunikácia. Rast." *(existujúci tagline lockup, mask reveal)* → "Skús 14 dní zadarmo →" *(scale-in, zotrvá do konca)*
**VOICEOVER:** "FitPilot. Skús to zadarmo na 14 dní."
**SFX:** nízky, sýty bass hit presne na dosadnutie loga, potom ticho — necháva CTA "dýchať".
**MUSIC CUE:** hudba sa stíši a doznie presne s koncom textu, žiadny náhly strih zvuku.

---

## FULL EDIT TIMELINE

| Čas | Scéna | Trvanie |
|---|---|---|
| 0:00–0:03 | 01 — Hook (4 appky) | 3s |
| 0:03–0:07 | 02 — Problem (desk/night B-roll) | 4s |
| 0:07–0:11 | 03 — FitPilot Reveal (variant B) | 4s |
| 0:11–0:16 | 04 — Dashboard klienti | 5s |
| 0:16–0:21 | 05 — Portál Dnes (hero) | 5s |
| 0:21–0:27 | 06 — Výživa/adherencia | 6s |
| 0:27–0:30 | 07a — Tréning plán | 3s |
| 0:30–0:33 | 07b — Chat | 3s |
| 0:33–0:37 | 08a — AI teaser | 4s |
| 0:37–0:40 | 08b — CTA | 3s |
| **Celkovo** | | **~40s** |

## FINAL CTA
"**Skús 14 dní zadarmo →**" (logo + tagline + CTA, scéna 08b vyššie).

## HIGGSFIELD ASSET CHECKLIST (presné zdrojové screenshoty)

| # | Scéna | URL | Viewport | Poznámka |
|---|---|---|---|---|
| 1 | 04 | `http://localhost:3000/dashboard` (zoznam klientov) | mobile 375×812 | **vyčistiť testovacie mená klientov pred finálnym fotením** |
| 2 | 05 | `http://localhost:3000/portal?preview=ok` | mobile 375×812 | karta "Dnes" — hotové, čisté |
| 3 | 06 | `http://localhost:3000/dashboard` → detail klienta "Mato Pavlenda" → karty "Makro cieľ" + "Adherencia stravy" | mobile 375×812 | scroll_to na tieto karty |
| 4 | 07a | `http://localhost:3000/portal/trening?preview=ok` | mobile 375×812 | čisté |
| 5 | 07b | `http://localhost:3000/portal/chat?preview=ok` | mobile 375×812 | čisté, profesionálna konverzácia |
| — | 03, 08b | `docs/Design/logo.png`, `FitPilot_Logo.png`, `long_logo.png` | — | existujúce brand assety, nie screenshoty appky |
| — | 01, 02, 08a | žiadny | — | čistý B-roll/abstraktný generation prompt |

## WHICH SCENES NEED IMAGE-TO-VIDEO (reálny screenshot ako fixný vstup)
Scény **04, 05, 06, 07a, 07b** — každá potrebuje presne ten screenshot z tabuľky vyššie ako referenčný obrázok (image-to-video / screen-replacement mód), nie čisto textový prompt.

## WHICH SCENES NEED TEXT-TO-VIDEO (bez referenčného obrázku)
Scény **01, 02, 08a** — čisto generatívne, žiadny reálny asset appky (len text prompt vyššie).

## WHICH SCENES SHOULD KEEP SCREENSHOT AS FIXED UI (screen replacement, nie re-generovanie)
Všetkých päť scén so screenshotmi (04, 05, 06, 07a, 07b) — a rovnako **03 a 08b**, kde je "fixný" vstup logo súbor, nie UI screenshot, ale princíp je identický (nemeniť, len osvetliť/pohýbať okolo neho).

## GENERATION ORDER (odporúčané poradie generovania, nie strihu)
1. Najprv **03 (Reveal)** a **08b (CTA)** — logo scény, najjednoduchšie na overenie, že model dodržiava "nemeniť logo" pravidlo skôr, než sa investuje čas do zložitejších scén.
2. Potom **05 (Portál Dnes)** — najkomplexnejšia/najdôležitejšia hero scéna, warrantuje najviac pokusov/iterácií.
3. Potom **04, 06, 07a, 07b** — zvyšné screenshot scény, v ľubovoľnom poradí.
4. Nakoniec **01, 02, 08a** — čisto generatívne B-roll/abstraktné scény (najmenej závislé na ostatných, dajú sa robiť paralelne s čímkoľvek vyššie).

## ESTIMATED NUMBER OF GENERATIONS
Počítajúc s bežnou mierou "nepodarí sa na prvý pokus" pri image-to-video s presným UI (skúsenosť: 2–3 pokusy na scénu, kým model nezačne meniť text/UI):

- Scény so screenshotmi (03, 04, 05, 06, 07a, 07b, 08b) — 7 scén × ~3 pokusy = **~21 generácií**
- Čisto generatívne scény (01, 02, 08a) — 3 scény × ~2 pokusy = **~6 generácií**
- **Odhad spolu: ~25–30 generácií** na kompletné natočenie všetkých 10 klipov (8 hlavných scén, z toho 07 je rozdelená na 7a/7b) do finálneho zostrihu. Toto je hrubý odhad — presné číslo závisí od toho, ako spoľahlivo konkrétny Higgsfield model/mode drží fixný screen replacement pri prvom pokuse.

## HIGGSFIELD MODEL / MODE ODPORÚČANIA
Nemám spoľahlivý, aktuálny prehľad presných názvov Higgsfield modelov/motion presetov dostupných v tvojom pláne (menia sa) — **nevymýšľam si ich**. Pri generovaní v samotnom Higgsfield rozhraní odporúčam:
- pre scény so screenshotmi (04, 05, 06, 07a, 07b): akýkoľvek dostupný **image-to-video mód s "product/UI" alebo "screen animation" presetom**, ak taký Higgsfield ponúka — priorizuj ten, ktorý explicitne sľubuje zachovanie referenčného obrázka nezmenené.
- pre 03/08b (logo): rovnaký image-to-video mód, referenčný obrázok = logo súbor.
- pre 01/02/08a (čisto generatívne): akýkoľvek **text-to-video cinematic/commercial preset**.
- aspect ratio: **9:16** pri všetkých scénach, duration podľa tabuľky vyššie (zaokrúhliť nahor na najbližšiu podporovanú dĺžku klipu, ak Higgsfield nemá presné sekundové kroky).

---

*Pripravené na schválenie. Negeneruj som nič — toto je kompletný plán na tvoje schválenie/úpravy skôr, než čokoľvek pustíme do Higgsfieldu.*
