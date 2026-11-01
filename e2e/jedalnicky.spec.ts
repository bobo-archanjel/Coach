import { test, expect } from "@playwright/test";

/**
 * Sekcia „Jedálničky“ trénera (predtým „Výživa“ na /dashboard/vyziva): trvalý redirect
 * starých adries vrátane podstránok a nový názov v navigácii. Bez session — redirect
 * rieši next.config.ts ešte pred stránkou, navigácia sa v deve vykreslí aj pri DEV
 * náhľade detailu klienta (?preview=progress, DEV_OPEN v app/dashboard/layout.tsx).
 */

test.describe("premenovanie Výživa → Jedálničky", () => {
  test("staré /dashboard/vyziva adresy trvalo presmerujú na /dashboard/jedalnicky", async ({ request, baseURL }) => {
    const cases: [string, string][] = [
      ["/dashboard/vyziva", "/dashboard/jedalnicky"],
      ["/dashboard/vyziva/0b6a3c1e-0000-4000-8000-000000000001", "/dashboard/jedalnicky/0b6a3c1e-0000-4000-8000-000000000001"],
      ["/dashboard/vyziva/jedalnicek/0b6a3c1e-0000-4000-8000-000000000002", "/dashboard/jedalnicky/jedalnicek/0b6a3c1e-0000-4000-8000-000000000002"],
    ];
    for (const [from, to] of cases) {
      const res = await request.get(from, { maxRedirects: 0 });
      expect(res.status(), from).toBe(308);
      expect(new URL(res.headers().location, baseURL).pathname, from).toBe(to);
    }
  });

  test("navigácia dashboardu má „Jedálničky“, nie „Výživa“", async ({ page }) => {
    test.skip(process.env.NODE_ENV === "production", "DEV náhľad len v next dev");
    await page.goto("/dashboard/klienti/x?preview=progress");
    const nav = page.getByRole("navigation", { name: "Trénerský dashboard" });
    await expect(nav.getByRole("link", { name: "Jedálničky" })).toHaveAttribute("href", "/dashboard/jedalnicky");
    await expect(nav.getByRole("link", { name: "Výživa" })).toHaveCount(0);
  });
});
