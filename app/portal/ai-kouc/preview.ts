/* DEV náhľad AI Kouča (?preview=ok) — zdieľané /portal a /v6design/portal. */
import type { PortalAiChatResult } from "@/lib/portal/types";

// DEV náhľad (?preview=ok) bez session, rovnaký vzor ako ostatné portálové
// stránky (chat/dennik/trening/page.tsx) — pre marketingové screenshoty a
// rýchlu vizuálnu kontrolu bez prihlásenia. Ilustračná ukážka produktu, nie
// reálna konverzácia (rovnaký princíp ako PREVIEW v ../chat/page.tsx).
export const PREVIEW: PortalAiChatResult = {
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
