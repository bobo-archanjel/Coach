// i18n-ignore-file: právny text — celý dokument v slovenčine (český je v content.cs.tsx)
// TODO(právnik): texty (zásady, podmienky, cookies) sú pracovný návrh — pred spustením pre skutočných zákazníkov a platieb potrebujú právnu kontrolu (24. 11. 2026).
import Link from "next/link";
import styles from "@/app/legal.module.css";

export default function TermsSk() {
  return (
    <>
      <h1>Obchodné podmienky</h1>
      <p className={styles.updated}>Posledná aktualizácia: 24. november 2026</p>

      <div className={styles.draftNotice}>
        <strong>Toto je pracovný návrh (draft).</strong> Nie je to právne záväzný text schválený
        právnikom. Obsahuje polia označené <span className={styles.placeholder}>[v hranatých zátvorkách]</span> —
        tie treba doplniť pred zverejnením/spustením platieb. Odporúčame právnu kontrolu, najmä bodov o
        zodpovednosti a cene.
      </div>

      <h2>1. Základné ustanovenia</h2>
      <p>
        Tieto obchodné podmienky upravujú vzťah medzi{" "}
        <span className={styles.placeholder}>[Tvoje meno a priezvisko]</span> (ďalej len „poskytovateľ“)
        a používateľom appky FitPilot (ďalej len „používateľ“). Používaním appky používateľ s týmito
        podmienkami súhlasí.
      </p>

      <h2>2. Popis služby</h2>
      <p>
        FitPilot je softvér ako služba (SaaS) určený predovšetkým fitness trénerom na Slovensku a v
        Česku na správu klientov, tvorbu tréningových a jedálnych plánov, sledovanie stravy a makier a
        komunikáciu s klientmi, s podporou AI asistenta. Jednotlivé nástroje appky (sledovanie stravy,
        tvorba tréningových plánov) sú dostupné aj samostatne, bez prepojenia na trénera.
      </p>

      <h2>3. Registrácia a účet</h2>
      <p>
        Používateľ sa registruje pomocou e-mailu a hesla. Tréner spravuje svojich klientov cez appku;
        klient sa môže pripojiť k trénerovi pomocou pozývacieho kódu, alebo appku používať úplne
        samostatne. Prepojenie medzi trénerom a klientom je možné kedykoľvek zrušiť bez straty vlastných
        dát klienta.
      </p>

      <h2>4. Predplatné a platby</h2>
      <p>
        Appka je pre trénerov spoplatnená formou mesačného predplatného vo viacerých tarifách (Starter,
        Pro, Business). Tarifa určuje dostupné funkcie a počet aktívnych klientov. Aktuálne tarify, ich
        obsah a ceny sú uvedené na <Link href="/#cennik">cenníku</Link> na stránke myfitpilot.sk; cena
        platná v čase objednávky sa zobrazí pred potvrdením platby. Klienti trénerov za používanie appky
        neplatia. Spôsob zaobchádzania s DPH sa riadi platnými predpismi a zobrazí sa pri platbe{" "}
        <span className={styles.placeholder}>[doplniť: platca/neplatca DPH, fakturačné údaje]</span>.
      </p>
      <ul>
        <li>
          <strong>Skúšobná doba.</strong> Nový tréner dostane 14 dní skúšobnej doby bez zadania platobnej
          karty. Po jej skončení appka prejde do režimu len na čítanie, kým si tréner nezvolí tarifu.
        </li>
        <li>
          <strong>Platby a obnovovanie.</strong> Platby spracúva Stripe (Stripe Checkout, zákaznícky
          portál); údaje o platobnej karte FitPilot nevidí. Predplatné sa automaticky obnovuje každý mesiac,
          kým ho tréner nezruší.
        </li>
        <li>
          <strong>Zmena tarify.</strong> Prechod na vyššiu tarifu alebo väčší limit klientov sa prejaví
          okamžite a doplatok za zvyšok obdobia sa vyúčtuje pomerne. Prechod na nižšiu tarifu sa prejaví až
          na konci zaplateného obdobia. Ak má tréner v čase prechodu viac klientov, než povoľuje nová
          tarifa, účet je len na čítanie, kým počet klientov neznížime.
        </li>
        <li>
          <strong>Zrušenie.</strong> Tréner môže predplatné zrušiť kedykoľvek v zákazníckom portáli;
          zrušenie sa prejaví na konci už zaplateného obdobia, do tej doby appka funguje v plnom rozsahu.
        </li>
        <li>
          <strong>Vrátenie platby.</strong> Za čiastočne využité obdobie sa platba nevracia, pokiaľ
          povinné právne predpisy nestanovia inak (napr. zákonné práva spotrebiteľa).
        </li>
        <li>
          <strong>Neuhradená platba.</strong> Ak sa platba nepodarí uhradiť, appka zostane ešte 7 dní plne
          funkčná; potom prejde do režimu len na čítanie (tréner vidí svoje dáta, ale nemôže ich meniť, a
          prístup klientov zostáva zachovaný, okrem funkcií viazaných na tarifu, napr. AI kouča).
          Po uhradení sa prístup obnoví. Dáta sa kvôli neuhradenej platbe nemažú.
        </li>
        <li>
          <strong>Existujúce (beta) účty.</strong> Poskytovateľ môže niektorým účtom (napr. beta
          testerom) poskytnúť prístup zadarmo; ide o dobrovoľné plnenie, ktoré môže poskytovateľ
          po primeranom upozornení zmeniť alebo ukončiť.
        </li>
      </ul>

      <h2>5. Umelá inteligencia — dôležité obmedzenie</h2>
      <p>
        AI funkcie appky (AI kouč pre klienta, AI generátor tréningových a jedálnych plánov, sumarizácia
        progresu) sú asistenčný nástroj, nie náhrada odborného poradenstva. AI výstupy pre klienta appka
        nikdy neposiela automaticky — tréner ich musí najprv schváliť. AI nikdy nediagnostikuje zdravotné
        problémy; pri zdravotných témach appka odporúča konzultáciu s trénerom alebo lekárom.
        Poskytovateľ nezodpovedá za škodu spôsobenú nesprávnym použitím AI odporúčaní mimo tohto rámca.
      </p>

      <h2>6. Verejná stránka, referencie, pozvánky a záujemcovia</h2>
      <p>
        Ak tréner využíva verejnú stránku, značku alebo pozvánky, zodpovedá za ich obsah a používanie:
      </p>
      <ul>
        <li>
          <strong>Obsah verejnej stránky a značky</strong> (texty, logo, fotografie, odkazy) je verejne
          dostupný. Tréner smie zverejniť len obsah, ku ktorému má práva, ktorý neporušuje práva tretích
          osôb ani právne predpisy a ktorý nie je klamlivý.
        </li>
        <li>
          <strong>Referencie</strong> musia byť pravdivé a pochádzať od skutočných klientov, ktorí so
          zverejnením súhlasili. Vymýšľať alebo upravovať referencie je zakázané.
        </li>
        <li>
          <strong>Pozvánky e-mailom</strong> smie tréner posielať len ľuďom, ktorí ich očakávajú (napr.
          vlastným klientom po dohode). Je zakázané použiť ich na hromadné alebo nevyžiadané správy (spam).
          Počet pozvánok obmedzujeme; kto sa z pozvánok odhlási, tomu ďalšie nemožno posielať.
        </li>
        <li>
          <strong>Údaje záujemcov</strong> (dopyty z formulára na verejnej stránke) spracúva tréner ako
          ich prevádzkovateľ; FitPilot mu ich technicky sprístupňuje ako sprostredkovateľ (pozri{" "}
          <Link href="/ochrana-sukromia">Zásady ochrany osobných údajov</Link>). Tréner ich smie použiť na
          odpoveď na dopyt a nesmie ich použiť na iný účel (napr. marketing) bez právneho základu; zodpovedá
          za plnenie povinností voči záujemcom podľa GDPR.
        </li>
      </ul>
      <p>
        Poskytovateľ môže obsah, ktorý porušuje tieto pravidlá, odstrániť alebo verejnú stránku
        pozastaviť.
      </p>

      <h2>7. Trvanie a ukončenie</h2>
      <p>
        Používateľ môže appku prestať používať a požiadať o vymazanie účtu kedykoľvek priamo v appke.
        Vymazanie sa vykoná po uplynutí 30 dní od žiadosti; dovtedy ho môže používateľ v appke zrušiť.
        Po uplynutí lehoty sa údaje natrvalo vymažú.
      </p>
      <p>
        Ak o vymazanie účtu požiada tréner, jeho klientov s vlastným účtom o tom appka upozorní.
        Po vymazaní sa klienti od trénera odpoja a zverejnené tréningové plány a jedálničky, ktoré im
        tréner pripravil, im zostanú v ich účte. Správy medzi trénerom a klientmi sa vymažú.
      </p>
      <p>
        Poskytovateľ si vyhradzuje právo pozastaviť alebo zrušiť účet v prípade porušenia týchto
        podmienok.
      </p>

      <h2>8. Zodpovednosť</h2>
      <p>
        Appka sa poskytuje „tak ako je“. Poskytovateľ vynakladá primerané úsilie na dostupnosť a
        bezpečnosť appky, ale nezodpovedá za škody vzniknuté výpadkom služby, stratou dát v dôsledku
        vyššej moci, alebo nesprávnym použitím appky v rozpore s jej účelom.
      </p>

      <h2>9. Ochrana osobných údajov</h2>
      <p>
        Spracúvanie osobných údajov sa riadi samostatnými{" "}
        <Link href="/ochrana-sukromia">Zásadami ochrany osobných údajov</Link>.
      </p>

      <h2>10. Reklamácie a sťažnosti</h2>
      <p>
        Reklamácie a sťažnosti používateľ zasiela na{" "}
        <span className={styles.placeholder}>[kontaktný e-mail]</span>. Poskytovateľ sa zaväzuje reagovať
        do 30 dní.
      </p>

      <h2>11. Záverečné ustanovenia</h2>
      <p>
        Tieto podmienky sa riadia právnym poriadkom Slovenskej republiky. Poskytovateľ si vyhradzuje
        právo podmienky priebežne upravovať; o zmenách bude používateľov informovať prostredníctvom
        appky alebo e-mailu.
      </p>
    </>
  );
}
