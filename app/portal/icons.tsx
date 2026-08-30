/* Ikonový set klientskeho portálu — jednotný stroke 1.7, viewBox 24, v jazyku brand kitu.
   Zdieľané spodnou navigáciou aj coming-soon obrazovkami. */

type IconProps = { className?: string };

export const TodayIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="3.4" stroke="currentColor" strokeWidth="1.7" />
    <path
      d="M12 3.6v2.2M12 18.2v2.2M20.4 12h-2.2M5.8 12H3.6M17.9 6.1l-1.6 1.6M7.7 16.3l-1.6 1.6M17.9 17.9l-1.6-1.6M7.7 7.7 6.1 6.1"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
    />
  </svg>
);

export const TrainingIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M6.5 12h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <rect x="4.3" y="8.2" width="2.2" height="7.6" rx="0.7" fill="currentColor" />
    <rect x="17.5" y="8.2" width="2.2" height="7.6" rx="0.7" fill="currentColor" />
    <rect x="1.8" y="9.6" width="1.6" height="4.8" rx="0.7" fill="currentColor" />
    <rect x="20.6" y="9.6" width="1.6" height="4.8" rx="0.7" fill="currentColor" />
  </svg>
);

export const FoodIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M4.5 11h15c0 4.3-3.4 7.5-7.5 7.5S4.5 15.3 4.5 11Z"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
    />
    <path d="M8 8.2c0-1.4.7-2.6 1.6-3.4M12 7.6c0-1.7.8-3 1.9-3.8M15.8 8.4c0-1.1.5-2 1.2-2.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const DiaryIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="5" y="3.5" width="14" height="17" rx="2.2" stroke="currentColor" strokeWidth="1.7" />
    <path d="M8.5 3.5v17" stroke="currentColor" strokeWidth="1.3" />
    <path d="M11 8.5h5.5M11 12h5.5M11 15.5h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const ChatIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M4.5 6.5A2.5 2.5 0 0 1 7 4h10a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 17 16H9l-4 3.2V16H7a2.5 2.5 0 0 1-2.5-2.5v-7Z"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
    />
    <path d="M8.5 9.2h7M8.5 12h4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const StopwatchIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="13.5" r="7.5" stroke="currentColor" strokeWidth="1.7" />
    <path d="M12 13.5V9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M9.5 2.8h5M12 2.8V6M18.4 7.6l1.5-1.5M17.2 6.4l1.2 1.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ProfileIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="8.4" r="3.6" stroke="currentColor" strokeWidth="1.7" />
    <path d="M5 19.5c.6-3.8 3.3-6 7-6s6.4 2.2 7 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);
