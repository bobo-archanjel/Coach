// Potravina podľa čiarového kódu — skener v denníku (feature/barcode-scanner).
// 1) vlastná tabuľka `foods` (RLS: globálne import/off, vlastné 'user', trénerove),
// 2) inak Open Food Facts; kompletný produkt sa uloží ako globálny source='off', aby
//    ďalšie skeny toho istého kódu išli z DB (OFF má limit na IP a Vercel IP zdieľa).
// Neúplný produkt (bez kcal/makier) sa neukladá — vráti sa not_found s tým, čo vieme,
// a klient potravinu dokončí vo formulári „Založiť potravinu“ (source='user').
// Len prihlásený používateľ; limit na používateľa aj na volania OFF z tejto inštancie.

import { tErr } from "@/lib/i18n/serverErrors";
import { NextResponse, type NextRequest } from "next/server";
import { createClient, getUser } from "@/lib/supabase/server";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { BARCODE_FORMATS, parseBarcode } from "@/lib/barcode";
import { fetchOpenFoodFactsProduct } from "@/lib/openFoodFacts";
import {
  foodDisplayName,
  isCompleteFood,
  mapOffProduct,
  parseOffProductResponse,
  type FoodPer100g,
  type OffProduct,
} from "@/lib/offProduct";
import { allowWithinWindow } from "@/lib/rateLimitMemory";
import { isMissingColumn } from "@/lib/dbError";
import { insertOffFood } from "@/lib/offFoodStore";
import type { BarcodeLookupResult, BarcodePrefill, FoodSource, PortalFoodOption } from "@/lib/portal/types";

const BASE_COLUMNS =
  "id, name, kcal_100g, protein_100g, carbs_100g, fat_100g, fiber_100g, sugars_100g, salt_100g, serving_g, source, created_by";
// package_g/unit_base pribudli v migrácii 0066 — kým nebeží, dopyty idú bez nich (BASE_COLUMNS)
const FOOD_COLUMNS =
  "id, name, kcal_100g, protein_100g, carbs_100g, fat_100g, fiber_100g, sugars_100g, salt_100g, serving_g, source, created_by, package_g, unit_base, off_synced_at";

type FoodRow = {
  id: string;
  name: string;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  fiber_100g: number | null;
  sugars_100g: number | null;
  salt_100g: number | null;
  serving_g: number | null;
  package_g: number | null;
  unit_base: "g" | "ml";
  source: FoodSource;
  created_by: string | null;
  off_synced_at?: string | null;
};

function toOption(row: FoodRow, barcode: string): PortalFoodOption {
  return {
    foodId: row.id,
    name: row.name,
    kcal100g: Number(row.kcal_100g),
    protein100g: Number(row.protein_100g),
    carbs100g: Number(row.carbs_100g),
    fat100g: Number(row.fat_100g),
    fiber100g: row.fiber_100g === null ? null : Number(row.fiber_100g),
    sugars100g: row.sugars_100g === null ? null : Number(row.sugars_100g),
    salt100g: row.salt_100g === null ? null : Number(row.salt_100g),
    servingGrams: row.serving_g === null ? null : Number(row.serving_g),
    packageGrams: row.package_g == null ? null : Number(row.package_g),
    unitBase: row.unit_base === "ml" ? "ml" : "g",
    source: row.source,
    barcode,
  };
}

