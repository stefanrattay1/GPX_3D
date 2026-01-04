// Animation system for GPX flyover
class FlyoverAnimation {
    constructor(gpxMap) {
        this.map = gpxMap;
        this.isPlaying = false;
        this.isPaused = false;
        this.currentIndex = 0;
        this.animationFrame = null;
        this.lastTimestamp = 0;
        this.progress = 0;

        // Animation settings
        this.mode = 'follow'; // 'follow' or 'birdseye'
        this.speed = 1;
        this.cameraAltitude = 100;
        this.cameraPitch = 60;

        // Distance-based animation data (for constant speed)
        this.cumulativeDistances = null;
        this.totalDistance = 0;
        this.distanceDataInitialized = false;

        // Terrain-aware camera settings
        this.terrainSampleCount = 20; // Number of points to sample along sight line
        this.minTerrainClearance = 80; // Minimum meters above terrain (increased significantly)
        this.terrainLookAhead = 400; // Meters to look ahead for terrain clearance
        this.cameraDistance = 150; // Distance behind track point
        this.terrainExaggeration = 1.5; // Must match map terrain exaggeration

        // Smoothing for camera altitude changes
        this.lastCameraAltitude = null;
        this.altitudeSmoothingFactor = 0.05; // Lower = smoother, slower response

        // Bearing smoothing for smoother turns
        this.lastBearing = null;
        this.bearingSmoothingFactor = 0.06; // Lower = smoother turns
        this.bearingHistory = []; // Store recent bearings for averaging
        this.bearingHistorySize = 20; // Number of bearings to average

        // Position smoothing (inertia) for smoother movement on switchbacks
        this.lastSmoothedPosition = null;
        this.positionSmoothingFactor = 0.15; // Lower = more inertia

        // Progress marker
        this.progressMarker = null;
        this.progressMarkerSourceId = 'progress-marker-source';
        this.progressMarkerLayerId = 'progress-marker-layer';
        this.progressMarkerOutlineLayerId = 'progress-marker-outline-layer';

        // Callbacks
        this.onProgress = null;
        this.onComplete = null;
        this.onFrame = null;
    }

    setMode(mode) {
        this.mode = mode;
    }

    setSpeed(speed) {
        this.speed = speed;
    }

    setCameraAltitude(altitude) {
        this.cameraAltitude = altitude;
    }

    setCameraPitch(pitch) {
        this.cameraPitch = pitch;
    }

    // Initialize distance data for constant-speed animation
    initializeDistanceData() {
        const points = this.map.getTrackPoints();
        if (!points || points.length < 2) {
            this.distanceDataInitialized = false;
            return;
        }

        this.cumulativeDistances = [0];
        this.totalDistance = 0;

        for (let i = 1; i < points.length; i++) {
            const dist = this.calculateDistance(points[i - 1], points[i]);
            this.totalDistance += dist;
            this.cumulativeDistances.push(this.totalDistance);
        }

        this.distanceDataInitialized = true;
        console.log(`Track initialized: ${points.length} points, ${(this.totalDistance / 1000).toFixed(2)} km total distance`);
    }

    // Find segment index using binary search for efficiency
    findSegmentAtDistance(targetDistance) {
        const distances = this.cumulativeDistances;
        let left = 0;
        let right = distances.length - 1;

        while (left < right - 1) {
            const mid = Math.floor((left + right) / 2);
            if (distances[mid] <= targetDistance) {
                left = mid;
            } else {
                right = mid;
            }
        }

        return left;
    }

    calculateBearing(point1, point2) {
        const lat1 = point1.lat * Math.PI / 180;
        const lat2 = point2.lat * Math.PI / 180;
        const dLon = (point2.lon - point1.lon) * Math.PI / 180;

        const y = Math.sin(dLon) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

        let bearing = Math.atan2(y, x) * 180 / Math.PI;
        return (bearing + 360) % 360;
    }

    calculateDistance(point1, point2) {
        const R = 6371000; // Earth's radius in meters
        const lat1 = point1.lat * Math.PI / 180;
        const lat2 = point2.lat * Math.PI / 180;
        const dLat = lat2 - lat1;
        const dLon = (point2.lon - point1.lon) * Math.PI / 180;

        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    }

