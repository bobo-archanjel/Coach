"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
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
import { setFrameAction, setThemeAction } from "./gamificationActions";
import { frameClassName } from "./frameClass";
import g from "@/app/components/gamification.module.css";
import g2 from "@/app/components/gamificationV2.module.css";

/* Odmeny za úrovne: výber rámika avatara a farby portálu. Odomknutie počíta server z XP (klient neposiela úroveň),
   tu sa len ukazuje, čo je dostupné. Keď má tréner aktívnu značku, farba portálu ostáva podľa značky a vybraná
   téma farbí len rámik avatara (vysvetľuje to poznámka). */

export function RewardsCard({
  level,
  frame,
  theme,
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
                    <span className={`${g2.previewAvatar} ${frameClassName(f)}`} aria-hidden="true">
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
          {branded && <p className={g2.rewardNote}>{t("rewards.brandedNote")}</p>}
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
