"use client";

import { useEffect, useRef, useState } from "react";
import type { CelebrationId } from "@/lib/gamification/rewards";
import { CelebrationBurst } from "./CelebrationBurst";
import { claimRingsCelebrationAction } from "./gamificationActions";
import { useOverlayBlocked } from "./overlayGate";
import g2 from "../components/gamificationV2.module.css";

/* Oslava uzavretých denných prstencov: po načítaní server (claimRingsCelebrationAction) sám prepočíta prstence
   a deň zapíše — raz za deň, +10 XP; tu sa len prehrá zvolený štýl osláv (konfety / hviezdy / ohňostroj, pri
   prefers-reduced-motion jemné zjavenie svetla) a krátka správa. Bez migrácie 0087 server vráti persisted:false
   a deň sa zapamätá v prehliadači (localStorage), aby sa oslava neopakovala. */

export const RINGS_DAY_KEY = "fp-rings-celebrated";
const VISIBLE_MS = 6500;

export function RingsCelebration({
  today,
  style,
  labels,
}: {
  today: string;
  style: CelebrationId;
  labels: { message: string; xp: string; close: string };
}) {
  const [shown, setShown] = useState<{ xp: number } | null>(null);
  const started = useRef(false);
  // toast počká na súhrn tréningu a oslavu úspechov (overlayGate.ts)
  const blocked = useOverlayBlocked("rings");

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    try {
      if (window.localStorage.getItem(RINGS_DAY_KEY) === today) return;
    } catch {
      /* súkromný režim: bez pamäte, server rozhodne */
    }
    void claimRingsCelebrationAction().then((res) => {
      if (res.status !== "celebrate") return;
      if (!res.persisted) {
        try {
          window.localStorage.setItem(RINGS_DAY_KEY, today);
        } catch {
          /* ignoruj */
        }
      }
      setShown({ xp: res.xp });
    });
  }, [today]);

  useEffect(() => {
    if (!shown || blocked) return;
    const id = window.setTimeout(() => setShown(null), VISIBLE_MS);
    return () => window.clearTimeout(id);
  }, [shown, blocked]);

  if (!shown || blocked) return null;
  return (
    <div className={g2.ringsCelebrate} data-testid="rings-celebration">
      <CelebrationBurst style={style} />
      <div className={g2.ringsToast} role="status" aria-live="polite">
        <span className={g2.ringsToastMsg}>{labels.message}</span>
        {shown.xp > 0 && <span className={g2.ringsToastXp}>{labels.xp.replace("{xp}", String(shown.xp))}</span>}
        <button type="button" className={g2.ringsToastClose} onClick={() => setShown(null)} aria-label={labels.close}>
          ×
        </button>
      </div>
    </div>
  );
}
