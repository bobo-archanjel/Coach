// FitPilot — potvrdzovací e-mail pri zápise na čakaciu listinu (feature/wishlist).
//
// Volá sa cez Supabase Database Webhook (Dashboard → Database → Webhooks) pri
// INSERT do public.waitlist_signups — nastavenie je v waitlist/README.md, krok 4.
// Deno edge function, žiadny build krok, deployuje sa cez `supabase functions deploy`.
//
// Vyžaduje function secret RESEND_API_KEY (supabase secrets set RESEND_API_KEY=...)
// — účet na resend.com má free tier (100 e-mailov/deň), viac v README.md.
// SUPABASE_URL a SUPABASE_SERVICE_ROLE_KEY sú do edge functions injektované
// automaticky platformou, netreba ich nastavovať ručne.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface WaitlistWebhookPayload {
  type: "INSERT";
  table: string;
  record: {
    id: string;
    full_name: string;
    email: string;
    confirmation_sent_at: string | null;
  };
}

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_ADDRESS = "FitPilot <info@myfitpilot.eu>";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY nie je nastavený (supabase secrets set RESEND_API_KEY=...)");
    return new Response("Server misconfigured", { status: 500 });
  }

  let payload: WaitlistWebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const record = payload?.record;
  if (payload?.type !== "INSERT" || !record?.email || !record?.id) {
    return new Response("Ignored (not a waitlist insert)", { status: 200 });
  }

  // Poistka proti dvojitému odoslaniu — Supabase Database Webhooks nemajú
  // at-most-once záruku (retry pri timeoute by inak poslal e-mail dvakrát).
  if (record.confirmation_sent_at) {
    return new Response("Already sent", { status: 200 });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Meno je používateľský vstup (formulár na waitlist/index.html) — uniknúť pred
  // vložením do HTML e-mailu, rovnaký princíp ako promptSafe v hlavnej appke
  // (lib/ai/promptSafety.ts): nikdy nevkladať surový vstup do výstupu, ktorý sa
  // interpretuje (tu HTML e-mailu, tam LLM prompt).
  const safeName = escapeHtml(record.full_name || "").slice(0, 120) || "budúci FitPilot používateľ";

  const emailRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: record.email,
      subject: "Si na čakacej listine FitPilot",
      html: `
        <div style="font-family:Inter,system-ui,sans-serif;background:#121110;color:#f3efe6;padding:32px;">
          <h1 style="font-size:22px;margin:0 0 16px;">Ahoj ${safeName},</h1>
          <p style="line-height:1.6;color:#cfc9bd;">
            ďakujeme za zápis na čakaciu listinu FitPilot. Ozveme sa ti hneď, ako appku spustíme naostro —
            žiadny ďalší e-mail dovtedy neposielame.
          </p>
          <p style="margin-top:24px;color:#8f897d;font-size:13px;">FitPilot · myfitpilot.eu</p>
        </div>
      `,
    }),
  });

  if (!emailRes.ok) {
    console.error("Resend API error:", emailRes.status, await emailRes.text());
    return new Response("Email send failed", { status: 502 });
  }

  const { error: updateError } = await admin
    .from("waitlist_signups")
    .update({ confirmation_sent_at: new Date().toISOString() })
    .eq("id", record.id);
  if (updateError) console.error("Failed to mark confirmation_sent_at:", updateError.message);

  return new Response("OK", { status: 200 });
});
