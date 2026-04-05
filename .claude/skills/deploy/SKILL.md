---
name: deploy
description: Deploy the upto backend to the Linode VPS at 172.105.178.48
disable-model-invocation: true
argument-hint: "[--skip-build]"
---

# Deploy Upto Backend

Deploy the Express.js backend to the Linode VPS using the project's deploy script.

## Pre-flight Checks

Before deploying, verify:
1. Run `npx tsc --noEmit` to confirm no TypeScript errors
2. Test the SSH connection: `ssh -o ConnectTimeout=5 root@172.105.178.48 echo "SSH OK"`
3. Check if there are uncommitted changes with `git status` and warn the user

## Deploy

Run the deployment script:
```bash
sh deploy.sh
```

The script handles:
- SSH connection test
- Creating deployment bundle (backend-server.js, backend-package.json, nginx-config, ecosystem.config.js)
- Uploading to `/opt/upto-backend/` on Linode
- Installing dependencies, restarting PM2, reloading Nginx
- Health check verification at `http://172.105.178.48/api/health`

## Post-deploy

After deployment completes:
1. Verify health endpoint: `curl -s http://172.105.178.48/api/health | jq .`
2. Report the deployment result to the user

If $ARGUMENTS contains "--skip-build", skip the TypeScript check.
