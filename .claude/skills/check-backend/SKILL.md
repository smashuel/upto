---
name: check-backend
description: Check the health and status of the upto backend running on Linode
context: fork
---

# Check Upto Backend Status

Run diagnostics on the backend server at `172.105.178.48`.

## Checks to Perform

Run these commands and compile a status report:

1. **Health endpoint**: `curl -s --max-time 10 http://172.105.178.48/api/health`
2. **PM2 status**: `ssh root@172.105.178.48 "pm2 status"`
3. **PM2 recent logs** (last 30 lines): `ssh root@172.105.178.48 "pm2 logs upto-backend --lines 30 --nostream"`
4. **Nginx status**: `ssh root@172.105.178.48 "systemctl status nginx --no-pager -l"`
5. **Disk usage**: `ssh root@172.105.178.48 "df -h /"`
6. **Memory usage**: `ssh root@172.105.178.48 "free -h"`

## Report Format

Summarize findings as:
- **API Health**: UP/DOWN + response details
- **PM2 Process**: running/stopped/errored + uptime + restart count
- **Nginx**: active/inactive
- **Server Resources**: disk and memory usage
- **Recent Errors**: any errors from PM2 logs

Flag anything that looks problematic.
