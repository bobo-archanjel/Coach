"use client";

import { useOptimistic } from "react";
import { AddClientForm } from "./AddClientForm";
import { ClientRoster, type RosterItem } from "./ClientRoster";

/**
 * Optimistic UI (pokracovanie UX checklistu, feature/navod) — "Vytvoriť záznam"
 * (manuálne pridanie bez kódu) pozná meno a cieľ hneď pri odoslaní, takže karta
 * sa objaví v zozname OKAMŽITE, nečaká sa na server round-trip. Server akcia
 * (actions.ts) na úspech volá `revalidatePath("/dashboard")` — nové `initialItems`
 * s reálnym id nahradia optimistickú kartu, useOptimistic sa vráti na base stav.
 * Pridanie kódom nejde optimisticky — meno klienta zistíme až zo servera.
 */
export function ClientsBoard({ initialItems }: { initialItems: RosterItem[] }) {
  const [items, addOptimisticClient] = useOptimistic(initialItems, (state, newItem: RosterItem) => [
    newItem,
    ...state,
  ]);

  return (
    <>
      <AddClientForm onOptimisticAdd={addOptimisticClient} />
      <ClientRoster items={items} />
    </>
  );
}