    interpolate(point1, point2, t) {
        return {
            lat: point1.lat + (point2.lat - point1.lat) * t,
            lon: point1.lon + (point2.lon - point1.lon) * t,
            ele: point1.ele + (point2.ele - point1.ele) * t
        };
    }

    // Smoothing function for camera movement
    easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    // Normalize bearing to 0-360 range
    normalizeBearing(bearing) {
        return ((bearing % 360) + 360) % 360;
    }

    // Calculate shortest angular difference between two bearings
    bearingDifference(b1, b2) {
        let diff = this.normalizeBearing(b2 - b1);
        if (diff > 180) diff -= 360;
        return diff;
    }

    // Smooth bearing using exponential moving average with angular interpolation
    // Smoothing is speed-dependent: higher speeds = more smoothing
    smoothBearing(newBearing) {
        // Calculate speed-dependent smoothing parameters
        // At speed 1x: base values, at higher speeds: more smoothing
        const speedFactor = Math.max(1, this.speed);
        
        // Smoothing factor decreases with speed (more smoothing at high speed)
        // Base: 0.06 at 1x, down to 0.015 at 20x
        const dynamicSmoothingFactor = Math.max(0.015, 0.06 / Math.sqrt(speedFactor));
        
        // History size increases with speed (more averaging at high speed)
        // Base: 20 at 1x, up to 60 at 20x
        const dynamicHistorySize = Math.min(60, Math.floor(20 * Math.sqrt(speedFactor)));

        if (this.lastBearing === null) {
            this.lastBearing = newBearing;
            this.bearingHistory = [newBearing];
            return newBearing;
        }

        // Add to history
        this.bearingHistory.push(newBearing);
        while (this.bearingHistory.length > dynamicHistorySize) {
            this.bearingHistory.shift();
        }

        // Calculate weighted average bearing using circular mean
        let sinSum = 0;
        let cosSum = 0;
        const weights = [];
        let weightSum = 0;

        // More recent bearings get higher weight
        for (let i = 0; i < this.bearingHistory.length; i++) {
            const weight = (i + 1) / this.bearingHistory.length;
            weights.push(weight);
            weightSum += weight;
        }

        for (let i = 0; i < this.bearingHistory.length; i++) {
            const rad = this.bearingHistory[i] * Math.PI / 180;
            const normalizedWeight = weights[i] / weightSum;
            sinSum += Math.sin(rad) * normalizedWeight;
            cosSum += Math.cos(rad) * normalizedWeight;
        }

        const avgBearing = Math.atan2(sinSum, cosSum) * 180 / Math.PI;
        const normalizedAvg = this.normalizeBearing(avgBearing);

        // Apply additional exponential smoothing with speed-dependent factor
        const diff = this.bearingDifference(this.lastBearing, normalizedAvg);
        this.lastBearing = this.normalizeBearing(this.lastBearing + diff * dynamicSmoothingFactor);

        return this.lastBearing;
    }

    // Smooth position to add inertia - prevents jitter on tight switchbacks
    // Speed-dependent: higher speeds = more inertia
    smoothPosition(newPosition) {
        if (this.lastSmoothedPosition === null) {
            this.lastSmoothedPosition = { ...newPosition };
            return newPosition;
        }

        // Speed-dependent smoothing factor
        // At 1x: 0.15 (responsive), at 20x: 0.04 (lots of inertia)
        const speedFactor = Math.max(1, this.speed);
        const dynamicFactor = Math.max(0.04, this.positionSmoothingFactor / Math.sqrt(speedFactor));

        // Apply exponential smoothing to lat, lon, ele
        this.lastSmoothedPosition.lat += (newPosition.lat - this.lastSmoothedPosition.lat) * dynamicFactor;
        this.lastSmoothedPosition.lon += (newPosition.lon - this.lastSmoothedPosition.lon) * dynamicFactor;
        this.lastSmoothedPosition.ele += (newPosition.ele - this.lastSmoothedPosition.ele) * dynamicFactor;

        return {
            lat: this.lastSmoothedPosition.lat,
            lon: this.lastSmoothedPosition.lon,
            ele: this.lastSmoothedPosition.ele
        };
    }

