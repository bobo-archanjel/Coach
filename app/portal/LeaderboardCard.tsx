"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type Board, type LeaderboardMetric } from "@/lib/gamification/leaderboard";
import { NICKNAME_MAX, NICKNAME_MIN } from "@/lib/gamification/nickname";
import { setLeaderboardVisibleAction, setNicknameAction } from "./gamificationActions";
import g from "@/app/components/gamification.module.css";
import g2 from "@/app/components/gamificationV2.module.css";

/* Celoappkový rebríček: TOP 10 + „Tvoja pozícia: 37. z 412“. Zobrazuje sa len prezývka (predvolene „Meno P.“,
   vlastnú si klient nastaví tu) a číslo; nikdy priezvisko, tréner ani fotka. Klient sa dá jedným ťuknutím skryť
   (potom rebríček sám nevidí a v poradí nie je) a znova zobraziť. Metriky: tréningy tento týždeň / mesiac,
   séria týždňov, rekordy tento mesiac — nikdy podľa váhy ani kalórií. */

export function LeaderboardCard({
  metrics,
  boards,
  hidden,
  me,
}: {
  metrics: LeaderboardMetric[];
  boards: Partial<Record<LeaderboardMetric, Board>> | null;
  hidden: boolean;
  me: { nickname: string | null; defaultName: string; shownName: string };
}) {
  const t = useTranslations("gamification.leaderboard");
  const router = useRouter();
  const [metric, setMetric] = useState<LeaderboardMetric>("workoutsWeek");
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);

  const toggle = (visible: boolean) =>
    start(async () => {
      setFailed(false);
      const res = await setLeaderboardVisibleAction(visible);
      if (res.ok) router.refresh();
      else setFailed(true);
    });

  if (hidden || !boards) {
    return (
      <section className={g.card} aria-label={t("title")} data-testid="leaderboard-hidden">
        <h2 className={g.cardTitle}>{t("title")}</h2>
        <p className={g.empty}>{t("hiddenText")}</p>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggle(true)} disabled={pending}>
          {t("show")}
        </button>
        {failed && <p className={g.fiveError}>{t("failed")}</p>}
      </section>
    );
  }

  // záložky len z povolených metrík tarify trénera (klient bez trénera má sadu Starter); s jedinou záložkou sa prepínač nezobrazuje
  const active = metrics.includes(metric) ? metric : metrics[0];
  const board = active ? boards[active] : undefined;
  if (!board || !active) return null;
  return (
    <section className={g.card} aria-label={t("title")} data-testid="leaderboard">
      <h2 className={g.cardTitle}>{t("title")}</h2>
      {metrics.length > 1 && (
        <div className={g.lbTabs} role="tablist" aria-label={t("metricsAria")}>
          {metrics.map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={active === m}
              className={`${g.lbTab} ${active === m ? g.lbTabOn : ""}`}
              onClick={() => setMetric(m)}
            >
              {t(`metrics.${m}`)}
            </button>
          ))}
        </div>
      )}

      {board.top.length === 0 ? (
        <p className={g.empty}>{t("empty")}</p>
      ) : (
        <ol className={g.lbList}>
          {board.top.map((r, i) => (
            <li key={`${r.rank}-${i}`} className={`${g.lbRow} ${r.isMe ? g.lbMe : ""}`} data-me={r.isMe ? "1" : "0"}>
              <span className={g.lbRank}>{r.rank}.</span>
              <span className={g.lbName}>
                {r.name}
                {r.isMe ? ` (${t("you")})` : ""}
              </span>
              <span className={g.lbVal}>{t(`unit.${active}`, { count: r.value })}</span>
            </li>
          ))}
        </ol>
      )}

      <div className={g.lbFoot}>
        <span data-testid="leaderboard-rank">{board.me ? t("yourRank", { rank: board.me.rank, total: board.total }) : t("noRank")}</span>
        <button type="button" className={g.linkBtn} onClick={() => toggle(false)} disabled={pending}>
          {t("hide")}
        </button>
      </div>
      <p className={g.chDesc}>{t("privacy")}</p>
      {failed && <p className={g.fiveError}>{t("failed")}</p>}

      <NicknameEditor me={me} onSaved={() => router.refresh()} />
    </section>
  );
}

function NicknameEditor({ me, onSaved }: { me: { nickname: string | null; defaultName: string; shownName: string }; onSaved: () => void }) {
  const t = useTranslations("gamification.leaderboard.nickname");
  const [value, setValue] = useState(me.nickname ?? "");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const save = (next: string | null) =>
    start(async () => {
      setMsg(null);
      const res = await setNicknameAction(next);
      if (res.ok) {
        setMsg({ kind: "ok", text: t("saved") });
        if (next == null) setValue("");
        onSaved();
      } else {
        const key = res.error === "length" || res.error === "chars" || res.error === "blocked" ? res.error : "failed";
        setMsg({ kind: "err", text: t(`errors.${key}`) });
      }
    });

  return (
    <form
      className={g2.nickBox}
      data-testid="nickname-form"
      onSubmit={(e) => {
        e.preventDefault();
        save(value.trim() === "" ? null : value);
      }}
    >
      <h3 className={g2.nickTitle}>{t("title")}</h3>
      <p className={g2.nickHint}>{t("shownAs", { name: me.shownName })}</p>
      <div className={g2.nickRow}>
        <input
          className={g2.nickInput}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          minLength={NICKNAME_MIN}
          maxLength={NICKNAME_MAX}
          autoComplete="off"
          autoCapitalize="words"
          placeholder={t("placeholder")}
          aria-label={t("aria")}
          disabled={pending}
        />
        <button type="submit" className="btn btn-ghost btn-sm" disabled={pending}>
          {t("save")}
        </button>
      </div>
      <p className={g2.nickHint}>{t("hint")}</p>
      {me.nickname && (
        <button type="button" className={g.linkBtn} onClick={() => save(null)} disabled={pending}>
          {t("reset", { name: me.defaultName })}
        </button>
      )}
      {msg && (
        <p className={msg.kind === "ok" ? g2.nickOk : g2.nickErr} role={msg.kind === "ok" ? "status" : "alert"}>
          {msg.text}
        </p>
      )}
    </form>
  );
}
