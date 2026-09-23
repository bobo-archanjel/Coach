// FitPilot — jediná bezpečná cesta na zápis do čakacej listiny (feature/wishlist).
//
// Predtým waitlist/js/main.js zapisoval PRIAMO do public.waitlist_signups cez
// anon kľúč — ten je verejný by design (je vidno v zdrojáku stránky), takže
// ktokoľvek vedel poslať request rovno na Supabase REST API mimo formulára,
// skriptom v slučke, bez CAPTCHA a bez limitu. Táto funkcia je teraz jediný
// spôsob zápisu (anon nemá na tabuľku žiadne INSERT právo, viď migrácia 0040).
//
// Vyžaduje function secret TURNSTILE_SECRET_KEY (supabase secrets set
// TURNSTILE_SECRET_KEY=...) — návod na založenie v waitlist/README.md.
// SUPABASE_URL a SUPABASE_SERVICE_ROLE_KEY sú injektované automaticky.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TURNSTILE_SECRET = Deno.env.get("TURNSTILE_SECRET_KEY");
const MAX_PER_IP_PER_DAY = 5;
const ALLOWED_ROLES = new Set(["trainer", "solo", "client"]);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// CORS — funkcia sa volá z prehliadača (fetch z waitlist/js/main.js), nie zo
// servera; bez tejto hlavičky by ju prehliadač zablokoval na same-origin politike.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://myfitpilot.sk",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ ok: false, code: "method" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, code: "invalid" }, 400);
  }

  // Honeypot — skryté pole vo formulári (waitlist/index.html), ktoré človek
  // nikdy nevyplní, primitívny bot áno. Zámerne vraciame "ok", nie chybu —
  // aby sa bot nedozvedel, že bol odhalený, a neskúšal formulár upraviť.
  if (typeof body.hp === "string" && body.hp.trim() !== "") {
    return json({ ok: true });
  }

  const fullName = typeof body.full_name === "string" ? body.full_name.trim().slice(0, 120) : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 320) : "";
  const role = typeof body.role === "string" ? body.role : "";
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
  const turnstileToken = typeof body.turnstile_token === "string" ? body.turnstile_token : "";

  if (!fullName || !EMAIL_RE.test(email) || !ALLOWED_ROLES.has(role)) {
    return json({ ok: false, code: "invalid" }, 400);
  }
  if (!turnstileToken) {
    return json({ ok: false, code: "captcha_missing" }, 400);
  }
  if (!TURNSTILE_SECRET) {
    console.error("TURNSTILE_SECRET_KEY nie je nastavený (supabase secrets set TURNSTILE_SECRET_KEY=...)");
    return json({ ok: false, code: "server" }, 500);
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

  // Overenie CAPTCHA MUSÍ prebehnúť tu, na serveri — token z prehliadača sa dá
  // sfalšovať/vynechať, kontrola "existuje reťazec" by bot obišiel triviálne.
  const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      secret: TURNSTILE_SECRET,
      response: turnstileToken,
      ...(ip ? { remoteip: ip } : {}),
    }),
  });
  const verifyData = await verifyRes.json().catch(() => ({ success: false }));
  if (!verifyData.success) {
    return json({ ok: false, code: "captcha_failed" }, 400);
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const ipHash = ip ? await sha256Hex(ip) : null;

  // Rate limit — max MAX_PER_IP_PER_DAY zápisov z jednej IP za 24h. Turnstile
  // token je jednorazový, ale bez tohto by niekto mohol vyriešiť CAPTCHA raz
  // ručne a potom prehrávať formulár s rotujúcimi e-mailmi zo skriptu.
  if (ipHash) {
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { count } = await admin
      .from("waitlist_signups")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("created_at", since);
    if ((count ?? 0) >= MAX_PER_IP_PER_DAY) {
      return json({ ok: false, code: "rate_limited" }, 429);
    }
  }

  const { error } = await admin.from("waitlist_signups").insert({
    full_name: fullName,
    email,
    role,
    note: note || null,
    consent_at: new Date().toISOString(),
    ip_hash: ipHash,
  });

  if (error) {
    if (error.code === "23505") return json({ ok: false, code: "duplicate" }, 409);
    console.error("waitlist insert error:", error.message);
    return json({ ok: false, code: "server" }, 500);
  }

  return json({ ok: true });
});
