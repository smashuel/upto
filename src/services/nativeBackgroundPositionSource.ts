// NativeBackgroundPositionSource — the `native-background` half of the PositionSource seam.
// Live location Stage 2 Slice 2: the slice that turns "live while the traveller has the page
// open" into "live for the duration of the trip, screen on or off".
//
// Backed by @capacitor-community/background-geolocation. That plugin ships **types only** (no
// JS), so the runtime object comes from Capacitor's own `registerPlugin`. See ADR 019 for why
// this plugin and what the reconsider path is.
//
// Nothing about privacy lives here. The source is a fix producer: `off` is enforced by the
// consumer never creating one, `owner-only` by the consumer not POSTing. That split is what let
// Slice 1's downstream survive this swap untouched.

import { registerPlugin } from '@capacitor/core';
import { toPositionFix, type PluginLocation } from './nativePositionFix.ts';
import type { PositionSource, PositionSourceHandlers, PositionSourceOptions } from './positionSource.ts';

/** The plugin's error shape. `code` is `'NOT_AUTHORIZED'` for permission refusal on both platforms. */
export interface WatcherError extends Error {
  code?: string;
}

export type WatcherCallback = (position?: PluginLocation, error?: WatcherError) => void;

/**
 * The slice of the plugin this source uses. Declared structurally rather than imported as the
 * plugin's own interface so the source can be exercised against a fake off-device — and so
 * ADR 019's reconsider path (swapping to Transistorsoft) has one shape to satisfy.
 */
export interface BackgroundWatcherPlugin {
  addWatcher(options: Record<string, unknown>, callback: WatcherCallback): Promise<string>;
  removeWatcher(options: { id: string }): Promise<void>;
}

export interface NativeSourceDeps {
  /** Injectable clock, so the cadence throttle is testable without waiting three minutes. */
  now?: () => number;
  /** Accept OS-simulated fixes. Off by default — see `toPositionFix`. */
  allowSimulated?: boolean;
  /**
   * Metres the device must move before the OS reports again. Coarse enough to ignore the
   * 5–15 m of jitter a stationary phone produces, fine enough that walking always registers.
   */
  distanceFilter?: number;
  backgroundTitle?: string;
  backgroundMessage?: string;
}

/**
 * Shown in the iOS status bar / Android foreground-service notification while tracking. The
 * traveller must always be able to tell that their location is being collected — the PRD makes
 * this a user story, and it is the honest counterpart to asking for "always" permission.
 */
const DEFAULT_BACKGROUND_TITLE = 'Upto is sharing your trip location';
const DEFAULT_BACKGROUND_MESSAGE =
  'Your watchers can see where you are while this trip is running. Stop the trip to stop sharing.';

/**
 * Zero — report every OS update, and let the time throttle below set the pace.
 *
 * This was 10 m, and the device matrix (2026-08-03) showed why that was wrong: a **stationary**
 * traveller produced no fixes at all. Not a slow trickle — none. Their own marker froze, their
 * watchers decayed to "paused, last known N min ago" (which reads as *something is wrong*, not
 * *they stopped for lunch*), and anything waiting for "the next fix" waited forever. That is what
 * made switching sharing back on unrecoverable rather than merely slow (issue 06).
 *
 * A distance filter and a time cadence are different axes, and applying both quietly changed the
 * contract `describeLiveness` was designed against: Stage 1 produced a fix every cadence whether
 * or not the traveller moved. This restores that.
 *
 * The battery objection does not really apply. A watcher is registered for the whole trip either
 * way, so the GPS radio — the actual expense — is already on; the filter saves callback volume,
 * not power. See issue 07.
 */
const DEFAULT_DISTANCE_FILTER_M = 0;

const lazyPlugin = (): BackgroundWatcherPlugin =>
  registerPlugin<BackgroundWatcherPlugin>('BackgroundGeolocation');

export class NativeBackgroundPositionSource implements PositionSource {
  private readonly intervalMs: number;
  private readonly plugin: BackgroundWatcherPlugin;
  private readonly deps: NativeSourceDeps;
  private readonly onTeardownError?: (error: unknown) => void;

  private handlers: PositionSourceHandlers | null = null;
  private watcherId: string | null = null;
  private lastEmittedAt: number | null = null;
  /**
   * Bumped by every `start()` and every `stop()`. Each registration captures the value current
   * when it began, and anything arriving under a stale one is discarded — the late id gets
   * removed rather than stored, and late callbacks are ignored.
   *
   * This is not defensive padding. `addWatcher` is async, so a `stop()` or a re-`start()` can
   * easily beat it (a sharing toggle does exactly that: the effect tears down and re-runs).
   * Without the generation, the losing registration's id is overwritten and lost — and an id
   * nobody holds is a watcher nobody can ever remove, so the OS keeps collecting the
   * traveller's location for the life of the process, including after they chose `off`.
   */
  private generation = 0;

