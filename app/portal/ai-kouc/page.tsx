import { getTranslations } from "next-intl/server";
import { ChatThread } from "@/app/components/ChatThread";
import { getPortalAiChat } from "@/lib/portal/data";
import { sendAiKoucMessageAction, resetAiKoucConversationAction } from "@/app/portal/ai-kouc/actions";
import { getExerciseDetailAction } from "@/app/portal/trening/actions";
import { PREVIEW } from "@/app/portal/ai-kouc/preview";
import { AiIcon, ProfileIcon } from "@/app/portal/icons";
import { RetryButton } from "@/app/portal/RetryButton";
import { AlertIcon, Notice } from "../Notice";
import s from "../portal.module.css";

/* /portal/ai-kouc — súkromná konverzácia s AI (0017); GDPR oznam ostáva trvalo viditeľný nad chatom. */

export default async function AiKoucPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const { preview } = await searchParams;
  const result = preview === "ok" && process.env.NODE_ENV === "development" ? PREVIEW : await getPortalAiChat();
  const [tp, t] = await Promise.all([getTranslations("portal"), getTranslations("portal.aiCoach")]);

  if (result.state === "error") {
    return (
      <Notice icon={<AlertIcon />} title={t("loadFailed")} tone="alert" action={<RetryButton />}>
        {t("retry")}
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
      <Notice icon={<ProfileIcon />} title={t("unavailable")}>
        {t("unavailableText")}
      </Notice>
    );
  }

  const messages = result.data.messages.map((m) => ({
    id: m.id,
    sender: (m.role === "user" ? "client" : "trainer") as "trainer" | "client",
    body: m.body,
    createdAt: m.createdAt,
    exerciseRefs: m.exerciseRefs,
  }));
  const hasMessages = result.data.messages.length > 0;

  return (
    <div className={s.chatPage}>
      <div className={s.chatHead}>
        <div className={s.chatWho}>
          <span className={s.chatAvatar} aria-hidden="true">
            <AiIcon />
          </span>
          <div>
            <h1 className={s.chatTitle}>{t("title")}</h1>
            <p className={s.chatSub}>{t("sub")}</p>
          </div>
        </div>
        {hasMessages && (
          <form action={resetAiKoucConversationAction}>
            <button type="submit" className={s.aiKoucResetBtn}>
              {t("reset")}
            </button>
          </form>
        )}
      </div>
      <p className={s.aiKoucNotice}>
        {t("notice")}
      </p>
      <ChatThread
        messages={messages}
        mySide="client"
        sendAction={sendAiKoucMessageAction}
        emptyTitle={t("emptyTitle")}
        emptyText={t("emptyText")}
        placeholder={t("placeholder")}
        fill
        // proaktívny check-in príde max. raz za pár dní — bez pollu (ako /portal/ai-kouc)
        pollMs={0}
        getExerciseDetail={getExerciseDetailAction}
      />
    </div>
  );
}
