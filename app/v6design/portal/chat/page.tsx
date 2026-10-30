import { ChatThread } from "@/app/components/ChatThread";
import { getPortalChat } from "@/lib/portal/data";
import { markClientChatSeenAction, sendClientMessageAction } from "@/app/portal/actions";
import { previewResult } from "@/app/portal/chat/preview";
import { ChatIcon, ProfileIcon } from "@/app/portal/icons";
import { RetryButton } from "@/app/portal/RetryButton";
import { AlertIcon, Notice } from "../V6Notice";
import s from "../styles/portal.module.css";

/* /v6design/portal/chat — to isté vlákno s trénerom (ChatThread: Realtime, marker
   poll, označenie prečítaných) a tie isté akcie ako /portal/chat. */

export default async function V6ChatPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
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
  // trainerName je null, keď sa meno nepodarilo zistiť — bez "Tréner tréner" (ako /portal/chat)
  const initial = trainerName?.trim().charAt(0).toUpperCase();

  return (
    <div className={s.chatPage}>
      <div className={s.chatHead}>
        <div className={s.chatWho}>
          <span className={s.chatAvatar} aria-hidden="true">
            {initial || <ChatIcon />}
          </span>
          <div>
            <h1 className={s.chatTitle}>{trainerName ? `Tréner ${trainerName}` : "Tréner"}</h1>
            <p className={s.chatSub}>Správy s tvojím trénerom</p>
          </div>
        </div>
      </div>
      <ChatThread
        messages={messages}
        mySide="client"
        sendAction={sendClientMessageAction}
        onSeen={markClientChatSeenAction}
        markerUrl="/api/chat/marker"
        realtimeTable="messages"
        emptyTitle="Napíš trénerovi"
        emptyText="Otázka k plánu, pocit z tréningu, čokoľvek — tréner ti odpovie sem."
        placeholder="Správa pre trénera…"
        fill
      />
    </div>
  );
}
