"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  CELEBRATION_IDS,
  CELEBRATION_LEVEL,
  TITLE_MIN_LEVEL,
  celebrationUnlocked,
  unlockedTitles,
  type CelebrationId,
  FRAME_IDS,
  FRAME_LEVEL,
  THEME_IDS,
  THEME_LEVEL,
  THEME_SWATCH,
  frameUnlocked,
  themeUnlocked,
  type FrameId,
  type ThemeId,
} from "@/lib/gamification/rewards";
import { setCelebrationAction, setFrameAction, setThemeAction, setTitleAction } from "./gamificationActions";
import { frameClassName } from "./frameClass";
import g from "@/app/components/gamification.module.css";
import g2 from "@/app/components/gamificationV2.module.css";

/* Odmeny za úrovne: rámik avatara (aj animované), štýl osláv, titul v rebríčku a — len pre klientov BEZ značky
   trénera — farba portálu. Klientovi so značkou sa sekcia „Farba portálu“ nezobrazuje vôbec (značka vyhráva;
   ani zamknuté položky, ani poznámka). Odomknutie počíta server z XP (klient neposiela úroveň), tu sa len ukazuje,
   čo je dostupné; server výber pri zápise overí znova. */

export function RewardsCard({
  level,
  frame,
  theme,
  celebration,
  titleLevel,
  flameHot,
  branded,
  initial,
  freezeUses,
  freezeAvailable,
  freezeMax,
  nextRewardText,
}: {
  level: number;
  frame: FrameId;
  theme: ThemeId;
  celebration: CelebrationId;
  /** zvolený titul = číslo úrovne 10–20 */
  titleLevel: number | null;
  flameHot: boolean;
  branded: boolean;
  initial: string;
  /** hotové riadky histórie použitia zmrazení (najnovšie prvé) */
  freezeUses: string[];
  freezeAvailable: number;
  freezeMax: number;
  nextRewardText: string | null;
}) {
  const t = useTranslations("gamification");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);

  const choose = (run: () => Promise<{ ok: boolean }>) =>
    start(async () => {
      setError(false);
      const res = await run();
      if (res.ok) router.refresh();
      else setError(true);
    });

  return (
    <section className={g.card} aria-label={t("rewards.title")} id="odmeny" data-testid="rewards">
      <h2 className={g.cardTitle}>{t("rewards.title")}</h2>
      <div className={g.stack}>
        <div className={g2.rewardGroup}>
          <h3 className={g2.rewardGroupTitle}>{t("rewards.framesTitle")}</h3>
          <ul className={g2.pickGrid}>
            {FRAME_IDS.map((f) => {
              const open = frameUnlocked(f, level);
              return (
                <li key={f}>
                  <button
                    type="button"
                    className={`${g2.pickBtn} ${frame === f ? g2.pickOn : ""} ${open ? "" : g2.pickLocked}`}
                    disabled={!open || pending}
                    aria-pressed={frame === f}
                    aria-label={`${t(`frames.${f}` as never)}${open ? "" : `, ${t("rewards.lockedAt", { level: FRAME_LEVEL[f] })}`}`}
                    data-frame-option={f}
                    onClick={() => choose(() => setFrameAction(f))}
                  >
                    <span className={`${g2.previewAvatar} ${frameClassName(f, flameHot)}`} aria-hidden="true">
                      {initial}
                    </span>
                    <span>{t(`frames.${f}` as never)}</span>
                    <span className={g2.pickMeta}>{frame === f ? t("rewards.active") : open ? "" : t("rewards.lockedAt", { level: FRAME_LEVEL[f] })}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {!branded && (
          <div className={g2.rewardGroup}>
            <h3 className={g2.rewardGroupTitle}>{t("rewards.themesTitle")}</h3>
            <ul className={g2.pickGrid}>
              {THEME_IDS.map((th) => {
                const open = themeUnlocked(th, level);
                return (
                  <li key={th}>
                    <button
                      type="button"
                      className={`${g2.pickBtn} ${theme === th ? g2.pickOn : ""} ${open ? "" : g2.pickLocked}`}
                      disabled={!open || pending}
                      aria-pressed={theme === th}
                      aria-label={`${t(`themes.${th}` as never)}${open ? "" : `, ${t("rewards.lockedAt", { level: THEME_LEVEL[th] })}`}`}
                      data-theme-option={th}
                      onClick={() => choose(() => setThemeAction(th))}
                    >
                      <span className={g2.swatch} style={{ ["--sw" as string]: THEME_SWATCH[th] }} aria-hidden="true" />
                      <span>{t(`themes.${th}` as never)}</span>
                      <span className={g2.pickMeta}>{theme === th ? t("rewards.active") : open ? "" : t("rewards.lockedAt", { level: THEME_LEVEL[th] })}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className={g2.rewardGroup} data-testid="celebration-picker">
          <h3 className={g2.rewardGroupTitle}>{t("rewards.celebrationsTitle")}</h3>
          <ul className={g2.pickGrid}>
            {CELEBRATION_IDS.map((c) => {
              const open = celebrationUnlocked(c, level);
              return (
                <li key={c}>
                  <button
                    type="button"
                    className={`${g2.pickBtn} ${celebration === c ? g2.pickOn : ""} ${open ? "" : g2.pickLocked}`}
                    disabled={!open || pending}
                    aria-pressed={celebration === c}
                    aria-label={`${t(`celebrations.${c}` as never)}${open ? "" : `, ${t("rewards.lockedAt", { level: CELEBRATION_LEVEL[c] })}`}`}
                    data-celebration-option={c}
                    onClick={() => choose(() => setCelebrationAction(c))}
                  >
                    <span aria-hidden="true">{c === "confetti" ? "🎊" : c === "stars" ? "✨" : "🎆"}</span>
                    <span>{t(`celebrations.${c}` as never)}</span>
                    <span className={g2.pickMeta}>{celebration === c ? t("rewards.active") : open ? "" : t("rewards.lockedAt", { level: CELEBRATION_LEVEL[c] })}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className={g2.rewardGroup} data-testid="title-picker">
          <h3 className={g2.rewardGroupTitle}>{t("rewards.titlesTitle")}</h3>
          {level < TITLE_MIN_LEVEL ? (
            <p className={g2.rewardNote}>{t("rewards.titlesLocked", { level: TITLE_MIN_LEVEL })}</p>
          ) : (
            <>
              <p className={g2.rewardNote}>{t("rewards.titlesHint")}</p>
              <ul className={g2.pickGrid}>
                <li>
                  <button
                    type="button"
                    className={`${g2.pickBtn} ${titleLevel == null ? g2.pickOn : ""}`}
                    disabled={pending}
                    aria-pressed={titleLevel == null}
                    data-title-option="none"
                    onClick={() => choose(() => setTitleAction(null))}
                  >
                    <span>{t("rewards.titleNone")}</span>
                  </button>
                </li>
                {unlockedTitles(level).map((n) => (
                  <li key={n}>
                    <button
                      type="button"
                      className={`${g2.pickBtn} ${titleLevel === n ? g2.pickOn : ""}`}
                      disabled={pending}
                      aria-pressed={titleLevel === n}
                      data-title-option={n}
                      onClick={() => choose(() => setTitleAction(n))}
                    >
                      <span className={g2.titlePill}>{t(`levelTitles.${n}` as never)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className={g2.rewardGroup}>
          <h3 className={g2.rewardGroupTitle}>{t("freeze.title")}</h3>
          <p className={g2.rewardNote}>
            <span className={g2.freezeChip}>{t("freeze.count", { count: freezeAvailable, max: freezeMax })}</span>
          </p>
          <p className={g2.rewardNote}>{t("freeze.text")}</p>
          <p className={g2.rewardNote}>{t("freeze.earn")}</p>
          {freezeUses.length > 0 ? (
            <ul className={g2.freezeHist} data-testid="freeze-history">
              {freezeUses.map((u, i) => (
                <li key={i}>
                  <span className={g2.freezeUsed}>{t("freeze.used")}</span> · {u}
                </li>
              ))}
            </ul>
          ) : (
            <p className={g2.rewardNote}>{t("freeze.none")}</p>
          )}
        </div>

        <p className={g2.rewardNote}>{nextRewardText ?? t("rewards.allUnlocked")}</p>
        {error && (
          <p className={g.fiveError} role="alert">
            {t("rewards.failed")}
          </p>
        )}
      </div>
    </section>
  );
}
