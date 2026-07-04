/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Minimal fake of the `cesium` module for testing the map managers at their
 * public boundary (clicks in → callbacks out).
 *
 * The managers `import * as Cesium from 'cesium'`, so tests register this fake as
 * the module mock:
 *
 *   vi.mock('cesium', async () => (await import('./testing/fakeCesium')).fakeCesium);
 *
 * `import * as` snapshots the module's own keys, so the fake must be a single
 * stable object with every member present (`fakeCesium`). The handful of members
 * whose behaviour a test drives (terrain sampling + provider construction) read
 * a module-level `active` holder that `installFakeCesium()` resets per test — the
 * control handle it returns mutates that same holder. Everything else (the pure
 * geometry/colour classes) is stateless and shared.
 *
 * Purpose-built: it implements only the surface CesiumManager/TrackDrawer/
 * WaypointManager actually touch, with real (spherical) math so distances and
 * heights behave plausibly. It is NOT a general Cesium mock — extend it only
 * when a test needs another member.
 *
 * Geometry model: a perfect sphere of radius EARTH_RADIUS. Cartesian3 is ECEF
 * on that sphere; Cartographic stores radians (like real Cesium). Conversions
 * round-trip exactly, which is all the managers need.
 *
 * Terrain sampling is controllable per-world:
 *   - 'auto' (default): sampleTerrainMostDetailed resolves on a microtask,
 *     assigning each cartographic the height from `setHeightFn`
 *   - 'manual': calls queue up until `flushTerrain()` — lets a test drive the
 *     "finish before enrichment lands" race
 *   - 'unavailable': the terrain provider itself fails to construct, as when
 *     there is no Ion token / no network
 *   - 'sample-reject': the provider constructs but every sampling call rejects,
 *     as when terrain tiles fail to load mid-session
 */

const EARTH_RADIUS = 6_371_000;

class Cartesian2 {
  constructor(public x = 0, public y = 0) {}
}

class Cartesian3 {
  constructor(public x = 0, public y = 0, public z = 0) {}

  static fromDegrees(lng: number, lat: number, height = 0): Cartesian3 {
    const r = EARTH_RADIUS + height;
    const latR = (lat * Math.PI) / 180;
    const lngR = (lng * Math.PI) / 180;
    return new Cartesian3(
      r * Math.cos(latR) * Math.cos(lngR),
      r * Math.cos(latR) * Math.sin(lngR),
      r * Math.sin(latR),
    );
  }

  static distance(a: Cartesian3, b: Cartesian3): number {
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  }

  static midpoint(a: Cartesian3, b: Cartesian3, result: Cartesian3): Cartesian3 {
    result.x = (a.x + b.x) / 2;
    result.y = (a.y + b.y) / 2;
    result.z = (a.z + b.z) / 2;
    return result;
  }
}

class Cartographic {
  /** longitude/latitude in RADIANS, height in metres — mirrors real Cesium */
  constructor(public longitude = 0, public latitude = 0, public height = 0) {}

  static fromCartesian(c: Cartesian3): Cartographic {
    const r = Math.hypot(c.x, c.y, c.z);
    return new Cartographic(Math.atan2(c.y, c.x), Math.asin(c.z / r), r - EARTH_RADIUS);
  }
}

class Color {
  constructor(public css = '') {}
  withAlpha(): Color {
    return this;
  }
  static WHITE = new Color('white');
  static ORANGE = new Color('orange');
  static DODGERBLUE = new Color('dodgerblue');
  static BLACK = new Color('black');
  static fromCssColorString(css: string): Color {
    return new Color(css);
  }
}

class CallbackProperty {
  constructor(public getValue: () => any, public isConstant: boolean) {}
}

class PolylineGlowMaterialProperty {
  constructor(public options: any) {}
}

class NearFarScalar {
  constructor(public near = 0, public nearValue = 0, public far = 0, public farValue = 0) {}
}

/** One registered screen-space handler; fake fires events straight at the actions. */
class FakeScreenSpaceEventHandler {
  actions = new Map<string, (event: any) => void>();
  destroyed = false;

  constructor() {
    handlerRegistry.push(this);
  }

  setInputAction(cb: (event: any) => void, type: string) {
    this.actions.set(type, cb);
  }

  removeInputAction(type: string) {
    this.actions.delete(type);
  }

  destroy() {
    this.destroyed = true;
    this.actions.clear();
  }
}

let handlerRegistry: FakeScreenSpaceEventHandler[] = [];

