"use client";

import { useEffect } from "react";
import styles from "./dashboard.module.css";

// Záchranná sieť pre neočakávanú chybu na stránke dashboardu (napr. výpadok siete
// počas akcie). Bez nej Next zobrazil čiernu obrazovku "Application error"; takto
// ostane navigácia (layout) a ponúkne sa opätovné načítanie stránky.
export default function DashboardError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className={styles.emptyState} role="alert">
      <h2>Niečo sa pokazilo</h2>
      <p>Skontroluj pripojenie a skús to znova.</p>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => window.location.reload()}>
        Skúsiť znova
      </button>
    </div>
  );
}
