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
 * feature/security#2 — predtým dead link (href="#") z registračného formulára.
 * DRAFT dokument — vecne správny podľa toho, čo appka reálne robí, ale nie je
 * to právne záväzný text od právnika. Viditeľné upozornenie v UI aj v kóde.
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
          <p className={styles.updated}>Posledná aktualizácia: 7. september 2026</p>

          <div className={styles.draftNotice}>
            <strong>Toto je pracovný návrh (draft).</strong> Popisuje vecne, ako appka funguje — ale nie
            je to právne záväzný text schválený právnikom. Pred spustením appky pre skutočných
            zákazníkov nechajte tento dokument skontrolovať právnikom.
          </div>

          <h2>1. Predmet zmluvy</h2>
          <p>
            FitPilot je softvér (SaaS) na správu klientov, tréningových plánov, výživy a komunikácie
            pre fitness trénerov. Používaním appky (registráciou účtu) súhlasíte s týmito podmienkami.
          </p>

          <h2>2. Účty a role</h2>
          <p>
            Appka rozlišuje dve role — tréner (platiaci zákazník) a klient (pripojený trénerom cez
            pozývací kód). Tréner zodpovedá za správnosť údajov, ktoré o svojich klientoch zadáva.
          </p>

          <h2>3. Predplatné a skúšobné obdobie</h2>
          <p>
            Tréner má k dispozícii 14-dňové skúšobné obdobie zadarmo, bez viazanosti. Po jeho uplynutí
            pokračovanie v používaní appky vyžaduje platné predplatné podľa aktuálneho cenníka na
            landing page. Ceny sú orientačné a môžu sa zmeniť pred spustením plateného predplatného.
          </p>

          <h2>4. AI funkcie — obmedzenie zodpovednosti</h2>
          <p>
            Appka obsahuje AI asistenta (generovanie tréningových plánov, sumarizácia progresu, chat
            pre klienta). AI výstupy sú <strong>návrhy</strong>, nikdy automatické rozhodnutia —
            tréningový plán navrhnutý AI sa vždy zobrazí trénerovi na schválenie/úpravu pred tým, než
            ho klient uvidí. AI chat pre klienta pri zmienke o bolesti, zranení alebo zdravotnom
            probléme eskaluje na trénera a <strong>nediagnostikuje</strong> — appka nenahrádza
            zdravotnú starostlivosť ani odborné poradenstvo.
          </p>

          <h2>5. Zodpovednosť trénera</h2>
          <p>
            Tréner zostáva plne zodpovedný za odborné vedenie svojich klientov — appka je nástroj na
            administratívu a komunikáciu, nie náhrada odbornej starostlivosti trénera.
          </p>

          <h2>6. Ukončenie zmluvy</h2>
          <p>
            Tréner môže kedykoľvek zrušiť predplatné a požiadať o vymazanie účtu. Appka poskytuje
            30-dňovú ochrannú lehotu pred trvalým vymazaním údajov, počas ktorej sa dá zrušenie vrátiť.
          </p>

          <h2>7. Dostupnosť služby</h2>
          <p>
            Appka je poskytovaná „tak ako je&rdquo; (as-is). Snažíme sa o čo najvyššiu dostupnosť, ale
            negarantujeme neprerušenú prevádzku.
          </p>

          <h2>8. Rozhodné právo</h2>
          <p>Tieto podmienky sa riadia právnym poriadkom Slovenskej republiky.</p>

          <h2>9. Kontakt</h2>
          <p>
            Otázky k týmto podmienkam posielajte na{" "}
            <a href="mailto:podpora@fitpilot.sk">podpora@fitpilot.sk</a>.
          </p>

          <Link href="/" className={styles.backLink}>
            ← Späť na úvod
          </Link>
        </article>
      </main>
    </div>
  );
}
