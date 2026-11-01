"use client";

import {
  memo,
  startTransition,
  useActionState,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import chatStyles from "./chat.module.css";
import { useSkinStyles } from "./uiSkin";

export type ChatMessage = {
  id: string;
  /** "system" = automatická správa (napr. GDPR zmazanie, 0019), nepatrí ani trénerovi ani klientovi */
  sender: "trainer" | "client" | "system";
  body: string;
  createdAt: string; // ISO
};

export type ChatSendState = { error: string | null };
export type ChatSendAction = (prev: ChatSendState, formData: FormData) => Promise<ChatSendState>;

const initialState: ChatSendState = { error: null };

const SendIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 12h13M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ChatGlyph = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M4.5 6.5A2.5 2.5 0 0 1 7 4h10a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 17 16H9l-4 3.2V16H7a2.5 2.5 0 0 1-2.5-2.5v-7Z"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
    />
    <path d="M8.5 9.2h7M8.5 12h4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const SmileIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.7" />
    <path d="M8.6 14.2c.8 1.2 2 1.8 3.4 1.8s2.6-.6 3.4-1.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <circle cx="9.3" cy="10" r="1.1" fill="currentColor" />
    <circle cx="14.7" cy="10" r="1.1" fill="currentColor" />
  </svg>
);

/** Rýchly výber emoji pre tréner ↔ klient chat, rozdelený do záložiek. Plný výber majú
    používatelia v mobilnej klávesnici; tu sú tie, ktoré sa v tomto chate hodia najviac.
    V rámci jednej kategórie nesmie byť emoji dvakrát (slúži ako React key). Prvých
    ~7 v každej kategórii je na mobile vidno bez posúvania — najčastejšie dávaj dopredu. */
const EMOJI_CATEGORIES: { label: string; icon: string; emoji: string[] }[] = [
  {
    label: "Nálada",
    icon: "😊",
    emoji: [
      "👍", "❤️", "😊", "😄", "😂", "😅", "😍", "🤩",
      "😎", "🥳", "😌", "🤔", "😐", "😕", "😔", "😢",
      "😩", "😤", "😡", "🤯", "😴", "🤒", "🤕", "🙏",
      "👏", "🙌", "💯", "✅",
    ],
  },
  {
    label: "Fitness",
    icon: "💪",
    emoji: [
      "💪", "🔥", "🏋️", "🏃", "🚴", "🏊", "🧘", "🤸",
      "🚶", "🥊", "⚽", "🎾", "⛰️", "🥵", "💦", "⚡",
      "⏱️", "🎯", "📈", "📉", "🏆", "🥇", "🛌", "🦵",
    ],
  },
  {
    label: "Jedlo",
    icon: "🥗",
    emoji: [
      "🥗", "🍎", "🍌", "🍓", "🫐", "🥑", "🥦", "🥕",
      "🍗", "🥩", "🐟", "🥚", "🧀", "🥛", "🍚", "🍝",
      "🥜", "🍞", "🍕", "🍔", "🍫", "🍰", "☕", "🍵",
      "💧", "🍺", "🍽️",
    ],
  },
];

/** Posun prsta (px), nad ktorým ťuknutie v páse berieme ako scroll, nie výber emoji. */
const TAP_SLOP_PX = 8;

/**
 * Správa len z 1–3 emoji (napr. "🔥" alebo "👍👍") sa vykreslí veľká a bez bubliny.
 * Číslice a #/* sú v Unicode tiež "Emoji_Component", preto rátame len obrázkové znaky
 * (Extended_Pictographic) a vlajky (Regional_Indicator) — "123" ostane bežná správa.
 */
function isJumboEmoji(text: string): boolean {
  const s = text.trim();
  if (!s || s.length > 32) return false;
  if (!/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(s)) return false;
  const rest = s.replace(
    /\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|[‍️⃣\s]/gu,
    "",
  );
  if (rest) return false;
  const seg = graphemeSegmenter();
  const count = seg ? [...seg.segment(s.replace(/\s/g, ""))].length : 1;
  return count <= 3;
}

