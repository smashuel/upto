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
import {
  hasPendingRouteSettles,
  resetRouteSettlement,
  routesSettled,
} from './RouteSettlement';
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
  let terrainAvailability: boolean[];
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

    resetRouteSettlement();
    world = installFakeCesium();
    created = [];
    statsLog = [];
    terrainAvailability = [];
    drawer = new TrackDrawer(
      world.viewer,
      track => created.push(track),
      stats => statsLog.push(stats),
      '',
      8000,
      available => terrainAvailability.push(available),
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

    // Finish keeps the stats panel as a settled reference (not cleared)
    const settled = latestStats()!;
    expect(settled.phase).toBe('finished');
    expect(settled.pointCount).toBe(2);
    expect(settled.elevationGain).toBeCloseTo(300, 6);
    expect(settled.profile.map(p => p.ele)).toEqual([500, 800]);

    // Chart hover still resolves positions against the committed route
    expect(drawer.getDrawingPointCount()).toBe(2);
    expect(drawer.getDrawingPointPosition(1)).toBeTruthy();
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
    // The panel shows the settled route — not a phantom straggler re-emit
    const settled = latestStats()!;
    expect(settled.phase).toBe('finished');
    expect(settled.pointCount).toBe(2);
    expect(settled.distance).toBeGreaterThan(0.7);
  });

  it('restores the reference stats panel when persisted routes are loaded (remount)', () => {
    drawer.setMode(false); // a remount loads routes before any drawing starts
    drawer.loadRoutes([
      {
        id: 'stored_route',
        waypoints: [
          { coordinates: [A.lat, A.lng], elevation: 500 },
          { coordinates: [B.lat, B.lng], elevation: 800 },
        ],
      },
    ]);

    const restored = latestStats()!;
    expect(restored.phase).toBe('finished');
    expect(restored.pointCount).toBe(2);
    expect(restored.profile.map(p => p.ele)).toEqual([500, 800]);
    expect(restored.elevationGain).toBeCloseTo(300, 6);
  });

  it('loading a route stored without elevations renders normally and stays honestly unknown', () => {
    drawer.setMode(false);
    drawer.loadRoutes([
      {
        id: 'stored_no_elevation',
        // No `elevation` field at all — a route saved during a terrain outage.
        // Re-opening (even with terrain now available) must NOT re-sample —
        // just preserve the "unknown" distinction from "sea level".
        waypoints: [{ coordinates: [A.lat, A.lng] }, { coordinates: [B.lat, B.lng] }],
      },
    ]);

    // Geometry renders fine regardless — a route line doesn't need elevation.
    expect(world.entities().length).toBeGreaterThan(0);

    const restored = latestStats()!;
    expect(restored.phase).toBe('finished');
    expect(restored.pointCount).toBe(2);
    expect(restored.elevationKnown).toBe(false);
    expect(restored.elevationGain).toBeUndefined();
    expect(restored.elevationLoss).toBeUndefined();

    const gpx = drawer.exportGPX('stored_no_elevation');
    expect(gpx).not.toContain('<ele>');
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
      // Serialized honestly: the sample hadn't landed when we committed, so
      // this point's elevation was never confirmed — absent, not the ~0 pick.
      expect(created2[0].waypoints[0].elevation).toBeUndefined();

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

  it('keeps working with picked heights when terrain sampling itself rejects, but never confirms them', async () => {
    world.setTerrainMode('sample-reject'); // provider loads, every sample call fails
    world.setTerrainHeightFn(() => 700); // must never be applied

    world.clickAt(A.lng, A.lat);
    await waitForStats(s => s.pointCount === 1);
    world.clickAt(B.lng, B.lat);
    await waitForStats(s => s.pointCount === 2);

    const stats = latestStats()!;
    expect(stats.profile[0].ele).toBeCloseTo(0, 3);
    expect(stats.profile[1].ele).toBeCloseTo(0, 3);
    // The provider itself loaded fine — a per-call sampling hiccup is not the
    // same as "no terrain source at all", so no on-map notice fires for it.
    expect(terrainAvailability).toEqual([true]);

    world.doubleClick();
    await waitFor(() => created.length === 1); // finish completes promptly despite the failure

    // No sample ever landed for these points — the committed route must be
    // honest that it never confirmed a height, not silently keep the ~0 pick.
    const route = created[0];
    expect(route.waypoints[0].elevation).toBeUndefined();
    expect(route.waypoints[1].elevation).toBeUndefined();
    expect(route.metadata.elevationGain).toBeUndefined();
    expect(route.metadata.elevationLoss).toBeUndefined();
    expect(route.metadata.difficulty).toBeUndefined();
  });

  it('finish with terrain unavailable stores the route with elevations absent, not zero', async () => {
    world.setTerrainMode('unavailable');
    world.setTerrainHeightFn(() => 700); // must never be applied

    world.clickAt(A.lng, A.lat);
    await waitForStats(s => s.pointCount === 1);
    world.clickAt(B.lng, B.lat);
    await waitForStats(s => s.pointCount === 2);

    // Honest degradation: the live panel already knows it never confirmed a
    // height — gain/loss/estimate are absent, not a flat-0 measurement.
    const stats = latestStats()!;
    expect(stats.elevationKnown).toBe(false);
    expect(stats.elevationGain).toBeUndefined();
    expect(stats.elevationLoss).toBeUndefined();
    expect(stats.estimatedTime).toBeUndefined();
    expect(terrainAvailability).toEqual([false]);

    world.doubleClick();
    await waitFor(() => created.length === 1); // finish completes promptly despite the failure

    const route = created[0];
    expect(route.waypoints[0].elevation).toBeUndefined();
    expect(route.waypoints[1].elevation).toBeUndefined();
    expect(route.metadata.elevationGain).toBeUndefined();
    expect(route.metadata.elevationLoss).toBeUndefined();
    expect(route.metadata.difficulty).toBeUndefined();
    // Distance is unaffected — only elevation-derived figures degrade.
    expect(route.metadata.distance).toBeGreaterThan(0.7);

    const settled = latestStats()!;
    expect(settled.phase).toBe('finished');
    expect(settled.elevationKnown).toBe(false);
    expect(settled.elevationGain).toBeUndefined();

    // GPX omits elevation tags entirely rather than writing fake zeros
    const gpx = drawer.exportGPX(route.id);
    expect(gpx).not.toContain('<ele>');
    expect(gpx).toContain('<trkpt');
    expect(gpx).toContain('<time>');
  });

  it('does not fire the terrain-availability notice if destroyed before the provider resolves', async () => {
    world.setProviderManual(true); // the terrain-provider construction itself will hang

    world.clickAt(A.lng, A.lat); // kicks off addPoint -> enrichElevation -> getSamplingTerrain
    await new Promise(r => setTimeout(r, 20)); // let it reach the (now-parked) provider construction

    drawer.destroy(); // wizard unmounts while the provider is still loading
    world.setTerrainMode('unavailable');
    await world.flushProvider(); // the provider resolves (as unavailable) AFTER destroy
    await new Promise(r => setTimeout(r, 20));

    expect(terrainAvailability).toEqual([]); // no notice fired into a torn-down manager
  });

  it('fires the terrain-availability notice exactly once, and never when sampling works', async () => {
    world.setTerrainHeightFn(ridgeline);
    world.clickAt(A.lng, A.lat);
    await waitForStats(s => s.pointCount === 1);
    world.clickAt(B.lng, B.lat);
    await waitForStats(s => s.pointCount === 2);

    expect(terrainAvailability).toEqual([true]);

    world.doubleClick();
    await waitFor(() => created.length === 1);
    // Still just the one, one-shot call — success never repeats/flips it.
    expect(terrainAvailability).toEqual([true]);
  });

  // ── Settle-window hardening (issue 06) ────────────────────────────────────
  // The window between double-click finish (or edit Done) and the settled emit
  // is a real state: these tests pin that every teardown path strands every
  // in-flight await, and that the emitted phase represents the window honestly.

  /** Draw A→B in auto terrain and commit it; resolves once the route is settled. */
  const commitRoute = async () => {
    const before = created.length;
    world.clickAt(A.lng, A.lat);
    await waitForStats(s => s.pointCount === 1);
    world.clickAt(B.lng, B.lat);
    await waitForStats(s => s.pointCount === 2);
    world.doubleClick();
    await waitFor(() => created.length === before + 1);
  };

  it('emits settling stats immediately on finish, then finished once heights land', async () => {
    world.setTerrainMode('manual');
    world.setTerrainHeightFn(() => 700);

    world.clickAt(A.lng, A.lat);
    await waitForStats(s => s.pointCount === 1);
    world.clickAt(B.lng, B.lat);
    await waitForStats(s => s.pointCount === 2);

    world.doubleClick();
    // The window is represented, not hidden: the UI can disable Undo/Edit on this
    const settling = latestStats()!;
    expect(settling.phase).toBe('settling');
    expect(settling.pointCount).toBe(2);

    await new Promise(r => setTimeout(r, 20)); // let the settle pass queue its sample
    await world.flushTerrain();
    await waitFor(() => latestStats()?.phase === 'finished');
  });

  it('drops the editing phase immediately on Done, not only when heights land', async () => {
    await commitRoute();
    expect(drawer.enterEditMode()).toBe(true);
    await waitForStats(s => s.phase === 'editing');

    world.setTerrainMode('manual'); // the edit-commit settlement will hang until flushed
    drawer.exitEditMode();

    // Edit UI must be able to leave within one emission of Done — not stick
    // at editing until settleEdit lands (or forever, if it never does)
    expect(latestStats()!.phase).toBe('settling');

    await new Promise(r => setTimeout(r, 20)); // let the settle pass queue its sample
    await world.flushTerrain();
    await waitFor(() => created.length === 2);
    expect(latestStats()!.phase).toBe('finished');
  });

  it('cancelling a drawing restores the committed route\'s reference panel', async () => {
    world.setTerrainHeightFn(ridgeline);
    await commitRoute();

    // Route-tool toggle on, a stray click, toggle off — the committed route's
    // panel must come back, not be wiped by cancel's unconditional null
    drawer.setMode(true);
    world.clickAt(C.lng, C.lat);
    await waitForStats(s => s.pointCount === 1 && s.phase === 'drawing');
    drawer.setMode(false);

    const restored = latestStats()!;
    expect(restored).not.toBeNull();
    expect(restored.phase).toBe('finished');
    expect(restored.pointCount).toBe(2);
    expect(restored.elevationGain).toBeCloseTo(300, 6);
  });

  it('a straggling per-click enrichment cannot wipe the settled reference panel', async () => {
    world.setTerrainHeightFn(ridgeline);
    await commitRoute();

    drawer.setMode(true);
    world.setTerrainMode('manual'); // the next click's elevation backfill hangs
    world.clickAt(C.lng, C.lat);
    await waitForStats(s => s.pointCount === 1 && s.phase === 'drawing');
    drawer.setMode(false); // cancel restores the committed panel…

    await world.flushTerrain(); // …then the orphaned enrichment resolves

    const panel = latestStats()!;
    expect(panel).not.toBeNull(); // the straggler must not emit null over it
    expect(panel.phase).toBe('finished');
    expect(panel.pointCount).toBe(2);
  });

  it('clearAll strands a click still awaiting its snap lookup', async () => {
    let rejectSnap!: (e: Error) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise((_, reject) => { rejectSnap = reject; })),
    );

    world.clickAt(A.lng, A.lat); // addPoint is now parked on the snap await
    drawer.clearAll();
    const emitsAfterClear = statsLog.length;

    rejectSnap(new Error('late snap'));
    await new Promise(r => setTimeout(r, 20));

    // The in-flight click belongs to the cleared state — no phantom panel repaint
    expect(statsLog.length).toBe(emitsAfterClear);
    expect(latestStats()).toBeNull();
  });

  it('destroy strands a click still awaiting its snap lookup', async () => {
    let rejectSnap!: (e: Error) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise((_, reject) => { rejectSnap = reject; })),
    );

    world.clickAt(A.lng, A.lat);
    const entitiesBefore = world.entities().length;
    const emitsBefore = statsLog.length;
    drawer.destroy();

    rejectSnap(new Error('late snap'));
    await new Promise(r => setTimeout(r, 20));

    // No emit into an unmounted component, no touch of the destroyed viewer
    expect(statsLog.length).toBe(emitsBefore);
    expect(world.entities().length).toBe(entitiesBefore);
  });

  it('a late settlement commits its route but never clobbers a new drawing\'s live stats', async () => {
    world.setTerrainMode('manual');
    world.setTerrainHeightFn(() => 700);

    world.clickAt(A.lng, A.lat);
    await waitForStats(s => s.pointCount === 1);
    world.clickAt(B.lng, B.lat);
    await waitForStats(s => s.pointCount === 2);
    world.doubleClick(); // route 1 now settling

    drawer.setMode(true); // start route 2 during route 1's settle window
    world.clickAt(C.lng, C.lat);
    await waitForStats(s => s.pointCount === 1 && s.phase === 'drawing');
    const mark = statsLog.length;

    await world.flushTerrain();
    await waitFor(() => created.length === 1); // route 1 still commits…

    // …but no finished-stats emission overwrites route 2's live panel
    expect(statsLog.slice(mark).some(s => s?.phase === 'finished')).toBe(false);
    const live = latestStats()!;
    expect(live.phase).toBe('drawing');
    expect(live.pointCount).toBe(1);
  });

  it('chart hover resolves against the settling route during the window', async () => {
    await commitRoute(); // a PREVIOUS committed route to fall back to (the bug)

    drawer.setMode(true);
    world.clickAt(A.lng, A.lat);
    await waitForStats(s => s.pointCount === 1);
    world.clickAt(B.lng, B.lat);
    await waitForStats(s => s.pointCount === 2);
    world.clickAt(C.lng, C.lat);
    await waitForStats(s => s.pointCount === 3);

    world.setTerrainMode('manual');
    world.doubleClick(); // 3-point route settling; 2-point route committed

    // The panel shows the settling route's stats — hover must resolve against
    // the same points, not the previous committed track
    expect(latestStats()!.pointCount).toBe(3);
    expect(drawer.getDrawingPointCount()).toBe(3);
    expect(drawer.getDrawingPointPosition(2)).toBeTruthy();

    await new Promise(r => setTimeout(r, 20)); // let the settle pass queue its sample
    await world.flushTerrain();
    await waitFor(() => created.length === 2);
    expect(drawer.getDrawingPointCount()).toBe(3);
  });

  it('destroy strands an edit-drag whose elevation backfill is still in flight', async () => {
    await commitRoute();
    expect(drawer.enterEditMode()).toBe(true);

    const handle = world
      .entities()
      .find(e => e._editType === 'control' && e._editIndex === 1);
    world.queueScenePick({ id: handle });
    world.fire('LEFT_DOWN');
    world.dragTo(C.lng, C.lat);

    world.setTerrainMode('manual'); // the drop's elevation backfill will hang
    world.fire('LEFT_UP');
    await new Promise(r => setTimeout(r, 20)); // let the drop reach the backfill await

    drawer.destroy(); // wizard unmounts mid-drag-settle
    const emitsAfterDestroy = statsLog.length;
    const entitiesAfterDestroy = world.entities().length;

    await world.flushTerrain();
    await new Promise(r => setTimeout(r, 20));

    // No emit into an unmounted component, no handle re-render on a dead viewer
    expect(statsLog.length).toBe(emitsAfterDestroy);
    expect(world.entities().length).toBe(entitiesAfterDestroy);
  });

  it('cancel during a settle window keeps the settling panel, not the previous route\'s', async () => {
    world.setTerrainHeightFn(ridgeline);
    await commitRoute(); // route 1: 2 points, committed

    // Route 2: 3 points, finished but still settling
    drawer.setMode(true);
    world.clickAt(A.lng, A.lat);
    await waitForStats(s => s.pointCount === 1);
    world.clickAt(B.lng, B.lat);
    await waitForStats(s => s.pointCount === 2);
    world.clickAt(C.lng, C.lat);
    await waitForStats(s => s.pointCount === 3);
    world.setTerrainMode('manual');
    world.doubleClick(); // route 2 settling — NOT in the committed list yet

    // Route-tool toggle on/off inside the window: the panel must keep showing
    // the settling route (Edit stays honestly disabled), not flip to route 1
    // as a finished reference
    drawer.setMode(true);
    drawer.setMode(false);
    const panel = latestStats()!;
    expect(panel.phase).toBe('settling');
    expect(panel.pointCount).toBe(3);

    await new Promise(r => setTimeout(r, 20));
    await world.flushTerrain();
    await waitFor(() => created.length === 2);
    expect(latestStats()!.phase).toBe('finished');
    expect(latestStats()!.pointCount).toBe(3);
  });

  it('routesSettled() resolves only after a pending finish commits (wizard submit gate)', async () => {
    world.setTerrainMode('manual');
    world.setTerrainHeightFn(() => 700);

    world.clickAt(A.lng, A.lat);
    await waitForStats(s => s.pointCount === 1);
    world.clickAt(B.lng, B.lat);
    await waitForStats(s => s.pointCount === 2);
    expect(hasPendingRouteSettles()).toBe(false);

    world.doubleClick();
    expect(hasPendingRouteSettles()).toBe(true);

    let resolved = false;
    const gate = routesSettled().then(() => { resolved = true; });
    await new Promise(r => setTimeout(r, 20));
    expect(resolved).toBe(false); // submit would still be waiting
    expect(created).toHaveLength(0);

    await world.flushTerrain();
    await gate;
    expect(created).toHaveLength(1); // the route is in form state before submit reads it
    expect(hasPendingRouteSettles()).toBe(false);
  });
});
