"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface AddClientState {
  error: string | null;
}

function generateInviteCode(fullName: string) {
  const initials =
    fullName
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .slice(0, 3) || "FP";
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
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

  const { error } = await supabase.from("clients").insert({
    trainer_id: user.id,
    full_name: fullName,
    goal,
    notes,
    invite_code: generateInviteCode(fullName),
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard");
  return { error: null };
}
