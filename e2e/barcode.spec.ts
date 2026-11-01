import { test, expect } from "@playwright/test";
import { expandUpcE, gs1CheckDigit, parseBarcode } from "../lib/barcode";
import { foodDisplayName, isCompleteFood, mapOffProduct, parseOffProductResponse } from "../lib/offProduct";
import { kcalMismatch } from "../lib/meals";

/**
 * Skener čiarových kódov v denníku (feature/barcode-scanner) — čisté funkcie bez
 * prehliadača/DB: validácia a zjednotenie kódov (lib/barcode.ts), mapovanie odpovede
 * Open Food Facts na hodnoty na 100 g (lib/offProduct.ts) a kontrola kcal vs. makrá.
 */

test.describe("čiarové kódy: validácia a jednotný tvar", () => {
  test("kontrolná číslica GS1", () => {
    expect(gs1CheckDigit("400638133393")).toBe(1);
    expect(gs1CheckDigit("590123412345")).toBe(7);
    expect(gs1CheckDigit("9638507")).toBe(4);
  });

  test("EAN-13 platný ostáva, neplatná kontrolná číslica = null", () => {
    expect(parseBarcode("4006381333931")).toEqual({ format: "ean_13", code: "4006381333931" });
    expect(parseBarcode("5901234123457")?.code).toBe("5901234123457");
    expect(parseBarcode("4006381333932")).toBeNull();
  });

  test("medzery a pomlčky sa ignorujú, iné znaky nie", () => {
    expect(parseBarcode(" 4006 3813-3393 1 ")?.code).toBe("4006381333931");
    expect(parseBarcode("40063813339a1")).toBeNull();
    expect(parseBarcode("")).toBeNull();
    expect(parseBarcode("123")).toBeNull();
    expect(parseBarcode("40063813339310")).toBeNull(); // 14 číslic
  });

  test("EAN-8", () => {
    expect(parseBarcode("96385074")).toEqual({ format: "ean_8", code: "96385074" });
    expect(parseBarcode("96385075")).toBeNull();
  });

  test("UPC-A dostane úvodnú nulu (13 číslic ako v Open Food Facts)", () => {
    expect(parseBarcode("036000291452")).toEqual({ format: "upc_a", code: "0036000291452" });
    expect(parseBarcode("036000291453")).toBeNull();
  });

  test("UPC-E sa rozvinie na UPC-A (všetky pravidlá podľa poslednej číslice)", () => {
    expect(expandUpcE("04252614")).toBe("042100005264"); // posledná 0–2
    expect(expandUpcE("01234565")).toBe("012345000065"); // 5–9
    expect(expandUpcE("01234531")).toBe("012300000451"); // 3
    expect(expandUpcE("01234543")).toBe("012340000053"); // 4
    expect(expandUpcE("21234565")).toBeNull(); // číselný systém len 0/1
    expect(expandUpcE("04252615")).toBeNull(); // zlá kontrolná číslica
  });

  test("8 číslic: hint skenera rozhodne EAN-8 vs. UPC-E, bez hintu má prednosť EAN-8", () => {
    // "01234565" je platný EAN-8 aj UPC-E
    expect(parseBarcode("01234565")).toEqual({ format: "ean_8", code: "01234565" });
    expect(parseBarcode("01234565", "upc_e")).toEqual({ format: "upc_e", code: "0012345000065" });
    // "04252614" ako EAN-8 neplatný → bez hintu sa skúsi UPC-E
    expect(parseBarcode("04252614")).toEqual({ format: "upc_e", code: "0042100005264" });
    expect(parseBarcode("04252614", "ean_8")).toBeNull();
  });
});

