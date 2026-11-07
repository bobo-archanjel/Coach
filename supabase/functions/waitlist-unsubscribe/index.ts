// FitPilot — API pre jednoklikové odhlásenie z čakacej listiny (feature/wishlist).
//
// PREČO ČISTÉ JSON, NIE PRIAMO HTML: Supabase Edge Functions bežia na zdieľanej
// doméne *.supabase.co naprieč tisíckami projektov. Skúsili sme pôvodne vracať
// rovno štylizovanú HTML stránku — Supabase to v odpovedi ticho prepíše na
// `Content-Type: text/plain` + vynúti `Content-Security-Policy: default-src
// 'none'; sandbox` (zistené priamym curl na nasadenú funkciu), takže sa nikdy
// nevykreslí ako stránka, len ako surový text — zámerná platformová ochrana
// pred phishingom (ktokoľvek by inak vedel hostovať ľubovoľné "prihlás sa"
// stránky priamo pod dôveryhodnou doménou supabase.co).
//
// Skutočnú stránku, ktorú človek vidí, preto hostuje waitlist/odhlasenie.html
// na myfitpilot.sk (mimo tohto obmedzenia) — tá volá túto funkciu cez fetch(),
// rovnaký vzor ako submit-waitlist. Táto funkcia je len JSON API:
//   GET  ?token=...  → { ok, first_name? } alebo { ok:false, code }
//   POST { token }   → vymaže záznam, { ok:true } alebo { ok:false, code }
//
// POST navyše prijme aj RFC 8058 "one-click" telo (`List-Unsubscribe=One-Click`,
// form-encoded, bez tokenu v tele) — token vtedy berie z query stringu, presne
// ako v odkaze `List-Unsubscribe` v e-maile. To umožňuje Gmailu/Yahoo/Outlooku
// odhlásiť priamo z ich vlastného "Unsubscribe" tlačidla pri predmete, bez
// otvorenia e-mailu — mailový server nie je prehliadač, CORS sa naň nevzťahuje.
//
// SUPABASE_URL a SUPABASE_SERVICE_ROLE_KEY sú injektované automaticky.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://myfitpilot.sk",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const url = new URL(req.url);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  if (req.method === "GET") {
    const token = (url.searchParams.get("token") ?? "").trim();
    if (!token || token.length > 200) return json({ ok: false, code: "invalid" }, 400);

    const { data } = await admin
      .from("waitlist_signups")
      .select("full_name")
      .eq("unsubscribe_token", token)
      .maybeSingle();
    if (!data) return json({ ok: false, code: "invalid" }, 404);

    const firstName = (data.full_name || "").trim().split(/\s+/)[0] || null;
    return json({ ok: true, first_name: firstName });
  }

  if (req.method === "POST") {
    // Token príde buď v JSON tele (naša stránka), alebo len v query stringu
    // (mailový klient posiela RFC 8058 telo bez tokenu — viď komentár vyššie).
    let token = (url.searchParams.get("token") ?? "").trim();
    const contentType = req.headers.get("content-type") || "";
    try {
      if (contentType.includes("application/json")) {
        const body = await req.json();
        if (typeof body?.token === "string" && body.token.trim()) token = body.token.trim();
      } else {
        const form = await req.formData();
        const t = form.get("token");
        if (typeof t === "string" && t.trim()) token = t.trim();
      }
    } catch {
      // RFC 8058 telo ("List-Unsubscribe=One-Click") nemá pole "token" — token
      // ostáva z query stringu, toto nie je chyba.
    }
    if (!token || token.length > 200) return json({ ok: false, code: "invalid" }, 400);

    const { data, error } = await admin
      .from("waitlist_signups")
      .delete()
      .eq("unsubscribe_token", token)
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("waitlist-unsubscribe delete error:", error.message);
      return json({ ok: false, code: "server" }, 500);
    }
    if (!data) return json({ ok: false, code: "invalid" }, 404);
    return json({ ok: true });
  }

  return json({ ok: false, code: "method" }, 405);
});
