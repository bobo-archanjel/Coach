// Honeypot pro prihlásenie/registráciu. CAPTCHA (Cloudflare Turnstile) už NEoverujeme
// my: Supabase Auth ju overuje sám (Attack Protection → CAPTCHA) z `options.captchaToken`
// — viď app/prihlasenie/actions.ts. Overenie cez siteverify u nás by token spotrebovalo.

/** Honeypot pole ("hp") — skryté pre ľudí (CSS + tabIndex=-1), primitívny bot,
 * ktorý vyplní každé pole formulára, ho ale nájde a vyplní. */
export function isHoneypotTripped(formData: FormData): boolean {
  const hp = formData.get("hp");
  return typeof hp === "string" && hp.trim() !== "";
}
