#!/bin/bash

# Ultra 4K HDR Media Server - Installation Script
# This script sets up the media server with proper permissions and systemd service

set -e

echo "🚀 Installing Ultra 4K HDR Media Server..."

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "❌ This script must be run as root (use sudo)"
    exit 1
fi

# Configuration
INSTALL_DIR="/opt/stark-media-server"
SERVICE_USER="stark"
SERVICE_GROUP="stark"
MEDIA_DIR="/hdd-store/lan_films"
CACHE_DIR="/var/cache/stark-media-server"

# Create user if doesn't exist
if ! id "$SERVICE_USER" &>/dev/null; then
    echo "👤 Creating user: $SERVICE_USER"
    useradd -r -s /bin/false -d "$INSTALL_DIR" "$SERVICE_USER"
fi

# Install Node.js if not present
if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
    apt-get install -y nodejs
fi

# Install FFmpeg if not present
if ! command -v ffmpeg &> /dev/null; then
    echo "🎥 Installing FFmpeg..."
    apt-get update
    apt-get install -y ffmpeg
fi

# Create directories
echo "📁 Creating directories..."
mkdir -p "$INSTALL_DIR"
mkdir -p "$CACHE_DIR"
mkdir -p "$MEDIA_DIR"

# Set permissions
echo "🔐 Setting permissions..."
chown -R "$SERVICE_USER:$SERVICE_GROUP" "$INSTALL_DIR"
chown "$SERVICE_USER:$SERVICE_GROUP" "$CACHE_DIR"
chmod 755 "$INSTALL_DIR"
chmod 755 "$CACHE_DIR"

# Install dependencies (if package.json exists)
if [ -f "$INSTALL_DIR/package.json" ]; then
    echo "📦 Installing Node.js dependencies..."
    cd "$INSTALL_DIR"
    sudo -u "$SERVICE_USER" npm install
fi

# Install systemd service
if [ -f "$INSTALL_DIR/stark-media-server.service" ]; then
    echo "⚙️  Installing systemd service..."
    cp "$INSTALL_DIR/stark-media-server.service" /etc/systemd/system/
    systemctl daemon-reload
    systemctl enable stark-media-server.service
fi

# Test connectivity
if [ -f "$INSTALL_DIR/test_connectivity.js" ]; then
    echo "🧪 Testing connectivity..."
    cd "$INSTALL_DIR"
    sudo -u "$SERVICE_USER" node test_connectivity.js
fi

echo ""
echo "✅ Installation completed!"
echo ""
echo "🎯 Next steps:"
echo "1. Place your media files in: $MEDIA_DIR"
echo "2. Start the service: sudo systemctl start stark-media-server.service"
echo "3. Check status: sudo systemctl status stark-media-server.service"
echo "4. View logs: sudo journalctl -u stark-media-server.service -f"
echo "5. Access server at: http://$(hostname -I | awk '{print $1}'):8888"
echo ""
echo "📖 For more information, see README.md"
