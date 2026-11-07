// Skopíruje ZXing WASM (čítačka čiarových kódov pre skener v denníku na iPhone, kde
// prehliadač nemá natívny BarcodeDetector) z node_modules do public/wasm/, aby sa
// servoval z vlastnej domény a nie z CDN (CSP pustí len 'self'). Beží pri
// `npm install` (postinstall) aj pred `npm run build` (prebuild) — súbor tak vždy
// zodpovedá nainštalovanej verzii zxing-wasm. public/wasm/ je v .gitignore.

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(repoRoot, "node_modules/zxing-wasm/dist/reader/zxing_reader.wasm");
const targetDir = path.join(repoRoot, "public/wasm");

if (!existsSync(source)) {
  // napr. inštalácia bez dev závislostí v inom balíku — skener potom na iPhone nepôjde,
  // ale nech to nezhodí celú inštaláciu
  console.warn(`copy-zxing-wasm: nenašiel som ${source} — skener na iOS nebude fungovať.`);
  process.exit(0);
}
mkdirSync(targetDir, { recursive: true });
copyFileSync(source, path.join(targetDir, "zxing_reader.wasm"));
console.log("copy-zxing-wasm: public/wasm/zxing_reader.wasm pripravený.");
