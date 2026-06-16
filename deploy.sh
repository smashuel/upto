#!/bin/bash

# Upto Backend Deployment Script for Linode
# This script deploys the Node.js backend to your Linode server.
# Must run under bash (uses arrays, ${!var}, ${VAR@Q}). Run as `bash deploy.sh`
# or `./deploy.sh`, NOT `sh deploy.sh` (sh is dash on most Linuxes and breaks).

if [ -z "$BASH_VERSION" ]; then
    echo "ERROR: deploy.sh requires bash (got dash/sh). Run with:" >&2
    echo "  bash deploy.sh         # or" >&2
    echo "  ./deploy.sh            # if executable" >&2
    exit 1
fi

set -e  # Exit on any error

# Configuration
LINODE_IP="172.105.178.48"
LINODE_USER="root"  # Change if you use a different user
PROJECT_NAME="upto-backend"
REMOTE_PATH="/opt/$PROJECT_NAME"
BACKEND_PORT="3001"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "backend-server.js" ]; then
    print_error "backend-server.js not found. Make sure you're in the project root directory."
    exit 1
fi

# Auto-source .env if present, so the deployer doesn't have to remember to
# `export` everything in their shell. .env is gitignored. Bash itself doesn't
# read .env files — this is the bridge.
if [ -f .env ]; then
    set -a
    # shellcheck disable=SC1091
    source .env
    set +a
    print_status "Loaded env from ./.env"
fi

# Pre-flight: required env vars must be set (either in the shell or in .env above).
# These are interpolated into the on-server .env at deploy time — never into git.
REQUIRED_VARS=(
    DATABASE_URL
    GOOGLE_CLIENT_ID
    GOOGLE_CLIENT_SECRET
    BACKEND_URL
    DOC_API_KEY
    LINZ_LDS_API_KEY
)
MISSING=()
for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        MISSING+=("$var")
    fi
