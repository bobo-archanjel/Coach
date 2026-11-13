// FitPilot — nahratie e-mailových šablón (docs/email-templates) do Supabase Auth cez
// Management API, aby sa nemuseli ručne kopírovať do Dashboardu.
//
//   node scripts/email-templates.mjs check   — porovná šablóny v Supabase s repom
//   node scripts/email-templates.mjs push    — nahrá šablóny a predmety z repa
//
// Potrebuje v .env.local:
//   NEXT_PUBLIC_SUPABASE_URL  — z neho sa zistí projekt (ref)
//   SUPABASE_ACCESS_TOKEN     — osobný token (supabase.com/dashboard/account/tokens),
//                               NIE service role key; ten Management API neprijme.

import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");

function loadEnv() {
  const env = { ...process.env };
  try {
    for (const line of readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // .env.local nemusí existovať (CI) — stačia premenné prostredia
  }
  return env;
}

const TEMPLATES = [
  {
    label: "Confirm signup",
    key: "confirmation",
    file: "docs/email-templates/potvrdenie-registracie.html",
    subject:
      '{{ if eq .Data.locale "cs" }}Potvrď svou registraci ve FitPilotu{{ else }}Potvrď svoju registráciu vo FitPilote{{ end }}',
  },
  {
    label: "Reset Password",
    key: "recovery",
    file: "docs/email-templates/reset-hesla.html",
    subject: '{{ if eq .Data.locale "cs" }}Obnovení hesla ve FitPilotu{{ else }}Reset hesla vo FitPilote{{ end }}',
  },
];

const env = loadEnv();
const token = env.SUPABASE_ACCESS_TOKEN;
const ref = env.NEXT_PUBLIC_SUPABASE_URL?.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
if (!token || !ref) {
  console.error("Chýba SUPABASE_ACCESS_TOKEN alebo NEXT_PUBLIC_SUPABASE_URL v .env.local (viď hlavička skriptu).");
  process.exit(1);
}

const api = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const norm = (s) => (s ?? "").replace(/\r\n/g, "\n").trim();

async function current() {
  const res = await fetch(api, { headers });
  if (!res.ok) throw new Error(`GET ${res.status}: ${await res.text()}`);
  return res.json();
}

const mode = process.argv[2];
if (mode === "push") {
  const body = {};
  for (const t of TEMPLATES) {
    body[`mailer_subjects_${t.key}`] = t.subject;
    body[`mailer_templates_${t.key}_content`] = readFileSync(path.join(root, t.file), "utf8");
  }
  const res = await fetch(api, { method: "PATCH", headers, body: JSON.stringify(body) });
  if (!res.ok) {
    console.error(`PATCH ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  console.log("Nahraté do Supabase:", TEMPLATES.map((t) => t.label).join(", "));
} else if (mode !== "check") {
  console.error("Použitie: node scripts/email-templates.mjs <check|push>");
  process.exit(1);
}

const cfg = await current();
let allOk = true;
for (const t of TEMPLATES) {
  const live = cfg[`mailer_templates_${t.key}_content`];
  const sameBody = norm(live) === norm(readFileSync(path.join(root, t.file), "utf8"));
  const sameSubject = norm(cfg[`mailer_subjects_${t.key}`]) === norm(t.subject);
  const bilingual = (live ?? "").includes(".Data.locale");
  allOk &&= sameBody && sameSubject;
  console.log(
    `${t.label}: text ${sameBody ? "zhodný s repom" : "INÝ ako v repe"}, predmet ${sameSubject ? "zhodný" : "INÝ"}, ` +
      `${bilingual ? "dvojjazyčný (SK/CZ)" : "BEZ prepínania jazyka"}`,
  );
}
process.exit(allOk ? 0 : 2);
