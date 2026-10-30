"use client";

import { useState } from "react";
import { V6_THEME_COLOR, V6_THEME_COOKIE, type V6Theme } from "./theme";
import s from "./themeSwitch.module.css";

const AutoIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="6.5" y="2.5" width="11" height="19" rx="3" stroke="currentColor" strokeWidth="1.8" />
    <path d="M10.5 18.5h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);
const SunIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
    <path
      d="M12 2.5v2M12 19.5v2M21.5 12h-2M4.5 12h-2M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4M18.7 18.7l-1.4-1.4M6.7 6.7 5.3 5.3"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);
const MoonIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  </svg>
);

const OPTIONS: { value: V6Theme; label: string; Icon: () => React.ReactElement }[] = [
  { value: "auto", label: "Auto", Icon: AutoIcon },
  { value: "light", label: "Svetlá", Icon: SunIcon },
  { value: "dark", label: "Tmavá", Icon: MoonIcon },
];

/** Farba stavového riadku — upraví existujúce meta značky (Next ich spravuje, nemazať). */
function syncThemeColor(theme: V6Theme) {
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    const forDark = theme === "dark" || (theme === "auto" && meta.media.includes("dark"));
    meta.content = forDark ? V6_THEME_COLOR.dark : V6_THEME_COLOR.light;
  });
}

/**
 * Svetlá / Tmavá / Automaticky (podľa telefónu). Prepne hneď v prehliadači
 * (data-theme na koreni v6) a uloží do cookie, aby server pri ďalšom načítaní
 * vykreslil rovnakú tému bez zábleska.
 */
export function ThemeSwitch({ initial }: { initial: V6Theme }) {
  const [theme, setTheme] = useState<V6Theme>(initial);

  const choose = (next: V6Theme) => {
    setTheme(next);
    // path=/ — tá istá téma pre portál (/v6design/portal) aj dashboard s v6 skinom (/dashboard)
    document.cookie = `${V6_THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    document.querySelector("[data-v6-root]")?.setAttribute("data-theme", next);
    syncThemeColor(next);
  };

  return (
    <div className={s.themeSeg} role="radiogroup" aria-label="Téma">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          className={`${s.themeOpt} ${theme === value ? s.themeOptOn : ""}`}
          onClick={() => choose(value)}
        >
          <Icon />
          {label}
        </button>
      ))}
    </div>
  );
}
