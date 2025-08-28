# 🎬 Ultra 4K HDR Media Server

A professional-grade Node.js media server optimized for 4K HDR content streaming with modern UI and MKV support.

## ✨ Key Features

### 🚀 Enhanced MKV Support
- **Proper MIME Types**: Correct `video/x-matroska` MIME type handling
- **Dynamic Chunk Sizing**: Intelligent buffering based on file size (1MB to 5MB chunks)
- **Multiple Source Fallbacks**: MP4/WebM fallback sources for maximum compatibility
- **FFmpeg Integration**: Optional transcoding for problematic files

### 🎨 Modern UI Design
- **Glass Morphism**: Beautiful translucent interface with backdrop blur
- **Responsive Design**: Perfect on desktop, tablet, and mobile
- **Animated Background**: Floating gradient elements
- **Smart Detection**: Automatic 4K/8K/HDR/Dolby Vision badge detection
- **Statistics Dashboard**: Real-time content overview

### 🎥 Advanced Video Player
- **Custom Controls**: Professional video player with full keyboard support
- **Progress Seeking**: Click-to-seek on progress bar
- **Picture-in-Picture**: Modern PiP support for multitasking
- **Fallback Options**: Multiple playback strategies for incompatible formats
- **Auto-timeout**: Intelligent loading timeout with fallback options

### 📱 Mobile Optimized
- **Touch Friendly**: Large buttons and touch targets
- **Responsive Grid**: Adaptive layout for all screen sizes
- **Mobile Controls**: Optimized video controls for touch devices

## 🛠️ Installation & Setup

### Prerequisites
- Node.js 14+ 
- FFmpeg (optional, for transcoding support)
- Git (for deployment)
- systemd (for service management)

```bash
# Install prerequisites on Linux Mint/Ubuntu
sudo apt update
sudo apt install nodejs npm ffmpeg git

# Check installations
node --version
npm --version
ffmpeg -version
```

### 📥 Installation from Git Repository

#### 1. Clone the Repository
```bash
# Clone to desired location
sudo git clone <your-repo-url> /opt/stark-media-server
sudo chown -R stark:stark /opt/stark-media-server
cd /opt/stark-media-server
```

#### 2. Install Dependencies
```bash
# Install Node.js dependencies
npm install
```

#### 3. Configure the Server
Edit the configuration variables in `ultra_hdr_media_server.js`:

```javascript
const PORT = 8888;                          // Server port
const MEDIA_DIR = '/hdd-store/lan_films';   // Your media directory  
const CACHE_DIR = '/var/cache/stark-media-server';  // Transcoding cache
```

Or use environment variables (recommended for production):
```bash
export PORT=8888
export MEDIA_DIR=/path/to/your/media
export CACHE_DIR=/var/cache/stark-media-server
```

#### 4. Create Required Directories
```bash
# Create cache directory
sudo mkdir -p /var/cache/stark-media-server
sudo chown stark:stark /var/cache/stark-media-server

# Ensure media directory exists and is accessible
ls -la /hdd-store/lan_films  # Adjust path as needed
```

#### 5. Install as System Service
```bash
# Copy service file to systemd
sudo cp stark-media-server.service /etc/systemd/system/

# Reload systemd and enable the service
sudo systemctl daemon-reload
sudo systemctl enable stark-media-server.service

# Start the service
sudo systemctl start stark-media-server.service

# Check service status
sudo systemctl status stark-media-server.service
```

### 🚀 Quick Start (Development)
```bash
# For development/testing only
npm install
npm start

# Or run directly
node ultra_hdr_media_server.js
```

## 🔧 Configuration

Edit the configuration variables in `ultra_hdr_media_server.js`:

```javascript
const PORT = 8888;                          // Server port
const MEDIA_DIR = '/hdd-store/lan_films';   // Your media directory
const CACHE_DIR = '/tmp/media_cache';       // Transcoding cache
```

## 🎯 Performance Optimizations

