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

const DEFAULT_DISTANCE_FILTER_M = 10;

const lazyPlugin = (): BackgroundWatcherPlugin =>
  registerPlugin<BackgroundWatcherPlugin>('BackgroundGeolocation');

export class NativeBackgroundPositionSource implements PositionSource {
  private readonly intervalMs: number;
  private readonly plugin: BackgroundWatcherPlugin;
  private readonly deps: NativeSourceDeps;

  private handlers: PositionSourceHandlers | null = null;
  private stopped = true;
  private watcherId: string | null = null;
  /**
   * Set when `stop()` runs before `addWatcher` has resolved. Without it the late id would be
   * dropped and the OS would keep feeding a watcher nobody listens to — a traveller who set
   * sharing to `off` would still be having their location collected.
   */
  private removeOnArrival = false;
  private lastEmittedAt: number | null = null;

  constructor(
    options: PositionSourceOptions,
    plugin: BackgroundWatcherPlugin = lazyPlugin(),
    deps: NativeSourceDeps = {},
  ) {
    this.intervalMs = options.intervalMs;
    this.plugin = plugin;
    this.deps = deps;
  }

  start(handlers: PositionSourceHandlers): void {
    this.handlers = handlers;
    this.stopped = false;
    this.removeOnArrival = false;
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
        (position, error) => this.onWatcherEvent(position, error),
      )
      .then((id) => {
        this.watcherId = id;
        if (this.removeOnArrival) this.removeWatcher();
      })
      .catch((err: WatcherError) => {
        if (this.stopped || !this.handlers) return;
        this.handlers.onUnavailable(reasonFor(err));
      });
  }

  stop(): void {
    this.stopped = true;
    this.handlers = null;
    if (this.watcherId !== null) {
      this.removeWatcher();
    } else {
      // Registration is still in flight — remember to tear it down the moment it lands.
      this.removeOnArrival = true;
    }
  }

  private removeWatcher(): void {
    const id = this.watcherId;
    if (id === null) return;
    this.watcherId = null;
    this.removeOnArrival = false;
    // Fire-and-forget: there is nothing useful to do if removal fails, and throwing out of a
    // React effect cleanup would be worse than the leak.
    this.plugin.removeWatcher({ id }).catch(() => {});
  }

  private onWatcherEvent(position?: PluginLocation, error?: WatcherError): void {
    if (this.stopped || !this.handlers) return;

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
