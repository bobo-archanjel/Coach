"use client";

import { useTranslations } from "next-intl";
import { formatPortion } from "@/lib/portions";

/** Text porcie podľa pravidla z lib/portions.ts (formatPortion): „2 ks (110 g)“, „250 ml“, „120 g“. */
export function usePortionLabel() {
  const t = useTranslations("food.portion");
  return (p: { grams: number; unit?: string | null; qty?: number | null; base?: string | null }) =>
    formatPortion((key, values) => t(key, values), p);
}
