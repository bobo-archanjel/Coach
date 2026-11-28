"use client";

// Rozbaľovacie menu odkazov na úzkej obrazovke — obyčajné <details>; po kliknutí na odkaz sa zavrie
// (kotva by ho inak nechala otvorené) a zatvára ho aj Escape. Žiadna ďalšia knižnica.

import { useRef } from "react";
import styles from "../site.module.css";

export function NavMenu({ links, label, navLabel }: { links: { href: string; label: string }[]; label: string; navLabel: string }) {
  const ref = useRef<HTMLDetailsElement>(null);
  if (links.length === 0) return null;
  const close = () => {
    if (ref.current) ref.current.open = false;
  };
  return (
    <details ref={ref} className={styles.menu} onKeyDown={(e) => e.key === "Escape" && close()}>
      <summary className={styles.menuBtn} aria-label={label}>
        <svg className={styles.menuOpen} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
        <svg className={styles.menuClose} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </summary>
      <nav aria-label={navLabel} className={styles.menuPanel}>
        <ul>
          {links.map((l) => (
            <li key={l.href}>
              <a href={l.href} onClick={close}>
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </details>
  );
}