class FakeEvent {
  private listeners = new Set<() => void>();
  addEventListener = (fn: () => void) => this.listeners.add(fn);
  removeEventListener = (fn: () => void) => this.listeners.delete(fn);
  raise = () => this.listeners.forEach(fn => fn());
}

class FakeEntityCollection {
  values: any[] = [];
  add(spec: any) {
    this.values.push(spec);
    return spec;
  }
  remove(entity: any) {
    const i = this.values.indexOf(entity);
    if (i !== -1) this.values.splice(i, 1);
    return i !== -1;
  }
}

type TerrainMode = 'auto' | 'manual' | 'unavailable' | 'sample-reject';

/** Per-test terrain state read by the stable `fakeCesium` module's async members
 *  and mutated by the control handle. Reset by `installFakeCesium()`. Test files
 *  run sequentially within a worker, so a single module-level holder is safe. */
interface ActiveTerrain {
  mode: TerrainMode;
  heightFn: (lng: number, lat: number) => number;
  pendingSamples: Array<{ cartos: Cartographic[]; resolve: () => void }>;
  providerManual: boolean;
  pendingProviders: Array<() => void>;
}

const freshActive = (): ActiveTerrain => ({
  mode: 'auto',
  heightFn: () => 0,
  pendingSamples: [],
  providerManual: false,
  pendingProviders: [],
});

let active: ActiveTerrain = freshActive();

const applyHeights = (cartos: Cartographic[]) => {
  for (const c of cartos) {
    c.height = active.heightFn((c.longitude * 180) / Math.PI, (c.latitude * 180) / Math.PI);
  }
};

/**
 * The stable fake `cesium` module. Every member is present so `import * as Cesium`
 * sees real keys; the pure classes are shared, and the two async members read the
 * module-level `active` holder so a test can drive terrain timing/availability.
 * Register it as the module mock (see file header).
 */
export const fakeCesium = {
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  CallbackProperty,
  PolylineGlowMaterialProperty,
  ScreenSpaceEventHandler: FakeScreenSpaceEventHandler,
  ScreenSpaceEventType: {
    LEFT_CLICK: 'LEFT_CLICK',
    LEFT_DOUBLE_CLICK: 'LEFT_DOUBLE_CLICK',
    LEFT_DOWN: 'LEFT_DOWN',
    LEFT_UP: 'LEFT_UP',
    MOUSE_MOVE: 'MOUSE_MOVE',
  },
  SceneMode: { SCENE2D: 'SCENE2D', SCENE3D: 'SCENE3D', COLUMBUS_VIEW: 'COLUMBUS_VIEW' },
  HeightReference: { CLAMP_TO_GROUND: 'CLAMP_TO_GROUND' },
  VerticalOrigin: { BOTTOM: 'BOTTOM', TOP: 'TOP', CENTER: 'CENTER' },
  LabelStyle: { FILL: 'FILL', OUTLINE: 'OUTLINE', FILL_AND_OUTLINE: 'FILL_AND_OUTLINE' },
  NearFarScalar,
  Math: {
    toDegrees: (rad: number) => (rad * 180) / Math.PI,
    toRadians: (deg: number) => (deg * Math.PI) / 180,
  },
  defined: (v: any) => v !== undefined && v !== null,
  CesiumTerrainProvider: {
    fromIonAssetId: () => {
      if (active.providerManual) {
        return new Promise((resolve, reject) => {
          active.pendingProviders.push(() => {
            if (active.mode === 'unavailable') reject(new Error('fake: terrain unavailable'));
            else resolve({ fake: 'terrain' });
          });
        });
      }
      if (active.mode === 'unavailable') return Promise.reject(new Error('fake: terrain unavailable'));
      return Promise.resolve({ fake: 'terrain' });
    },
  },
  sampleTerrainMostDetailed: (_provider: unknown, cartos: Cartographic[]) => {
    if (active.mode === 'sample-reject') {
      return Promise.reject(new Error('fake: terrain sampling failed'));
    }
    if (active.mode === 'manual') {
      return new Promise<void>(resolve => {
        active.pendingSamples.push({ cartos, resolve });
      });
    }
    applyHeights(cartos);
    return Promise.resolve(cartos);
  },
};

