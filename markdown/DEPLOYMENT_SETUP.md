# Upto Deployment Architecture Setup

## Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Your Users    │────│  Vercel CDN      │────│  React App      │
│  (Browsers)     │    │  (Frontend)      │    │  (Static Files) │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                │ API calls to your backend
                                ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │  Linode Server   │────│  External APIs  │
                       │  (Your Backend)  │    │ • Trailforks    │
                       │  • Node.js API   │    │ • OSM Overpass  │
                       │  • PostgreSQL    │    │ • Hiking Project│
                       │  • CORS enabled  │    │ • MapTiler      │
                       └──────────────────┘    └─────────────────┘
```

## Current Configuration

### Frontend (Vercel)
- **Production URL**: https://upto.world
- **Vercel URL**: https://upto-six.vercel.app
- **Framework**: React + Vite + TypeScript
- **Deployment**: Automatic via Vercel (configured in `vercel.json`)

### Backend (Linode)
- **Server IP**: 172.105.178.48
- **Port**: 3001 (configurable via PORT env var)
- **Framework**: Express.js
- **CORS**: Configured for all your domains

## Setup Steps

### 1. Linode Server Setup

#### Install Dependencies
```bash
# Connect to your Linode server
ssh root@172.105.178.48

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 for process management
npm install -g pm2

# Create application directory
mkdir -p /opt/upto-backend
cd /opt/upto-backend
```

#### Deploy Backend Code
```bash
# Copy your backend files to the server
scp backend-server.js root@172.105.178.48:/opt/upto-backend/
scp package.json root@172.105.178.48:/opt/upto-backend/

# On the server, install dependencies
cd /opt/upto-backend
npm install express cors

# Start with PM2
pm2 start backend-server.js --name upto-backend
pm2 startup
pm2 save
```

#### Configure Firewall
```bash
# Open port 3001 for your backend
sudo ufw allow 3001/tcp
sudo ufw status
```

### 2. Environment Variables

#### Frontend (.env)
Create `.env` file based on `.env.example`:
```bash
cp .env.example .env
```

Update the values in `.env`:
```env
VITE_API_BASE_URL=http://172.105.178.48:3001
VITE_API_PROD_URL=http://172.105.178.48:3001
VITE_WHAT3WORDS_API_KEY=your_actual_key_here
VITE_TRAILFORKS_API_KEY=your_trailforks_key_here
VITE_MAPTILER_API_KEY=your_maptiler_key_here
```

#### Backend Environment
On your Linode server, create `/opt/upto-backend/.env`:
```env
NODE_ENV=production
PORT=3001
```

### 3. Testing the Connection

#### Test Backend Health
```bash
# From your local machine
curl http://172.105.178.48:3001/api/health
```

Expected response:
```json
{
  "status": "Backend connected successfully!",
  "server": "Linode",
  "timestamp": "2025-01-28T...",
  "environment": "production"
}
```

#### Test Frontend Connection
Use the `ApiClient` in your React components:
```typescript
import { apiClient } from '@/config/api';

// Test connection in a component
const testBackend = async () => {
  try {
    const isConnected = await apiClient.testConnection();
    console.log('Backend connected:', isConnected);
  } catch (error) {
    console.error('Backend connection failed:', error);
  }
};
```

## Integration Points

### 1. GlobalTrailService Integration
Your existing `GlobalTrailService.ts` should use the new API client:

```typescript
import { apiClient, API_CONFIG } from '@/config/api';

// In GlobalTrailService.ts, update the backend calls:
async searchBackendRoutes(title: string, type: string, location?: string) {
  return apiClient.get(
    `${API_CONFIG.ENDPOINTS.TRAILS_SEARCH}?title=${title}&type=${type}&location=${location}`
  );
}
```

### 2. Adventure Sharing
Your adventure sharing components can now save to the backend:

```typescript
import { apiClient, API_CONFIG } from '@/config/api';

// Save adventure
const saveAdventure = async (adventureData) => {
  return apiClient.post(API_CONFIG.ENDPOINTS.ADVENTURES, adventureData);
};

// Load shared adventure
const loadAdventure = async (id: string) => {
  return apiClient.get(API_CONFIG.ENDPOINTS.ADVENTURE_BY_ID(id));
};
```

## Security Considerations

### CORS Configuration
✅ **Configured domains**:
- `https://upto.world` (production)
- `https://upto-six.vercel.app` (vercel)
- `http://localhost:5173` (development)
- `http://localhost:3000` (alternative dev)

### API Keys
- Frontend keys are visible to users (use restricted keys)
- Backend should handle sensitive API operations
- Never commit actual keys to git

## Database Setup (Future)

When ready to add PostgreSQL:

```bash
# On Linode server
sudo apt update
sudo apt install postgresql postgresql-contrib

# Create database and user
sudo -u postgres psql
CREATE DATABASE upto_db;
CREATE USER upto_user WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE upto_db TO upto_user;
```

Update backend with database connection:
```javascript
const { Pool } = require('pg');

const pool = new Pool({
  user: 'upto_user',
  host: 'localhost',
  database: 'upto_db',
  password: 'secure_password',
  port: 5432,
});
```

## Troubleshooting

### Common Issues

#### 1. CORS Errors
- Verify your domain is in the `corsOptions.origin` array
- Check that the backend is running on the correct port
- Ensure the frontend is using the correct API URL

#### 2. Connection Refused
- Check if the backend server is running: `pm2 status`
- Verify firewall allows port 3001: `sudo ufw status`
- Test direct connection: `curl http://172.105.178.48:3001/api/health`

#### 3. Environment Variables Not Working
- Restart the development server after changing `.env`
- For Vercel deployment, add environment variables in the Vercel dashboard
- Ensure variables start with `VITE_` for frontend access

### Useful Commands

```bash
# Backend management
pm2 status                    # Check backend status
pm2 logs upto-backend        # View backend logs
pm2 restart upto-backend     # Restart backend

# Development
npm run dev                  # Start frontend development
npm run build                # Build for production
npm run preview             # Test production build locally

# Testing
curl http://172.105.178.48:3001/api/health  # Test backend
npm run lint                                 # Check code quality
```

## Next Steps

1. **Deploy backend**: Copy `backend-server.js` to your Linode server
2. **Set environment variables**: Update `.env` with your actual API keys
3. **Test connection**: Use the health check endpoint
4. **Integrate with existing services**: Update `GlobalTrailService.ts` to use the new API client
5. **Add database**: When ready for data persistence

## Files Created/Modified

- ✅ `backend-server.js` - Production backend server
- ✅ `.env.example` - Updated with all required environment variables
- ✅ `src/config/api.ts` - Frontend API client configuration
- ✅ `markdown/DEPLOYMENT_SETUP.md` - This documentation

Your architecture is now ready for the Vercel Frontend + Linode Backend setup!