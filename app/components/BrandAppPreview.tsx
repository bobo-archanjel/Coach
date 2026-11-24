import { LogoMark } from "@/app/components/LogoMark";
import styles from "./brandAppPreview.module.css";

/* Náhľad inštalovanej appky: (1) ikona + názov na ploche telefónu, (2) úvodná obrazovka (splash).
   Čistý zobrazovací komponent (server aj klient). Vygenerovaná ikona sa ukáže, keď existuje
   (`iconUrl`); inak sa logo vycentruje na pozadí tak, ako ho skladá generátor ikon (podobne,
   nie bajt po bajte — presná ikona vznikne pri uložení). Pozadie splashu = akcent značky. */

export interface BrandAppPreviewProps {
  /** názov pod ikonou / na splashi (už orezaný na krátky tvar pre plochu) */
  shortName: string;
  name: string;
  /** vygenerovaná ikona (apple 180) — ak chýba, použije sa logo na `background` */
  iconUrl: string | null;
  logoUrl: string | null;
  /** pozadie ikony, ak sa skladá z loga */
  background: string;
  /** akcent značky (pozadie splashu) */
  accent: string;
  /** text na akcente */
  onAccent: string;
  labels: { home: string; splash: string; placeholder: string };
}

export function BrandAppPreview({ shortName, name, iconUrl, logoUrl, background, accent, onAccent, labels }: BrandAppPreviewProps) {
  const tile = (
    <span className={styles.tile} style={iconUrl ? undefined : { background }} aria-hidden="true">
      {iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={iconUrl} alt="" className={styles.iconImg} />
      ) : logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className={styles.logoImg} />
      ) : (
        <LogoMark className={styles.logoImg} />
      )}
    </span>
  );
  return (
    <div className={styles.wrap} data-testid="branding-app-preview">
      <figure className={styles.fig}>
        <div className={styles.home} aria-label={labels.home}>
          <span className={styles.slot}>
            {tile}
            <span className={styles.label}>{shortName}</span>
          </span>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <span key={i} className={styles.slot} aria-hidden="true">
              <span className={styles.ghost} />
              <span className={styles.ghostLabel} />
            </span>
          ))}
        </div>
        <figcaption className={styles.caption}>{labels.home}</figcaption>
      </figure>
      <figure className={styles.fig}>
        <div className={styles.splash} style={{ background: accent, color: onAccent }} aria-label={labels.splash} data-testid="branding-splash-preview">
          {tile}
          <span className={styles.splashName}>{name}</span>
        </div>
        <figcaption className={styles.caption}>{labels.splash}</figcaption>
      </figure>
      <p className={styles.note}>{labels.placeholder}</p>
    </div>
  );
}
