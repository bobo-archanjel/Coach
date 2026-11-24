# Vizuálny audit konzistencie (feature/polish)

Rozsah: nedávno pridané povrchy (predplatné, reporty, nastavenia/branding, výzvy, záujemcovia, gamifikácia v portáli, verejná stránka trénera, pozvánka, e-maily).
Metóda: statický prechod CSS modulov (tokeny, farby, rádiusy, písma, dotykové ciele, pohyb, anti-vzory) + vizuálna kontrola tam, kde sa dá bez prihlásenia.

## Čo sa dalo vizuálne overiť
- `/portal?preview=ok` (Dnes) — svetlá aj tmavá, 1280 a 390 px: bez nálezov, bez horizontálneho pretekania.
- Dočasná izolovaná stránka (po použití zmazaná): MissionsCard, odznaky/pilulky úrovní, BrandAppPreview, ReportBarChart.
- Ostatné obrazovky (`/dashboard/*`, `/portal/uspechy`, `/t/*`, `/pozvanka/*`) bez session presmerujú na prihlásenie alebo vrátia 404 (žiadny DEV náhľad) — posúdené len staticky.
- Screenshoty: `C:\Users\rosiv\AppData\Local\Temp\claude\b6e7a55a9af047c2\7bc62ec2-a6fc-4e03-8f4e-56b8f7e295a8\scratchpad\visual\{before,after}`.

## Nálezy a opravy
| Obrazovka | Čo bolo zle | Oprava | Stav |
|---|---|---|---|
| Gamifikácia (pilulky úrovní Bronz/Striebro/Zlato, `gamificationV2.module.css`) | Pevné tmavé farby textu (#8a4f1d, #566170, #8a6300) — v tmavej téme nízky kontrast | `color-mix(... , var(--paper))` — farba sa prispôsobí téme (AA v oboch) | opravené |
| Predplatné banner CTA, Reporty (obdobie, chipy), Záujemcovia (filtre, stavy), Verejná stránka (sociálne odkazy), Gamifikácia (high-five, záložky rebríčka, link tlačidlá), Branding (výber farby) | Dotykové ciele 34–40 px na mobile | `min-height: 44px` v `@media (max-width: 640px), (pointer: coarse)` | opravené |
| Branding vzorky farieb, odstránenie miniatúry na verejnej stránke | Vizuálne 28–30 px, malá dotyková plocha | neviditeľné rozšírenie cez `::after` (inset −7/−8 px), vzhľad nezmenený | opravené |
| ReportBarChart | Popisky osí/hodnôt v SVG 10.5 (pri viewBox 600 na telefóne ~6 px) | 14 (+ väčšia spodná medzera) | opravené (na telefóne stále ~8 px, viď otázky) |

## Skontrolované bez nálezu
- Anti-vzory: žiadne hrubé jednostranné okraje, žiadny gradientový text; emoji len ako zámerný obsah (high-five, oslavy, chat).
- Pohyb: animácie v `gamification*.module.css` sú za `prefers-reduced-motion`; `@keyframes` používajú transform/opacity.
- Hex/rgba v scope: len zámerné (rámiky odmien, náhľad appky, tlačidlo na fotke) — ponechané.
- Rádiusy a veľkosti písma zodpovedajú zvyšku appky (13/13.5/12.5 px je norma dashboardu).
- `tsc`, `i18n-check`, unit špecifikácie (billing, branding, gamification*, mail, public-page, reports: 367 OK) a build v samostatnom adresári prešli.

## Na rozhodnutie majiteľa / nedoriešené
1. Žiadny DEV náhľad pre dashboardové obrazovky (predplatné, reporty, výzvy, záujemcovia, nastavenia) ani `/t`, `/pozvanka` — pridať `?preview=` fixtury by umožnilo vizuálne testy bez prihlásenia.
2. Šírkové prechody (`transition: width`) na progress baroch v gamifikácii nie sú transform-only; sú za reduced-motion, preto ponechané. Prepis na `scaleX` vyžaduje zásah do markupu.
3. ReportBarChart: SVG text sa škáluje s viewBox; na 360 px je stále ~8 px. Plné riešenie = popisky ako HTML alebo responzívny viewBox.
4. Texty 10.5–11 px (pilulky) sú v appke bežné, ale pod odporúčaným minimom 12 px.
5. Konzistencia SK/CS textov a e-mailových šablón sa nekontrolovala vizuálne (bez prístupu) — bez zmien.

## Kolo 2 (feature/polish)
- Progress bary v gamifikácii (`.barFill` v `gamification.module.css`, `.msBarFill` v `gamificationV2.module.css`; použité v MissionsCard, úroveň v portáli/úspechoch, výzvy v portáli aj dashboarde): `transition: width` nahradené `transform: scaleX(var(--p))` (`transform-origin: left`, výplň má `width: 100%`), `--p` = 0–1 z inline štýlu. Prechod beží na transforme, stále len pri `prefers-reduced-motion: no-preference`; `role=progressbar`/`aria-valuenow` rodičov sa nemenili. Vedľajší efekt: zaoblený koniec výplne sa pri malých hodnotách mierne splošťuje (škáluje sa s transformom) — pri 6–8 px lište nepostrehnuteľné.
- Zvyšné `transition: width` (`.aiBat…`, `.ccBa…` v `dashboard.module.css`) sú od Mata (blame) — mimo rozsahu. Ostatné bary (reporty, predplatné, kvóta komunikácie) `transition: width` nemajú, nemenené.
- `ReportBarChart`: popisky osí, hodnoty nad stĺpcami a popis cieľovej čiary sú teraz HTML (11,5 px fixne, nezávisle od šírky SVG); SVG nesie len stĺpce a čiary. Šírka sa meria (`ResizeObserver`) a na úzkom displeji sa rieďou popisky osí a skrývajú hodnoty nad stĺpcami, ak by sa neprekrývali. Skrytá tabuľka, `role=img` a API komponentu sú nezmenené.
- Overené dočasnou stránkou (po použití zmazaná) v 390 a 1280 px, svetlá/tmavá: bez horizontálneho pretekania. Screenshoty: `...\scratchpad\visual3\`.
- Známe: ak je stĺpec tesne pri cieľovej čiare, jeho hodnota sa môže vizuálne dotknúť popisu čiary (kcal graf, posledný stĺpec).
