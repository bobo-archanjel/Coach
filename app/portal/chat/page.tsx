import { ChatThread } from "../../components/ChatThread";
import { getPortalChat } from "@/lib/portal/data";
import { markClientChatSeenAction, sendClientMessageAction } from "../actions";
import { AlertIcon, Notice } from "../Notice";
import { ProfileIcon } from "../icons";
import { RetryButton } from "../RetryButton";
import { previewResult } from "./preview";
import styles from "../portal.module.css";

/* /portal/chat — obojsmerné vlákno s trénerom (Track "Klient" bod 2).
   coach_notes (dnešný odkaz na karte Dnes) ostáva samostatný.
   Refresh-based: ChatThread polluje (len lacný marker-check, feature/optimalizacia)
   ako záložná sieť, doručenie novej správy je teraz primárne okamžité cez
   Supabase Realtime (feature/AI, realtimeTable="messages" v ChatThread).
   sendClientMessageAction revaliduje. */

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const { preview } = await searchParams;
  const result = (preview && previewResult(preview)) || (await getPortalChat());

  if (result.state === "error") {
    return (
      <Notice icon={<AlertIcon />} title="Nepodarilo sa načítať chat" tone="alert" action={<RetryButton />}>
        Skús to o chvíľu znova. Ak to potrvá, napíš svojmu trénerovi inou cestou.
      </Notice>
    );
  }

  if (result.state === "unlinked") {
    return (
      <Notice icon={<ProfileIcon />} title={result.firstName ? `Vitaj, ${result.firstName}` : "Vitaj vo FitPilot"}>
        Tvoj účet ešte nie je prepojený s trénerom. Prepojenie spraví tréner zo svojej strany.
      </Notice>
    );
  }

  if (result.state === "no_trainer") {
    return (
      <Notice icon={<ProfileIcon />} title="Zatiaľ bez trénera">
        Keď svojmu trénerovi pošleš kód z <strong>Profilu</strong> a on ťa pridá, otvorí sa tu vaše vlákno a príde ti
        potvrdenie.
      </Notice>
    );
  }

  const { messages, trainerName } = result.data;
  // trainerName je null keď sa meno nepodarilo zistiť (napr. chýbajúce/nečitateľné
  // full_name) — nikdy nezreťazuj s "Tréner"/"Napíš …ovi", vznikne duplicitné
  // "Tréner tréner"; namiesto toho použi holý fallback text bez mena.

  return (
    <div className={styles.chatPage}>
      <h1 className={styles.chatTitle}>{trainerName ? `Tréner ${trainerName}` : "Tréner"}</h1>
      <ChatThread
        messages={messages}
        mySide="client"
        sendAction={sendClientMessageAction}
        onSeen={markClientChatSeenAction}
        markerUrl="/api/chat/marker"
        realtimeTable="messages"
        // Bez skloňovania mena — prípona k menu tvorila "QAa", "Martinaovi".
        emptyTitle="Napíš trénerovi"
        emptyText="Otázka k plánu, pocit z tréningu, čokoľvek — tréner ti odpovie sem."
        placeholder="Správa pre trénera…"
        fill
      />
    </div>
  );
}
