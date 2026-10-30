import { ChatThread } from "@/app/components/ChatThread";
import { getPortalAiChat } from "@/lib/portal/data";
import { sendAiKoucMessageAction, resetAiKoucConversationAction } from "@/app/portal/ai-kouc/actions";
import { PREVIEW } from "@/app/portal/ai-kouc/preview";
import { AiIcon, ProfileIcon } from "@/app/portal/icons";
import { RetryButton } from "@/app/portal/RetryButton";
import { AlertIcon, Notice } from "../V6Notice";
import s from "../styles/portal.module.css";

/* /v6design/portal/ai-kouc — tá istá súkromná konverzácia s AI (0017) a tie isté
   akcie ako /portal/ai-kouc; GDPR oznam ostáva trvalo viditeľný nad chatom. */

export default async function V6AiKoucPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const { preview } = await searchParams;
  const result = preview === "ok" && process.env.NODE_ENV === "development" ? PREVIEW : await getPortalAiChat();

  if (result.state === "error") {
    return (
      <Notice icon={<AlertIcon />} title="Nepodarilo sa načítať AI Kouč" tone="alert" action={<RetryButton />}>
        Skús to o chvíľu znova.
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
      <Notice icon={<ProfileIcon />} title="AI Kouč zatiaľ nie je dostupný">
        AI Kouč funguje len pre klientov s prideleným trénerom — bez trénera by sme nemal komu poslať upozornenie pri
        zdravotnej téme.
      </Notice>
    );
  }

  const messages = result.data.messages.map((m) => ({
    id: m.id,
    sender: (m.role === "user" ? "client" : "trainer") as "trainer" | "client",
    body: m.body,
    createdAt: m.createdAt,
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
            <h1 className={s.chatTitle}>AI Kouč</h1>
            <p className={s.chatSub}>Súkromný asistent</p>
          </div>
        </div>
        {hasMessages && (
          <form action={resetAiKoucConversationAction}>
            <button type="submit" className={s.aiKoucResetBtn}>
              Začať odznova
            </button>
          </form>
        )}
      </div>
      <p className={s.aiKoucNotice}>
        Rozprávaš sa s AI asistentom, nie s trénerom priamo — táto konverzácia je súkromná, tréner ju nevidí. Pri zmienke
        o bolesti/zranení alebo žiadosti o náhradu cviku dostane tréner len krátku správu v Správach, nikdy celý tento
        chat.
      </p>
      <ChatThread
        messages={messages}
        mySide="client"
        sendAction={sendAiKoucMessageAction}
        emptyTitle="Opýtaj sa AI Kouča"
        emptyText="Napríklad: čo mám zjesť, aby som splnil dnešný cieľ? Alebo: aký cvik mi navrhneš namiesto tohto?"
        placeholder="Napíš AI Kočovi…"
        fill
        // proaktívny check-in príde max. raz za pár dní — bez pollu (ako /portal/ai-kouc)
        pollMs={0}
      />
    </div>
  );
}
