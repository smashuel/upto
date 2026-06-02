---
type: journal
date: 2026-05-27
tags: [incident, deployment, nginx, https, linode]
---

# 2026-05-27 — Vercel→Linode HTTPS proxy was silently broken

## Symptom

Google sign-in returned `502 BAD_GATEWAY` with Vercel error code `ROUTER_EXTERNAL_TARGET_CONNECTION_ERROR`. `https://upto.world/api/*` was failing despite direct curl to `http://172.105.178.48/api/health` returning 200.

## Root cause

Two-part:

1. **`vercel.json` proxies `/api/*` to `https://api.upto.world`** — has always pointed at HTTPS.
2. **The Linode never had a port-443 listener.** `nginx-config` in the repo only declares `listen 80`. Every `bash deploy.sh` runs `sudo cp $REMOTE_PATH/nginx-config /etc/nginx/sites-available/default && systemctl reload nginx` — which wipes out any 443 listener that might have been added by hand.

A Let's Encrypt cert for `api.upto.world` existed at `/etc/letsencrypt/live/api.upto.world/` (valid until 2026-07-07), but nginx wasn't using it. Probably issued via `certbot --nginx`, which edited the live config, which the next deploy overwrote.

## Why this wasn't caught earlier

Every Phase 1 / Phase 2 smoke test I ran went **direct to the Linode IP** (`curl http://172.105.178.48/api/...`), bypassing Vercel. The fullscreen-map verification fetched static assets from Vercel directly (no `/api/*` involved). Nothing exercised the `vercel→https://api.upto.world` path until the user tried to sign in with Google.

## Fix

Added a port-443 server block to [`nginx-config`](../../nginx-config) in the repo, alongside the existing port-80 block:

- `listen 443 ssl http2; listen [::]:443 ssl http2;` (old-style — `http2 on;` standalone is nginx 1.25+, which the box doesn't have)
- `ssl_certificate /etc/letsencrypt/live/api.upto.world/fullchain.pem`
- `ssl_certificate_key /etc/letsencrypt/live/api.upto.world/privkey.pem`
- `ssl_protocols TLSv1.2 TLSv1.3` + HSTS + modern session cache
- Same `/api/*` proxy as port 80, plus `proxy_buffering off` for SSE-friendliness
- Added an `^~ /.well-known/acme-challenge/` location on port 80 with `root /var/www/html` so future certbot renewals still work via webroot mode

Also added `api.upto.world` to the port-80 `server_name` so direct HTTP requests on that hostname are accepted.

## Verification

```
curl -sk https://api.upto.world/api/health        # 200
curl -sL https://upto.world/api/health            # 200 (Vercel → Linode HTTPS)
curl -sL -I https://www.upto.world/api/auth/google # 200
```

Google sign-in unblocked.

## Lessons (carry-forward)

- **The repo's `nginx-config` is the source of truth on Linode.** Any hand-edit to `/etc/nginx/sites-available/default` will be silently overwritten by the next deploy. If it matters, it goes in `nginx-config`.
- **Test the Vercel-proxied path explicitly, not just direct curl to the backend IP.** A 200 from `172.105.178.48/api/health` proves nothing about the `upto.world/api/*` pipeline. Use `curl -sL https://upto.world/api/health` (note the `-L` to follow the apex→www 307).
- **Cert renewal is webroot-mode** (certbot writes to `/var/www/html/.well-known/acme-challenge/`). The `^~ /.well-known/acme-challenge/` location now ensures the next renewal works through the new config.
- **Cert expiry 2026-07-07** — confirm renewal succeeds before then. If certbot's `renew` cron broke at some point, manual renewal: `ssh root@172.105.178.48 "certbot renew"`.

## Related

- [features/basemap-toggle.md](../features/basemap-toggle.md) — direct ArcGIS fetches; not affected by this
- [project/deployment.md](../project/deployment.md) — should grow a "TLS / HTTPS" subsection pointing at this fix
