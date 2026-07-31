import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recordActivity,
  markCleanExit,
  takeReport,
  describeReport,
  RELOAD_WINDOW_MS,
  type BreadcrumbStore,
} from './crashBreadcrumb.ts';

function fakeStore(seed: Record<string, string> = {}): BreadcrumbStore {
  const data: Record<string, string> = { ...seed };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

const T0 = 1_700_000_000_000;
const ctx = { at: T0, url: '/create' };

test('a first-ever launch reports nothing', () => {
  assert.equal(takeReport(fakeStore(), T0), null);
});

test('activity with no unload event means the runtime was destroyed', () => {
  // No pagehide ever fired, so no JS ran as the document went away. On iOS that is the
  // WebView content process being killed.
  const store = fakeStore();
  recordActivity(store, 'note:place', ctx);

  const report = takeReport(store, T0 + 2000);
  assert.ok(report);
  assert.equal(report.verdict, 'terminated');
  assert.equal(report.activity, 'note:place');
  assert.equal(report.url, '/create');
});

test('the terminated verdict holds however long ago it happened', () => {
  // Absence of pagehide is proof on its own — it does not decay with time.
  const store = fakeStore();
  recordActivity(store, 'note:place', ctx);

  const report = takeReport(store, T0 + 86_400_000);
  assert.ok(report);
  assert.equal(report.verdict, 'terminated');
});

test('a clean unload followed by an immediate return is a reload', () => {
  // pagehide fired, and the app was back in under the reload window: the document was
  // replaced rather than closed.
  const store = fakeStore();
  recordActivity(store, 'note:place', ctx);
  markCleanExit(store);

  const report = takeReport(store, T0 + 500);
  assert.ok(report);
  assert.equal(report.verdict, 'reloaded');
});

test('a clean unload followed by a later return is a normal session end', () => {
  // The user closed the app and came back. Not a failure — must not be reported.
  const store = fakeStore();
  recordActivity(store, 'note:place', ctx);
  markCleanExit(store);

  assert.equal(takeReport(store, T0 + RELOAD_WINDOW_MS + 1), null);
});

test('the last activity recorded is the one reported', () => {
  const store = fakeStore();
  recordActivity(store, 'map:open', ctx);
  recordActivity(store, 'note:modal-open', { at: T0 + 100, url: '/create' });
  recordActivity(store, 'note:place', { at: T0 + 200, url: '/create' });

  const report = takeReport(store, T0 + 300);
  assert.ok(report);
  assert.equal(report.activity, 'note:place');
});

test('new activity after a clean exit re-arms the session', () => {
  // Resuming a backgrounded app must not leave a stale cleanExit that hides a later kill.
  const store = fakeStore();
  recordActivity(store, 'map:open', ctx);
  markCleanExit(store);
  recordActivity(store, 'note:place', { at: T0 + 100, url: '/create' });

  const report = takeReport(store, T0 + 200);
  assert.ok(report);
  assert.equal(report.verdict, 'terminated');
});

test('unload with no session in flight is not a report', () => {
  const store = fakeStore();
  markCleanExit(store);
  assert.equal(takeReport(store, T0), null);
});

test('taking a report clears it so it is shown once', () => {
  const store = fakeStore();
  recordActivity(store, 'note:place', ctx);
  assert.ok(takeReport(store, T0 + 100));
  assert.equal(takeReport(store, T0 + 100), null);
});

test('a corrupt record is discarded rather than thrown on', () => {
  // Written by an older build, or a partial write. Must never break app boot.
  const store = fakeStore({ 'upto:session': '{not json' });
  assert.equal(takeReport(store, T0), null);
  assert.equal(store.getItem('upto:session'), null);
});

test('a record from an older build with a missing field is discarded', () => {
  const store = fakeStore({ 'upto:session': JSON.stringify({ stage: 'note:place' }) });
  assert.equal(takeReport(store, T0), null);
});

test('a storage that throws never breaks the caller', () => {
  // Private mode / quota. Instrumentation must never become the failure.
  const throwing: BreadcrumbStore = {
    getItem: () => {
      throw new Error('denied');
    },
    setItem: () => {
      throw new Error('denied');
    },
    removeItem: () => {
      throw new Error('denied');
    },
  };
  assert.doesNotThrow(() => recordActivity(throwing, 'note:place', ctx));
  assert.doesNotThrow(() => markCleanExit(throwing));
  assert.equal(takeReport(throwing, T0), null);
});

test('the description names both the activity and the cause', () => {
  const store = fakeStore();
  recordActivity(store, 'note:place', ctx);
  const report = takeReport(store, T0 + 3000);
  assert.ok(report);

  const text = describeReport(report);
  assert.match(text, /note:place/);
  assert.match(text, /out of memory/);
});
