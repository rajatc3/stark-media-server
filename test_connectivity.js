#!/usr/bin/env node

const VideoTranscoder = require('./transcoder');
const fs = require('fs');
const path = require('path');

async function testConnectivity() {
    console.log('🧪 Testing media server connectivity and functionality...');
    
    try {
        // Test 1: Transcoder functionality
        console.log('\n1️⃣ Testing transcoder...');
        const transcoder = new VideoTranscoder();
        
        const ffmpegWorking = await transcoder.checkFFmpegAvailable();
        if (!ffmpegWorking) {
            throw new Error('FFmpeg is not available');
        }
        console.log('✅ FFmpeg is working');
        
        // Test 2: Check media directory
        console.log('\n2️⃣ Testing media directory access...');
        const mediaDir = process.env.MEDIA_DIR || '/hdd-store/lan_films';
        if (!fs.existsSync(mediaDir)) {
            throw new Error(`Media directory does not exist: ${mediaDir}`);
        }
        
        const stats = fs.statSync(mediaDir);
        if (!stats.isDirectory()) {
            throw new Error(`Media path is not a directory: ${mediaDir}`);
        }
        console.log(`✅ Media directory accessible: ${mediaDir}`);
        
        // Test 3: Check cache directory permissions
        console.log('\n3️⃣ Testing cache directory...');
        const cacheDir = transcoder.cacheDir;
        console.log(`Cache directory: ${cacheDir}`);
        
        // Try to create a test file to check write permissions
        const testFile = path.join(cacheDir, 'test_write.tmp');
        try {
            fs.writeFileSync(testFile, 'test');
            fs.unlinkSync(testFile);
            console.log('✅ Cache directory is writable');
        } catch (err) {
            throw new Error(`Cache directory is not writable: ${err.message}`);
        }
        
        // Test 4: Check some transcoder methods
        console.log('\n4️⃣ Testing transcoder methods...');
        
        // Test file type detection
        const needsTranscodingMKV = transcoder.needsTranscoding('test.mkv');
        const needsTranscodingMP4 = transcoder.needsTranscoding('test.mp4');
        
        console.log(`- MKV needs transcoding: ${needsTranscodingMKV} (expected: true)`);
        console.log(`- MP4 needs transcoding: ${needsTranscodingMP4} (expected: false)`);
        
        if (needsTranscodingMKV !== true || needsTranscodingMP4 !== false) {
            throw new Error('File type detection logic is incorrect');
        }
        
        // Test cache filename generation
        const testCacheFile = transcoder.generateCacheFilename('/test/video.mkv');
        if (!testCacheFile.endsWith('.mp4')) {
            throw new Error('Cache filename should end with .mp4');
        }
        console.log('✅ Cache filename generation working');
        
        // Test 5: Basic server file structure
        console.log('\n5️⃣ Checking server files...');
        const requiredFiles = ['ultra_hdr_media_server.js', 'transcoder.js', 'package.json'];
        for (const file of requiredFiles) {
            if (!fs.existsSync(file)) {
                throw new Error(`Required file missing: ${file}`);
            }
        }
        console.log('✅ All required files present');
        
        console.log('\n🎉 All tests passed! The transcoder is ready to use.');
        return true;
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        return false;
    }
}

// Run the test
testConnectivity().then(success => {
    process.exit(success ? 0 : 1);
});
