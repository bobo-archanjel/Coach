"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useBilling } from "../BillingContext";
import { intlLocale, type Locale } from "@/lib/i18n/locales";
import type { TrainerChallenge } from "@/lib/gamification/challengesServer";
import { deleteChallengeAction, endChallengeAction } from "./actions";
import g from "@/app/components/gamification.module.css";

/* Výzvy trénera s progresom každého klienta (z dát, nie z hlásenia klienta). Ukončiť = klienti ju
   prestanú vidieť ako bežiacu; zmazať = zmizne aj s účastníkmi (získané odznaky ostávajú). */

export function ChallengeList({ items }: { items: TrainerChallenge[] }) {
  const t = useTranslations("gamification.challenges");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const readOnly = useBilling().readOnly;
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const fmt = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString(intlLocale(locale), { day: "numeric", month: "numeric", year: "numeric", timeZone: "UTC" });

  const when = (iso: string) =>
    new Date(iso).toLocaleString(intlLocale(locale), { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Bratislava" });

  const run = (fn: () => Promise<{ error: string | null }>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res.error) setError(res.error);
      else {
        setConfirm(null);
        router.refresh();
      }
    });

  if (items.length === 0) return <p className={g.empty}>{t("trainer.empty")}</p>;

  return (
    <div className={g.tcStack} data-testid="challenge-list">
      {items.map((c) => (
        <article key={c.id} className={g.tcItem} data-challenge={c.id} data-phase={c.phase}>
          <div className={g.tcItemHead}>
            <div>
              <div className={g.tcItemName}>{c.name}</div>
              <div className={g.tcItemMeta}>
                {t(`metricName.${c.metric}`)} · {t("trainer.targetOf", { target: c.target })} · {fmt(c.startsOn)} – {fmt(c.endsOn)}
                {" · "}
                {t("countsFrom", { when: when(c.countsFrom) })}
              </div>
            </div>
            <span className={g.tcChip}>{t(`phase.${c.phase}`)}</span>
          </div>
          {c.description ? <p className={g.chDesc}>{c.description}</p> : null}
          <p className={g.chDesc}>{t("trainer.doneOf", { done: c.doneCount, total: c.participants.length })}</p>

          {c.participants.length > 0 && (
            <details>
              <summary className={g.tcSummary}>{t("trainer.progress")}</summary>
              <ul className={g.tcPartList} style={{ marginTop: 10 }}>
                {c.participants.map((p) => {
                  const percent = Math.round(p.fraction * 100);
                  return (
                    <li key={p.clientId} className={g.tcPart}>
                      <span>{p.name}</span>
                      <div className={g.bar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={`${p.name}: ${percent} %`}>
                        <span className={g.barFill} style={{ width: `${percent}%` }} />
                      </div>
                      <span className={g.tcPartVal}>{p.done ? t("trainer.partDone") : `${p.value}/${c.target}`}</span>
                    </li>
                  );
                })}
              </ul>
            </details>
          )}

          <div className={g.tcBtns}>
            {c.status === "active" && (
              <button type="button" className="btn btn-ghost btn-sm" disabled={pending || readOnly} onClick={() => run(() => endChallengeAction(c.id))}>
                {t("trainer.end")}
              </button>
            )}
            {confirm === c.id ? (
              <>
                <button type="button" className="btn btn-primary btn-sm" disabled={pending || readOnly} onClick={() => run(() => deleteChallengeAction(c.id))}>
                  {t("trainer.deleteConfirm")}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirm(null)}>
                  {t("trainer.cancel")}
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-ghost btn-sm" disabled={pending || readOnly} onClick={() => setConfirm(c.id)}>
                {t("trainer.delete")}
              </button>
            )}
          </div>
        </article>
      ))}
      {error && (
        <p className={g.tcErr} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
