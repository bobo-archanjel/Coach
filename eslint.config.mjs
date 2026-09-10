import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // .next/** (skompilované build artefakty) a public/** (statické/externé
    // súbory, napr. skopírovaný scroll-world engine v public/v5/) nie sú náš
    // zdrojový kód — bez tohto ignoru lint hlásil tisíce falošných problémov
    // z nich a reálne chyby v app/+lib/+e2e/+scripts/ zanikli v šume.
    // next-env.d.ts je auto-generovaný Next.js pri každom builde/dev štarte
    // (triple-slash referencie sú jeho vlastný formát) — netreba ho editovať
    // ani lintovať, Next si ho sám prepíše nabudúce.
    ignores: ["design/**", ".next/**", "public/**", "next-env.d.ts"],
  },
];

export default eslintConfig;
