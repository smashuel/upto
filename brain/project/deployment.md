---
type: project
status: shipped
tags: [deployment, infra, vercel, linode, nginx, pm2]
---

# Deployment

Condensed from the old `markdown/DEPLOYMENT_SETUP.md` + `markdown/NGINX_PROXY_SETUP.md`. For the day-to-day deploy flow, use the `/deploy` skill and `/check-backend` skill.

## Architecture

```
Browser → Vercel (upto.world)
          │
          ├── Static React build (Vite)
          │
          └── /api/* rewritten via vercel.json →
              │
              Linode 172.105.178.48 (port 80)
              │
              Nginx → localhost:3001
                      │
                      Express backend (PM2)
                      │
                      ├── JSON cache at ./data/
                      └── External APIs: DOC, OSM, Nominatim, LINZ, w3w
```

## Frontend — Vercel

| Setting | Value |
|---------|-------|
| Production domain | `upto.world` |
| Preview domain | `upto-six.vercel.app` |
| Framework | Vite (React + TypeScript) |
| Config file | `vercel.json` (rewrites + SPA fallback) |
| Deploy trigger | Push to `main` |

`/api/*` routes are rewritten to `https://api.upto.world/$1` (which resolves to the Linode box). See commits `b82fbba`, `6e0ee9e`, `d99ca5c`, `58e4f84` for the proxy setup history — the serverless-function approach was replaced with a pure Vercel rewrite.

Vercel env vars are managed in the Vercel dashboard (not pulled locally unless you install the CLI: `npm i -g vercel`).

## Backend — Linode

| Setting | Value |
|---------|-------|
| IP | `172.105.178.48` |
| SSH | `ssh root@172.105.178.48` |
| App dir | `/opt/upto-backend/` |
| Process manager | PM2 (`ecosystem.config.js`) |
| Reverse proxy | Nginx on port 80 → `localhost:3001` |
| Node entry | `backend-server.js` |
| Backend deps | `backend-package.json` (separate from the frontend `package.json`) |

### Deploying backend changes

Use the `/deploy` skill — it does the pre-flight (TypeScript, SSH reachability, git status) and then runs `deploy.sh`, which scps `backend-server.js` + its sibling ESM modules (`notifications.js`, `triplink-lifecycle.js`, `live-privacy.js`) + `doc-sync.js` + `backend-package.json` + an `.env` generated from the deployer's shell, then PM2-restarts with `--update-env`.

> **Bundle must include every `from './x.js'` sibling `backend-server.js` imports**, or the server crash-loops on boot with `ERR_MODULE_NOT_FOUND` and every request 502s (PM2 still reports `online`). `deploy.sh` now has a drift guard that aborts before upload if an import is missing — but if you add a new backend module, add its `cp` line too. Always verify a real endpoint after deploy, not just PM2 status. See [journal 2026-07-08](../journal/2026-07-08-deploy-bundle-missing-sibling-modules.md).

`deploy.sh` requires these env vars in the deploying shell and will fail-fast if missing: `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BACKEND_URL`, `DOC_API_KEY`, `LINZ_LDS_API_KEY`. They are written to `/opt/upto-backend/.env` (mode 0600) on the server — never embedded in the script or committed to git.

### Rotating secrets (DB password, API keys)

Any secret that leaks into git (or is suspected to) must be rotated on the host — removing it from current HEAD doesn't erase history. Use this runbook.

**DB password rotation** (this was done once already when cleaning up the plaintext fallback; repeat if the password is ever exposed again):

```bash
# 1. Generate a strong password
NEW_PASS=$(openssl rand -hex 24)
echo "$NEW_PASS"   # save this somewhere — password manager, not chat history

# 2. Rotate in Postgres on Linode
ssh root@172.105.178.48 "sudo -u postgres psql -c \"ALTER USER upto_user WITH PASSWORD '$NEW_PASS';\""

# 3. Update the deploying shell
export DATABASE_URL="postgresql://upto_user:$NEW_PASS@127.0.0.1:5432/upto_db"

# 4. Re-deploy so /opt/upto-backend/.env + PM2 env both pick up the new value
sh deploy.sh
```

After step 4, PM2 restarts with `--update-env`, so the running process picks up the rotated secret without a cold start. Verify with `ssh root@172.105.178.48 "pm2 env 0 | grep DATABASE_URL"`.

