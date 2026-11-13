/**
 * Udalosť v okne prehliadača po úspešnom označení správ ako prečítaných (ChatThread → onSeen).
 * Zvončeky (dashboard aj portál) na ňu hneď obnovia svoje dáta — inak by neprečítaná správa
 * vo zvončeku visela až do ďalšieho pravidelného načítania. Samostatný malý modul, nech
 * zvonček kvôli jednej konštante neťahá celý ChatThread.
 */
export const CHAT_SEEN_EVENT = "fitpilot:chat-seen";

export function announceChatSeen(): void {
  window.dispatchEvent(new Event(CHAT_SEEN_EVENT));
}
