import type { Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

/**
 * Prihlásenie v teste bez formulára. Od zapnutia CAPTCHA v Supabase (Attack Protection,
 * Turnstile token z /prihlasenie) lokálny formulár neprejde — widget Cloudflare je viazaný
 * na produkčnú doménu. Session preto vznikne cez service role: admin `generateLink`
 * (magic link, e-mail sa NEODOŠLE) → `verifyOtp` s token_hash (CAPTCHA ho nevyžaduje).
 * Cookies zapíše priamo @supabase/ssr — rovnaký tvar a delenie, aký číta appka.
 */
export async function sessionLogin(page: Page, email: string, baseURL: string): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties?.hashed_token) throw new Error(`generateLink ${email}: ${error?.message}`);

  const jar: { name: string; value: string }[] = [];
  const ssr = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => jar,
      setAll: (cookies) => {
        for (const c of cookies) {
          const i = jar.findIndex((j) => j.name === c.name);
          if (i >= 0) jar.splice(i, 1);
          if (c.value) jar.push({ name: c.name, value: c.value });
        }
      },
    },
  });
  const { error: verifyErr } = await ssr.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: "magiclink" });
  if (verifyErr) throw new Error(`verifyOtp ${email}: ${verifyErr.message}`);

  await page.context().addCookies(jar.map((c) => ({ ...c, url: baseURL })));
}

/** Id používateľa podľa e-mailu (service role) — namiesto signInWithPassword, ktoré CAPTCHA odmietne. */
export async function userIdByEmail(email: string): Promise<string> {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (let page = 1; page < 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (user) return user.id;
    if (data.users.length < 1000) break;
  }
  throw new Error(`Používateľ ${email} neexistuje.`);
}
