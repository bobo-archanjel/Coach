"use client";

import { useEffect } from "react";
import { RetryButton } from "@/app/portal/RetryButton";
import { AlertIcon, Notice } from "./Notice";

// Záchranná sieť pre neočakávanú chybu (rovnaká ako app/portal/error.tsx) —
// navigácia ostane, namiesto prázdnej obrazovky chybová karta s opakovaním.
export default function PortalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Notice icon={<AlertIcon />} title="Niečo sa pokazilo" tone="alert" action={<RetryButton />}>
      Skontroluj pripojenie a skús to znova.
    </Notice>
  );
}
