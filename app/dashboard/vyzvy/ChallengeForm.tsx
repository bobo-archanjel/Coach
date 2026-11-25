"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ClientMultiSelect, type PickerClient } from "../ClientMultiSelect";
import { useBilling } from "../BillingContext";
import { CHALLENGE_METRICS, targetBounds, type ChallengeMetric } from "@/lib/gamification/challenges";
import { createChallengeAction } from "./actions";
import g from "@/app/components/gamification.module.css";

/* Nová výzva: názov, typ z pevnej množiny, cieľ, obdobie, komu (všetci / vybraní). Server
   všetko znovu overí (tarifa, vlastníctvo klientov, rozsahy) — tu je len pohodlie a rýchla spätná väzba. */

export function ChallengeForm({
  clients,
  today,
  defaultEnd,
  allowedTypes,
  canSelectClients,
}: {
  clients: PickerClient[];
  today: string;
  defaultEnd: string;
  /** typy povolené tarifou (ostatné sú vidieť, ale zamknuté s „od Pro“) */
  allowedTypes: ChallengeMetric[];
  /** false = výzvu možno dať len všetkým klientom (Starter) — výber sa nezobrazí */
  canSelectClients: boolean;
}) {
  const t = useTranslations("gamification.challenges");
  const router = useRouter();
  const readOnly = useBilling().readOnly;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [metric, setMetric] = useState<ChallengeMetric>(allowedTypes[0] ?? "workouts");
  const [target, setTarget] = useState("8");
  const [startsOn, setStartsOn] = useState(today);
  const [endsOn, setEndsOn] = useState(defaultEnd);
  const [everyone, setEveryone] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  const bounds = startsOn && endsOn && endsOn >= startsOn ? targetBounds(metric, startsOn, endsOn) : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    start(async () => {
      const res = await createChallengeAction({
        name,
        description,
        metric,
        target: Number(target),
        startsOn,
        endsOn,
        allClients: everyone || !canSelectClients,
        clientIds: everyone || !canSelectClients ? [] : selected,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setDone(true);
      setName("");
      setDescription("");
      router.refresh();
    });
  }

  return (
    <form className={g.tcForm} onSubmit={submit} data-testid="challenge-form">
      <div className={g.tcFields}>
        <label className={g.tcField}>
          {t("form.name")}
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required placeholder={t("form.namePlaceholder")} />
        </label>
        <label className={g.tcField}>
          {t("form.metric")}
          <select value={metric} onChange={(e) => setMetric(e.target.value as ChallengeMetric)}>
            {CHALLENGE_METRICS.map((m) => (
              <option key={m} value={m} disabled={!allowedTypes.includes(m)}>
                {t(`metricName.${m}`)}
                {allowedTypes.includes(m) ? "" : ` (${t("form.fromPro")})`}
              </option>
            ))}
          </select>
        </label>
        <label className={g.tcField}>
          {t("form.target")}
          <input
            type="number"
            inputMode="numeric"
            min={bounds?.min ?? 1}
            max={bounds?.max}
            step={1}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            required
          />
          <span className={g.tcHint}>{bounds ? t("form.targetHint", { min: bounds.min, max: bounds.max }) : t(`metricHint.${metric}`)}</span>
        </label>
        <label className={g.tcField}>
          {t("form.startsOn")}
          <input type="date" value={startsOn} min={today} onChange={(e) => setStartsOn(e.target.value)} required />
          <span className={g.tcHint}>{t("form.startsOnHint")}</span>
        </label>
        <label className={g.tcField}>
          {t("form.endsOn")}
          <input type="date" value={endsOn} min={startsOn} onChange={(e) => setEndsOn(e.target.value)} required />
        </label>
      </div>
      <p className={g.tcHint}>{t(`metricHint.${metric}`)}</p>

      <label className={g.tcField}>
        {t("form.description")}
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} rows={2} />
      </label>

      {canSelectClients && (
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className={g.tcHint}>{t("form.who")}</legend>
          <div className={g.tcRadio}>
            <label>
              <input type="radio" name="who" checked={everyone} onChange={() => setEveryone(true)} />
              {t("form.everyone")}
            </label>
            <label>
              <input type="radio" name="who" checked={!everyone} onChange={() => setEveryone(false)} />
              {t("form.selected")}
            </label>
          </div>
        </fieldset>
      )}
      {!canSelectClients && <p className={g.tcHint}>{t("form.everyoneOnly")}</p>}
      {canSelectClients && !everyone && <ClientMultiSelect clients={clients} selected={selected} onChange={setSelected} name="client_ids" />}

      {error && (
        <p className={g.tcErr} role="alert">
          {error}
        </p>
      )}
      {done && (
        <p className={g.tcOk} role="status">
          {t("form.created")}
        </p>
      )}
      <div>
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending || readOnly || clients.length === 0}>
          {pending ? t("form.creating") : t("form.create")}
        </button>
      </div>
    </form>
  );
}
