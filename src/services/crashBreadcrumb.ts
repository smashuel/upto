// Records that a risky operation was in flight, so that if the app disappears mid-way the
// *next* boot can say what happened.
//
// Why this exists: adding a map note was reported as "crashing the TripLink", but neither the
// React error boundary nor the Cesium `scene.renderError` listener ever fired, and the user
// landed back on a blank New TripLink page. Nothing in JS observed a failure — which rules out
// an exception and leaves two very different causes:
//
//   * the document went away while JS was still running (navigation, reload, form submit), or
//   * the JS runtime was destroyed outright (on iOS: the WKWebView content process being
//     killed, after which Capacitor reloads the current URL — which looks identical).
//
// A `pagehide` listener separates them: it fires for the first and cannot fire for the second.
// localStorage is the only channel that survives both, and a TestFlight build has no readable
// console, so the verdict has to be shown in the UI on the next launch.

const KEY = 'upto:breadcrumb';

/** The slice of `Storage` used here — narrowed so tests don't need a DOM. */
export interface BreadcrumbStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface StageContext {
  /** ISO timestamp the stage started. */
  at: string;
  /** Route the user was on, so the report says where it happened. */
  url: string;
}

export interface CrashReport extends StageContext {
  /** Identifier of the operation that was in flight, e.g. `note:place`. */
  stage: string;
  /**
   * True when the document unloaded with JS still alive (navigation/reload/submit).
   * False when the runtime vanished without notice (content-process kill).
   */
  cleanUnload: boolean;
}

/** Instrumentation must never become the failure it is trying to observe. */
function safely<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function read(store: BreadcrumbStore): CrashReport | null {
  const raw = safely(() => store.getItem(KEY), null);
  if (!raw) return null;
  return safely(() => JSON.parse(raw) as CrashReport, null);
}

function write(store: BreadcrumbStore, report: CrashReport): void {
  safely(() => store.setItem(KEY, JSON.stringify(report)), undefined);
}

/** Mark an operation as started. A later `beginStage` supersedes an abandoned earlier one. */
export function beginStage(store: BreadcrumbStore, stage: string, context: StageContext): void {
  write(store, { stage, cleanUnload: false, ...context });
}

/** Mark the in-flight operation as finished. Nothing is reported for a stage that ends. */
export function endStage(store: BreadcrumbStore): void {
  safely(() => store.removeItem(KEY), undefined);
}

/**
 * Record that the document is unloading. Only meaningful while a stage is in flight —
 * ordinary navigation away from the app must not look like a failure.
 */
export function markUnload(store: BreadcrumbStore): void {
  const current = read(store);
  if (!current) return;
  write(store, { ...current, cleanUnload: true });
}

/**
 * Return the report for an operation that never finished, clearing it so it is shown once.
 * Null when the last session ended tidily.
 */
export function takeReport(store: BreadcrumbStore): CrashReport | null {
  const current = read(store);
  // Clear unconditionally: a corrupt value must not be re-read on every future boot.
  safely(() => store.removeItem(KEY), undefined);
  if (!current || typeof current.stage !== 'string') return null;
  return current;
}

/** Human-readable verdict for the on-device banner. */
export function describeReport(report: CrashReport): string {
  const cause = report.cleanUnload
    ? 'the page navigated or reloaded'
    : 'the app was terminated by the system (most likely out of memory)';
  return `Last session ended during "${report.stage}" on ${report.url} — ${cause}.`;
}