// Formátovač vytvorený raz na modul, nie pri každej bubline a každom renderi
// (toLocale*String si ho interne vytvára zakaždým nanovo — pri 300 správach a
// re-renderi zoznamu to bol citeľný lag pri písaní na slabšom telefóne).
// Popisky dňa a času sa vykreslia na serveri aj v prehliadači a musia vyjsť
// rovnako (inak React hlási hydration mismatch): pevná zóna appky ako v
// lib/portal/data.ts (server na Verceli beží v UTC) a z Intl len čísla — slovenský
// text z Intl sa medzi ICU servera a Safari líši ("utorok 22. septembra" vs.
// "utorok, 22. septembra"), preto názvy dní a mesiacov z vlastných tabuliek.
const TZ = "Europe/Bratislava";
const PARTS_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  weekday: "short",
  hour: "numeric",
  minute: "numeric",
  hourCycle: "h23",
});
const WEEKDAY_SK: Record<string, string> = {
  Mon: "pondelok",
  Tue: "utorok",
  Wed: "streda",
  Thu: "štvrtok",
  Fri: "piatok",
  Sat: "sobota",
  Sun: "nedeľa",
};
const MONTH_SK = [
  "januára", "februára", "marca", "apríla", "mája", "júna",
  "júla", "augusta", "septembra", "októbra", "novembra", "decembra",
];
const pad2 = (n: number) => String(n).padStart(2, "0");

/** dátum a čas v zóne appky; `key` = "YYYY-MM-DD" na porovnanie dní */
function zoned(date: Date) {
  const p: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const { type, value } of PARTS_FMT.formatToParts(date)) p[type] = value;
  const year = Number(p.year);
  const month = Number(p.month);
  const day = Number(p.day);
  return {
    key: `${year}-${pad2(month)}-${pad2(day)}`,
    year,
    month,
    day,
    weekday: WEEKDAY_SK[p.weekday ?? ""] ?? "",
    // % 24 — niektoré staršie enginy vrátia o polnoci "24" aj pri h23
    time: `${pad2(Number(p.hour) % 24)}:${pad2(Number(p.minute))}`,
  };
}

let segmenter: Intl.Segmenter | null | undefined;
function graphemeSegmenter(): Intl.Segmenter | null {
  if (segmenter === undefined) {
    segmenter = "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
  }
  return segmenter;
}

function dayLabel(iso: string, todayKey: string, yesterdayKey: string): string {
  const d = zoned(new Date(iso));
  if (d.key === todayKey) return "Dnes";
  if (d.key === yesterdayKey) return "Včera";
  return `${d.weekday} ${d.day}. ${MONTH_SK[d.month - 1]}`;
}

const timeOf = (iso: string) => zoned(new Date(iso)).time;

/**
 * Návrat na kartu / do appky. `visibilitychange` aj `focus` zvyčajne prídu obe naraz
 * (predtým sa tak "označ prečítané" aj poll spustili dvakrát) — callback beží max.
 * raz za sekundu. Vráti cleanup.
 */
function onReturnToPage(cb: () => void): () => void {
  let last = 0;
  const handler = () => {
    if (document.visibilityState !== "visible") return;
    const now = Date.now();
    if (now - last < 1000) return;
    last = now;
    cb();
  };
  document.addEventListener("visibilitychange", handler);
  window.addEventListener("focus", handler);
  return () => {
    document.removeEventListener("visibilitychange", handler);
    window.removeEventListener("focus", handler);
  };
}

/** Poradie Realtime kanálov — každý mount má vlastný topic, viď efekt pollu. */
let channelSeq = 0;

type Row = ChatMessage & { _pending?: boolean };

/**
 * Zoznam bublín. Samostatný `memo` komponent: písanie v poli mení len stav composera,
 * takže zoznam (až 300 správ) sa pri každom stlačení klávesu znova nevykresľuje.
 * Popisky dňa/času a "jumbo" emoji sa rátajú raz na zmenu zoznamu.
 */