/** Vlastná potravina má prednosť (používateľ ju zadal zámerne), potom trénerova, potom globálna. */
function pickBest(rows: FoodRow[], userId: string): FoodRow | null {
  const rank = (r: FoodRow) => (r.source === "user" ? (r.created_by === userId ? 0 : 1) : 2);
  return [...rows].sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

function prefill(barcode: string, food: FoodPer100g | null): BarcodePrefill {
  return {
    barcode,
    name: food?.name ?? null,
    brand: food?.brand ?? null,
    kcal100g: food?.kcal ?? null,
    protein100g: food?.protein ?? null,
    carbs100g: food?.carbs ?? null,
    fat100g: food?.fat ?? null,
  };
}

const reply = (body: BarcodeLookupResult, status = 200) => NextResponse.json(body, { status });

/**
 * DEV seam pre e2e (e2e/barcode-flow.spec.ts) — odpoveď OFF z hlavičky namiesto siete,
 * zvyšok toku (DB, uloženie, denník) beží naostro. Rovnaká ochrana ako `?preview=`:
 * mimo `next dev` sa hlavička ignoruje. `undefined` = bez fixture, volá sa OFF.
 */
function devOffFixture(request: NextRequest): { product: OffProduct | null } | undefined {
  if (process.env.NODE_ENV !== "development") return undefined;
  const raw = request.headers.get("x-e2e-off-fixture");
  if (!raw) return undefined;
  try {
    return { product: parseOffProductResponse(JSON.parse(decodeURIComponent(raw))) };
  } catch {
    return { product: null };
  }
}

// OFF produkty uložené pred migráciou 0066 nemajú balenie ani ml (unit_base ostal default 'g').
// Taký záznam si raz dotiahneme z OFF a doplníme — off_synced_at potom ukazuje za túto hranicu,
// takže produkt, ktorý balenie naozaj nemá, sa už znova nepýta.
const PORTION_SYNC_CUTOFF = Date.parse("2026-11-17T00:00:00Z");

function needsPortionRefresh(row: FoodRow): boolean {
  if (row.source !== "off" || row.package_g != null || row.unit_base === "ml") return false;
  const synced = row.off_synced_at ? Date.parse(row.off_synced_at) : 0;
  return !(synced >= PORTION_SYNC_CUTOFF);
}

/** null = nepodarilo sa (OFF nedostupný, limit, chýba service role) — volajúci vráti pôvodný záznam. */
async function refreshPortionData(row: FoodRow, code: string): Promise<FoodRow | null> {
  const admin = tryCreateAdminClient();
  if (!admin || !allowWithinWindow("barcode:off", 15, 60_000)) return null;
  try {
    const product = await fetchOpenFoodFactsProduct(code);
    if (!product) return null;
    const mapped = mapOffProduct(product);
    const patch = {
      package_g: mapped.packageGrams,
      unit_base: mapped.unitBase,
      serving_g: row.serving_g ?? mapped.servingGrams,
      off_synced_at: new Date().toISOString(),
    };
    const { error } = await admin.from("foods").update(patch).eq("id", row.id).eq("source", "off");
    if (error) {
      console.error("potraviny/kod doplnenie porcií:", error.message);
      return null;
    }
    return { ...row, ...patch };
  } catch (err) {
    console.error("potraviny/kod doplnenie porcií OFF:", err);
    return null;
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ ean: string }> }) {
  const {
    data: { user },
  } = await getUser();
  if (!user) return reply({ status: "error", error: await tErr("notSignedIn") }, 401);

  const { ean } = await params;
  const hintParam = request.nextUrl.searchParams.get("format");
  const hint = BARCODE_FORMATS.find((f) => f === hintParam) ?? null;
  const parsed = ean.length <= 20 ? parseBarcode(ean, hint) : null;
  if (!parsed) {
    return reply({ status: "invalid", error: await tErr("api.invalidBarcode") }, 400);
  }
  const code = parsed.code;

  if (!allowWithinWindow(`barcode:${user.id}`, 30, 60_000)) {
    return reply({ status: "error", error: await tErr("api.tooManyScans") }, 429);
  }

  // 1) vlastná DB
  const supabase = await createClient();
  const lookup = (cols: string) => supabase.from("foods").select(cols).eq("barcode", code).limit(10);
  let { data: rows, error } = await lookup(FOOD_COLUMNS);
  if (isMissingColumn(error)) ({ data: rows, error } = await lookup(BASE_COLUMNS));
  if (error) {
    console.error("potraviny/kod DB:", error.message);
    return reply({ status: "error", error: await tErr("api.lookupFailed") }, 500);
  }
  const best = pickBest((rows ?? []) as unknown as FoodRow[], user.id);
  if (best) {
    const refreshed = needsPortionRefresh(best) ? await refreshPortionData(best, code) : null;
    return reply({ status: "found", food: toOption(refreshed ?? best, code) });
  }

  // 2) Open Food Facts — limit na inštanciu (OFF ráta požiadavky na IP)
  if (!allowWithinWindow("barcode:off", 15, 60_000)) {
    return reply(
      { status: "error", error: await tErr("api.offBusy") },
      429,
    );
  }
  let product: OffProduct | null;
  try {
    const fixture = devOffFixture(request);
    product = fixture ? fixture.product : await fetchOpenFoodFactsProduct(code);
  } catch (err) {
    console.error("potraviny/kod OFF:", err);
    return reply(
      { status: "error", error: await tErr("api.offDown") },
      502,
    );
  }

  if (!product) return reply({ status: "not_found", food: prefill(code, null) });
  const mapped = mapOffProduct(product);
  if (!isCompleteFood(mapped)) return reply({ status: "not_found", food: prefill(code, mapped) });

  // 3) uložiť ako globálny 'off' záznam — service role (používatelia 'off' zapisovať nesmú, RLS 0050);
  //    zápis zdieľa lib/offFoodStore.ts s AI generátorom jedálničkov
  const row = { name: foodDisplayName(mapped.name, mapped.brand).slice(0, 120) };
  const admin = tryCreateAdminClient();
  if (admin) {
    const res = await insertOffFood(admin, mapped, code);
    if (res.status === "saved") {
      const food = toOption(res.row as unknown as FoodRow, code);
      // pred migráciou sa balenie/ml neuložia, ale klient ich dostane z OFF hneď
      return reply({ status: "found", food: res.legacy ? { ...food, packageGrams: mapped.packageGrams, unitBase: mapped.unitBase } : food });
    }
    if (res.status === "duplicate" && res.row) return reply({ status: "found", food: toOption(res.row as unknown as FoodRow, code) });
    console.error("potraviny/kod uloženie:", res.status === "error" ? res.message : "duplicate");
  }

  // bez uloženia (chýba service role / chyba DB) — denník zapíše snapshot hodnôt
  return reply({
    status: "found",
    food: {
      foodId: null,
      name: row.name,
      kcal100g: mapped.kcal,
      protein100g: mapped.protein,
      carbs100g: mapped.carbs,
      fat100g: mapped.fat,
      fiber100g: mapped.fiber,
      sugars100g: mapped.sugars,
      salt100g: mapped.salt,
      servingGrams: mapped.servingGrams,
      packageGrams: mapped.packageGrams,
      unitBase: mapped.unitBase,
      source: "off",
      barcode: code,
    },
  });
}