    // Get point at progress using distance-based interpolation for constant speed
    getPointAtProgress(progress) {
        const points = this.map.getTrackPoints();
        if (!points || points.length < 2) return null;

        // Ensure distance data is initialized
        if (!this.distanceDataInitialized) {
            this.initializeDistanceData();
        }

        // Clamp progress to valid range
        progress = Math.max(0, Math.min(1, progress));

        // Convert progress to target distance
        const targetDistance = progress * this.totalDistance;

        // Find the segment containing this distance using binary search
        const segmentIndex = this.findSegmentAtDistance(targetDistance);

        const point1 = points[segmentIndex];
        const point2 = points[Math.min(segmentIndex + 1, points.length - 1)];

        if (!point1 || !point2) return null;

        // Calculate interpolation factor within the segment
        const segmentStartDist = this.cumulativeDistances[segmentIndex];
        const segmentEndDist = this.cumulativeDistances[Math.min(segmentIndex + 1, this.cumulativeDistances.length - 1)];
        const segmentLength = segmentEndDist - segmentStartDist;

        // t is the interpolation factor (0-1) within this segment
        const t = segmentLength > 0 ? (targetDistance - segmentStartDist) / segmentLength : 0;
        
        const rawPos = this.interpolate(point1, point2, t);
        
        // Apply position smoothing (inertia) to reduce jitter on switchbacks
        const currentPos = this.smoothPosition(rawPos);

        // Calculate mean direction from past and future 400m for smooth viewing angle
        const meanDirectionBearing = this.calculateMeanDirectionBearing(targetDistance, rawPos, points);
        
        // Calculate immediate bearing (short look-ahead of 50m)
        const immediateLookAhead = Math.min(this.totalDistance, targetDistance + 50);
        const immedSegmentIndex = this.findSegmentAtDistance(immediateLookAhead);
        const immedSegmentStartDist = this.cumulativeDistances[immedSegmentIndex];
        const immedSegmentEndDist = this.cumulativeDistances[Math.min(immedSegmentIndex + 1, this.cumulativeDistances.length - 1)];
        const immedSegmentLength = immedSegmentEndDist - immedSegmentStartDist;
        const immedT = immedSegmentLength > 0 ? (immediateLookAhead - immedSegmentStartDist) / immedSegmentLength : 0;
        const immedPoint1 = points[immedSegmentIndex];
        const immedPoint2 = points[Math.min(immedSegmentIndex + 1, points.length - 1)];
        const immediateLookAheadPos = this.interpolate(immedPoint1, immedPoint2, immedT);
        const immediateBearing = this.calculateBearing(rawPos, immediateLookAheadPos);

        // Blend ratio is speed-dependent: higher speeds rely more on mean direction
        // At 1x: 80% mean, 20% immediate. At 20x: 95% mean, 5% immediate
        const speedFactor = Math.max(1, this.speed);
        const meanWeight = Math.min(0.95, 0.80 + 0.015 * (speedFactor - 1));
        const blendedBearing = this.blendBearings(meanDirectionBearing, immediateBearing, meanWeight);
        
        // Apply bearing smoothing for gradual turns
        const smoothedBearing = this.smoothBearing(blendedBearing);

        return {
            position: currentPos,       // Smoothed position for camera
            rawPosition: rawPos,        // Raw position for marker (stays on track)
            bearing: smoothedBearing,
            rawBearing: blendedBearing,
            index: segmentIndex
        };
    }

