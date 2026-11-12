import { getLocale } from "next-intl/server";
import { LegalPage, legalMetadata } from "../components/LegalPage";
import CookiesSk from "./content.sk";
import CookiesCs from "./content.cs";

export const generateMetadata = () => legalMetadata("cookies");

/**
 * 2026-09-22 — nová stránka (predtým sekcia 8 v Ochrane súkromia, teraz
 * samostatne, odkazovaná odtiaľ aj z Obchodných podmienok). Rovnaký draft
 * status ako ostatné právne stránky. feature/cestina: text v jazyku používateľa
 * (content.sk.tsx / content.cs.tsx), doplnené cookies jazyka, vzhľadu a sprievodcu.
 */
export default async function CookiesPage() {
  const locale = await getLocale();
  return <LegalPage>{locale === "cs" ? <CookiesCs /> : <CookiesSk />}</LegalPage>;
}
