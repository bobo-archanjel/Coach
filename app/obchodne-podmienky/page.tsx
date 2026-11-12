import { getLocale } from "next-intl/server";
import { LegalPage, legalMetadata } from "../components/LegalPage";
import TermsSk from "./content.sk";
import TermsCs from "./content.cs";

export const generateMetadata = () => legalMetadata("terms");

/**
 * 2026-09-22 — nahradené kompletným návrhom obchodných podmienok. Nie je to
 * právne záväzný text od právnika — pozri draftNotice. Bod 4 (cena a platba)
 * sa uplatní až po spustení Stripe platieb, dovtedy zostáva neaktívny.
 * feature/cestina: text v jazyku používateľa (content.sk.tsx / content.cs.tsx).
 */
export default async function TermsPage() {
  const locale = await getLocale();
  return <LegalPage>{locale === "cs" ? <TermsCs /> : <TermsSk />}</LegalPage>;
}
