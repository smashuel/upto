import test from 'node:test';
import assert from 'node:assert/strict';
import {
  beginStage,
  endStage,
  markUnload,
  takeReport,
  type BreadcrumbStore,
} from './crashBreadcrumb.ts';

function fakeStore(seed: Record<string, string> = {}): BreadcrumbStore & { data: Record<string, string> } {
  const data: Record<string, string> = { ...seed };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

const ctx = { at: '2026-07-31T09:00:00.000Z', url: '/create' };

test('no stage ever started reports nothing', () => {
  assert.equal(takeReport(fakeStore()), null);
});

test('a stage that completed reports nothing', () => {
  const store = fakeStore();
  beginStage(store, 'note:place', ctx);
  endStage(store);
  assert.equal(takeReport(store), null);
});

test('a stage interrupted with no unload event means the runtime vanished', () => {
  // Nothing cleared the breadcrumb and no pagehide fired: the JS context was destroyed
  // without warning. On iOS that is the WebView content process being killed.
  const store = fakeStore();
  beginStage(store, 'note:place', ctx);

  const report = takeReport(store);
  assert.ok(report);
  assert.equal(report.stage, 'note:place');
  assert.equal(report.url, '/create');
  assert.equal(report.at, ctx.at);
  assert.equal(report.cleanUnload, false);
});

test('a stage interrupted after an unload event means the page navigated or reloaded', () => {
  // pagehide fired, so JS was still alive as the document went away: a navigation,
  // a reload, or a form submit — not a process kill.
  const store = fakeStore();
  beginStage(store, 'note:place', ctx);
  markUnload(store);

  const report = takeReport(store);
  assert.ok(report);
  assert.equal(report.cleanUnload, true);
});

test('unload with no stage in flight is not a report', () => {
  // Ordinary navigation away from the app must not look like a failure.
  const store = fakeStore();
  markUnload(store);
  assert.equal(takeReport(store), null);
});

test('unload after a completed stage is not a report', () => {
  const store = fakeStore();
  beginStage(store, 'note:place', ctx);
  endStage(store);
  markUnload(store);
  assert.equal(takeReport(store), null);
});

test('taking a report clears it so it is only shown once', () => {
  const store = fakeStore();
  beginStage(store, 'note:place', ctx);
  assert.ok(takeReport(store));
  assert.equal(takeReport(store), null);
});

test('a corrupt breadcrumb is discarded rather than thrown on', () => {
  // Written by an older build, or a partial write. Must never break app boot.
  const store = fakeStore({ 'upto:breadcrumb': '{not json' });
  assert.equal(takeReport(store), null);
  assert.equal(store.getItem('upto:breadcrumb'), null);
});

test('a later stage replaces an abandoned earlier one', () => {
  const store = fakeStore();
  beginStage(store, 'note:place', ctx);
  beginStage(store, 'route:draw', { at: '2026-07-31T09:05:00.000Z', url: '/create' });

  const report = takeReport(store);
  assert.ok(report);
  assert.equal(report.stage, 'route:draw');
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
  assert.doesNotThrow(() => beginStage(throwing, 'note:place', ctx));
  assert.doesNotThrow(() => endStage(throwing));
  assert.doesNotThrow(() => markUnload(throwing));
  assert.equal(takeReport(throwing), null);
});