const MessageList = memo(function MessageList({
  rows,
  mySide,
  emptyTitle,
  emptyText,
}: {
  rows: Row[];
  mySide: "trainer" | "client";
  emptyTitle: string;
  emptyText: string;
}) {
  const styles = useSkinStyles("chat", chatStyles);
  const view = useMemo(() => {
    const today = zoned(new Date());
    // včerajší kalendárny deň (nie "teraz − 24 h", to by pri zmene času raz za rok minulo)
    const yesterdayKey = new Date(Date.UTC(today.year, today.month - 1, today.day - 1)).toISOString().slice(0, 10);
    const days = rows.map((m) => dayLabel(m.createdAt, today.key, yesterdayKey));
    return rows.map((m, i) => {
      const prev = rows[i - 1];
      const next = rows[i + 1];
      return {
        m,
        day: days[i],
        newDay: !prev || days[i - 1] !== days[i],
        turn: !prev || prev.sender !== m.sender,
        // čas len na poslednej bubline súvislej série od toho istého odosielateľa
        endOfTurn: !next || next.sender !== m.sender || days[i + 1] !== days[i],
        jumbo: m.sender !== "system" && isJumboEmoji(m.body),
      };
    });
  }, [rows]);

  if (view.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyTile} aria-hidden="true">
          <ChatGlyph />
        </span>
        <p className={styles.emptyTitle}>{emptyTitle}</p>
        <p className={styles.emptyHint}>{emptyText}</p>
      </div>
    );
  }

  return view.map(({ m, day, newDay, turn, endOfTurn, jumbo }) => {
    const mine = m.sender === mySide;
    const pendingRow = m._pending === true;

    if (m.sender === "system") {
      return (
        <div key={m.id} className={styles.group}>
          {newDay && <div className={styles.daySep}>{day}</div>}
          <div className={styles.systemRow}>
            <p className={styles.systemNote}>{m.body}</p>
            <span className={styles.meta}>{timeOf(m.createdAt)}</span>
          </div>
        </div>
      );
    }

    return (
      <div key={m.id} className={styles.group}>
        {newDay && <div className={styles.daySep}>{day}</div>}
        <div
          className={`${styles.row} ${mine ? styles.mine : styles.theirs} ${turn && !newDay ? styles.turn : ""} ${pendingRow ? styles.pending : ""}`}
        >
          <div className={`${styles.bubble} ${jumbo ? styles.jumbo : ""}`}>{m.body}</div>
          {(endOfTurn || pendingRow) && (
            <span className={styles.meta}>{pendingRow ? "odosielam…" : timeOf(m.createdAt)}</span>
          )}
        </div>
      </div>
    );
  });
});

/** Výška poľa podľa obsahu (max 120px, potom sa scrolluje vo vnútri). */
function fitHeight(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
}

const SEND_FAILED = "Správu sa nepodarilo odoslať — skontroluj pripojenie a skús znova.";
/** Pri odstupe menšom než toto (px) od spodku sa nová správa ešte "dotiahne" dole. */
const NEAR_BOTTOM_PX = 80;

