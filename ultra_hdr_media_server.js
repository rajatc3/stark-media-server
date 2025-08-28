const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { exec } = require('child_process');

const PORT = 8888;
const MEDIA_DIR = '/hdd-store/lan_films';
const CACHE_DIR = process.env.CACHE_DIR || '/var/cache/stark-media-server';

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// Enhanced MIME types with proper MKV support
const mimeTypes = {
    '.mp4': 'video/mp4',
    '.mkv': 'video/x-matroska',  // Proper MKV MIME type
    '.webm': 'video/webm',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.m4v': 'video/mp4',
    '.m2ts': 'video/mp2t',
    '.ts': 'video/mp2t',
    '.flv': 'video/x-flv',
    '.wmv': 'video/x-ms-wmv',
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8'
};

// Video codec detection patterns
const codecPatterns = {
    'h264': /h\.?264|avc/i,
    'h265': /h\.?265|hevc/i,
    'av1': /av1/i,
    'vp9': /vp9/i,
    'dolbyVision': /dv|dolby.?vision/i,
    'hdr10': /hdr10/i,
    'hdr': /hdr/i,
    '4k': /4k|2160p|uhd/i,
    '8k': /8k|4320p/i
};

function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return mimeTypes[ext] || 'application/octet-stream';
}

function sanitizePath(inputPath) {
    const decoded = decodeURIComponent(inputPath);
    const normalized = path.posix.normalize(decoded);
    return normalized.replace(/\.\./g, ''); // Extra security
}

function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    
    return `${size.toFixed(unitIndex > 0 ? 1 : 0)} ${units[unitIndex]}`;
}

function detectVideoFeatures(filename) {
    const features = [];
    const lowerName = filename.toLowerCase();
    
    if (codecPatterns['4k'].test(lowerName)) features.push({ label: '4K UHD', class: 'bg-red-500' });
    if (codecPatterns['8k'].test(lowerName)) features.push({ label: '8K', class: 'bg-red-600' });
    if (codecPatterns['dolbyVision'].test(lowerName)) features.push({ label: 'Dolby Vision', class: 'bg-purple-600' });
    if (codecPatterns['hdr10'].test(lowerName)) features.push({ label: 'HDR10', class: 'bg-yellow-600' });
    if (codecPatterns['hdr'].test(lowerName)) features.push({ label: 'HDR', class: 'bg-yellow-500' });
    if (codecPatterns['h265'].test(lowerName)) features.push({ label: 'HEVC', class: 'bg-blue-500' });
    if (codecPatterns['av1'].test(lowerName)) features.push({ label: 'AV1', class: 'bg-green-500' });
    if (lowerName.includes('atmos')) features.push({ label: 'Dolby Atmos', class: 'bg-indigo-500' });
    
    return features;
}

async function getVideoInfo(filePath) {
    return new Promise((resolve) => {
        const cmd = `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`;
        exec(cmd, (error, stdout) => {
            if (error) {
                resolve(null);
                return;
            }
            try {
                const info = JSON.parse(stdout);
                resolve(info);
            } catch (e) {
                resolve(null);
            }
        });
    });
}

function generateDirectoryListing(dirPath, reqPath) {
    let files;
    try {
        files = fs.readdirSync(dirPath);
    } catch (err) {
        return generateErrorPage('Cannot read directory', err.message);
    }
    
    const items = [];
    
    // Add parent directory link if not root
    if (reqPath !== '/') {
        items.push({
            name: '← Back to Parent',
            path: path.posix.dirname(reqPath),
            isDir: true,
            isBack: true,
            size: 0
        });
    }
    
    files.forEach(file => {
        const filePath = path.join(dirPath, file);
        try {
            if (fs.existsSync(filePath)) {
                const stats = fs.statSync(filePath);
                const isVideo = /\.(mp4|mkv|avi|mov|m4v|webm|m2ts|ts|flv|wmv)$/i.test(file);
                
                items.push({
                    name: file,
                    path: path.posix.join(reqPath, file),
                    isDir: stats.isDirectory(),
                    isVideo: isVideo,
                    isBack: false,
                    size: stats.size,
                    modified: stats.mtime,
                    features: isVideo ? detectVideoFeatures(file) : []
                });
            }
        } catch (err) {
            console.log(`Error processing file ${file}:`, err.message);
        }
    });
    
    // Sort: directories first, then by name
    items.sort((a, b) => {
        if (a.isBack) return -1;
        if (b.isBack) return 1;
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });
    
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ultra 4K HDR Cinema - Stark's Media Server</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    fontFamily: {
                        'display': ['Outfit', 'sans-serif'],
                        'sans': ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
                    },
                    colors: {
                        'modern-gray': {
                            50: '#f8fafc',
                            100: '#f1f5f9',
                            800: '#1e293b',
                            900: '#0f172a',
                        }
                    },
                    animation: {
                        'float': 'float 8s ease-in-out infinite',
                        'pulse-gentle': 'pulse 6s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                    }
                }
            }
        }
    </script>
    <style>
        @keyframes gradient {
            0%, 100% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
        }
        @keyframes float {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-20px); }
        }
        .modern-bg {
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%);
            min-height: 100vh;
        }
        .glass {
            backdrop-filter: blur(12px) saturate(120%);
            -webkit-backdrop-filter: blur(12px) saturate(120%);
            background: rgba(15, 23, 42, 0.7);
            border: 1px solid rgba(148, 163, 184, 0.1);
            box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.2);
        }
        .glass-light {
            backdrop-filter: blur(12px) saturate(120%);
            -webkit-backdrop-filter: blur(12px) saturate(120%);
            background: rgba(30, 41, 59, 0.6);
            border: 1px solid rgba(148, 163, 184, 0.15);
            box-shadow: 0 4px 16px 0 rgba(0, 0, 0, 0.15);
        }
        .video-card {
            background: linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(51, 65, 85, 0.8) 100%);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            border: 1px solid rgba(99, 102, 241, 0.2);
        }
        .folder-card {
            background: linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(51, 65, 85, 0.8) 100%);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            border: 1px solid rgba(245, 158, 11, 0.2);
        }
        .back-card {
            background: linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(51, 65, 85, 0.8) 100%);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            border: 1px solid rgba(59, 130, 246, 0.2);
        }
        .card:hover {
            transform: translateY(-4px);
            box-shadow: 0 12px 24px -8px rgba(0, 0, 0, 0.3);
        }
        .modern-text {
            text-shadow: none;
        }
    </style>
