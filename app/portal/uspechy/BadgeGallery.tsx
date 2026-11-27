"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import g from "@/app/components/gamification.module.css";

/* Odznaky: zbalene 4 (získané, potom najbližšie k odomknutiu) + „Zobraziť všetky“; rozbalene celá galéria po kategóriách. */
export function BadgeGallery({ collapsed, full }: { collapsed: ReactNode; full: ReactNode }) {
  const t = useTranslations("gamification.gallery");
  const [open, setOpen] = useState(false);
  return (
    <>
      {open ? full : collapsed}
      <div className={g.galleryMore}>
        <button type="button" className="btn btn-ghost btn-sm" aria-expanded={open} onClick={() => setOpen((v) => !v)} data-testid="badges-toggle">
          {open ? t("hideAll") : t("showAll")}
        </button>
      </div>
    </>
  );
}
