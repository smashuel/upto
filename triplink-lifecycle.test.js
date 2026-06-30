// Tests for the TripLink lifecycle module. Runs on Node's built-in test runner:
//   node --test          (or: npm test)
// No DB, no network — the module's seams are crossed by an in-memory repo, recording
// broadcaster/notifier, and a fixed clock. That second adapter is what makes the seams
// real rather than hypothetical.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  start, recordCheckIn, complete, sweepOverdue,
  canTransition, TRANSITIONS, OVERDUE_GRACE_MS,
} from './triplink-lifecycle.js';

// ── Test adapters ─────────────────────────────────────────────────────────────

function makeMemoryRepo(initial = []) {
  const trips = new Map();
  let seq = 0;
  for (const t of initial) trips.set(t.shareToken, { checkIns: [], data: {}, ...t });
  const byId = id => [...trips.values()].find(t => t.id === id);
  return {
    _trips: trips,
    async getTrip(token) {
      const t = trips.get(token);
      if (!t) return null;
      return {
        id: t.id, status: t.status, data: t.data || {},
        expectedReturnTime: t.expectedReturnTime ?? null,
        lastCheckIn: t.lastCheckIn ?? null, creatorName: t.creatorName ?? null,
      };
    },
    async applyStart(token, contacts) {
      const t = trips.get(token);
      if (!t || t.status !== 'planned') return null; // atomic guard
      t.status = 'active';
      t.startedAt = new Date().toISOString();
      if (contacts) t.data = { ...(t.data || {}), emergencyContacts: contacts };
      return { id: t.id, data: t.data || {}, expectedReturnTime: t.expectedReturnTime ?? null,
               creatorName: t.creatorName ?? null, startedAt: t.startedAt };
    },
    async insertCheckIn(tripId, c) {
      const t = byId(tripId);
      const timestamp = new Date(1700000000000 + seq++).toISOString();
      t.checkIns.push({ ...c, timestamp });
      t.lastCheckIn = timestamp;
      if (t.status === 'overdue') { t.status = 'active'; t.overdueSince = null; }
      return { timestamp, status: t.status };
    },
    async applyComplete(token) {
      const t = trips.get(token);
      if (!t || (t.status !== 'active' && t.status !== 'overdue')) return null; // atomic guard
      t.status = 'completed';
      return { id: t.id };
    },
    async findOverdueCandidates() {
      return [...trips.values()]
        .filter(t => t.status === 'active' && t.expectedReturnTime)
        .map(t => ({ id: t.id, shareToken: t.shareToken, expectedReturnTime: t.expectedReturnTime,
                     data: t.data || {}, lastCheckIn: t.lastCheckIn ?? null, creatorName: t.creatorName ?? null }));
    },
    async applyOverdue(id) {
      const t = byId(id);
      if (!t || t.status !== 'active') return null; // atomic guard
      t.status = 'overdue';
      t.overdueSince = new Date().toISOString();
      return { overdueSince: t.overdueSince };
    },
  };
}

function makeBroadcaster() {
  const events = [];
  return { events, broadcast: (token, event, data) => events.push({ token, event, data }) };
}

function makeNotifier() {
  const calls = [];
  return {
    calls,
    notifyStart: async trip => { calls.push({ type: 'start', trip }); return { notified: ['kahu@example.com'], skipped: [] }; },
    notifyOverdue: async trip => { calls.push({ type: 'overdue', trip }); },
  };
}

const fixedClock = ms => ({ now: () => ms });

const planned = (over = {}) => ({ id: 't1', shareToken: 'tok', status: 'planned', creatorName: 'Kahu', ...over });

// ── The transition table ──────────────────────────────────────────────────────

test('transition table: legal edges', () => {
  assert.equal(canTransition('planned', 'active'), true);
  assert.equal(canTransition('active', 'overdue'), true);
  assert.equal(canTransition('active', 'completed'), true);
  assert.equal(canTransition('overdue', 'active'), true);
  assert.equal(canTransition('overdue', 'completed'), true);
});

test('transition table: tightened illegal edges', () => {
  assert.equal(canTransition('planned', 'completed'), false); // must start first
  assert.equal(canTransition('planned', 'overdue'), false);
  assert.equal(canTransition('completed', 'active'), false);  // terminal
  assert.equal(Object.keys(TRANSITIONS.completed).length, 0);
});

// ── start ─────────────────────────────────────────────────────────────────────

test('start: planned -> active, broadcasts status, notifies, returns summary', async () => {
  const repo = makeMemoryRepo([planned()]);
  const broadcaster = makeBroadcaster();
  const notifier = makeNotifier();
  const res = await start('tok', {}, { repo, broadcaster, notifier });

  assert.equal(res.reason, 'ok');
  assert.equal(res.status, 'active');
  assert.deepEqual(res.notified, ['kahu@example.com']);
  assert.equal(repo._trips.get('tok').status, 'active');
  assert.deepEqual(broadcaster.events[0], { token: 'tok', event: 'status', data: { status: 'active', startedAt: repo._trips.get('tok').startedAt } });
  assert.equal(notifier.calls.length, 1);
  assert.equal(notifier.calls[0].type, 'start');
});

test('start: replaces the emergencyContacts snapshot when contacts are supplied', async () => {
  const repo = makeMemoryRepo([planned()]);
  const contacts = [{ name: 'Aroha', isEmergency: true }];
  await start('tok', { contacts }, { repo, broadcaster: makeBroadcaster(), notifier: makeNotifier() });
  assert.deepEqual(repo._trips.get('tok').data.emergencyContacts, contacts);
});

