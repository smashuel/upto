// How the trip-planning map should present itself inside the wizard.
//
// On a phone the map was an embedded box a few hundred pixels tall: too cramped to pan,
// zoom or draw a route in, and every stray gesture spilled into the wizard behind it. On a
// phone the map should simply be the screen while you're working on the route, with an
// explicit way back. On desktop the embedded map is right — it sits alongside the other
// fields and taking over the window would be more disruptive than helpful.
//
// Pure so the rule is testable without a DOM; the caller supplies the measurements.

export type MapPresentation = 'embedded' | 'immersive';

export interface ViewportSignals {
  viewportWidth: number;
  /** matchMedia('(pointer: coarse)') — a finger rather than a mouse. */
  coarsePointer: boolean;
  /** Optional; only needed to catch a phone held in landscape. */
  viewportHeight?: number;
}

/** Below this, a touch device does not have room for a usable embedded map. */
const TABLET_MIN_WIDTH = 768;

/** A landscape phone is wide but short; height is what gives it away. */
const LANDSCAPE_PHONE_MAX_HEIGHT = 500;

export function resolveMapPresentation(signals: ViewportSignals | null): MapPresentation {
  // No measurements (SSR, or matchMedia unavailable): never seize the screen on a guess.
  if (!signals) return 'embedded';

  // A fine pointer means a real window with chrome around it — keep the map in the page
  // however narrow the window happens to be.
  if (!signals.coarsePointer) return 'embedded';

  if (signals.viewportWidth < TABLET_MIN_WIDTH) return 'immersive';

  // Wide but short with a touch pointer: a phone on its side.
  if (
    typeof signals.viewportHeight === 'number' &&
    signals.viewportHeight <= LANDSCAPE_PHONE_MAX_HEIGHT
  ) {
    return 'immersive';
  }

  return 'embedded';
}

/** Read the current environment. Returns null where the DOM isn't available. */
export function readViewportSignals(): ViewportSignals | null {
  if (typeof window === 'undefined') return null;
  return {
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    coarsePointer:
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(pointer: coarse)').matches
        : false,
  };
}
