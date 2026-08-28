import { getPortalTraining } from "@/lib/portal/data";
import { ProfileIcon, TrainingIcon } from "../icons";
import { AlertIcon, Notice } from "../Notice";
import { RetryButton } from "../RetryButton";
import styles from "../portal.module.css";

/* /portal/trening — celý aktuálny tréningový plán (všetky dni), nie len dnešok
   ako karta Dnes. Rovnaké vizuálne primitíva (.panel, .exList/.exRow) ako Dnes. */

export default async function TreningPage() {
  const result = await getPortalTraining();

  if (result.state === "error") {
    return (
      <Notice icon={<AlertIcon />} title="Nepodarilo sa načítať tvoj plán" tone="alert" action={<RetryButton />}>
        Skús to o chvíľu znova. Ak to potrvá, napíš svojmu trénerovi.
      </Notice>
    );
  }

  if (result.state === "unlinked") {
    return (
      <Notice icon={<ProfileIcon />} title={result.firstName ? `Vitaj, ${result.firstName}` : "Vitaj vo FitPilot"}>
        Tvoj účet ešte nie je prepojený s trénerom. Prepojenie spraví tréner zo svojej strany.
      </Notice>
    );
  }

  if (result.state === "no_plan") {
    return (
      <Notice icon={<TrainingIcon />} title="Plán je na ceste">
        Tréner ti zatiaľ nepriradil tréningový plán. Hneď ako to spraví, nájdeš tu všetky jeho dni.
      </Notice>
    );
  }

  const { planName, days } = result.data;

  return (
    <section aria-label="Tréningový plán" style={{ display: "grid", gap: 20 }}>
      <div>
        <p className={styles.panelLabel}>Tréningový plán</p>
        <h1 className={styles.sessionTitle}>{planName}</h1>
      </div>

      {days.map((day) => (
        <div key={day.id} className={styles.panel}>
          <p className={styles.panelLabel}>{day.name}</p>
          {day.exercises.length > 0 ? (
            <ol className={styles.exList}>
              {day.exercises.map((ex, i) => (
                <li key={`${ex.idx}-${i}`} className={styles.exRow}>
                  <span className={styles.exIdx}>{ex.idx}</span>
                  <span className={styles.exBody}>
                    <span className={styles.exName}>{ex.name}</span>
                    <span className={styles.exMeta}>
                      {[ex.scheme, ex.rest && `pauza ${ex.rest}`, ex.tempo && `tempo ${ex.tempo}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  {ex.load && <span className={styles.exLoad}>{ex.load}</span>}
                </li>
              ))}
            </ol>
          ) : (
            <div className={styles.sessionQuiet}>
              <p>Tento deň zatiaľ nemá žiadne cviky.</p>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
