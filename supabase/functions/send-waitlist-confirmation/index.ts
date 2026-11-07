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
    unsubscribe_token: string;
  };
}

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_ADDRESS = "FitPilot <info@myfitpilot.sk>";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");

// Prevádzkovateľ (GDPR čl. 13 ods. 1 písm. a) — musí byť v každom e-maile
// identifikovateľný, nielen na privacy.html.
const CONTROLLER_NAME = "Boris Rosival";
const CONTROLLER_ADDRESS = "Pod lipami 75, 940 02 Nové Zámky";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// E-mailová šablóna — tabuľkový layout (nie flex/grid), lebo Outlook/desktop
// klienty CSS3 layout nevedia vykresliť; farby/padding sú inline štýly na
// každom elemente (nie <style> blok), lebo Gmail <style> často odreže úplne.
// Preheader (skrytý text na začiatku <body>) je to, čo klient zobrazí ako
// náhľad vedľa predmetu — bez neho by tam bolo surové "FitPilot" alebo prvý
// kus HTML. Brand tokeny rovnaké ako DESIGN.md/app/globals.css.
function buildConfirmationEmailHtml(safeName: string, unsubscribeUrl: string): string {
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
              <img src="https://myfitpilot.sk/assets/logo-wordmark.png" alt="FitPilot" width="140"
                   style="display:block;margin:0 auto 28px;height:auto;" />
              <div style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#e6b23a;margin-bottom:14px;">
                Čakacia listina
              </div>
              <h1 style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:1.3;color:#f3efe6;font-weight:800;">
                Si na zozname, ${safeName}!
              </h1>
              <p style="margin:0 0 20px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#cfc9bd;text-align:left;">
                Ďakujeme za zápis na čakaciu listinu FitPilot — appky pre fitness trénerov, ich klientov aj ľudí,
                ktorí trénujú sami, na Slovensku a v Česku. Ozveme sa ti hneď, ako appku spustíme naostro.
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
              FitPilot · <a href="https://myfitpilot.sk" style="color:#8f897d;">myfitpilot.sk</a><br />
              ${CONTROLLER_NAME}, ${CONTROLLER_ADDRESS}<br />
              Prihlásil sa niekto iný tvojím e-mailom omylom? Napíš na
              <a href="mailto:info@myfitpilot.sk" style="color:#8f897d;">info@myfitpilot.sk</a> a vymažeme ťa zo zoznamu.<br />
              <a href="${unsubscribeUrl}" style="color:#8f897d;">Odhlásiť sa z čakacej listiny</a> ·
              <a href="https://myfitpilot.sk/privacy.html" style="color:#8f897d;">Ochrana súkromia</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildConfirmationEmailText(safeName: string, unsubscribeUrl: string): string {
  return [
    `Si na zozname, ${safeName}!`,
    ``,
    `Ďakujeme za zápis na čakaciu listinu FitPilot — appky pre fitness trénerov, ich klientov aj ľudí,`,
    `ktorí trénujú sami, na Slovensku a v Česku. Ozveme sa ti hneď, ako appku spustíme naostro.`,
    ``,
    `Toto je jediný e-mail, ktorý od nás zatiaľ dostaneš. Ďalší príde presne vtedy, keď bude appka pripravená`,
    `na spustenie — žiadny ďalší spam, žiadne zdieľanie tretím stranám.`,
    ``,
    `FitPilot · https://myfitpilot.sk`,
    `${CONTROLLER_NAME}, ${CONTROLLER_ADDRESS}`,
    `Prihlásil sa niekto iný tvojím e-mailom omylom? Napíš na info@myfitpilot.sk a vymažeme ťa zo zoznamu.`,
    `Odhlásiť sa z čakacej listiny: ${unsubscribeUrl}`,
    `Ochrana súkromia: https://myfitpilot.sk/privacy.html`,
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

  // Jednoklikové odhlásenie (0055_waitlist_unsubscribe.sql, waitlist-unsubscribe
  // edge funkcia) — § 116 zákona č. 452/2021 Z. z. a GDPR čl. 7 ods. 3 vyžadujú,
  // aby odvolanie súhlasu bolo rovnako jednoduché ako jeho udelenie.
  //
  // Odkaz, na ktorý KLIKNE ČLOVEK, musí ísť na myfitpilot.sk (waitlist/odhlasenie.html),
  // NIE priamo na *.supabase.co — Supabase vynucuje na edge funkciách Content-Type:
  // text/plain + CSP sandbox (ochrana pred phishingom na zdieľanej doméne), takže
  // priamy odkaz na funkciu by sa v prehliadači nikdy nevykreslil ako stránka,
  // len ako surový text (zistené naživo). Stránka na myfitpilot.sk potom funkciu
  // volá cez fetch() — rovnaký vzor ako formulár na index.html.
  const unsubscribePageUrl = `https://myfitpilot.sk/odhlasenie.html?token=${encodeURIComponent(record.unsubscribe_token)}`;
  // List-Unsubscribe/-Post (RFC 2369/8058) naopak SMIE mieriť priamo na funkciu —
  // toto POSTuje mailový server (Gmail/Yahoo), nie prehliadač človeka, takže mu
  // nezáleží na Content-Type odpovede, len na stavovom kóde.
  const unsubscribeApiUrl = `${SUPABASE_URL}/functions/v1/waitlist-unsubscribe?token=${encodeURIComponent(record.unsubscribe_token)}`;

  const emailRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: record.email,
      subject: "Si na čakacej listine FitPilot 🎉",
      html: buildConfirmationEmailHtml(firstName, unsubscribePageUrl),
      text: buildConfirmationEmailText(firstName, unsubscribePageUrl),
      // List-Unsubscribe (RFC 2369) + List-Unsubscribe-Post (RFC 8058, "one-click")
      // — Gmail/Yahoo/Outlook ukážu vlastné "Unsubscribe" tlačidlo pri predmete,
      // ktoré POSTne priamo na náš odkaz bez otvárania e-mailu. Mailboxy s vysokým
      // objemom (Gmail, Yahoo) to od februára 2024 pri hromadných e-mailoch vyžadujú
      // pre dobrú doručiteľnosť, aj keď toto je transakčný, nie hromadný e-mail.
      headers: {
        "List-Unsubscribe": `<${unsubscribeApiUrl}>, <mailto:info@myfitpilot.sk?subject=unsubscribe>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
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
