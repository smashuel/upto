import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NativeBackgroundPositionSource } from './nativeBackgroundPositionSource.ts';
import type { BackgroundWatcherPlugin, WatcherCallback } from './nativeBackgroundPositionSource.ts';
import type { PositionFix, UnavailableReason } from './positionSource.ts';

// ── NativeBackgroundPositionSource: tested at its public boundary (Stage 2 Slice 2) ──
//
// The plugin itself is native and only provable on a device — but the behaviour *around* it is
// plain TypeScript, and two of those behaviours are safety- and privacy-critical:
//
//   1. `stop()` must genuinely remove the watcher, including when it is called before
//      `addWatcher` has resolved. If it doesn't, switching sharing to `off` leaves the OS
//      collecting the traveller's location — "off" that isn't off.
//   2. Errors must map to the right `UnavailableReason`, because `denied` drives the honest
//      "we can't see you" notice while `error` is a transient the next sample recovers from.
//
// Nothing here reaches the plugin: a fake stands in at the injected seam.

const LOCATION = {
  latitude: -44.6721,
  longitude: 167.9245,
  accuracy: 12.5,
  simulated: false,
  time: 1_785_542_400_000,
};

/** Records what the source asked the plugin to do, and lets a test drive the callback. */
function fakePlugin(opts: { addWatcherRejects?: { message: string; code?: string } } = {}) {
  const state = {
    addWatcherCalls: [] as unknown[],
    removed: [] as string[],
    callback: null as WatcherCallback | null,
    /** Resolve `addWatcher` on demand, to exercise the stop-before-resolve race. */
    resolveAddWatcher: null as ((id: string) => void) | null,
  };
  const plugin: BackgroundWatcherPlugin = {
    addWatcher(options, callback) {
      state.addWatcherCalls.push(options);
      state.callback = callback;
      if (opts.addWatcherRejects) {
        const err = new Error(opts.addWatcherRejects.message) as Error & { code?: string };
        err.code = opts.addWatcherRejects.code;
        return Promise.reject(err);
      }
      return new Promise<string>((resolve) => { state.resolveAddWatcher = resolve; });
    },
    removeWatcher({ id }) {
      state.removed.push(id);
      return Promise.resolve();
    },
  };
  return { plugin, state };
}

function collector() {
  const fixes: PositionFix[] = [];
  const unavailable: UnavailableReason[] = [];
  return {
    fixes,
    unavailable,
    handlers: {
      onFix: (f: PositionFix) => fixes.push(f),
      onUnavailable: (r: UnavailableReason) => unavailable.push(r),
    },
  };
}

const INTERVAL = 180_000; // the Stage-1 ~3-min cadence floor

test('start registers a watcher carrying a backgroundMessage', async () => {
  // Load-bearing, not cosmetic: the plugin only delivers updates in the background when
  // `backgroundMessage` is set. Without it this slice silently degrades to foreground-only —
  // the exact failure it exists to prevent, and invisible until someone locks their phone.
  const { plugin, state } = fakePlugin();
  const src = new NativeBackgroundPositionSource({ intervalMs: INTERVAL }, plugin);
  src.start(collector().handlers);
  await Promise.resolve();

  const options = state.addWatcherCalls[0] as { backgroundMessage?: string; stale?: boolean };
  assert.ok(options.backgroundMessage, 'backgroundMessage must be set');
  assert.equal(options.stale, false, 'stale fixes must not be delivered as current');
});

test('a well-formed location is emitted as a PositionFix', async () => {
  const { plugin, state } = fakePlugin();
  const c = collector();
  const src = new NativeBackgroundPositionSource({ intervalMs: INTERVAL }, plugin);
  src.start(c.handlers);
  await Promise.resolve();

  state.callback!(LOCATION, undefined);
  assert.deepEqual(c.fixes, [{
    lat: -44.6721, lng: 167.9245, accuracy: 12.5, timestamp: '2026-08-01T00:00:00.000Z',
  }]);
});

test('a malformed location is dropped, not emitted', async () => {
  const { plugin, state } = fakePlugin();
  const c = collector();
  const src = new NativeBackgroundPositionSource({ intervalMs: INTERVAL }, plugin);
  src.start(c.handlers);
  await Promise.resolve();

  state.callback!({ ...LOCATION, latitude: NaN }, undefined);
  assert.deepEqual(c.fixes, []);
  // Dropping is NOT "unavailable" — the device is still tracking fine, this one reading was
  // junk. Reporting unavailable here would cry wolf and dilute a signal that must stay meaningful.
  assert.deepEqual(c.unavailable, []);
});

test('NOT_AUTHORIZED maps to denied', async () => {
  const { plugin, state } = fakePlugin();
  const c = collector();
  const src = new NativeBackgroundPositionSource({ intervalMs: INTERVAL }, plugin);
  src.start(c.handlers);
  await Promise.resolve();

  const err = new Error('Permission denied.') as Error & { code?: string };
  err.code = 'NOT_AUTHORIZED';
  state.callback!(undefined, err);
  assert.deepEqual(c.unavailable, ['denied']);
});

test('any other error maps to error, not denied', async () => {
  const { plugin, state } = fakePlugin();
  const c = collector();
  const src = new NativeBackgroundPositionSource({ intervalMs: INTERVAL }, plugin);
  src.start(c.handlers);
  await Promise.resolve();

  state.callback!(undefined, new Error('location services flaked'));
  assert.deepEqual(c.unavailable, ['error']);
});