export interface FakeCesiumWorld {
  Cesium: any;
  viewer: any;
  /** Fire an input event at every live handler registered for `type`. */
  fire(type: string, event?: any): void;
  /** True once some live handler has registered an action for `type` — managers
   *  set up asynchronously (retry loop), so tests wait on this before clicking. */
  hasAction(type: string): boolean;
  /** Queue a ground pick at lng/lat and fire a LEFT_CLICK that returns it. */
  clickAt(lng: number, lat: number): void;
  /** Fire the LEFT_DOUBLE_CLICK that finishes a drawing. */
  doubleClick(): void;
  /** Queue a ground pick at lng/lat and fire a MOUSE_MOVE that returns it (drag). */
  dragTo(lng: number, lat: number): void;
  /** Queue the entity `scene.pick` returns on the next call (e.g. an edit handle). */
  queueScenePick(picked: any): void;
  /** Terrain height used by sampleTerrainMostDetailed (degrees in). */
  setTerrainHeightFn(fn: (lng: number, lat: number) => number): void;
  setTerrainMode(mode: TerrainMode): void;
  /** Resolve all queued 'manual' terrain samples (applies the height fn). */
  flushTerrain(): Promise<void>;
  /** When true, `CesiumTerrainProvider.fromIonAssetId` parks instead of
   *  resolving — lets a test drive "destroyed while the provider itself is
   *  still loading" races. Default false (resolves on the next microtask). */
  setProviderManual(manual: boolean): void;
  /** Resolve all queued 'manual' provider constructions. */
  flushProvider(): Promise<void>;
  /** Entities currently on the fake viewer. */
  entities(): any[];
  /** Reset the fake's per-test state (terrain + handler registry). */
  uninstall(): void;
}

/**
 * Reset the fake's per-test state and hand back a fresh stub viewer + control
 * handle. The managers reach Cesium through the mocked `cesium` module
 * (`fakeCesium`), so this no longer touches any global — it only resets `active`
 * and the handler registry, then wires a viewer whose picks the handle can queue.
 */
export function installFakeCesium(): FakeCesiumWorld {
  handlerRegistry = [];
  active = freshActive();

  const pickQueue: Cartesian3[] = [];
  const scenePickQueue: any[] = [];

  const entities = new FakeEntityCollection();
  const viewer = {
    cesiumWidget: {
      screenSpaceEventHandler: {},
      canvas: { style: { cursor: '' } },
    },
    scene: {
      canvas: {},
      mode: fakeCesium.SceneMode.SCENE2D,
      pickPositionSupported: false,
      pickPosition: () => undefined,
      pick: () => scenePickQueue.shift(),
      requestRender: () => {},
      globe: { ellipsoid: {} },
      screenSpaceCameraController: { enableRotate: true, enableTranslate: true, enableZoom: true },
    },
    camera: {
      positionCartographic: { height: 5000 },
      moveEnd: new FakeEvent(),
      pickEllipsoid: () => pickQueue.shift() ?? null,
    },
    entities,
  };

  const fire = (type: string, event: any = { position: new Cartesian2(0, 0) }) => {
    for (const handler of [...handlerRegistry]) {
      if (handler.destroyed) continue;
      handler.actions.get(type)?.(event);
    }
  };

  return {
    Cesium: fakeCesium,
    viewer,
    fire,
    hasAction: (type: string) =>
      handlerRegistry.some(h => !h.destroyed && h.actions.has(type)),
    clickAt(lng: number, lat: number) {
      pickQueue.push(Cartesian3.fromDegrees(lng, lat, 0));
      fire('LEFT_CLICK');
    },
    doubleClick() {
      fire('LEFT_DOUBLE_CLICK');
    },
    dragTo(lng: number, lat: number) {
      pickQueue.push(Cartesian3.fromDegrees(lng, lat, 0));
      fire('MOUSE_MOVE', { endPosition: new Cartesian2(0, 0) });
    },
    queueScenePick(picked: any) {
      scenePickQueue.push(picked);
    },
    setTerrainHeightFn(fn) {
      active.heightFn = fn;
    },
    setTerrainMode(mode) {
      active.mode = mode;
    },
    async flushTerrain() {
      const pending = active.pendingSamples.splice(0);
      for (const { cartos, resolve } of pending) {
        applyHeights(cartos);
        resolve();
      }
      // Let the awaiting code (enrichment → stats re-emit) run to completion.
      await new Promise(r => setTimeout(r, 0));
    },
    setProviderManual(manual: boolean) {
      active.providerManual = manual;
    },
    async flushProvider() {
      const pending = active.pendingProviders.splice(0);
      for (const settle of pending) settle();
      await new Promise(r => setTimeout(r, 0));
    },
    entities: () => entities.values,
    uninstall() {
      active = freshActive();
      handlerRegistry = [];
    },
  };
}

/** Wait until `predicate` returns true (polling), or fail after `timeoutMs`. */
export async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitFor: condition not met within timeout');
    }
    await new Promise(r => setTimeout(r, 5));
  }
}
