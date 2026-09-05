import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Default ("loose") CSS chunking duplikoval celý portal.module.css (64 kB)
  // do KAŽDÉHO page-level CSS chunku popri layout.css, ktorý ho už obsahuje —
  // /portal/trening tak sťahoval 128 kB CSS namiesto 64 kB (viď commit). "strict"
  // drží chunky presne podľa poradia importov namiesto zlučovania do bežných
  // skupín, čím sa táto duplicita neobjavuje.
  experimental: {
    cssChunking: "strict",
  },
  images: {
    // Obrázky cvikov z Free Exercise DB (scripts/import-exercises.mjs) — len
    // externé URL, žiadne kopírovanie do Supabase Storage. Komponenty ich
    // renderujú s `unoptimized`, remotePatterns je tu len ako defenzívna poistka.
    remotePatterns: [{ protocol: "https", hostname: "raw.githubusercontent.com" }],
  },
};

export default nextConfig;
