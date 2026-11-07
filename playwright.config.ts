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
    // Onboarding návod (OnboardingTour) sa po prihlásení účtu, ktorý ho ešte nevidel,
    // otvorí cez celú obrazovku a blokoval by kliky — testy štartujú s cookie
    // „návod videný“ (lib/onboarding/actions.ts). Samotný návod overuje e2e/dizajn-v6.spec.ts
    // cez ?tour=1. Odhlásenie cookie zmaže (signOutAction).
    storageState: {
      cookies: [
        {
          name: "fitpilot_tour_seen",
          value: "1",
          domain: "localhost",
          path: "/",
          expires: -1,
          httpOnly: false,
          secure: false,
          sameSite: "Lax",
        },
      ],
      origins: [],
    },
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
