"use client";

import { useEffect } from "react";
import { AlertIcon, Notice } from "./Notice";
import { RetryButton } from "./RetryButton";

// Záchranná sieť pre neočakávanú chybu v portáli (napr. výpadok siete počas akcie)
// — namiesto čiernej obrazovky "Application error" ostane navigácia (layout) a
// rovnaká chybová karta ako pri zlyhanom načítaní karty portálu.
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
