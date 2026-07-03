/**
 * Module-level registry of route settlements in flight (finish / edit-commit
 * waiting for true terrain heights, bounded at the drawer's settle timeout).
 *
 * Exists so the trip wizard's submit — several component layers away from the
 * lazy-mounted map — can wait out a pending settle instead of persisting a
 * TripLink without the route the user just finished. TrackDrawer calls
 * begin/end around every settlement; CreateAdventure awaits routesSettled()
 * before reading the form's routes.
 */

let pending = 0;
let waiters: Array<() => void> = [];

export function beginRouteSettle(): void {
  pending++;
}

export function endRouteSettle(): void {
  pending = Math.max(0, pending - 1);
  if (pending === 0) {
    const toResolve = waiters;
    waiters = [];
    for (const resolve of toResolve) resolve();
  }
}

export function hasPendingRouteSettles(): boolean {
  return pending > 0;
}

/**
 * Resolves once no settlement is in flight (immediately if none). The timeout
 * is a safety net over the drawer's own hard settle bound — the wizard submit
 * must never hang on a stuck settlement.
 */
export function routesSettled(timeoutMs = 12000): Promise<void> {
  if (pending === 0) return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(resolve, timeoutMs);
    waiters.push(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/** Test hook — a stranded settlement must not leak pending state across tests. */
export function resetRouteSettlement(): void {
  pending = 0;
  waiters = [];
}
