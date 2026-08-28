# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React (Next.js), Tailwind CSS, mobile-first. Backend/DB: Supabase (Postgres, Auth, Storage, RLS), self-hosted. AI: Claude API, server-side only. Platby: Stripe. [Zdroj: docs/projektbrief.md — potvrdené v brief-e, nie odvodené.]

## Users

- **Tréner** — prevádzkuje fitness koučing ako biznis, spravuje viacero klientov naraz (databáza klientov, tréningy, jedálničky), potrebuje rýchly prehľad kto meškal s logovaním a AI asistenta na generovanie plánov/jedálničkov a sumarizáciu progresu.
- **Klient** — trénuje pod vedením trénera, používa appku hlavne na telefóne v posilňovni: odklikáva tréningy, zapisuje váhy/opakovania, loguje stravu, sleduje progres, pýta sa AI chatu v kontexte svojho profilu.

## Product Purpose

SaaS aplikácia pre fitness trénerov na slovenskom a českom trhu — jedno miesto na správu klientov, tréningových plánov, výživy/makier a komunikácie, s AI ako asistentom (nie náhradou) trénera. Úspech = tréner šetrí čas na administratíve a klient má jasný, motivujúci prehľad svojho plánu a progresu.

## Positioning

Prvý skutočne AI-native, natívne slovenský/český nástroj pre fitness trénerov, kde je nutrícia plnohodnotnou core funkciou od začiatku (nie platený add-on) a AI chat má kontextovú pamäť (profil, plán, história) namiesto generického promptu. Konkurencia (Trainerize, Everfit, TrueCoach, GYMIFY) toto nemá kombinované.

## Operating Context

- **Aktualizované 2026-08-28** (upresnenie od používateľa): appka smeruje primárne na telefón pre obe role, nielen klienta. Tréner síce môže plánovať aj pri počítači, ale bežne kontroluje klientov, upravuje plán alebo makrá priebežne z telefónu — desktop nie je predpokladaný primárny kontext, len jeden z podporovaných.
- Klient používa appku prevažne na mobile, často priamo v posilňovni pri cvičení — nízke trenie, rýchle odklikávanie je kritické.
- AI volania idú výhradne cez server-side endpoint, nikdy priamo z frontendu.
- Tréner má vždy finálne slovo nad AI návrhom — appka nikdy neposiela AI výstup klientovi bez schválenia trénerom.

## Capabilities and Constraints

- Dve role s RLS: `trainer`, `client`.
- Core moduly: správa klientov, tréningový builder (série/opakovania/záťaž/tempo/pauzy), výživa/makrá (BMR/TDEE výpočet, food diary), komunikácia (chat, notifikácie), progres tracking (grafy, foto porovnania), business vrstva (kalendár, fakturácia cez Stripe, multi-klient dashboard).
- AI moduly: kontextový chat pre klienta (s eskaláciou na trénera pri zdravotných témach, nediagnostikuje), AI asistent pre trénera (generovanie plánov/jedálničkov, sumarizácia progresu, upozornenia na nízku adherenciu).
- MVP rozsah: klienti + tréningový builder + zaraďovanie plánov + food/makro tracking + základný dashboard + AI chat (klient) + AI generátor plánov (tréner). Chat tréner↔klient, notifikácie, pokročilé reporty a platby prichádzajú v neskorších fázach.
- Monetizácia: SaaS predplatné trénera (nie priama platba od klientov), AI funkcie ako prémiová úroveň s limitom requestov, voliteľne tiered/per-klient pricing, white-label ako neskorší upsell.

## Brand Commitments

**Meno produktu je FitPilot** (rebrand z pracovného názvu FitCoach, potvrdené používateľom 2026-08-27 dodaním brand kitu). Záväzné aktíva:
- Logo/značka: dva červeno-oranžové šikmé pruhy + jantárovo-červený "dart" trojuholník tvoriaci "F"/šípku; wordmark "FitPilot" tučným sans-serif.
- Tagline lockup: "Tréning. Výživa. Komunikácia. Rast." + popisok "AI-native platforma pre fitness trénerov a ich klientov".
- Farebná paleta (z dodaného kitu): Almost Black `#121110`, Warm Paper Text `#F3EFE6`, Signal Coral `#E0402A`, Card Ember `#1E1917`, Amber Dot Accent `#E6B23A`.
- Typografia: Inter (jediné písmo, Bold/SemiBold nadpisy, Regular/Medium text) — nie kondenzovaný display font.
- Vizuálny jazyk UI: zaoblené rohy, ikony v tmavých zaoblených dlaždiciach, pilulkové stavové chipy, primárne CTA so šípkou.

Pôvodné vizuálne rozhodnutia z prvej iterácie (Plate Math — Big Shoulders Display, IBM Plex Mono) sú nahradené týmto dodaným brand kitom; farebná paleta sa zhodou okolností takmer presne prekrývala, takže tokeny zostali zachované.

## Evidence on Hand

Žiadne reálne testimoniály, screenshoty ani logá zákazníkov k dispozícii — landing page nesmie fabrikovať sociálny dôkaz (recenzie, loga, čísla používateľov). Konkurenčné referencie (Trainerize, Everfit, TrueCoach, GYMIFY) sú kontext pre pozicioning, nie assety na použitie.

Používateľ dodal obrázky brand kitu (logo varianty, app icon, web bannery, farby, typografia, ikony, UI prvky) priamo v konverzácii — nie ako súbory na disku. Logo na stránkach je vlastná SVG rekonštrukcia podľa týchto referenčných obrázkov (najbližšia možná zhoda), nie pixel-presná kópia originálnych súborov. Ak existujú finálne exportované logo súbory (SVG/PNG z brand kitu), treba ich nahradiť za túto rekonštrukciu pri produkčnom nasadení.

## Product Principles

1. Tréner je vždy v kontrole — AI navrhuje, tréner schvaľuje; appka nikdy neobchádza jeho rozhodnutie.
2. Celá appka je mobile-first, nielen klientská časť — trénerský dashboard sa navrhuje primárne pre telefón (desktop je bonus, nie predpoklad). Klientský zážitok navyše musí byť nízkotrenový — odcvičenie tréningu a logovanie stravy sa deje v reálnom čase v posilňovni.
3. Nutrícia je rovnocenná tréningu, nie príveska funkcia.
4. Natívna slovenčina/čeština a jasná, transparentná cena sú súčasť diferenciácie, nie len technický detail.
5. Zdravotné hranice AI sú tvrdé pravidlo — eskalácia na trénera pri bolesti/zranení, nikdy diagnostika.

## Accessibility & Inclusion

Nešpecifikované explicitne v brief-e; žiadna špecifická požiadavka zaznamenaná. [Odvodené: dodržať štandardný WCAG AA základ ako predvolenú úroveň.]
