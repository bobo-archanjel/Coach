"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { RetryButton } from "@/app/portal/RetryButton";
import { AlertIcon, Notice } from "./Notice";

// Záchranná sieť pre neočakávanú chybu (rovnaká ako app/portal/error.tsx) —
// navigácia ostane, namiesto prázdnej obrazovky chybová karta s opakovaním.
export default function PortalError({ error }: { error: Error & { digest?: string } }) {
  const t = useTranslations("common");
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Notice icon={<AlertIcon />} title={t("errorTitle")} tone="alert" action={<RetryButton />}>
      {t("errorText")}
    </Notice>
  );
}
