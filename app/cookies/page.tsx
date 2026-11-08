import Link from "next/link";
import type { Metadata } from "next";
import { LogoMark } from "../components/LogoMark";
import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Cookie politika",
  description: "Aké cookies appka FitPilot používa — len technické, nevyhnutné na prihlásenie. Žiadny cookie banner.",
  robots: { index: false, follow: true }, // draft — nechceme indexovať, kým neprejde právnou kontrolou
};

/**
 * 2026-09-22 — nová stránka (predtým sekcia 8 v Ochrane súkromia, teraz
 * samostatne, odkazovaná odtiaľ aj z Obchodných podmienok). Rovnaký draft
 * status ako ostatné právne stránky.
 */
export default function CookiesPage() {
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
          <h1>Cookie politika</h1>
          <p className={styles.updated}>Posledná aktualizácia: 22. september 2026</p>

          <div className={styles.draftNotice}>
            <strong>Toto je pracovný návrh (draft).</strong> Nie je to právne záväzný text schválený
            právnikom.
          </div>

          <p>
            Táto stránka a appka FitPilot aktuálne používajú len cookies nevyhnutné pre základné fungovanie:
          </p>

          <table>
            <thead>
              <tr>
                <th>Cookie</th>
                <th>Účel</th>
                <th>Platnosť</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Prihlasovacia session (Supabase Auth)</td>
                <td>Udržanie prihlásenia počas návštevy</td>
                <td>Do odhlásenia / vypršania session</td>
              </tr>
            </tbody>
          </table>

          <p>
            Tieto cookies sú nevyhnutné na fungovanie appky a nevyžadujú súhlas podľa platnej legislatívy —
            appka bez nich nemôže fungovať (nevedela by ťa udržať prihláseného).
          </p>
          <p>
            Ak v budúcnosti pridáme analytické (napr. Google Analytics) alebo marketingové cookies (napr.
            Meta Pixel), táto stránka sa doplní o cookie lištu s možnosťou súhlasu/odmietnutia a zoznam
            pribudne o tieto cookies s presným účelom a dobou platnosti. Do tej doby banner nie je potrebný.
          </p>

          <Link href="/" className={styles.backLink}>
            ← Späť na úvod
          </Link>
        </article>
      </main>
    </div>
  );
}
