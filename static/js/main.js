// Main application controller
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize components
    const gpxMap = new GPXMap('map');
    let animation = null;
    let recorder = null;

    // UI Elements
    const uploadZone = document.getElementById('uploadZone');
    const gpxInput = document.getElementById('gpxInput');
    const trackInfo = document.getElementById('trackInfo');
    const playBtn = document.getElementById('playBtn');
    const stopBtn = document.getElementById('stopBtn');
    const recordBtn = document.getElementById('recordBtn');
    const speedSlider = document.getElementById('speed');
    const speedValue = document.getElementById('speedValue');
    const altitudeSlider = document.getElementById('cameraAltitude');
    const altitudeValue = document.getElementById('altitudeValue');
    const pitchSlider = document.getElementById('cameraPitch');
    const pitchValue = document.getElementById('pitchValue');
    const resolutionSelect = document.getElementById('resolution');
    const customResolution = document.getElementById('customResolution');
    const customWidth = document.getElementById('customWidth');
    const customHeight = document.getElementById('customHeight');
    const fpsSelect = document.getElementById('fps');
    const videoFormatSelect = document.getElementById('videoFormat');
    const conversionStatus = document.getElementById('conversionStatus');
    const progress = document.getElementById('progress');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const loading = document.getElementById('loading');
    const mapStyleSelect = document.getElementById('mapStyle');

    // Show loading
    function showLoading(show = true) {
        loading.classList.toggle('hidden', !show);
    }

    // Initialize map with selected style
    showLoading(true);
    await gpxMap.init(mapStyleSelect.value);
    showLoading(false);

    // Map style change handler
    mapStyleSelect.addEventListener('change', (e) => {
        gpxMap.setMapStyle(e.target.value);
    });

    // File upload handling
    uploadZone.addEventListener('click', () => gpxInput.click());

    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });

    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('dragover');
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFile(files[0]);
        }
    });

    gpxInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    });

    async function handleFile(file) {
        if (!file.name.toLowerCase().endsWith('.gpx')) {
            alert('Please select a GPX file');
            return;
        }

        showLoading(true);

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Upload failed');
            }

            // Load track on map
            gpxMap.loadTrack(data);

            // Initialize animation and recorder
            animation = new FlyoverAnimation(gpxMap);
            recorder = new VideoRecorder(gpxMap, animation);

            // Apply current settings
            updateAnimationSettings();
            updateRecorderSettings();

            // Update track info
            const elevationGain = calculateElevationGain(data.points);
            const totalDistance = calculateTotalDistance(data.points);
            const estimatedDuration = totalDistance / 10; // 10 m/s at 1x speed
            trackInfo.innerHTML = `
                <div class="name">${data.name}</div>
                <div class="stats">
                    ${(totalDistance / 1000).toFixed(2)} km |
                    ${Math.round(data.bounds.minEle)}m - ${Math.round(data.bounds.maxEle)}m |
                    +${Math.round(elevationGain)}m |
                    ~${formatDuration(estimatedDuration)} @ 1x
                </div>
            `;
            trackInfo.classList.remove('hidden');

            // Enable controls
            playBtn.disabled = false;
            stopBtn.disabled = false;
            recordBtn.disabled = false;

        } catch (error) {
            alert('Error loading GPX file: ' + error.message);
        } finally {
            showLoading(false);
        }
    }

    function calculateElevationGain(points) {
        let gain = 0;
        for (let i = 1; i < points.length; i++) {
            const diff = points[i].ele - points[i - 1].ele;
            if (diff > 0) gain += diff;
        }
        return gain;
    }

    function calculateTotalDistance(points) {
        let distance = 0;
        const R = 6371000; // Earth's radius in meters

        for (let i = 1; i < points.length; i++) {
            const lat1 = points[i - 1].lat * Math.PI / 180;
            const lat2 = points[i].lat * Math.PI / 180;
            const dLat = lat2 - lat1;
            const dLon = (points[i].lon - points[i - 1].lon) * Math.PI / 180;

            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            distance += R * c;
        }
        return distance;
    }

    function formatDuration(seconds) {
        if (seconds < 60) {
            return `${Math.round(seconds)}s`;
        } else if (seconds < 3600) {
            const mins = Math.floor(seconds / 60);
            const secs = Math.round(seconds % 60);
            return `${mins}m ${secs}s`;
        } else {
            const hours = Math.floor(seconds / 3600);
            const mins = Math.round((seconds % 3600) / 60);
            return `${hours}h ${mins}m`;
        }
    }

    // Animation mode
    document.querySelectorAll('input[name="animationMode"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (animation) {
                animation.setMode(e.target.value);
            }
        });
    });

    // Speed slider
    speedSlider.addEventListener('input', (e) => {
        speedValue.textContent = e.target.value;
        if (animation) {
            animation.setSpeed(parseFloat(e.target.value));
        }
    });

    // Altitude slider
    altitudeSlider.addEventListener('input', (e) => {
        altitudeValue.textContent = e.target.value;
        if (animation) {
            animation.setCameraAltitude(parseInt(e.target.value));
        }
    });

    // Pitch slider
    pitchSlider.addEventListener('input', (e) => {
        pitchValue.textContent = e.target.value;
        if (animation) {
            animation.setCameraPitch(parseInt(e.target.value));
        }
    });

    // Resolution select
    resolutionSelect.addEventListener('change', (e) => {
        customResolution.classList.toggle('hidden', e.target.value !== 'custom');
        updateRecorderSettings();
    });

    customWidth.addEventListener('change', updateRecorderSettings);
    customHeight.addEventListener('change', updateRecorderSettings);
    fpsSelect.addEventListener('change', updateRecorderSettings);

    function updateAnimationSettings() {
        if (!animation) return;
        const mode = document.querySelector('input[name="animationMode"]:checked').value;
        animation.setMode(mode);
        animation.setSpeed(parseFloat(speedSlider.value));
        animation.setCameraAltitude(parseInt(altitudeSlider.value));
        animation.setCameraPitch(parseInt(pitchSlider.value));
    }

    function updateRecorderSettings() {
        if (!recorder) return;

        let width, height;
        if (resolutionSelect.value === 'custom') {
            width = parseInt(customWidth.value) || 1920;
            height = parseInt(customHeight.value) || 1080;
        } else {
            [width, height] = resolutionSelect.value.split('x').map(Number);
        }

        recorder.setResolution(width, height);
        recorder.setFPS(parseInt(fpsSelect.value));
        recorder.setOutputFormat(videoFormatSelect.value);
        
        // Set up status callback for conversion progress
        recorder.onStatusChange = (status) => {
            if (conversionStatus) {
                conversionStatus.textContent = status;
            }
        };
    }

    // Play button
    let isPlaying = false;
    playBtn.addEventListener('click', () => {
        if (!animation) return;

        if (isPlaying) {
            animation.pause();
            playBtn.innerHTML = `
                <svg viewBox="0 0 24 24" width="20" height="20">
                    <path fill="currentColor" d="M8 5v14l11-7z"/>
                </svg>
                Play
            `;
            isPlaying = false;
        } else {
            if (animation.isPaused) {
                animation.resume();
            } else {
                animation.onProgress = (p) => {
                    progressFill.style.width = (p * 100) + '%';
                    progressText.textContent = Math.round(p * 100) + '%';
                };
                animation.onComplete = () => {
                    isPlaying = false;
                    playBtn.innerHTML = `
                        <svg viewBox="0 0 24 24" width="20" height="20">
                            <path fill="currentColor" d="M8 5v14l11-7z"/>
                        </svg>
                        Play
                    `;
                    progress.classList.add('hidden');
                };
                progress.classList.remove('hidden');
                animation.start();
            }
            playBtn.innerHTML = `
                <svg viewBox="0 0 24 24" width="20" height="20">
                    <path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                </svg>
                Pause
            `;
            isPlaying = true;
        }
    });

    // Stop button
    stopBtn.addEventListener('click', () => {
        if (!animation) return;
        animation.stop();
        isPlaying = false;
        playBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="20" height="20">
                <path fill="currentColor" d="M8 5v14l11-7z"/>
            </svg>
            Play
        `;
        progress.classList.add('hidden');
        progressFill.style.width = '0%';
    });

    // Record button
    recordBtn.addEventListener('click', async () => {
        if (!recorder) return;

        if (recorder.isRecording) {
            recorder.stopRecording();
            recordBtn.classList.remove('recording');
            recordBtn.innerHTML = `
                <svg viewBox="0 0 24 24" width="20" height="20">
                    <circle fill="currentColor" cx="12" cy="12" r="8"/>
                </svg>
                Record Video
            `;
            return;
        }

        // Update settings before recording
        updateAnimationSettings();
        updateRecorderSettings();

        recorder.onProgress = (p) => {
            progressFill.style.width = (p * 100) + '%';
            progressText.textContent = `Recording: ${Math.round(p * 100)}%`;
        };

        recorder.onComplete = () => {
            recordBtn.classList.remove('recording');
            recordBtn.innerHTML = `
                <svg viewBox="0 0 24 24" width="20" height="20">
                    <circle fill="currentColor" cx="12" cy="12" r="8"/>
                </svg>
                Record Video
            `;
            progress.classList.add('hidden');
            alert('Video saved! Check your downloads folder.');
        };

        recorder.onError = (error) => {
            recordBtn.classList.remove('recording');
            recordBtn.innerHTML = `
                <svg viewBox="0 0 24 24" width="20" height="20">
                    <circle fill="currentColor" cx="12" cy="12" r="8"/>
                </svg>
                Record Video
            `;
            progress.classList.add('hidden');
            alert('Recording error: ' + error.message);
        };

        recordBtn.classList.add('recording');
        recordBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="20" height="20">
                <rect fill="currentColor" x="6" y="6" width="12" height="12"/>
            </svg>
            Stop Recording
        `;
        progress.classList.remove('hidden');

        await recorder.startRecording();
    });
});
