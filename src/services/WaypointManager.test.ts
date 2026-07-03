/**
 * Characterization tests for WaypointManager at its public boundary: clicks in
 * (via the fake Cesium input handler) -> onAdded out, plus the async elevation
 * backfill (slice 04): a placed waypoint's picked height (0m on the flat 2D
 * ellipsoid) corrects to the true terrain height a moment later — same
 * mechanism, same UX contract as TrackDrawer's route points.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WaypointManager, { type Waypoint } from './WaypointManager';
import { installFakeCesium, waitFor, type FakeCesiumWorld } from './testing/fakeCesium';

const PEAK = { lng: 172.0, lat: -41.0 };
const terrainHeight = (lng: number) => (lng < 172.005 ? 500 : 1900);

describe('WaypointManager', () => {
  let world: FakeCesiumWorld;
  let added: Waypoint[];
  let terrainAvailability: boolean[];
  let manager: WaypointManager;

  beforeEach(async () => {
    world = installFakeCesium();
    added = [];
    terrainAvailability = [];
    manager = new WaypointManager(
      world.viewer,
      wp => added.push(wp),
      available => terrainAvailability.push(available),
    );
    await waitFor(() => world.hasAction('LEFT_CLICK'));
    manager.setMode(true);
  });

  afterEach(() => {
    manager.destroy();
    world.uninstall();
  });

  it('places a waypoint instantly at the picked height, then backfills the true terrain height', async () => {
    world.setTerrainHeightFn(terrainHeight);

    world.clickAt(PEAK.lng, PEAK.lat);
    await waitFor(() => added.length === 1);
    // 2D pick is a flat ellipsoid — the pin appears instantly at ~0m
    expect(added[0].metadata.elevation).toBeCloseTo(0, 3);

    await waitFor(() => manager.getWaypoints()[0].metadata.elevation === 500);
    const wp = manager.getWaypoints()[0];
    expect(wp.cartographic.height).toBeCloseTo(500, 6);
  });

  it('refreshes the infobox description with the settled height, not 0m', async () => {
    world.setTerrainHeightFn(() => 1234);

    world.clickAt(PEAK.lng, PEAK.lat);
    await waitFor(() => added.length === 1);
    await waitFor(() => manager.getWaypoints()[0].metadata.elevation === 1234);

    const wp = manager.getWaypoints()[0];
    expect(wp.entity.description).toContain('1234m');
    expect(wp.entity.description).not.toContain('>0m<');
  });

  it('reports the same settled elevation regardless of the initial picked height (2D vs 3D)', async () => {
    world.setTerrainHeightFn(terrainHeight);

    const flatPick = world.Cesium.Cartesian3.fromDegrees(PEAK.lng, PEAK.lat, 0); // 2D ellipsoid pick
    const wpFlat = manager.addWaypoint(flatPick);
    await waitFor(() => manager.getWaypoints().find(w => w.id === wpFlat.id)?.metadata.elevation === 500);

    const depthPick = world.Cesium.Cartesian3.fromDegrees(PEAK.lng, PEAK.lat, 1900); // stale 3D depth pick
    const wpDepth = manager.addWaypoint(depthPick);
    await waitFor(() => manager.getWaypoints().find(w => w.id === wpDepth.id)?.metadata.elevation === 500);

    const settledFlat = manager.getWaypoints().find(w => w.id === wpFlat.id)!.metadata.elevation;
    const settledDepth = manager.getWaypoints().find(w => w.id === wpDepth.id)!.metadata.elevation;
    expect(settledFlat).toBe(settledDepth);
  });

  it('shows the picked height provisionally, then marks it honestly unknown once terrain is confirmed unavailable', async () => {
    world.setTerrainMode('unavailable');
    world.setTerrainHeightFn(() => 999); // must never apply

    world.clickAt(PEAK.lng, PEAK.lat);
    await waitFor(() => added.length === 1);
    // Instant provisional value (slice 04's contract) — not yet known to be wrong.
    expect(added[0].metadata.elevation).toBeCloseTo(0, 3);

    await new Promise(r => setTimeout(r, 20));
    const wp = manager.getWaypoints()[0];
    // Once we KNOW sampling failed, the picked ~0 must not linger disguised
    // as a real measurement — it becomes an honest absence.
    expect(wp.metadata.elevation).toBeUndefined();
    expect(wp.entity.description).toContain('elevation unknown');
    expect(terrainAvailability).toEqual([false]);
  });

  it('does not re-enrich waypoints restored via loadWaypoints (trusted as already-settled)', async () => {
    world.setTerrainHeightFn(() => 850); // must never apply — loaded data is trusted as final

    manager.loadWaypoints([{ coordinates: [PEAK.lat, PEAK.lng], elevation: 500, name: 'Hut' }]);

    await new Promise(r => setTimeout(r, 20));
    expect(manager.getWaypoints()[0].metadata.elevation).toBe(500);
  });

  it('preserves "unknown" (not sea level) for a waypoint loaded without an elevation, without re-sampling', async () => {
    world.setTerrainHeightFn(() => 650); // must never apply — no re-sampling on load, ever

    manager.loadWaypoints([{ coordinates: [PEAK.lat, PEAK.lng], name: 'Unrecorded peak' }]);

    await new Promise(r => setTimeout(r, 20));
    const wp = manager.getWaypoints()[0];
    expect(wp.metadata.elevation).toBeUndefined();
    expect(wp.entity.description).toContain('elevation unknown');
    expect(terrainAvailability).toEqual([]); // load path never touches terrain sampling at all
  });

  it('fires the terrain-availability notice once, and never with false when sampling works', async () => {
    world.setTerrainHeightFn(terrainHeight);

    world.clickAt(PEAK.lng, PEAK.lat);
    await waitFor(() => added.length === 1);
    await waitFor(() => manager.getWaypoints()[0].metadata.elevation === 500);

    expect(terrainAvailability).toEqual([true]);
  });

  it('does not repaint a waypoint once the manager is destroyed mid-backfill', async () => {
    world.setTerrainMode('manual');
    world.setTerrainHeightFn(() => 700);

    world.clickAt(PEAK.lng, PEAK.lat);
    await waitFor(() => added.length === 1);
    await new Promise(r => setTimeout(r, 20)); // let backfillElevation queue its terrain sample

    const wp = manager.getWaypoints()[0];
    const descriptionBefore = wp.entity.description;
    manager.destroy(); // wizard unmounts mid-backfill

    await world.flushTerrain();
    await new Promise(r => setTimeout(r, 20));

    expect(wp.entity.description).toBe(descriptionBefore); // no paint into a torn-down manager
  });

  it('does not touch a deleted waypoint once its (straggling) backfill resolves', async () => {
    world.setTerrainMode('manual');
    world.setTerrainHeightFn(() => 700);

    world.clickAt(PEAK.lng, PEAK.lat);
    await waitFor(() => added.length === 1);

    const id = manager.getWaypoints()[0].id;
    manager.deleteWaypoint(id);
    const entitiesBefore = world.entities().length;

    await world.flushTerrain();
    await new Promise(r => setTimeout(r, 20));

    expect(manager.getWaypoints()).toHaveLength(0);
    expect(world.entities().length).toBe(entitiesBefore); // no phantom re-add of the deleted pin
  });
});