### File Size Based Chunking
- **Small files** (<500MB): 1MB chunks
- **Medium files** (500MB-2GB): 2MB chunks  
- **Large files** (2GB-5GB): 3MB chunks
- **Very large files** (>5GB): 5MB chunks

### Cache Management
- Transcoded files cached for 24 hours
- Automatic cleanup of old cache files
- Smart cache file naming with MD5 hashing

## 🎮 Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play/Pause |
| `←` `→` | Seek ±10 seconds |
| `↑` `↓` | Volume up/down |
| `F` | Toggle fullscreen |
| `M` | Toggle mute |

## 🌐 Network Access

The server binds to `0.0.0.0:8888` for network access:
- **Local**: `http://localhost:8888`
- **Network**: `http://192.168.29.233:8888`
- **Mobile**: Accessible from any device on your network

## 📂 File Support

### Video Formats
| Format | Native Support | Transcoding |
|--------|----------------|-------------|
| MP4 | ✅ Full | ❌ Not needed |
| MKV | ⚠️ Limited | ✅ Available |
| WebM | ✅ Full | ❌ Not needed |
| AVI | ❌ None | ✅ Available |
| MOV | ✅ Full | ❌ Not needed |
| M2TS | ❌ None | ✅ Available |

### Quality Support
- **4K UHD** (3840×2160): Full support
- **8K UHD** (7680×4320): Full support  
- **HDR10**: Proper metadata handling
- **Dolby Vision**: Limited browser support
- **Dolby Atmos**: Audio passthrough

## 🔨 Troubleshooting

### MKV Files Won't Play
1. **Check browser compatibility**: Chrome/Firefox have limited MKV support
2. **Use fallback options**: Download or open in VLC
3. **Enable transcoding**: Install FFmpeg for automatic conversion
4. **Check file integrity**: Ensure file isn't corrupted

### Large Files Loading Slowly
1. **Network speed**: Check bandwidth between devices
2. **File size**: Very large files (>10GB) may need time to buffer
3. **Use range requests**: Browser automatically handles chunked loading
4. **Download locally**: For best experience with huge files

### 4K HDR Not Displaying Properly
1. **Monitor support**: Ensure display supports HDR
2. **Browser limitations**: Some browsers strip HDR metadata
3. **Use VLC**: Best option for true HDR playback
4. **Check source quality**: Verify original file has HDR

## 🚀 Advanced Usage

### Starting with Different Settings
```bash
# Custom port
PORT=9999 node ultra_hdr_media_server.js

# Custom media directory  
MEDIA_DIR=/path/to/movies node ultra_hdr_media_server.js

# Enable transcoding cache cleanup on start
CLEANUP_CACHE=true node ultra_hdr_media_server.js
```

### Transcode Management
```bash
# Clean up old transcoded files
npm run cleanup

# Check active transcodes
npm run transcode
```

## 📊 Monitoring

The server provides detailed console logging:
- Request logging with timestamps
- File size and chunk information
- Transcoding progress and completion
- Error tracking and debugging info

## 🔐 Security

- Path traversal protection
- Input sanitization
- Secure range request validation
- Network binding safety

## 🎯 Browser Compatibility

### Excellent Support
- **Chrome/Chromium**: Full features, hardware acceleration
- **Firefox**: Good support, some HDR limitations
- **Edge**: Full features, excellent performance

### Limited Support  
- **Safari**: Basic functionality, limited MKV support
- **Mobile browsers**: Good for most formats, download recommended for MKV

## 📈 Performance Tips

1. **SSD Storage**: Use SSD for media directory for best seek performance
2. **Network**: Gigabit Ethernet recommended for 4K streaming  
3. **Hardware**: More RAM helps with large file caching
4. **Browser**: Chrome typically offers best video performance

## 🛡️ Legal Notice

This server is intended for streaming your legally owned media content within your private network. Ensure compliance with copyright laws in your jurisdiction.

---

Built with ❤️ for the ultimate home cinema experience
