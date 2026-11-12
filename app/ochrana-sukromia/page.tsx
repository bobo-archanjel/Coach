import { getLocale } from "next-intl/server";
import { LegalPage, legalMetadata } from "../components/LegalPage";
import PrivacySk from "./content.sk";
import PrivacyCs from "./content.cs";

export const generateMetadata = () => legalMetadata("privacy");

/**
 * 2026-09-22 — nahradené kompletným návrhom (zásady ochrany osobných údajov
 * prispôsobené FitPilotu: Supabase, Anthropic/Claude API, budúci Stripe,
 * waitlist štádium, role tréner/klient). Nie je to právne záväzný text od
 * právnika — pozri draftNotice aj PLACEHOLDER polia, ktoré treba pred
 * zverejnením doplniť (žlto zvýraznené). feature/cestina: text v jazyku
 * používateľa (content.sk.tsx / content.cs.tsx).
 */
export default async function PrivacyPolicyPage() {
  const locale = await getLocale();
  return <LegalPage>{locale === "cs" ? <PrivacyCs /> : <PrivacySk />}</LegalPage>;
}
