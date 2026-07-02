/**
 * Characterization tests for TrackDrawer at its public boundary:
 * clicks in (via the fake Cesium input handler) → callbacks out
 * (onDrawingUpdate live stats, onCreated serialized route).
 *
 * These pin CURRENT behaviour so later slices change it deliberately.
 * Assertions touch callback payloads only — never TrackDrawer internals.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TrackDrawer, { type DrawingStats, type SerializableTrack } from './TrackDrawer';
import { installFakeCesium, waitFor, type FakeCesiumWorld } from './testing/fakeCesium';

// Two spots ~840 m apart on the (fake) Southern Alps
const A = { lng: 172.0, lat: -41.0 };
const B = { lng: 172.01, lat: -41.0 };
const C = { lng: 172.02, lat: -41.0 };

/** Terrain fixture: 500 m at/west of A, 800 m east of it */
const ridgeline = (lng: number) => (lng < 172.005 ? 500 : 800);

describe('TrackDrawer', () => {
  let world: FakeCesiumWorld;
  let created: SerializableTrack[];
  let statsLog: Array<DrawingStats | null>;
  let drawer: TrackDrawer;

  const latestStats = () => statsLog[statsLog.length - 1];

  /** Wait until the live stats settle on `pointCount` points all at `elevations`. */
  const waitForStats = (predicate: (s: DrawingStats) => boolean) =>
    waitFor(() => {
      const s = latestStats();
      return s != null && predicate(s);
    });

  beforeEach(async () => {
    // TrailSnapService catches fetch failures and falls back to freehand
    // drawing — reject everything so no test ever snaps or hits the network.
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('no network in tests'))));

    world = installFakeCesium();
    created = [];
    statsLog = [];
    drawer = new TrackDrawer(
      world.viewer,
      track => created.push(track),
      stats => statsLog.push(stats),
    );
    // Managers set up on a retry loop — wait for the click handler to register.
    await waitFor(() => world.hasAction('LEFT_CLICK'));
    drawer.setMode(true);
  });

  afterEach(() => {
    drawer.destroy();
    world.uninstall();
    vi.unstubAllGlobals();
  });

  it('emits live stats with point count and distance as points are added', async () => {
    world.clickAt(A.lng, A.lat);
    await waitForStats(s => s.pointCount === 1);

    world.clickAt(B.lng, B.lat);
    await waitForStats(s => s.pointCount === 2);

    const stats = latestStats()!;
    // ~840 m horizontal at this latitude (fake sphere); loose bounds on purpose
    expect(stats.distance).toBeGreaterThan(0.7);
    expect(stats.distance).toBeLessThan(1.0);
    expect(stats.profile).toHaveLength(2);
  });

  it('backfills true terrain heights into stats after each click (auto terrain)', async () => {
    world.setTerrainHeightFn(ridgeline);

    world.clickAt(A.lng, A.lat);
    await waitForStats(s => s.pointCount === 1 && s.profile[0].ele === 500);

    world.clickAt(B.lng, B.lat);
    await waitForStats(s => s.pointCount === 2 && s.profile[1].ele === 800);

    const stats = latestStats()!;
    expect(stats.elevationGain).toBeCloseTo(300, 6);
    expect(stats.elevationLoss).toBeCloseTo(0, 6);
  });

  it('double-click finish emits exactly one serialized route with the drawn points', async () => {
    world.setTerrainHeightFn(ridgeline);

    world.clickAt(A.lng, A.lat);
    await waitForStats(s => s.pointCount === 1 && s.profile[0].ele === 500);
    world.clickAt(B.lng, B.lat);
    await waitForStats(s => s.pointCount === 2 && s.profile[1].ele === 800);

    world.doubleClick();

    expect(created).toHaveLength(1);
    const route = created[0];
    expect(route.waypoints).toHaveLength(2);
    const [lat0, lng0] = route.waypoints[0].coordinates;
    const [lat1, lng1] = route.waypoints[1].coordinates;
    expect(lat0).toBeCloseTo(A.lat, 6);
    expect(lng0).toBeCloseTo(A.lng, 6);
    expect(lat1).toBeCloseTo(B.lat, 6);
    expect(lng1).toBeCloseTo(B.lng, 6);
    expect(route.waypoints[0].elevation).toBeCloseTo(500, 6);
    expect(route.waypoints[1].elevation).toBeCloseTo(800, 6);
    expect(route.metadata.distance).toBeGreaterThan(0.7);
    expect(route.metadata.elevationGain).toBeCloseTo(300, 6);

    // Finish clears the live stats
    expect(latestStats()).toBeNull();
  });

  it('undo removes the last point from stats and enables redo; redo restores it', async () => {
    world.clickAt(A.lng, A.lat);
    await waitForStats(s => s.pointCount === 1);
    world.clickAt(B.lng, B.lat);
    await waitForStats(s => s.pointCount === 2);
    world.clickAt(C.lng, C.lat);
    await waitForStats(s => s.pointCount === 3);

    drawer.undoLastPoint();
    let stats = latestStats()!;
    expect(stats.pointCount).toBe(2);
    expect(stats.canRedo).toBe(true);

    drawer.redoLastPoint();
    stats = latestStats()!;
    expect(stats.pointCount).toBe(3);
    expect(stats.canRedo).toBe(false);
  });

  it('corrects elevations only once deferred terrain sampling resolves (manual terrain)', async () => {
    world.setTerrainMode('manual');
    world.setTerrainHeightFn(() => 700);

    world.clickAt(A.lng, A.lat);
    await waitForStats(s => s.pointCount === 1);

    // Sampling is still in flight — the point carries the picked (≈0) height.
    expect(latestStats()!.profile[0].ele).toBeCloseTo(0, 3);

    await world.flushTerrain();
    await waitForStats(s => s.profile[0].ele === 700);
    expect(latestStats()!.elevationGain).toBe(0); // single point — no gain yet
  });

  it('keeps working with picked heights when terrain sampling itself rejects', async () => {
    world.setTerrainMode('sample-reject'); // provider loads, every sample call fails
    world.setTerrainHeightFn(() => 700); // must never be applied

    world.clickAt(A.lng, A.lat);
    await waitForStats(s => s.pointCount === 1);
    world.clickAt(B.lng, B.lat);
    await waitForStats(s => s.pointCount === 2);

    const stats = latestStats()!;
    expect(stats.profile[0].ele).toBeCloseTo(0, 3);
    expect(stats.profile[1].ele).toBeCloseTo(0, 3);

    world.doubleClick();
    expect(created).toHaveLength(1);
  });

  it('keeps working with picked heights when terrain is unavailable', async () => {
    world.setTerrainMode('unavailable');
    world.setTerrainHeightFn(() => 700); // must never be applied

    world.clickAt(A.lng, A.lat);
    await waitForStats(s => s.pointCount === 1);
    world.clickAt(B.lng, B.lat);
    await waitForStats(s => s.pointCount === 2);

    // CURRENT behaviour (slice 05 will make this honest): heights silently
    // stay at the picked ≈0 rather than being marked unknown.
    const stats = latestStats()!;
    expect(stats.profile[0].ele).toBeCloseTo(0, 3);
    expect(stats.profile[1].ele).toBeCloseTo(0, 3);
    expect(stats.elevationGain).toBeCloseTo(0, 3);

    world.doubleClick();
    expect(created).toHaveLength(1);
    expect(created[0].waypoints[0].elevation).toBeCloseTo(0, 3);
  });
});
