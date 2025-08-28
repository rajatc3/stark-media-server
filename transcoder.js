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
                // H.265 can sometimes be copied if browser supports it
                else if (stream.codec_name === 'hevc') {
                    // Only copy HEVC if explicitly requested
                    canCopyVideo = options?.allowHevcCopy || false;
                }
            } else if (stream.codec_type === 'audio') {
                // AAC can usually be copied
                if (stream.codec_name === 'aac') {
                    canCopyAudio = true;
                }
                // MP3 can also be copied
                else if (stream.codec_name === 'mp3') {
                    canCopyAudio = true;
                }
            }
        }
        
        return { video: canCopyVideo, audio: canCopyAudio };
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
    
    // Start transcoding process with intelligent stream copy
    async startTranscode(inputPath, outputPath, options = {}) {
        const transcodeId = require('crypto').randomUUID();
        
        try {
            // First, analyze the input video to determine if we can copy streams
            const videoInfo = await this.getVideoInfo(inputPath);
            const streamCopyCapabilities = await this.canCopyStreams(videoInfo);
            
            return new Promise((resolve, reject) => {
                const ffmpegArgs = ['-i', inputPath];
                
                // Decide video codec
                if (streamCopyCapabilities.video && !options.forceEncode && !options.maxWidth) {
                    console.log(`🚀 Using video stream copy (faster) for: ${path.basename(inputPath)}`);
                    ffmpegArgs.push('-c:v', 'copy');
                } else {
                    console.log(`🔄 Re-encoding video for: ${path.basename(inputPath)}`);
                    ffmpegArgs.push(
                        '-c:v', 'libx264',
                        '-preset', options.preset || 'fast',
                        '-crf', options.crf || '23',
                        '-profile:v', 'high',
                        '-level', '4.1',
                        '-pix_fmt', 'yuv420p'
                    );
                    
                    // Add scaling if needed
                    if (options.maxWidth) {
                        ffmpegArgs.push('-vf', `scale='min(${options.maxWidth},iw):-2'`);
                    }
                }
                
                // Decide audio codec
                if (streamCopyCapabilities.audio && !options.forceEncode) {
                    console.log(`🚀 Using audio stream copy (faster) for: ${path.basename(inputPath)}`);
                    ffmpegArgs.push('-c:a', 'copy');
                } else {
                    console.log(`🔄 Re-encoding audio for: ${path.basename(inputPath)}`);
                    ffmpegArgs.push(
                        '-c:a', 'aac',
                        '-b:a', options.audioBitrate || '128k'
                    );
                }
                
                // Add format and optimization flags
                ffmpegArgs.push(
                    '-f', 'mp4',
                    '-movflags', '+faststart',
                    '-y', // Overwrite output
                    outputPath
                );
                
                console.log(`🔄 FFmpeg command: ffmpeg ${ffmpegArgs.join(' ')}`);
                
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
                    startTime: Date.now(),
                    streamCopy: {
                        video: streamCopyCapabilities.video,
                        audio: streamCopyCapabilities.audio
                    }
                });
            });
        } catch (error) {
            throw new Error(`Failed to analyze video for stream copy: ${error.message}`);
        }
    }
    
    // Fast remux - just change container format without re-encoding
    async fastRemux(inputPath, outputPath) {
        console.log(`⚡ Fast remux (container change only): ${path.basename(inputPath)}`);
        
        return new Promise((resolve, reject) => {
            const ffmpegArgs = [
                '-i', inputPath,
                '-c', 'copy',  // Copy all streams
                '-f', 'mp4',
                '-movflags', '+faststart',
                '-y',
                outputPath
            ];
            
            const ffmpeg = spawn('ffmpeg', ffmpegArgs);
            
            let stderr = '';
            
            ffmpeg.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            ffmpeg.on('error', (err) => {
                reject(new Error(`Fast remux error: ${err.message}`));
            });
            
            ffmpeg.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Fast remux failed with code ${code}: ${stderr}`));
                    return;
                }
                
                console.log(`✅ Fast remux completed: ${path.basename(outputPath)}`);
                resolve(outputPath);
            });
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
    
    // Smart transcode - uses stream copy when possible
    async smartTranscode(inputPath, outputPath) {
        try {
            const videoInfo = await this.getVideoInfo(inputPath);
            const streamCopy = await this.canCopyStreams(videoInfo);
            
            // If both streams can be copied, do a fast remux
            if (streamCopy.video && streamCopy.audio) {
                console.log(`⚡ Both streams compatible - using fast remux`);
                return this.fastRemux(inputPath, outputPath);
            }
            
            // Otherwise, use selective transcoding
            return this.startTranscode(inputPath, outputPath, {
                preset: 'fast' // Balanced speed/quality
            });
        } catch (error) {
            // Fallback to regular transcoding if analysis fails
            console.warn(`Analysis failed, falling back to full transcode: ${error.message}`);
            return this.startTranscode(inputPath, outputPath);
        }
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
            duration: Date.now() - info.startTime,
            streamCopy: info.streamCopy
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
