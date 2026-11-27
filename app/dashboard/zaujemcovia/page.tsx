import { redirect } from "next/navigation";

/* /dashboard/zaujemcovia — zoznam je od teraz záložka Nastavenia → Záujemcovia. Presmerovanie drží odkazy
   z e-mailov a starých záložiek (zachová filter stavu). */
export default async function ZaujemcoviaPage({ searchParams }: { searchParams: Promise<{ stav?: string }> }) {
  const { stav } = await searchParams;
  redirect(`/dashboard/nastavenia?sekcia=zaujemcovia${stav ? `&stav=${encodeURIComponent(stav)}` : ""}`);
}
