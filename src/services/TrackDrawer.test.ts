/**
 * Characterization tests for TrackDrawer at its public boundary:
 * clicks in (via the fake Cesium input handler) → callbacks out
 * (onDrawingUpdate live stats, onCreated serialized route).
 *
 * These pin CURRENT behaviour so later slices change it deliberately.
 * Assertions touch callback payloads only — never TrackDrawer internals.
 * (Edit-mode tests discover the rendered handle entities on the fake viewer
 * to drive a drag — reading what TrackDrawer put on screen, not its fields.)
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
    await waitFor(() => created.length === 1);

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

    // GPX export carries the settled elevations
    const gpx = drawer.exportGPX(route.id);
    expect(gpx).toContain('<ele>500</ele>');
    expect(gpx).toContain('<ele>800</ele>');

    // Finish clears the live stats
    expect(latestStats()).toBeNull();
  });

  it('waits for in-flight terrain sampling before emitting the finished route', async () => {
    world.setTerrainMode('manual');
    world.setTerrainHeightFn(lng => (lng < 172.005 ? 100 : 1600));

    world.clickAt(A.lng, A.lat);
    await waitForStats(s => s.pointCount === 1);
    world.clickAt(B.lng, B.lat);
    await waitForStats(s => s.pointCount === 2);

    world.doubleClick();

    // Sampling is still in flight — the route must NOT be emitted yet
    await new Promise(r => setTimeout(r, 20));
    expect(created).toHaveLength(0);

    await world.flushTerrain();
    await waitFor(() => created.length === 1);

    const route = created[0];
    expect(route.waypoints[0].elevation).toBeCloseTo(100, 6);
    expect(route.waypoints[1].elevation).toBeCloseTo(1600, 6);
    expect(route.metadata.elevationGain).toBeCloseTo(1500, 6);
    // Settled heights turn the flat ~0.84 km into a ~1.7 km slope distance
    expect(route.metadata.distance).toBeGreaterThan(1.5);
    // Difficulty derives from the settled 1500 m gain — picked (~0) heights would say 'easy'
    expect(route.metadata.difficulty).toBe('difficult');

    // Emit-once: no provisional emit is followed by a correction
    await new Promise(r => setTimeout(r, 20));
    expect(created).toHaveLength(1);
  });

  it('re-emits the edited route with settled heights even when commit races the sampling', async () => {
    world.setTerrainHeightFn(ridgeline);

    world.clickAt(A.lng, A.lat);
    await waitForStats(s => s.pointCount === 1 && s.profile[0].ele === 500);
    world.clickAt(B.lng, B.lat);
    await waitForStats(s => s.pointCount === 2 && s.profile[1].ele === 800);
    world.doubleClick();
    await waitFor(() => created.length === 1);

    expect(drawer.enterEditMode()).toBe(true);

    // Grab the real control-point handle for point 1 and drag it from B out to C
    const handle = world
      .entities()
      .find(e => e._editType === 'control' && e._editIndex === 1);
    expect(handle).toBeDefined();
    world.queueScenePick({ id: handle });
    world.fire('LEFT_DOWN');
    world.dragTo(C.lng, C.lat);

    // Sampling goes deferred BEFORE the drop — the drag-drop enrichment and the
    // commit's settlement pass are both still in flight at exit time.
    world.setTerrainMode('manual');
    world.fire('LEFT_UP');
    drawer.exitEditMode();

    await new Promise(r => setTimeout(r, 20));
    expect(created).toHaveLength(1); // commit is waiting for heights

    await world.flushTerrain();
    await waitFor(() => created.length === 2);

    const edited = created[1];
    expect(edited.id).toBe(created[0].id); // same route id — the wizard upserts on this
    const [lat1, lng1] = edited.waypoints[1].coordinates;
    expect(lat1).toBeCloseTo(C.lat, 6);
    expect(lng1).toBeCloseTo(C.lng, 6);
    expect(edited.waypoints[1].elevation).toBeCloseTo(800, 6); // C sits east of the ridge step
    expect(edited.metadata.distance).toBeGreaterThan(1.5); // A→C, twice the A→B leg
    expect(edited.metadata.elevationGain).toBeCloseTo(300, 6);
  });

  it('discards clicks still in flight when the finishing double-click lands', async () => {
    // A real double-click fires LEFT_CLICK twice before LEFT_DOUBLE_CLICK, and
    // every click awaits the trail-snap call before its point lands. Those
    // stragglers must not repopulate the cleared drawing and repaint a phantom
    // "2 pts · 0.00 km" stats panel after finish.
    world.setTerrainHeightFn(ridgeline);

    world.clickAt(A.lng, A.lat);
    await waitForStats(s => s.pointCount === 1);
    world.clickAt(B.lng, B.lat);
    await waitForStats(s => s.pointCount === 2);

    // The double-click: two clicks whose addPoint is still awaiting the snap
    // when finish runs
    world.clickAt(B.lng, B.lat);
    world.clickAt(B.lng, B.lat);
    world.doubleClick();

    await waitFor(() => created.length === 1);
    await new Promise(r => setTimeout(r, 20)); // let any straggler land

    expect(created).toHaveLength(1);
    expect(created[0].waypoints).toHaveLength(2); // just A and B
    expect(latestStats()).toBeNull(); // stats stay cleared — no phantom re-emit
  });

  it('emits with the heights it has if terrain sampling hangs past the settle timeout', async () => {
    drawer.destroy(); // swap in a drawer with a 30 ms settle timeout
    const created2: SerializableTrack[] = [];
    const stats2: Array<DrawingStats | null> = [];
    const fast = new TrackDrawer(
      world.viewer,
      t => created2.push(t),
      s => stats2.push(s),
      '',
      30,
    );
    try {
      await waitFor(() => world.hasAction('LEFT_CLICK'));
      fast.setMode(true);
      world.setTerrainMode('manual'); // sampling never resolves on its own
      world.setTerrainHeightFn(() => 700);

      world.clickAt(A.lng, A.lat);
      await waitFor(() => stats2.some(s => s?.pointCount === 1));
      world.clickAt(B.lng, B.lat);
      await waitFor(() => stats2.some(s => s?.pointCount === 2));

      world.doubleClick();
      // Emits via the timeout, not the (hung) sampling
      await waitFor(() => created2.length === 1);
      expect(created2[0].waypoints[0].elevation).toBeCloseTo(0, 3);

      // Straggling samples land later — they must not rewrite the committed track
      await world.flushTerrain();
      expect(fast.getTracks()[0].points[0].elevation).toBeCloseTo(0, 3);
    } finally {
      fast.destroy();
    }
  });

  it('abandons a pending finish when the routes are cleared before heights settle', async () => {
    world.setTerrainMode('manual');
    world.setTerrainHeightFn(() => 700);

    world.clickAt(A.lng, A.lat);
    await waitForStats(s => s.pointCount === 1);
    world.clickAt(B.lng, B.lat);
    await waitForStats(s => s.pointCount === 2);

    world.doubleClick();
    drawer.clearAll(); // user clears while the finish is still settling

    await world.flushTerrain();
    await new Promise(r => setTimeout(r, 20));

    expect(created).toHaveLength(0); // the cleared route must not resurrect
    expect(drawer.getTracks()).toHaveLength(0);
  });

  it('emits nothing if destroyed while a finish is settling', async () => {
    world.setTerrainMode('manual');

    world.clickAt(A.lng, A.lat);
    await waitForStats(s => s.pointCount === 1);
    world.clickAt(B.lng, B.lat);
    await waitForStats(s => s.pointCount === 2);

    world.doubleClick();
    drawer.destroy(); // wizard unmounts mid-settlement

    await world.flushTerrain();
    await new Promise(r => setTimeout(r, 20));

    expect(created).toHaveLength(0);
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
    await waitFor(() => created.length === 1); // finish completes promptly despite the failure
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
    await waitFor(() => created.length === 1); // finish completes promptly despite the failure
    expect(created[0].waypoints[0].elevation).toBeCloseTo(0, 3);
  });
});
