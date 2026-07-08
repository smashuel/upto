---
date: 2026-07-08
tags: [deploy, linode, pm2, esm, live-location]
related: [deploy.sh, backend-server.js, brain/plans/live-location.md, brain/project/deployment.md]
---

# Deploy 502: bundle didn't include backend-server.js's sibling ESM modules

## Symptom
First deploy of the live-location backend (Slices 01–03) succeeded on the surface —
PM2 reported `online`, Nginx reloaded clean — but every request returned **502 Bad
Gateway**. PM2 showed a high restart count (crash-loop). Logs:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/opt/upto-backend/triplink-lifecycle.js'
imported from /opt/upto-backend/backend-server.js
```

## Root cause
`deploy.sh` builds the upload bundle from a **hardcoded `cp` list** (`backend-server.js`,
`notifications.js`, `backend-package.json`, `doc-sync.js`, `nginx-config`). But
`backend-server.js` imports **three** sibling ESM modules:

- `./notifications.js` — in the bundle ✓
- `./triplink-lifecycle.js` — **not** in the bundle ✗ (extracted lifecycle reducer)
- `./live-privacy.js` — **not** in the bundle ✗ (Slice 03's server guard)

Prod had been running the *old* pre-live-location `backend-server.js`, which imported
neither new module — so the gap was invisible until this first live-location deploy
replaced `backend-server.js` with a version that imports them. Node resolves ESM imports
eagerly at load, so a single missing sibling → boot throw → PM2 restart → loop → 502.

Contributing near-miss: the bundle drift was easy to miss because a multi-line
`import { … } from './triplink-lifecycle.js'` doesn't match a naive `^import .* from`
grep — the specifier is on the *closing* line.

## Fix
1. Added `cp triplink-lifecycle.js` and `cp live-privacy.js` to the bundle.
2. **Drift guard** after the copies: scan `backend-server.js` for every `from './x.js'`
   specifier and abort the deploy (before upload) if any isn't in `$TEMP_DIR`. So the
   next new sibling import fails loudly at deploy time with a clear message, instead of
   silently 502-ing in prod.

```sh
for mod in $(grep -oE "\./[a-zA-Z0-9_-]+\.js" backend-server.js | sort -u | sed 's|\./||'); do
    [ -f "$TEMP_DIR/$mod" ] || { print_error "…imports ./$mod but it's not in the bundle."; exit 1; }
done
```

Redeploy after the fix: health green, `PATCH /sharing` returns app-level 404/400 (guard
runs), PM2 stable (restart count stopped climbing).

## Invariant
**A deploy bundle assembled from a hardcoded file list is a standing liability — it
drifts the moment code gains a new local import.** Either derive the file set from the
code (what the guard now approximates) or assert the two agree before shipping. The
"deploy succeeded / PM2 online" signal is *not* proof the app serves traffic — always
verify a real endpoint (health + an actually-exercised route), never just the process
state. See [deployment.md](../project/deployment.md).
