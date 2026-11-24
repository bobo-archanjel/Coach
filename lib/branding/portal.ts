import "server-only";
import { cache } from "react";
import { getMyClient, getUser } from "@/lib/supabase/server";
import { loadBrandingForTrainer } from "./server";
import type { PublicBranding } from "./types";

/**
 * Značka trénera PRIHLÁSENÉHO klienta (null = predvolený FitPilot: bez session, bez trénera, tréner
 * bez Business, značka nenastavená). Trainer sa berie z klientovho vlastného riadku (RLS), nie
 * z parametra požiadavky. Request-cache: layout portálu, jeho metadáta a manifest dopyt zdieľajú.
 */
export const loadClientBranding = cache(async (): Promise<PublicBranding | null> => {
  const {
    data: { user },
  } = await getUser();
  if (!user) return null;
  const { data: client } = await getMyClient(user.id);
  return loadBrandingForTrainer(client?.trainer_id ?? null);
});
