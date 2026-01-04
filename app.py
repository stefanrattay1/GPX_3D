from flask import Flask, render_template, request, jsonify, send_file, Response
import gpxpy
import os
import uuid
import requests
import hashlib
from pathlib import Path

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['TILE_CACHE_FOLDER'] = 'tile_cache'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['TILE_CACHE_FOLDER'], exist_ok=True)

# Tile provider configurations
TILE_PROVIDERS = {
    'esri-satellite': {
        'url': 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        'headers': {'User-Agent': 'GPX-3D-Flyover/1.0'}
    },
    'openstreetmap': {
        'url': 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        'headers': {'User-Agent': 'GPX-3D-Flyover/1.0'}
    },
    'osm-topo': {
        'url': 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
        'headers': {'User-Agent': 'GPX-3D-Flyover/1.0'}
    },
    'terrain': {
        'url': 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
        'headers': {'User-Agent': 'GPX-3D-Flyover/1.0'}
    }
}


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/tiles/<provider>/<int:z>/<int:x>/<int:y>.png')
def get_tile(provider, z, x, y):
    """Proxy and cache map tiles locally."""
    if provider not in TILE_PROVIDERS:
        return jsonify({'error': 'Unknown tile provider'}), 404

    # Create cache path
    cache_dir = Path(app.config['TILE_CACHE_FOLDER']) / provider / str(z) / str(x)
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_file = cache_dir / f'{y}.png'

    # Serve from cache if exists
    if cache_file.exists():
        try:
            data = cache_file.read_bytes()
            response = Response(data, mimetype='image/png')
            response.headers['Content-Length'] = len(data)
            response.headers['Cache-Control'] = 'public, max-age=86400'
            return response
        except Exception:
            pass  # Fall through to fetch

    # Fetch from remote
    config = TILE_PROVIDERS[provider]
    url = config['url'].format(z=z, x=x, y=y)

    try:
        resp = requests.get(url, headers=config['headers'], timeout=30)
        if resp.status_code == 200:
            content = resp.content
            # Cache the tile
            try:
                cache_file.write_bytes(content)
            except Exception:
                pass  # Ignore cache write errors
            response = Response(content, mimetype='image/png')
            response.headers['Content-Length'] = len(content)
            response.headers['Cache-Control'] = 'public, max-age=86400'
            return response
        else:
            return Response(status=resp.status_code)
    except requests.RequestException as e:
        # Try to serve stale cache if fetch fails
        if cache_file.exists():
            try:
                data = cache_file.read_bytes()
                response = Response(data, mimetype='image/png')
                response.headers['Content-Length'] = len(data)
                return response
            except Exception:
                pass
        return jsonify({'error': str(e)}), 500


@app.route('/upload', methods=['POST'])
def upload_gpx():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    if not file.filename.lower().endswith('.gpx'):
        return jsonify({'error': 'File must be a GPX file'}), 400

    try:
        gpx_content = file.read().decode('utf-8')
        gpx = gpxpy.parse(gpx_content)

        track_data = {
            'name': gpx.tracks[0].name if gpx.tracks and gpx.tracks[0].name else 'Unnamed Track',
            'points': [],
            'bounds': {
                'minLat': float('inf'),
                'maxLat': float('-inf'),
                'minLon': float('inf'),
                'maxLon': float('-inf'),
                'minEle': float('inf'),
                'maxEle': float('-inf')
            }
        }

        for track in gpx.tracks:
            for segment in track.segments:
                for point in segment.points:
                    elevation = point.elevation if point.elevation else 0
                    track_data['points'].append({
                        'lat': point.latitude,
                        'lon': point.longitude,
                        'ele': elevation
                    })

                    # Update bounds
                    track_data['bounds']['minLat'] = min(track_data['bounds']['minLat'], point.latitude)
                    track_data['bounds']['maxLat'] = max(track_data['bounds']['maxLat'], point.latitude)
                    track_data['bounds']['minLon'] = min(track_data['bounds']['minLon'], point.longitude)
                    track_data['bounds']['maxLon'] = max(track_data['bounds']['maxLon'], point.longitude)
                    track_data['bounds']['minEle'] = min(track_data['bounds']['minEle'], elevation)
                    track_data['bounds']['maxEle'] = max(track_data['bounds']['maxEle'], elevation)

        if not track_data['points']:
            return jsonify({'error': 'No track points found in GPX file'}), 400

        # Calculate center
        track_data['center'] = {
            'lat': (track_data['bounds']['minLat'] + track_data['bounds']['maxLat']) / 2,
            'lon': (track_data['bounds']['minLon'] + track_data['bounds']['maxLon']) / 2
        }

        return jsonify(track_data)

    except Exception as e:
        return jsonify({'error': f'Failed to parse GPX file: {str(e)}'}), 400


if __name__ == '__main__':
    app.run(debug=True, port=5000, threaded=True)
