import { ChatThread } from "../../components/ChatThread";
import { getPortalChat } from "@/lib/portal/data";
import type { PortalChatResult } from "@/lib/portal/types";
import { markClientChatSeenAction, sendClientMessageAction } from "../actions";
import { AlertIcon, Notice } from "../Notice";
import { ProfileIcon } from "../icons";
import { RetryButton } from "../RetryButton";
import styles from "../portal.module.css";

/* /portal/chat — obojsmerné vlákno s trénerom (Track "Klient" bod 2).
   coach_notes (dnešný odkaz na karte Dnes) ostáva samostatný.
   Refresh-based: ChatThread polluje, sendClientMessageAction revaliduje. */

const PREVIEW: PortalChatResult = {
  state: "ok",
  data: {
    trainerName: "Marek",
    messages: [
      {
        id: "m1",
        sender: "trainer",
        body: "Ahoj Ján! Pozrel som si tvoj posledný tréning — drep ide pekne. Ako sa cítiš na kolene po RDL?",
        createdAt: new Date(Date.now() - 26 * 3600_000).toISOString(),
      },
      {
        id: "m2",
        sender: "client",
        body: "Ahoj, koleno v pohode. Skôr ma trocha ťahá spodný chrbát na konci série.",
        createdAt: new Date(Date.now() - 25 * 3600_000).toISOString(),
      },
      {
        id: "m3",
        sender: "trainer",
        body: "Ok. Skús na budúce znížiť váhu o 10 kg a sústreď sa na neutrálnu chrbticu. Nabudúce to spolu pozrieme na videu.",
        createdAt: new Date(Date.now() - 25 * 3600_000 + 120_000).toISOString(),
      },
      {
        id: "m4",
        sender: "client",
        body: "Jasné, dík!",
        createdAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
      },
      {
        id: "m5",
        sender: "system",
        body: "Tréner ťa odstránil z portfólia. Tvoje tréningy, výživa, denník aj správy sa natrvalo vymažú o 30 dní, pokiaľ zmazanie nezruší.",
        createdAt: new Date(Date.now() - 1 * 3600_000).toISOString(),
      },
    ],
  },
};

function previewResult(kind: string): PortalChatResult | null {
  if (process.env.NODE_ENV === "production") return null;
  if (kind === "ok") return PREVIEW;
  if (kind === "empty") return { state: "ok", data: { trainerName: "Marek", messages: [] } };
  if (kind === "unlinked") return { state: "unlinked", firstName: "Ján" };
  if (kind === "error") return { state: "error" };
  return null;
}

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

  const { messages, trainerName } = result.data;

  return (
    <div className={styles.chatPage}>
      <h1 className={styles.chatTitle}>Tréner {trainerName}</h1>
      <ChatThread
        messages={messages}
        mySide="client"
        sendAction={sendClientMessageAction}
        onSeen={markClientChatSeenAction}
        emptyTitle={`Napíš ${trainerName}ovi`}
        emptyText="Otázka k plánu, pocit z tréningu, čokoľvek — tréner ti odpovie sem."
        placeholder={`Správa pre ${trainerName}a…`}
        fill
      />
    </div>
  );
}
