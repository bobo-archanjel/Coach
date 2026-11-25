import { test, expect } from "@playwright/test";
import type { User } from "@supabase/supabase-js";
import { isPurgeableUnconfirmedUser, UNCONFIRMED_RETENTION_DAYS } from "../lib/auth/unconfirmedPurge";

/**
 * Cron mazania neoverených registrácií (feature/unconfirmed-purge). Zmazanie účtu je nevratné,
 * preto aj okrajové prípady — pri pochybnosti musí vyjsť false.
 */
const NOW = new Date("2026-11-25T12:00:00Z");
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

const user = (over: Record<string, unknown> = {}): User =>
  ({
    id: "u1",
    aud: "authenticated",
    app_metadata: {},
    user_metadata: {},
    created_at: ago(10),
    identities: [{ provider: "email" }],
    ...over,
  }) as unknown as User;

test.describe("isPurgeableUnconfirmedUser", () => {
  test("neoverený starý e-mailový účet sa maže", () => {
    expect(isPurgeableUnconfirmedUser(user(), NOW)).toBe(true);
    expect(isPurgeableUnconfirmedUser(user({ identities: undefined }), NOW)).toBe(true);
  });

  test("overený starý účet sa nemaže", () => {
    expect(isPurgeableUnconfirmedUser(user({ email_confirmed_at: ago(9), confirmed_at: ago(9) }), NOW)).toBe(false);
    expect(isPurgeableUnconfirmedUser(user({ confirmed_at: ago(9) }), NOW)).toBe(false);
    expect(isPurgeableUnconfirmedUser(user({ phone_confirmed_at: ago(9) }), NOW)).toBe(false);
  });

  test("neoverený mladší než 7 dní sa nemaže", () => {
    expect(isPurgeableUnconfirmedUser(user({ created_at: ago(3) }), NOW)).toBe(false);
    expect(isPurgeableUnconfirmedUser(user({ created_at: ago(UNCONFIRMED_RETENTION_DAYS) }), NOW)).toBe(false);
    expect(isPurgeableUnconfirmedUser(user({ created_at: ago(UNCONFIRMED_RETENTION_DAYS + 0.01) }), NOW)).toBe(true);
  });

  test("pozvaný cez dashboard sa nemaže", () => {
    expect(isPurgeableUnconfirmedUser(user({ invited_at: ago(9) }), NOW)).toBe(false);
  });

  test("OAuth a zmiešané identity sa nemažú", () => {
    expect(isPurgeableUnconfirmedUser(user({ identities: [{ provider: "google" }] }), NOW)).toBe(false);
    expect(isPurgeableUnconfirmedUser(user({ identities: [{ provider: "email" }, { provider: "google" }] }), NOW)).toBe(false);
  });

  test("účet s prihlásením sa nemaže", () => {
    expect(isPurgeableUnconfirmedUser(user({ last_sign_in_at: ago(8) }), NOW)).toBe(false);
  });

  test("neplatný alebo chýbajúci dátum vytvorenia → nemazať", () => {
    expect(isPurgeableUnconfirmedUser(user({ created_at: "nezmysel" }), NOW)).toBe(false);
    expect(isPurgeableUnconfirmedUser(user({ created_at: undefined }), NOW)).toBe(false);
    expect(isPurgeableUnconfirmedUser(user(), new Date("x"))).toBe(false);
  });

  test("anonymný používateľ sa nemaže", () => {
    expect(isPurgeableUnconfirmedUser(user({ is_anonymous: true }), NOW)).toBe(false);
  });
});
