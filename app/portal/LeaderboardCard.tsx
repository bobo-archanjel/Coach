"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type Board, type LeaderboardMetric } from "@/lib/gamification/leaderboard";
import { setLeaderboardVisibleAction } from "./gamificationActions";
import g from "@/app/components/gamification.module.css";

/* Rebríček klientov jedného trénera: tréningy tento týždeň / mesiac, séria týždňov, rekordy
   tento mesiac. Len „krstné meno + iniciála“ a číslo; nikdy podľa váhy. Klient sa dá jedným
   ťuknutím skryť (potom rebríček sám nevidí) a znova zobraziť. */

export function LeaderboardCard({
  metrics,
  boards,
  hidden,
}: {
  metrics: LeaderboardMetric[];
  boards: Partial<Record<LeaderboardMetric, Board>> | null;
  hidden: boolean;
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

  // záložky len z povolených metrík tarify trénera; s jedinou záložkou sa prepínač nezobrazuje
  const active = metrics.includes(metric) ? metric : metrics[0];
  const board = active ? boards[active] : undefined;
  if (!board || !active) return null;
  const meInTop = board.top.some((r) => r.isMe);
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
        <span>
          {board.me
            ? meInTop
              ? t("yourRankShort", { rank: board.me.rank })
              : t("yourRank", { rank: board.me.rank, total: board.total })
            : t("noRank")}
        </span>
        <button type="button" className={g.linkBtn} onClick={() => toggle(false)} disabled={pending}>
          {t("hide")}
        </button>
      </div>
      <p className={g.chDesc}>{t("privacy")}</p>
      {failed && <p className={g.fiveError}>{t("failed")}</p>}
    </section>
  );
}
