"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { SectionTabs } from "@/app/components/SectionTabs";

export interface ClientDetailSection {
  id: string;
  label: string;
  content: ReactNode;
}

/**
 * Detail klienta bol jeden dlhý scroll cez všetky karty naraz — neprehľadné pri
 * viacerých sekciách (Tréningy, Jedálničky, Analytika, Info). Toto sú záložky sekcií
 * SCOPOVANÉ na túto stránku (nie globálna dashboard nav): rad tlačidiel hore — na
 * počítači aj na mobile — a obsah vybranej sekcie pod nimi. Samotné prepínanie je
 * v zdieľanom `SectionTabs` (rovnaké záložky majú aj Nastavenia); úvodná sekcia z
 * `?sekcia=` (napr. odkaz „Upraviť makrá“ → jedalnicky).
 */
export function ClientDetailTabs({ sections, initialId }: { sections: ClientDetailSection[]; initialId?: string }) {
  const t = useTranslations("clientDetail");
  return (
    <SectionTabs
      sections={sections}
      initialId={initialId}
      param="sekcia"
      ariaLabel={t("tabsAria")}
      tourPrefix="client-tab-"
      tourId="client-tabs"
      layout="top"
    />
  );
}
