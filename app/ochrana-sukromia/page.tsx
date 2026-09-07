import Link from "next/link";
import type { Metadata } from "next";
import { LogoMark } from "../components/LogoMark";
import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Ochrana súkromia",
  description: "Ako FitPilot spracúva osobné údaje trénerov a klientov — GDPR, cookies, doba uchovávania, práva dotknutej osoby.",
  robots: { index: false, follow: true }, // draft — nechceme indexovať, kým neprejde právnou kontrolou
};

/**
 * feature/security#2 — predtým dead link (href="#") z registračného formulára.
 * DRAFT dokument — vecne správny podľa toho, čo appka reálne robí, ale nie je
 * to právne záväzný text od právnika. Viditeľné upozornenie v UI aj v kóde.
 */
export default function PrivacyPolicyPage() {
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
          <h1>Ochrana súkromia</h1>
          <p className={styles.updated}>Posledná aktualizácia: 7. september 2026</p>

          <div className={styles.draftNotice}>
            <strong>Toto je pracovný návrh (draft).</strong> Popisuje vecne správne, aké údaje appka
            spracúva a prečo — ale nie je to právne záväzný text schválený právnikom. Pred spustením
            appky pre skutočných zákazníkov nechajte tento dokument skontrolovať právnikom
            špecializovaným na GDPR.
          </div>

          <p>
            FitPilot („appka&rdquo;, „my&rdquo;) je softvér pre fitness trénerov a ich klientov na Slovensku a v
            Česku. Tento dokument vysvetľuje, aké osobné údaje spracúvame, na aký účel, ako dlho ich
            uchovávame a aké máte práva.
          </p>

          <h2>1. Kto je prevádzkovateľom</h2>
          <p>
            Prevádzkovateľom je poskytovateľ appky FitPilot. Kontakt vo veciach ochrany súkromia:{" "}
            <a href="mailto:podpora@fitpilot.sk">podpora@fitpilot.sk</a>.
          </p>

          <h2>2. Aké údaje spracúvame</h2>
          <ul>
            <li>
              <strong>Registračné údaje</strong> — meno, e-mail, heslo (uložené zahashované,
              nikdy v čitateľnej podobe).
            </li>
            <li>
              <strong>Profil klienta</strong> — vek, váha, výška, cieľ, zdravotné obmedzenia, ak ich
              tréner alebo klient zadá.
            </li>
            <li>
              <strong>Tréningové a nutričné dáta</strong> — tréningové plány, odcvičené série,
              jedálniček, záznamy stravy, história merania.
            </li>
            <li>
              <strong>Komunikácia</strong> — správy medzi trénerom a klientom, konverzácia s AI
              asistentom (tá je súkromná — tréner k nej nemá prístup).
            </li>
            <li>
              <strong>Technické údaje</strong> — anonymné údaje o návštevnosti (pozri sekciu Cookies).
            </li>
          </ul>

          <h2>3. Prečo tieto údaje spracúvame</h2>
          <p>
            Údaje spracúvame na základe plnenia zmluvy (poskytnutie funkcií appky, ktoré ste si
            vyžiadali registráciou) a oprávneného záujmu (bezpečnosť účtu, prevencia zneužitia). Údaje
            nepredávame tretím stranám na marketingové účely.
          </p>

          <h2>4. Kto má prístup k údajom (spracovatelia)</h2>
          <ul>
            <li>
              <strong>Supabase</strong> — hosting databázy a autentifikácie. Údaje sú uložené v ich
              infraštruktúre podľa ich vlastných zásad spracovania.
            </li>
            <li>
              <strong>Anthropic (Claude API)</strong> — AI funkcie (chat, generovanie plánov) posielajú
              modelu len údaje potrebné na danú odpoveď, nikdy prihlasovacie údaje.
            </li>
          </ul>
          <p>Žiadny z týchto poskytovateľov údaje nevyužíva na vlastný marketing.</p>

          <h2>5. Cookies a analytics</h2>
          <p>
            Používame cookieless analytics nástroj (Plausible), ktorý nesleduje jednotlivých
            návštevníkov, neukladá cookies a nezhromažďuje osobné údaje — len anonymné súhrnné
            štatistiky návštevnosti. Preto appka nepoužíva cookie lištu — nemáme žiadne
            nepodstatné (marketingové/trackovacie) cookies, ktoré by si vyžadovali súhlas.
            Appka používa výhradne technické cookies nevyhnutné na prihlásenie (session), ktoré
            podľa ePrivacy smernice súhlas nevyžadujú.
          </p>

          <h2>6. Doba uchovávania</h2>
          <p>
            Údaje uchovávame, kým je účet aktívny. Pri zrušení spolupráce/účtu appka ponúka 30-dňovú
            ochrannú lehotu (grace period), počas ktorej sa dá zrušenie vrátiť späť — po jej uplynutí sa
            údaje trvalo vymažú.
          </p>

          <h2>7. Vaše práva</h2>
          <p>Podľa GDPR máte právo na:</p>
          <ul>
            <li>prístup k svojim údajom,</li>
            <li>opravu nesprávnych údajov,</li>
            <li>vymazanie údajov (appka toto umožňuje priamo v nastaveniach účtu),</li>
            <li>prenositeľnosť údajov,</li>
            <li>namietanie proti spracovaniu.</li>
          </ul>
          <p>
            Na uplatnenie ktoréhokoľvek z týchto práv napíšte na{" "}
            <a href="mailto:podpora@fitpilot.sk">podpora@fitpilot.sk</a>.
          </p>

          <h2>8. Zmeny tohto dokumentu</h2>
          <p>
            Túto stránku môžeme priebežne aktualizovať. O významných zmenách vás budeme informovať
            e-mailom alebo v appke.
          </p>

          <Link href="/" className={styles.backLink}>
            ← Späť na úvod
          </Link>
        </article>
      </main>
    </div>
  );
}
