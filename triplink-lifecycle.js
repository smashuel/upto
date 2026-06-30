// ── TripLink lifecycle ────────────────────────────────────────────────────────
// The single module that owns every status transition of a TripLink.
//
// Design (see CONTEXT.md "TripLink lifecycle" + ADR 012):
//  - The DB stays the ATOMICITY authority. Each transition is an atomic conditional
//    write behind the `repo` seam (e.g. UPDATE ... WHERE status='planned'), so two
//    racing /start taps can't both transition.
//  - This module owns WHICH transitions are legal (the TRANSITIONS table) and WHAT
//    side effects fire on each (broadcast always; notify on enter-active / enter-overdue).
//  - It never knows WHO gets notified or on which channel — that stays behind the
//    `notifier` seam (the Watcher / Emergency Contact policy).
//
// Dependencies are injected so the module is testable through its interface:
//   deps = { repo, broadcaster, notifier, clock }
// Production wires Postgres + SSE + notifications.js + the system clock; tests wire
// an in-memory repo + recorders + a fixed clock (see triplink-lifecycle.test.js).

export const OVERDUE_GRACE_MS = 15 * 60 * 1000; // 15 minutes past expected return

// The authoritative legal graph. Everything not listed here is rejected.
// Tightened from the old ad-hoc SQL: `planned -> completed` is gone (a trip must be
// started before it can be completed) and check-ins on terminal states are rejected.
export const TRANSITIONS = {
  planned:   { active: true },                  // Start
  active:    { overdue: true, completed: true },// overdue sweep · Complete
  overdue:   { active: true, completed: true }, // late check-in clears the alarm · Complete
  completed: {},                                // terminal
};

export function canTransition(from, to) {
  return Boolean(TRANSITIONS[from] && TRANSITIONS[from][to]);
}

function toNotifyTrip(token, row, extra = {}) {
  return {
    ...row.data,
    id:                 row.id,
    shareToken:         token,
    expectedReturnTime: row.expectedReturnTime,
    creatorName:        row.creatorName,
    ...extra,
  };
}

// ── Transitions ───────────────────────────────────────────────────────────────

// planned -> active. Optionally replaces the embedded emergencyContacts snapshot
// (the post-create Recipient Picker hands over the final selection). Idempotent:
// a second /start on a non-planned trip is a no-op, not an error or a re-notify.
export async function start(token, { contacts = null } = {}, deps) {
  const { repo, broadcaster, notifier } = deps;
  const trip = await repo.getTrip(token);
  if (!trip) return { ok: false, reason: 'not_found' };
  if (trip.status !== 'planned') {
    return { ok: true, reason: 'noop', status: trip.status, alreadyStarted: true, notified: [], skipped: [] };
  }

  const updated = await repo.applyStart(token, contacts); // atomic WHERE status='planned'
  if (!updated) {
    // Lost the race to a concurrent start — re-read for the current status.
    const cur = await repo.getTrip(token);
    return { ok: true, reason: 'noop', status: cur ? cur.status : 'active', alreadyStarted: true, notified: [], skipped: [] };
  }

  broadcaster.broadcast(token, 'status', { status: 'active', startedAt: updated.startedAt });

  // Synchronous so the caller can return a delivery summary ("Notified N watchers").
  let summary = { notified: [], skipped: [] };
  try {
    const result = await notifier.notifyStart(toNotifyTrip(token, updated));
    if (result) summary = result;
  } catch (err) {
    console.error('notifyStart threw:', err.message);
  }
  return { ok: true, reason: 'ok', status: 'active', notified: summary.notified || [], skipped: summary.skipped || [] };
}

// Records a check-in. Legal only while active or overdue; a check-in on a planned or
// completed trip is rejected (illegal). On overdue it clears the alarm (-> active).
// The broadcast carries the resulting status so watchers don't have to infer it.
export async function recordCheckIn(token, checkIn, deps) {
  const { repo, broadcaster } = deps;
  const trip = await repo.getTrip(token);
  if (!trip) return { ok: false, reason: 'not_found' };
  if (trip.status !== 'active' && trip.status !== 'overdue') {
    return { ok: false, reason: 'illegal', status: trip.status };
  }

  const { timestamp, status } = await repo.insertCheckIn(trip.id, checkIn);
  broadcaster.broadcast(token, 'checkin', {
    timestamp,
    message:     checkIn.message ?? null,
    locationW3w: checkIn.locationW3w ?? null,
    lat:         Number.isFinite(checkIn.lat) ? checkIn.lat : null,
    lng:         Number.isFinite(checkIn.lng) ? checkIn.lng : null,
    status, // ← authoritative resulting status; the watcher view trusts this
  });
  return { ok: true, reason: 'ok', status, timestamp };
}

// active|overdue -> completed. `planned -> completed` is illegal (must start first).
// Idempotent: a second /complete is a no-op.
export async function complete(token, deps) {
  const { repo, broadcaster } = deps;
  const trip = await repo.getTrip(token);
  if (!trip) return { ok: false, reason: 'not_found' };
  if (trip.status === 'completed') {
    return { ok: true, reason: 'noop', status: 'completed', alreadyCompleted: true };
  }
  if (!canTransition(trip.status, 'completed')) {
    return { ok: false, reason: 'illegal', status: trip.status };
  }

  const updated = await repo.applyComplete(token); // atomic WHERE status IN ('active','overdue')
  if (!updated) {
    const cur = await repo.getTrip(token);
    if (cur && cur.status === 'completed') {
      return { ok: true, reason: 'noop', status: 'completed', alreadyCompleted: true };
    }
    return { ok: false, reason: 'illegal', status: cur ? cur.status : null };
  }

  broadcaster.broadcast(token, 'status', { status: 'completed', completedAt: new Date().toISOString() });
  return { ok: true, reason: 'ok', status: 'completed' };
}