  constructor(
    options: PositionSourceOptions,
    plugin: BackgroundWatcherPlugin = lazyPlugin(),
    deps: NativeSourceDeps = {},
  ) {
    this.intervalMs = options.intervalMs;
    this.onTeardownError = options.onTeardownError;
    this.plugin = plugin;
    this.deps = deps;
  }

  start(handlers: PositionSourceHandlers): void {
    // A start without an intervening stop supersedes the previous watcher rather than stacking
    // on it. Tear the old one down first so it cannot outlive the handlers it was feeding.
    this.teardown();

    const generation = ++this.generation;
    this.handlers = handlers;
    this.lastEmittedAt = null;

    this.plugin
      .addWatcher(
        {
          // Load-bearing: without a backgroundMessage the plugin only guarantees FOREGROUND
          // updates, which would silently reduce this slice to what Stage 1 already did.
          backgroundMessage: this.deps.backgroundMessage ?? DEFAULT_BACKGROUND_MESSAGE,
          backgroundTitle: this.deps.backgroundTitle ?? DEFAULT_BACKGROUND_TITLE,
          // Prompt here, in the middle of starting a live trip — contextual by construction,
          // never a cold prompt on app launch.
          requestPermissions: true,
          // Never hand a cached fix to a watcher as the traveller's current position.
          stale: false,
          distanceFilter: this.deps.distanceFilter ?? DEFAULT_DISTANCE_FILTER_M,
        },
        (position, error) => this.onWatcherEvent(generation, position, error),
      )
      .then((id) => {
        // Lost the race to a stop() or a later start(): this watcher belongs to nobody, so it
        // has to be removed right here — this is the only moment its id is ever visible.
        if (generation !== this.generation) {
          this.removeById(id);
          return;
        }
        this.watcherId = id;
      })
      .catch((err: WatcherError) => {
        if (generation !== this.generation || !this.handlers) return;
        this.handlers.onUnavailable(reasonFor(err));
      });
  }

  stop(): void {
    this.teardown();
  }

  /** Invalidate the current registration, and remove its watcher if we already hold the id. */
  private teardown(): void {
    this.generation++;
    this.handlers = null;
    const id = this.watcherId;
    this.watcherId = null;
    if (id !== null) this.removeById(id);
  }

  private removeById(id: string): void {
    // The rejection must not escape — this runs inside a React effect cleanup, where a throw
    // would take the app down at exactly the moment the traveller is switching sharing off.
    // But it must not be *discarded* either: a failed removal means the OS is still collecting
    // their location after they said stop, and that is the one outcome they need to hear about.
    // Reporting is best-effort too, so a broken reporter can't resurrect the throw it replaced.
    this.plugin.removeWatcher({ id }).catch((err: unknown) => {
      try {
        this.onTeardownError?.(err);
      } catch { /* a reporter that throws must not break teardown */ }
    });
  }

  private onWatcherEvent(
    generation: number,
    position?: PluginLocation,
    error?: WatcherError,
  ): void {
    // Covers both "stopped" and "superseded by a later start": a stale watcher must never feed
    // handlers that have moved on.
    if (generation !== this.generation || !this.handlers) return;

    if (error) {
      // Never throttled: a denial the traveller doesn't see is a traveller staring at a map
      // that silently stopped updating.
      this.handlers.onUnavailable(reasonFor(error));
      return;
    }

    const fix = toPositionFix(position, {
      allowSimulated: this.deps.allowSimulated,
      now: this.deps.now,
    });
    // A rejected reading is NOT "unavailable" — the device is tracking fine, this one payload
    // was junk. Reporting unavailable here would cry wolf and dilute a signal that has to stay
    // meaningful when it does fire.
    if (!fix) return;

    const now = this.deps.now?.() ?? Date.now();
    // The plugin pushes on movement; the battery invariant is a time cadence, so throttle to
    // it. The first fix always goes straight through — a watcher opening the page should see
    // something now, not in three minutes. Slice 3 swaps the fixed interval for
    // resolveSampleCadence; this is where it plugs in.
    if (this.lastEmittedAt !== null && now - this.lastEmittedAt < this.intervalMs) return;

    this.lastEmittedAt = now;
    this.handlers.onFix(fix);
  }
}

/**
 * `denied` drives the honest "we can't see you" notice and the watcher-side `unavailable`;
 * everything else is a transient the next sample recovers from. Keeping them distinct is what
 * stops a flaky GPS read from looking like a revoked permission.
 */
function reasonFor(error: WatcherError | undefined): 'denied' | 'error' {
  return error?.code === 'NOT_AUTHORIZED' ? 'denied' : 'error';
}
