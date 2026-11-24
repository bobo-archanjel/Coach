// i18n-ignore-file: testy automatického spárovania cez pozvánku trénera (0077) — čisté testy + voliteľný test s DB
import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import {
  INVITE_COOKIE,
  INVITE_COOKIE_MAX_AGE,
  clearsInviteCookie,
  inviteCookieOptions,
  isClaimSuccess,
  isInviteSlug,
  mapClaimInviteResult,
  parseInviteCookie,
  type ClaimInviteCode,
} from "../lib/invite/pending";
import skBranding from "../messages/sk/branding.json";
import csBranding from "../messages/cs/branding.json";

/**
 * Pozvánka trénera → spárovanie klienta jedným klikom (claim_invite, 0077):
 *  - čisté testy: tvar odkazu, cookie, mapovanie chýb RPC, kedy sa cookie maže, texty SK/CS,
 *  - cookie nastavené middlewarom pri návšteve /pozvanka/<odkaz>,
 *  - reálna DB (preskočí sa, kým migrácia 0077 nie je spustená): neplatný odkaz, spárovanie,
 *    idempotencia, iný tréner, rate limit, tréner bez prístupu.
 */

const SLUG = "0123456789abcdef0123";

test.describe("pozvánka — čisté funkcie", () => {
  test("tvar odkazu: presne 20 malých hex znakov", () => {
    expect(isInviteSlug(SLUG)).toBe(true);
    const bad = ["", "ABCDEF0123456789ABCD", SLUG + "0", SLUG.slice(1), "g123456789abcdef0123", SLUG.slice(0, 19) + "\n", null, undefined, 42];
    for (const value of bad) expect(isInviteSlug(value)).toBe(false);
    expect(parseInviteCookie(SLUG)).toBe(SLUG);
    expect(parseInviteCookie("<script>")).toBeNull();
    expect(parseInviteCookie(undefined)).toBeNull();
  });

  test("cookie: httpOnly, Lax, 7 dní, Secure v produkcii", () => {
    expect(INVITE_COOKIE).toBe("fp_invite");
    const prod = inviteCookieOptions(true);
    expect(prod).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    expect(prod.maxAge).toBe(INVITE_COOKIE_MAX_AGE);
    expect(INVITE_COOKIE_MAX_AGE).toBe(7 * 86_400);
    expect(inviteCookieOptions(false).secure).toBe(false);
  });

  test("mapovanie výsledku RPC a chýb z DB", () => {
    expect(mapClaimInviteResult("paired")).toBe("paired");
    expect(mapClaimInviteResult("already_paired")).toBe("already_paired");
    expect(mapClaimInviteResult("invalid_invite")).toBe("invalid_invite");
    expect(mapClaimInviteResult("niečo iné")).toBe("failed");
    expect(mapClaimInviteResult(null)).toBe("failed");
    const cases: [string, ClaimInviteCode][] = [
      ["too_many_attempts", "rate_limited"],
      ["already_has_trainer", "already_has_trainer"],
      ["trainer_unavailable", "trainer_unavailable"],
      ["not_a_client", "not_a_client"],
      ["not_authenticated", "not_signed_in"],
      ['relation "clients" does not exist', "failed"],
    ];
    for (const [msg, code] of cases) expect(mapClaimInviteResult(null, msg)).toBe(code);
    // chyba má prednosť pred dátami
    expect(mapClaimInviteResult("paired", "trainer_unavailable")).toBe("trainer_unavailable");
  });

  test("cookie sa maže po úspechu a definitívnej chybe, nie pri limite/výpadku", () => {
    for (const c of ["paired", "already_paired", "already_has_trainer", "trainer_unavailable", "invalid_invite", "not_a_client"] as const) {
      expect(clearsInviteCookie(c)).toBe(true);
    }
    for (const c of ["rate_limited", "failed", "not_signed_in"] as const) expect(clearsInviteCookie(c)).toBe(false);
    expect(isClaimSuccess("paired")).toBe(true);
    expect(isClaimSuccess("already_paired")).toBe(true);
    expect(isClaimSuccess("already_has_trainer")).toBe(false);
  });

  test("texty karty a chýb existujú v SK aj CS (a už nehovoria o posielaní kódu)", () => {
    for (const b of [skBranding, csBranding]) {
      const ip = b.invitePairing;
      for (const k of ["heading", "headingNoName", "text", "join", "joining", "decline", "success"] as const) {
        expect(ip[k].length).toBeGreaterThan(0);
      }
      for (const k of ["alreadyHasTrainer", "trainerUnavailable", "invalidInvite", "rateLimited", "notAClient", "notSignedIn", "failed"] as const) {
        expect(ip.errors[k].length).toBeGreaterThan(0);
      }
      expect(b.inviteLanding.steps).not.toMatch(/kód/i);
    }
  });
});

test.describe("pozvánka — cookie z middlewaru", () => {
  const setCookies = (res: { headersArray(): { name: string; value: string }[] }) =>
    res.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie").map((h) => h.value).join("\n");

  test("správny tvar odkazu uloží fp_invite (httpOnly, Lax, 7 dní), zlý tvar nie", async ({ request }) => {
    const ok = setCookies(await request.get(`/pozvanka/${SLUG}`, { maxRedirects: 0 }));
    expect(ok).toContain(`${INVITE_COOKIE}=${SLUG}`);
    expect(ok).toMatch(/HttpOnly/i);
    expect(ok).toMatch(/SameSite=Lax/i);
    expect(ok).toMatch(/Max-Age=604800/i);

    const bad = setCookies(await request.get("/pozvanka/neplatny-odkaz", { maxRedirects: 0 }));
    expect(bad).not.toContain(INVITE_COOKIE);
  });
});

