// Plain mutable singleton (not React state) so the R3F render loop can read
// scroll progress every frame without going through React's render cycle —
// same pattern as /v2's sceneState, scoped locally to /v3's hero phone.
export const phoneState = {
  progress: 0, // 0..1 across the hero's own scroll range
  pointerX: 0, // -1..1
  pointerY: 0, // -1..1
  // Set by PhoneCanvasInner once the R3F root exists; called from outside
  // the Canvas (PhoneHero lives above it) whenever scroll or pointer input
  // changes, since frameloop="demand" only re-renders on request.
  invalidate: null as (() => void) | null,
};
