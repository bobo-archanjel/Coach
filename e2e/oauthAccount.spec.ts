import { test, expect } from "@playwright/test";
import { isBrandNewOAuthAccount } from "../lib/auth/oauthAccount";

/**
 * Rozpoznanie účtu, ktorý vznikol práve týmto Google prihlásením (feature/google-rola) —
 * podľa toho callback pri záložke Prihlásenie zmaže nový účet a ukáže „nie si zaregistrovaný“.
 * Chyba tu by zmazala existujúci účet, preto aj okrajové prípady.
 */
const NOW = Date.parse("2026-11-18T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

test.describe("isBrandNewOAuthAccount", () => {
  test("účet vytvorený práve teraz (prvé prihlásenie) je nový", () => {
    expect(isBrandNewOAuthAccount({ created_at: ago(2_000), last_sign_in_at: ago(1_500) }, NOW)).toBe(true);
    expect(isBrandNewOAuthAccount({ created_at: ago(2_000), last_sign_in_at: null }, NOW)).toBe(true);
  });

  test("starý účet nie je nový", () => {
    expect(isBrandNewOAuthAccount({ created_at: ago(86_400_000), last_sign_in_at: ago(1_000) }, NOW)).toBe(false);
    expect(isBrandNewOAuthAccount({ created_at: ago(61_000), last_sign_in_at: ago(61_000) }, NOW)).toBe(false);
  });

  test("účet z pred chvíľou, ktorý sa prihlasuje znova, nie je nový", () => {
    expect(isBrandNewOAuthAccount({ created_at: ago(40_000), last_sign_in_at: ago(500) }, NOW)).toBe(false);
  });

  test("neplatný dátum vytvorenia → nie je nový (radšej nezmazať)", () => {
    expect(isBrandNewOAuthAccount({ created_at: "nezmysel", last_sign_in_at: ago(500) }, NOW)).toBe(false);
  });
});
