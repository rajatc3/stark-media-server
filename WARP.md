# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

Ultra 4K HDR Media Server - A professional-grade Node.js media streaming server optimized for 4K HDR content with modern web UI, MKV support, and intelligent transcoding capabilities.

**Key Technologies**: Node.js, HTML5 Video API, FFmpeg, TailwindCSS, Systemd

## Development Commands

### Core Development
```bash
# Install dependencies
npm install

# Start development server
npm start
# or
npm run dev

# Test connectivity and functionality
npm test
npm run test

# Clean transcoding cache
npm run cleanup

# Check active transcodes
npm run transcode
```

### System Service Management
```bash
# Install as system service
sudo cp stark-media-server.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable stark-media-server.service

# Service control
sudo systemctl start stark-media-server.service
sudo systemctl stop stark-media-server.service
sudo systemctl status stark-media-server.service
sudo systemctl restart stark-media-server.service

# View logs
sudo journalctl -u stark-media-server.service -f
```

### Production Deployment
```bash
# Environment variables for production
export NODE_ENV=production
export PORT=8888
export MEDIA_DIR=/hdd-store/lan_films
export CACHE_DIR=/var/cache/stark-media-server

# Create required directories
sudo mkdir -p /var/cache/stark-media-server
sudo chown stark:stark /var/cache/stark-media-server

# Run directly (development/testing)
node ultra_hdr_media_server.js
```

## Architecture Overview

### Core Components

**Main Server (`ultra_hdr_media_server.js`)**
- HTTP server handling file streaming and directory listing
- Dynamic chunk sizing based on file size (1MB-5MB chunks)
- Enhanced MIME type handling for MKV files
- Advanced video player with fallback options
- Glass morphism UI with TailwindCSS

**Transcoder Module (`transcoder.js`)**
- VideoTranscoder class for intelligent video processing
- Stream copy optimization (avoids re-encoding when possible)
- Smart transcoding with format analysis
- Cache management system
- FFmpeg integration with multiple quality presets

**Service Management (`stark-media-server.service`)**
- Systemd service configuration
- Security hardening with restricted file access
- Automatic restart and logging configuration

### Key Design Patterns

**Intelligent Stream Handling**
- Range request support for large files (>2GB)
- Dynamic chunk sizing based on file size
- Browser-specific optimizations

**Smart Transcoding Strategy**
- Stream copy when codecs are compatible (H.264, AAC)
- Fast remux for container format changes only
- Progressive quality selection (ultrafast → fast → slow)
- Selective transcoding (video-only or audio-only when needed)

**Fallback Architecture**
- Multiple source formats for video player
- Browser compatibility detection
- Download/VLC fallback for unsupported formats

## File Structure and Configuration

### Configuration Points
```javascript
// In ultra_hdr_media_server.js
const PORT = 8888;                          // Server port
const MEDIA_DIR = '/hdd-store/lan_films';   // Media directory
const CACHE_DIR = '/var/cache/stark-media-server'; // Transcoding cache

// Environment variable overrides available for:
// PORT, MEDIA_DIR, CACHE_DIR, NODE_ENV
```

### Media Directory Structure
- Media files served from `MEDIA_DIR` (default: `/hdd-store/lan_films`)
- Transcoded cache stored in `CACHE_DIR` (default: `/var/cache/stark-media-server`)
- Cache cleanup runs automatically (24-hour retention)

### MIME Type Handling
Custom MIME types for optimal browser compatibility:
- `.mkv` → `video/x-matroska` (proper MKV handling)
- Enhanced video format support (MP4, WebM, AVI, MOV, M2TS)
- Fallback options for unsupported formats

## Video Processing Logic

### Transcoding Decision Tree
1. **Analysis Phase**: Use ffprobe to analyze video streams
2. **Stream Copy Check**: Determine if H.264/AAC can be copied directly
3. **Smart Processing**:
   - Fast remux: Both streams compatible → container change only
   - Selective: Copy compatible streams, re-encode others
   - Full transcode: Re-encode everything if needed

### Quality Presets
- `ultrafast`: For quick streaming transcodes (CRF 28)
- `fast`: Balanced quality/speed (CRF 23)  
- `slow`: High quality for archival (CRF 20)

### Chunk Size Optimization
```javascript
// Dynamic chunk sizing based on file size
if (fileSize > 5GB) chunkSize = 5MB;
else if (fileSize > 2GB) chunkSize = 3MB;
else if (fileSize > 500MB) chunkSize = 2MB;
else chunkSize = 1MB;
```

## Browser Compatibility Matrix

### Native Playback Support
- **MP4/H.264**: Universal support
- **WebM/VP9**: Modern browser support
- **MKV**: Limited support, transcoding recommended

### Fallback Strategy
1. Try native browser playback
2. Show enhanced player with multiple sources
3. Offer download option
4. Provide VLC/external player URLs

## Testing and Debugging

### Connectivity Test
```bash
node test_connectivity.js
```
Tests: FFmpeg availability, directory permissions, cache access, file type detection

### Debug Logging
Server provides detailed console output:
- Request logging with timestamps
- File size and chunk information  
- Transcoding progress tracking
- Error tracking with context

### Common Issues
- **MKV playback**: Browser limitations, use transcoding
- **Large files**: Network buffering, use range requests
- **HDR content**: Browser HDR support varies
- **Service permissions**: Check file ownership and systemd security

## Security Considerations

- Path traversal protection with sanitization
- Input validation for all user inputs  
- Range request validation to prevent abuse
- Systemd security hardening (NoNewPrivileges, ProtectSystem)
- Network binding limited to specific interfaces

## Performance Optimization

### Server-Level
- Keep-alive connections for better performance
- HTTP/1.1 range request optimization
- Efficient file streaming with proper buffer sizes
- Cache headers for static content

### Transcoding-Level
- Stream copy when possible (10x faster than re-encoding)
- Intelligent quality selection based on use case
- Progressive enhancement with fallbacks
- Cache management to avoid redundant processing
