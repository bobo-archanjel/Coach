// i18n-ignore-file: právny text — celý dokument v slovenčine (český je v content.cs.tsx)
import styles from "@/app/legal.module.css";

export default function CookiesSk() {
  return (
    <>
      <h1>Cookie politika</h1>
      <p className={styles.updated}>Posledná aktualizácia: 12. november 2026</p>

      <div className={styles.draftNotice}>
        <strong>Toto je pracovný návrh (draft).</strong> Nie je to právne záväzný text schválený právnikom.
      </div>

      <p>
        Táto stránka a appka FitPilot aktuálne používajú len cookies nevyhnutné pre základné fungovanie a na
        zapamätanie nastavení, ktoré si sám zvolíš:
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
          <tr>
            <td>fp-locale</td>
            <td>Zapamätanie zvoleného jazyka (slovenčina / čeština)</td>
            <td>1 rok</td>
          </tr>
          <tr>
            <td>fp-v6-theme</td>
            <td>Zapamätanie zvoleného vzhľadu (svetlý / tmavý režim)</td>
            <td>1 rok</td>
          </tr>
          <tr>
            <td>fitpilot_tour_seen</td>
            <td>Aby sa úvodný sprievodca appkou nespúšťal znova</td>
            <td>1 rok alebo do odhlásenia</td>
          </tr>
        </tbody>
      </table>

      <p>
        Tieto cookies sú nevyhnutné na fungovanie appky alebo na funkciu, o ktorú si sám požiadal (jazyk,
        vzhľad), a nevyžadujú súhlas podľa platnej legislatívy — appka by ťa bez nich nevedela udržať
        prihláseného ani si zapamätať tvoje nastavenia.
      </p>
      <p>
        Ak v budúcnosti pridáme analytické (napr. Google Analytics) alebo marketingové cookies (napr. Meta
        Pixel), táto stránka sa doplní o cookie lištu s možnosťou súhlasu/odmietnutia a zoznam pribudne o tieto
        cookies s presným účelom a dobou platnosti. Do tej doby banner nie je potrebný.
      </p>
    </>
  );
}