test.describe("Open Food Facts → hodnoty na 100 g", () => {
  test("kompletný produkt: slovenský názov, prvá značka, porcia", () => {
    const food = mapOffProduct({
      code: "8586000201234",
      product_name: "Skyr Vanilla",
      product_name_sk: "Skyr vanilka",
      product_name_cs: "Skyr vanilka CZ",
      brands: "Rajo, Meggle",
      serving_quantity: "140",
      nutriments: {
        "energy-kcal_100g": 78,
        proteins_100g: 10.2,
        carbohydrates_100g: 7.5,
        fat_100g: 0.2,
        fiber_100g: 0,
        sugars_100g: 7.1,
        salt_100g: 0.11,
      },
    });
    expect(food).toEqual({
      name: "Skyr vanilka",
      brand: "Rajo",
      kcal: 78,
      protein: 10.2,
      carbs: 7.5,
      fat: 0.2,
      fiber: 0,
      sugars: 7.1,
      salt: 0.1,
      servingGrams: 140,
    });
    expect(isCompleteFood(food)).toBe(true);
  });

  test("bez slovenského názvu → český → pôvodný; značky ako pole", () => {
    expect(mapOffProduct({ product_name_cs: "Rohlík", product_name: "Roll" }).name).toBe("Rohlík");
    expect(mapOffProduct({ product_name: "  Roll  " }).name).toBe("Roll");
    expect(mapOffProduct({ brands: ["Penam", "Other"] }).brand).toBe("Penam");
  });

  test("kcal z kJ, soľ zo sodíka, čísla ako reťazce aj s čiarkou", () => {
    const fromKj = mapOffProduct({ nutriments: { "energy-kj_100g": 418.4, sodium_100g: 0.4, fat_100g: "3,5" } });
    expect(fromKj.kcal).toBe(100);
    expect(fromKj.salt).toBe(1);
    expect(fromKj.fat).toBe(3.5);
    // "energy_100g" je v OFF v kJ
    expect(mapOffProduct({ nutriments: { energy_100g: 836.8 } }).kcal).toBe(200);
  });

  test("chýbajúce a nezmyselné hodnoty ostanú null — produkt nie je kompletný", () => {
    const food = mapOffProduct({
      product_name: "Čokoláda",
      nutriments: { "energy-kcal_100g": 2200, proteins_100g: -1, carbohydrates_100g: 55 },
      serving_quantity: 0,
    });
    expect(food).toMatchObject({ kcal: null, protein: null, carbs: 55, fat: null, fiber: null, sugars: null, salt: null });
    expect(food.servingGrams).toBeNull();
    expect(food.brand).toBeNull();
    expect(isCompleteFood(food)).toBe(false);
    expect(isCompleteFood(mapOffProduct({}))).toBe(false);
  });

  test("bez názvu nie je kompletný ani s makrami", () => {
    const food = mapOffProduct({
      nutriments: { "energy-kcal_100g": 100, proteins_100g: 1, carbohydrates_100g: 20, fat_100g: 1 },
    });
    expect(food.name).toBeNull();
    expect(isCompleteFood(food)).toBe(false);
  });

  test("odpoveď API: status 1 = produkt, inak null", () => {
    expect(parseOffProductResponse({ status: 1, product: { product_name: "X" } })).toEqual({ product_name: "X" });
    expect(parseOffProductResponse({ status: 0, status_verbose: "product not found" })).toBeNull();
    expect(parseOffProductResponse({ status: 1 })).toBeNull();
    expect(parseOffProductResponse(null)).toBeNull();
    expect(parseOffProductResponse("chyba")).toBeNull();
  });

  test("zobrazený názov so značkou (bez duplicity)", () => {
    expect(foodDisplayName("Maslo", "Rajo")).toBe("Maslo (Rajo)");
    expect(foodDisplayName("Rajo maslo", "Rajo")).toBe("Rajo maslo");
    expect(foodDisplayName("Maslo", null)).toBe("Maslo");
  });
});

test.describe("kontrola kcal vs. 4·B + 4·S + 9·T", () => {
  test("sedí v tolerancii 15 % → bez upozornenia", () => {
    expect(kcalMismatch(100, 10, 10, 2)).toBeNull(); // odhad 98
    expect(kcalMismatch(78, 10.2, 7.5, 0.2)).toBeNull(); // odhad 72,6 (7 %)
  });

  test("nesedí → odhad z makier", () => {
    expect(kcalMismatch(300, 10, 10, 2)).toEqual({ estimatedKcal: 98 });
    expect(kcalMismatch(50, 10, 10, 2)).toEqual({ estimatedKcal: 98 });
  });

  test("veľmi nízke hodnoty a neplatný vstup sa nekontrolujú", () => {
    expect(kcalMismatch(2, 0, 1, 0)).toBeNull();
    expect(kcalMismatch(Number.NaN, 1, 1, 1)).toBeNull();
    expect(kcalMismatch(-5, 1, 1, 1)).toBeNull();
  });
});
