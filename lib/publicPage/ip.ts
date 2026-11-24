import "server-only";
import { createHmac } from "crypto";
import { getMailSecret } from "@/lib/mail/config";

/** IP návštevníka z hlavičiek proxy (Vercel prepisuje x-forwarded-for na skutočnú IP klienta). */
export function clientIp(h: Headers): string {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "unknown";
}

/** HMAC hash (hex) — do DB sa ukladá len toto, nikdy čitateľná IP ani e-mail. Kľúč: tajný kľúč e-mailov, inak service role. */
export function hashValue(kind: "ip" | "email", value: string): string {
  const secret = getMailSecret() ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "fitpilot-dev-only";
  return createHmac("sha256", secret).update(`lead-${kind}:${value.trim().toLowerCase()}`).digest("hex");
}
