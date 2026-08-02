// PositionSource — the seam between *how a device produces position fixes* and everything
// downstream (api.reportPosition → SSE `position` → applyLifecycleEvent → live marker →
// describeLiveness). Live location Stage 2 Slice 1 extracts the foreground web sampling loop
// (previously inline in ActiveTrip) behind this interface so Slice 2 can swap in a native
// background source with zero downstream change. The source is a *fix producer only* — it
// knows nothing about privacy, POSTing, or the map; that policy stays in the consumer.
//
// See .scratch/live-location-stage-2/ (PRD + issues 01/02). `selectPositionSource` is the pure,
// tested branch; the web source's timer/geolocation mechanics are below the seam.

import { NativeBackgroundPositionSource } from './nativeBackgroundPositionSource.ts';

export type Platform = 'ios' | 'android' | 'web';
export type PositionSourceKind = 'native-background' | 'web-foreground';

export interface PositionFix {
  lat: number;
  lng: number;
  /** Metres, from the geolocation provider. */
  accuracy: number;
  /** ISO timestamp captured when the fix arrived on this device. */
  timestamp: string;
}

export type UnavailableReason = 'denied' | 'error';

export interface PositionSourceHandlers {
  onFix: (fix: PositionFix) => void;
  onUnavailable: (reason: UnavailableReason) => void;
}

/** Produces position fixes on a cadence. Start is idempotent-safe to pair with a single stop. */
export interface PositionSource {
  start(handlers: PositionSourceHandlers): void;
  stop(): void;
}

export interface PositionSourceOptions {
  /** Sampling interval in ms. In Slice 1 this is the fixed Stage-1 cadence; Slice 3 replaces
   *  the caller's constant with resolveSampleCadence. */
  intervalMs: number;
  /** Passed through to the web geolocation provider; sensible battery-friendly defaults. */
  geolocationOptions?: PositionOptions;
  /**
   * Called when tearing the source down fails — currently only the native source, where it means
   * the OS watcher may still be running **after the traveller chose to stop sharing**.
   *
   * This is a privacy signal, not telemetry: the person needs to know their choice didn't take
   * effect. The rejection itself is still swallowed (this runs inside a React effect cleanup,
   * where an escaping throw would be worse than the leak) — only the fact of it is reported.
   */
  onTeardownError?: (error: unknown) => void;
}

/**
 * Pure: choose which position source a platform uses. Native platforms get the background
 * source (Slice 2); the web gets the foreground source. Kept free of any Capacitor/navigator
 * reference so it stays unit-testable — the caller resolves the platform (see detectPlatform).
 */
export function selectPositionSource(platform: Platform): PositionSourceKind {
  return platform === 'web' ? 'web-foreground' : 'native-background';
}

/**
 * Detect the runtime platform. Capacitor injects a `Capacitor` global in the native shell
 * (Slice 2); until then, and on the web, this is 'web'. Keeping the detection here (not an
 * `import '@capacitor/core'`) means the web build carries no native dependency in Slice 1.
 */
export function detectPlatform(): Platform {
  const cap = (globalThis as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  const p = cap?.getPlatform?.();
  return p === 'ios' || p === 'android' ? p : 'web';
}

/**
 * Instantiate the source for a resolved kind. Returns null when the web environment can't
 * supply geolocation at all (SSR / unsupported browser) so the caller simply skips sampling.
 *
 * Both kinds are real as of Slice 2. The native branch keeps producing fixes with the app
 * backgrounded or the screen locked; the web branch is the Stage-1 foreground loop, unchanged.
 */
export function createPositionSource(
  kind: PositionSourceKind,
  options: PositionSourceOptions,
): PositionSource | null {
  if (kind === 'web-foreground') {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return null;
    return new WebForegroundPositionSource(options);
  }
  return new NativeBackgroundPositionSource(options);
}

/**
 * Foreground web source: the Stage-1 behaviour, now behind the seam. A timed
 * `getCurrentPosition` (NOT a continuous watchPosition — coarse at the device for battery),
 * an immediate first sample so watchers see something without waiting a full cycle, and a
 * hard stop that prevents any late geolocation callback from emitting after teardown
 * (replacing the old inline `cancelled` flag).
 */
export class WebForegroundPositionSource implements PositionSource {
  private readonly intervalMs: number;
  private readonly geolocationOptions: PositionOptions;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private handlers: PositionSourceHandlers | null = null;

  constructor(options: PositionSourceOptions) {
    this.intervalMs = options.intervalMs;
    this.geolocationOptions = options.geolocationOptions ?? {
      enableHighAccuracy: false,
      maximumAge: 60_000,
      timeout: 30_000,
    };
  }

  start(handlers: PositionSourceHandlers): void {
    this.handlers = handlers;
    this.stopped = false;
    this.sample();
    this.timerId = setInterval(() => this.sample(), this.intervalMs);
  }

  stop(): void {
    this.stopped = true;
    this.handlers = null;
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private sample(): void {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (this.stopped || !this.handlers) return;
        this.handlers.onFix({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: new Date().toISOString(),
        });
      },
      (err) => {
        if (this.stopped || !this.handlers) return;
        this.handlers.onUnavailable(
          err.code === err.PERMISSION_DENIED ? 'denied' : 'error',
        );
      },
      this.geolocationOptions,
    );
  }
}