done
if [ ${#MISSING[@]} -ne 0 ]; then
    print_error "Missing required env vars: ${MISSING[*]}"
    echo ""
    echo "Set them in your shell before deploying. Example:"
    echo "  export DATABASE_URL='postgresql://upto_user:<password>@127.0.0.1:5432/upto_db'"
    echo "  export GOOGLE_CLIENT_ID='...'"
    echo "  export GOOGLE_CLIENT_SECRET='...'"
    echo "  export BACKEND_URL='https://upto.world'"
    echo "  export DOC_API_KEY='...'"
    echo "  export LINZ_LDS_API_KEY='...'"
    exit 1
fi
print_success "All required env vars present"

# Check SSH connection
print_status "Testing SSH connection to Linode server..."
if ! ssh -o ConnectTimeout=10 -o BatchMode=yes "$LINODE_USER@$LINODE_IP" exit 2>/dev/null; then
    print_error "Cannot connect to $LINODE_IP. Please check:"
    echo "  1. SSH key is added to the server"
    echo "  2. Server IP is correct"
    echo "  3. Server is running"
    exit 1
fi
print_success "SSH connection successful"

# Create backend package.json if it doesn't exist
if [ ! -f "backend-package.json" ]; then
    print_status "Creating backend package.json..."
    cat > backend-package.json << 'EOF'
{
  "name": "upto-backend",
  "version": "1.0.0",
  "description": "Upto Adventure Planning Backend API",
  "main": "backend-server.js",
  "type": "module",
  "scripts": {
    "start": "node backend-server.js",
    "dev": "node --watch backend-server.js",
    "pm2:start": "pm2 start backend-server.js --name upto-backend",
    "pm2:restart": "pm2 restart upto-backend",
    "pm2:stop": "pm2 stop upto-backend",
    "pm2:logs": "pm2 logs upto-backend"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5"
  },
  "keywords": ["adventure", "planning", "api", "hiking", "trails"],
  "author": "Upto Team",
  "license": "MIT"
}
EOF
    print_success "Created backend-package.json"
fi

# Create deployment bundle
print_status "Creating deployment bundle..."
TEMP_DIR=$(mktemp -d)
cp backend-server.js "$TEMP_DIR/"
cp notifications.js "$TEMP_DIR/"
cp backend-package.json "$TEMP_DIR/package.json"
cp doc-sync.js "$TEMP_DIR/"
cp nginx-config "$TEMP_DIR/"

# Create PM2 ecosystem file. No secrets inline — they live in ./env on Linode,
# sourced by start.sh before PM2 reads process.env.
cat > "$TEMP_DIR/ecosystem.config.cjs" << EOF
module.exports = {
  apps: [{
    name: 'upto-backend',
    script: 'backend-server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: $BACKEND_PORT,
      DOC_API_KEY:          process.env.DOC_API_KEY || '',
      DATABASE_URL:         process.env.DATABASE_URL || '',
      GOOGLE_CLIENT_ID:     process.env.GOOGLE_CLIENT_ID || '',
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
      BACKEND_URL:          process.env.BACKEND_URL || '',
      FRONTEND_URL:         process.env.FRONTEND_URL || '',
      LINZ_LDS_API_KEY:     process.env.LINZ_LDS_API_KEY || '',
      TWILIO_ACCOUNT_SID:   process.env.TWILIO_ACCOUNT_SID || '',
      TWILIO_AUTH_TOKEN:    process.env.TWILIO_AUTH_TOKEN || '',
      TWILIO_PHONE_NUMBER:  process.env.TWILIO_PHONE_NUMBER || '',
      RESEND_API_KEY:       process.env.RESEND_API_KEY || '',
      RESEND_FROM:          process.env.RESEND_FROM || ''
    },
    error_file: '/var/log/pm2/upto-backend-error.log',
    out_file: '/var/log/pm2/upto-backend-out.log',
    log_file: '/var/log/pm2/upto-backend-combined.log'
  }]
};
EOF

# Write a .env bundle from the deployer's shell. This is the only place the
# secrets touch disk — uploaded to /opt/upto-backend/.env, sourced by start.sh.
# ${VAR@Q} quotes values safely so `source` re-reads them verbatim even if
# they contain $, `, or spaces. Requires bash 4.4+.
{
    echo "DATABASE_URL=${DATABASE_URL@Q}"
    echo "GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID@Q}"
    echo "GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET@Q}"
    echo "BACKEND_URL=${BACKEND_URL@Q}"
    [ -n "${FRONTEND_URL-}"         ] && echo "FRONTEND_URL=${FRONTEND_URL@Q}"
    echo "DOC_API_KEY=${DOC_API_KEY@Q}"
    echo "LINZ_LDS_API_KEY=${LINZ_LDS_API_KEY@Q}"
    # Notification provider creds are optional — if absent, notifications.js runs
    # in stub mode (logs would-have-sent messages instead of calling the API).
    # Wire creds in later without redeploying any code.
    [ -n "${TWILIO_ACCOUNT_SID-}"   ] && echo "TWILIO_ACCOUNT_SID=${TWILIO_ACCOUNT_SID@Q}"
    [ -n "${TWILIO_AUTH_TOKEN-}"    ] && echo "TWILIO_AUTH_TOKEN=${TWILIO_AUTH_TOKEN@Q}"
    [ -n "${TWILIO_PHONE_NUMBER-}"  ] && echo "TWILIO_PHONE_NUMBER=${TWILIO_PHONE_NUMBER@Q}"
    [ -n "${RESEND_API_KEY-}"       ] && echo "RESEND_API_KEY=${RESEND_API_KEY@Q}"
    [ -n "${RESEND_FROM-}"          ] && echo "RESEND_FROM=${RESEND_FROM@Q}"
} > "$TEMP_DIR/.env"
chmod 600 "$TEMP_DIR/.env"

# Create startup script
cat > "$TEMP_DIR/start.sh" << 'EOF'
#!/bin/bash
set -e

if [ ! -f ./.env ]; then
    echo "ERROR: .env not found in $(pwd). deploy.sh must upload it." >&2
    exit 1
fi

echo "Loading env from ./.env..."
set -a
# shellcheck disable=SC1091
source ./.env
set +a

if [ -z "$DATABASE_URL" ]; then
    echo "ERROR: DATABASE_URL still empty after sourcing .env" >&2
    exit 1
fi

echo "Creating data directory for DOC cache..."
mkdir -p ./data

echo "Installing dependencies..."
npm install --production

echo "Starting application with PM2..."
# --update-env so a rotated secret in .env propagates on restart, not just on cold start
pm2 restart upto-backend --update-env 2>/dev/null || pm2 start ecosystem.config.cjs --update-env

echo "Saving PM2 process list..."
pm2 save

# Only configure PM2 boot-persistence once. After the first successful deploy
# the systemd unit exists; re-running `pm2 startup | tail -1 | sudo bash`
# emits noise like `$: command not found` for no benefit.
if [ ! -f /etc/systemd/system/pm2-root.service ]; then
    echo "Configuring PM2 to start on boot..."
    pm2 startup systemd -u root --hp /root | tail -1 | sudo bash
else
    echo "PM2 boot-persistence already configured — skipping."
fi

echo "Backend deployment complete!"
echo "Use 'pm2 logs upto-backend' to view logs"
echo "Use 'pm2 restart upto-backend --update-env' to restart (preserves rotated env)"
EOF

chmod +x "$TEMP_DIR/start.sh"

print_success "Deployment bundle created"

# Upload files to server
print_status "Uploading files to Linode server..."
ssh "$LINODE_USER@$LINODE_IP" "mkdir -p $REMOTE_PATH"
# Glob (*) skips dotfiles by default — .env is uploaded explicitly below
scp -r "$TEMP_DIR"/* "$LINODE_USER@$LINODE_IP:$REMOTE_PATH/"
scp "$TEMP_DIR/.env" "$LINODE_USER@$LINODE_IP:$REMOTE_PATH/.env"
ssh "$LINODE_USER@$LINODE_IP" "chmod 600 $REMOTE_PATH/.env"

# Install Node.js and PM2 if not present
print_status "Setting up Node.js environment..."
ssh "$LINODE_USER@$LINODE_IP" << 'EOF'
# Install Node.js 20 if not present
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Install PM2 globally if not present
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    sudo npm install -g pm2
fi

# Create log directory
sudo mkdir -p /var/log/pm2
sudo chown -R $USER:$USER /var/log/pm2
EOF

# Deploy and start the application
print_status "Deploying application..."
ssh "$LINODE_USER@$LINODE_IP" << EOF
cd $REMOTE_PATH
./start.sh
EOF

# Update Nginx configuration
print_status "Updating Nginx configuration..."
ssh "$LINODE_USER@$LINODE_IP" << EOF
# Backup existing nginx config
sudo cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.backup.\$(date +%Y%m%d_%H%M%S)

# Copy new config
sudo cp $REMOTE_PATH/nginx-config /etc/nginx/sites-available/default

# Test nginx configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx

echo "Nginx configuration updated and reloaded"
EOF

# Clean up
rm -rf "$TEMP_DIR"

# Test the deployment
print_status "Testing deployment..."
sleep 5  # Give the server a moment to start

if curl -f -s "http://$LINODE_IP/api/health" > /dev/null; then
    print_success "Backend is responding successfully!"
    echo ""
    echo "Deployment Summary:"
    echo "=================="
    echo "🚀 Backend URL: http://$LINODE_IP"
    echo "🏥 Health Check: http://$LINODE_IP/api/health"
    echo "📂 Remote Path: $REMOTE_PATH"
    echo "🔧 PM2 Commands:"
    echo "   - View logs: ssh $LINODE_USER@$LINODE_IP 'pm2 logs upto-backend'"
    echo "   - Restart: ssh $LINODE_USER@$LINODE_IP 'pm2 restart upto-backend'"
    echo "   - Status: ssh $LINODE_USER@$LINODE_IP 'pm2 status'"
    echo ""
    print_success "Deployment completed successfully! 🎉"
else
    print_warning "Backend deployment completed but health check failed."
    echo "Check the logs with: ssh $LINODE_USER@$LINODE_IP 'pm2 logs upto-backend'"
fi