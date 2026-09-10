"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useOptimistic,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "./chat.module.css";

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

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(today);
  y.setDate(y.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return "Dnes";
  if (sameDay(d, y)) return "Včera";
  return d.toLocaleDateString("sk-SK", { weekday: "long", day: "numeric", month: "long" });
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" });

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
  checkNewAction,
  realtimeTable,
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
  /** Vráti ID poslednej správy vlákna — lacný dopyt na porovnanie pri polle, nech
      router.refresh() (celý round-trip + rerender stránky) beží len keď sa vlákno
      naozaj zmenilo, nie na každý tik. Bez tejto props padá na starší, drahší vzor
      (vždy refresh) — držané kvôli spätnej kompatibilite, nové použitia by ju mali dať vždy. */
  checkNewAction?: () => Promise<string | null>;
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
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(sendAction, initialState);
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  type Row = ChatMessage & { _pending?: boolean };
  const [optimistic, addOptimistic] = useOptimistic<Row[], string>(messages, (curr, body) => [
    ...curr,
    { id: `pending-${curr.length}`, sender: mySide, body, createdAt: new Date().toISOString(), _pending: true },
  ]);

  // auto-scroll na spodok pri nových správach
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [optimistic.length]);

  // označ prečítané pri otvorení a pri návrate na kartu (nie na každý poll)
  useEffect(() => {
    if (!onSeen) return;
    void Promise.resolve(onSeen()).catch(() => {});
    const onFocus = () => {
      if (document.visibilityState === "visible") void Promise.resolve(onSeen()).catch(() => {});
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [onSeen]);

  // Marker poslednej správy, ktorú má stránka aktuálne vykreslenú — aktualizuje sa
  // pri každej zmene `messages` (vrátane tej, čo príde cez router.refresh() nižšie).
  const lastMarkerRef = useRef<string | null>(messages[messages.length - 1]?.id ?? null);
  useEffect(() => {
    lastMarkerRef.current = messages[messages.length - 1]?.id ?? null;
  }, [messages]);

  // refresh-based doručenie: poll kým je karta viditeľná + pri návrate na kartu,
  // plus (ak je `realtimeTable` zadané) okamžitý Realtime push namiesto čakania
  // na ďalší tik. S `checkNewAction` ide o dvojkrokový poll — lacný dopyt na ID
  // poslednej správy (jeden indexovaný riadok) namiesto vždy plného router.refresh()
  // (celý round-trip + rerender stránky, aj keď väčšinu tikov nepribudla žiadna
  // správa). Bez nej (napr. AI Kouč pri pollMs=0) sa polling úplne vypne.
  useEffect(() => {
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      if (!checkNewAction) {
        router.refresh();
        return;
      }
      const marker = await checkNewAction().catch(() => lastMarkerRef.current);
      if (marker !== lastMarkerRef.current) {
        lastMarkerRef.current = marker;
        router.refresh();
      }
    };

    let intervalId: number | null = null;
    if (pollMs) {
      intervalId = window.setInterval(tick, pollMs);
      document.addEventListener("visibilitychange", tick);
      window.addEventListener("focus", tick);
    }

    // Realtime kanál je nezávislý od `pollMs` — aj keď je polling vypnutý (0),
    // Realtime samo o sebe stále dáva okamžitú odozvu (napr. by sa hodilo pre
    // AI Kouč pri budúcom proaktívnom oslovení klienta appkou).
    let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null = null;
    if (realtimeTable) {
      const supabase = createClient();
      channel = supabase
        .channel(`chat-${realtimeTable}-${mySide}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: realtimeTable }, () => {
          void tick();
        })
        .subscribe();
    }

    return () => {
      if (intervalId != null) window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
      if (channel) void channel.unsubscribe();
    };
  }, [router, pollMs, checkNewAction, realtimeTable, mySide]);

  function grow() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

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
    requestAnimationFrame(grow);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter odošle len na desktope; na dotykových zariadeniach je Enter nový riadok.
    const enterSends = typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches;
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && enterSends) {
      e.preventDefault();
      submit();
    }
  }

  const hasMessages = optimistic.length > 0;

  return (
    <div className={`${styles.thread} ${fill ? styles.fill : ""} ${embedded ? styles.embedded : ""}`}>
      <div className={styles.scroll} ref={scrollRef} role="log" aria-live="polite" aria-label="História správ" tabIndex={0}>
        {hasMessages ? (
          optimistic.map((m, i) => {
            const prev = optimistic[i - 1];
            const next = optimistic[i + 1];
            const mine = m.sender === mySide;
            const newDay = !prev || dayLabel(prev.createdAt) !== dayLabel(m.createdAt);
            const turn = !prev || prev.sender !== m.sender;
            const pendingRow = m._pending === true;
            // čas len na poslednej bubline súvislej série od toho istého odosielateľa
            const endOfTurn = !next || next.sender !== m.sender || dayLabel(next.createdAt) !== dayLabel(m.createdAt);

            if (m.sender === "system") {
              return (
                <div key={m.id} className={styles.group}>
                  {newDay && <div className={styles.daySep}>{dayLabel(m.createdAt)}</div>}
                  <div className={styles.systemRow}>
                    <p className={styles.systemNote}>{m.body}</p>
                    <span className={styles.meta}>{timeOf(m.createdAt)}</span>
                  </div>
                </div>
              );
            }

            return (
              <div key={m.id} className={styles.group}>
                {newDay && <div className={styles.daySep}>{dayLabel(m.createdAt)}</div>}
                <div
                  className={`${styles.row} ${mine ? styles.mine : styles.theirs} ${turn && !newDay ? styles.turn : ""} ${pendingRow ? styles.pending : ""}`}
                >
                  <div className={styles.bubble}>{m.body}</div>
                  {(endOfTurn || pendingRow) && (
                    <span className={styles.meta}>{pendingRow ? "odosielam…" : timeOf(m.createdAt)}</span>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className={styles.empty}>
            <span className={styles.emptyTile} aria-hidden="true">
              <ChatGlyph />
            </span>
            <p className={styles.emptyTitle}>{emptyTitle}</p>
            <p className={styles.emptyHint}>{emptyText}</p>
          </div>
        )}
      </div>

      {!readOnly && (
        <form className={styles.composer} onSubmit={submit}>
          <textarea
            ref={inputRef}
            className={styles.input}
            rows={1}
            value={text}
            placeholder={placeholder}
            onChange={(e) => {
              setText(e.target.value);
              grow();
            }}
            onKeyDown={onKeyDown}
            aria-label="Napísať správu"
          />
          <button type="submit" className={styles.send} disabled={pending || !text.trim()} aria-label="Odoslať">
            <SendIcon />
          </button>
        </form>
      )}
      {!readOnly && state.error && <p className={styles.error}>{state.error}</p>}
    </div>
  );
}
