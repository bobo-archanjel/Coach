"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/prihlasenie");
    router.refresh();
  }

  return (
    <button type="button" className="btn btn-ghost" onClick={handleSignOut}>
      Odhlásiť sa
    </button>
  );
}
