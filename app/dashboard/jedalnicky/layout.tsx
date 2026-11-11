import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";

// Sekcia „Jedálničky“ (predtým „Výživa“ na /dashboard/vyziva — trvalý redirect v next.config.ts).
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return {
  title: t("mealPlansMetaTitle"),
  };
}

export default function JedalnickyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
