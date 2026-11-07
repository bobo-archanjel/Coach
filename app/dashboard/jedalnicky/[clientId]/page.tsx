import { redirect } from "next/navigation";

/**
 * Bývalá stránka „Makro cieľ a jedálničky“ klienta. Vstupné údaje, výsledok aj zoznam
 * jedálničkov sú teraz v detaile klienta (záložka Jedálničky) — staré odkazy (aj
 * /dashboard/vyziva/[id] cez redirect v next.config.ts) vedú tam.
 */
export default async function NutritionDetailRedirect({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  redirect(`/dashboard/klienti/${encodeURIComponent(clientId)}?sekcia=jedalnicky`);
}
