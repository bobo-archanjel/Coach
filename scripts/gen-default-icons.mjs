// Vygeneruje predvolené ikony appky FitPilot do public/icons/ z brand kitu (docs/Design/logo.png).
// Spustenie: node scripts/gen-default-icons.mjs  (výstup je commitnutý, netreba pri builde)
// Rovnaké pravidlá ako lib/branding/appIcons.ts: logo na plnom pozadí, „any“ 80 % plochy, maskable 56 %.
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";

const BG = "#ffffff";
const src = await sharp("docs/Design/logo.png").trim().png().toBuffer();

async function tile(size, ratio) {
  const box = Math.round(size * ratio);
  const logo = await sharp(src).resize({ width: box, height: box, fit: "inside" }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 3, background: BG } })
    .composite([{ input: logo, gravity: "centre" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

await mkdir("public/icons", { recursive: true });
await writeFile("public/icons/icon-192.png", await tile(192, 0.8));
await writeFile("public/icons/icon-512.png", await tile(512, 0.8));
await writeFile("public/icons/icon-maskable-512.png", await tile(512, 0.56));
console.log("public/icons/*.png hotové");