**Other API keys** (DOC, LINZ, Google OAuth): same shape — rotate upstream (DOC portal / LINZ account / Google Cloud console), export the new value in your deploy shell, `sh deploy.sh`.

### Firewall

- `80/tcp` open (Nginx / public API entrypoint)
- `3001/tcp` open (direct backend access — useful for debugging)
- `22/tcp` open (SSH)

## Nginx

`nginx-config` (in repo root) is deployed to `/etc/nginx/sites-available/default`.

- Listens on port 80
- Proxies `/api/*` to `http://localhost:3001/api/*`
- Forwards `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`
- CORS headers allow `upto.world`, `upto-six.vercel.app`, `localhost:5173`, `localhost:3000`

After editing nginx-config on the server:
```bash
sudo nginx -t && sudo systemctl restart nginx
```

## PM2

```bash
pm2 status                 # current processes
pm2 logs upto-backend      # tail logs
pm2 restart upto-backend   # restart after deploy
pm2 startup && pm2 save    # persist across reboots
```

The `/check-backend` skill automates these plus `curl /api/health` + disk/memory checks.

## Env vars

See [CLAUDE.md](../../CLAUDE.md) "Environment Variables" section — authoritative list. Reproduced here for offline readability:

**Frontend** (`.env`, Vite `VITE_` prefix):
- `VITE_API_BASE_URL` — production backend URL (`http://172.105.178.48`)
- `VITE_DEV_API_URL` — dev backend URL (`http://localhost:3001`)
- `VITE_WHAT3WORDS_API_KEY`
- `VITE_CESIUM_ION_TOKEN`
- `VITE_LINZ_LDS_API_KEY` (fallback only; prefer server-side)

**Backend** (sourced from `/opt/upto-backend/.env` by `start.sh`, then PM2 holds the env in memory):
- `PORT=3001`
- `NODE_ENV=production`
- `DATABASE_URL` — Postgres connection string; **required**, backend throws on startup if missing
- `DOC_API_KEY` — NZ Department of Conservation
- `LINZ_LDS_API_KEY` — LINZ Topo50 tile proxy
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — Google OAuth
- `BACKEND_URL` — origin used in the OAuth callback redirect URL (production uses `https://upto.world` — OAuth flows go via the Vercel proxy)

## Health checks

```bash
curl http://172.105.178.48/api/health            # via Nginx (what the frontend uses)
curl http://172.105.178.48:3001/api/health        # direct to Express (bypasses Nginx)
```

Either should return `{ status: "Backend connected successfully!", server: "Linode", ... }`.

## Common issues

- **502 Bad Gateway** — backend is down; `pm2 restart upto-backend`, check `pm2 logs`
- **CORS errors** — origin not in `corsOptions.origin` in `backend-server.js`; update + redeploy
- **Env var not picked up** — PM2 caches env; use `pm2 restart upto-backend --update-env` or `pm2 reload`
- **Tile proxy fails** — `LINZ_LDS_API_KEY` missing or expired on the Linode box; check `pm2 env 0`

## TLS / HTTPS

Linode serves both `http://172.105.178.48` (port 80, direct-IP access + ACME challenges) and `https://api.upto.world` (port 443, the hostname Vercel proxies through). Both are configured in [`nginx-config`](../../nginx-config) in the repo — **anything edited live on the box is overwritten on the next deploy**.

- Cert: Let's Encrypt for `api.upto.world` at `/etc/letsencrypt/live/api.upto.world/`. Auto-renewed by certbot (webroot mode, uses `/var/www/html/.well-known/acme-challenge/`).
- The port-80 block includes `location ^~ /.well-known/acme-challenge/` so renewals don't break.
- The port-443 block uses `listen 443 ssl http2;` (old-style — `http2 on;` standalone needs nginx 1.25+).

Verify the full pipeline (not just the IP):
```bash
curl -sL https://upto.world/api/health   # Vercel→Linode HTTPS
curl -sk https://api.upto.world/api/health
```

See [journal/2026-05-27-https-on-linode.md](../journal/2026-05-27-https-on-linode.md) for the incident that taught us this.

## Not yet set up

- CI (no automated tests; `/build-check` skill is the manual substitute)
- Rate-limiting on capability-guarded TripLink endpoints — see [plans/persistence-and-auth.md](../plans/persistence-and-auth.md) Phase 1 tail
