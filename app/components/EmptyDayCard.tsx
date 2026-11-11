import type { ReactNode } from "react";
import { InfoTip } from "./InfoTip";
import s from "./emptyDayCard.module.css";

/**
 * Prázdny stav dňa v builderi (tréner, klient, jedálniček) — „Zatiaľ žiadne cviky“ /
 * „Zatiaľ žiadny deň“. Vysvetlenie je na požiadanie pod otáznikom (InfoTip), nie
 * dlhý odsek. Na počítači tlmená karta vo vnútri panela dňa, na mobile (panel tam
 * kartu nemá) sklenená karta, nech text nepláva mimo „liquid glass“.
 */
export function EmptyDayCard({
  title,
  text,
  tip,
}: {
  title: string;
  /** krátka veta pod nadpisom (voliteľná) */
  text?: ReactNode;
  /** vysvetlivka pod otáznikom vedľa nadpisu */
  tip?: { title: string; text: ReactNode };
}) {
  return (
    <div className={s.card}>
      <p className={s.title}>
        {title}
        {tip && <InfoTip title={tip.title}>{tip.text}</InfoTip>}
      </p>
      {text && <p className={s.text}>{text}</p>}
    </div>
  );
}
