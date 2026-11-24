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
