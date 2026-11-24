// i18n-ignore-file: právní text — celý dokument v češtině (slovenský je v content.sk.tsx)
// TODO(právnik): texty (zásady, podmienky, cookies) sú pracovný návrh — pred spustením pre skutočných zákazníkov a platieb potrebujú právnu kontrolu (24. 11. 2026).
import Link from "next/link";
import styles from "@/app/legal.module.css";

export default function TermsCs() {
  return (
    <>
      <h1>Obchodní podmínky</h1>
      <p className={styles.updated}>Poslední aktualizace: 24. listopadu 2026</p>

      <div className={styles.draftNotice}>
        <strong>Toto je pracovní návrh (draft).</strong> Nejde o právně závazný text schválený právníkem.
        Obsahuje pole označená <span className={styles.placeholder}>[v hranatých závorkách]</span> — ta je
        třeba doplnit před zveřejněním/spuštěním plateb. Doporučujeme právní kontrolu, zejména bodů o
        odpovědnosti a ceně.
      </div>

      <h2>1. Základní ustanovení</h2>
      <p>
        Tyto obchodní podmínky upravují vztah mezi{" "}
        <span className={styles.placeholder}>[Tvoje jméno a příjmení]</span> (dále jen „poskytovatel“) a
        uživatelem aplikace FitPilot (dále jen „uživatel“). Používáním aplikace uživatel s těmito podmínkami
        souhlasí.
      </p>

      <h2>2. Popis služby</h2>
      <p>
        FitPilot je software jako služba (SaaS) určený především fitness trenérům na Slovensku a v Česku ke
        správě klientů, tvorbě tréninkových a jídelních plánů, sledování stravy a maker a komunikaci s klienty,
        s podporou AI asistenta. Jednotlivé nástroje aplikace (sledování stravy, tvorba tréninkových plánů)
        jsou dostupné i samostatně, bez propojení s trenérem.
      </p>

      <h2>3. Registrace a účet</h2>
      <p>
        Uživatel se registruje pomocí e-mailu a hesla. Trenér spravuje své klienty přes aplikaci; klient se
        může připojit k trenérovi pomocí zvacího kódu, nebo aplikaci používat zcela samostatně. Propojení mezi
        trenérem a klientem lze kdykoli zrušit bez ztráty vlastních dat klienta.
      </p>

      <h2>4. Předplatné a platby</h2>
      <p>
        Aplikace je pro trenéry zpoplatněna formou měsíčního předplatného ve více tarifech (Starter, Pro,
        Business). Tarif určuje dostupné funkce a počet aktivních klientů. Aktuální tarify, jejich obsah a
        ceny jsou uvedeny v <Link href="/#cennik">ceníku</Link> na stránce myfitpilot.sk; cena platná v
        době objednávky se zobrazí před potvrzením platby. Klienti trenérů za používání aplikace neplatí.
        Zacházení s DPH se řídí platnými předpisy a zobrazí se při platbě{" "}
        <span className={styles.placeholder}>[doplnit: plátce/neplátce DPH, fakturační údaje]</span>.
      </p>
      <ul>
        <li>
          <strong>Zkušební doba.</strong> Nový trenér dostane 14 dní zkušební doby bez zadání platební
          karty. Po jejím skončení aplikace přejde do režimu pouze pro čtení, dokud si trenér nezvolí tarif.
        </li>
        <li>
          <strong>Platby a obnovování.</strong> Platby zpracovává Stripe (Stripe Checkout, zákaznický
          portál); údaje o platební kartě FitPilot nevidí. Předplatné se automaticky obnovuje každý měsíc,
          dokud ho trenér nezruší.
        </li>
        <li>
          <strong>Změna tarifu.</strong> Přechod na vyšší tarif nebo větší limit klientů se projeví ihned a
          doplatek za zbytek období se vyúčtuje poměrně. Přechod na nižší tarif se projeví až na konci
          zaplaceného období. Pokud má trenér v době přechodu více klientů, než nový tarif povoluje, je účet
          pouze pro čtení, dokud počet klientů nesníží.
        </li>
        <li>
          <strong>Zrušení.</strong> Trenér může předplatné zrušit kdykoli v zákaznickém portálu; zrušení se
          projeví na konci již zaplaceného období, do té doby aplikace funguje v plném rozsahu.
        </li>
        <li>
          <strong>Vrácení platby.</strong> Za částečně využité období se platba nevrací, pokud závazné
          právní předpisy nestanoví jinak (např. zákonná práva spotřebitele).
        </li>
        <li>
          <strong>Neuhrazená platba.</strong> Pokud se platbu nepodaří uhradit, aplikace zůstane ještě 7 dní
          plně funkční; poté přejde do režimu pouze pro čtení (trenér vidí svá data, ale nemůže je měnit,
          a přístup klientů zůstává zachován, kromě funkcí vázaných na tarif, např. AI kouče). Po uhrazení
          se přístup obnoví. Data se kvůli neuhrazené platbě nemažou.
        </li>
        <li>
          <strong>Stávající (beta) účty.</strong> Poskytovatel může některým účtům (např. beta testerům)
          poskytnout přístup zdarma; jde o dobrovolné plnění, které může poskytovatel po přiměřeném
          upozornění změnit nebo ukončit.
        </li>
      </ul>

      <h2>5. Umělá inteligence — důležité omezení</h2>
      <p>
        AI funkce aplikace (AI kouč pro klienta, AI generátor tréninkových a jídelních plánů, shrnutí
        progresu) jsou asistenční nástroj, nikoli náhrada odborného poradenství. AI výstupy pro klienta
        aplikace nikdy neposílá automaticky — trenér je musí nejprve schválit. AI nikdy nediagnostikuje
        zdravotní problémy; u zdravotních témat aplikace doporučuje konzultaci s trenérem nebo lékařem.
        Poskytovatel neodpovídá za škodu způsobenou nesprávným použitím AI doporučení mimo tento rámec.
      </p>

      <h2>6. Veřejná stránka, reference, pozvánky a zájemci</h2>
      <p>
        Pokud trenér využívá veřejnou stránku, značku nebo pozvánky, odpovídá za jejich obsah a používání:
      </p>
      <ul>
        <li>
          <strong>Obsah veřejné stránky a značky</strong> (texty, logo, fotografie, odkazy) je veřejně
          dostupný. Trenér smí zveřejnit jen obsah, ke kterému má práva, který neporušuje práva třetích osob
          ani právní předpisy a který není klamavý.
        </li>
        <li>
          <strong>Reference</strong> musí být pravdivé a pocházet od skutečných klientů, kteří se
          zveřejněním souhlasili. Vymýšlet nebo upravovat reference je zakázáno.
        </li>
        <li>
          <strong>Pozvánky e-mailem</strong> smí trenér posílat jen lidem, kteří je očekávají (např. vlastním
          klientům po domluvě). Je zakázáno použít je pro hromadné nebo nevyžádané zprávy (spam). Počet
          pozvánek omezujeme; komu se z pozvánek odhlásí, tomu další nelze posílat.
        </li>
        <li>
          <strong>Údaje zájemců</strong> (poptávky z formuláře na veřejné stránce) zpracovává trenér jako
          jejich správce; FitPilot mu je technicky zpřístupňuje jako zpracovatel (viz{" "}
          <Link href="/ochrana-sukromia">Zásady ochrany osobních údajů</Link>). Trenér je smí použít k
          odpovědi na poptávku a nesmí je použít k jinému účelu (např. marketingu) bez právního základu;
          odpovídá za plnění povinností vůči zájemcům podle GDPR.
        </li>
      </ul>
      <p>
        Poskytovatel může obsah, který tato pravidla porušuje, odstranit nebo veřejnou stránku pozastavit.
      </p>

      <h2>7. Trvání a ukončení</h2>
      <p>
        Uživatel může aplikaci přestat používat a požádat o smazání účtu kdykoli přímo v aplikaci.
        Smazání proběhne po uplynutí 30 dnů od žádosti; do té doby ho může uživatel v aplikaci zrušit.
        Po uplynutí lhůty se údaje natrvalo smažou.
      </p>
      <p>
        Pokud o smazání účtu požádá trenér, aplikace na to upozorní jeho klienty s vlastním účtem.
        Po smazání se klienti od trenéra odpojí a zveřejněné tréninkové plány a jídelníčky, které jim
        trenér připravil, jim zůstanou v jejich účtu. Zprávy mezi trenérem a klienty se smažou.
      </p>
      <p>
        Poskytovatel si vyhrazuje právo pozastavit nebo zrušit účet v případě porušení těchto podmínek.
      </p>

      <h2>8. Odpovědnost</h2>
      <p>
        Aplikace se poskytuje „tak, jak je“. Poskytovatel vynakládá přiměřené úsilí na dostupnost a
        bezpečnost aplikace, ale neodpovídá za škody vzniklé výpadkem služby, ztrátou dat v důsledku vyšší
        moci nebo nesprávným použitím aplikace v rozporu s jejím účelem.
      </p>

      <h2>9. Ochrana osobních údajů</h2>
      <p>
        Zpracování osobních údajů se řídí samostatnými{" "}
        <Link href="/ochrana-sukromia">Zásadami ochrany osobních údajů</Link>.
      </p>

      <h2>10. Reklamace a stížnosti</h2>
      <p>
        Reklamace a stížnosti uživatel zasílá na{" "}
        <span className={styles.placeholder}>[kontaktní e-mail]</span>. Poskytovatel se zavazuje reagovat do
        30 dní.
      </p>

      <h2>11. Závěrečná ustanovení</h2>
      <p>
        Tyto podmínky se řídí právním řádem Slovenské republiky. Poskytovatel si vyhrazuje právo podmínky
        průběžně upravovat; o změnách bude uživatele informovat prostřednictvím aplikace nebo e-mailu.
      </p>
    </>
  );
}
