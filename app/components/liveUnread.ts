// Živý počet neprečítaných správ zo zvončeka pre ostatné odznaky: „Správy“ v menu trénera,
// bodka pri „Chat“ v portáli a „N správ“ v zozname klientov.
//
// Tieto odznaky vykreslí server pri načítaní stránky (layout / stránka) a sami sa nemenia.
// Zvonček počty načítava znova: Realtime pri novej správe, „prečítané“ z chatu, zmena
// stránky, fokus. Každé načítanie zverejní sem, takže odznaky nečakajú na obnovenie stránky.
//
// Platí novšie číslo: živé sa použije, len ak ho zvonček zverejnil až po tom, čo komponent
// dostal (alebo zmenil) čísla zo servera. Čerstvo načítanú stránku tak nikdy neprepíše
// staršie načítanie zvončeka a údaje z predošlého prihlásenia nepresiaknu do nového.
// Naraz je pripojený len jeden zvonček (dashboard, alebo jeden slot portálu).

import { useState, useSyncExternalStore } from "react";

export interface LiveUnread {
  /** poradie zverejnenia (rastie) */
  seq: number;
  /** neprečítané správy spolu */
  total: number;
  /** po klientoch (zvonček trénera); `null` = rozpis neznámy, platia čísla zo servera */
  byClient: ReadonlyMap<string, number> | null;
}

let current: LiveUnread | null = null;
const listeners = new Set<() => void>();

/** Zvonček: zverejní práve načítaný (alebo optimisticky zmenený) počet neprečítaných. */
export function publishLiveUnread(total: number, byClient?: readonly { id: string; count: number }[] | null): void {
  current = {
    seq: (current?.seq ?? 0) + 1,
    total,
    // „všetko prečítané“ (total 0) vyprázdni aj rozpis, aj keby ho optimistická zmena nechala
    byClient: total === 0 ? new Map() : byClient ? new Map(byClient.map((c) => [c.id, c.count])) : null,
  };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/**
 * Živý počet zo zvončeka, ak je novší než čísla zo servera, inak `null` (= použi server).
 * `serverData`: hodnota zo servera, ktorej zmena znamená nové vykreslenie serverom
 * (počet v menu, pole položiek zoznamu).
 */
export function useLiveUnread(serverData: unknown): LiveUnread | null {
  const live = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
  // seq posledného zverejnenia v čase, keď prišli čísla zo servera
  const [base, setBase] = useState(() => ({ serverData, seq: current?.seq ?? 0 }));
  if (!Object.is(base.serverData, serverData)) setBase({ serverData, seq: current?.seq ?? 0 });
  return live && live.seq > base.seq ? live : null;
}
