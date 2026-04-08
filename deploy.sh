#!/bin/bash

# Upto Backend Deployment Script for Linode
# This script deploys the Node.js backend to your Linode server

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
cp backend-package.json "$TEMP_DIR/package.json"
cp doc-sync.js "$TEMP_DIR/"
cp nginx-config "$TEMP_DIR/"

# Create PM2 ecosystem file
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
      DOC_API_KEY: process.env.DOC_API_KEY || '',
      DATABASE_URL: 'postgresql://upto_user:Rowdy050@127.0.0.1:5432/upto_db',
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
      BACKEND_URL: 'http://172.105.178.48',
      LINZ_LDS_API_KEY: process.env.LINZ_LDS_API_KEY || '8791473b7ddc43d5a011794bc5615247'
    },
    error_file: '/var/log/pm2/upto-backend-error.log',
    out_file: '/var/log/pm2/upto-backend-out.log',
    log_file: '/var/log/pm2/upto-backend-combined.log'
  }]
};
EOF

# Create startup script
cat > "$TEMP_DIR/start.sh" << 'EOF'
#!/bin/bash
set -e

echo "Creating data directory for DOC cache..."
mkdir -p ./data

echo "Installing dependencies..."
npm install --production

echo "Starting application with PM2..."
pm2 restart upto-backend 2>/dev/null || pm2 start ecosystem.config.cjs

echo "Setting up PM2 to start on boot..."
pm2 save
pm2 startup | tail -1 | sudo bash

echo "Backend deployment complete!"
echo "Use 'pm2 logs upto-backend' to view logs"
echo "Use 'pm2 restart upto-backend' to restart"
EOF

chmod +x "$TEMP_DIR/start.sh"

print_success "Deployment bundle created"

# Upload files to server
print_status "Uploading files to Linode server..."
ssh "$LINODE_USER@$LINODE_IP" "mkdir -p $REMOTE_PATH"
scp -r "$TEMP_DIR"/* "$LINODE_USER@$LINODE_IP:$REMOTE_PATH/"

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