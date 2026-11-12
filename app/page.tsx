import Link from "next/link";
import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { intlLocale } from "@/lib/i18n/locales";
import { LogoMark } from "./components/LogoMark";
import { RevealOnScroll } from "./components/RevealOnScroll";
import { StickyMobileCta } from "./components/StickyMobileCta";
import { ThemeToggle } from "./v6design/ThemeToggle";
import { LanguageToggle } from "./v6design/LanguageToggle";
import { V6_THEME_COOKIE, parseV6Theme, v6ThemeColor } from "./v6design/theme";
import tokens from "./v6design/styles/tokens.module.css";
import styles from "./page.module.css";

// feature/security#2 — vlastný title/description namiesto globálneho defaultu
// z layout.tsx (ten ostáva fallback pre stránky bez vlastného exportu).
// Kľúčové slová podľa PRODUCT.md Positioning — SK trh, natívny nástroj pre
// fitness trénerov, nutrícia ako core funkcia, AI s kontextovou pamäťou.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("landing");
  return {
  // Plain string title PREPÍŠE title.template z layout.tsx (Next metadata
  // dedičnosť) — brand meno musí byť tu explicitne, nie spoliehať sa na
  // template. Zistené e2e sadou (test na /FitPilot/i v <title> zlyhal).
  title: t("metaTitle"),
  description: t("metaDescription"),
  // feature/optimalizacia (SEO) — canonical na "/" zabraňuje tomu, aby Google
  // indexoval túto stránku duplicitne pod query parametrami (napr. ?utm_...
  // z reklamných kampaní) ako samostatnú URL. Bez toho hrozí "duplicate
  // content" penalizácia a rozriedenie rankingu medzi variantmi tej istej URL.
  alternates: { canonical: "/" },
  };
}

/** Farba stavového riadku podľa témy (svetlá/tmavá/auto) — rovnako ako prihlásenie a appka. */
export async function generateViewport(): Promise<Viewport> {
  return { themeColor: v6ThemeColor(parseV6Theme((await cookies()).get(V6_THEME_COOKIE)?.value)) };
}

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

