"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

/* Načítanie portálu zlyhalo — jednoduché opätovné načítanie stránky.
   Pri zobrazení chyby berie fokus, aby bol screen-readerom oznámený spolu s role="alert". */
export function RetryButton() {
  const ref = useRef<HTMLButtonElement>(null);
  const t = useTranslations("common");

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <button
      ref={ref}
      type="button"
      className="btn btn-ghost"
      onClick={() => window.location.reload()}
    >
      {t("retry")}
    </button>
  );
}
