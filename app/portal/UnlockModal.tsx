"use client";

import { useEffect, useRef, useState } from "react";
import { AppLink as Link } from "../components/AppLink";
import { BadgeIcon } from "../components/BadgeIcon";
import type { BadgeIcon as BadgeIconKey } from "@/lib/gamification/badges";
import { ShareButton } from "../components/ShareButton";
import type { CelebrationId } from "@/lib/gamification/rewards";
import { CelebrationBurst } from "./CelebrationBurst";
import { markAchievementsSeenAction } from "./gamificationActions";
import g from "../components/gamification.module.css";
import g2 from "../components/gamificationV2.module.css";

/* Oslava nového rekordu / odznaku (lib/gamification). Texty prichádzajú hotové zo servera
   (AchievementHost). Ukáže sa raz: hneď po zobrazení sa úspechy označia ako videné
   (client_achievements.seen_at), takže obnovenie stránky ich už nezopakuje. Oslava (konfety / hviezdy /
   ohňostroj podľa voľby klienta) je čisté CSS; pri prefers-reduced-motion len jemné zjavenie svetla. */

export interface UnlockItem {
  id: string;
  icon: BadgeIconKey;
  title: string;
  sub: string;
  /** adresa zdieľacej karty (/api/gamification/share?a=…) */
  shareHref?: string;
  /** odomknuté odmeny (postup na vyššiu úroveň) */
  chips?: string[];
}


export function UnlockModal({
  items,
  labels,
  celebration = "confetti",
}: {
  items: UnlockItem[];
  /** zvolený štýl oslavy (rewards.ts); pri prefers-reduced-motion jednoduché zjavenie svetla */
  celebration?: CelebrationId;
  labels: { close: string; next: string; aria: string; viewAll: string; positions: string[] };
}) {
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(true);
  const primary = useRef<HTMLButtonElement>(null);
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    void markAchievementsSeenAction(items.map((i) => i.id));
  }, [items]);

  useEffect(() => {
    if (open) primary.current?.focus();
  }, [open, index]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open || items.length === 0) return null;
  const item = items[Math.min(index, items.length - 1)];
  const last = index >= items.length - 1;

  return (
    <div className={g.scrim} onClick={() => setOpen(false)} data-testid="unlock-modal">
      <div
        className={g.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={labels.aria}
        onClick={(e) => e.stopPropagation()}
      >
        <CelebrationBurst style={celebration} />
        <div className={g.dialogIcon} aria-hidden="true">
          <BadgeIcon icon={item.icon} />
        </div>
        <h2 className={g.dialogTitle} aria-live="polite">
          {item.title}
        </h2>
        <p className={g.dialogSub}>{item.sub}</p>
        {item.chips && item.chips.length > 0 && (
          <ul className={g2.rewardChips} data-testid="unlock-rewards">
            {item.chips.map((c, i) => (
              <li key={`${c}-${i}`}>{c}</li>
            ))}
          </ul>
        )}
        {item.shareHref && (
          <div className={g.shareRow} style={{ justifyContent: "center", marginBottom: 12 }}>
            <ShareButton href={item.shareHref} fileName="fitpilot-uspech.png" />
          </div>
        )}
        <div className={g.dialogActions}>
          <button
            ref={primary}
            type="button"
            className="btn btn-primary"
            onClick={() => (last ? setOpen(false) : setIndex(index + 1))}
          >
            {last ? labels.close : labels.next}
          </button>
          {items.length > 1 && <span className={g.dialogPos}>{labels.positions[Math.min(index, items.length - 1)]}</span>}
          <Link href="/portal/uspechy" className={g.moreLink} onClick={() => setOpen(false)}>
            {labels.viewAll}
          </Link>
        </div>
      </div>
    </div>
  );
}
