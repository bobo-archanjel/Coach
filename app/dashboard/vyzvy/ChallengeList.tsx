"use client";

import type { CSSProperties } from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useBilling } from "../BillingContext";
import { intlLocale, type Locale } from "@/lib/i18n/locales";
import type { TrainerChallenge } from "@/lib/gamification/challengesServer";
import { deleteChallengeAction, endChallengeAction } from "./actions";
import g from "@/app/components/gamification.module.css";
import v from "./vyzvy.module.css";

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
    <div className={v.stack} data-testid="challenge-list">
      {items.map((c) => (
        <article key={c.id} className={v.item} data-challenge={c.id} data-phase={c.phase}>
          <div className={v.itemHead}>
            <div>
              <div className={v.itemName}>{c.name}</div>
              <div className={v.itemMeta}>
                {t(`metricName.${c.metric}`)} · {t("trainer.targetOf", { target: c.target })} · {fmt(c.startsOn)} – {fmt(c.endsOn)}
              </div>
            </div>
            <span className={`${v.chip} ${c.phase === "active" ? v.chipActive : ""}`}>{t(`phase.${c.phase}`)}</span>
          </div>
          {c.description ? <p className={v.desc}>{c.description}</p> : null}
          <p className={v.done}>{t("trainer.doneOf", { done: c.doneCount, total: c.participants.length })}</p>

          {c.participants.length > 0 && (
            <details>
              <summary className={v.summary}>{t("trainer.progress")}</summary>
              <ul className={v.parts}>
                {c.participants.map((p) => {
                  const percent = Math.round(p.fraction * 100);
                  return (
                    <li key={p.clientId} className={v.part}>
                      <span>{p.name}</span>
                      <div className={g.bar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={`${p.name}: ${percent} %`}>
                        <span className={g.barFill} style={{ "--p": percent / 100 } as CSSProperties} />
                      </div>
                      <span className={v.partVal}>{p.done ? t("trainer.partDone") : `${p.value}/${c.target}`}</span>
                    </li>
                  );
                })}
              </ul>
            </details>
          )}

          <div className={v.btns}>
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
        <p className={v.err} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