try {
  process.loadEnvFile(".env.local");
} catch {
  /* bez .env.local sa test s DB preskočí */
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AUTH = { auth: { persistSession: false, autoRefreshToken: false } };

test.describe("pozvánka — reálna DB (po spustení 0077)", () => {
  test.skip(!url || !anon || !serviceRole, "Chýba Supabase konfigurácia.");
  test.describe.configure({ timeout: 120_000, mode: "serial" });

  let admin: SupabaseClient;
  let rpcMissing = false;
  const userIds: string[] = [];
  const stamp = Date.now();
  const password = "E2eInvite#2026!Pair";

  async function createUser(label: string, role: "client" | "trainer") {
    const email = `e2e-invite-${label}-${stamp}@fitpilot-testaccount.com`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `E2E ${label}`, role, locale: "sk" },
    });
    if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
    userIds.push(data.user.id);
    return { id: data.user.id, email };
  }
  async function signIn(email: string) {
    const c = createClient(url!, anon!, AUTH);
    const { error } = await c.auth.signInWithPassword({ email, password });
    test.skip(!!error, `Prihlásenie cez supabase-js nie je možné (${error?.message}).`);
    return c;
  }
  async function trainerWithSlug(label: string) {
    const t = await createUser(label, "trainer");
    const slug = randomBytes(10).toString("hex");
    const { error } = await admin.from("trainer_branding").insert({ trainer_id: t.id, invite_slug: slug });
    if (error) throw new Error(`trainer_branding: ${error.message}`);
    return { ...t, slug };
  }

  test.beforeAll(async () => {
    admin = createClient(url!, serviceRole!, AUTH);
    // RPC musí existovať (migrácia 0077) — inak sa testy nižšie preskočia
    const { error } = await admin.rpc("claim_invite", { p_slug: "0".repeat(20) });
    rpcMissing = !!error && /Could not find the function|PGRST202|does not exist/i.test(`${error.code} ${error.message}`);
  });
  test.beforeEach(() => {
    test.skip(rpcMissing, "Migrácia 0077 ešte nebola spustená.");
  });

  test.afterAll(async () => {
    if (!admin) return;
    for (const id of userIds) {
      await admin.from("invite_claim_attempts").delete().eq("user_id", id);
      await admin.from("clients").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id).catch(() => {});
    }
  });

  test("neplatný odkaz je generický; spárovanie, idempotencia, iný tréner, limit pokusov", async ({}, info) => {
    test.skip(info.project.name !== "desktop", "zápis do DB len raz (desktop)");
    const trainer = await trainerWithSlug("trener");
    const other = await trainerWithSlug("iny");
    const client = await createUser("klient", "client");
    const c = await signIn(client.email);

    // neexistujúci odkaz aj zlý tvar → rovnaká generická odpoveď
    const bad = await c.rpc("claim_invite", { p_slug: "f".repeat(20) });
    expect(bad.error).toBeNull();
    expect(bad.data).toBe("invalid_invite");
    const badFormat = await c.rpc("claim_invite", { p_slug: "x'; drop table clients;--" });
    expect(badFormat.data).toBe("invalid_invite");

    // spárovanie
    const paired = await c.rpc("claim_invite", { p_slug: trainer.slug });
    expect(paired.error).toBeNull();
    expect(paired.data).toBe("paired");
    const { data: row } = await admin.from("clients").select("trainer_id, paired_at, ended_at").eq("user_id", client.id).single();
    expect(row?.trainer_id).toBe(trainer.id);
    expect(row?.paired_at).toBeTruthy();
    expect(row?.ended_at).toBeNull();

    // ten istý tréner = bez zmeny; iný tréner = chyba
    const again = await c.rpc("claim_invite", { p_slug: trainer.slug });
    expect(again.data).toBe("already_paired");
    const second = await c.rpc("claim_invite", { p_slug: other.slug });
    expect(second.error?.message).toContain("already_has_trainer");

    // limit pokusov: 2 neplatné sú započítané, ďalších 6 neplatných → ďalší pokus je zablokovaný
    for (let i = 0; i < 6; i++) await c.rpc("claim_invite", { p_slug: "e".repeat(20) });
    const limited = await c.rpc("claim_invite", { p_slug: trainer.slug });
    expect(limited.error?.message).toContain("too_many_attempts");
  });

  test("tréner bez prístupu (read-only) sa nedá pripojiť", async ({}, info) => {
    test.skip(info.project.name !== "desktop", "zápis do DB len raz (desktop)");
    const trainer = await trainerWithSlug("readonly");
    await admin.from("trainer_subscriptions").upsert({ trainer_id: trainer.id, tier: "starter", status: "canceled", comped: false });
    const client = await createUser("klient2", "client");
    const c = await signIn(client.email);
    const res = await c.rpc("claim_invite", { p_slug: trainer.slug });
    expect(res.error?.message).toContain("trainer_unavailable");
    const { data: row } = await admin.from("clients").select("trainer_id").eq("user_id", client.id).single();
    expect(row?.trainer_id).toBeNull();
  });
});
