import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Obrázky cvikov z Free Exercise DB (scripts/import-exercises.mjs) — len
    // externé URL, žiadne kopírovanie do Supabase Storage. Komponenty ich
    // renderujú s `unoptimized`, remotePatterns je tu len ako defenzívna poistka.
    remotePatterns: [{ protocol: "https", hostname: "raw.githubusercontent.com" }],
  },
};

export default nextConfig;
