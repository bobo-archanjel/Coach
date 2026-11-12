// i18n-ignore-file: právní text — celý dokument v češtině (slovenský je v content.sk.tsx)
import Link from "next/link";
import styles from "@/app/legal.module.css";

export default function PrivacyCs() {
  return (
    <>
      <h1>Zásady ochrany osobních údajů</h1>
      <p className={styles.updated}>Poslední aktualizace: 12. listopadu 2026</p>

      <div className={styles.draftNotice}>
        <strong>Toto je pracovní návrh (draft).</strong> Nejde o právně závazný text schválený právníkem.
        Obsahuje pole označená <span className={styles.placeholder}>[v hranatých závorkách]</span> — ta je
        třeba před zveřejněním doplnit skutečnými hodnotami. Před spuštěním aplikace pro skutečné zákazníky
        (a zejména před spuštěním plateb) doporučujeme právní kontrolu, především pasáží o odpovědnosti a
        zpracovatelích.
      </div>

      <h2>1. Kdo jsme</h2>
      <p>
        Provozovatelem webové stránky myfitpilot.sk a aplikace FitPilot (dále jen „aplikace“) je{" "}
        <span className={styles.placeholder}>[Tvoje jméno a příjmení]</span>,{" "}
        <span className={styles.placeholder}>[adresa]</span> (dále jen „my“ nebo „provozovatel“). V otázkách
        ochrany osobních údajů nás můžeš kontaktovat na{" "}
        <span className={styles.placeholder}>[kontaktní e-mail]</span>.
      </p>

      <h2>2. Jaké údaje zpracováváme</h2>
      <p>
        Pokud se přihlásíš na čekací listinu: jméno a e-mailová adresa, případně informace, zda jsi trenér
        nebo jednotlivec, a co jsi nám dobrovolně napsal do poznámky.
      </p>
      <p>Pokud jsi registrovaný uživatel aplikace: přihlašovací údaje (e-mail, zahashované heslo) a podle role:</p>
      <ul>
        <li><strong>Trenér:</strong> jméno, e-mail, seznam klientů a vztahy s nimi.</li>
        <li>
          <strong>Klient:</strong> jméno, věk, výška, váha, cíle, tréninkové plány a historie cvičení,
          jídelníček a záznamy o stravě, zprávy v chatu (včetně konverzace s AI koučem).
        </li>
      </ul>
      <p>
        Tyto údaje o zdraví, výživě a fyzické kondici zpracováváme se zvláštní opatrností — aplikace je nikdy
        nepoužívá k diagnostice a AI asistent u zdravotních témat doporučuje konzultaci s trenérem nebo
        odborníkem namísto vlastního úsudku.
      </p>

      <h2>3. Za jakým účelem a na jakém právním základě</h2>
      <table>
        <thead>
          <tr>
            <th>Účel</th>
            <th>Právní základ</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Zařazení na čekací listinu a informování o spuštění</td>
            <td>Tvůj souhlas (čl. 6 odst. 1 písm. a) GDPR)</td>
          </tr>
          <tr>
            <td>Poskytování aplikace registrovaným uživatelům</td>
            <td>Plnění smlouvy (čl. 6 odst. 1 písm. b) GDPR)</td>
          </tr>
          <tr>
            <td>Generování tréninkových/jídelních plánů a odpovědí AI asistenta</td>
            <td>Plnění smlouvy — zpracování probíhá na serveru, nikdy přímo z tvého zařízení</td>
          </tr>
          <tr>
            <td>Bezpečnost účtu (např. ochrana proti zneužití přihlašování)</td>
            <td>Oprávněný zájem (čl. 6 odst. 1 písm. f) GDPR)</td>
          </tr>
        </tbody>
      </table>

      <h2>4. Komu údaje poskytujeme</h2>
      <p>
        Údaje zpracovávají naším jménem tito poskytovatelé (zpracovatelé), nikdy je neprodáváme třetím
        stranám pro marketingové účely:
      </p>
      <ul>
        <li><strong>Supabase</strong> — hosting databáze, autentizace a ukládání dat aplikace.</li>
        <li>
          <strong>Anthropic (Claude API)</strong> — zpracování AI funkcí (AI kouč pro klienta, AI generátor
          plánů pro trenéra). Do tohoto zpracování jdou jen údaje potřebné k vygenerování odpovědi/plánu,
          výhradně přes server, nikdy přímo z tvého zařízení.
        </li>
        <li><strong>Stripe</strong> — až aplikace spustí platby, ke zpracování plateb předplatného.</li>
      </ul>

      <h2>5. Přeshraniční přenos</h2>
      <p>
        Někteří z výše uvedených poskytovatelů mohou zpracovávat data na serverech mimo Evropskou unii.
        V takovém případě se spoléháme na standardní smluvní doložky (Standard Contractual Clauses) nebo jiný
        odpovídající mechanismus podle GDPR, který mají tito poskytovatelé zavedený.
      </p>

      <h2>6. Jak dlouho údaje uchováváme</h2>
      <ul>
        <li>Údaje z čekací listiny uchováváme do spuštění aplikace nebo do tvého odhlášení, podle toho, co nastane dříve.</li>
        <li>Údaje aktivního účtu uchováváme po celou dobu jeho existence.</li>
        <li>
          Pokud požádáš o smazání účtu (trenér i klient mají tuto možnost přímo v aplikaci), data natrvalo
          smažeme do 30 dní (ochranná lhůta, během které můžeš žádost zrušit).
        </li>
      </ul>

      <h2>7. Tvoje práva</h2>
      <p>Máš právo na:</p>
      <ul>
        <li>Přístup ke svým osobním údajům</li>
        <li>Opravu nesprávných údajů</li>
        <li>Výmaz údajů („právo být zapomenut“) — v aplikaci přímo dostupné, trenér i klient si mohou o výmaz požádat sami</li>
        <li>Přenositelnost údajů ve strojově čitelném formátu</li>
        <li>Vznesení námitky proti zpracování založenému na oprávněném zájmu</li>
        <li>Odvolání souhlasu kdykoli (např. odhlášení z čekací listiny)</li>
      </ul>
      <p>
        Svá práva můžeš uplatnit na <span className={styles.placeholder}>[kontaktní e-mail]</span>. Pokud si
        myslíš, že tvoje údaje zpracováváme nesprávně, máš právo podat stížnost u Úradu na ochranu
        osobných údajov Slovenskej republiky (
        <a href="https://dataprotection.gov.sk" target="_blank" rel="noopener noreferrer">dataprotection.gov.sk</a>
        ), případně u dozorového úřadu státu, ve kterém žiješ (v Česku Úřad pro ochranu osobních údajů,{" "}
        <a href="https://uoou.gov.cz" target="_blank" rel="noopener noreferrer">uoou.gov.cz</a>).
      </p>

      <h2>8. Cookies</h2>
      <p>
        Aplikace používá jen technické cookies nezbytné pro přihlášení a fungování (např. session cookie) a pro
        zapamatování nastavení, která si sám zvolíš (jazyk, vzhled) — ty nevyžadují souhlas. Podrobnosti
        najdeš v <Link href="/cookies">Zásadách používání cookies</Link>.
      </p>
    </>
  );
}
