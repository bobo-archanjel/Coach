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

// E-mailová šablóna — tabuľkový layout (nie flex/grid), lebo Outlook/desktop
// klienty CSS3 layout nevedia vykresliť; farby/padding sú inline štýly na
// každom elemente (nie <style> blok), lebo Gmail <style> často odreže úplne.
// Preheader (skrytý text na začiatku <body>) je to, čo klient zobrazí ako
// náhľad vedľa predmetu — bez neho by tam bolo surové "FitPilot" alebo prvý
// kus HTML. Brand tokeny rovnaké ako DESIGN.md/app/globals.css.
function buildConfirmationEmailHtml(safeName: string): string {
  const preheader = `Si na čakacej listine — ozveme sa hneď, ako appku spustíme.`;
  return `<!DOCTYPE html>
<html lang="sk">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Si na čakacej listine FitPilot</title>
</head>
<body style="margin:0;padding:0;background-color:#121110;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#121110;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0"
               style="max-width:480px;width:100%;background-color:#1b1a18;border:1px solid #38352f;border-radius:12px;">
          <tr>
            <td style="padding:36px 32px 28px;text-align:center;">
              <img src="https://myfitpilot.eu/assets/logo-wordmark.png" alt="FitPilot" width="140"
                   style="display:block;margin:0 auto 28px;height:auto;" />
              <div style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#e6b23a;margin-bottom:14px;">
                Čakacia listina
              </div>
              <h1 style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:1.3;color:#f3efe6;font-weight:800;">
                Si na zozname, ${safeName}!
              </h1>
              <p style="margin:0 0 20px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#cfc9bd;text-align:left;">
                Ďakujeme za zápis na čakaciu listinu FitPilot — appky pre fitness trénerov na Slovensku
                a v Česku. Ozveme sa ti hneď, ako appku spustíme naostro.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="border-top:1px solid #38352f;font-size:1px;line-height:1px;">&nbsp;</td></tr>
              </table>
              <p style="margin:20px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#8f897d;text-align:left;">
                Toto je jediný e-mail, ktorý od nás zatiaľ dostaneš. Ďalší príde presne vtedy, keď bude appka
                pripravená na spustenie — žiadny ďalší spam, žiadne zdieľanie tretím stranám.
              </p>
            </td>
          </tr>
        </table>
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">
          <tr>
            <td style="padding:20px 32px 0;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#8f897d;">
              FitPilot · <a href="https://myfitpilot.eu" style="color:#8f897d;">myfitpilot.eu</a><br />
              Prihlásil sa niekto iný tvojím e-mailom omylom? Napíš na
              <a href="mailto:info@myfitpilot.eu" style="color:#8f897d;">info@myfitpilot.eu</a> a vymažeme ťa zo zoznamu.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildConfirmationEmailText(safeName: string): string {
  return [
    `Si na zozname, ${safeName}!`,
    ``,
    `Ďakujeme za zápis na čakaciu listinu FitPilot — appky pre fitness trénerov na Slovensku a v Česku.`,
    `Ozveme sa ti hneď, ako appku spustíme naostro.`,
    ``,
    `Toto je jediný e-mail, ktorý od nás zatiaľ dostaneš. Ďalší príde presne vtedy, keď bude appka pripravená`,
    `na spustenie — žiadny ďalší spam, žiadne zdieľanie tretím stranám.`,
    ``,
    `FitPilot · https://myfitpilot.eu`,
    `Prihlásil sa niekto iný tvojím e-mailom omylom? Napíš na info@myfitpilot.eu a vymažeme ťa zo zoznamu.`,
  ].join("\n");
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

  // Krstné meno len na oslovenie v predmete/nadpise ("Si na zozname, Boris!") —
  // celé meno pôsobí v tomto kontexte formálne/čudne, priezvisko sa vynecháva.
  const firstName = safeName.split(/\s+/)[0] || safeName;

  const emailRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: record.email,
      subject: "Si na čakacej listine FitPilot 🎉",
      html: buildConfirmationEmailHtml(firstName),
      text: buildConfirmationEmailText(firstName),
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
