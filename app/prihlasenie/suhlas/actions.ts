"use server";

import { redirect } from "next/navigation";
import { TERMS_VERSION } from "@/lib/legal/terms";
import { createClient, getUser } from "@/lib/supabase/server";

/** „Súhlasím a pokračovať“ — zapíše súhlas s aktuálnou verziou podmienok (0063) a pustí do appky. */
export async function acceptTermsAction(): Promise<void> {
  const {
    data: { user },
  } = await getUser();
  if (!user) redirect("/prihlasenie");
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_terms", { p_version: TERMS_VERSION });
  if (error) {
    console.error("accept_terms:", error.message);
    redirect("/prihlasenie/suhlas?chyba=1");
  }
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  redirect(profile?.role === "client" ? "/portal" : "/dashboard");
}
