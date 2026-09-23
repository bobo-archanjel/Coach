import { ChatThread } from "../../components/ChatThread";
import { getPortalAiChat } from "@/lib/portal/data";
import type { PortalAiChatResult } from "@/lib/portal/types";
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

// DEV náhľad (?preview=ok) bez session, rovnaký vzor ako ostatné portálové
// stránky (chat/dennik/trening/page.tsx) — pre marketingové screenshoty a
// rýchlu vizuálnu kontrolu bez prihlásenia. Ilustračná ukážka produktu, nie
// reálna konverzácia (rovnaký princíp ako PREVIEW v ../chat/page.tsx).
const PREVIEW: PortalAiChatResult = {
  state: "ok",
  data: {
    messages: [
      {
        id: "a1",
        role: "user",
        body: "Ahoj, dnes mi zvýšilo 40g bielkovín do cieľa a neviem čo si dať večer. Máš nápad?",
        createdAt: new Date(Date.now() - 3600_000).toISOString(),
      },
      {
        id: "a2",
        role: "assistant",
        body: "Ahoj! Skús tvarohovú misku (250 g tvarohu, banán, lyžica arašidového masla) — to je ~38 g bielkovín a sadne to aj do tvojho zvyšku sacharidov na dnes. Alebo kuracie prsia s ryžou, ak preferuješ slané.",
        createdAt: new Date(Date.now() - 3500_000).toISOString(),
      },
      {
        id: "a3",
        role: "user",
        body: "Super, dík. A čo namiesto bulharských drepov, bolí ma dnes koleno?",
        createdAt: new Date(Date.now() - 1800_000).toISOString(),
        escalated: true,
      },
      {
        id: "a4",
        role: "assistant",
        body: "Bolesť kolena neposudzujem sám — dal som o tom vedieť tvojmu trénerovi, ozve sa ti s úpravou plánu. Do jeho odpovede radšej cvik vynechaj.",
        createdAt: new Date(Date.now() - 1750_000).toISOString(),
      },
    ],
  },
};

export default async function AiKoucPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const { preview } = await searchParams;
  const result =
    preview === "ok" && process.env.NODE_ENV === "development" ? PREVIEW : await getPortalAiChat();

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
        // Súkromná konverzácia klient↔AI (0017) — bežná odpoveď príde synchrónne v
        // tej istej server action. Jediná výnimka je proaktívny AI check-in (0033,
        // pg_cron pri strate adherencie) — ten vloží správu mimo tejto stránky, ale
        // ide o max. raz za pár dní, klient ju uvidí pri ďalšom otvorení/refreshi;
        // pravidelný poll ani Realtime by tu boli zbytočný dopyt navyše pre tak
        // zriedkavú udalosť.
        pollMs={0}
      />
    </div>
  );
}