test('start: second call is an idempotent no-op (no re-notify)', async () => {
  const repo = makeMemoryRepo([planned()]);
  const notifier = makeNotifier();
  await start('tok', {}, { repo, broadcaster: makeBroadcaster(), notifier });
  const second = await start('tok', {}, { repo, broadcaster: makeBroadcaster(), notifier });

  assert.equal(second.reason, 'noop');
  assert.equal(second.alreadyStarted, true);
  assert.equal(notifier.calls.length, 1); // not notified twice
});

test('start: unknown token -> not_found', async () => {
  const res = await start('nope', {}, { repo: makeMemoryRepo(), broadcaster: makeBroadcaster(), notifier: makeNotifier() });
  assert.equal(res.reason, 'not_found');
});

// ── check-in ──────────────────────────────────────────────────────────────────

test('check-in on active: records, broadcast carries resulting status', async () => {
  const repo = makeMemoryRepo([planned({ status: 'active' })]);
  const broadcaster = makeBroadcaster();
  const res = await recordCheckIn('tok', { message: 'at the hut' }, { repo, broadcaster });

  assert.equal(res.reason, 'ok');
  assert.equal(res.status, 'active');
  assert.equal(broadcaster.events[0].event, 'checkin');
  assert.equal(broadcaster.events[0].data.status, 'active'); // ← the leak-fix: status on the wire
});

test('check-in on overdue: clears the alarm (overdue -> active)', async () => {
  const repo = makeMemoryRepo([planned({ status: 'overdue' })]);
  const broadcaster = makeBroadcaster();
  const res = await recordCheckIn('tok', {}, { repo, broadcaster });

  assert.equal(res.status, 'active');
  assert.equal(repo._trips.get('tok').status, 'active');
  assert.equal(broadcaster.events[0].data.status, 'active');
});

test('check-in on a completed trip is rejected (illegal)', async () => {
  const repo = makeMemoryRepo([planned({ status: 'completed' })]);
  const broadcaster = makeBroadcaster();
  const res = await recordCheckIn('tok', {}, { repo, broadcaster });

  assert.equal(res.ok, false);
  assert.equal(res.reason, 'illegal');
  assert.equal(broadcaster.events.length, 0); // nothing broadcast
});

// ── complete ──────────────────────────────────────────────────────────────────

test('complete: active -> completed', async () => {
  const repo = makeMemoryRepo([planned({ status: 'active' })]);
  const broadcaster = makeBroadcaster();
  const res = await complete('tok', { repo, broadcaster });

  assert.equal(res.reason, 'ok');
  assert.equal(res.status, 'completed');
  assert.equal(broadcaster.events[0].data.status, 'completed');
});

test('complete: overdue -> completed', async () => {
  const repo = makeMemoryRepo([planned({ status: 'overdue' })]);
  const res = await complete('tok', { repo, broadcaster: makeBroadcaster() });
  assert.equal(res.status, 'completed');
});

test('complete: planned -> completed is rejected (illegal, must start first)', async () => {
  const repo = makeMemoryRepo([planned()]);
  const broadcaster = makeBroadcaster();
  const res = await complete('tok', { repo, broadcaster });

  assert.equal(res.ok, false);
  assert.equal(res.reason, 'illegal');
  assert.equal(repo._trips.get('tok').status, 'planned'); // unchanged
  assert.equal(broadcaster.events.length, 0);
});

test('complete: second call is an idempotent no-op', async () => {
  const repo = makeMemoryRepo([planned({ status: 'active' })]);
  await complete('tok', { repo, broadcaster: makeBroadcaster() });
  const second = await complete('tok', { repo, broadcaster: makeBroadcaster() });
  assert.equal(second.reason, 'noop');
  assert.equal(second.alreadyCompleted, true);
});

// ── overdue sweep (clock-driven) ───────────────────────────────────────────────

const RETURN = '2026-06-30T12:00:00.000Z';
const returnMs = new Date(RETURN).getTime();

test('sweep: active trip past return + grace -> overdue, broadcasts + notifies', async () => {
  const repo = makeMemoryRepo([planned({ status: 'active', expectedReturnTime: RETURN })]);
  const broadcaster = makeBroadcaster();
  const notifier = makeNotifier();
  const clock = fixedClock(returnMs + OVERDUE_GRACE_MS + 1);

  const res = await sweepOverdue({ repo, broadcaster, notifier, clock });
  await new Promise(r => setImmediate(r)); // let the fire-and-forget notify settle

  assert.deepEqual(res.transitioned, ['t1']);
  assert.equal(repo._trips.get('tok').status, 'overdue');
  assert.equal(broadcaster.events[0].event, 'overdue');
  assert.equal(broadcaster.events[0].data.status, 'overdue');
  assert.equal(notifier.calls[0].type, 'overdue');
});

test('sweep: within the grace window -> not overdue', async () => {
  const repo = makeMemoryRepo([planned({ status: 'active', expectedReturnTime: RETURN })]);
  const broadcaster = makeBroadcaster();
  const clock = fixedClock(returnMs + OVERDUE_GRACE_MS - 1); // 1ms inside grace

  const res = await sweepOverdue({ repo, broadcaster, notifier: makeNotifier(), clock });
  assert.deepEqual(res.transitioned, []);
  assert.equal(repo._trips.get('tok').status, 'active');
  assert.equal(broadcaster.events.length, 0);
});

test('sweep: a non-active trip is never swept', async () => {
  const repo = makeMemoryRepo([planned({ status: 'overdue', expectedReturnTime: RETURN })]);
  const res = await sweepOverdue({ repo, broadcaster: makeBroadcaster(), notifier: makeNotifier(), clock: fixedClock(returnMs + 1e9) });
  assert.deepEqual(res.transitioned, []);
});
