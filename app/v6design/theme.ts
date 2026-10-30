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

/** themeColor pre generateViewport — pri "auto" dve hodnoty podľa prefers-color-scheme */
export function v6ThemeColor(theme: V6Theme) {
  if (theme === "auto") {
    return [
      { media: "(prefers-color-scheme: light)", color: V6_THEME_COLOR.light },
      { media: "(prefers-color-scheme: dark)", color: V6_THEME_COLOR.dark },
    ];
  }
  return V6_THEME_COLOR[theme];
}

/* Dizajn dashboardu sa nevyberá adresou (ako portál), ale cookie — /v6design/dashboard
   ju zapne, Nastavenia → "Pôvodný dizajn" vypne. Dashboard beží na bežných /dashboard
   adresách, takže odkazy aj presmerovania akcií ostávajú nezmenené. */
export const DASH_SKIN_COOKIE = "fp-dash-skin";
