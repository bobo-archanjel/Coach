import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase Realtime v prehliadači: nová správa sa ukáže bez obnovenia stránky.
 *
 * Predtým sa kanál pripájal skôr, než sa načítala session z cookie, teda ako rola `anon`.
 * Server odber odmietol („invalid column for filter sender“) a udalosti nikdy neprišli.
 * Zvonček sa obnovil až po prechode na inú stránku, návrate na kartu alebo 5-minútovom intervale.
 *
 * Testy sledujú WebSocket. Odber musí server potvrdiť (system / postgres_changes / ok) a
 * vložená správa musí prísť ako udalosť `postgres_changes`. Zvonček sa pritom zmení bez
 * akejkoľvek akcie na stránke a s ním aj ostatné odznaky (app/components/liveUnread.ts):
 * „Správy“ v menu trénera, „N správ“ v zozname klientov a bodka pri „Chat“ v portáli.
 * Dočasné správy sa na konci zmažú (service role).
 *   E2E_TRAINER_EMAIL, E2E_TRAINER_PASSWORD, E2E_CLIENT_EMAIL, E2E_CLIENT_PASSWORD
 */

try {
  process.loadEnvFile(".env.local");
} catch {
  /* bez .env.local sa DB testy preskočia */
}
const env = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  serviceRole: process.env.SUPABASE_SERVICE_ROLE_KEY,
  trainerEmail: process.env.E2E_TRAINER_EMAIL,
  trainerPassword: process.env.E2E_TRAINER_PASSWORD,
  clientEmail: process.env.E2E_CLIENT_EMAIL,
  clientPassword: process.env.E2E_CLIENT_PASSWORD,
};
const hasEnv = Object.values(env).every(Boolean);
const AUTH = { auth: { persistSession: false, autoRefreshToken: false } };

async function login(page: Page, email: string, password: string, to: RegExp) {
  await page.goto("/prihlasenie");
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: "Prihlásiť sa" }).click();
  await page.waitForURL(to, { timeout: 30_000 });
}

type RealtimeWatch = {
  /** Server potvrdil odber zmien v DB; odmietnutie (napr. pripojenie ako anon) ho zamietne s hláškou servera. */
  subscribed: Promise<void>;
  /** `body` záznamov, ktoré prišli ako `postgres_changes` na kanál. */
  received: string[];
};

/** Sleduje Realtime WebSocket stránky pre kanál `realtime:<topicPrefix>…`. Volať pred otvorením stránky. */
function watchRealtime(page: Page, topicPrefix: string): RealtimeWatch {
  const received: string[] = [];
  const subscribed = new Promise<void>((resolve, reject) => {
    page.on("websocket", (ws) => {
      if (!ws.url().includes("/realtime/")) return;
      ws.on("framereceived", ({ payload }) => {
        if (typeof payload !== "string") return;
        let msg: unknown;
        try {
          msg = JSON.parse(payload);
        } catch {
          return;
        }
        // protokol 2.0.0: [join_ref, ref, topic, event, payload]; 1.0.0: { topic, event, payload }
        const [topic, event, body] = Array.isArray(msg)
          ? [msg[2], msg[3], msg[4]]
          : [(msg as { topic?: unknown }).topic, (msg as { event?: unknown }).event, (msg as { payload?: unknown }).payload];
        if (typeof topic !== "string" || !topic.startsWith(`realtime:${topicPrefix}`)) return;
        const b = body as { extension?: string; status?: string; message?: string; data?: { record?: { body?: string } } };
        if (event === "system" && b?.extension === "postgres_changes") {
          if (b.status === "ok") resolve();
          else reject(new Error(`Realtime odber ${topic} odmietnutý: ${b.message}`));
        } else if (event === "postgres_changes" && typeof b?.data?.record?.body === "string") {
          received.push(b.data.record.body);
        }
      });
    });
  });
  subscribed.catch(() => {}); // zamietnutie vyhodnotí `expectSubscribed`, nie unhandled rejection
  return { subscribed, received };
}

