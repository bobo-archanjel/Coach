import { defineConfig, devices } from "@playwright/test";

/**
 * E2E / smoke testy FitPilot. Beží proti lokálnemu `next dev`.
 * Pozn.: `.env.local` má placeholder Supabase kľúč → prihlásený tok (dashboard,
 * reálne portál dáta) sa lokálne nedá overiť; testy pokrývajú verejné povrchy,
 * auth guardy a portál cez `?preview=` (DEV_OPEN v app/portal/layout.tsx).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
