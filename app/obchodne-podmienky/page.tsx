import Link from "next/link";
import type { Metadata } from "next";
import { LogoMark } from "../components/LogoMark";
import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Obchodné podmienky",
  description: "Zmluvné podmienky používania FitPilot — predplatné, zodpovednosť, AI funkcie, ukončenie zmluvy.",
  robots: { index: false, follow: true }, // draft — nechceme indexovať, kým neprejde právnou kontrolou
};

/**
 * 2026-09-22 — nahradené kompletným návrhom obchodných podmienok. Nie je to
 * právne záväzný text od právnika — pozri draftNotice nižšie. Bod 4 (cena a
 * platba) sa uplatní až po spustení Stripe platieb, dovtedy zostáva neaktívny.
 */
export default function TermsPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          <LogoMark className={styles.logoMark} />
          FitPilot
        </Link>
      </header>
      <main className={styles.main}>
        <article className={`${styles.card} ${styles.legal}`}>
          <span className={styles.eyebrow}>Právne</span>
          <h1>Obchodné podmienky</h1>
          <p className={styles.updated}>Posledná aktualizácia: 22. september 2026</p>

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

          <h2>4. Cena a platba</h2>
          <p>
            Ceny uvedené na stránke myfitpilot.sk sú v čase písania týchto podmienok orientačné a menia sa.{" "}
            <span className={styles.placeholder}>
              [Doplniť po finalizácii cenníka: presná cena, fakturačný cyklus, spôsob platby cez Stripe,
              možnosť zrušenia predplatného.]
            </span>{" "}
            Kým appka nemá spustené platby, tento bod sa neuplatňuje.
          </p>

          <h2>5. Umelá inteligencia — dôležité obmedzenie</h2>
          <p>
            AI funkcie appky (AI kouč pre klienta, AI generátor tréningových a jedálnych plánov, sumarizácia
            progresu) sú asistenčný nástroj, nie náhrada odborného poradenstva. AI výstupy pre klienta appka
            nikdy neposiela automaticky — tréner ich musí najprv schváliť. AI nikdy nediagnostikuje zdravotné
            problémy; pri zdravotných témach appka odporúča konzultáciu s trénerom alebo lekárom.
            Poskytovateľ nezodpovedá za škodu spôsobenú nesprávnym použitím AI odporúčaní mimo tohto rámca.
          </p>

          <h2>6. Trvanie a ukončenie</h2>
          <p>
            Používateľ môže appku prestať používať a požiadať o vymazanie účtu kedykoľvek priamo v appke.
            Poskytovateľ si vyhradzuje právo pozastaviť alebo zrušiť účet v prípade porušenia týchto
            podmienok.
          </p>

          <h2>7. Zodpovednosť</h2>
          <p>
            Appka sa poskytuje „tak ako je“. Poskytovateľ vynakladá primerané úsilie na dostupnosť a
            bezpečnosť appky, ale nezodpovedá za škody vzniknuté výpadkom služby, stratou dát v dôsledku
            vyššej moci, alebo nesprávnym použitím appky v rozpore s jej účelom.
          </p>

          <h2>8. Ochrana osobných údajov</h2>
          <p>
            Spracúvanie osobných údajov sa riadi samostatnými{" "}
            <Link href="/ochrana-sukromia">Zásadami ochrany osobných údajov</Link>.
          </p>

          <h2>9. Reklamácie a sťažnosti</h2>
          <p>
            Reklamácie a sťažnosti používateľ zasiela na{" "}
            <span className={styles.placeholder}>[kontaktný e-mail]</span>. Poskytovateľ sa zaväzuje reagovať
            do 30 dní.
          </p>

          <h2>10. Záverečné ustanovenia</h2>
          <p>
            Tieto podmienky sa riadia právnym poriadkom Slovenskej republiky. Poskytovateľ si vyhradzuje
            právo podmienky priebežne upravovať; o zmenách bude používateľov informovať prostredníctvom
            appky alebo e-mailu.
          </p>

          <Link href="/" className={styles.backLink}>
            ← Späť na úvod
          </Link>
        </article>
      </main>
    </div>
  );
}
