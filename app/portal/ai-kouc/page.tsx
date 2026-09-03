import { ChatThread } from "../../components/ChatThread";
import { getPortalAiChat } from "@/lib/portal/data";
import { sendAiKoucMessageAction, resetAiKoucConversationAction } from "./actions";
import { AlertIcon, Notice } from "../Notice";
import { ProfileIcon } from "../icons";
import { RetryButton } from "../RetryButton";
import styles from "../portal.module.css";

/* /portal/ai-kouc — AI Kouč (AI blok, Krok 4b). Samostatný tab vedľa Chat
   (človek ↔ tréner), aby bolo jasné, čo je AI a čo živý tréner. GDPR oprava:
   toto je SÚKROMNÁ konverzácia klient↔AI — tréner k nej nemá prístup ani na
   úrovni RLS (0017_ai_chat_private.sql). Pri zdravotnej téme/žiadosti o
   náhradu cviku dostane tréner len krátku správu v skutočnom chate (Krok 4/5),
   nikdy celý AI transkript — to musí byť viditeľne oznámené tu. */

export default async function AiKoucPage() {
  const result = await getPortalAiChat();

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
    <div className={styles.chatPage}>
      <div className={styles.aiKoucHead}>
        <h1 className={styles.chatTitle}>AI Kouč</h1>
        {hasMessages && (
          <form action={resetAiKoucConversationAction}>
            <button type="submit" className={styles.aiKoucResetBtn}>
              Začať odznova
            </button>
          </form>
        )}
      </div>
      <p className={styles.aiKoucNotice}>
        Rozprávaš sa s AI asistentom, nie s trénerom priamo — táto konverzácia je súkromná, tréner ju nevidí. Pri
        zmienke o bolesti/zranení alebo žiadosti o náhradu cviku dostane tréner len krátku správu v Správach, nikdy
        celý tento chat.
      </p>
      <ChatThread
        messages={messages}
        mySide="client"
        sendAction={sendAiKoucMessageAction}
        emptyTitle="Opýtaj sa AI Kouča"
        emptyText="Napríklad: čo mám zjesť, aby som splnil dnešný cieľ? Alebo: aký cvik mi navrhneš namiesto tohto?"
        placeholder="Napíš AI Kočovi…"
        fill
      />
    </div>
  );
}