    // Calculate mean direction bearing from past and future distance along track
    // Look distance is speed-dependent: higher speeds look further ahead
    calculateMeanDirectionBearing(currentDistance, currentPos, points) {
        // Speed-dependent look distance: 400m at 1x, up to 1200m at 20x
        const speedFactor = Math.max(1, this.speed);
        const lookDistance = Math.min(1200, 400 * Math.sqrt(speedFactor)); // meters to look back and forward
        
        // Get position behind (or start if not enough distance)
        const pastDistance = Math.max(0, currentDistance - lookDistance);
        const pastSegmentIndex = this.findSegmentAtDistance(pastDistance);
        const pastSegmentStartDist = this.cumulativeDistances[pastSegmentIndex];
        const pastSegmentEndDist = this.cumulativeDistances[Math.min(pastSegmentIndex + 1, this.cumulativeDistances.length - 1)];
        const pastSegmentLength = pastSegmentEndDist - pastSegmentStartDist;
        const pastT = pastSegmentLength > 0 ? (pastDistance - pastSegmentStartDist) / pastSegmentLength : 0;
        const pastPoint1 = points[pastSegmentIndex];
        const pastPoint2 = points[Math.min(pastSegmentIndex + 1, points.length - 1)];
        const pastPos = this.interpolate(pastPoint1, pastPoint2, pastT);

        // Get position ahead (or end if not enough distance)
        const futureDistance = Math.min(this.totalDistance, currentDistance + lookDistance);
        const futureSegmentIndex = this.findSegmentAtDistance(futureDistance);
        const futureSegmentStartDist = this.cumulativeDistances[futureSegmentIndex];
        const futureSegmentEndDist = this.cumulativeDistances[Math.min(futureSegmentIndex + 1, this.cumulativeDistances.length - 1)];
        const futureSegmentLength = futureSegmentEndDist - futureSegmentStartDist;
        const futureT = futureSegmentLength > 0 ? (futureDistance - futureSegmentStartDist) / futureSegmentLength : 0;
        const futurePoint1 = points[futureSegmentIndex];
        const futurePoint2 = points[Math.min(futureSegmentIndex + 1, points.length - 1)];
        const futurePos = this.interpolate(futurePoint1, futurePoint2, futureT);

        // Calculate bearing from past position to future position (mean direction)
        return this.calculateBearing(pastPos, futurePos);
    }

    // Blend two bearings with given weight for first bearing
    blendBearings(bearing1, bearing2, weight1) {
        // Convert to radians
        const rad1 = bearing1 * Math.PI / 180;
        const rad2 = bearing2 * Math.PI / 180;
        
        // Use weighted circular mean
        const sinSum = Math.sin(rad1) * weight1 + Math.sin(rad2) * (1 - weight1);
        const cosSum = Math.cos(rad1) * weight1 + Math.cos(rad2) * (1 - weight1);
        
        const blendedRad = Math.atan2(sinSum, cosSum);
        return this.normalizeBearing(blendedRad * 180 / Math.PI);
    }

    // Convert meters to lat/lon offsets
    metersToLatLon(meters, bearing, latitude) {
        const bearingRad = bearing * Math.PI / 180;
        const latOffset = (meters / 111320) * Math.cos(bearingRad);
        const lonOffset = (meters / (111320 * Math.cos(latitude * Math.PI / 180))) * Math.sin(bearingRad);
        return { latOffset, lonOffset };
    }

    // Query terrain elevation at a point (with fallback to track data)
    queryTerrainElevation(lon, lat, fallbackElevation = null) {
        const map = this.map.map;
        if (!map) return fallbackElevation || 0;

        try {
            const elevation = map.queryTerrainElevation([lon, lat]);
            if (elevation !== null && elevation > 0) {
                // Account for terrain exaggeration - the visual terrain is higher than the query returns
                return elevation * this.terrainExaggeration;
            }
            // If terrain query fails, use fallback elevation (from GPX data)
            return fallbackElevation || 0;
        } catch (e) {
            return fallbackElevation || 0;
        }
    }

    // Get elevation from track points near a location
    getTrackElevationNear(lon, lat) {
        const points = this.map.getTrackPoints();
        if (!points || points.length === 0) return 0;

        let minDist = Infinity;
        let nearestEle = 0;

        for (const point of points) {
            const dist = Math.sqrt(
                Math.pow(point.lon - lon, 2) + Math.pow(point.lat - lat, 2)
            );
            if (dist < minDist) {
                minDist = dist;
                nearestEle = point.ele || 0;
            }
        }

        return nearestEle;
    }