</head>
<body class="gradient-bg min-h-screen">
    <!-- Animated Background Elements -->
    <div class="fixed inset-0 overflow-hidden pointer-events-none">
        <div class="absolute top-1/4 left-1/4 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-float"></div>
        <div class="absolute top-3/4 right-1/4 w-72 h-72 bg-yellow-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-float" style="animation-delay: -2s;"></div>
        <div class="absolute bottom-1/4 left-1/2 w-72 h-72 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-float" style="animation-delay: -4s;"></div>
    </div>

    <div class="relative z-10 container mx-auto p-4 max-w-7xl">
        <!-- Stunning Header -->
        <div class="glass rounded-3xl p-12 mb-12 text-center relative overflow-hidden">
            <div class="absolute inset-0 bg-gradient-to-r from-purple-600/20 via-pink-600/20 to-blue-600/20"></div>
            <div class="relative z-10">
                <div class="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full mb-6 animate-pulse-slow">
                    <span class="text-4xl">🎬</span>
                </div>
                <h1 class="font-display text-5xl md:text-7xl font-black text-white mb-4 neon-text">
                    Ultra 4K HDR Cinema
                </h1>
                <p class="font-sans text-xl md:text-2xl text-white/90 mb-6">
                    Premium Ultra High Definition Streaming Experience
                </p>
                <div class="glass-dark rounded-2xl p-4 inline-block">
                    <div class="flex items-center justify-center gap-3">
                        <span class="text-2xl">📍</span>
                        <span class="text-white/95 text-lg font-medium">
                            ${reqPath === '/' ? '🏠 Home Library' : escapeHtml(reqPath)}
                        </span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Stats Bar -->
        <div class="glass rounded-2xl p-6 mb-8">
            <div class="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
                <div>
                    <div class="text-3xl font-bold text-white">${items.filter(item => item.isVideo).length}</div>
                    <div class="text-white/70 text-sm font-medium">Videos</div>
                </div>
                <div>
                    <div class="text-3xl font-bold text-white">${items.filter(item => item.isDir && !item.isBack).length}</div>
                    <div class="text-white/70 text-sm font-medium">Folders</div>
                </div>
                <div>
                    <div class="text-3xl font-bold text-white">${items.filter(item => item.features?.some(f => f.label.includes('4K'))).length}</div>
                    <div class="text-white/70 text-sm font-medium">4K Content</div>
                </div>
                <div>
                    <div class="text-3xl font-bold text-white">${items.filter(item => item.features?.some(f => f.label.includes('HDR'))).length}</div>
                    <div class="text-white/70 text-sm font-medium">HDR Content</div>
                </div>
            </div>
        </div>

        <!-- Enhanced File Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            ${items.length === 0 ? `
                <div class="col-span-full glass rounded-3xl p-16 text-center">
                    <div class="text-8xl mb-6 animate-bounce-slow">📁</div>
                    <h3 class="text-2xl font-bold text-white mb-4">No Content Found</h3>
                    <p class="text-white/70 text-lg">This directory appears to be empty.</p>
                </div>
            ` : ''}
            
            ${items.map(item => {
                let cardClass, icon, itemType, iconClass;
                
                if (item.isBack) {
                    cardClass = 'back-card';
                    icon = '🔙';
                    itemType = 'Navigation';
                    iconClass = 'text-blue-600';
                } else if (item.isDir) {
                    cardClass = 'folder-card';
                    icon = '📁';
                    itemType = 'Folder';
                    iconClass = 'text-orange-600';
                } else if (item.isVideo) {
                    cardClass = 'video-card';
                    icon = '🎬';
                    itemType = 'Video File';
                    iconClass = 'text-red-600';
                } else {
                    cardClass = 'glass-dark';
                    icon = '📄';
                    itemType = 'File';
                    iconClass = 'text-gray-400';
                }
                
                const sizeStr = item.isDir ? '' : formatSize(item.size);
                const encodedPath = encodeURIComponent(item.path);
                
                return `
                    <div class="card ${cardClass} rounded-3xl p-6 cursor-pointer group relative overflow-hidden"
                         onclick="navigateToPath('${encodedPath}')">
                        
                        <!-- Background Pattern -->
                        <div class="absolute inset-0 opacity-5">
                            <div class="absolute inset-0" style="background-image: radial-gradient(circle, currentColor 1px, transparent 1px); background-size: 20px 20px;"></div>
                        </div>
                        
                        <div class="relative z-10">
                            <!-- Header with Icon and Action Button -->
                            <div class="flex items-start justify-between mb-6">
                                <div class="text-6xl group-hover:scale-110 transition-transform duration-300 ${iconClass}">
                                    ${icon}
                                </div>
                                ${item.isVideo ? `
                                    <button class="bg-green-500 hover:bg-green-600 active:bg-green-700 text-white px-6 py-3 rounded-full font-bold transition-all duration-300 hover:scale-110 shadow-xl hover:shadow-2xl"
                                            onclick="event.stopPropagation(); streamVideo('${encodedPath}')">
                                        <div class="flex items-center gap-2">
                                            <span class="text-xl">▶️</span>
                                            <span>STREAM</span>
                                        </div>
                                    </button>
                                ` : ''}
                            </div>
                            
                            <!-- Content Info -->
                            <div class="text-white mb-4">
                                <h3 class="font-sans font-bold text-xl mb-3 line-clamp-2 break-words group-hover:text-yellow-300 transition-colors">
                                    ${escapeHtml(item.name)}
                                </h3>
                                <div class="flex justify-between items-center text-sm mb-3">
                                    <span class="font-semibold text-white/90">${itemType}</span>
                                    ${sizeStr ? `<span class="font-medium text-white/70">${sizeStr}</span>` : ''}
                                </div>
                            </div>
                            
                            <!-- Video Features -->
                            ${item.features && item.features.length > 0 ? `
                                <div class="flex flex-wrap gap-2">
                                    ${item.features.map(feature => `
                                        <span class="feature-tag ${feature.class} text-white text-xs px-3 py-1 rounded-full font-bold shadow-lg">
                                            ${feature.label}
                                        </span>
                                    `).join('')}
                                </div>
                            ` : ''}
                        </div>
                        
                        <!-- Hover Effect Overlay -->
                        <div class="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    </div>
                `;
            }).join('')}
        </div>
        
        <!-- Enhanced Footer -->
        <div class="glass rounded-3xl p-8 mt-12 text-center">
            <div class="mb-6">
                <h3 class="text-2xl font-bold text-white mb-3">🌐 Network Media Hub</h3>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6 text-white/80">
                    <div class="flex items-center justify-center gap-3">
                        <span class="text-2xl">🖥️</span>
                        <span><strong>Server:</strong> 192.168.29.233:${PORT}</span>
                    </div>
                    <div class="flex items-center justify-center gap-3">
                        <span class="text-2xl">📱</span>
                        <span><strong>Mobile:</strong> Fully Optimized</span>
                    </div>
                    <div class="flex items-center justify-center gap-3">
                        <span class="text-2xl">🎥</span>
                        <span><strong>Quality:</strong> 4K HDR Ready</span>
                    </div>
                </div>
            </div>
            <div class="text-white/60 text-sm">
                Built with ❤️ for the ultimate home cinema experience
            </div>
        </div>
    </div>

    <script>
        function navigateToPath(encodedPath) {
            const decodedPath = decodeURIComponent(encodedPath);
            window.location.href = decodedPath;
        }
        
        function streamVideo(encodedPath) {
            const streamPath = '/stream' + decodeURIComponent(encodedPath);
            window.location.href = streamPath;
        }
        
        // Add some interactive animations
        document.addEventListener('DOMContentLoaded', function() {
            // Animate cards on scroll
            const observer = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.style.animationDelay = Math.random() * 0.5 + 's';
                        entry.target.classList.add('animate-fadeIn');
                    }
                });
            });

            document.querySelectorAll('.card').forEach((card) => {
                observer.observe(card);
            });
        });
    </script>
