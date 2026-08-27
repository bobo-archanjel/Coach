import styles from "../dashboard.module.css";

export default function VyzivaPage() {
  return (
    <>
      <div className={styles.pageHead}>
        <h1>Výživa</h1>
        <p>BMR/TDEE výpočet, makro ciele a jedálničky.</p>
      </div>

      <div className={styles.emptyState}>
        <h2>Nutričný modul ešte nie je postavený</h2>
        <p>Výpočet makier, zostavenie jedálničkov a food diary sú ďalšia úloha na roadmape.</p>
      </div>
    </>
  );
}
