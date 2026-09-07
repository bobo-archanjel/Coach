// Zdieľaný mutovateľný stav medzi DOM svetom (GSAP ScrollTrigger, Lenis,
// preloader) a R3F Canvas svetom (useFrame). Zámerne obyčajný objekt, nie React
// state — 3D scéna ho číta 60× za sekundu a re-rendery by ju len brzdili.
export const sceneState = {
  /** 0..1 cez celú stránku */
  progress: 0,
  /** index aktívnej sekcie (0 hero … 5 final) */
  section: 0,
  /** 0..1 vnútri aktívnej sekcie (pinned scény) */
  sectionProgress: 0,
  /** -1..1, normalizované z okna */
  mouse: { x: 0, y: 0 },
  /** preloader dobehol, hero môže štartovať */
  ready: false,
  isMobile: false,
  reducedMotion: false,
};

export const SECTIONS = ["hero", "features", "how", "ai", "pricing", "final"] as const;
export type SectionId = (typeof SECTIONS)[number];
