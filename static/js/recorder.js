// Video recording functionality
class VideoRecorder {
    constructor(gpxMap, animation) {
        this.map = gpxMap;
        this.animation = animation;
        this.isRecording = false;
        this.mediaRecorder = null;
        this.recordedChunks = [];

        // Recording settings
        this.width = 1920;
        this.height = 1080;
        this.fps = 30;
        this.outputFormat = 'mp4'; // 'mp4' or 'webm'

        // FFmpeg for conversion
        this.ffmpeg = null;
        this.ffmpegLoaded = false;

        // Callbacks
        this.onProgress = null;
        this.onComplete = null;
        this.onError = null;
        this.onStatusChange = null;
    }

    setResolution(width, height) {
        this.width = width;
        this.height = height;
    }

    setFPS(fps) {
        this.fps = fps;
    }

    setOutputFormat(format) {
        this.outputFormat = format;
    }

    // Load FFmpeg for MP4 conversion
    async loadFFmpeg() {
        if (this.ffmpegLoaded) return true;

        try {
            if (this.onStatusChange) {
                this.onStatusChange('Loading video encoder...');
            }

            // Load FFmpeg from CDN
            const { FFmpeg } = await import('https://esm.sh/@ffmpeg/ffmpeg@0.12.7');
            const { fetchFile } = await import('https://esm.sh/@ffmpeg/util@0.12.1');

            this.ffmpeg = new FFmpeg();
            this.fetchFile = fetchFile;

            // Load FFmpeg core
            await this.ffmpeg.load({
                coreURL: 'https://esm.sh/@ffmpeg/core@0.12.4/dist/esm/ffmpeg-core.js',
                wasmURL: 'https://esm.sh/@ffmpeg/core@0.12.4/dist/esm/ffmpeg-core.wasm',
            });

            this.ffmpegLoaded = true;
            if (this.onStatusChange) {
                this.onStatusChange('Video encoder ready');
            }
            return true;
        } catch (error) {
            console.error('Failed to load FFmpeg:', error);
            if (this.onStatusChange) {
                this.onStatusChange('MP4 encoder unavailable, will use WebM');
            }
            return false;
        }
    }