    // Sample terrain elevation along a path and find maximum height
    sampleTerrainAlongPath(startLon, startLat, endLon, endLat, numSamples, baseElevation = 0) {
        let maxElevation = baseElevation;

        for (let i = 0; i <= numSamples; i++) {
            const t = i / numSamples;
            const lon = startLon + (endLon - startLon) * t;
            const lat = startLat + (endLat - startLat) * t;
            // Use track elevation as fallback
            const trackEle = this.getTrackElevationNear(lon, lat);
            const elevation = this.queryTerrainElevation(lon, lat, trackEle);
            maxElevation = Math.max(maxElevation, elevation);
        }

        return maxElevation;
    }

    // Calculate minimum camera altitude needed for clear line of sight
    // This uses proper geometry: the line from camera to lookAt point must clear all terrain
    calculateLineOfSightClearance(cameraLon, cameraLat, lookAtLon, lookAtLat, lookAtAlt, numSamples) {
        let minRequiredCamAlt = 0;
        const clearance = this.minTerrainClearance; // meters above terrain at each point along sight line

        for (let i = 0; i <= numSamples; i++) {
            const t = i / numSamples;
            
            // Skip points very close to lookAt (t approaching 1 causes division issues)
            if (t >= 0.98) continue;
            
            // Sample point along the line from camera to lookAt
            const lon = cameraLon + (lookAtLon - cameraLon) * t;
            const lat = cameraLat + (lookAtLat - cameraLat) * t;
            
            // Get terrain elevation at this sample point
            const trackEle = this.getTrackElevationNear(lon, lat);
            const terrainAlt = this.queryTerrainElevation(lon, lat, trackEle);
            
            // The line of sight altitude at parameter t is:
            // losAlt(t) = camAlt * (1 - t) + lookAtAlt * t
            // We need: losAlt(t) >= terrainAlt + clearance
            // Solving for camAlt:
            // camAlt * (1 - t) + lookAtAlt * t >= terrainAlt + clearance
            // camAlt * (1 - t) >= terrainAlt + clearance - lookAtAlt * t
            // camAlt >= (terrainAlt + clearance - lookAtAlt * t) / (1 - t)
            
            const requiredCamAlt = (terrainAlt + clearance - lookAtAlt * t) / (1 - t);
            minRequiredCamAlt = Math.max(minRequiredCamAlt, requiredCamAlt);
        }

        return minRequiredCamAlt;
    }

    // Smooth camera altitude changes to prevent jarring movements
    smoothAltitude(targetAltitude) {
        if (this.lastCameraAltitude === null) {
            this.lastCameraAltitude = targetAltitude;
            return targetAltitude;
        }

        // When going UP - respond immediately to avoid terrain collision
        // When going DOWN - respond slowly for smooth descent
        if (targetAltitude > this.lastCameraAltitude) {
            // Going up - NEVER allow camera to be below required altitude
            // Use immediate response to avoid terrain
            this.lastCameraAltitude = targetAltitude;
        } else {
            // Going down - use slower response for smooth descent
            this.lastCameraAltitude = this.lastCameraAltitude +
                (targetAltitude - this.lastCameraAltitude) * this.altitudeSmoothingFactor;
        }

        return this.lastCameraAltitude;
    }

