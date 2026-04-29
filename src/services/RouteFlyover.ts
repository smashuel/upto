/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * RouteFlyover — animates a chase-cam flight along a finished route.
 *
 * Uses Cesium's clock + SampledPositionProperty so the camera interpolates
 * smoothly along the path with Hermite spline smoothing. A velocity-driven
 * orientation property keeps the heading aligned with the direction of travel.
 */

type LngLatH = [number, number, number];

export interface FlyoverOptions {
  /** Seconds — total time to traverse the route. Clamped to [6, 60]. */
  duration?: number;
  /** Metres above terrain to hold the camera. */
  altitude?: number;
  /** Fired when the flyover finishes or is stopped. */
  onStop?: () => void;
}

export default class RouteFlyover {
  private viewer: any;
  private trackEntity: any = null;
  private cleanup: (() => void) | null = null;
  private running = false;

  constructor(viewer: any) {
    this.viewer = viewer;
  }

  isRunning(): boolean {
    return this.running;
  }

  start(positions: LngLatH[], opts: FlyoverOptions = {}): boolean {
    if (this.running) return false;
    if (positions.length < 2) return false;

    const Cesium = window.Cesium;
    const duration = Math.max(6, Math.min(60, opts.duration ?? Math.max(10, positions.length * 1.2)));
    const altitude = opts.altitude ?? 250;

    const start = Cesium.JulianDate.now();
    const stop = Cesium.JulianDate.addSeconds(start, duration, new Cesium.JulianDate());
    const property = new Cesium.SampledPositionProperty();

    for (let i = 0; i < positions.length; i++) {
      const frac = i / (positions.length - 1);
      const t = Cesium.JulianDate.addSeconds(start, frac * duration, new Cesium.JulianDate());
      const [lng, lat, h] = positions[i];
      property.addSample(t, Cesium.Cartesian3.fromDegrees(lng, lat, h + altitude));
    }
    property.setInterpolationOptions({
      interpolationDegree: 2,
      interpolationAlgorithm: Cesium.HermitePolynomialApproximation,
    });

    const clock = this.viewer.clock;
    const snapshot = {
      startTime: clock.startTime.clone(),
      stopTime: clock.stopTime.clone(),
      currentTime: clock.currentTime.clone(),
      multiplier: clock.multiplier,
      shouldAnimate: clock.shouldAnimate,
      clockRange: clock.clockRange,
    };

    clock.startTime = start.clone();
    clock.stopTime = stop.clone();
    clock.currentTime = start.clone();
    clock.multiplier = 1;
    clock.shouldAnimate = true;
    clock.clockRange = Cesium.ClockRange.CLAMPED;

    const entity = this.viewer.entities.add({
      position: property,
      orientation: new Cesium.VelocityOrientationProperty(property),
      point: { pixelSize: 0 },
    });
    this.trackEntity = entity;

    // Chase-cam offset: slightly behind and above, looking slightly down
    this.viewer.trackedEntity = entity;

    const tickListener = () => {
      if (Cesium.JulianDate.greaterThanOrEquals(clock.currentTime, stop)) {
        this.stop();
      }
    };
    clock.onTick.addEventListener(tickListener);

    this.cleanup = () => {
      try { clock.onTick.removeEventListener(tickListener); } catch { /* viewer destroyed */ }
      try { this.viewer.trackedEntity = undefined; } catch { /* noop */ }
      if (this.trackEntity) {
        try { this.viewer.entities.remove(this.trackEntity); } catch { /* noop */ }
        this.trackEntity = null;
      }
      clock.startTime = snapshot.startTime;
      clock.stopTime = snapshot.stopTime;
      clock.currentTime = snapshot.currentTime;
      clock.multiplier = snapshot.multiplier;
      clock.shouldAnimate = snapshot.shouldAnimate;
      clock.clockRange = snapshot.clockRange;
      this.running = false;
      opts.onStop?.();
    };

    this.running = true;
    return true;
  }

  stop() {
    if (!this.running) return;
    const fn = this.cleanup;
    this.cleanup = null;
    fn?.();
  }

  destroy() {
    this.stop();
  }
}
