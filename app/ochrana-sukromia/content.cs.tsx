// i18n-ignore-file: právní text — celý dokument v češtině (slovenský je v content.sk.tsx)
// TODO(právnik): texty (zásady, podmienky, cookies) sú pracovný návrh — pred spustením pre skutočných zákazníkov a platieb potrebujú právnu kontrolu (24. 11. 2026).
import Link from "next/link";
import styles from "@/app/legal.module.css";

export default function PrivacyCs() {
  return (
    <>
      <h1>Zásady ochrany osobních údajů</h1>
      <p className={styles.updated}>Poslední aktualizace: 25. listopadu 2026</p>

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
      <p>Pokud jsi registrovaný uživatel aplikace: přihlašovací údaje (e-mail, zahashované heslo) a podle role:</p>
      <ul>
        <li>
          <strong>Trenér:</strong> jméno, e-mail, seznam klientů a vztahy s nimi, údaje o předplatném
          (tarif, stav, období, identifikátory zákazníka a předplatného u poskytovatele plateb — nikoli
          údaje o platební kartě) a pokud je zadáš, také údaje veřejné stránky a značky (název, popis,
          odkazy na sociální sítě, reference, logo, fotografie, barva).
        </li>
        <li>
          <strong>Klient:</strong> jméno, věk, výška, váha, cíle, tréninkové plány a historie cvičení,
          jídelníček a záznamy o stravě, zprávy v chatu (včetně konverzace s AI koučem). Z tréninkových
          údajů aplikace vypočítává úspěchy, osobní rekordy, odznaky a úrovně (gamifikace).
        </li>
        <li>
          <strong>Zájemce</strong> (návštěvník veřejné stránky trenéra, který vyplní formulář): jméno,
          e-mail, telefon (nepovinný), cíl, zkušenost, časová dostupnost, zpráva, verze a čas souhlasu se
          zpracováním a hash IP adresy (viz části 3 a 4).
        </li>
        <li>
          <strong>Příjemce pozvánky:</strong> e-mailová adresa, kterou trenér zadal při pozvání klienta
          (a případně křestní jméno).
        </li>
      </ul>
      <p>
        Tyto údaje o zdraví, výživě a fyzické kondici zpracováváme se zvláštní opatrností — aplikace je nikdy
        nepoužívá k diagnostice a AI asistent u zdravotních témat doporučuje konzultaci s trenérem nebo
        odborníkem namísto vlastního úsudku.
      </p>
      <p>
        Technické údaje (např. IP adresa v lozích hostingu, informace o prohlížeči) zpracováváme v nezbytném
        rozsahu pro provoz a zabezpečení služby.
      </p>

      <h2>3. Kdo je správce a kdo zpracovatel</h2>
      <ul>
        <li>
          <strong>Údaje o účtech, předplatném a používání aplikace</strong> zpracováváme jako správce my.
        </li>
        <li>
          <strong>Údaje zájemců z veřejné stránky trenéra:</strong> správcem je <strong>trenér</strong>,
          kterému zájemce formulář odesílá — on určuje, proč a jak se s údaji naloží. My (FitPilot) pro
          trenéra tyto údaje jen technicky zpracováváme (ukládáme je a doručujeme mu je) jako{" "}
          <strong>zpracovatel</strong>. Ochranu formuláře proti zneužití (např. hash IP adresy)
          zajišťujeme my sami na základě oprávněného zájmu.
        </li>
        <li>
          <strong>Údaje, které trenér vede o svých klientech</strong> (plány, poznámky, zprávy): vůči
          klientovi za ně odpovídá trenér; FitPilot je zpracovává na základě smlouvy s trenérem a podle
          těchto zásad.
        </li>
      </ul>

      <h2>4. Za jakým účelem a na jakém právním základě</h2>
      <table>
        <thead>
          <tr>
            <th>Účel</th>
            <th>Právní základ</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Poskytování aplikace registrovaným uživatelům</td>
            <td>Plnění smlouvy (čl. 6 odst. 1 písm. b) GDPR)</td>
          </tr>
          <tr>
            <td>Generování tréninkových/jídelních plánů a odpovědí AI asistenta</td>
            <td>Plnění smlouvy — zpracování probíhá na serveru, nikdy přímo z tvého zařízení</td>
          </tr>
          <tr>
            <td>Předplatné trenérů: platby, zkušební doba, správa tarifu, fakturace</td>
            <td>Plnění smlouvy (čl. 6 odst. 1 písm. b) GDPR); uchovávání účetních dokladů — zákonná povinnost (čl. 6 odst. 1 písm. c) GDPR)</td>
          </tr>
          <tr>
            <td>Transakční e-maily (pozvánka klienta, uvítání, upozornění trenéra na nového zájemce, účtové a bezpečnostní zprávy)</td>
            <td>Plnění smlouvy / oprávněný zájem (čl. 6 odst. 1 písm. b) a f) GDPR)</td>
          </tr>
          <tr>
            <td>Týdenní shrnutí „Tvůj týden“ e-mailem pro klienty (můžeš ho kdykoli vypnout)</td>
            <td>Oprávněný zájem (čl. 6 odst. 1 písm. f) GDPR) — součást služby, kterou ti poskytuje tvůj trenér; odhlášení jedním kliknutím</td>
          </tr>
          <tr>
            <td>Přijetí a doručení poptávky zájemce trenérovi přes formulář na veřejné stránce</td>
            <td>Souhlas zájemce (čl. 6 odst. 1 písm. a) GDPR), který uděluje odesláním formuláře; další zpracování trenérem na jeho vlastním právním základě</td>
          </tr>
          <tr>
            <td>Ochrana proti zneužití (Cloudflare Turnstile při přihlášení a ve formuláři, limity odesílání, hash IP adresy, evidence odeslaných e-mailů)</td>
            <td>Oprávněný zájem (čl. 6 odst. 1 písm. f) GDPR)</td>
          </tr>
          <tr>
            <td>Gamifikace: úspěchy, osobní rekordy, odznaky, úrovně, týdenní mise, odměny (rámeček avataru, barva portálu, zmrazení série) a celoaplikační žebříček všech klientů aplikace</td>
            <td>Plnění smlouvy (výpočet z tvých tréninkových údajů); zobrazení v celoaplikačním žebříčku pod přezdívkou — oprávněný zájem (čl. 6 odst. 1 písm. f) GDPR) s možností kdykoli se skrýt (opt-out)</td>
          </tr>
          <tr>
            <td>Zveřejnění veřejné stránky a značky trenéra</td>
            <td>Plnění smlouvy s trenérem, na základě jeho vlastního rozhodnutí údaje zveřejnit</td>
          </tr>
          <tr>
            <td>Bezpečnost účtu (např. ochrana proti zneužití přihlašování)</td>
            <td>Oprávněný zájem (čl. 6 odst. 1 písm. f) GDPR)</td>
          </tr>
        </tbody>
      </table>

      <h2>5. Komu údaje poskytujeme</h2>
      <p>
        Údaje zpracovávají naším jménem tito poskytovatelé (zpracovatelé), nikdy je neprodáváme třetím
        stranám pro marketingové účely:
      </p>
      <ul>
        <li><strong>Supabase</strong> — hosting databáze, autentizace a ukládání dat a souborů aplikace.</li>
        <li><strong>Vercel</strong> — hosting webu a aplikace a plánované úlohy (např. týdenní e-maily, mazání starých poptávek).</li>
        <li>
          <strong>Anthropic (Claude API)</strong> — zpracování AI funkcí (AI kouč pro klienta, AI generátor
          plánů pro trenéra). Do tohoto zpracování jdou jen údaje potřebné k vygenerování odpovědi/plánu,
          výhradně přes server, nikdy přímo z tvého zařízení.
        </li>
        <li>
          <strong>Stripe</strong> — zpracování plateb předplatného trenérů (Stripe Checkout a zákaznický
          portál). Platby zpracovává Stripe; údaje o platební kartě zadáváš přímo Stripe a FitPilot je
          nikdy nevidí ani neukládá. Podle nastavení platební služby může být v některých případech Stripe
          také obchodníkem při platbě; v takovém případě tě o tom informuje při platbě.
        </li>
        <li>
          <strong>Websupport</strong> — odesílání e-mailů z naší adresy přes SMTP server (obsah a adresa
          příjemce procházejí jeho serverem).
        </li>
        <li>
          <strong>Cloudflare</strong> — Turnstile, ověření, že formulář nevyplňuje robot (zpracovává
          technické údaje prohlížeče a IP adresu).
        </li>
      </ul>
      <p>
        Poptávka zájemce se doručí trenérovi, kterému byl formulář určen (viz část 3). Trenér vidí údaje
        svých klientů; klienti jiného trenéra je nevidí.
      </p>

      <h2>6. Přeshraniční přenos</h2>
      <p>
        Někteří z výše uvedených poskytovatelů mohou zpracovávat data na serverech mimo Evropskou unii.
        V takovém případě se spoléháme na standardní smluvní doložky (Standard Contractual Clauses) nebo jiný
        odpovídající mechanismus podle GDPR, který mají tito poskytovatelé zavedený.
      </p>

      <h2>7. Jak dlouho údaje uchováváme</h2>
      <ul>
        <li>Údaje aktivního účtu uchováváme po celou dobu jeho existence.</li>
        <li>
          Pokud požádáš o smazání účtu (trenér i klient mají tuto možnost přímo v aplikaci), data natrvalo
          smažeme do 30 dní (ochranná lhůta, během které můžeš žádost zrušit).
        </li>
        <li>
          Účty, jejichž e-mail nebyl do 7 dnů ověřen a nikdo se do nich nikdy nepřihlásil, automaticky
          mažeme.
        </li>
        <li>
          <strong>Poptávky zájemců</strong> z veřejných stránek se automaticky mažou po 12 měsících od
          doručení; trenér je může smazat i dříve.
        </li>
        <li>
          <strong>Evidenci odeslaných e-mailů</strong> (nevratný hash adresy, čas, trenér) a záznam o
          týdenních shrnutích uchováváme jen po dobu nutnou k ochraně před zneužitím a k tomu, aby se
          e-mail neodeslal dvakrát. Adresy příjemců se v nich neukládají čitelně. Záznam o odhlášení
          z e-mailů uchováváme, dokud je třeba respektovat tvé odhlášení.
        </li>
        <li>
          <strong>Hash IP adresy</strong> u formuláře zájemce slouží jen k ochraně před zneužitím (nevratný
          hash, nikoli čitelná IP adresa) a uchováváme jej nejvýše po dobu uchování poptávky.
        </li>
        <li>
          <strong>Platební a účetní doklady</strong> (faktury a záznamy o platbách) uchováváme po zákonné
          lhůty pro uchovávání účetních dokladů (zpravidla 10 let); část těchto údajů uchovává také
          Stripe podle vlastních zákonných povinností.
        </li>
      </ul>

      <h2>8. Veřejné stránky a značka trenéra</h2>
      <p>
        Pokud má trenér veřejnou stránku (<code>/t/&lt;odkaz&gt;</code>) nebo zvací stránku (
        <code>/pozvanka/&lt;odkaz&gt;</code>), to, co tam zveřejní — jméno či název značky, popis,
        reference, logo a fotografie — je <strong>veřejně dostupné komukoli na internetu</strong> a může se
        zobrazit i ve vyhledávačích. Nahrané obrázky se ukládají ve veřejném úložišti a před uložením se
        z bezpečnostních důvodů překódují. Trenér odpovídá za to, aby zveřejňoval jen údaje, ke kterým má
        právo, a aby měl souhlas osob, které se na stránce objeví.
      </p>
      <p>
        Návštěva platné zvací stránky si na tvém zařízení zapamatuje pozvánku v cookie{" "}
        <code>fp_invite</code> (viz Cookies), aby se po registraci vědělo, ke kterému trenérovi se
        připojit.
      </p>

      <h2>9. E-maily a odhlášení</h2>
      <p>
        E-maily odesíláme z naší adresy přes server Websupport. Trenér může přes aplikaci poslat pozvánku
        na e-mailovou adresu, kterou zadá; za to, že jde o člověka, který pozvánku očekává, odpovídá
        trenér. Počet pozvánek omezujeme proti zneužití. Z pozvánek se můžeš odhlásit odkazem v e-mailu —
        další pozvánky ti už nepřijdou. Týdenní shrnutí můžeš vypnout v Profilu nebo odkazem v e-mailu
        (jedním kliknutím). Zprávy související s účtem a předplatným se posílají, dokud máš účet.
      </p>

      <h2>10. Gamifikace a žebříček</h2>
      <p>
        Úspěchy, osobní rekordy, odznaky a úrovně se počítají automaticky z tvých tréninkových údajů.
        Týdenní mise, odměny a úrovně se také počítají z tvých tréninkových údajů (tréninky, zápisy jídla,
        měření); výběr rámečku avataru, barvy portálu a přezdívky se ukládá k tvému účtu.
      </p>
      <p>
        Žebříček je <strong>celoaplikační</strong>: zobrazuje pořadí všech klientů aplikace (nejen klientů jednoho
        trenéra) podle počtu tréninků, série týdnů a rekordů. Ostatním klientům se zobrazí{" "}
        <strong>pouze tvá přezdívka</strong> (výchozí je křestní jméno a iniciála příjmení, např. „Jana N.“; vlastní
        přezdívku si můžeš kdykoli změnit) a číslo — nikdy příjmení, tvůj trenér, fotka ani údaje o váze či
        kaloriích. Právním základem je oprávněný zájem (motivace a srovnání výkonu mezi uživateli) a máš právo
        kdykoli vznést námitku: ze žebříčku se můžeš jedním klepnutím skrýt (opt-out) — pak v pořadí nejsi a žebříček
        ostatních nevidíš ani ty. Sdílecí karty (obrázky s tvými výsledky) se generují jen na tvou žádost;
        o jejich dalším šíření rozhoduješ ty.
      </p>

      <h2>11. Tvoje práva</h2>
      <p>Máš právo na:</p>
      <ul>
        <li>Přístup ke svým osobním údajům</li>
        <li>Opravu nesprávných údajů</li>
        <li>Výmaz údajů („právo být zapomenut“) — v aplikaci přímo dostupné, trenér i klient si mohou o výmaz požádat sami</li>
        <li>Přenositelnost údajů ve strojově čitelném formátu</li>
        <li>Vznesení námitky proti zpracování založenému na oprávněném zájmu</li>
        <li>Odvolání souhlasu kdykoli (tam, kde zpracování stojí na souhlasu) a odhlášení z e-mailů odkazem v e-mailu</li>
      </ul>
      <p>
        U poptávek zájemců (část 3) se se žádostí o přístup, opravu nebo výmaz obrať primárně na trenéra,
        kterému jsi formulář odeslal; můžeš se obrátit i na nás a pomůžeme ti.
      </p>
      <p>
        Svá práva můžeš uplatnit na <span className={styles.placeholder}>[kontaktní e-mail]</span>. Pokud
        si myslíš, že tvoje údaje zpracováváme nesprávně, máš právo podat stížnost u Úradu na ochranu
        osobných údajov Slovenskej republiky (
        <a href="https://dataprotection.gov.sk" target="_blank" rel="noopener noreferrer">dataprotection.gov.sk</a>
        ), případně u dozorového úřadu státu, ve kterém žiješ (v Česku Úřad pro ochranu osobních údajů,{" "}
        <a href="https://uoou.gov.cz" target="_blank" rel="noopener noreferrer">uoou.gov.cz</a>).
      </p>

      <h2>12. Cookies</h2>
      <p>
        Aplikace používá jen technické cookies nezbytné pro přihlášení a fungování (např. session cookie),
        pro zapamatování pozvánky (<code>fp_invite</code>) a pro zapamatování nastavení, která si sám zvolíš
        (jazyk, vzhled) — ty nevyžadují souhlas. Podrobnosti najdeš v{" "}
        <Link href="/cookies">Zásadách používání cookies</Link>.
      </p>
    </>
  );
}