async function expectSubscribed(watch: RealtimeWatch) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Realtime odber nepotvrdený do 20 s")), 20_000);
  });
  try {
    await Promise.race([watch.subscribed, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Počet v zvončeku podľa aria-label („Upozornenia“ / „Upozornenia, 3“). */
async function bellCount(page: Page): Promise<number> {
  const label = (await page.getByRole("button", { name: /^Upozornenia/ }).first().getAttribute("aria-label")) ?? "";
  return Number(/,\s*(\d+)/.exec(label)?.[1] ?? 0);
}

/** Číslo v odznaku (0, keď odznak nie je). */
async function badgeNumber(badge: ReturnType<Page["locator"]>): Promise<number> {
  if ((await badge.count()) === 0) return 0;
  return Number(/\d+/.exec((await badge.first().textContent()) ?? "")?.[0] ?? 0);
}

test.describe("Realtime: nové správy bez obnovenia stránky (reálna DB)", () => {
  test.skip(!hasEnv, "chýbajú E2E_* / Supabase env premenné");
  test.describe.configure({ mode: "serial" });

  let admin: SupabaseClient;
  let qaClientId = "";
  const messageIds: string[] = [];
  const stamp = Date.now().toString().slice(-6);

  async function insertMessage(sender: "client" | "trainer", body: string) {
    const { data, error } = await admin.from("messages").insert({ client_id: qaClientId, sender, body }).select("id").single();
    expect(error).toBeNull();
    messageIds.push(data!.id);
  }

  test.beforeAll(async () => {
    admin = createClient(env.url!, env.serviceRole!, AUTH);
    const api = createClient(env.url!, env.anon!, AUTH);
    const { data, error } = await api.auth.signInWithPassword({ email: env.clientEmail!, password: env.clientPassword! });
    if (error || !data.user) throw new Error(`Prihlásenie klienta zlyhalo: ${error?.message}`);
    const { data: row } = await api.from("clients").select("id").eq("user_id", data.user.id).limit(1).single();
    qaClientId = row!.id;
  });

  test.afterAll(async () => {
    if (messageIds.length) await admin.from("messages").delete().in("id", messageIds);
  });

  test("zvonček, „Správy“ v menu aj odznak v zozname klientov pribudnú pri novej správe od klienta", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "zápis do DB len raz (desktop)");
    const watch = watchRealtime(page, "bell-messages-");
    await login(page, env.trainerEmail!, env.trainerPassword!, /\/dashboard$/); // prihlásenie vedie na zoznam klientov
    await expectSubscribed(watch);
    await page.waitForLoadState("networkidle");
    const navBadge = page.getByRole("navigation").first().locator("a[href='/dashboard/spravy'] [aria-label]");
    const rosterPill = page.locator(`a[href="/dashboard/spravy?client=${qaClientId}"]`);
    const before = { bell: await bellCount(page), nav: await badgeNumber(navBadge), pill: await badgeNumber(rosterPill) };

    const body = `E2E realtime zvonček trénera ${stamp}`;
    await insertMessage("client", body);
    await expect.poll(() => watch.received, { timeout: 10_000 }).toContain(body);
    await expect.poll(() => bellCount(page), { timeout: 10_000 }).toBe(before.bell + 1);
    await expect.poll(() => badgeNumber(navBadge), { timeout: 5_000 }).toBe(before.nav + 1);
    await expect.poll(() => badgeNumber(rosterPill), { timeout: 5_000 }).toBe(before.pill + 1);
    expect(page.url()).toMatch(/\/dashboard$/); // bez navigácie a obnovenia
  });

  test("zvonček aj bodka pri „Chat“ u klienta pribudnú pri novej správe od trénera", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "zápis do DB len raz (desktop)");
    // QA klient bez neprečítaných správ od trénera — bodka musí naozaj pribudnúť, nie svietiť už predtým
    await admin
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("client_id", qaClientId)
      .in("sender", ["trainer", "system"])
      .is("read_at", null);
    const watch = watchRealtime(page, "portal-bell-messages-");
    await login(page, env.clientEmail!, env.clientPassword!, /\/portal/);
    await expectSubscribed(watch);
    await page.waitForLoadState("networkidle");
    const chatDot = page.getByRole("navigation").first().locator("a[href='/portal/chat'] [class*=v6NavDot]");
    await expect(chatDot).toHaveCount(0);
    const before = await bellCount(page);

    const body = `E2E realtime zvonček klienta ${stamp}`;
    await insertMessage("trainer", body);
    await expect.poll(() => watch.received, { timeout: 10_000 }).toContain(body);
    await expect.poll(() => bellCount(page), { timeout: 10_000 }).toBe(before + 1);
    await expect(chatDot).toHaveCount(1, { timeout: 5_000 });
  });

  test("otvorený chat trénera dostane správu cez Realtime", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "zápis do DB len raz (desktop)");
    const watch = watchRealtime(page, "chat-messages-trainer-");
    await login(page, env.trainerEmail!, env.trainerPassword!, /\/dashboard/);
    await page.goto(`/dashboard/spravy?client=${qaClientId}`);
    await expect(page.getByRole("textbox").last()).toBeVisible();
    await expectSubscribed(watch);

    const body = `E2E realtime chat ${stamp}`;
    await insertMessage("client", body);
    // chat sa sám obnovuje aj každých 12 s — Realtime overuje udalosť na sockete
    await expect.poll(() => watch.received, { timeout: 10_000 }).toContain(body);
    await expect(page.getByText(body).last()).toBeVisible({ timeout: 10_000 });
  });
});
