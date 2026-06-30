---
type: journal
date: 2026-07-01
tags: [bug, timezone, triplinks, persistence, create-wizard]
---

# Expected return time displayed shifted by the viewer's UTC offset

## Symptom

Creating a TripLink with "Expected back by" 8:08am, the share link and TripLink view both
showed 18:08 / 6:08pm — a +10h shift. (+10 because the reporter is on Australian Eastern,
UTC+10; an NZ creator at UTC+12 would see +12 → 20:08.) `startDate` did **not** show the
shift, only `expectedReturnTime`.

## Root cause

`<input type="datetime-local">` yields a **zoneless wall-clock string** ("2026-07-01T08:08",
no offset/Z). The wizard stored it verbatim and the backend inserted it into the
`expected_return_time TIMESTAMPTZ` column ([backend-server.js](../../backend-server.js) — schema
~L69, insert ~L753). Postgres, given a timestamp with no offset for a `timestamptz`,
interprets it in the session timezone (UTC on Linode) and stores `08:08Z`, silently dropping
the creator's +10. Read back it serialises to `…08:08:00.000Z`; the frontend renders that
instant in the viewer's local zone → 18:08.

`startDate` escaped the shift only because it lives in the JSONB `data` blob, never a
`timestamptz` column, so it round-trips as the naive string and `new Date("…T08:08")` parses
it as local. That asymmetry (only the return time crosses the timestamptz boundary) is the
tell.

Not cosmetic: the 60s overdue sweep compares `expected_return_time` to real `now()`, so the
overdue alert fired ~10h off from intended — a safety bug.

## Fix

Convert the naive `datetime-local` value to an absolute instant at capture, in the browser's
local zone, before storing/sending ([CreateAdventure.tsx](../../src/pages/CreateAdventure.tsx)
`onSubmit`):

```ts
expectedReturnTime: data.expectedReturnTime ? new Date(data.expectedReturnTime).toISOString() : undefined,
startDate: data.startDate ? new Date(data.startDate).toISOString() : data.startDate,
```

`new Date("…T08:08")` parses zoneless as local → correct UTC `Z`; the timestamptz then stores
the right instant and it displays back correctly in any viewer's zone.

Fixes new trips only — rows already created carry the shifted instant; re-test with a fresh
trip.

## Invariant (candidate ADR)

**A `datetime-local` value is a zoneless wall-clock string — convert it to an absolute instant
(`new Date(v).toISOString()`) before it crosses any `TIMESTAMPTZ` / `new Date` boundary on the
server.** If this recurs elsewhere (e.g. a future schedule step), promote to an ADR.
