// i18n-ignore-file: právní text — celý dokument v češtině (slovenský je v content.sk.tsx)
import Link from "next/link";
import styles from "@/app/legal.module.css";

export default function TermsCs() {
  return (
    <>
      <h1>Obchodní podmínky</h1>
      <p className={styles.updated}>Poslední aktualizace: 22. září 2026</p>

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

      <h2>4. Cena a platba</h2>
      <p>
        Ceny uvedené na stránce myfitpilot.sk jsou v době psaní těchto podmínek orientační a mění se.{" "}
        <span className={styles.placeholder}>
          [Doplnit po finalizaci ceníku: přesná cena, fakturační cyklus, způsob platby přes Stripe, možnost
          zrušení předplatného.]
        </span>{" "}
        Dokud aplikace nemá spuštěné platby, tento bod se neuplatňuje.
      </p>

      <h2>5. Umělá inteligence — důležité omezení</h2>
      <p>
        AI funkce aplikace (AI kouč pro klienta, AI generátor tréninkových a jídelních plánů, shrnutí
        progresu) jsou asistenční nástroj, nikoli náhrada odborného poradenství. AI výstupy pro klienta
        aplikace nikdy neposílá automaticky — trenér je musí nejprve schválit. AI nikdy nediagnostikuje
        zdravotní problémy; u zdravotních témat aplikace doporučuje konzultaci s trenérem nebo lékařem.
        Poskytovatel neodpovídá za škodu způsobenou nesprávným použitím AI doporučení mimo tento rámec.
      </p>

      <h2>6. Trvání a ukončení</h2>
      <p>
        Uživatel může aplikaci přestat používat a požádat o smazání účtu kdykoli přímo v aplikaci.
        Poskytovatel si vyhrazuje právo pozastavit nebo zrušit účet v případě porušení těchto podmínek.
      </p>

      <h2>7. Odpovědnost</h2>
      <p>
        Aplikace se poskytuje „tak, jak je“. Poskytovatel vynakládá přiměřené úsilí na dostupnost a
        bezpečnost aplikace, ale neodpovídá za škody vzniklé výpadkem služby, ztrátou dat v důsledku vyšší
        moci nebo nesprávným použitím aplikace v rozporu s jejím účelem.
      </p>

      <h2>8. Ochrana osobních údajů</h2>
      <p>
        Zpracování osobních údajů se řídí samostatnými{" "}
        <Link href="/ochrana-sukromia">Zásadami ochrany osobních údajů</Link>.
      </p>

      <h2>9. Reklamace a stížnosti</h2>
      <p>
        Reklamace a stížnosti uživatel zasílá na{" "}
        <span className={styles.placeholder}>[kontaktní e-mail]</span>. Poskytovatel se zavazuje reagovat do
        30 dní.
      </p>

      <h2>10. Závěrečná ustanovení</h2>
      <p>
        Tyto podmínky se řídí právním řádem Slovenské republiky. Poskytovatel si vyhrazuje právo podmínky
        průběžně upravovat; o změnách bude uživatele informovat prostřednictvím aplikace nebo e-mailu.
      </p>
    </>
  );
}
