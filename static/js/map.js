// Map initialization and management
class GPXMap {
    constructor(containerId) {
        this.containerId = containerId;
        this.map = null;
        this.trackData = null;
        this.trackLayerId = 'gpx-track';
        this.trackSourceId = 'gpx-track-source';
        this.currentStyle = 'esri-satellite';

        // Define available map styles (using local tile cache proxy)
        this.mapStyles = {
            'esri-satellite': {
                name: 'ESRI Satellite',
                source: {
                    type: 'raster',
                    tiles: [
                        '/tiles/esri-satellite/{z}/{x}/{y}.png'
                    ],
                    tileSize: 256,
                    attribution: '&copy; Esri &mdash; Source: Esri, i-cubed, USDA, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP'
                },
                maxzoom: 18
            },
            'openstreetmap': {
                name: 'OpenStreetMap',
                source: {
                    type: 'raster',
                    tiles: [
                        '/tiles/openstreetmap/{z}/{x}/{y}.png'
                    ],
                    tileSize: 256,
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                },
                maxzoom: 19
            },
            'osm-topo': {
                name: 'OpenTopoMap',
                source: {
                    type: 'raster',
                    tiles: [
                        '/tiles/osm-topo/{z}/{x}/{y}.png'
                    ],
                    tileSize: 256,
                    attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)'
                },
                maxzoom: 17
            }
        };
    }

    getStyleConfig(styleKey) {
        const style = this.mapStyles[styleKey] || this.mapStyles['esri-satellite'];
        return {
            version: 8,
            sources: {
                'base-map': style.source,
                'terrain-source': {
                    type: 'raster-dem',
                    tiles: [
                        '/tiles/terrain/{z}/{x}/{y}.png'
                    ],
                    encoding: 'terrarium',
                    tileSize: 256,
                    maxzoom: 15
                }
            },
            layers: [
                {
                    id: 'base-layer',
                    type: 'raster',
                    source: 'base-map',
                    minzoom: 0,
                    maxzoom: style.maxzoom
                }
            ],
            terrain: {
                source: 'terrain-source',
                exaggeration: 1.5
            }
        };
    }

    async init(styleKey = 'esri-satellite') {
        this.currentStyle = styleKey;

        this.map = new maplibregl.Map({
            container: this.containerId,
            style: this.getStyleConfig(styleKey),
            center: [10.63, 46.89],
            zoom: 12,
            pitch: 60,
            bearing: 0,
            maxPitch: 85,
            antialias: true
        });

        // Add navigation controls
        this.map.addControl(new maplibregl.NavigationControl(), 'top-right');

        return new Promise((resolve) => {
            let resolved = false;

            const finishInit = () => {
                if (resolved) return;
                resolved = true;
                resolve(this);
            };

            this.map.on('load', finishInit);
            this.map.once('idle', finishInit);
            setTimeout(finishInit, 5000);

            this.map.on('error', (e) => {
                console.warn('Map error:', e.error?.message || e);
            });
        });
    }

    loadTrack(trackData) {
        this.trackData = trackData;

        // Remove existing track if any
        if (this.map.getLayer(this.trackLayerId)) {
            this.map.removeLayer(this.trackLayerId);
        }
        if (this.map.getSource(this.trackSourceId)) {
            this.map.removeSource(this.trackSourceId);
        }

        // Create GeoJSON from track points
        const coordinates = trackData.points.map(p => [p.lon, p.lat, p.ele]);

        this.map.addSource(this.trackSourceId, {
            type: 'geojson',
            data: {
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: coordinates
                }
            }
        });

        // Add track line layer
        this.map.addLayer({
            id: this.trackLayerId,
            type: 'line',
            source: this.trackSourceId,
            layout: {
                'line-join': 'round',
                'line-cap': 'round'
            },
            paint: {
                'line-color': '#e94560',
                'line-width': 4,
                'line-opacity': 0.9
            }
        });

        // Fit map to track bounds with padding
        const bounds = new maplibregl.LngLatBounds(
            [trackData.bounds.minLon, trackData.bounds.minLat],
            [trackData.bounds.maxLon, trackData.bounds.maxLat]
        );

        this.map.fitBounds(bounds, {
            padding: { top: 100, bottom: 100, left: 100, right: 100 },
            pitch: 60,
            duration: 1500
        });
    }

    getTrackPoints() {
        return this.trackData?.points || [];
    }

    setCamera(options) {
        this.map.easeTo({
            center: options.center,
            zoom: options.zoom,
            pitch: options.pitch,
            bearing: options.bearing,
            duration: options.duration || 0
        });
    }

    jumpTo(options) {
        this.map.jumpTo({
            center: options.center,
            zoom: options.zoom,
            pitch: options.pitch,
            bearing: options.bearing
        });
    }

    setMapStyle(styleKey) {
        if (!this.mapStyles[styleKey] || styleKey === this.currentStyle) {
            return;
        }

        // Save current camera position
        const center = this.map.getCenter();
        const zoom = this.map.getZoom();
        const pitch = this.map.getPitch();
        const bearing = this.map.getBearing();

        // Save track data
        const savedTrackData = this.trackData;

        this.currentStyle = styleKey;

        // Set new style
        this.map.setStyle(this.getStyleConfig(styleKey));

        // Restore state after style loads
        let restored = false;
        const restoreState = () => {
            if (restored) return;
            restored = true;

            // Restore camera
            this.map.jumpTo({ center, zoom, pitch, bearing });

            // Re-add track if it existed
            if (savedTrackData) {
                this.loadTrack(savedTrackData);
            }
        };

        this.map.once('style.load', restoreState);
        this.map.once('idle', restoreState);
        setTimeout(restoreState, 3000);
    }

    getCanvas() {
        return this.map.getCanvas();
    }

    resize() {
        this.map.resize();
    }

    triggerRepaint() {
        this.map.triggerRepaint();
    }
}

// Export for use in other modules
window.GPXMap = GPXMap;
