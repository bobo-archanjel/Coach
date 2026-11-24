import "server-only";
import { createHash, timingSafeEqual } from "crypto";

/** Overí `Authorization: Bearer ${CRON_SECRET}` (Vercel Cron). Bez nastaveného (aspoň 16 znakov) CRON_SECRET odmieta všetko (fail-closed). */
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 16) return false;
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;
  // porovnanie hashov = konštantný čas aj pri rôznej dĺžke
  const a = createHash("sha256").update(header.slice(7)).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}
