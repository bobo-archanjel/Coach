// i18n-ignore-file: právny text — celý dokument v slovenčine (český je v content.cs.tsx)
// TODO(právnik): texty (zásady, podmienky, cookies) sú pracovný návrh — pred spustením pre skutočných zákazníkov a platieb potrebujú právnu kontrolu (24. 11. 2026).
import Link from "next/link";
import styles from "@/app/legal.module.css";

export default function PrivacySk() {
  return (
    <>
      <h1>Zásady ochrany osobných údajov</h1>
      <p className={styles.updated}>Posledná aktualizácia: 24. november 2026</p>

      <div className={styles.draftNotice}>
        <strong>Toto je pracovný návrh (draft).</strong> Nie je to právne záväzný text schválený
        právnikom. Obsahuje polia označené <span className={styles.placeholder}>[v hranatých zátvorkách]</span> —
        tie treba pred zverejnením doplniť skutočnými hodnotami. Pred spustením appky pre skutočných
        zákazníkov (a najmä pred spustením platieb) odporúčame právnu kontrolu, najmä pasáží o
        zodpovednosti a spracovateľoch.
      </div>

      <h2>1. Kto sme</h2>
      <p>
        Prevádzkovateľom webovej stránky myfitpilot.sk a aplikácie FitPilot (ďalej len „appka“) je{" "}
        <span className={styles.placeholder}>[Tvoje meno a priezvisko]</span>,{" "}
        <span className={styles.placeholder}>[adresa]</span> (ďalej len „my“ alebo „prevádzkovateľ“). V
        otázkach ochrany osobných údajov nás môžeš kontaktovať na{" "}
        <span className={styles.placeholder}>[kontaktný e-mail]</span>.
      </p>

      <h2>2. Aké údaje spracúvame</h2>
      <p>Ak si zaregistrovaný používateľ appky: prihlasovacie údaje (e-mail, zahashované heslo), a podľa role:</p>
      <ul>
        <li>
          <strong>Tréner:</strong> meno, e-mail, zoznam klientov a vzťahy s nimi, údaje o predplatnom
          (tarifa, stav, obdobie, identifikátory zákazníka a predplatného u poskytovateľa platieb — nie
          údaje o platobnej karte), a ak ich zadáš, aj údaje verejnej stránky a značky (názov, popis,
          odkazy na sociálne siete, referencie, logo, fotografie, farba).
        </li>
        <li>
          <strong>Klient:</strong> meno, vek, výška, váha, ciele, tréningové plány a história cvičenia,
          jedálniček a záznamy o strave, správy v chate (vrátane konverzácie s AI koučom). Z tréningových
          údajov appka vypočítava úspechy, osobné rekordy, odznaky a úrovne (gamifikácia).
        </li>
        <li>
          <strong>Záujemca</strong> (návštevník verejnej stránky trénera, ktorý vyplní formulár): meno,
          e-mail, telefón (nepovinný), cieľ, skúsenosť, časová dostupnosť, správa, verzia a čas súhlasu so
          spracovaním a hash IP adresy (pozri časti 3 a 4).
        </li>
        <li>
          <strong>Príjemca pozvánky:</strong> e-mailová adresa, ktorú tréner zadal pri pozvaní klienta
          (a prípadne krstné meno).
        </li>
      </ul>
      <p>
        Tieto údaje o zdraví, výžive a fyzickej kondícii spracúvame s osobitnou opatrnosťou — appka ich
        nikdy nepoužíva na diagnostiku a AI asistent pri zdravotných témach odporúča konzultáciu s
        trénerom alebo odborníkom namiesto vlastného úsudku.
      </p>
      <p>
        Technické údaje (napr. IP adresa v logoch hostingu, informácie o prehliadači) spracúvame v nevyhnutnom
        rozsahu na prevádzku a zabezpečenie služby.
      </p>

      <h2>3. Kto je prevádzkovateľ a kto sprostredkovateľ</h2>
      <ul>
        <li>
          <strong>Údaje o účtoch, predplatnom a používaní appky</strong> spracúvame ako prevádzkovateľ my.
        </li>
        <li>
          <strong>Údaje záujemcov z verejnej stránky trénera:</strong> prevádzkovateľom je{" "}
          <strong>tréner</strong>, ktorému záujemca formulár odosiela — on určuje, prečo a ako sa s údajmi
          naloží. My (FitPilot) pre trénera tieto údaje len technicky spracúvame (ukladáme ich a
          doručujeme mu ich) ako <strong>sprostredkovateľ</strong>. Ochranu formulára proti zneužitiu
          (napr. hash IP adresy) si zabezpečujeme my sami na základe oprávneného záujmu.
        </li>
        <li>
          <strong>Údaje, ktoré tréner vedie o svojich klientoch</strong> (plány, poznámky, správy): voči
          klientovi za ne zodpovedá tréner; FitPilot ich spracúva na základe zmluvy s trénerom a podľa
          týchto zásad.
        </li>
      </ul>

      <h2>4. Na aký účel a na akom právnom základe</h2>
      <table>
        <thead>
          <tr>
            <th>Účel</th>
            <th>Právny základ</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Poskytovanie appky zaregistrovaným používateľom</td>
            <td>Plnenie zmluvy (čl. 6 ods. 1 písm. b) GDPR)</td>
          </tr>
          <tr>
            <td>Generovanie tréningových/jedálnych plánov a odpovedí AI asistenta</td>
            <td>Plnenie zmluvy — spracúvanie prebieha na serveri, nikdy priamo z tvojho zariadenia</td>
          </tr>
          <tr>
            <td>Predplatné trénerov: platby, skúšobná doba, správa tarify, fakturácia</td>
            <td>Plnenie zmluvy (čl. 6 ods. 1 písm. b) GDPR); uchovávanie účtovných dokladov — zákonná povinnosť (čl. 6 ods. 1 písm. c) GDPR)</td>
          </tr>
          <tr>
            <td>Transakčné e-maily (pozvánka klienta, uvítanie, upozornenie trénera na nového záujemcu, účtové a bezpečnostné správy)</td>
            <td>Plnenie zmluvy / oprávnený záujem (čl. 6 ods. 1 písm. b) a f) GDPR)</td>
          </tr>
          <tr>
            <td>Týždenné zhrnutie „Tvoj týždeň“ e-mailom pre klientov (môžeš ho kedykoľvek vypnúť)</td>
            <td>Oprávnený záujem (čl. 6 ods. 1 písm. f) GDPR) — súčasť služby, ktorú ti poskytuje tvoj tréner; odhlásenie jedným klikom</td>
          </tr>
          <tr>
            <td>Prijatie a doručenie dopytu záujemcu trénerovi cez formulár na verejnej stránke</td>
            <td>Súhlas záujemcu (čl. 6 ods. 1 písm. a) GDPR), ktorý dáva odoslaním formulára; ďalšie spracovanie trénerom na jeho vlastnom právnom základe</td>
          </tr>
          <tr>
            <td>Ochrana proti zneužitiu (Cloudflare Turnstile na prihlásení a formulári, limity odosielania, hash IP adresy, evidencia odoslaných e-mailov)</td>
            <td>Oprávnený záujem (čl. 6 ods. 1 písm. f) GDPR)</td>
          </tr>
          <tr>
            <td>Gamifikácia: úspechy, osobné rekordy, odznaky, úrovne, týždenné misie, odmeny (rámik avatara, farba portálu, zmrazenie série) a celoappkový rebríček všetkých klientov aplikácie</td>
            <td>Plnenie zmluvy (výpočet z tvojich tréningových údajov); zobrazenie v celoappkovom rebríčku pod prezývkou — oprávnený záujem (čl. 6 ods. 1 písm. f) GDPR) s možnosťou kedykoľvek sa skryť (opt-out)</td>
          </tr>
          <tr>
            <td>Zverejnenie verejnej stránky a značky trénera</td>
            <td>Plnenie zmluvy s trénerom, na základe jeho vlastného rozhodnutia údaje zverejniť</td>
          </tr>
          <tr>
            <td>Bezpečnosť účtu (napr. ochrana proti zneužitiu prihlasovania)</td>
            <td>Oprávnený záujem (čl. 6 ods. 1 písm. f) GDPR)</td>
          </tr>
        </tbody>
      </table>

      <h2>5. Komu údaje poskytujeme</h2>
      <p>
        Údaje spracúvajú v našom mene títo poskytovatelia (sprostredkovatelia), nikdy ich nepredávame
        tretím stranám na marketingové účely:
      </p>
      <ul>
        <li><strong>Supabase</strong> — hosting databázy, autentifikácia a ukladanie dát a súborov appky.</li>
        <li><strong>Vercel</strong> — hosting webu a appky a plánované úlohy (napr. týždenné e-maily, mazanie starých dopytov).</li>
        <li>
          <strong>Anthropic (Claude API)</strong> — spracovanie AI funkcií (AI kouč pre klienta, AI
          generátor plánov pre trénera). Do tohto spracovania idú len údaje potrebné na vygenerovanie
          odpovede/plánu, výhradne cez server, nikdy priamo z tvojho zariadenia.
        </li>
        <li>
          <strong>Stripe</strong> — spracovanie platieb predplatného trénerov (Stripe Checkout a zákaznícky
          portál). Platby spracúva Stripe; údaje o platobnej karte zadávaš priamo Stripe a FitPilot ich
          nikdy nevidí ani neukladá. Podľa nastavenia platobnej služby môže byť v niektorých prípadoch
          Stripe aj obchodníkom pri platbe; v takom prípade ťa o tom informuje pri platbe.
        </li>
        <li>
          <strong>Websupport</strong> — odosielanie e-mailov z našej adresy cez SMTP server (obsah a
          adresa príjemcu prechádzajú jeho serverom).
        </li>
        <li>
          <strong>Cloudflare</strong> — Turnstile, overenie, že formulár nevypĺňa robot (spracúva
          technické údaje prehliadača a IP adresu).
        </li>
      </ul>
      <p>
        Dopyt záujemcu sa doručí trénerovi, ktorému bol formulár určený (pozri časť 3). Tréner vidí údaje
        svojich klientov; klienti iného trénera ich nevidia.
      </p>

      <h2>6. Cezhraničný prenos</h2>
      <p>
        Niektorí z vyššie uvedených poskytovateľov môžu spracúvať dáta na serveroch mimo Európskej únie.
        V takom prípade sa spoliehame na štandardné zmluvné doložky (Standard Contractual Clauses) alebo
        iný adekvátny mechanizmus podľa GDPR, ktorý títo poskytovatelia majú zavedený.
      </p>

      <h2>7. Ako dlho údaje uchovávame</h2>
      <ul>
        <li>Údaje aktívneho účtu uchovávame po celú dobu jeho existencie.</li>
        <li>
          Ak požiadaš o vymazanie účtu (tréner aj klient majú túto možnosť priamo v appke), dáta
          natrvalo vymažeme do 30 dní (ochranná lehota, počas ktorej vieš žiadosť zrušiť).
        </li>
        <li>
          <strong>Dopyty záujemcov</strong> z verejných stránok sa automaticky mažú po 12 mesiacoch od
          doručenia; tréner ich môže vymazať aj skôr.
        </li>
        <li>
          <strong>Evidenciu odoslaných e-mailov</strong> (nevratný hash adresy, čas, tréner) a záznam o
          týždenných zhrnutiach uchovávame len po dobu potrebnú na ochranu pred zneužitím a na to, aby sa
          e-mail neposlal dvakrát. Adresy príjemcov sa v nich neukladajú čitateľne. Záznam o odhlásení
          z e-mailov uchovávame, kým je treba rešpektovať tvoje odhlásenie.
        </li>
        <li>
          <strong>Hash IP adresy</strong> pri formulári záujemcu slúži len na ochranu pred zneužitím
          (nevratný hash, nie čitateľná IP adresa) a uchovávame ho najviac po dobu uchovávania dopytu.
        </li>
        <li>
          <strong>Platobné a účtovné doklady</strong> (faktúry a záznamy o platbách) uchovávame počas
          zákonných lehôt na uchovávanie účtovných dokladov (spravidla 10 rokov); časť týchto údajov
          uchováva aj Stripe podľa vlastných zákonných povinností.
        </li>
      </ul>

      <h2>8. Verejné stránky a značka trénera</h2>
      <p>
        Ak má tréner verejnú stránku (<code>/t/&lt;odkaz&gt;</code>) alebo pozývaciu stránku (
        <code>/pozvanka/&lt;odkaz&gt;</code>), to, čo tam zverejní — meno či názov značky, popis,
        referencie, logo a fotografie — je <strong>verejne dostupné komukoľvek na internete</strong> a môže
        sa zobraziť aj vo vyhľadávačoch. Nahrané obrázky sa ukladajú vo verejnom úložisku a pred uložením
        sa z bezpečnostných dôvodov prekódujú. Tréner zodpovedá za to, aby zverejňoval len údaje, ku ktorým
        má právo, a aby mal súhlas osôb, ktoré sa na stránke objavia.
      </p>
      <p>
        Návšteva platnej pozývacej stránky si na tvojom zariadení zapamätá pozvánku v cookie{" "}
        <code>fp_invite</code> (pozri Cookies), aby sa po registrácii vedelo, ku ktorému trénerovi sa
        pripojiť.
      </p>

      <h2>9. E-maily a odhlásenie</h2>
      <p>
        E-maily odosielame z našej adresy cez server Websupport. Tréner môže cez appku poslať pozvánku na
        e-mailovú adresu, ktorú zadá; za to, že ide o človeka, ktorý pozvánku očakáva, zodpovedá tréner.
        Počet pozvánok obmedzujeme proti zneužitiu. Z pozvánok sa vieš odhlásiť odkazom v e-maili — ďalšie
        pozvánky ti už neprídu. Týždenné zhrnutie môžeš vypnúť v Profile alebo odkazom v e-maili (jedným
        klikom). Správy súvisiace s účtom a predplatným sa posielajú, kým máš účet.
      </p>

      <h2>10. Gamifikácia a rebríček</h2>
      <p>
        Úspechy, osobné rekordy, odznaky a úrovne sa počítajú automaticky z tvojich tréningových údajov.
        Týždenné misie, odmeny a úrovne sa tiež počítajú z tvojich tréningových údajov (tréningy, zápisy jedla,
        merania); výber rámika avatara, farby portálu a prezývky sa ukladá k tvojmu účtu.
      </p>
      <p>
        Rebríček je <strong>celoappkový</strong>: zobrazuje poradie všetkých klientov aplikácie (nielen klientov
        jedného trénera) podľa počtu tréningov, série týždňov a rekordov. Ostatným klientom sa zobrazí{" "}
        <strong>iba tvoja prezývka</strong> (predvolene krstné meno a iniciálka priezviska, napr. „Jana N.“; vlastnú
        prezývku si môžeš kedykoľvek zmeniť) a číslo — nikdy priezvisko, tvoj tréner, fotka ani údaje o váhe či
        kalóriách. Právnym základom je oprávnený záujem (motivácia a porovnanie výkonu medzi používateľmi) a máš
        právo kedykoľvek namietať: z rebríčka sa môžeš jedným ťuknutím skryť (opt-out) — potom v poradí nie si a
        rebríček ostatných nevidíš ani ty. Zdieľacie karty (obrázky s tvojimi výsledkami) sa generujú len na tvoju
        žiadosť; o ich ďalšom šírení rozhoduješ ty.
      </p>

      <h2>11. Tvoje práva</h2>
      <p>Máš právo na:</p>
      <ul>
        <li>Prístup k svojim osobným údajom</li>
        <li>Opravu nesprávnych údajov</li>
        <li>Vymazanie údajov („právo na zabudnutie“) — v appke priamo dostupné, tréner aj klient si vedia vymazanie požiadať sami</li>
        <li>Prenositeľnosť údajov v strojovo čitateľnom formáte</li>
        <li>Namietanie proti spracúvaniu založenému na oprávnenom záujme</li>
        <li>Odvolanie súhlasu kedykoľvek (tam, kde spracúvanie stojí na súhlase) a odhlásenie z e-mailov odkazom v e-maili</li>
      </ul>
      <p>
        Pri dopytoch záujemcov (časť 3) sa so žiadosťou o prístup, opravu alebo vymazanie obráť
        primárne na trénera, ktorému si formulár odoslal; môžeš sa obrátiť aj na nás a pomôžeme ti.
      </p>
      <p>
        Svoje práva môžeš uplatniť na <span className={styles.placeholder}>[kontaktný e-mail]</span>. Ak
        si myslíš, že tvoje údaje spracúvame nesprávne, máš právo podať sťažnosť na Úrad na ochranu
        osobných údajov Slovenskej republiky (
        <a href="https://dataprotection.gov.sk" target="_blank" rel="noopener noreferrer">dataprotection.gov.sk</a>
        ), prípadne na dozorný úrad štátu, v ktorom žiješ (v Česku Úřad pro ochranu osobních údajů,{" "}
        <a href="https://uoou.gov.cz" target="_blank" rel="noopener noreferrer">uoou.gov.cz</a>).
      </p>

      <h2>12. Cookies</h2>
      <p>
        Appka používa len technické cookies nevyhnutné na prihlásenie a fungovanie (napr. session cookie),
        na zapamätanie pozvánky (<code>fp_invite</code>) a na zapamätanie nastavení, ktoré si sám zvolíš
        (jazyk, vzhľad) — tieto nevyžadujú súhlas. Podrobnosti v{" "}
        <Link href="/cookies">Cookie politike</Link>.
      </p>
    </>
  );
}
