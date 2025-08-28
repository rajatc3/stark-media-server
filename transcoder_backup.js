const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class VideoTranscoder {
    constructor(cacheDir = process.env.CACHE_DIR || '/var/cache/stark-media-server') {
        this.cacheDir = cacheDir;
        this.activeTranscodes = new Map();
        
        // Ensure cache directory exists
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }
    
    // Check if FFmpeg is available
    async checkFFmpegAvailable() {
        return new Promise((resolve) => {
            const ffmpeg = spawn('ffmpeg', ['-version']);
            ffmpeg.on('error', () => resolve(false));
            ffmpeg.on('exit', (code) => resolve(code === 0));
        });
    }
    
    // Get video information using ffprobe
    async getVideoInfo(filePath) {
        return new Promise((resolve, reject) => {
            const ffprobe = spawn('ffprobe', [
                '-v', 'quiet',
                '-print_format', 'json',
                '-show_format',
                '-show_streams',
                filePath
            ]);
            
            let stdout = '';
            let stderr = '';
            
            ffprobe.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            
            ffprobe.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            ffprobe.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`ffprobe failed: ${stderr}`));
                    return;
                }
                
                try {
                    const info = JSON.parse(stdout);
                    resolve(info);
                } catch (err) {
                    reject(new Error(`Failed to parse ffprobe output: ${err.message}`));
                }
            });
        });
    }
    
    // Generate cache filename
    generateCacheFilename(originalPath) {
        const hash = require('crypto').createHash('md5').update(originalPath).digest('hex');
        return path.join(this.cacheDir, `${hash}.mp4`);
    }
    
    // Check if transcoded version exists
    hasTranscodedVersion(originalPath) {
        const cacheFile = this.generateCacheFilename(originalPath);
        return fs.existsSync(cacheFile);
    }
    
    // Get transcoded file path
    getTranscodedPath(originalPath) {
        return this.generateCacheFilename(originalPath);
    }
    
    // Start transcoding process
    async startTranscode(inputPath, outputPath, options = {}) {
        const transcodeId = require('crypto').randomUUID();
        
        return new Promise((resolve, reject) => {
            // Build FFmpeg command for 4K HDR to web-compatible MP4
            const ffmpegArgs = [
                '-i', inputPath,
                
                // Video codec settings for web compatibility
                '-c:v', 'libx264',
                '-preset', 'fast',
                '-crf', '23',
                '-profile:v', 'high',
                '-level', '4.1',
                
                // Audio codec settings
                '-c:a', 'aac',
                '-b:a', '128k',
                
                // Pixel format for wide compatibility
                '-pix_fmt', 'yuv420p',
                
                // Web optimization
                '-movflags', '+faststart',
                
                // Scale down if too large (optional)
                ...(options.maxWidth ? ['-vf', `scale='min(${options.maxWidth},iw):-2'`] : []),
                
                // Output settings
                '-f', 'mp4',
                '-y', // Overwrite output
                outputPath
            ];
            
            console.log(`🔄 Starting transcode: ${path.basename(inputPath)} -> ${path.basename(outputPath)}`);
            
            const ffmpeg = spawn('ffmpeg', ffmpegArgs);
            
            let stderr = '';
            
            ffmpeg.stderr.on('data', (data) => {
                stderr += data.toString();
                // You could parse progress information here
            });
            
            ffmpeg.on('error', (err) => {
                this.activeTranscodes.delete(transcodeId);
                reject(new Error(`FFmpeg error: ${err.message}`));
            });
            
            ffmpeg.on('close', (code) => {
                this.activeTranscodes.delete(transcodeId);
                
                if (code !== 0) {
                    reject(new Error(`Transcoding failed with code ${code}: ${stderr}`));
                    return;
                }
                
                console.log(`✅ Transcode completed: ${path.basename(outputPath)}`);
                resolve(outputPath);
            });
            
            // Store process reference
            this.activeTranscodes.set(transcodeId, {
                process: ffmpeg,
                inputPath,
                outputPath,
                startTime: Date.now()
            });
            
            // Return transcode ID for tracking
            setTimeout(() => resolve({ transcodeId, outputPath }), 100);
        });
    }
    
    // Quick transcode for streaming (lower quality, faster processing)
    async quickTranscodeForStreaming(inputPath, outputPath) {
        return this.startTranscode(inputPath, outputPath, {
            maxWidth: 1920, // Scale down to 1080p for faster transcoding
            crf: 28, // Lower quality for speed
            preset: 'ultrafast'
        });
    }
    
    // High quality transcode (for download/archival)
    async highQualityTranscode(inputPath, outputPath) {
        return this.startTranscode(inputPath, outputPath, {
            crf: 20, // Higher quality
            preset: 'slow'
        });
    }
    
    // Cancel active transcode
    cancelTranscode(transcodeId) {
        const transcode = this.activeTranscodes.get(transcodeId);
        if (transcode) {
            transcode.process.kill('SIGTERM');
            this.activeTranscodes.delete(transcodeId);
            
            // Clean up partial file
            try {
                if (fs.existsSync(transcode.outputPath)) {
                    fs.unlinkSync(transcode.outputPath);
                }
            } catch (err) {
                console.warn('Failed to clean up partial transcode file:', err.message);
            }
            
            return true;
        }
        return false;
    }
    
    // Get active transcodes
    getActiveTranscodes() {
        return Array.from(this.activeTranscodes.entries()).map(([id, info]) => ({
            id,
            inputPath: info.inputPath,
            outputPath: info.outputPath,
            duration: Date.now() - info.startTime
        }));
    }
    
    // Clean up old cache files
    async cleanupCache(maxAgeHours = 24) {
        try {
            const files = fs.readdirSync(this.cacheDir);
            const maxAge = maxAgeHours * 60 * 60 * 1000; // Convert to milliseconds
            
            for (const file of files) {
                const filePath = path.join(this.cacheDir, file);
                const stats = fs.statSync(filePath);
                
                if (Date.now() - stats.mtime.getTime() > maxAge) {
                    fs.unlinkSync(filePath);
                    console.log(`🧹 Cleaned up old cache file: ${file}`);
                }
            }
        } catch (err) {
            console.warn('Cache cleanup failed:', err.message);
        }
    }
    
    // Check if streams can be copied (compatible codecs)
    async canCopyStreams(videoInfo) {
        if (!videoInfo || !videoInfo.streams) {
            return { video: false, audio: false };
        }
        
        let canCopyVideo = false;
        let canCopyAudio = false;
        
        for (const stream of videoInfo.streams) {
            if (stream.codec_type === 'video') {
                // H.264 can be copied if profile/level is compatible
                if (stream.codec_name === 'h264') {
                    const profile = stream.profile?.toLowerCase() || '';
                    const level = parseFloat(stream.level) || 0;
                    
                    // Check if profile and level are web-compatible
                    if (['baseline', 'main', 'high'].includes(profile) && level <= 41) {
                        canCopyVideo = true;
                    }
                }
            } else if (stream.codec_type === 'audio') {
                // AAC can usually be copied
                if (stream.codec_name === 'aac') {
                    canCopyAudio = true;
                }
            }
        }
        
        return { video: canCopyVideo, audio: canCopyAudio };
    }
    
    // Check if streams can be copied (compatible codecs)
    async canCopyStreams(videoInfo) {
        if (!videoInfo || !videoInfo.streams) {
            return { video: false, audio: false };
        }
        
        let canCopyVideo = false;
        let canCopyAudio = false;
        
        for (const stream of videoInfo.streams) {
            if (stream.codec_type === 'video') {
                // H.264 can be copied if profile/level is compatible
                if (stream.codec_name === 'h264') {
                    const profile = stream.profile?.toLowerCase() || '';
                    const level = parseFloat(stream.level) || 0;
                    
                    // Check if profile and level are web-compatible
                    if (['baseline', 'main', 'high'].includes(profile) && level <= 41) {
                        canCopyVideo = true;
                    }
                }
            } else if (stream.codec_type === 'audio') {
                // AAC can usually be copied
                if (stream.codec_name === 'aac') {
                    canCopyAudio = true;
                }
            }
        }
        
        return { video: canCopyVideo, audio: canCopyAudio };
    }
    
    // Check if file needs transcoding
    needsTranscoding(filePath, userAgent = '') {
        const ext = path.extname(filePath).toLowerCase();
        
        // Always need transcoding for MKV in most browsers
        if (ext === '.mkv') {
            // Check if it's a modern browser that might support MKV
            const isSafari = /safari/i.test(userAgent) && !/chrome|chromium/i.test(userAgent);
            const isChrome = /chrome|chromium/i.test(userAgent);
            const isFirefox = /firefox/i.test(userAgent);
            
            // Most browsers don't support MKV natively
            return true;
        }
        
        // Other formats that might need transcoding
        if (['.avi', '.flv', '.wmv', '.m2ts', '.ts'].includes(ext)) {
            return true;
        }
        
        return false;
    }
    
    // Estimate transcoding time (rough estimate)
    estimateTranscodeTime(fileSizeBytes, targetWidth = 1920) {
        // Very rough estimation: ~1MB per second for 1080p on average hardware
        const sizeMB = fileSizeBytes / (1024 * 1024);
        const scaleFactor = targetWidth <= 1920 ? 1 : (targetWidth / 1920) * 2;
        const estimatedMinutes = (sizeMB * scaleFactor) / 60; // Rough estimation
        
        return Math.max(1, Math.round(estimatedMinutes));
    }
}

module.exports = VideoTranscoder;
