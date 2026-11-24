import type { BadgeIcon as BadgeIconKey } from "@/lib/gamification/badges";

/* Ikony odznakov — jednoduché obrysové glyfy v štýle ostatných ikon appky (stroke = currentColor). */

const COMMON = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const PATHS: Record<BadgeIconKey, React.ReactNode> = {
  spark: <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3zM18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z" />,
  dumbbell: <path d="M6.5 8v8M17.5 8v8M3.5 10v4M20.5 10v4M6.5 12h11" />,
  flame: <path d="M12 3c.6 3 3.5 4.6 3.5 8a3.5 3.5 0 0 1-7 0c0-1.2.5-2 1-2.8C10 9.5 11.5 8 12 3zM9.5 17.5a2.5 2.5 0 0 0 5 0" />,
  trophy: <path d="M8 4h8v5a4 4 0 0 1-8 0V4zM8 6H5v1.5A3 3 0 0 0 8 10.5M16 6h3v1.5a3 3 0 0 1-3 3M12 13v4M8.5 20h7M10 17h4" />,
  weight: <path d="M7.5 9h9l2 10h-13l2-10zM12 9V7.5M9.5 7.5h5a1 1 0 0 0 0-2h-5a1 1 0 0 0 0 2z" />,
  leaf: <path d="M5 19c0-8 4-13 14-14 0 9-4 14-12 14M5 19c2-4 5-6.5 9-8" />,
  ruler: <path d="M4 15.5L15.5 4 20 8.5 8.5 20 4 15.5zM8 12l2 2M11 9l2 2M14 6l2 2" />,
  map: <path d="M4 6.5l5-2 6 2 5-2v13l-5 2-6-2-5 2v-13zM9 4.5v13M15 6.5v13" />,
  star: <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8L12 3.5z" />,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5zM16.5 5.5v2M15.5 6.5h2" />,
  sun: <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" />,
  calendar: <path d="M5 6.5h14v13H5v-13zM5 10.5h14M9 4v4M15 4v4M9 14.5h2M13 14.5h2" />,
  bolt: <path d="M13 3L5.5 13.5H11L10 21l8.5-11H13L13 3z" />,
  shield: <path d="M12 3.5l7 2.5v5.5c0 4.2-2.9 7.5-7 9-4.1-1.5-7-4.8-7-9V6l7-2.5zM9.5 12l2 2 3.5-4" />,
  grid: <path d="M4.5 4.5h6v6h-6v-6zM13.5 4.5h6v6h-6v-6zM4.5 13.5h6v6h-6v-6zM13.5 13.5h6v6h-6v-6z" />,
  gift: <path d="M4.5 10h15v3h-15v-3zM6 13h12v7H6v-7zM12 10v10M12 10c-2.5 0-4-1-4-2.5S9.5 5 12 10zM12 10c2.5 0 4-1 4-2.5S14.5 5 12 10z" />,
  egg: <path d="M12 3.5c3.3 0 6 5.2 6 9.3a6 6 0 0 1-12 0c0-4.1 2.7-9.3 6-9.3zM7.5 13.5l2-1.5 2 1.5 2-1.5 2 1.5" />,
};

export function BadgeIcon({ icon }: { icon: BadgeIconKey }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...COMMON}>
      {PATHS[icon]}
    </svg>
  );
}

/** Ikona pre „skrytý/zamknutý“ odznak. */
export function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...COMMON}>
      <path d="M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6v-9z" />
    </svg>
  );
}
