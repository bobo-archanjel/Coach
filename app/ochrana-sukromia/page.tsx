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
 * 2026-09-22 — nahradené kompletným návrhom (zásady ochrany osobných údajov
 * prispôsobené FitPilotu: Supabase, Anthropic/Claude API, budúci Stripe,
 * waitlist štádium, role tréner/klient). Nie je to právne záväzný text od
 * právnika — pozri draftNotice nižšie aj PLACEHOLDER polia, ktoré treba pred
 * zverejnením doplniť (žlto zvýraznené).
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
          <h1>Zásady ochrany osobných údajov</h1>
          <p className={styles.updated}>Posledná aktualizácia: 22. september 2026</p>

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
          <p>
            Ak sa prihlásiš na čakaciu listinu: meno a e-mailová adresa, prípadne informácia, či si tréner
            alebo jednotlivec, a čo si nám dobrovoľne napísal do poznámky.
          </p>
          <p>Ak si zaregistrovaný používateľ appky: prihlasovacie údaje (e-mail, zahashované heslo), a podľa role:</p>
          <ul>
            <li><strong>Tréner:</strong> meno, e-mail, zoznam klientov a vzťahy s nimi.</li>
            <li>
              <strong>Klient:</strong> meno, vek, výška, váha, ciele, tréningové plány a história cvičenia,
              jedálniček a záznamy o strave, správy v chate (vrátane konverzácie s AI koučom).
            </li>
          </ul>
          <p>
            Tieto údaje o zdraví, výžive a fyzickej kondícii spracúvame s osobitnou opatrnosťou — appka ich
            nikdy nepoužíva na diagnostiku a AI asistent pri zdravotných témach odporúča konzultáciu s
            trénerom alebo odborníkom namiesto vlastného úsudku.
          </p>

          <h2>3. Na aký účel a na akom právnom základe</h2>
          <table>
            <thead>
              <tr>
                <th>Účel</th>
                <th>Právny základ</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Zaradenie na čakaciu listinu a informovanie o spustení</td>
                <td>Tvoj súhlas (čl. 6 ods. 1 písm. a) GDPR)</td>
              </tr>
              <tr>
                <td>Poskytovanie appky zaregistrovaným používateľom</td>
                <td>Plnenie zmluvy (čl. 6 ods. 1 písm. b) GDPR)</td>
              </tr>
              <tr>
                <td>Generovanie tréningových/jedálnych plánov a odpovedí AI asistenta</td>
                <td>Plnenie zmluvy — spracúvanie prebieha na serveri, nikdy priamo z tvojho zariadenia</td>
              </tr>
              <tr>
                <td>Bezpečnosť účtu (napr. ochrana proti zneužitiu prihlasovania)</td>
                <td>Oprávnený záujem (čl. 6 ods. 1 písm. f) GDPR)</td>
              </tr>
            </tbody>
          </table>

          <h2>4. Komu údaje poskytujeme</h2>
          <p>
            Údaje spracúvajú v našom mene títo poskytovatelia (sprostredkovatelia), nikdy ich nepredávame
            tretím stranám na marketingové účely:
          </p>
          <ul>
            <li><strong>Supabase</strong> — hosting databázy, autentifikácia a ukladanie dát appky.</li>
            <li>
              <strong>Anthropic (Claude API)</strong> — spracovanie AI funkcií (AI kouč pre klienta, AI
              generátor plánov pre trénera). Do tohto spracovania idú len údaje potrebné na vygenerovanie
              odpovede/plánu, výhradne cez server, nikdy priamo z tvojho zariadenia.
            </li>
            <li><strong>Stripe</strong> — až keď appka spustí platby, na spracovanie platieb predplatného.</li>
          </ul>

          <h2>5. Cezhraničný prenos</h2>
          <p>
            Niektorí z vyššie uvedených poskytovateľov môžu spracúvať dáta na serveroch mimo Európskej únie.
            V takom prípade sa spoliehame na štandardné zmluvné doložky (Standard Contractual Clauses) alebo
            iný adekvátny mechanizmus podľa GDPR, ktorý títo poskytovatelia majú zavedený.
          </p>

          <h2>6. Ako dlho údaje uchovávame</h2>
          <ul>
            <li>Údaje z čakacej listiny uchovávame do spustenia appky alebo do tvojho odhlásenia sa, podľa toho, čo nastane skôr.</li>
            <li>Údaje aktívneho účtu uchovávame po celú dobu jeho existencie.</li>
            <li>
              Ak požiadaš o vymazanie účtu (tréner aj klient majú túto možnosť priamo v appke), dáta
              natrvalo vymažeme do 30 dní (ochranná lehota, počas ktorej vieš žiadosť zrušiť).
            </li>
          </ul>

          <h2>7. Tvoje práva</h2>
          <p>Máš právo na:</p>
          <ul>
            <li>Prístup k svojim osobným údajom</li>
            <li>Opravu nesprávnych údajov</li>
            <li>Vymazanie údajov („právo na zabudnutie“) — v appke priamo dostupné, tréner aj klient si vedia vymazanie požiadať sami</li>
            <li>Prenositeľnosť údajov v strojovo čitateľnom formáte</li>
            <li>Namietanie proti spracúvaniu založenému na oprávnenom záujme</li>
            <li>Odvolanie súhlasu kedykoľvek (napr. odhlásenie z čakacej listiny)</li>
          </ul>
          <p>
            Svoje práva môžeš uplatniť na <span className={styles.placeholder}>[kontaktný e-mail]</span>. Ak
            si myslíš, že tvoje údaje spracúvame nesprávne, máš právo podať sťažnosť na Úrad na ochranu
            osobných údajov Slovenskej republiky (
            <a href="https://dataprotection.gov.sk" target="_blank" rel="noopener noreferrer">dataprotection.gov.sk</a>
            ).
          </p>

          <h2>8. Cookies</h2>
          <p>
            Appka aktuálne používa len technické cookies nevyhnutné na prihlásenie a fungovanie (napr.
            session cookie) — tieto nevyžadujú súhlas. Podrobnosti v{" "}
            <Link href="/cookies">Cookie politike</Link>.
          </p>

          <Link href="/" className={styles.backLink}>
            ← Späť na úvod
          </Link>
        </article>
      </main>
    </div>
  );
}
