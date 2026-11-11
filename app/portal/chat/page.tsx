import { getTranslations } from "next-intl/server";
import { ChatThread } from "@/app/components/ChatThread";
import { getPortalChat } from "@/lib/portal/data";
import { markClientChatSeenAction, sendClientMessageAction } from "@/app/portal/actions";
import { previewResult } from "@/app/portal/chat/preview";
import { ChatIcon, ProfileIcon } from "@/app/portal/icons";
import { RetryButton } from "@/app/portal/RetryButton";
import { AlertIcon, Notice } from "../Notice";
import s from "../portal.module.css";

/* /portal/chat — vlákno s trénerom (ChatThread: Realtime, marker poll, označenie prečítaných). */

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const { preview } = await searchParams;
  const result = (preview && previewResult(preview)) || (await getPortalChat());
  const [tp, t] = await Promise.all([getTranslations("portal"), getTranslations("portal.chat")]);

  if (result.state === "error") {
    return (
      <Notice icon={<AlertIcon />} title={t("loadFailed")} tone="alert" action={<RetryButton />}>
        {t("retryOther")}
      </Notice>
    );
  }

  if (result.state === "unlinked") {
    return (
      <Notice icon={<ProfileIcon />} title={result.firstName ? tp("welcomeName", { name: result.firstName }) : tp("welcome")}>
        {tp("unlinkedShort")}
      </Notice>
    );
  }

  if (result.state === "no_trainer") {
    return (
      <Notice icon={<ProfileIcon />} title={t("noTrainer")}>
        {t.rich("noTrainerText", { b: (chunks) => <strong>{chunks}</strong> })}
      </Notice>
    );
  }

  const { messages, trainerName } = result.data;
  // trainerName je null, keď sa meno nepodarilo zistiť — bez "Tréner tréner"
  const initial = trainerName?.trim().charAt(0).toUpperCase();

  return (
    <div className={s.chatPage}>
      <div className={s.chatHead}>
        <div className={s.chatWho}>
          <span className={s.chatAvatar} aria-hidden="true">
            {initial || <ChatIcon />}
          </span>
          <div>
            <h1 className={s.chatTitle}>{trainerName ? t("trainerNamed", { name: trainerName }) : t("trainer")}</h1>
            <p className={s.chatSub}>{t("sub")}</p>
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
        emptyTitle={t("emptyTitle")}
        emptyText={t("emptyText")}
        placeholder={t("placeholder")}
        fill
      />
    </div>
  );
}
