/* Téma dizajnového experimentu /v6design — svetlá / tmavá / podľa telefónu.
   Uložená v cookie (nie localStorage), nech server vykreslí správnu tému hneď
   v prvom HTML, bez zábleska opačnej farby. */

export const V6_THEME_COOKIE = "fp-v6-theme";

export type V6Theme = "auto" | "light" | "dark";

export function parseV6Theme(value: string | undefined): V6Theme {
  return value === "light" || value === "dark" ? value : "auto";
}

/** farba stavového riadku (meta theme-color) — rovnaká ako pozadie témy */
export const V6_THEME_COLOR = { light: "#f3eee9", dark: "#100d0c" } as const;