// Clock-driven sweep: any active trip past expected_return_time + grace -> overdue.
// Each transition is atomic (WHERE status='active'); broadcasts + notifies per trip.
export async function sweepOverdue(deps) {
  const { repo, broadcaster, notifier, clock } = deps;
  const now = clock.now();
  const candidates = await repo.findOverdueCandidates();
  const transitioned = [];

  for (const row of candidates) {
    const returnTime = new Date(row.expectedReturnTime).getTime();
    if (now <= returnTime + OVERDUE_GRACE_MS) continue;

    const marked = await repo.applyOverdue(row.id); // atomic WHERE status='active'
    if (!marked) continue; // lost the race

    broadcaster.broadcast(row.shareToken, 'overdue', { overdueSince: marked.overdueSince, status: 'overdue' });
    transitioned.push(row.id);

    // Fire-and-forget — a failure logs but never blocks other trips in the sweep.
    Promise.resolve(
      notifier.notifyOverdue(toNotifyTrip(row.shareToken, row, { lastCheckIn: row.lastCheckIn }))
    ).catch(err => console.error('notifyOverdue threw:', err.message));
  }

  return { transitioned };
}

// ── Postgres adapter ──────────────────────────────────────────────────────────
// The production `repo`. Maps snake_case rows to the camelCase shape the module
// expects, and keeps every transition's guard in the SQL WHERE clause.
export function createDbRepo(db) {
  return {
    async getTrip(token) {
      const { rows } = await db.query(
        `SELECT t.id, t.status, t.data, t.expected_return_time, t.last_check_in, u.name AS creator_name
         FROM   triplinks t LEFT JOIN users u ON u.id = t.user_id
         WHERE  t.share_token = $1`,
        [token]
      );
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        id: r.id, status: r.status, data: r.data,
        expectedReturnTime: r.expected_return_time, lastCheckIn: r.last_check_in, creatorName: r.creator_name,
      };
    },

    async applyStart(token, contacts) {
      const cte = contacts
        ? `UPDATE triplinks
              SET status = 'active', started_at = NOW(),
                  data = jsonb_set(data, '{emergencyContacts}', $2::jsonb)
            WHERE share_token = $1 AND status = 'planned'
            RETURNING id, data, expected_return_time, user_id, started_at`
        : `UPDATE triplinks
              SET status = 'active', started_at = NOW()
            WHERE share_token = $1 AND status = 'planned'
            RETURNING id, data, expected_return_time, user_id, started_at`;
      const sql = `WITH updated AS (${cte})
        SELECT updated.id, updated.data, updated.expected_return_time, updated.started_at, u.name AS creator_name
        FROM   updated LEFT JOIN users u ON u.id = updated.user_id`;
      const params = contacts ? [token, JSON.stringify(contacts)] : [token];
      const { rows } = await db.query(sql, params);
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        id: r.id, data: r.data, expectedReturnTime: r.expected_return_time,
        creatorName: r.creator_name, startedAt: r.started_at,
      };
    },

    async insertCheckIn(tripId, c) {
      const numLat = Number.isFinite(c.lat) ? c.lat : null;
      const numLng = Number.isFinite(c.lng) ? c.lng : null;
      const { rows: ciRows } = await db.query(
        `INSERT INTO check_ins (trip_id, message, location_w3w, lat, lng)
         VALUES ($1, $2, $3, $4, $5) RETURNING checked_in_at`,
        [tripId, c.message || null, c.locationW3w || null, numLat, numLng]
      );
      const timestamp = ciRows[0].checked_in_at;
      const { rows: upd } = await db.query(
        `UPDATE triplinks
            SET last_check_in = $1,
                status        = CASE WHEN status = 'overdue' THEN 'active' ELSE status END,
                overdue_since = CASE WHEN status = 'overdue' THEN NULL ELSE overdue_since END
          WHERE id = $2
          RETURNING status`,
        [timestamp, tripId]
      );
      return { timestamp, status: upd[0] && upd[0].status };
    },

    async applyComplete(token) {
      const { rows } = await db.query(
        `UPDATE triplinks SET status = 'completed'
          WHERE share_token = $1 AND status IN ('active', 'overdue') RETURNING id`,
        [token]
      );
      return rows[0] || null;
    },

    async findOverdueCandidates() {
      const { rows } = await db.query(
        `SELECT t.id, t.share_token, t.expected_return_time, t.data, t.last_check_in, u.name AS creator_name
         FROM   triplinks t LEFT JOIN users u ON u.id = t.user_id
         WHERE  t.status = 'active' AND t.expected_return_time IS NOT NULL`
      );
      return rows.map(r => ({
        id: r.id, shareToken: r.share_token, expectedReturnTime: r.expected_return_time,
        data: r.data, lastCheckIn: r.last_check_in, creatorName: r.creator_name,
      }));
    },

    async applyOverdue(id) {
      const { rows } = await db.query(
        `UPDATE triplinks SET status = 'overdue', overdue_since = NOW()
          WHERE id = $1 AND status = 'active' RETURNING overdue_since`,
        [id]
      );
      if (rows.length === 0) return null;
      return { overdueSince: rows[0].overdue_since };
    },
  };
}
