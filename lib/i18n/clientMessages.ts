import type { Messages } from "@/messages";

/** Menné priestory, ktoré používajú len serverové komponenty / route handlery — do
 *  prehliadača sa neposielajú (zbytočné kB v každej stránke). */
const SERVER_ONLY = ["landing", "pdf", "ai", "system"] as const satisfies readonly (keyof Messages)[];

/** Texty pre NextIntlClientProvider (klientske komponenty). */
export function clientMessages(messages: Messages): Partial<Messages> {
  const out: Partial<Messages> = { ...messages };
  for (const ns of SERVER_ONLY as readonly (keyof Messages)[]) delete out[ns];
  return out;
}
