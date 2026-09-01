import { ChatThread } from "../../components/ChatThread";
import { getPortalAiChat } from "@/lib/portal/data";
import { sendAiKoucMessageAction } from "./actions";
import { AlertIcon, Notice } from "../Notice";
import { ProfileIcon } from "../icons";
import { RetryButton } from "../RetryButton";
import styles from "../portal.module.css";

/* /portal/ai-kouc — AI Kouč (AI blok, Krok 4b). Samostatný tab vedľa Chat
   (človek ↔ tréner), aby bolo jasné, čo je AI a čo živý tréner. GDPR: tréner
   má do tejto konverzácie transparentný read-only náhľad (AI Kouč karta na
   /dashboard/klienti/[id]) — musí to byť viditeľne oznámené tu, nie len v
   podmienkach používania. */

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

  return (
    <div className={styles.chatPage}>
      <h1 className={styles.chatTitle}>AI Kouč</h1>
      <p className={styles.aiKoucNotice}>
        Rozprávaš sa s AI asistentom, nie s trénerom priamo. Tvoj tréner vidí túto konverzáciu (transparentne, aby ti
        vedel lepšie pomôcť) — pri zmienke o bolesti/zranení ho AI Kouč automaticky upozorní.
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