// feature/optimalizacia (SEO/GEO) — JSON-LD štruktúrované dáta. Klasické SEO
// ich používa na rich snippets vo výsledkoch vyhľadávania; pre GEO (AI
// vyhľadávače/asistenti ako Perplexity, ChatGPT search) sú dôležitejšie než
// pre Google — LLM pri odpovedi uprednostní strojovo čitateľný fakt (názov,
// kategória, cena, cieľová skupina) pred parafrázovaním voľného textu.
// `offers.price: "0"` odkazuje na skúšobné obdobie (14 dní zadarmo), nie na
// trvalo bezplatný produkt — placená fáza (PRODUCT.md fáza 3) zatiaľ nemá
// zverejnený cenník, preto sa sem nevymýšľa konkrétna suma.
async function StructuredData() {
  const [t, locale] = await Promise.all([getTranslations("landing"), getLocale()]);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://myfitpilot.sk";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "FitPilot",
    url: siteUrl,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: t("ldDescription"),
    inLanguage: intlLocale(locale),
    audience: {
      "@type": "Audience",
      audienceType: t("ldAudience"),
    },
    areaServed: ["SK", "CZ"],
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "EUR",
      description: t("ldOffer"),
    },
  };
  return (
    <script
      type="application/ld+json"
      // JSON.stringify je tu bezpečný — objekt je statický literál definovaný
      // vyššie, žiadny užívateľský vstup doň nevstupuje.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

/* Landing v dizajne v6 (tokeny app/v6design/styles/tokens.module.css): teplé svetlo v pozadí,
   sklenené karty, terakotové akcie, svetlá/tmavá/auto téma z cookie spoločnej s appkou
   (ikona slnko/mesiac v hlavičke ju prepína). */
export default async function LandingPage() {
  const [cookieStore, t] = await Promise.all([cookies(), getTranslations("landing")]);
  const theme = parseV6Theme(cookieStore.get(V6_THEME_COOKIE)?.value);
  // t.rich: zalomenie riadku a zvýraznenie v nadpisoch (<br></br>, <accent>…</accent>)
  const rich = {
    br: () => <br />,
    accent: (chunks: React.ReactNode) => <span className={styles.accent}>{chunks}</span>,
  };
  return (
    <div className={tokens.root} data-theme={theme} data-v6-root="">
      <StructuredData />
      <RevealOnScroll />
      <header className={styles.header}>
        <div className={`${styles.wrap} ${styles.nav}`}>
          <Link href="/" className={styles.brand}>
            <LogoMark className={styles.logoMark} />
            FitPilot
          </Link>
          <nav className={styles.navLinks}>
            <a href="#funkcie" className={styles.navMobileHide}>
              {t("nav.features")}
            </a>
            <a href="#ai" className={styles.navMobileHide}>
              {t("nav.ai")}
            </a>
            <a href="#cennik" className={styles.navMobileHide}>
              {t("nav.pricing")}
            </a>
            <Link href="/prihlasenie" className={styles.navMobileHide}>
              {t("nav.login")}
            </Link>
            <Link href="/prihlasenie" className={`btn btn-primary btn-sm ${styles.ctaBtn}`}>
              {t("nav.tryFree")}
              <ArrowIcon />
            </Link>
            <LanguageToggle />
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main>
        <section className={styles.hero}>
          <div className={styles.plateField} aria-hidden="true" />
          <div className={`${styles.wrap} ${styles.heroGrid}`}>
            <div>
              <h1>{t.rich("hero.title", rich)}</h1>
              <p className={styles.heroSub}>{t("hero.sub")}</p>
              <div className={styles.heroCtas}>
                <a href="/prihlasenie" className="btn btn-primary">
                  {t("hero.ctaTrial")}
                  <ArrowIcon />
                </a>
                <a href="#funkcie" className="btn btn-ghost">
                  {t("hero.ctaHow")}
                </a>
              </div>
              <p className={styles.heroNote}>{t("hero.note")}</p>
            </div>

            <div className={styles.demo} role="img" aria-label={t("hero.demoLabel")}>
              <div className={styles.demoTop}>
                <span className={styles.who}>
                  <span className={styles.dot} />
                  {t("hero.demoWho")}
                </span>
                {/* feature/optimalizacia (Lighthouse a11y) — --paper-faint na tomto tmavom
                    pozadí (.demoTop) dávala len 4.45:1, tesne pod požadovaných 4.5:1.
                    --paper-dim je na rovnakom pozadí ~9.4:1, bezpečná rezerva. */}
                <span className="num" style={{ fontSize: 11, color: "var(--paper-dim)" }}>
                  {t("hero.demoDate")}
                </span>
              </div>
              <div className={styles.demoBody}>
                <div className={styles.roster}>
                  <div className={styles.rosterRow}>
                    <span className={styles.avatar}>JN</span>
                    <span>
                      <span className={styles.name}>{t("hero.demoJan")}</span>
                      <br />
                      <span className={styles.meta}>{t("hero.demoJanMeta")}</span>
                    </span>
                    <span className={`${styles.chip} ${styles.ok}`}>{t("hero.demoDone")}</span>
                  </div>
                  <div className={styles.rosterRow}>
                    <span className={styles.avatar}>LK</span>
                    <span>
                      <span className={styles.name}>{t("hero.demoLucia")}</span>
                      <br />
                      <span className={styles.meta}>{t("hero.demoLuciaMeta")}</span>
                    </span>
                    <span className={`${styles.chip} ${styles.warn}`}>{t("hero.demoMissed")}</span>
                  </div>
                </div>
                <div className={styles.aiThread}>
                  <div className={`${styles.bubble} ${styles.client}`}>
                    <span className={styles.tag}>{t("hero.demoClientTag")}</span>
                    {t("hero.demoClientMsg")}
                  </div>
                  <div className={`${styles.bubble} ${styles.ai}`}>
                    <span className={styles.tag}>FitPilot AI</span>
                    {t("hero.demoAiMsg")}
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
                <h2 style={{ fontSize: "clamp(1.9rem,3.2vw,2.7rem)", maxWidth: "14ch" }}>{t("position.title")}</h2>
                <p style={{ marginTop: 16, color: "var(--paper-dim)", maxWidth: "46ch" }}>{t("position.text")}</p>
              </div>
              <div data-reveal className={`${styles.positionList} ${styles.reveal}`}>
                <div className={styles.positionRow}>
                  <span className={styles.label}>{t("position.language")}</span>
                  <div>
                    <div className={styles.them}>{t("position.languageThem")}</div>
                    <div className={styles.us}>{t("position.languageUs")}</div>
                  </div>
                </div>
                <div className={styles.positionRow}>
                  <span className={styles.label}>{t("position.nutrition")}</span>
                  <div>
                    <div className={styles.them}>{t("position.nutritionThem")}</div>
                    <div className={styles.us}>{t("position.nutritionUs")}</div>
                  </div>
                </div>
                <div className={styles.positionRow}>
                  <span className={styles.label}>{t("position.ai")}</span>
                  <div>
                    <div className={styles.them}>{t("position.aiThem")}</div>
                    <div className={styles.us}>{t("position.aiUs")}</div>
                  </div>
                </div>
                <div className={styles.positionRow}>
                  <span className={styles.label}>{t("position.price")}</span>
                  <div>
                    <div className={styles.them}>{t("position.priceThem")}</div>
                    <div className={styles.us}>{t("position.priceUs")}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="funkcie" className={styles.section}>
          <div className={styles.wrap}>
            <div data-reveal className={`${styles.sectionHead} ${styles.reveal}`}>
              <h2>{t.rich("features.title", rich)}</h2>
              <p>{t("features.sub")}</p>
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
                <h3>{t("features.clientsTitle")}</h3>
                <p>{t("features.clientsText")}</p>
                <div className={styles.featureTags}>
                  <span>{t("features.clientsTag1")}</span>
                  <span>{t("features.clientsTag2")}</span>
                  <span>{t("features.clientsTag3")}</span>
                </div>
              </div>
              <div className={styles.featureVisual}>
                <div className={styles.vizBiz}>
                  <div className={styles.bizRow}>
                    <span className={styles.name}>{t("features.bizJan")}</span>
                    <span className={`${styles.status} ${styles.active}`}>{t("features.statusActive")}</span>
                    <span className={styles.amount}>{t("features.lastLogToday")}</span>
                  </div>
                  <div className={styles.bizRow}>
                    <span className={styles.name}>{t("features.bizLucia")}</span>
                    <span className={`${styles.status} ${styles.late}`}>{t("features.statusLate")}</span>
                    <span className={styles.amount}>{t("features.lastLog4d")}</span>
                  </div>
                  <div className={styles.bizRow}>
                    <span className={styles.name}>{t("features.bizPeter")}</span>
                    <span className={`${styles.status} ${styles.active}`}>{t("features.statusActive")}</span>
                    <span className={styles.amount}>{t("features.lastLogToday")}</span>
                  </div>
                  <div className={styles.bizRow}>
                    <span className={styles.name}>{t("features.bizZuzana")}</span>
                    <span className={`${styles.status} ${styles.active}`}>{t("features.statusActive")}</span>
                    <span className={styles.amount}>{t("features.lastLogYesterday")}</span>
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
                <h3>{t("features.builderTitle")}</h3>
                <p>{t("features.builderText")}</p>
                <div className={styles.featureTags}>
                  <span>{t("features.builderTag1")}</span>
                  <span>{t("features.builderTag2")}</span>
                  <span>{t("features.builderTag3")}</span>
                </div>
              </div>
              <div className={styles.featureVisual}>
                <div className={styles.vizBuilder}>
                  <div className={styles.vizSet}>
                    <span className={styles.idx}>A1</span>
                    <span className={styles.exName}>{t("features.exSquat")}</span>
                    <span className={styles.load}>
                      4× 8 @ 82,5<span className="stencil"> kg</span>
                    </span>
                    <span className={styles.rest}>{t("features.rest", { seconds: 120 })}</span>
                  </div>
                  <div className={styles.vizSet}>
                    <span className={styles.idx}>A2</span>
                    <span className={styles.exName}>{t("features.exRdl")}</span>
                    <span className={styles.load}>
                      3× 10 @ 60<span className="stencil"> kg</span>
                    </span>
                    <span className={styles.rest}>{t("features.rest", { seconds: 90 })}</span>
                  </div>
                  <div className={styles.vizSet}>
                    <span className={styles.idx}>B1</span>
                    <span className={styles.exName}>{t("features.exBulgarian")}</span>
                    <span className={styles.load}>
                      3× 12 @ 20<span className="stencil"> kg</span>
                    </span>
                    <span className={styles.rest}>{t("features.rest", { seconds: 75 })}</span>
                  </div>
                  <div className={styles.vizSet}>
                    <span className={styles.idx}>B2</span>
                    <span className={styles.exName}>{t("features.exCalves")}</span>
                    <span className={styles.load}>
                      4× 15 @ 100<span className="stencil"> kg</span>
                    </span>
                    <span className={styles.rest}>{t("features.rest", { seconds: 60 })}</span>
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
                <h3>{t("features.nutritionTitle")}</h3>
                <p>{t("features.nutritionText")}</p>
                <div className={styles.featureTags}>
                  <span>{t("features.nutritionTag1")}</span>
                  <span>{t("features.nutritionTag2")}</span>
                  <span>{t("features.nutritionTag3")}</span>
                </div>
              </div>
              <div className={styles.featureVisual}>
                <div className={styles.vizMacros}>
                  <div className={styles.macroBarRow}>
                    <div className={styles.macroTop}>
                      <span>{t("features.protein")}</span>
                      <span className={styles.macroVal}>156 / 200 g</span>
                    </div>
                    <div className={styles.macroTrack}>
                      <div className={`${styles.macroFill} ${styles.protein}`} style={{ width: "78%" }} />
                    </div>
                  </div>
                  <div className={styles.macroBarRow}>
                    <div className={styles.macroTop}>
                      <span>{t("features.carbs")}</span>
                      <span className={styles.macroVal}>130 / 240 g</span>
                    </div>
                    <div className={styles.macroTrack}>
                      <div className={`${styles.macroFill} ${styles.carbs}`} style={{ width: "54%" }} />
                    </div>
                  </div>
                  <div className={styles.macroBarRow}>
                    <div className={styles.macroTop}>
                      <span>{t("features.fat")}</span>
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
                <h3>{t("features.chatTitle")}</h3>
                <p>{t("features.chatText")}</p>
                <div className={styles.featureTags}>
                  <span>{t("features.chatTag1")}</span>
                  <span>{t("features.chatTag2")}</span>
                  <span>{t("features.chatTag3")}</span>
                </div>
              </div>
              <div className={styles.featureVisual}>
                <div className={styles.vizChat}>
                  <div className={`${styles.bubble} ${styles.client}`} style={{ maxWidth: "80%" }}>
                    <span className={styles.tag}>{t("features.chatClientTag")}</span>
                    {t("features.chatClientMsg")}
                  </div>
                  <div className={`${styles.bubble} ${styles.trainer}`} style={{ maxWidth: "80%" }}>
                    <span className={styles.tag}>{t("features.chatTrainerTag")}</span>
                    {t("features.chatTrainerMsg")}
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
                <h3>{t("features.progressTitle")}</h3>
                <p>{t("features.progressText")}</p>
                <div className={styles.featureTags}>
                  <span>{t("features.progressTag1")}</span>
                  <span>{t("features.progressTag2")}</span>
                  <span>{t("features.progressTag3")}</span>
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
                    <span>{t("features.progressReadout")}</span>
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
                <h3>{t("features.bizTitle")}</h3>
                <p>{t("features.bizText")}</p>
                <div className={styles.featureTags}>
                  <span>{t("features.bizTag1")}</span>
                  <span>{t("features.bizTag2")}</span>
                  <span>{t("features.bizTag3")}</span>
                </div>
              </div>
              <div className={styles.featureVisual}>
                <div className={styles.vizMacros}>
                  <div className={styles.macroBarRow}>
                    <div className={styles.macroTop}>
                      <span>{t("features.bizActive")}</span>
                      <span className={styles.macroVal}>27 / 30</span>
                    </div>
                    <div className={styles.macroTrack}>
                      <div className={`${styles.macroFill} ${styles.fat}`} style={{ width: "90%" }} />
                    </div>
                  </div>
                  <div className={styles.macroBarRow}>
                    <div className={styles.macroTop}>
                      <span>{t("features.bizPaid")}</span>
                      <span className={styles.macroVal}>24 / 27</span>
                    </div>
                    <div className={styles.macroTrack}>
                      <div className={`${styles.macroFill} ${styles.protein}`} style={{ width: "89%" }} />
                    </div>
                  </div>
                  <div className={styles.macroBarRow}>
                    <div className={styles.macroTop}>
                      <span>{t("features.bizAi")}</span>
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
              <h2>{t.rich("ai.title", rich)}</h2>
              <p>{t("ai.sub")}</p>
            </div>

            <div className={styles.aiColumns}>
              <div data-reveal className={`${styles.aiCard} ${styles.reveal}`}>
                <h3>{t("ai.clientTitle")}</h3>
                <p>{t("ai.clientSub")}</p>
                <ul>
                  <li>
                    <CheckIcon color="var(--plate-yellow)" />
                    {t("ai.client1")}
                  </li>
                  <li>
                    <CheckIcon color="var(--plate-yellow)" />
                    {t("ai.client2")}
                  </li>
                  <li>
                    <CheckIcon color="var(--plate-yellow)" />
                    {t("ai.client3")}
                  </li>
                </ul>
              </div>
              <div data-reveal className={`${styles.aiCard} ${styles.reveal}`}>
                <h3>{t("ai.trainerTitle")}</h3>
                <p>{t("ai.trainerSub")}</p>
                <ul>
                  <li>
                    <CheckIcon color="var(--iron-red)" />
                    {t("ai.trainer1")}
                  </li>
                  <li>
                    <CheckIcon color="var(--iron-red)" />
                    {t("ai.trainer2")}
                  </li>
                  <li>
                    <CheckIcon color="var(--iron-red)" />
                    {t("ai.trainer3")}
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
                <h4>{t("ai.trustTitle")}</h4>
                <p>{t("ai.trustText")}</p>
              </div>
            </div>
          </div>
        </section>

        <section id="cennik" className={styles.section}>
          <div className={styles.wrap}>
            <div data-reveal className={`${styles.sectionHead} ${styles.reveal}`}>
              <h2>{t.rich("pricing.title", rich)}</h2>
              <p>{t("pricing.sub")}</p>
            </div>
            <span data-reveal className={`${styles.pricingNote} ${styles.reveal}`}>
              <span className={styles.dot} />
              {t("pricing.note")}
            </span>

            <div data-reveal className={`${styles.pricingGrid} ${styles.reveal}`}>
              <div className={styles.priceCard}>
                <div className={styles.tier}>Starter</div>
                <div className={styles.for}>{t("pricing.starterFor")}</div>
                <div className={styles.priceRow}>
                  <span className={styles.priceNum}>15–20&nbsp;€</span>
                  <span className={styles.pricePer}>{t("pricing.perMonth")}</span>
                </div>
                <ul>
                  <li>
                    <CheckIcon color="var(--steel)" size={14} />
                    {t("pricing.starter1")}
                  </li>
                  <li>
                    <CheckIcon color="var(--steel)" size={14} />
                    {t("pricing.starter2")}
                  </li>
                  <li>
                    <CheckIcon color="var(--steel)" size={14} />
                    {t("pricing.starter3")}
                  </li>
                </ul>
                <Link href="/prihlasenie#register-trener" className={`btn btn-ghost ${styles.priceCta}`}>
                  {t("pricing.starterCta")}
                </Link>
              </div>
              <div className={`${styles.priceCard} ${styles.featured}`}>
                <div className={styles.tier}>Pro</div>
                <div className={styles.for}>{t("pricing.proFor")}</div>
                <div className={styles.priceRow}>
                  <span className={styles.priceNum}>40–50&nbsp;€</span>
                  <span className={styles.pricePer}>{t("pricing.perMonth")}</span>
                </div>
                <ul>
                  <li>
                    <CheckIcon color="var(--iron-red)" size={14} />
                    {t("pricing.pro1")}
                  </li>
                  <li>
                    <CheckIcon color="var(--iron-red)" size={14} />
                    {t("pricing.pro2")}
                  </li>
                  <li>
                    <CheckIcon color="var(--iron-red)" size={14} />
                    {t("pricing.pro3")}
                  </li>
                </ul>
                <Link href="/prihlasenie#register-trener" className={`btn btn-primary ${styles.priceCta}`}>
                  {t("pricing.proCta")}
                  <ArrowIcon />
                </Link>
              </div>
              <div className={styles.priceCard}>
                <div className={styles.tier}>Business</div>
                <div className={styles.for}>{t("pricing.businessFor")}</div>
                <div className={styles.priceRow}>
                  <span className={styles.priceNum}>80–100&nbsp;€</span>
                  <span className={styles.pricePer}>{t("pricing.perMonth")}</span>
                </div>
                <ul>
                  <li>
                    <CheckIcon color="var(--steel)" size={14} />
                    {t("pricing.business1")}
                  </li>
                  <li>
                    <CheckIcon color="var(--steel)" size={14} />
                    {t("pricing.business2")}
                  </li>
                  <li>
                    <CheckIcon color="var(--steel)" size={14} />
                    {t("pricing.business3")}
                  </li>
                </ul>
                <Link href="/prihlasenie#register-trener" className={`btn btn-ghost ${styles.priceCta}`}>
                  {t("pricing.businessCta")}
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.wrap}>
            <div data-reveal className={`${styles.sectionHead} ${styles.reveal}`}>
              <h2>{t("roadmap.title")}</h2>
              <p>{t("roadmap.sub")}</p>
            </div>
            <div data-reveal className={styles.reveal}>
              <div className={`${styles.phaseRow} ${styles.first} ${styles.current}`}>
                <div className={`${styles.phaseNum} stencil`}>01</div>
                <div>
                  <h3>{t("roadmap.mvp")}</h3>
                  <p>{t("roadmap.mvpText")}</p>
                </div>
              </div>
              <div className={styles.phaseRow}>
                <div className={`${styles.phaseNum} stencil`}>02</div>
                <div>
                  <h3>{t("roadmap.phase2")}</h3>
                  <p>{t("roadmap.phase2Text")}</p>
                </div>
              </div>
              <div className={styles.phaseRow}>
                <div className={`${styles.phaseNum} stencil`}>03</div>
                <div>
                  <h3>{t("roadmap.phase3")}</h3>
                  <p>{t("roadmap.phase3Text")}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.finalCta}>
          <div className={styles.wrap}>
            <div data-reveal className={`${styles.finalCtaInner} ${styles.reveal}`}>
              <div>
                <h2>{t.rich("final.title", rich)}</h2>
                <p>{t("final.sub")}</p>
              </div>
              <Link href="/prihlasenie#register-trener" className={`btn ${styles.finalCtaBtn}`}>
                {t("final.cta")}
                <ArrowIcon />
              </Link>
            </div>
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
              <a href="#funkcie">{t("nav.features")}</a>
              <a href="#ai">{t("nav.ai")}</a>
              <a href="#cennik">{t("nav.pricing")}</a>
              <a href="mailto:podpora@myfitpilot.sk">{t("footer.contact")}</a>
              <Link href="/ochrana-sukromia">{t("footer.privacy")}</Link>
              <Link href="/obchodne-podmienky">{t("footer.terms")}</Link>
              <Link href="/cookies">{t("footer.cookies")}</Link>
            </div>
          </div>
          <p className={styles.fine}>{t("footer.fine")}</p>
        </div>
      </footer>
      <StickyMobileCta label={t("hero.ctaTrial")} />
    </div>
  );
}
