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
      invalid_code: "Tento kód neexistuje. Over si ho u klienta — musí byť celý, aj s „FP-“.",
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

// feature/optimalizacia (security audit): predtým 4 náhodné znaky (~36^4 =
// 1.68M kombinácií) — spolu s rate limitom na claim_client_by_invite (0029) je
// to dostatočné, ale 8 znakov (~36^8 = 2.8 biliardy) robí uhádnutie prakticky
// nemožné aj bez limitu. Math.random() nie je kryptograficky bezpečný generátor,
// ale pri tejto entropii (a rate-limitovanom RPC) to na neuhádnuteľný kód stačí —
// nejde o token na overenie identity, len o spárovací kód medzi trénerom a klientom.
function generateInviteCode(fullName: string) {
  const initials =
    fullName
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .slice(0, 3) || "FP";
  const random = (Math.random().toString(36) + Math.random().toString(36))
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 8)
    .toUpperCase();
  return `${initials}-${random}`;
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

  const { error } = await supabase.from("clients").insert({
    trainer_id: user.id,
    full_name: fullName,
    goal,
    notes,
    age,
    weight_kg: weightKg,
    height_cm: heightCm,
    invite_code: generateInviteCode(fullName),
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard");
  return { error: null };
}
