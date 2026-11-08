"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface AddClientState {
  error: string | null;
}

export interface AddByCodeState {
  error: string | null;
  addedName: string | null;
}

/**
 * Nový model pripojenia (feature/registracia-update): klient sa zaregistruje sám
 * a dostane vlastný kód (FP-…). Tréner ho sem zadá → RPC add_client_by_code (0032)
 * nastaví `clients.trainer_id` a pošle klientovi systémovú správu do chatu.
 * Rate limit (8 pokusov / 15 min per tréner) je vnútri RPC.
 */
export async function addClientByCodeAction(_prev: AddByCodeState, formData: FormData): Promise<AddByCodeState> {
  const code = ((formData.get("code") as string | null) ?? "").trim();
  if (!code) return { error: "Zadaj kód klienta.", addedName: null };
  if (code.length < 6) return { error: "Kód je príliš krátky — skopíruj ho celý.", addedName: null };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_client_by_code", { p_code: code });

  if (error) {
    const map: Record<string, string> = {
      // Kód je jednorazový — RPC ho pri úspešnom spárovaní rotuje (0036, bezpečnostné
      // opatrenie proti opätovnému použitiu). Preto "neplatný" najčastejšie neznamená
      // preklep, ale že kód už bol raz použitý — hláška to musí odlíšiť, inak trénera
      // navádza hľadať chybu u seba/klienta, keď v skutočnosti je klient už spárovaný.
      invalid_code:
        "Tento kód už neplatí — buď je v ňom preklep, alebo bol už raz použitý (z bezpečnostných dôvodov sa po spárovaní mení). Ak si tohto klienta už pridal, nájdeš ho v zozname klientov; inak si od neho vyžiadaj aktuálny kód z jeho profilu.",
      already_your_client: "Tohto klienta už máš v zozname.",
      already_has_trainer: "Tento klient je už priradený k inému trénerovi. Musí sa najprv odpojiť vo svojom profile.",
      too_many_attempts: "Priveľa pokusov o pridanie. Skús to znova o 15 minút.",
      not_a_trainer: "Klientov môže pridávať len trénerský účet.",
    };
    const key = Object.keys(map).find((k) => error.message.includes(k));
    return { error: key ? map[key] : "Pridanie zlyhalo. Skús to o chvíľu znova.", addedName: null };
  }

  const row = Array.isArray(data) ? data[0] : data;
  const addedName = (row?.client_name as string | undefined) ?? "Klient";

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/analytika");
  return { error: null, addedName };
}

export async function addClientAction(
  _prevState: AddClientState,
  formData: FormData
): Promise<AddClientState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Nie si prihlásený." };
  }

  const fullName = (formData.get("full_name") as string | null)?.trim() ?? "";
  const goal = (formData.get("goal") as string | null)?.trim() || null;
  const notes = (formData.get("notes") as string | null)?.trim() || null;

  if (!fullName) {
    return { error: "Meno klienta je povinné." };
  }

  // Voliteľné základné údaje — na rozdiel od nutrition_profiles (0004) nie sú
  // povinné ani validované na rozsah v appke, len na DB check constraint
  // (0009_client_basics.sql); prázdne pole = null, nie 0.
  const parseOptionalNumber = (key: string) => {
    const raw = (formData.get(key) as string | null)?.trim();
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  const age = parseOptionalNumber("age");
  const weightKg = parseOptionalNumber("weight_kg");
  const heightCm = parseOptionalNumber("height_cm");

  // invite_code sa NEzadáva: generuje ho DB (default gen_client_code(), 80 bitov z CSPRNG,
  // migrácia 0036). Predtým ho tu skladal Math.random() z iniciálok mena (predvídateľný,
  // nekryptografický). Trénerova súkromná poznámka ide do trainer_private_notes —
  // stĺpec clients.notes číta aj sám klient (RLS je riadková), viď 0036.
  const { data: created, error } = await supabase
    .from("clients")
    .insert({
      trainer_id: user.id,
      full_name: fullName,
      goal,
      age,
      weight_kg: weightKg,
      height_cm: heightCm,
    })
    .select("id")
    .single();

  if (error || !created) {
    console.error("addClientAction:", error?.message);
    return { error: "Klienta sa nepodarilo pridať. Skús to prosím znova." };
  }

  if (notes) {
    const { error: noteErr } = await supabase
      .from("trainer_private_notes")
      .insert({ client_id: created.id, scope: "client", trainer_id: user.id, notes: notes.slice(0, 4000) });
    if (noteErr) console.error("addClientAction (poznámka):", noteErr.message);
  }

  revalidatePath("/dashboard");
  return { error: null };
}
