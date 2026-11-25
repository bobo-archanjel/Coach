"use client";

import { useEffect, useRef, useState } from "react";
import { AppLink as Link } from "../components/AppLink";
import { BadgeIcon } from "../components/BadgeIcon";
import type { BadgeIcon as BadgeIconKey } from "@/lib/gamification/badges";
import { ShareButton } from "../components/ShareButton";
import type { CelebrationId } from "@/lib/gamification/rewards";
import { CelebrationBurst } from "./CelebrationBurst";
import { markAchievementsSeenAction } from "./gamificationActions";
import { useOverlayActive, useOverlayBlocked } from "./overlayGate";
import g from "../components/gamification.module.css";
import g2 from "../components/gamificationV2.module.css";

/* Oslava nového rekordu / odznaku (lib/gamification). Texty prichádzajú hotové zo servera
   (AchievementHost). Ukáže sa po zatvorení súhrnu tréningu a ostane, kým ho klient nezavrie; až
   vtedy sa úspechy označia ako videné (client_achievements.seen_at), takže obnovenie ich už nezopakuje. Oslava (konfety / hviezdy /
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
  items: incoming,
  labels,
  celebration: incomingCelebration = "confetti",
}: {
  /** úspechy zo servera; prázdne pole = nič nové (už prijaté sa v modale držia ďalej) */
  items: UnlockItem[];
  /** zvolený štýl oslavy (rewards.ts); pri prefers-reduced-motion jednoduché zjavenie svetla */
  celebration?: CelebrationId;
  labels: { close: string; next: string; aria: string; viewAll: string; position: string };
}) {
  const [index, setIndex] = useState(0);
  // „záchytka“: prijaté úspechy ostávajú v stave, kým ich klient nezavrie — obnovenie layoutu (server už vráti
  // prázdny zoznam, lebo úspechy sú označené ako videné) modal nezruší
  const [items, setItems] = useState<UnlockItem[]>(incoming);
  const [celebration, setCelebration] = useState<CelebrationId>(incomingCelebration);
  const dismissed = useRef<Set<string>>(new Set());
  const primary = useRef<HTMLButtonElement>(null);

  const fresh = incoming.filter((i) => !dismissed.current.has(i.id) && !items.some((x) => x.id === i.id));
  if (fresh.length > 0) {
    setItems([...items, ...fresh]);
    setCelebration(incomingCelebration);
  }

  // ukáže sa až po zatvorení súhrnu tréningu (overlayGate.ts)
  const blocked = useOverlayBlocked("unlock");
  const open = items.length > 0;
  const visible = open && !blocked;
  useOverlayActive("unlock", open);

  const close = () => {
    if (items.length === 0) return;
    const ids = items.map((i) => i.id);
    ids.forEach((id) => dismissed.current.add(id));
    setItems([]);
    setIndex(0);
    void markAchievementsSeenAction(ids);
  };

  useEffect(() => {
    if (visible) primary.current?.focus();
  }, [visible, index]);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, items]);

  if (!visible) return null;
  const item = items[Math.min(index, items.length - 1)];
  const last = index >= items.length - 1;

  return (
    <div className={g.scrim} onClick={() => close()} data-testid="unlock-modal">
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
        <div className={g.dialogActions}>
          <button
            ref={primary}
            type="button"
            className="btn btn-primary"
            onClick={() => (last ? close() : setIndex(index + 1))}
          >
            {last ? labels.close : labels.next}
          </button>
          <div className={g.dialogSecondary}>
            {item.shareHref && <ShareButton href={item.shareHref} fileName="fitpilot-uspech.png" />}
            <Link href="/portal/uspechy" className={g.moreLink} onClick={() => close()}>
              {labels.viewAll}
            </Link>
          </div>
          {items.length > 1 && <span className={g.dialogPos}>{labels.position.replace("{index}", String(Math.min(index, items.length - 1) + 1)).replace("{total}", String(items.length))}</span>}
        </div>
      </div>
    </div>
  );
}