    // Calculate terrain-aware camera position
    getCameraPosition(trackPosition) {
        const { position, bearing } = trackPosition;
        const map = this.map.map;

        // Use track point elevation as base reference (with exaggeration)
        const trackPointElevation = (position.ele || 0) * this.terrainExaggeration;

        if (this.mode === 'follow') {
            // Follow mode: camera behind and above the current position
            const offsetDistance = this.cameraDistance; // meters behind

            // Calculate camera ground position (behind the track)
            const backBearing = (bearing + 180) % 360;
            const { latOffset, lonOffset } = this.metersToLatLon(offsetDistance, backBearing, position.lat);
            const cameraLon = position.lon + lonOffset;
            const cameraLat = position.lat + latOffset;

            // The look-at point is slightly ahead of current position
            const lookAtDistance = 30; // meters ahead of current position
            const { latOffset: lookLatOffset, lonOffset: lookLonOffset } = 
                this.metersToLatLon(lookAtDistance, bearing, position.lat);
            const lookAtLon = position.lon + lookLonOffset;
            const lookAtLat = position.lat + lookLatOffset;

            // Get terrain at look-at point
            const lookAtTerrainEle = this.queryTerrainElevation(lookAtLon, lookAtLat, trackPointElevation);
            // The look-at altitude should be at or slightly above track/terrain level
            const lookAtAlt = Math.max(trackPointElevation, lookAtTerrainEle) + 5;

            // CRITICAL: Calculate minimum camera altitude for clear line of sight
            // Sample many points between camera and look-at point
            const lineOfSightCamAlt = this.calculateLineOfSightClearance(
                cameraLon, cameraLat,
                lookAtLon, lookAtLat,
                lookAtAlt,
                30 // Many samples for accuracy
            );

            // Also check terrain directly under camera
            const cameraGroundElevation = this.queryTerrainElevation(cameraLon, cameraLat, trackPointElevation);

            // Camera must be:
            // 1. High enough for line-of-sight clearance
            // 2. Above the terrain directly beneath it
            // 3. Plus the user-configured altitude offset
            const minAltForLoS = lineOfSightCamAlt + this.cameraAltitude;
            const minAltForGround = cameraGroundElevation + this.cameraAltitude + this.minTerrainClearance;
            
            const rawAltitude = Math.max(minAltForLoS, minAltForGround);
            const requiredAltitude = this.smoothAltitude(rawAltitude);

            // Use Free Camera API for precise 3D positioning
            if (map && typeof maplibregl !== 'undefined') {
                try {
                    const camera = map.getFreeCameraOptions();

                    // Set camera position in 3D space
                    camera.position = maplibregl.MercatorCoordinate.fromLngLat(
                        [cameraLon, cameraLat],
                        requiredAltitude
                    );

                    // Look at the point ahead of current track position
                    camera.lookAtPoint([lookAtLon, lookAtLat], lookAtAlt);

                    return { freeCamera: camera };
                } catch (e) {
                    console.warn('Free camera API failed, falling back to standard camera:', e);
                }
            }

            // Fallback to standard camera positioning
            return {
                center: [position.lon, position.lat],
                zoom: this.calculateZoom(this.cameraAltitude),
                pitch: this.cameraPitch,
                bearing: bearing
            };
        } else {
            // Bird's eye mode: camera directly above looking down
            const trackElevation = this.queryTerrainElevation(position.lon, position.lat);

            // Sample terrain in a wider area for bird's eye view
            let maxTerrainHeight = trackElevation;
            const sampleRadius = 500; // meters

            for (let angle = 0; angle < 360; angle += 45) {
                const { latOffset, lonOffset } = this.metersToLatLon(sampleRadius, angle, position.lat);
                const sampleLon = position.lon + lonOffset;
                const sampleLat = position.lat + latOffset;
                const elevation = this.queryTerrainElevation(sampleLon, sampleLat);
                maxTerrainHeight = Math.max(maxTerrainHeight, elevation);
            }

            const requiredAltitude = maxTerrainHeight + (this.cameraAltitude * 3) + this.minTerrainClearance;

            // Use Free Camera for bird's eye view as well
            if (map && typeof maplibregl !== 'undefined') {
                try {
                    const camera = map.getFreeCameraOptions();

                    camera.position = maplibregl.MercatorCoordinate.fromLngLat(
                        [position.lon, position.lat],
                        requiredAltitude
                    );

                    // Look at current position with slight forward offset
                    const { latOffset, lonOffset } = this.metersToLatLon(50, bearing, position.lat);
                    camera.lookAtPoint([position.lon + lonOffset, position.lat + latOffset]);

                    return { freeCamera: camera };
                } catch (e) {
                    console.warn('Free camera API failed, falling back to standard camera:', e);
                }
            }

            // Fallback
            return {
                center: [position.lon, position.lat],
                zoom: this.calculateZoom(this.cameraAltitude * 3),
                pitch: this.cameraPitch,
                bearing: bearing
            };
        }
    }

