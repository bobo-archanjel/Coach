// i18n-ignore-file: právní text — celý dokument v češtině (slovenský je v content.sk.tsx)
import styles from "@/app/legal.module.css";

export default function CookiesCs() {
  return (
    <>
      <h1>Zásady používání cookies</h1>
      <p className={styles.updated}>Poslední aktualizace: 12. listopadu 2026</p>

      <div className={styles.draftNotice}>
        <strong>Toto je pracovní návrh (draft).</strong> Nejde o právně závazný text schválený právníkem.
      </div>

      <p>
        Tato stránka a aplikace FitPilot aktuálně používají jen cookies nezbytné pro základní fungování a pro
        zapamatování nastavení, která si sám zvolíš:
      </p>

      <table>
        <thead>
          <tr>
            <th>Cookie</th>
            <th>Účel</th>
            <th>Platnost</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Přihlašovací session (Supabase Auth)</td>
            <td>Udržení přihlášení během návštěvy</td>
            <td>Do odhlášení / vypršení session</td>
          </tr>
          <tr>
            <td>fp-locale</td>
            <td>Zapamatování zvoleného jazyka (slovenština / čeština)</td>
            <td>1 rok</td>
          </tr>
          <tr>
            <td>fp-v6-theme</td>
            <td>Zapamatování zvoleného vzhledu (světlý / tmavý režim)</td>
            <td>1 rok</td>
          </tr>
          <tr>
            <td>fitpilot_tour_seen</td>
            <td>Aby se úvodní průvodce aplikací nespouštěl znovu</td>
            <td>1 rok nebo do odhlášení</td>
          </tr>
        </tbody>
      </table>

      <p>
        Tyto cookies jsou nezbytné pro fungování aplikace nebo pro funkci, o kterou sis sám požádal (jazyk,
        vzhled), a podle platné legislativy nevyžadují souhlas — bez nich by tě aplikace neudržela přihlášeného
        ani si nepamatovala tvoje nastavení.
      </p>
      <p>
        Pokud v budoucnu přidáme analytické (např. Google Analytics) nebo marketingové cookies (např. Meta
        Pixel), tato stránka se doplní o cookie lištu s možností souhlasu/odmítnutí a seznam se rozšíří o tyto
        cookies s přesným účelem a dobou platnosti. Do té doby lišta není potřeba.
      </p>
    </>
  );
}
