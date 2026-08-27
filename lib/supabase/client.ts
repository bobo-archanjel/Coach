import { createBrowserClient } from "@supabase/ssr";

/** Supabase klient pre použitie v "use client" komponentoch (browser). */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