</body>
</html>`;
    
    return html;
}

function generateAdvancedVideoPlayer(videoPath, videoName, videoInfo) {
    const cleanVideoName = escapeHtml(videoName);
    const features = detectVideoFeatures(videoName);
    const isLargeFile = fs.statSync(path.resolve(path.join(MEDIA_DIR, videoPath))).size > 2 * 1024 * 1024 * 1024; // >2GB
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🎬 Ultra Player - ${cleanVideoName}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        .glass {
            backdrop-filter: blur(16px) saturate(180%);
            -webkit-backdrop-filter: blur(16px) saturate(180%);
            background-color: rgba(0, 0, 0, 0.5);
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        video {
            object-fit: contain;
            background: #000;
        }
        
        .cinema-controls {
            transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
            transform: translateY(0);
            opacity: 1;
        }
        
        .video-wrapper:not(:hover):not(.controls-locked) .cinema-controls {
            transform: translateY(100%);
            opacity: 0;
        }
        
        .video-wrapper:hover .cinema-controls,
        .video-wrapper.controls-locked .cinema-controls {
            transform: translateY(0);
            opacity: 1;
        }
        
        .loading-spinner {
            width: 60px;
            height: 60px;
            border: 4px solid #1f2937;
            border-top: 4px solid #3b82f6;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        .progress-bar {
            height: 6px;
            background: rgba(255,255,255,0.3);
            border-radius: 3px;
            cursor: pointer;
        }
        
        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #3b82f6, #8b5cf6);
            border-radius: 3px;
            transition: width 0.1s ease;
        }
        
        .volume-slider {
            width: 100px;
            height: 4px;
            background: rgba(255,255,255,0.3);
            border-radius: 2px;
            cursor: pointer;
        }
        
        .quality-menu {
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s ease;
        }
        
        .quality-menu.open {
            max-height: 200px;
        }
    </style>
</head>
<body class="bg-black text-white overflow-hidden">
    <div class="video-wrapper relative w-screen h-screen flex flex-col" id="videoWrapper">
        
        <!-- Top Controls Bar -->
        <div class="cinema-controls absolute top-0 left-0 right-0 z-30 glass p-6">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-4">
                    <button onclick="goBack()" 
                            class="flex items-center gap-2 bg-blue-600/80 hover:bg-blue-600 px-4 py-2 rounded-xl transition-all duration-300 hover:scale-105">
                        <span class="text-xl">←</span>
                        <span class="font-semibold">Back to Library</span>
                    </button>
                    
                    <div class="hidden md:flex gap-2">
                        ${features.map(feature => `
                            <span class="${feature.class} px-3 py-1 rounded-full text-sm font-bold shadow-lg">
                                ${feature.label}
                            </span>
                        `).join('')}
                    </div>
                </div>
                
                <div class="flex items-center gap-3">
                    <button onclick="togglePictureInPicture()" 
                            class="bg-purple-600/80 hover:bg-purple-600 px-4 py-2 rounded-xl transition-all">
                        📺 PiP
                    </button>
                    <button onclick="toggleFullscreen()" 
                            class="bg-green-600/80 hover:bg-green-600 px-4 py-2 rounded-xl transition-all">
                        ⛶ Fullscreen
                    </button>
                </div>
            </div>
            
            <div class="mt-4">
                <h1 class="text-xl md:text-2xl font-bold truncate">
                    ${cleanVideoName}
                </h1>
                <div class="text-sm text-gray-300 mt-1">
                    ${isLargeFile ? '🎬 Large File - Optimized Streaming' : '🎬 HD Streaming'} • 
                    Ready for ${features.length > 0 ? features.map(f => f.label).join(', ') : 'HD'} playback
                </div>
            </div>
        </div>

        <!-- Main Video Area -->
        <div class="flex-1 flex items-center justify-center bg-black relative">
            
            <!-- Loading Screen -->
            <div id="loadingScreen" class="absolute inset-0 flex flex-col items-center justify-center z-20 bg-black/90">
                <div class="loading-spinner mb-6"></div>
                <h3 class="text-2xl font-bold mb-2">Loading Ultra HD Content</h3>
                <p class="text-gray-400 text-center max-w-md">
                    ${isLargeFile ? 'Large 4K HDR file detected. Optimizing for smooth playback...' : 'Preparing your video for streaming...'}
                </p>
                <div class="mt-4 w-64 h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div class="loading-progress h-full bg-blue-500 rounded-full transition-all duration-300" style="width: 0%"></div>
                </div>
            </div>
            
            <!-- Video Player -->
            <video id="videoPlayer" 
                   class="w-full h-full hidden"
                   preload="metadata"
                   onloadedmetadata="onVideoLoaded()"
                   onloadstart="onVideoStart()"
                   oncanplay="onVideoCanPlay()"
                   onwaiting="onVideoWaiting()"
                   onplaying="onVideoPlaying()"
                   onerror="onVideoError()"
                   ontimeupdate="updateProgress()"
                   onvolumechange="updateVolumeDisplay()">
                
                <!-- Multiple source options for maximum compatibility -->
                <source src="${videoPath}" type="${getMimeType(videoPath)}">
                ${videoPath.endsWith('.mkv') ? `
                    <source src="${videoPath}" type="video/mp4">
                    <source src="${videoPath}" type="video/webm">
                ` : ''}
                
                <p class="text-center p-8">
                    Your browser doesn't support this video format.
                    <a href="${videoPath}" class="text-yellow-400 underline hover:text-yellow-300 ml-2">
                        Download file instead
                    </a>
                </p>
            </video>
            
            <!-- Fallback Options for MKV -->
            <div id="fallbackOptions" class="hidden absolute inset-0 flex items-center justify-center z-25 bg-black/95">
                <div class="glass rounded-2xl p-8 max-w-2xl mx-4 text-center">
                    <div class="text-6xl mb-6">🎬</div>
                    <h3 class="text-3xl font-bold mb-4">Enhanced Playback Options</h3>
                    <p class="text-gray-300 mb-8 text-lg">
                        This ${videoPath.endsWith('.mkv') ? 'MKV' : 'video'} file needs special handling for optimal 4K HDR playback.
                    </p>
                    
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <button onclick="forcePlayback()" 
                                class="bg-green-600 hover:bg-green-700 p-6 rounded-xl transition-all hover:scale-105">
                            <div class="text-4xl mb-3">🚀</div>
                            <div class="font-bold text-lg">Force Play</div>
                            <div class="text-sm text-gray-300">Try direct playback</div>
                        </button>
                        
                        <a href="${videoPath}" 
                           class="bg-blue-600 hover:bg-blue-700 p-6 rounded-xl transition-all hover:scale-105 block">
                            <div class="text-4xl mb-3">📥</div>
                            <div class="font-bold text-lg">Download</div>
                            <div class="text-sm text-gray-300">Save to device</div>
                        </a>
                        
                        <button onclick="copyStreamUrl()" 
                                class="bg-purple-600 hover:bg-purple-700 p-6 rounded-xl transition-all hover:scale-105">
                            <div class="text-4xl mb-3">📋</div>
                            <div class="font-bold text-lg">Copy URL</div>
                            <div class="text-sm text-gray-300">Use in VLC/Kodi</div>
                        </button>
                    </div>
                    
                    <div class="mt-8 p-6 bg-yellow-900/30 rounded-xl border border-yellow-500/30">
                        <div class="flex items-start gap-3">
                            <span class="text-2xl">💡</span>
                            <div class="text-left">
                                <div class="font-semibold text-yellow-200 mb-2">Pro Tip for 4K HDR:</div>
                                <p class="text-sm text-yellow-300/90">
                                    For best experience with MKV files, use VLC Media Player or download to your device. 
                                    4K HDR content with Dolby Vision may have limited browser support.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Bottom Controls Bar -->
        <div class="cinema-controls absolute bottom-0 left-0 right-0 z-30 glass p-4">
            
            <!-- Progress Bar -->
            <div class="progress-bar mb-4" onclick="seekTo(event)" id="progressBar">
                <div class="progress-fill" id="progressFill" style="width: 0%"></div>
            </div>
            
            <!-- Control Buttons -->
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-4">
                    <button onclick="togglePlayPause()" id="playPauseBtn"
                            class="bg-blue-600/80 hover:bg-blue-600 w-12 h-12 rounded-full flex items-center justify-center transition-all hover:scale-110">
                        <span id="playPauseIcon">▶️</span>
                    </button>
                    
                    <div class="flex items-center gap-3">
                        <button onclick="seekBackward()" 
                                class="bg-gray-600/80 hover:bg-gray-600 w-10 h-10 rounded-full flex items-center justify-center">
                            ⏪
                        </button>
                        <button onclick="seekForward()" 
                                class="bg-gray-600/80 hover:bg-gray-600 w-10 h-10 rounded-full flex items-center justify-center">
                            ⏩
                        </button>
                    </div>
                    
                    <div class="flex items-center gap-2">
                        <span class="text-sm">🔊</span>
                        <div class="volume-slider" onclick="setVolume(event)" id="volumeSlider">
                            <div class="h-full bg-blue-500 rounded" id="volumeFill" style="width: 100%"></div>
                        </div>
                        <span class="text-sm w-8" id="volumeText">100</span>
                    </div>
                </div>
                
                <div class="flex items-center gap-2">
                    <span class="text-sm" id="timeDisplay">00:00 / 00:00</span>
                    
                    <button onclick="toggleControls()" 
                            class="bg-gray-600/80 hover:bg-gray-600 px-3 py-2 rounded-lg text-sm">
                        🔒 Lock
                    </button>
                </div>
            </div>
            
            <!-- Keyboard Shortcuts Help -->
            <div class="mt-3 pt-3 border-t border-white/20">
                <div class="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs text-gray-400">
                    <div>Space: Play/Pause</div>
                    <div>← →: Seek ±10s</div>
                    <div>↑ ↓: Volume</div>
                    <div>F: Fullscreen</div>
                    <div>M: Mute</div>
                </div>
            </div>
        </div>
    </div>

    <script>
        let video = null;
        let controlsLocked = false;
        let loadingProgress = 0;
        
        // Initialize video player
        function initPlayer() {
            video = document.getElementById('videoPlayer');
            
            // Start loading progress simulation
            simulateLoading();
            
            // Set optimal settings for large files
            if (${isLargeFile}) {
                video.preload = 'metadata';
            } else {
                video.preload = 'auto';
            }
        }
        
        function simulateLoading() {
            const progressBar = document.querySelector('.loading-progress');
            const interval = setInterval(() => {
                loadingProgress += Math.random() * 15;
                if (loadingProgress >= 100) {
                    loadingProgress = 100;
                    clearInterval(interval);
                }
                progressBar.style.width = loadingProgress + '%';
            }, 200);
        }
        
        function onVideoStart() {
            console.log('Video loading started');
        }
        
        function onVideoLoaded() {
            console.log('Video metadata loaded');
            setTimeout(hideLoading, 1000);
        }
        
        function onVideoCanPlay() {
            console.log('Video ready to play');
            hideLoading();
        }
        
        function onVideoWaiting() {
            console.log('Video buffering...');
            showBuffering();
        }
        
        function onVideoPlaying() {
            console.log('Video playing');
            hideBuffering();
        }
        
        function onVideoError(e) {
            console.error('Video error:', e);
            showFallbackOptions();
        }
        
        function hideLoading() {
            document.getElementById('loadingScreen').classList.add('hidden');
            document.getElementById('videoPlayer').classList.remove('hidden');
        }
        
        function showBuffering() {
            // Could add buffering indicator
        }
        
        function hideBuffering() {
            // Hide buffering indicator
        }
        
        function showFallbackOptions() {
            document.getElementById('loadingScreen').classList.add('hidden');
            document.getElementById('fallbackOptions').classList.remove('hidden');
        }
        
        function forcePlayback() {
            document.getElementById('fallbackOptions').classList.add('hidden');
            document.getElementById('videoPlayer').classList.remove('hidden');
            video.load();
        }
        
        function togglePlayPause() {
            if (!video) return;
            
            if (video.paused) {
                video.play();
                document.getElementById('playPauseIcon').textContent = '⏸️';
            } else {
                video.pause();
                document.getElementById('playPauseIcon').textContent = '▶️';
            }
        }
        
        function seekBackward() {
            if (!video) return;
            video.currentTime = Math.max(0, video.currentTime - 10);
        }
        
        function seekForward() {
            if (!video) return;
            video.currentTime = Math.min(video.duration, video.currentTime + 10);
        }
        
        function seekTo(event) {
            if (!video) return;
            
            const progressBar = document.getElementById('progressBar');
            const rect = progressBar.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const percentage = x / rect.width;
            
            video.currentTime = percentage * video.duration;
        }
        
        function setVolume(event) {
            if (!video) return;
            
            const volumeSlider = document.getElementById('volumeSlider');
            const rect = volumeSlider.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const percentage = Math.max(0, Math.min(1, x / rect.width));
            
            video.volume = percentage;
        }
        
        function updateProgress() {
            if (!video) return;
            
            const percentage = (video.currentTime / video.duration) * 100;
            document.getElementById('progressFill').style.width = percentage + '%';
            
            const current = formatTime(video.currentTime);
            const total = formatTime(video.duration);
            document.getElementById('timeDisplay').textContent = current + ' / ' + total;
        }
        
        function updateVolumeDisplay() {
            if (!video) return;
            
            const percentage = video.volume * 100;
            document.getElementById('volumeFill').style.width = percentage + '%';
            document.getElementById('volumeText').textContent = Math.round(percentage);
        }
        
        function formatTime(seconds) {
            if (isNaN(seconds)) return '00:00';
            
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = Math.floor(seconds % 60);
            
            if (hours > 0) {
                return hours + ':' + String(minutes).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
            } else {
                return String(minutes).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
            }
        }
        
        function toggleFullscreen() {
            if (!video) return;
            
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else {
                video.requestFullscreen();
            }
        }
        
        function togglePictureInPicture() {
            if (!video) return;
            
            if (document.pictureInPictureElement) {
                document.exitPictureInPicture();
            } else {
                video.requestPictureInPicture();
            }
        }
        
        function toggleControls() {
            const wrapper = document.getElementById('videoWrapper');
            controlsLocked = !controlsLocked;
            
            if (controlsLocked) {
                wrapper.classList.add('controls-locked');
            } else {
                wrapper.classList.remove('controls-locked');
            }
        }
        
        function goBack() {
            history.back();
        }
        
        function copyStreamUrl() {
            const streamUrl = window.location.origin + '${videoPath}';
            navigator.clipboard.writeText(streamUrl).then(() => {
                alert('Stream URL copied! You can now paste this into VLC or other media players.');
            }).catch(() => {
                prompt('Copy this URL:', streamUrl);
            });
        }
        
        // Keyboard shortcuts
        document.addEventListener('keydown', function(e) {
            if (!video) return;
            
            switch(e.code) {
                case 'Space':
                    e.preventDefault();
                    togglePlayPause();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    seekBackward();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    seekForward();
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    video.volume = Math.min(1, video.volume + 0.1);
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    video.volume = Math.max(0, video.volume - 0.1);
                    break;
                case 'KeyF':
                    e.preventDefault();
                    toggleFullscreen();
                    break;
                case 'KeyM':
                    e.preventDefault();
                    video.muted = !video.muted;
                    break;
            }
        });
        
        // Initialize when DOM is ready
        document.addEventListener('DOMContentLoaded', initPlayer);
        
        // Auto-fallback timeout for problematic files
        setTimeout(() => {
            const loading = document.getElementById('loadingScreen');
            if (!loading.classList.contains('hidden')) {
                console.warn('Video loading timeout - showing fallback options');
                showFallbackOptions();
            }
        }, 10000); // 10 second timeout
    </script>
</body>
</html>`;
}

