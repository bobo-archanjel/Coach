import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { isHandleShape } from "@/lib/publicPage/handle";
import { loadPublicPage } from "@/lib/publicPage/server";
import { DEFAULT_ACCENT } from "@/lib/branding/colors";

/* GET /t/<handle>/og — náhľadový obrázok 1200×630 pre zdieľanie odkazu (OpenGraph/Twitter).
   Verejný, bez session: vykreslí len verejné polia publikovanej stránky (názov, nadpis, miesto, logo/fotka
   z verejného bucketu). Nepublikovaná / bez Business / neplatný handle = 404 (rovnako ako stránka). */

export const runtime = "nodejs";

let fontCache: { name: string; data: Buffer; weight: 400 | 700 }[] | null = null;
async function fonts() {
  if (!fontCache) {
    const dir = path.join(process.cwd(), "assets", "fonts");
    const [regular, bold] = await Promise.all(["Inter-Regular.ttf", "Inter-Bold.ttf"].map((f) => readFile(path.join(dir, f))));
    fontCache = [
      { name: "Inter", data: regular, weight: 400 },
      { name: "Inter", data: bold, weight: 700 },
    ];
  }
  return fontCache;
}

/** Obrázok z nášho verejného bucketu → PNG data URL (satori nepodporuje WebP). Cudzia URL / chyba = bez obrázka. */
async function imageDataUrl(url: string | null, size: number): Promise<string | null> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!url || !base || !url.startsWith(`${base}/storage/v1/object/public/branding/`)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 2_000_000) return null;
    const png = await sharp(buf).resize(size, size, { fit: "cover" }).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  if (!isHandleShape(handle)) return new Response("not found", { status: 404 });
  const page = await loadPublicPage(handle);
  if (!page) return new Response("not found", { status: 404 });

  const accent = page.theme?.dark.accent ?? DEFAULT_ACCENT;
  const [photo, logo, fontList] = await Promise.all([imageDataUrl(page.photoUrl, 260), imageDataUrl(page.logoUrl ?? page.logoDarkUrl, 120), fonts()]);
  const headline = page.headline.length > 110 ? `${page.headline.slice(0, 107)}…` : page.headline;
  const sub = [page.location, page.online ? "online" : ""].filter(Boolean).join(" · ");

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 64, background: "#14100e", color: "#f6f1ec", fontFamily: "Inter" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 48 }}>
          {photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} width={260} height={260} alt="" style={{ borderRadius: 999, objectFit: "cover", border: `6px solid ${accent}` }} />
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 18, flex: 1 }}>
            {logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} width={72} height={72} alt="" style={{ borderRadius: 18, objectFit: "contain" }} />
            )}
            <div style={{ fontSize: page.displayName.length > 24 ? 60 : 76, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05 }}>{page.displayName}</div>
            {headline && <div style={{ fontSize: 34, color: "#d9d0c8", lineHeight: 1.3 }}>{headline}</div>}
            {sub && <div style={{ fontSize: 28, color: accent, fontWeight: 700 }}>{sub}</div>}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 26, color: "#a39a92" }}>
          <span>myfitpilot.sk/t/{page.handle}</span>
          <span style={{ color: accent, fontWeight: 700 }}>FitPilot</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: fontList,
      headers: { "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" },
    },
  );
}
