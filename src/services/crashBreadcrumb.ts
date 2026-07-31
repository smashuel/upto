// Records what the app was doing, continuously, so that if it disappears the *next* boot can
// say what happened.
//
// Why this exists: adding a map note was reported as "crashing the TripLink", but neither the
// React error boundary nor Cesium's `scene.renderError` listener ever fired, and the user
// landed back on a blank New TripLink page with every field cleared. Nothing in JS observed a
// failure — which rules out an exception and leaves two causes that need opposite fixes:
//
//   * the document went away while JS was still running (navigation, reload, form submit), or
//   * the JS runtime was destroyed outright (on iOS: the WKWebView content process being
//     killed under memory pressure, after which Capacitor reloads the current URL).
//
// Capacitor's reload makes those two look identical from the outside. Two signals separate
// them:
//
//   * `pagehide` fires when the document unloads with JS alive, and *cannot* fire when the
//     process is killed. Its absence proves the runtime died.
//   * the gap between the last recorded activity and the next boot. A user closing the app
//     and coming back later leaves a long gap; a reload comes back immediately.
//
// An earlier version armed this only around the note-submit call, which missed a failure that
// happened on the map tap before it or a few seconds after it. Hence: record always, and let
// the *report* decide what was abnormal.
//
// localStorage is the only channel that survives both causes, and a TestFlight build has no
// readable console, so the verdict has to be shown in the UI on the next launch.

const KEY = 'upto:session';

/** Below this gap between last activity and next boot, the app came straight back: a reload. */
export const RELOAD_WINDOW_MS = 15_000;

/** The slice of `Storage` used here — narrowed so tests don't need a DOM. */
export interface BreadcrumbStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface SessionRecord {
  /** Last thing the app was seen doing, e.g. `note:modal-open`. */
  activity: string;
  /** Epoch ms of that activity. */
  at: number;
  /** Route it happened on. */
  url: string;
  /** Set by `pagehide`. False means no JS ran as the document went away. */
  cleanExit: boolean;
}

export type Verdict = 'terminated' | 'reloaded';

export interface CrashReport {
  activity: string;
  url: string;
  verdict: Verdict;
  /** Milliseconds between the last recorded activity and this boot. */
  gapMs: number;
}

/** Instrumentation must never become the failure it is trying to observe. */
function safely<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function read(store: BreadcrumbStore): SessionRecord | null {
  const raw = safely(() => store.getItem(KEY), null);
  if (!raw) return null;
  const parsed = safely(() => JSON.parse(raw) as SessionRecord, null);
  if (!parsed || typeof parsed.activity !== 'string' || typeof parsed.at !== 'number') {
    return null;
  }
  return parsed;
}

function write(store: BreadcrumbStore, record: SessionRecord): void {
  safely(() => store.setItem(KEY, JSON.stringify(record)), undefined);
}

/**
 * Note what the app is doing now. Called liberally — the cost is one small localStorage
 * write, and the value is that whatever the last write says is where the app died.
 */
export function recordActivity(
  store: BreadcrumbStore,
  activity: string,
  context: { at: number; url: string },
): void {
  write(store, { activity, at: context.at, url: context.url, cleanExit: false });
}

/** Record that the document is unloading with JS still alive. */
export function markCleanExit(store: BreadcrumbStore): void {
  const current = read(store);
  if (!current) return;
  write(store, { ...current, cleanExit: true });
}

/**
 * Describe the end of the previous session, clearing it so it is reported once.
 *
 * Null when the previous session ended the way a session normally does: the user left, and
 * came back later. Only an abnormal ending produces a report.
 */
export function takeReport(store: BreadcrumbStore, now: number): CrashReport | null {
  const current = read(store);
  // Clear unconditionally, so a corrupt or stale value is never re-read on every future boot.
  safely(() => store.removeItem(KEY), undefined);
  if (!current) return null;

  const gapMs = now - current.at;

  // No pagehide: the runtime was destroyed without warning. This is the strong signal, and
  // it holds regardless of how long ago it happened.
  if (!current.cleanExit) {
    return { activity: current.activity, url: current.url, verdict: 'terminated', gapMs };
  }

  // pagehide fired and the app was back almost immediately — the document was replaced,
  // not closed. A user genuinely leaving and returning does not come back this fast.
  if (gapMs >= 0 && gapMs < RELOAD_WINDOW_MS) {
    return { activity: current.activity, url: current.url, verdict: 'reloaded', gapMs };
  }

  return null;
}

/** Human-readable verdict for the on-device banner. */
export function describeReport(report: CrashReport): string {
  const cause =
    report.verdict === 'terminated'
      ? 'the app was terminated by the system (most likely out of memory)'
      : 'the page reloaded or navigated';
  return `Previous session ended at "${report.activity}" on ${report.url} — ${cause}. (${Math.round(report.gapMs / 1000)}s ago)`;
}
