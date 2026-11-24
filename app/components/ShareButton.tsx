"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import g from "./gamification.module.css";

/* „Zdieľať“ úspech (rekord, odznak, výzva, týždenný súhrn): stiahne kartu 1080×1920 z
   /api/gamification/share (server overí vlastníctvo) a ak prehliadač vie Web Share API so
   súbormi, otvorí systémové zdieľanie; inak kartu stiahne ako PNG. Zdieľanie je dostupné
   všetkým tarifám — mení sa len značka na karte (Business = značka trénera). */

export function ShareButton({ href, fileName, small = true }: { href: string; fileName: string; small?: boolean }) {
  const t = useTranslations("gamification.share");
  const [state, setState] = useState<"idle" | "busy" | "saved" | "failed">("idle");

  async function onShare() {
    if (state === "busy") return;
    setState("busy");
    try {
      const res = await fetch(href, { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const file = new File([blob], fileName, { type: "image/png" });
      if (typeof navigator !== "undefined" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: t("title") });
          setState("idle");
          return;
        } catch (err) {
          // zrušené používateľom — nie je to chyba
          if (err instanceof DOMException && err.name === "AbortError") {
            setState("idle");
            return;
          }
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      setState("saved");
    } catch {
      setState("failed");
    }
  }

  return (
    <span className={g.shareRow}>
      <button
        type="button"
        className={`btn btn-ghost ${small ? "btn-sm" : ""}`}
        onClick={onShare}
        disabled={state === "busy"}
        data-testid="share-button"
      >
        {state === "busy" ? t("preparing") : t("button")}
      </button>
      <span className={g.shareMsg} role="status" aria-live="polite">
        {state === "saved" ? t("saved") : state === "failed" ? t("failed") : ""}
      </span>
    </span>
  );
}