test('a rejected addWatcher with NOT_AUTHORIZED reports denied', async () => {
  const { plugin } = fakePlugin({ addWatcherRejects: { message: 'denied', code: 'NOT_AUTHORIZED' } });
  const c = collector();
  const src = new NativeBackgroundPositionSource({ intervalMs: INTERVAL }, plugin);
  src.start(c.handlers);
  await new Promise((r) => setTimeout(r, 0));

  assert.deepEqual(c.unavailable, ['denied']);
});

test('the first fix is emitted immediately, without waiting out the cadence', async () => {
  // A watcher opening the trip page should see something now, not in three minutes.
  const { plugin, state } = fakePlugin();
  const c = collector();
  let clock = 1_000;
  const src = new NativeBackgroundPositionSource(
    { intervalMs: INTERVAL }, plugin, { now: () => clock },
  );
  src.start(c.handlers);
  await Promise.resolve();

  state.callback!(LOCATION, undefined);
  assert.equal(c.fixes.length, 1);
});

test('fixes arriving inside the cadence are throttled away', async () => {
  // The plugin pushes on movement; the battery invariant is a time cadence. Slice 3 replaces
  // the fixed interval with resolveSampleCadence — the throttle is where it will plug in.
  const { plugin, state } = fakePlugin();
  const c = collector();
  let clock = 1_000;
  const src = new NativeBackgroundPositionSource(
    { intervalMs: INTERVAL }, plugin, { now: () => clock },
  );
  src.start(c.handlers);
  await Promise.resolve();

  state.callback!(LOCATION, undefined);
  clock += 1_000; // a second later — the traveller moved, but it isn't time yet
  state.callback!(LOCATION, undefined);
  assert.equal(c.fixes.length, 1);

  clock += INTERVAL; // now the cadence has elapsed
  state.callback!(LOCATION, undefined);
  assert.equal(c.fixes.length, 2);
});

test('a throttled fix does not reset the cadence window', async () => {
  // Otherwise a traveller moving steadily would push the next emit further away on every
  // callback and could starve their watchers of updates indefinitely.
  const { plugin, state } = fakePlugin();
  const c = collector();
  let clock = 1_000;
  const src = new NativeBackgroundPositionSource(
    { intervalMs: INTERVAL }, plugin, { now: () => clock },
  );
  src.start(c.handlers);
  await Promise.resolve();

  state.callback!(LOCATION, undefined); // emitted at t=1000
  for (let i = 0; i < 5; i++) {
    clock += INTERVAL / 6;
    state.callback!(LOCATION, undefined); // all throttled
  }
  assert.equal(c.fixes.length, 1);
  clock += INTERVAL / 6; // total elapsed now exceeds one full interval
  state.callback!(LOCATION, undefined);
  assert.equal(c.fixes.length, 2);
});

test('errors are never throttled', async () => {
  // Throttling a denial would leave the traveller staring at a map that silently never updates.
  const { plugin, state } = fakePlugin();
  const c = collector();
  const clock = 1_000;
  const src = new NativeBackgroundPositionSource(
    { intervalMs: INTERVAL }, plugin, { now: () => clock },
  );
  src.start(c.handlers);
  await Promise.resolve();

  const err = new Error('nope') as Error & { code?: string };
  err.code = 'NOT_AUTHORIZED';
  state.callback!(undefined, err);
  state.callback!(undefined, err);
  assert.deepEqual(c.unavailable, ['denied', 'denied']);
});

test('stop removes the watcher', async () => {
  const { plugin, state } = fakePlugin();
  const src = new NativeBackgroundPositionSource({ intervalMs: INTERVAL }, plugin);
  src.start(collector().handlers);
  await Promise.resolve();
  state.resolveAddWatcher!('watcher-1');
  await Promise.resolve();

  src.stop();
  await Promise.resolve();
  assert.deepEqual(state.removed, ['watcher-1']);
});

test('stop before addWatcher resolves still removes the watcher — "off" must collect nothing', async () => {
  // The privacy race. Setting sharing to `off` tears the source down immediately, which can
  // easily beat the plugin's registration promise. If the late id were dropped on the floor,
  // the OS would keep feeding a watcher nobody is listening to: the traveller believes they
  // are sharing nothing while their phone is still being asked for its location.
  const { plugin, state } = fakePlugin();
  const src = new NativeBackgroundPositionSource({ intervalMs: INTERVAL }, plugin);
  src.start(collector().handlers);
  await Promise.resolve();

  src.stop();                            // stopped while registration is still in flight
  assert.deepEqual(state.removed, []);   // nothing to remove yet — there is no id
  state.resolveAddWatcher!('watcher-late');
  await new Promise((r) => setTimeout(r, 0));

  assert.deepEqual(state.removed, ['watcher-late'], 'the late id must still be removed');
});

test('no fix is emitted after stop, even if the plugin calls back late', async () => {
  const { plugin, state } = fakePlugin();
  const c = collector();
  const src = new NativeBackgroundPositionSource({ intervalMs: INTERVAL }, plugin);
  src.start(c.handlers);
  await Promise.resolve();
  state.resolveAddWatcher!('watcher-1');
  await Promise.resolve();

  src.stop();
  state.callback!(LOCATION, undefined);
  state.callback!(undefined, new Error('late error'));
  assert.deepEqual(c.fixes, []);
  assert.deepEqual(c.unavailable, []);
});

test('stop is safe to call without a start, and twice', async () => {
  const { plugin, state } = fakePlugin();
  const src = new NativeBackgroundPositionSource({ intervalMs: INTERVAL }, plugin);
  src.stop();
  src.start(collector().handlers);
  await Promise.resolve();
  state.resolveAddWatcher!('watcher-1');
  await Promise.resolve();
  src.stop();
  src.stop();
  await Promise.resolve();
  assert.deepEqual(state.removed, ['watcher-1'], 'removed exactly once');
});
