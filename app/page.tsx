import Link from "next/link";
import { LogoMark } from "./components/LogoMark";
import { RevealOnScroll } from "./components/RevealOnScroll";
import styles from "./page.module.css";

const ArrowIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
    <path
      d="M3 7.5h9M8 3l4.5 4.5L8 12"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const CheckIcon = ({ color, size = 16 }: { color: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path d="M3 8.5l3 3 7-7" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function LandingPage() {
  return (
    <>
      <RevealOnScroll />
      <header className={styles.header}>
        <div className={`${styles.wrap} ${styles.nav}`}>
          <Link href="/" className={styles.brand}>
            <LogoMark className={styles.logoMark} />
            FitPilot
          </Link>
          <nav className={styles.navLinks}>
            <a href="#funkcie" className={styles.navMobileHide}>
              Funkcie
            </a>
            <a href="#ai" className={styles.navMobileHide}>
              AI
            </a>
            <a href="#cennik" className={styles.navMobileHide}>
              Cenník
            </a>
            <Link href="/prihlasenie" className={styles.navMobileHide}>
              Prihlásiť sa
            </Link>
            <Link href="/prihlasenie" className={`btn btn-primary btn-sm ${styles.ctaBtn}`}>
              Vyskúšať zadarmo
              <ArrowIcon />
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className={styles.hero}>
          <div className={styles.plateField} aria-hidden="true" />
          <div className={`${styles.wrap} ${styles.heroGrid}`}>
            <div>
              <h1>
                Tréningy, výživa aj <span className={styles.accent}>AI kouč.</span>
                <br />
                Na jednom mieste.
              </h1>
              <p className={styles.heroSub}>
                FitPilot vedie klientov, tréningové plány aj jedálničky pre fitness trénerov na
                Slovensku a v Česku. AI robí návrhy a administratívu — posledné slovo má vždy
                tréner.
              </p>
              <div className={styles.heroCtas}>
                <a href="#cennik" className="btn btn-primary">
                  Začať 14-dňové skúšobné obdobie
                  <ArrowIcon />
                </a>
                <a href="#funkcie" className="btn btn-ghost">
                  Pozrieť ako to funguje ↓
                </a>
              </div>
              <p className={styles.heroNote}>Bez viazanosti počas skúšobného obdobia · SK/CZ rozhranie</p>
            </div>

            <div className={styles.demo} role="img" aria-label="Ukážka trénerského dashboardu s AI chatom">
              <div className={styles.demoTop}>
                <span className={styles.who}>
                  <span className={styles.dot} />
                  Dashboard — Martina K.
                </span>
                <span className="num" style={{ fontSize: 11, color: "var(--paper-faint)" }}>
                  UT 27. AUG
                </span>
              </div>
              <div className={styles.demoBody}>
                <div className={styles.roster}>
                  <div className={styles.rosterRow}>
                    <span className={styles.avatar}>JN</span>
                    <span>
                      <span className={styles.name}>Ján N.</span>
                      <br />
                      <span className={styles.meta}>Naberanie · deň 42</span>
                    </span>
                    <span className={`${styles.chip} ${styles.ok}`}>splnené</span>
                  </div>
                  <div className={styles.rosterRow}>
                    <span className={styles.avatar}>LK</span>
                    <span>
                      <span className={styles.name}>Lucia K.</span>
                      <br />
                      <span className={styles.meta}>Chudnutie · deň 15</span>
                    </span>
                    <span className={`${styles.chip} ${styles.warn}`}>3× vynechal log</span>
                  </div>
                </div>
                <div className={styles.aiThread}>
                  <div className={`${styles.bubble} ${styles.client}`}>
                    <span className={styles.tag}>Lucia · AI chat klienta</span>
                    Čo mám dnes zjesť, ak mi zostáva 400&nbsp;g bielkovín?
                  </div>
                  <div className={`${styles.bubble} ${styles.ai}`}>
                    <span className={styles.tag}>FitPilot AI</span>
                    Podľa tvojho jedálnička ešte chýba večera — 250&nbsp;g kuracích pŕs alebo
                    350&nbsp;g tvarohu ťa dostanú na cieľ.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.positionBand}>
          <div className={styles.wrap}>
            <div className={styles.positionGrid}>
              <div data-reveal className={styles.reveal}>
                <h2 style={{ fontSize: "clamp(1.9rem,3.2vw,2.7rem)", maxWidth: "14ch" }}>
                  Trénerský softvér, nie preklad z angličtiny
                </h2>
                <p style={{ marginTop: 16, color: "var(--paper-dim)", maxWidth: "46ch" }}>
                  Trainerize, Everfit či TrueCoach robia dobrú prácu — pre americký a britský trh.
                  FitPilot je stavaný rovno pre slovenských a českých trénerov, s výživou ako
                  plnohodnotnou súčasťou od prvého dňa, nie plateným doplnkom.
                </p>
              </div>
              <div data-reveal className={`${styles.positionList} ${styles.reveal}`}>
                <div className={styles.positionRow}>
                  <span className={styles.label}>Jazyk</span>
                  <div>
                    <div className={styles.them}>Rozhranie prevažne v angličtine</div>
                    <div className={styles.us}>Natívna slovenčina a čeština</div>
                  </div>
                </div>
                <div className={styles.positionRow}>
                  <span className={styles.label}>Výživa</span>
                  <div>
                    <div className={styles.them}>Orezaný, platený doplnok</div>
                    <div className={styles.us}>Súčasť produktu od základu</div>
                  </div>
                </div>
                <div className={styles.positionRow}>
                  <span className={styles.label}>AI</span>
                  <div>
                    <div className={styles.them}>Len generátor plánu na jedno použitie</div>
                    <div className={styles.us}>Chat s pamäťou klientovho profilu a histórie</div>
                  </div>
                </div>
                <div className={styles.positionRow}>
                  <span className={styles.label}>Cena</span>
                  <div>
                    <div className={styles.them}>Tiery a add-ony sa nabaľujú neprehľadne</div>
                    <div className={styles.us}>Jeden jasný plán, transparentný AI limit</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="funkcie" className={styles.section}>
          <div className={styles.wrap}>
            <div data-reveal className={`${styles.sectionHead} ${styles.reveal}`}>
              <h2>
                Šesť modulov,
                <br />
                jeden pracovný tok
              </h2>
              <p>Od prvého kontaktu s klientom až po faktúru — FitPilot pokrýva celý cyklus trénerskej práce.</p>
            </div>

            <div data-reveal className={`${styles.featureRow} ${styles.first} ${styles.reveal}`}>
              <div className={styles.featureCopy}>
                <span className={styles.iconTile}>
                  <svg className={styles.featureIcon} viewBox="0 0 48 48" fill="none" aria-hidden="true">
                    <circle cx="17" cy="15" r="6" stroke="var(--iron-red)" strokeWidth="2.2" />
                    <path d="M7 39c0-7 4.5-11 10-11s10 4 10 11" stroke="var(--iron-red)" strokeWidth="2.2" strokeLinecap="round" />
                    <circle cx="33" cy="18" r="4.5" stroke="var(--steel)" strokeWidth="2" />
                    <path d="M26 39c.5-5.5 3.5-9 8-9s7.3 3.2 8 8" stroke="var(--steel)" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </span>
                <h3>Správa klientov</h3>
                <p>
                  Databáza s kontaktmi, cieľmi a zdravotnými obmedzeniami. Onboarding formulár
                  zachytí vek, mieru, aktivitu aj alergie hneď na začiatku. História merania
                  sleduje váhu, obvody aj foto progres na jednom mieste.
                </p>
                <div className={styles.featureTags}>
                  <span>Onboarding formulár</span>
                  <span>História merania</span>
                  <span>Tagy klientov</span>
                </div>
              </div>
              <div className={styles.featureVisual}>
                <div className={styles.vizBiz}>
                  <div className={styles.bizRow}>
                    <span className={styles.name}>Ján N. · naberanie</span>
                    <span className={`${styles.status} ${styles.active}`}>● aktívny</span>
                    <span className={styles.amount}>posl. log dnes</span>
                  </div>
                  <div className={styles.bizRow}>
                    <span className={styles.name}>Lucia K. · chudnutie</span>
                    <span className={`${styles.status} ${styles.late}`}>● meškanie</span>
                    <span className={styles.amount}>posl. log pred 4d</span>
                  </div>
                  <div className={styles.bizRow}>
                    <span className={styles.name}>Peter S. · rehab kolena</span>
                    <span className={`${styles.status} ${styles.active}`}>● aktívny</span>
                    <span className={styles.amount}>posl. log dnes</span>
                  </div>
                  <div className={styles.bizRow}>
                    <span className={styles.name}>Zuzana H. · naberanie</span>
                    <span className={`${styles.status} ${styles.active}`}>● aktívny</span>
                    <span className={styles.amount}>posl. log včera</span>
                  </div>
                </div>
              </div>
            </div>

            <div data-reveal className={`${styles.featureRow} ${styles.reverse} ${styles.reveal}`}>
              <div className={styles.featureCopy}>
                <span className={styles.iconTile}>
                  <svg className={styles.featureIcon} viewBox="0 0 48 48" fill="none" aria-hidden="true">
                    <path d="M6 24h4M38 24h4M13 24h22" stroke="var(--iron-red)" strokeWidth="2.4" strokeLinecap="round" />
                    <rect x="9" y="17" width="4" height="14" rx="1" fill="var(--iron-red)" />
                    <rect x="35" y="17" width="4" height="14" rx="1" fill="var(--iron-red)" />
                    <rect x="4" y="19" width="3" height="10" rx="1" fill="var(--steel)" />
                    <rect x="41" y="19" width="3" height="10" rx="1" fill="var(--steel)" />
                  </svg>
                </span>
                <h3>Tréningový builder</h3>
                <p>
                  Knižnica cvikov s videom aj technikou. Zostav plán so sériami, opakovaniami,
                  záťažou, tempom a pauzami a zaraď ho klientovi podľa dní a týždňov. FitPilot
                  navrhne progresívne preťaženie na základe odcvičenej histórie.
                </p>
                <div className={styles.featureTags}>
                  <span>Knižnica cvikov</span>
                  <span>Mezocykly</span>
                  <span>Progresívne preťaženie</span>
                </div>
              </div>
              <div className={styles.featureVisual}>
                <div className={styles.vizBuilder}>
                  <div className={styles.vizSet}>
                    <span className={styles.idx}>A1</span>
                    <span className={styles.exName}>Drep s činkou</span>
                    <span className={styles.load}>
                      4× 8 @ 82,5<span className="stencil"> kg</span>
                    </span>
                    <span className={styles.rest}>pauza 120s</span>
                  </div>
                  <div className={styles.vizSet}>
                    <span className={styles.idx}>A2</span>
                    <span className={styles.exName}>Rumunský mŕtvy ťah</span>
                    <span className={styles.load}>
                      3× 10 @ 60<span className="stencil"> kg</span>
                    </span>
                    <span className={styles.rest}>pauza 90s</span>
                  </div>
                  <div className={styles.vizSet}>
                    <span className={styles.idx}>B1</span>
                    <span className={styles.exName}>Bulharský drep</span>
                    <span className={styles.load}>
                      3× 12 @ 20<span className="stencil"> kg</span>
                    </span>
                    <span className={styles.rest}>pauza 75s</span>
                  </div>
                  <div className={styles.vizSet}>
                    <span className={styles.idx}>B2</span>
                    <span className={styles.exName}>Lýtka v stoji</span>
                    <span className={styles.load}>
                      4× 15 @ 100<span className="stencil"> kg</span>
                    </span>
                    <span className={styles.rest}>pauza 60s</span>
                  </div>
                </div>
              </div>
            </div>

            <div data-reveal className={`${styles.featureRow} ${styles.reveal}`}>
              <div className={styles.featureCopy}>
                <span className={styles.iconTile}>
                  <svg className={styles.featureIcon} viewBox="0 0 48 48" fill="none" aria-hidden="true">
                    <path
                      d="M24 6c9 0 15 6.5 15 15 0 9.5-8 16-15 16-2.7 0-5.2-.6-7.4-1.7L8 39l3.6-8.5C9.3 27.4 9 23.7 9 21 9 12.5 15 6 24 6Z"
                      stroke="var(--plate-yellow)"
                      strokeWidth="2.2"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M17 20c1.5-3 3.5-4 5-2 1.2 1.6-.4 3-1 4.2-.7 1.4.4 2.8 2 2.8 1.8 0 3.3-1.6 4.5-3.3"
                      stroke="var(--plate-yellow)"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <h3>Výživa a makrá</h3>
                <p>
                  Automatický výpočet BMR/TDEE navrhne makrá podľa cieľa klienta. Tréner zostaví
                  jedálniček alebo nastaví len kalorický cieľ — klient loguje stravu a vidí
                  plnenie makier deň za dňom.
                </p>
                <div className={styles.featureTags}>
                  <span>BMR/TDEE výpočet</span>
                  <span>Food diary</span>
                  <span>Grafy plnenia</span>
                </div>
              </div>
              <div className={styles.featureVisual}>
                <div className={styles.vizMacros}>
                  <div className={styles.macroBarRow}>
                    <div className={styles.macroTop}>
                      <span>Bielkoviny</span>
                      <span className={styles.macroVal}>156 / 200 g</span>
                    </div>
                    <div className={styles.macroTrack}>
                      <div className={`${styles.macroFill} ${styles.protein}`} style={{ width: "78%" }} />
                    </div>
                  </div>
                  <div className={styles.macroBarRow}>
                    <div className={styles.macroTop}>
                      <span>Sacharidy</span>
                      <span className={styles.macroVal}>130 / 240 g</span>
                    </div>
                    <div className={styles.macroTrack}>
                      <div className={`${styles.macroFill} ${styles.carbs}`} style={{ width: "54%" }} />
                    </div>
                  </div>
                  <div className={styles.macroBarRow}>
                    <div className={styles.macroTop}>
                      <span>Tuky</span>
                      <span className={styles.macroVal}>63 / 70 g</span>
                    </div>
                    <div className={styles.macroTrack}>
                      <div className={`${styles.macroFill} ${styles.fat}`} style={{ width: "90%" }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div data-reveal className={`${styles.featureRow} ${styles.reverse} ${styles.reveal}`}>
              <div className={styles.featureCopy}>
                <span className={styles.iconTile}>
                  <svg className={styles.featureIcon} viewBox="0 0 48 48" fill="none" aria-hidden="true">
                    <path d="M6 12h30v18H18l-8 7v-7H6V12Z" stroke="var(--steel)" strokeWidth="2.2" strokeLinejoin="round" />
                    <path d="M18 6h24v18h-6v6l-7-6" stroke="var(--iron-red)" strokeWidth="2.2" strokeLinejoin="round" />
                  </svg>
                </span>
                <h3>Komunikácia</h3>
                <p>
                  Chat medzi trénerom a klientom priamo v appke, notifikácie na pripomienky
                  tréningu a spätná väzba po tréningu — RPE, pocit, poznámka — bez presúvania sa
                  do WhatsAppu či mailu.
                </p>
                <div className={styles.featureTags}>
                  <span>Chat</span>
                  <span>Notifikácie</span>
                  <span>RPE feedback</span>
                </div>
              </div>
              <div className={styles.featureVisual}>
                <div className={styles.vizChat}>
                  <div className={`${styles.bubble} ${styles.client}`} style={{ maxWidth: "80%" }}>
                    <span className={styles.tag}>Peter · klient</span>
                    Bolí ma rameno pri bench presse, čo mám robiť?
                  </div>
                  <div
                    className={styles.bubble}
                    style={{ maxWidth: "80%", background: "var(--ink)", border: "1px solid var(--steel-line)" }}
                  >
                    <span className={styles.tag}>Tréner · Martina</span>
                    Dnes vynechaj tlaky nad hlavu, napíšem ti náhradné cviky do 18:00.
                  </div>
                </div>
              </div>
            </div>

            <div data-reveal className={`${styles.featureRow} ${styles.reveal}`}>
              <div className={styles.featureCopy}>
                <span className={styles.iconTile}>
                  <svg className={styles.featureIcon} viewBox="0 0 48 48" fill="none" aria-hidden="true">
                    <path d="M6 40V10M6 40h36" stroke="var(--steel)" strokeWidth="2.2" strokeLinecap="round" />
                    <path d="M11 32l8-10 7 6 12-16" stroke="var(--iron-red)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="38" cy="12" r="2.6" fill="var(--iron-red)" />
                  </svg>
                </span>
                <h3>Progres tracking</h3>
                <p>
                  Grafy vývoja váhy, odhadovaného 1RM a obvodov. Porovnanie fotiek pred/po a
                  automatické týždenné či mesačné reporty, ktoré tréner nemusí písať ručne.
                </p>
                <div className={styles.featureTags}>
                  <span>Grafy sily</span>
                  <span>Foto porovnanie</span>
                  <span>Automatické reporty</span>
                </div>
              </div>
              <div className={styles.featureVisual}>
                <div className={styles.vizChart}>
                  <svg viewBox="0 0 280 110" preserveAspectRatio="none">
                    <line x1="0" y1="27.5" x2="280" y2="27.5" stroke="var(--steel-line)" strokeWidth="1" />
                    <line x1="0" y1="55" x2="280" y2="55" stroke="var(--steel-line)" strokeWidth="1" />
                    <line x1="0" y1="82.5" x2="280" y2="82.5" stroke="var(--steel-line)" strokeWidth="1" />
                    <polyline
                      points="0,90 40,84 80,78 120,68 160,60 200,45 240,38 280,22"
                      fill="none"
                      stroke="var(--iron-red)"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <circle cx="280" cy="22" r="4" fill="var(--iron-red)" />
                  </svg>
                  <div className={styles.readout}>
                    <span>1RM drep · 12 týždňov</span>
                    <span className={styles.readoutNum}>
                      82,5 → <span style={{ color: "var(--iron-red)" }}>102,5 kg</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div data-reveal className={`${styles.featureRow} ${styles.reverse} ${styles.reveal}`}>
              <div className={styles.featureCopy}>
                <span className={styles.iconTile}>
                  <svg className={styles.featureIcon} viewBox="0 0 48 48" fill="none" aria-hidden="true">
                    <rect x="6" y="16" width="36" height="24" rx="2" stroke="var(--plate-yellow)" strokeWidth="2.2" />
                    <path d="M17 16v-4a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v4" stroke="var(--plate-yellow)" strokeWidth="2.2" />
                    <path d="M6 24h36" stroke="var(--plate-yellow)" strokeWidth="2.2" />
                  </svg>
                </span>
                <h3>Biznis vrstva</h3>
                <p>
                  Kalendár a rezervácie konzultácií, fakturácia a platby cez Stripe, balíčky
                  služieb a multi-klient dashboard — okamžite vidíš, kto má aktívny plán a kto
                  zaostáva s logovaním.
                </p>
                <div className={styles.featureTags}>
                  <span>Kalendár rezervácií</span>
                  <span>Stripe fakturácia</span>
                  <span>Multi-klient prehľad</span>
                </div>
              </div>
              <div className={styles.featureVisual}>
                <div className={styles.vizMacros}>
                  <div className={styles.macroBarRow}>
                    <div className={styles.macroTop}>
                      <span>Aktívni klienti tento mesiac</span>
                      <span className={styles.macroVal}>27 / 30</span>
                    </div>
                    <div className={styles.macroTrack}>
                      <div className={`${styles.macroFill} ${styles.fat}`} style={{ width: "90%" }} />
                    </div>
                  </div>
                  <div className={styles.macroBarRow}>
                    <div className={styles.macroTop}>
                      <span>Zaplatené predplatné</span>
                      <span className={styles.macroVal}>24 / 27</span>
                    </div>
                    <div className={styles.macroTrack}>
                      <div className={`${styles.macroFill} ${styles.protein}`} style={{ width: "89%" }} />
                    </div>
                  </div>
                  <div className={styles.macroBarRow}>
                    <div className={styles.macroTop}>
                      <span>AI requesty využité</span>
                      <span className={styles.macroVal}>312 / 500</span>
                    </div>
                    <div className={styles.macroTrack}>
                      <div className={`${styles.macroFill} ${styles.carbs}`} style={{ width: "62%" }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="ai" className={`${styles.section} ${styles.aiSection}`}>
          <div className={styles.wrap}>
            <div data-reveal className={`${styles.sectionHead} ${styles.reveal}`}>
              <h2>
                AI, ktorá pozná
                <br />
                kontext klienta
              </h2>
              <p>
                Žiadny generický chatbot. FitPilot AI vidí profil, aktuálny plán, makrá a
                posledné logy — a odpovedá na základe nich, nie všeobecných rád z internetu.
              </p>
            </div>

            <div className={styles.aiColumns}>
              <div data-reveal className={`${styles.aiCard} ${styles.reveal}`}>
                <h3>Pre klienta</h3>
                <p>Asistent v appke, ktorý pozná jeho históriu a odpovedá v kontexte.</p>
                <ul>
                  <li>
                    <CheckIcon color="var(--plate-yellow)" />
                    „Čo mám dnes jesť, ak mi zostáva 400 g bielkovín?“
                  </li>
                  <li>
                    <CheckIcon color="var(--plate-yellow)" />
                    „Bolí ma rameno pri bench presse, čo robiť?“ → AI odporučí kontaktovať trénera,
                    nediagnostikuje.
                  </li>
                  <li>
                    <CheckIcon color="var(--plate-yellow)" />
                    História konverzácie sa ukladá per klient — AI si pamätá kontext naprieč
                    session.
                  </li>
                </ul>
              </div>
              <div data-reveal className={`${styles.aiCard} ${styles.reveal}`}>
                <h3>Pre trénera</h3>
                <p>Nástroj na produktivitu, nie autopilot — tréner návrh vždy skontroluje a upraví.</p>
                <ul>
                  <li>
                    <CheckIcon color="var(--iron-red)" />
                    „Vygeneruj 4-týždňový silový plán pre Jána na nabratie svalovej hmoty.“
                  </li>
                  <li>
                    <CheckIcon color="var(--iron-red)" />
                    „Klient má bolesť kolena — uprav plán a vynechaj drepy.“
                  </li>
                  <li>
                    <CheckIcon color="var(--iron-red)" />
                    Upozornenie: „Lucia 3× nesplnila tréning tento týždeň.“ — skôr než sa stane
                    problém.
                  </li>
                </ul>
              </div>
            </div>

            <div data-reveal className={`${styles.trustBanner} ${styles.reveal}`}>
              <svg width="34" height="34" viewBox="0 0 34 34" fill="none" aria-hidden="true">
                <path
                  d="M17 3 5 8v8c0 8 5 13.5 12 15 7-1.5 12-7 12-15V8L17 3Z"
                  stroke="var(--iron-red)"
                  strokeWidth="2.2"
                  strokeLinejoin="round"
                />
                <path d="M11 17l4 4 8-9" stroke="var(--iron-red)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div>
                <h4>Tréner má vždy posledné slovo</h4>
                <p>
                  AI návrh sa nikdy neposiela klientovi automaticky. Zdravotné témy a bolesť sú
                  tvrdá hranica — appka eskaluje na trénera, nediagnostikuje.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="cennik" className={styles.section}>
          <div className={styles.wrap}>
            <div data-reveal className={`${styles.sectionHead} ${styles.reveal}`}>
              <h2>
                Predplatné pre trénera,
                <br />
                nie pre každého klienta
              </h2>
              <p>Platíš ty ako tréner, mesačne. Klienti platia teba, nie appku.</p>
            </div>
            <span data-reveal className={`${styles.pricingNote} ${styles.reveal}`}>
              <span className={styles.dot} />
              orientačný cenník pre spustenie — ceny sa môžu do launchu upraviť
            </span>

            <div data-reveal className={`${styles.pricingGrid} ${styles.reveal}`}>
              <div className={styles.priceCard}>
                <div className={styles.tier}>Starter</div>
                <div className={styles.for}>do 10 klientov</div>
                <div className={styles.priceRow}>
                  <span className={styles.priceNum}>15–20&nbsp;€</span>
                  <span className={styles.pricePer}>/ mes</span>
                </div>
                <ul>
                  <li>
                    <CheckIcon color="var(--steel)" size={14} />
                    Tréningový builder a plány
                  </li>
                  <li>
                    <CheckIcon color="var(--steel)" size={14} />
                    Jedálničky a food diary
                  </li>
                  <li>
                    <CheckIcon color="var(--steel)" size={14} />
                    Základný dashboard
                  </li>
                </ul>
                <Link href="/prihlasenie#register" className={`btn btn-ghost ${styles.priceCta}`}>
                  Vybrať Starter
                </Link>
              </div>
              <div className={`${styles.priceCard} ${styles.featured}`}>
                <div className={styles.tier}>Pro</div>
                <div className={styles.for}>do 50 klientov</div>
                <div className={styles.priceRow}>
                  <span className={styles.priceNum}>40–50&nbsp;€</span>
                  <span className={styles.pricePer}>/ mes</span>
                </div>
                <ul>
                  <li>
                    <CheckIcon color="var(--iron-red)" size={14} />
                    Všetko zo Starter
                  </li>
                  <li>
                    <CheckIcon color="var(--iron-red)" size={14} />
                    AI chat pre klientov
                  </li>
                  <li>
                    <CheckIcon color="var(--iron-red)" size={14} />
                    AI generátor plánov pre trénera
                  </li>
                </ul>
                <Link href="/prihlasenie#register" className={`btn btn-primary ${styles.priceCta}`}>
                  Vybrať Pro
                  <ArrowIcon />
                </Link>
              </div>
              <div className={styles.priceCard}>
                <div className={styles.tier}>Business</div>
                <div className={styles.for}>neobmedzene klientov</div>
                <div className={styles.priceRow}>
                  <span className={styles.priceNum}>80–100&nbsp;€</span>
                  <span className={styles.pricePer}>/ mes</span>
                </div>
                <ul>
                  <li>
                    <CheckIcon color="var(--steel)" size={14} />
                    Všetko z Pro
                  </li>
                  <li>
                    <CheckIcon color="var(--steel)" size={14} />
                    Biele logo / branding appky
                  </li>
                  <li>
                    <CheckIcon color="var(--steel)" size={14} />
                    Pokročilé reporty
                  </li>
                </ul>
                <Link href="/prihlasenie#register" className={`btn btn-ghost ${styles.priceCta}`}>
                  Vybrať Business
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.wrap}>
            <div data-reveal className={`${styles.sectionHead} ${styles.reveal}`}>
              <h2>Ako sa appka bude stavať</h2>
              <p>Tri fázy, od jadra po plnú výbavu — poradie tu nesie skutočný plán, nie dekoráciu.</p>
            </div>
            <div data-reveal className={styles.reveal}>
              <div className={`${styles.phaseRow} ${styles.first} ${styles.current}`}>
                <div className={`${styles.phaseNum} stencil`}>01</div>
                <div>
                  <h4>MVP</h4>
                  <p>
                    Klienti · tréningový builder · zaraďovanie plánov · food/makro tracking ·
                    základný dashboard · AI chat pre klienta · AI generátor plánov pre trénera
                  </p>
                </div>
              </div>
              <div className={styles.phaseRow}>
                <div className={`${styles.phaseNum} stencil`}>02</div>
                <div>
                  <h4>Fáza 2</h4>
                  <p>
                    Chat tréner ↔ klient, notifikácie, progres grafy, knižnica cvikov s videami,
                    AI upozornenia na adherenciu
                  </p>
                </div>
              </div>
              <div className={styles.phaseRow}>
                <div className={`${styles.phaseNum} stencil`}>03</div>
                <div>
                  <h4>Fáza 3</h4>
                  <p>
                    Platby a predplatné, kalendár rezervácií, pokročilé reporty, mobilná
                    optimalizácia / PWA, white-label branding
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.finalCta}>
          <div className={`${styles.wrap} ${styles.finalCtaInner}`}>
            <div data-reveal className={styles.reveal}>
              <div className="bar-rule red" style={{ marginBottom: 18 }}>
                <span className="plate" />
                <span className="bar" />
              </div>
              <h2>
                Zdvihni administratívu
                <br />
                zo svojich pliec.
              </h2>
              <p>14 dní zadarmo, bez viazanosti. Nastavenie klientov trvá menej ako obed.</p>
            </div>
            <Link href="/prihlasenie#register" className="btn btn-primary" style={{ alignSelf: "center" }}>
              Začať skúšobné obdobie
              <ArrowIcon />
            </Link>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.wrap}>
          <div className={styles.footGrid}>
            <div className={styles.brand}>
              <LogoMark className={styles.logoMark} />
              FitPilot
            </div>
            <div className={styles.footLinks}>
              <a href="#funkcie">Funkcie</a>
              <a href="#ai">AI</a>
              <a href="#cennik">Cenník</a>
              <a href="#">Kontakt</a>
            </div>
          </div>
          <p className={styles.fine}>
            FitPilot je koncept pre slovenský a český trh fitness trénerov. Zobrazené dáta
            klientov, tréningov a cien sú ilustračné ukážky produktu, nie reálne referencie.
          </p>
        </div>
      </footer>
    </>
  );
}