    async startRecording() {
        if (this.isRecording) return;

        try {
            this.isRecording = true;
            this.recordedChunks = [];

            const canvas = this.map.getCanvas();

            // Get stream from canvas
            const stream = canvas.captureStream(this.fps);

            // Check for supported MIME types
            const mimeType = this.getSupportedMimeType();
            if (!mimeType) {
                throw new Error('No supported video format found in this browser');
            }

            // Create MediaRecorder
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: mimeType,
                videoBitsPerSecond: 8000000 // 8 Mbps for good quality
            });

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                this.finishRecording();
            };

            this.mediaRecorder.onerror = (event) => {
                console.error('MediaRecorder error:', event);
                this.isRecording = false;
                if (this.onError) {
                    this.onError(event.error);
                }
            };

            // Start recording
            this.mediaRecorder.start(100); // Collect data every 100ms

            // Start animation
            this.animation.progress = 0;
            this.animation.onProgress = (progress) => {
                if (this.onProgress) {
                    this.onProgress(progress);
                }
            };

            this.animation.onComplete = () => {
                this.stopRecording();
            };

            this.animation.start();

        } catch (error) {
            this.isRecording = false;
            console.error('Recording error:', error);
            if (this.onError) {
                this.onError(error);
            }
        }
    }

    getSupportedMimeType() {
        const types = [
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8',
            'video/webm',
            'video/mp4'
        ];

        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) {
                return type;
            }
        }
        return null;
    }

    stopRecording() {
        if (!this.isRecording) return;

        this.animation.stop();

        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }

        this.isRecording = false;
    }

    finishRecording() {
        if (this.recordedChunks.length === 0) {
            if (this.onError) {
                this.onError(new Error('No video data recorded'));
            }
            return;
        }

        const mimeType = this.mediaRecorder.mimeType;
        const blob = new Blob(this.recordedChunks, { type: mimeType });

        // If MP4 is requested and we recorded WebM, convert it
        if (this.outputFormat === 'mp4' && mimeType.includes('webm')) {
            this.convertToMP4(blob);
        } else {
            this.downloadVideo(blob, mimeType);
        }
    }

    async convertToMP4(webmBlob) {
        try {
            if (this.onStatusChange) {
                this.onStatusChange('Converting to MP4...');
            }

            // Load FFmpeg if not already loaded
            const loaded = await this.loadFFmpeg();
            if (!loaded) {
                // Fall back to WebM download
                if (this.onStatusChange) {
                    this.onStatusChange('Downloading as WebM (MP4 conversion unavailable)');
                }
                this.downloadVideo(webmBlob, 'video/webm');
                return;
            }

            // Write input file
            const inputData = await this.fetchFile(webmBlob);
            await this.ffmpeg.writeFile('input.webm', inputData);

            // Convert to MP4 with H.264
            if (this.onStatusChange) {
                this.onStatusChange('Encoding MP4 (this may take a while)...');
            }

            await this.ffmpeg.exec([
                '-i', 'input.webm',
                '-c:v', 'libx264',
                '-preset', 'fast',
                '-crf', '23',
                '-pix_fmt', 'yuv420p',
                '-movflags', '+faststart',
                'output.mp4'
            ]);

            // Read output file
            const outputData = await this.ffmpeg.readFile('output.mp4');
            const mp4Blob = new Blob([outputData.buffer], { type: 'video/mp4' });

            // Clean up
            await this.ffmpeg.deleteFile('input.webm');
            await this.ffmpeg.deleteFile('output.mp4');

            if (this.onStatusChange) {
                this.onStatusChange('MP4 ready!');
            }

            this.downloadVideo(mp4Blob, 'video/mp4');

        } catch (error) {
            console.error('MP4 conversion failed:', error);
            if (this.onStatusChange) {
                this.onStatusChange('MP4 conversion failed, downloading WebM');
            }
            // Fall back to WebM
            this.downloadVideo(webmBlob, 'video/webm');
        }
    }

    downloadVideo(blob, mimeType) {
        // Determine file extension
        let extension = 'webm';
        if (mimeType.includes('mp4')) {
            extension = 'mp4';
        }

        // Create download link
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gpx-flyover-${Date.now()}.${extension}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        if (this.onComplete) {
            this.onComplete(blob);
        }
    }

    // Alternative: Frame-by-frame recording for more precise control
    async recordFrameByFrame() {
        if (this.isRecording) return;

        try {
            this.isRecording = true;
            this.recordedChunks = [];

            const canvas = this.map.getCanvas();
            const totalFrames = Math.ceil(this.animation.getTotalDuration() * this.fps);

            // Create offscreen canvas for consistent resolution
            const offscreenCanvas = document.createElement('canvas');
            offscreenCanvas.width = this.width;
            offscreenCanvas.height = this.height;
            const ctx = offscreenCanvas.getContext('2d');

            const stream = offscreenCanvas.captureStream(0);
            const videoTrack = stream.getVideoTracks()[0];

            const mimeType = this.getSupportedMimeType();
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: mimeType,
                videoBitsPerSecond: 8000000
            });

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                this.finishRecording();
            };

            this.mediaRecorder.start();

            // Record frame by frame
            for (let frame = 0; frame <= totalFrames; frame++) {
                const progress = frame / totalFrames;

                // Update animation
                this.animation.stepToProgress(progress);

                // Wait for map to render
                await this.waitForMapRender();

                // Draw map canvas to offscreen canvas
                ctx.drawImage(canvas, 0, 0, this.width, this.height);

                // Manually request frame
                if (videoTrack.requestFrame) {
                    videoTrack.requestFrame();
                }

                // Report progress
                if (this.onProgress) {
                    this.onProgress(progress);
                }

                // Small delay to allow encoding
                await new Promise(resolve => setTimeout(resolve, 1000 / this.fps));
            }

            this.mediaRecorder.stop();
            this.isRecording = false;

        } catch (error) {
            this.isRecording = false;
            console.error('Frame recording error:', error);
            if (this.onError) {
                this.onError(error);
            }
        }
    }

    waitForMapRender() {
        return new Promise(resolve => {
            this.map.map.once('render', resolve);
            this.map.triggerRepaint();
            // Fallback timeout
            setTimeout(resolve, 50);
        });
    }
}

// Export for use in other modules
window.VideoRecorder = VideoRecorder;
