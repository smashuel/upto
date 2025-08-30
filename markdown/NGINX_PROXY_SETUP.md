# Nginx Proxy Setup for Upto Backend

## Architecture Overview

```
Vercel Frontend → http://172.105.178.48/api/health (port 80)
                     ↓
                 Nginx proxy
                     ↓  
             Node.js backend (port 3001)
```

## Fixed Configuration Issues

### ✅ Frontend API Configuration
- **Before**: `http://172.105.178.48:3001` (direct to backend)
- **After**: `http://172.105.178.48` (via Nginx proxy on port 80)
- **File**: `src/config/api.ts:7`

### ✅ Nginx Proxy Configuration
- **File**: `nginx-config` (deploy to `/etc/nginx/sites-available/default`)
- **Proxies**: All `/api/*` requests from port 80 to `localhost:3001`
- **CORS**: Configured for all Vercel domains

### ✅ Backend Server Configuration
- **Port**: 3001 with `0.0.0.0` binding ✅
- **CORS**: Updated to accept Nginx proxy headers
- **Health Check**: Now shows proxy header information

### ✅ Environment Variables
- **Production**: `http://172.105.178.48` (port 80 via Nginx)
- **Development**: `http://localhost:3001` (direct to backend)

## Deployment Steps

### 1. Deploy Nginx Configuration

```bash
# SSH to your Linode server
ssh root@172.105.178.48

# Backup existing config
sudo cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.backup

# Copy the new configuration
sudo nano /etc/nginx/sites-available/default
# (paste content from nginx-config file)

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
sudo systemctl enable nginx

# Check status
sudo systemctl status nginx
```

### 2. Verify Nginx is Running on Port 80

```bash

# Test direct access
curl http://172.105.178.48/
# Should return: {"status":"Upto API Server","message":"Use /api/* endpoints for API access"}
```

### 3. Update Backend Server

```bash
# Deploy updated backend-server.js
scp backend-server.js root@172.105.178.48:/opt/upto-backend/

# Restart backend with PM2
pm2 restart upto-backend

# Check backend is running on port 3001
pm2 status
```

### 4. Test the Full Proxy Chain

```bash
# Test health endpoint via Nginx proxy (port 80)
curl http://172.105.178.48/api/health

# Expected response:
{
  "status": "Backend connected successfully!",
  "server": "Linode",
  "port": 3001,
  "proxyHeaders": {
    "realIP": "YOUR_IP",
    "forwardedFor": "YOUR_IP",
    "forwardedProto": "http"
  },
  "timestamp": "2025-01-28T...",
  "environment": "production"
}

# Test direct backend access (should still work)
curl http://172.105.178.48:3001/api/health
```

### 5. Update Frontend Environment

```bash
# Copy updated environment file
cp .env.example .env

# For production deployment, set in Vercel dashboard:
VITE_API_PROD_URL=http://172.105.178.48
```

## Verification Checklist

### ✅ Port Configuration
- [ ] Nginx listening on port 80
- [ ] Backend listening on port 3001
- [ ] Frontend calls port 80 (production)
- [ ] Frontend calls port 3001 (development)

### ✅ Proxy Functionality  
- [ ] `/api/health` works via port 80
- [ ] `/api/trails/search` works via port 80
- [ ] `/api/adventures` works via port 80
- [ ] Proxy headers are passed correctly

### ✅ CORS Configuration
- [ ] Vercel domains allowed
- [ ] Nginx proxy headers allowed
- [ ] OPTIONS requests handled properly

### ✅ Security Headers
- [ ] X-Frame-Options set
- [ ] X-Content-Type-Options set  
- [ ] X-XSS-Protection set
- [ ] CORS headers properly configured

## Testing Commands

```bash
# Test all endpoints via Nginx proxy
curl http://172.105.178.48/api/health
curl http://172.105.178.48/api/trails/search?title=test&type=hiking
curl -X POST http://172.105.178.48/api/adventures -H "Content-Type: application/json" -d '{"test":"data"}'

# Test CORS preflight
curl -X OPTIONS http://172.105.178.48/api/health \
  -H "Origin: https://upto.world" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Content-Type"
```

## Troubleshooting

### Issue: Connection Refused
```bash
# Check if Nginx is running
sudo systemctl status nginx

# Check if backend is running  
pm2 status

# Check firewall
sudo ufw status
# Should show: 80/tcp ALLOW and 3001/tcp ALLOW
```

### Issue: 502 Bad Gateway
```bash
# Check Nginx error logs
sudo tail -f /var/log/nginx/error.log

# Check if backend is accessible from localhost
curl http://localhost:3001/api/health

# Restart both services
sudo systemctl restart nginx
pm2 restart upto-backend
```

### Issue: CORS Errors  
```bash
# Check if request origin is in CORS config
# Verify in backend-server.js corsOptions.origin array

# Check Nginx CORS headers
curl -H "Origin: https://upto.world" http://172.105.178.48/api/health -v
```

## Files Modified/Created

- ✅ **`src/config/api.ts`** - Updated to use port 80 for production
- ✅ **`backend-server.js`** - Added Nginx proxy CORS and headers
- ✅ **`.env.example`** - Updated production URLs to port 80  
- ✅ **`nginx-config`** - Complete Nginx configuration file
- ✅ **`markdown/NGINX_PROXY_SETUP.md`** - This documentation

## Expected Flow After Setup

1. **Vercel Frontend** makes API call to `http://172.105.178.48/api/health`
2. **Nginx (port 80)** receives request and proxies to `http://localhost:3001/api/health`
3. **Node.js Backend (port 3001)** processes request and returns response
4. **Nginx** forwards response back to Vercel Frontend
5. **Frontend** receives response with proper CORS headers

Your Nginx proxy setup is now ready for deployment! 🚀