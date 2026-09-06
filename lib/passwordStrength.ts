// FitPilot — kontrola sily hesla (feature/optimalizacia, security audit).
// Žiadna knižnica (zxcvbn a pod. sú desiatky kB) — appka nemá bankové
// požiadavky na heslá, stačí odfiltrovať tie najslabšie/najbežnejšie a dať
// používateľovi jasnú spätnú väzbu. Používa sa pri registrácii aj resete hesla.

const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "12345678",
  "123456789",
  "1234567890",
  "qwerty123",
  "qwertyuiop",
  "letmein",
  "admin123",
  "welcome1",
  "iloveyou",
  "123123123",
  "football1",
  "monkey123",
  "dragon123",
  "master123",
  "abc123456",
  "heslo123",
  "heslo1234",
  "trener123",
  "zaheslo1",
]);

export interface PasswordCheck {
  /** false = submit by mal byť zablokovaný, `issues` obsahuje prečo. */
  ok: boolean;
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  /** Blokujúce problémy — prázdne pole = heslo prejde. */
  issues: string[];
}

const SCORE_LABELS = ["veľmi slabé", "slabé", "priemerné", "silné", "veľmi silné"];

/**
 * `context` = reťazce, ktoré heslo nesmie obsahovať (meno, časť e-mailu pred @) —
 * najčastejší spôsob, ako je "silné" heslo v skutočnosti triviálne uhádnuteľné.
 */
export function checkPassword(password: string, context: string[] = []): PasswordCheck {
  const issues: string[] = [];
  const lower = password.toLowerCase();
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSymbol = /[^a-zA-Z0-9]/.test(password);

  if (password.length < 8) issues.push("Aspoň 8 znakov.");
  if (!hasLetter || !hasDigit) issues.push("Skombinuj písmená aj čísla.");
  if (COMMON_PASSWORDS.has(lower)) issues.push("Toto heslo je príliš bežné — zvoľ iné.");

  for (const raw of context) {
    const needle = raw.trim().toLowerCase();
    if (needle.length >= 3 && lower.includes(needle)) {
      issues.push("Heslo by nemalo obsahovať tvoje meno ani e-mail.");
      break;
    }
  }

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (hasLetter && hasDigit) score++;
  if (hasSymbol) score++;
  if (COMMON_PASSWORDS.has(lower)) score = 0;
  const clamped = Math.min(score, 4) as PasswordCheck["score"];

  return { ok: issues.length === 0, score: clamped, label: SCORE_LABELS[clamped], issues };
}
