import Link from "next/link";
import { LogoMark } from "./components/LogoMark";
import styles from "./legal.module.css";

const ArrowIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
    <path d="M3 7.5h9M8 3l4.5 4.5L8 12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * Custom 404 (feature/security#2) — predtým Next default. Rovnaký vizuálny
 * jazyk ako landing/auth (tmavé pozadie, bar-rule, Inter), nie generická biela
 * stránka mimo brandu.
 */
export default function NotFound() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          <LogoMark className={styles.logoMark} />
          FitPilot
        </Link>
      </header>
      <main className={styles.main}>
        <div className={styles.notFound}>
          <div className="bar-rule red" style={{ margin: "0 auto 20px" }}>
            <span className="plate" />
            <span className="bar" />
          </div>
          <h1>404</h1>
          <p>Táto stránka neexistuje alebo bola presunutá.</p>
          <Link href="/" className="btn btn-primary">
            Späť na úvod
            <ArrowIcon />
          </Link>
        </div>
      </main>
    </div>
  );
}
