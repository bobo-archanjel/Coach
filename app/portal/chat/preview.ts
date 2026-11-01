/* DEV náhľady chatu (?preview=…) — zdieľané /portal a /v6design/portal. */
import type { PortalChatResult } from "@/lib/portal/types";

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

export function previewResult(kind: string): PortalChatResult | null {
  if (process.env.NODE_ENV !== "development") return null;
  if (kind === "ok") return PREVIEW;
  if (kind === "empty") return { state: "ok", data: { trainerName: "Marek", messages: [] } };
  if (kind === "unlinked") return { state: "unlinked", firstName: "Ján" };
  if (kind === "no_trainer") return { state: "no_trainer", firstName: "Ján" };
  if (kind === "error") return { state: "error" };
  return null;
}