    calculateZoom(altitude) {
        // Approximate zoom level based on altitude
        // Higher altitude = lower zoom
        return Math.max(10, Math.min(18, 18 - Math.log2(altitude / 50)));
    }

    start() {
        if (this.isPlaying) return;

        const points = this.map.getTrackPoints();
        if (points.length < 2) {
            console.error('Not enough track points for animation');
            return;
        }

        // Initialize distance data for constant-speed animation
        this.initializeDistanceData();

        // Reset altitude, bearing, and position smoothing for fresh start
        this.lastCameraAltitude = null;
        this.lastBearing = null;
        this.bearingHistory = [];
        this.lastSmoothedPosition = null;

        // Initialize and show progress marker
        this.initProgressMarker();

        this.isPlaying = true;
        this.isPaused = false;
        this.progress = 0;
        this.lastTimestamp = performance.now();

        this.animate();
    }

    pause() {
        this.isPaused = true;
    }

    resume() {
        if (!this.isPlaying) return;
        this.isPaused = false;
        this.lastTimestamp = performance.now();
        this.animate();
    }

    stop() {
        this.isPlaying = false;
        this.isPaused = false;
        this.progress = 0;
        this.lastCameraAltitude = null; // Reset altitude smoothing
        this.lastBearing = null; // Reset bearing smoothing
        this.bearingHistory = [];
        this.lastSmoothedPosition = null; // Reset position smoothing
        
        // Hide progress marker
        this.setProgressMarkerVisible(false);
        
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
    }

    // Apply camera position (handles both Free Camera and standard positioning)
    applyCameraPosition(cameraPosition) {
        const map = this.map.map;
        if (!map) return;

        if (cameraPosition.freeCamera) {
            // Use Free Camera API for precise 3D positioning
            map.setFreeCameraOptions(cameraPosition.freeCamera);
        } else {
            // Fallback to standard jumpTo
            this.map.jumpTo(cameraPosition);
        }
    }

    animate(timestamp) {
        if (!this.isPlaying || this.isPaused) return;

        timestamp = timestamp || performance.now();
        const deltaTime = timestamp - this.lastTimestamp;
        this.lastTimestamp = timestamp;

        // Calculate progress increment based on speed and total distance
        // Base speed: 110 meters per second at 1x speed (fast flyover pace)
        const baseSpeedMps = 160; // meters per second
        const effectiveSpeed = baseSpeedMps * this.speed;
        const distanceThisFrame = effectiveSpeed * (deltaTime / 1000);
        const progressIncrement = this.totalDistance > 0 ? distanceThisFrame / this.totalDistance : 0;

        this.progress = Math.min(1, this.progress + progressIncrement);

        // Get current position on track
        const trackPosition = this.getPointAtProgress(this.progress);
        if (trackPosition) {
            const cameraPosition = this.getCameraPosition(trackPosition);
            this.applyCameraPosition(cameraPosition);
            
            // Update progress marker position (use raw position to stay on track)
            this.updateProgressMarker(trackPosition.rawPosition);
        }

        // Fire callbacks
        if (this.onProgress) {
            this.onProgress(this.progress);
        }

        if (this.onFrame) {
            this.onFrame(this.progress);
        }

        // Check if complete
        if (this.progress >= 1) {
            this.isPlaying = false;
            if (this.onComplete) {
                this.onComplete();
            }
            return;
        }

        this.animationFrame = requestAnimationFrame((ts) => this.animate(ts));
    }

    // For recording: step through animation frame by frame
    stepToProgress(progress) {
        // Ensure distance data is initialized for recording
        if (!this.distanceDataInitialized) {
            this.initializeDistanceData();
        }

        // Reset smoothing at the start of recording
        if (progress === 0 || progress < this.progress) {
            this.lastCameraAltitude = null;
            this.lastBearing = null;
            this.bearingHistory = [];
            this.lastSmoothedPosition = null;
            // Initialize marker for recording
            this.initProgressMarker();
        }

        this.progress = progress;
        const trackPosition = this.getPointAtProgress(progress);
        if (trackPosition) {
            const cameraPosition = this.getCameraPosition(trackPosition);
            this.applyCameraPosition(cameraPosition);
            
            // Update progress marker position (use raw position to stay on track)
            this.updateProgressMarker(trackPosition.rawPosition);
            
            this.map.triggerRepaint();
        }
    }

