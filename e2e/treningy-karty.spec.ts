import { test, expect, type Page } from "@playwright/test";

/**
 * Tréning → Tréningové plány (feature/treningy-karty): každý plán je hneď rozbalený
 * (dni + akcie bez klikania), hore oranžový pás s názvom a čipmi; výber dňa sa otvorí
 * len v karte svojho plánu; na desktope vedľa seba (2, od 1360 px 3 stĺpce), rovnako vysoké,
 * pri viac ako 3 tréningoch sa zoznam dní posúva; farebné čipy (Hotovo ✓, Od trénera činka).
 * DEV náhľad /portal/trening?preview=ok — 4 plány.
 */
const card = (page: Page, id: string) => page.locator(`#plan-${id}`);

test.describe("tréningové plány — karty s pásom", () => {
  test.skip(process.env.NODE_ENV === "production", "DEV náhľady len v next dev");

  test("všetky plány rozbalené, pás s názvom a čipmi", async ({ page }) => {
    await page.goto("/portal/trening?preview=ok");
    const list = page.locator("[data-tour='training-plans'] > li");
    await expect(list).toHaveCount(4);
    for (const [id, name] of [
      ["plan-trainer", "Silový plán — 3× týždenne"],
      ["plan-own", "Moje kardio + core"],
      ["plan-own-done", "Moja jesenná sila"],
      ["plan-done", "Letný plán — celé telo"],
    ]) {
      await expect(card(page, id).getByRole("heading", { level: 3, name })).toBeVisible();
    }
    // bez rozbaľovania — žiadne tlačidlo s aria-expanded pri pláne
    await expect(page.locator("[data-tour='training-plans'] [aria-expanded]")).toHaveCount(0);
    // dni aj akcie viditeľné hneď
    await expect(card(page, "plan-trainer").getByRole("button", { name: /Deň A — Tlak/ })).toBeVisible();
    await expect(card(page, "plan-own").getByRole("button", { name: /Rozcvička/ })).toBeVisible();
    await expect(card(page, "plan-own").getByRole("button", { name: "Upraviť plán" })).toBeVisible();
    // čipy v páse
    const band = card(page, "plan-trainer").locator("header");
    await expect(band).toContainText("Aktívny");
    await expect(band).toContainText("Od trénera");
    // počet tréningov hneď vedľa názvu
    await expect(card(page, "plan-trainer").getByTestId("plan-count")).toHaveText("2 tréningy");
    await expect(card(page, "plan-own").getByTestId("plan-count")).toHaveText("2 tréningy");
    await expect(card(page, "plan-own").locator("header")).toContainText("Vlastný");
    await expect(card(page, "plan-own").locator("header")).not.toContainText("Aktívny");
    // farebné odlíšenie — typ čipu
    await expect(band.locator('[data-kind="trainer"]')).toHaveText("Od trénera");
    await expect(band.locator('[data-kind="done"]')).toHaveText("Hotovo");
    await expect(card(page, "plan-own").locator('header [data-kind="client"]')).toHaveText("Vlastný");
    await expect(card(page, "plan-own").locator('header [data-kind="done"]')).toHaveCount(0);
  });

  test("pätička: hore Nastaviť ako aktívny | Uložiť ako šablónu, dole Report · Upraviť plán · Zmazať", async ({ page }) => {
    await page.goto("/portal/trening?preview=ok");
    const own = card(page, "plan-own");
    const box = (name: string) => own.getByRole("button", { name, exact: true }).boundingBox();
    const [act, tpl, rep, edit, del] = await Promise.all(
      ["Nastaviť ako aktívny", "Uložiť ako šablónu", "Report", "Upraviť plán", "Zmazať"].map(box),
    );
    // hore dve tenké vedľa seba (aktívny vľavo), dole tri dlaždice v jednom rade
    expect(Math.abs(act!.y - tpl!.y)).toBeLessThan(2);
    expect(act!.x).toBeLessThan(tpl!.x);
    expect(act!.height).toBeLessThan(rep!.height);
    expect(act!.y + act!.height).toBeLessThanOrEqual(rep!.y);
    expect(Math.abs(rep!.y - edit!.y)).toBeLessThan(2);
    expect(Math.abs(edit!.y - del!.y)).toBeLessThan(2);
    // aktívny plán „Nastaviť ako aktívny“ nemá — šablóna ostáva hore
    await expect(card(page, "plan-trainer").getByRole("button", { name: "Uložiť ako šablónu" })).toBeVisible();
    await expect(card(page, "plan-trainer").getByRole("button", { name: "Nastaviť ako aktívny" })).toHaveCount(0);
  });

  test("postup plánu a dni: krúžok s poradím, odcvičený s fajkou, aktívny plán „Na rade“", async ({ page }) => {
    await page.goto("/portal/trening?preview=ok");
    const own = card(page, "plan-own");
    await expect(own).toContainText("Odcvičené 1 z 2");
    const days = own.getByRole("button", { name: /Rozcvička|Sila — horná časť/ });
    await expect(days.nth(0)).toHaveAttribute("data-state", "todo");
    await expect(days.nth(1)).toHaveAttribute("data-state", "done");
    // zdroj ako tlmený text, nie štítok; počet tréningov pri názve
    await expect(own.locator('header [data-kind="client"]')).toHaveText("Vlastný");
    await expect(own.getByTestId("plan-count")).toHaveText("2 tréningy");
    // aktívny vlastný plán (náhľad „own“): najbližší neodcvičený tréning je „Na rade“
    await page.goto("/portal/trening?preview=own");
    const active = card(page, "plan-own");
    await expect(active.locator("header")).toContainText("Aktívny");
    const next = active.getByRole("button", { name: /Rozcvička/ });
    await expect(next).toHaveAttribute("data-state", "next");
    await expect(next).toContainText("Na rade");
    await expect(active.getByRole("button", { name: /Sila — horná časť/ })).not.toContainText("Na rade");
  });

  test("výber dňa sa otvorí len v karte svojho plánu, Všetky dni ho vráti", async ({ page }) => {
    await page.goto("/portal/trening?preview=ok");
    await card(page, "plan-own").getByRole("button", { name: /Rozcvička/ }).click();
    await expect(card(page, "plan-own").getByRole("button", { name: "Začať tréning" })).toBeVisible();
    // ostatné plány ukazujú ďalej zoznam dní
    await expect(card(page, "plan-trainer").getByRole("button", { name: /Deň B — Ťah/ })).toBeVisible();
    // výber dňa v inom pláne zatvorí detail v prvom
    await card(page, "plan-trainer").getByRole("button", { name: /Deň A — Tlak/ }).click();
    await expect(card(page, "plan-trainer").getByRole("button", { name: "Všetky dni" })).toBeVisible();
    await expect(card(page, "plan-own").getByRole("button", { name: /Rozcvička/ })).toBeVisible();
    await card(page, "plan-trainer").getByRole("button", { name: "Všetky dni" }).click();
    await expect(card(page, "plan-trainer").getByRole("button", { name: /Deň B — Ťah/ })).toBeVisible();
  });

  test("desktop: plány vedľa seba (2, široký 3), mobil: pod sebou", async ({ page }) => {
    await page.goto("/portal/trening?preview=ok");
    const box = (id: string) => card(page, id).boundingBox();
    const [a, b, c] = [await box("plan-trainer"), await box("plan-own"), await box("plan-own-done")];
    const width = page.viewportSize()?.width ?? 0;
    if (width >= 1000) {
      expect(Math.abs(a!.y - b!.y)).toBeLessThan(2);
      expect(b!.x).toBeGreaterThan(a!.x + a!.width - 1);
      // 2 stĺpce — tretí plán v ďalšom riadku
      expect(c!.y).toBeGreaterThan(a!.y + 10);
    } else {
      expect(b!.y).toBeGreaterThan(a!.y + a!.height - 1);
    }

    if (width >= 1000) {
      // karty v riadku rovnako vysoké; viac ako 3 tréningy — zoznam dní sa posúva v karte
      expect(Math.abs(a!.height - b!.height)).toBeLessThan(2);
      const list = card(page, "plan-trainer").locator("ul");
      await list.evaluate((ul) => {
        const li = ul.querySelector("li")!;
        for (let i = 0; i < 3; i++) ul.appendChild(li.cloneNode(true));
      });
      const { scroll, client } = await list.evaluate((ul) => ({ scroll: ul.scrollHeight, client: ul.clientHeight }));
      expect(scroll).toBeGreaterThan(client + 40);
      expect(client).toBeLessThan(240);
      await page.reload();
    }

    // široký desktop — 3 plány v jednom riadku
    await page.setViewportSize({ width: 1440, height: 900 });
    const [a3, c3] = [await box("plan-trainer"), await box("plan-own-done")];
    expect(Math.abs(a3!.y - c3!.y)).toBeLessThan(2);
    expect(c3!.x).toBeGreaterThan(a3!.x + 2 * a3!.width);
  });
});