export function ChatThread({
  messages,
  mySide,
  sendAction,
  emptyTitle,
  emptyText,
  placeholder = "Napíš správu…",
  fill = false,
  embedded = false,
  pollMs = 12_000,
  extraFields,
  onSeen,
  readOnly = false,
  markerUrl,
  realtimeTable,
  realtimeFilter,
  revealComposer = false,
}: {
  messages: ChatMessage[];
  mySide: "trainer" | "client";
  sendAction: ChatSendAction;
  emptyTitle: string;
  emptyText: string;
  placeholder?: string;
  fill?: boolean;
  embedded?: boolean;
  /** 0 vypne polling úplne (napr. AI Kouč — súkromná konverzácia klient↔AI, žiadna
      druhá strana nemôže pridať správu mimo vlastnej akcie na tejto istej stránke). */
  pollMs?: number;
  /** ďalšie skryté polia do FormData (napr. client_id na trénerskej strane) */
  extraFields?: Record<string, string>;
  /** označí správy od protistrany ako prečítané — volané pri otvorení a návrate na kartu */
  onSeen?: () => void | Promise<void>;
  /** len na čítanie — skryje composer (napr. tréner nahliadajúci do AI Kouč transkriptu klienta). */
  readOnly?: boolean;
  /** GET endpoint, ktorý vráti `{ marker }` = ID poslednej správy vlákna (app/api/chat/marker)
      — lacný dopyt na porovnanie pri polle, nech router.refresh() (celý round-trip +
      rerender stránky) beží len keď sa vlákno naozaj zmenilo, nie na každý tik.
      Bez tejto props padá na starší, drahší vzor (vždy refresh). Fetch, nie server
      action: tie idú cez jednu frontu a poll by zdržiaval odoslanie správy. */
  markerUrl?: string;
  /**
   * Meno Postgres tabuľky (napr. "messages"), na ktorej sa má počúvať Supabase
   * Realtime INSERT namiesto čakania na ďalší poll tik — okamžitá odozva pri
   * novej správe od protistrany (ROADMAP: chat bol dovtedy čisto poll-based,
   * ~12 s oneskorenie). ŽIADNY vlastný `eq` filter na klientovi netreba: Realtime
   * postgres_changes vyhodnocuje SELECT RLS danej tabuľky za pripojeného
   * používateľa, takže cez tento kanál nepríde nič, čo by si používateľ beztak
   * nemohol prečítať cez bežný dopyt (RLS `messages_select`, 0008). Polling
   * (`pollMs`) ostáva bežať ako záložná sieť pre prípad výpadku Realtime spojenia.
   */
  realtimeTable?: string;
  /** Realtime filter (napr. `client_id=eq.<id>`) — tréner tak nedostáva udalosti
      z vlákien ostatných klientov (každá by spustila zbytočný marker dopyt). */
  realtimeFilter?: string;
  /**
   * Po otvorení vlákna posunie stránku tak, aby bolo pole na písanie hneď viditeľné
   * (trénerove Správy — vlákno je pod hlavičkou a na mobile bolo pole až pod okrajom).
   * Bez focusu: na telefóne by sa inak hneď otvorila klávesnica.
   */
  revealComposer?: boolean;
}) {
  const styles = useSkinStyles("chat", chatStyles);
  const router = useRouter();
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLFormElement>(null);
  // Bol fokus v poli, keď používateľ ťukol na Odoslať? (oprava zatvárania klávesnice)
  const keepFocusRef = useRef(false);
  // Je vlákno posunuté pri spodku? Mení sa pri scrollovaní, predvolene áno (otvorenie).
  const nearBottomRef = useRef(true);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiCat, setEmojiCat] = useState(0);
  // začiatok dotyku v páse emoji — rozlíšenie ťuknutia od vodorovného scrollu
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Odoslanie odolné voči výpadku siete: zlyhaný fetch server action (slabý signál,
  // výťah) predtým vyhodil výnimku a zhodil celú appku na "Application error".
  // Pri akejkoľvek chybe (sieť aj odmietnutie serverom) sa text vráti do poľa —
  // optimistická bublina zmizne, ale rozpísaná správa sa nestratí.
  async function sendSafely(prev: ChatSendState, fd: FormData): Promise<ChatSendState> {
    const body = String(fd.get("body") ?? "");
    let res: ChatSendState;
    try {
      res = await sendAction(prev, fd);
    } catch {
      res = { error: SEND_FAILED };
    }
    if (res.error) {
      setText((current) => current || body);
      requestAnimationFrame(() => fitHeight(inputRef.current));
    }
    return res;
  }
  const [state, formAction, pending] = useActionState(sendSafely, initialState);

  // len pri otvorení (mount) — nie pri každej novej správe, aby to neťahalo stránku,
  // keď tréner práve číta staršie správy vyššie
  useEffect(() => {
    if (revealComposer) composerRef.current?.scrollIntoView({ block: "end", behavior: "instant" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [optimistic, addOptimistic] = useOptimistic<Row[], string>(messages, (curr, body) => [
    ...curr,
    { id: `pending-${curr.length}`, sender: mySide, body, createdAt: new Date().toISOString(), _pending: true },
  ]);

  // Na spodok pri otvorení, po vlastnej správe, alebo keď už je používateľ pri spodku.
  // Kto práve číta staršie správy vyššie, toho nová správa od protistrany nestiahne dole.
  const lastSender = optimistic[optimistic.length - 1]?.sender;
  useEffect(() => {
    const el = scrollRef.current;
    if (el && (lastSender === mySide || nearBottomRef.current)) el.scrollTop = el.scrollHeight;
  }, [optimistic.length, lastSender, mySide]);

  // Vlákno má na mobile pevnú výšku — keď pod ním narastie composer (otvorený pás emoji,
  // viacriadkový text) alebo sa chat zmení s klávesnicou, zmenší sa plocha správ, ale
  // scrollTop ostane rovnaký a posledné správy skončia schované pod composerom.
  // Kto bol pri spodku, toho držíme pri spodku. Posúva sa len vnútro vlákna (nie
  // stránka), takže to nezasahuje do posunov okolo klávesnice (KeyboardState).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let lastHeight = el.clientHeight;
    const ro = new ResizeObserver(() => {
      const h = el.clientHeight;
      if (h !== lastHeight && nearBottomRef.current) el.scrollTop = el.scrollHeight;
      lastHeight = h;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Server action prop (`onSeen`) príde po KAŽDEJ RSC odpovedi ako nová funkcia
  // (tréner ju navyše .bind-uje). V deps efektu to bola slučka: onSeen → revalidatePath
  // → nový strom → nové onSeen → efekt znova → … (zmerané 49–67 POSTov za 30 s
  // nečinného chatu). Efekt preto beží len pri mounte a aktuálnu funkciu číta z refu.
  const onSeenRef = useRef(onSeen);
  useEffect(() => {
    onSeenRef.current = onSeen;
  });
  const hasOnSeen = Boolean(onSeen);

  // označ prečítané pri otvorení a pri návrate na kartu (nie na každý poll)
  useEffect(() => {
    if (!hasOnSeen) return;
    const markSeen = () => {
      const fn = onSeenRef.current;
      if (fn) void Promise.resolve(fn()).catch(() => {});
    };
    markSeen();
    return onReturnToPage(markSeen);
  }, [hasOnSeen]);

  // Marker poslednej správy, ktorú má stránka aktuálne vykreslenú — aktualizuje sa
  // pri každej zmene `messages` (vrátane tej, čo príde cez router.refresh() nižšie).
  const lastMarkerRef = useRef<string | null>(messages[messages.length - 1]?.id ?? null);
  useEffect(() => {
    lastMarkerRef.current = messages[messages.length - 1]?.id ?? null;
  }, [messages]);

  // refresh-based doručenie: poll kým je karta viditeľná + pri návrate na kartu,
  // plus (ak je `realtimeTable` zadané) okamžitý Realtime push namiesto čakania
  // na ďalší tik. S `markerUrl` ide o dvojkrokový poll — lacný dopyt na ID
  // poslednej správy (jeden indexovaný riadok) namiesto vždy plného router.refresh()
  // (celý round-trip + rerender stránky, aj keď väčšinu tikov nepribudla žiadna
  // správa). Bez nej (napr. AI Kouč pri pollMs=0) sa polling úplne vypne.
  // Deps sú len hodnoty (string/number), nie funkcie z RSC — efekt sa po refreshi
  // znova nespúšťa, takže Realtime kanál ostáva prihlásený (predtým sa po každom
  // refreshi odhlásil a nový s rovnakým topicom už nenabehol).
  useEffect(() => {
    let alive = true;
    let inflight: AbortController | null = null;

    const fetchMarker = async (url: string): Promise<string | null | undefined> => {
      inflight?.abort();
      const ctrl = new AbortController();
      inflight = ctrl;
      try {
        const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
        if (!res.ok) return undefined;
        return ((await res.json()) as { marker: string | null }).marker;
      } catch {
        return undefined; // sieť / zrušené — ďalší tik to skúsi znova
      }
    };

    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      if (!markerUrl) {
        router.refresh();
        return;
      }
      const marker = await fetchMarker(markerUrl);
      if (!alive || marker === undefined) return;
      if (marker !== lastMarkerRef.current) {
        lastMarkerRef.current = marker;
        router.refresh();
      }
    };

    let intervalId: number | null = null;
    let offReturn: (() => void) | null = null;
    if (pollMs) {
      intervalId = window.setInterval(tick, pollMs);
      offReturn = onReturnToPage(() => void tick());
      // Vlákno mohlo prísť z klientskej router cache (staleTimes, next.config.ts) —
      // jeden lacný marker hneď pri otvorení, nie až po prvom tiku.
      if (markerUrl) void tick();
    }

    // Realtime kanál je nezávislý od `pollMs` — aj keď je polling vypnutý (0),
    // Realtime samo o sebe stále dáva okamžitú odozvu (napr. by sa hodilo pre
    // AI Kouč pri budúcom proaktívnom oslovení klienta appkou).
    // Supabase browser klient (~55 kB gz) sa načíta až tu, nie v bundli stránky.
    // Topic je unikátny na mount: kanál s rovnakým menom, ktorý sa ešte odhlasuje,
    // by realtime-js vrátil namiesto nového a subscribe() by nič neurobil.
    let removeChannel: (() => void) | null = null;
    if (realtimeTable) {
      void import("@/lib/supabase/client").then(({ createClient }) => {
        if (!alive) return;
        const supabase = createClient();
        const channel = supabase
          .channel(`chat-${realtimeTable}-${mySide}-${++channelSeq}`)
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: realtimeTable, filter: realtimeFilter },
            (payload) => {
              // Vlastnú správu už doručila odosielacia akcia (revalidatePath) — bez
              // tohto by každé odoslanie re-renderovalo stránku ešte raz.
              if ((payload.new as { sender?: string } | undefined)?.sender === mySide) return;
              void tick();
            },
          )
          .subscribe();
        removeChannel = () => void supabase.removeChannel(channel);
      });
    }

    return () => {
      alive = false;
      inflight?.abort();
      if (intervalId != null) window.clearInterval(intervalId);
      offReturn?.();
      removeChannel?.();
    };
  }, [router, pollMs, markerUrl, realtimeTable, realtimeFilter, mySide]);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    if (!body || pending) return;
    const fd = new FormData();
    fd.set("body", body);
    for (const [k, v] of Object.entries(extraFields ?? {})) fd.set(k, v);
    startTransition(() => {
      addOptimistic(body);
      formAction(fd);
    });
    setText("");
    requestAnimationFrame(() => fitHeight(inputRef.current));
    // Fallback k preventDefault na tlačidle: ak by prehliadač fokus predsa vzal,
    // vráť ho (v rámci toho istého ťuknutia — iOS klávesnicu nechá otvorenú).
    if (keepFocusRef.current) {
      keepFocusRef.current = false;
      inputRef.current?.focus({ preventScroll: true });
    }
  }

  /**
   * Vloží emoji na pozíciu kurzora. Ak bolo pole aktívne (otvorená klávesnica), fokus
   * ostane a kurzor sa posunie za emoji. Ak nebolo, klávesnicu NEotvárame — klient
   * môže poslať len "👍" jedným ťuknutím na emoji a druhým na Odoslať.
   */
  function insertEmoji(emoji: string) {
    const el = inputRef.current;
    const focused = !!el && document.activeElement === el;
    const start = focused && el ? el.selectionStart : text.length;
    const end = focused && el ? el.selectionEnd : text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      fitHeight(input);
      if (focused) {
        const caret = start + emoji.length;
        input.setSelectionRange(caret, caret);
      }
    });
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter odošle len na desktope; na dotykových zariadeniach je Enter nový riadok.
    const enterSends = typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches;
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && enterSends) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className={`${styles.thread} ${fill ? styles.fill : ""} ${embedded ? styles.embedded : ""}`}>
      <div
        className={styles.scroll}
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-label="História správ"
        tabIndex={0}
        onScroll={(e) => {
          const el = e.currentTarget;
          nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
        }}
      >
        <MessageList rows={optimistic} mySide={mySide} emptyTitle={emptyTitle} emptyText={emptyText} />
      </div>

      {!readOnly && (
        <form
          ref={composerRef}
          className={styles.composer}
          onSubmit={submit}
          // Celý composer je "pri poli": ťuknutie medzi tlačidlá (medzery v páse emoji,
          // okraj okolo poľa) klávesnicu nezatvára. KeyboardState tu fokus nezruší
          // (data-keep-keyboard) a preventDefault zabráni, aby ho zrušil Safari —
          // inak klávesnicu niekedy zasunul s fokusom ponechaným v poli.
          data-keep-keyboard=""
          onTouchEnd={(e) => {
            const target = e.target as Element;
            if (target.closest("button, textarea")) return; // vlastná akcia / kurzor v poli
            if (e.cancelable && document.activeElement === inputRef.current) e.preventDefault();
          }}
        >
          {emojiOpen && (
            <div id="chat-emoji-strip" className={styles.emojiPanel}>
              <div className={styles.emojiTabs} role="tablist" aria-label="Kategórie emoji">
                {EMOJI_CATEGORIES.map((cat, i) => (
                  <button
                    key={cat.label}
                    type="button"
                    role="tab"
                    aria-selected={i === emojiCat}
                    className={`${styles.emojiTab} ${i === emojiCat ? styles.emojiTabOn : ""}`}
                    // ani prepnutie záložky nesmie zatvoriť klávesnicu
                    onMouseDown={(e) => e.preventDefault()}
                    onTouchEnd={(e) => {
                      e.preventDefault();
                      setEmojiCat(i);
                    }}
                    onClick={() => setEmojiCat(i)}
                  >
                    <span className={styles.emojiTabIcon} aria-hidden="true">
                      {cat.icon}
                    </span>
                    {/* na mobile len ikona (jeden riadok = viac miesta pre správy) */}
                    <span className={styles.emojiTabLabel}>{cat.label}</span>
                  </button>
                ))}
              </div>
              <div
                // key = nová kategória začína od začiatku pásu, nie na pozícii predošlej
                key={emojiCat}
                className={styles.emojiStrip}
                role="tabpanel"
                aria-label={EMOJI_CATEGORIES[emojiCat].label}
                onTouchStart={(e) => {
                  const t = e.touches[0];
                  touchStartRef.current = t ? { x: t.clientX, y: t.clientY } : null;
                }}
              >
                {EMOJI_CATEGORIES[emojiCat].emoji.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className={styles.emojiBtn}
                    aria-label={`Vložiť ${emoji}`}
                    // rovnaký vzor ako Odoslať: ťuknutie nesmie vziať fokus poľu (klávesnica ostane)
                    onMouseDown={(e) => e.preventDefault()}
                    onTouchEnd={(e) => {
                      const start = touchStartRef.current;
                      const t = e.changedTouches[0];
                      touchStartRef.current = null;
                      // prst sa posunul = scroll pásu, nie výber
                      if (start && t && Math.hypot(t.clientX - start.x, t.clientY - start.y) > TAP_SLOP_PX) return;
                      e.preventDefault();
                      insertEmoji(emoji);
                    }}
                    onClick={() => insertEmoji(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button
            type="button"
            className={`${styles.emojiToggle} ${emojiOpen ? styles.emojiToggleOn : ""}`}
            aria-label={emojiOpen ? "Skryť emoji" : "Pridať emoji"}
            aria-expanded={emojiOpen}
            aria-controls="chat-emoji-strip"
            onMouseDown={(e) => e.preventDefault()}
            onTouchEnd={(e) => {
              e.preventDefault();
              setEmojiOpen((o) => !o);
            }}
            onClick={() => setEmojiOpen((o) => !o)}
          >
            <SmileIcon />
          </button>
          <textarea
            ref={inputRef}
            className={styles.input}
            rows={1}
            value={text}
            placeholder={placeholder}
            onChange={(e) => {
              setText(e.target.value);
              fitHeight(e.currentTarget);
            }}
            onKeyDown={onKeyDown}
            aria-label="Napísať správu"
          />
          <button
            type="submit"
            className={styles.send}
            disabled={pending || !text.trim()}
            aria-label="Odoslať"
            // Ťuknutie na Odoslať nesmie vziať fokus poľu — inak sa na telefóne po každej
            // správe zatvorí klávesnica. preventDefault zabráni presunu fokusu, samotný
            // click (odoslanie formulára) ostáva.
            onPointerDown={(e) => {
              keepFocusRef.current = document.activeElement === inputRef.current;
              e.preventDefault();
            }}
            onMouseDown={(e) => e.preventDefault()}
            // iOS: ťuknutie na Odoslať pri otvorenej klávesnici najprv zrušilo fokus poľa,
            // klávesnica sa začala zasúvať, chat zmenil výšku a "click" prišiel už mimo
            // tlačidla — odoslalo sa až na druhé ťuknutie. Odosielame preto hneď pri
            // zdvihnutí prsta; preventDefault zabráni strate fokusu (klávesnica ostane)
            // aj následnému click (žiadne dvojité odoslanie).
            onTouchEnd={(e) => {
              if (pending || !text.trim()) return;
              e.preventDefault();
              keepFocusRef.current = document.activeElement === inputRef.current;
              submit();
            }}
          >
            <SendIcon />
          </button>
        </form>
      )}
      {!readOnly && state.error && <p className={styles.error}>{state.error}</p>}
    </div>
  );
}