    getTotalDuration() {
        // Return estimated duration in seconds based on distance and speed
        // Base speed: 160 meters per second at 1x
        if (!this.distanceDataInitialized) {
            this.initializeDistanceData();
        }

        const baseSpeedMps = 160;
        const effectiveSpeed = baseSpeedMps * this.speed;
        return this.totalDistance > 0 ? this.totalDistance / effectiveSpeed : 160;
    }

    // Get total track distance in meters
    getTotalDistance() {
        if (!this.distanceDataInitialized) {
            this.initializeDistanceData();
        }
        return this.totalDistance;
    }

    // Initialize the progress marker on the map
    initProgressMarker() {
        const map = this.map.map;
        if (!map) return;

        // Remove existing marker layers/sources if they exist
        this.removeProgressMarker();

        // Add source for the marker
        map.addSource(this.progressMarkerSourceId, {
            type: 'geojson',
            data: {
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [0, 0]
                }
            }
        });

        // Add outer glow/outline layer
        map.addLayer({
            id: this.progressMarkerOutlineLayerId,
            type: 'circle',
            source: this.progressMarkerSourceId,
            paint: {
                'circle-radius': 18,
                'circle-color': '#ffffff',
                'circle-opacity': 0.6,
                'circle-blur': 0.5
            }
        });

        // Add main marker layer - big visible dot
        map.addLayer({
            id: this.progressMarkerLayerId,
            type: 'circle',
            source: this.progressMarkerSourceId,
            paint: {
                'circle-radius': 12,
                'circle-color': '#00ff00',
                'circle-stroke-width': 3,
                'circle-stroke-color': '#ffffff',
                'circle-opacity': 1
            }
        });
    }

    // Update the progress marker position
    updateProgressMarker(position) {
        const map = this.map.map;
        if (!map) return;

        const source = map.getSource(this.progressMarkerSourceId);
        if (!source) {
            // Initialize marker if it doesn't exist
            this.initProgressMarker();
            return this.updateProgressMarker(position);
        }

        source.setData({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [position.lon, position.lat]
            },
            properties: {
                elevation: position.ele || 0
            }
        });
    }

    // Remove the progress marker from the map
    removeProgressMarker() {
        const map = this.map.map;
        if (!map) return;

        if (map.getLayer(this.progressMarkerLayerId)) {
            map.removeLayer(this.progressMarkerLayerId);
        }
        if (map.getLayer(this.progressMarkerOutlineLayerId)) {
            map.removeLayer(this.progressMarkerOutlineLayerId);
        }
        if (map.getSource(this.progressMarkerSourceId)) {
            map.removeSource(this.progressMarkerSourceId);
        }
    }

    // Show or hide the progress marker
    setProgressMarkerVisible(visible) {
        const map = this.map.map;
        if (!map) return;

        if (visible) {
            if (!map.getSource(this.progressMarkerSourceId)) {
                this.initProgressMarker();
            }
            if (map.getLayer(this.progressMarkerLayerId)) {
                map.setLayoutProperty(this.progressMarkerLayerId, 'visibility', 'visible');
            }
            if (map.getLayer(this.progressMarkerOutlineLayerId)) {
                map.setLayoutProperty(this.progressMarkerOutlineLayerId, 'visibility', 'visible');
            }
        } else {
            if (map.getLayer(this.progressMarkerLayerId)) {
                map.setLayoutProperty(this.progressMarkerLayerId, 'visibility', 'none');
            }
            if (map.getLayer(this.progressMarkerOutlineLayerId)) {
                map.setLayoutProperty(this.progressMarkerOutlineLayerId, 'visibility', 'none');
            }
        }
    }
}

// Export for use in other modules
window.FlyoverAnimation = FlyoverAnimation;