function generateErrorPage(title, message) {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Error - Ultra HDR Media Server</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        .gradient-bg { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
        }
        .glass {
            backdrop-filter: blur(16px) saturate(180%);
            background-color: rgba(255, 255, 255, 0.15);
            border: 1px solid rgba(255, 255, 255, 0.125);
        }
    </style>
</head>
<body class="gradient-bg min-h-screen flex items-center justify-center">
    <div class="glass rounded-3xl p-12 max-w-lg text-center">
        <div class="text-8xl mb-6 animate-bounce">⚠️</div>
        <h1 class="text-3xl font-bold text-white mb-6">${escapeHtml(title)}</h1>
        <p class="text-white/90 mb-8 text-lg">${escapeHtml(message)}</p>
        <button onclick="history.back()" 
                class="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-xl transition-all hover:scale-105 font-semibold">
            ← Go Back to Library
        </button>
    </div>
</body>
</html>`;
}

// Enhanced server with better MKV support
const server = http.createServer(async (req, res) => {
    try {
        const parsedUrl = url.parse(req.url, true);
        let pathname = sanitizePath(parsedUrl.pathname);
        
        // Enhanced logging
        console.log(`[${new Date().toISOString()}] ${req.method} ${pathname} - User-Agent: ${req.headers['user-agent']?.substring(0, 50) || 'Unknown'}`);
        
        // Handle stream requests with enhanced MKV support
        if (pathname.startsWith('/stream/')) {
            pathname = pathname.replace('/stream/', '/');
            const decodedPath = decodeURIComponent(pathname);
            const videoPath = path.resolve(path.join(MEDIA_DIR, decodedPath));
            
            console.log(`🎬 Stream request for: ${videoPath}`);
            
            // Enhanced security check
            if (!videoPath.startsWith(path.resolve(MEDIA_DIR))) {
                res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(generateErrorPage('Access Denied', 'Invalid path detected'));
                return;
            }
            
            if (!fs.existsSync(videoPath) || fs.statSync(videoPath).isDirectory()) {
                res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(generateErrorPage('Video Not Found', 'The requested video file could not be found'));
                return;
            }
            
            const videoName = path.basename(videoPath);
            const videoInfo = await getVideoInfo(videoPath);
            const html = generateAdvancedVideoPlayer(pathname, videoName, videoInfo);
            
            res.writeHead(200, {
                'Content-Type': 'text/html; charset=utf-8',
                'Content-Length': Buffer.byteLength(html, 'utf8'),
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            });
            res.end(html);
            return;
        }
        
        // Handle regular file/directory requests
        const decodedPath = decodeURIComponent(pathname);
        const filePath = path.resolve(path.join(MEDIA_DIR, decodedPath === '/' ? '' : decodedPath));
        
        console.log(`📁 File request for: ${filePath}`);
        
        // Enhanced security check
        if (!filePath.startsWith(path.resolve(MEDIA_DIR))) {
            res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(generateErrorPage('Access Denied', 'Invalid path detected'));
            return;
        }
        
        if (!fs.existsSync(filePath)) {
            res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(generateErrorPage('File Not Found', `Path does not exist: ${decodedPath}`));
            return;
        }
        
        const stats = fs.statSync(filePath);
        
        if (stats.isDirectory()) {
            // Serve enhanced directory listing
            const html = generateDirectoryListing(filePath, decodedPath);
            res.writeHead(200, {
                'Content-Type': 'text/html; charset=utf-8',
                'Content-Length': Buffer.byteLength(html, 'utf8'),
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache'
            });
            res.end(html);
            return;
        }
        
        // Enhanced file serving with optimizations for 4K HDR content
        const range = req.headers.range;
        const fileSize = stats.size;
        const mimeType = getMimeType(filePath);
        
        // Dynamic chunk size based on file size and type
        let chunkSize = 1024 * 1024; // Default 1MB
        if (fileSize > 5 * 1024 * 1024 * 1024) { // >5GB files
            chunkSize = 5 * 1024 * 1024; // 5MB chunks for very large files
        } else if (fileSize > 2 * 1024 * 1024 * 1024) { // >2GB files  
            chunkSize = 3 * 1024 * 1024; // 3MB chunks for large files
        } else if (fileSize > 500 * 1024 * 1024) { // >500MB files
            chunkSize = 2 * 1024 * 1024; // 2MB chunks for medium files
        }
        
        if (range) {
            // Enhanced range request parsing
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : Math.min(start + chunkSize - 1, fileSize - 1);
            const chunksize = (end - start) + 1;
            
            // Validate range
            if (start >= fileSize || end >= fileSize || start > end) {
                res.writeHead(416, {
                    'Content-Range': `bytes */${fileSize}`,
                    'Content-Type': 'text/plain'
                });
                res.end('Requested range not satisfiable');
                return;
            }
            
            console.log(`📊 Range request: ${start}-${end}/${fileSize} (${formatSize(chunksize)})`);
            
            const file = fs.createReadStream(filePath, { start, end });
            
            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': mimeType,
                'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
                'Connection': 'keep-alive',
                'Keep-Alive': 'timeout=5, max=1000',
                // Additional headers for video optimization
                'X-Content-Type-Options': 'nosniff',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Range'
            });
            
            file.on('error', (err) => {
                console.error('File read error:', err);
                if (!res.headersSent) {
                    res.writeHead(500);
                    res.end('Internal Server Error');
                }
            });
            
            file.pipe(res);
        } else {
            // Serve full file with enhanced headers
            console.log(`📄 Full file request: ${formatSize(fileSize)}`);
            
            res.writeHead(200, {
                'Content-Length': fileSize,
                'Content-Type': mimeType,
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'public, max-age=31536000',
                'Connection': 'keep-alive',
                'Keep-Alive': 'timeout=5, max=1000',
                'X-Content-Type-Options': 'nosniff',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Range'
            });
            
            // Use larger buffer for better performance with big files
            const readStream = fs.createReadStream(filePath, { 
                highWaterMark: chunkSize 
            });
            
            readStream.on('error', (err) => {
                console.error('File read error:', err);
                if (!res.headersSent) {
                    res.writeHead(500);
                    res.end('Internal Server Error');
                }
            });
            
            readStream.pipe(res);
        }
        
    } catch (error) {
        console.error('🚨 Server error:', error);
        if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(generateErrorPage('Server Error', 'An internal server error occurred. Please try again.'));
        }
    }
});

// Enhanced server startup with error handling
server.listen(PORT, '0.0.0.0', () => {
    console.log('\n🚀 ================================');
    console.log('🎬  ULTRA 4K HDR MEDIA SERVER');
    console.log('🚀 ================================');
    console.log(`🌐 Server URL: http://192.168.29.233:${PORT}`);
    console.log(`📁 Media Directory: ${MEDIA_DIR}`);
    console.log(`💾 Cache Directory: ${CACHE_DIR}`);
    console.log('🎥 Enhanced Features:');
    console.log('   • Proper MKV MIME type handling');
    console.log('   • Dynamic chunk sizing for large files');
    console.log('   • Advanced video player with fallback options');
    console.log('   • Modern glass morphism UI');
    console.log('   • 4K HDR optimization');
    console.log('   • Mobile-responsive design');
    console.log('   • Enhanced error handling');
    console.log('⏹️  Press Ctrl+C to stop server');
    console.log('🚀 ================================\n');
});

// Enhanced error handling
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use. Please stop the other server first.`);
    } else {
        console.error('❌ Server error:', err);
    }
    process.exit(1);
});

// Graceful shutdown with cleanup
function gracefulShutdown(signal) {
    console.log(`\n⏹️  Received ${signal}. Shutting down Ultra HDR Media Server gracefully...`);
    
    server.close(() => {
        console.log('✅ Server closed successfully');
        
        // Clean up cache if needed
        try {
            if (fs.existsSync(CACHE_DIR)) {
                // Optional: Clean temporary files
                console.log('🧹 Cache cleanup completed');
            }
        } catch (err) {
            console.warn('⚠️  Cache cleanup failed:', err.message);
        }
        
        console.log('👋 Ultra HDR Media Server stopped');
        process.exit(0);
    });
    
    // Force exit after 10 seconds
    setTimeout(() => {
        console.log('❌ Force shutdown after timeout');
        process.exit(1);
    }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
    gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});
