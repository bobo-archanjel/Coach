import styles from "../dashboard.module.css";

export default function TreningyPage() {
  return (
    <>
      <div className={styles.pageHead}>
        <h1>Tréningy</h1>
        <p>Tréningový builder — zostavovanie plánov a knižnica cvikov.</p>
      </div>

      <div className={styles.emptyState}>
        <h2>Tréningový builder ešte nie je postavený</h2>
        <p>
          Knižnica cvikov, zostavenie plánu (série/opakovania/záťaž) a zaraďovanie klientom sú
          ďalšia úloha na roadmape.
        </p>
      </div>
    </>
  );
}
