# GPX 3D Flyover Visualizer

[![Python](https://img.shields.io/badge/Python-3.8+-blue.svg)](https://www.python.org/downloads/)
[![Flask](https://img.shields.io/badge/Flask-3.0+-green.svg)](https://flask.palletsprojects.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Create stunning 3D flyover videos from your GPX tracks with satellite imagery and terrain elevation.

![GPX 3D Flyover Demo](https://img.shields.io/badge/Demo-Preview-orange)

## ✨ Features

- 🗺️ **3D Terrain Visualization** - Real elevation data with ESRI satellite imagery
- 🎥 **Two Animation Modes** - Follow Track (first-person) or Bird's Eye view
- ⚙️ **Fully Configurable** - Adjust speed, camera altitude, pitch, resolution, and FPS
- 📹 **Video Export** - Record and download your flyover as WebM video
- 🎨 **Modern UI** - Dark theme with intuitive controls
- 💾 **Tile Caching** - Offline support with local tile caching
- 🆓 **No API Keys Required** - Uses free map tile providers

## 🚀 Quick Start

### Option 1: Using the Setup Script (Recommended)

```bash
# Clone the repository
git clone https://github.com/stefanrattay1/GPX_3D.git
cd GPX_3D

# Run the setup script
chmod +x setup.sh
./setup.sh

# Start the application
./venv/bin/python app.py
```

### Option 2: Manual Installation

```bash
# Clone the repository
git clone https://github.com/stefanrattay1/GPX_3D.git
cd GPX_3D

# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate  # Linux/macOS
# or
.\venv\Scripts\activate   # Windows

# Install dependencies
pip install -r requirements.txt

# Run the application
python app.py
```

Open **http://localhost:5000** in your browser.

## 📖 Usage

1. **Upload GPX** - Drag & drop or click to browse for your GPX file
2. **Configure Animation** - Select mode, adjust speed, camera settings
3. **Set Video Quality** - Choose resolution (720p to 4K) and frame rate
4. **Preview** - Click Play to see the animation
5. **Record** - Click Record Video to save the flyover

## ⚙️ Configuration

### Animation Settings
| Setting | Range | Description |
|---------|-------|-------------|
| Mode | Follow Track / Bird's Eye | First-person or overhead view |
| Speed | 0.25x - 5x | Playback speed multiplier |
| Camera Altitude | 20m - 2000m | Height above track |
| Camera Pitch | 0° - 85° | Viewing angle (0° = flat) |

### Video Export Settings
| Setting | Options | Description |
|---------|---------|-------------|
| Resolution | 720p, 1080p, 1440p, 4K, Custom | Output video resolution |
| Frame Rate | 24, 30, 60 FPS | Frames per second |
| Format | WebM | Native browser support |

## 🏗️ Project Structure

```
GPX_3D/
├── app.py              # Flask backend server
├── requirements.txt    # Python dependencies
├── setup.sh           # Setup script
├── static/
│   ├── css/
│   │   └── style.css  # Application styles
│   └── js/
│       ├── main.js    # Main application logic
│       ├── map.js     # Map initialization
│       ├── animation.js # Animation controller
│       └── recorder.js # Video recording
├── templates/
│   └── index.html     # Main HTML template
├── tile_cache/        # Cached map tiles (auto-generated)
└── uploads/           # Temporary upload folder (auto-generated)
```

## 🛠️ Tech Stack

| Component | Technology |
|-----------|------------|
| Backend | Flask + gpxpy |
| Frontend | Maplibre GL JS (3D maps) |
| Terrain | AWS Terrarium elevation tiles |
| Satellite | ESRI World Imagery |
| Recording | Browser MediaRecorder API |

## 📋 Requirements

- **Python** 3.8 or higher
- **Modern web browser** with WebGL support (Chrome/Edge recommended)
- **Internet connection** for fetching map tiles (cached locally after first load)

## 🔧 Troubleshooting

### Common Issues

**Video recording not working?**
- Use Chrome or Edge browser for best compatibility
- Ensure browser has permission to download files

**Map not loading?**
- Check your internet connection
- Cached tiles will work offline after first load

**GPX file not parsing?**
- Ensure the file is a valid GPX format
- File must contain at least one track with points

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Maplibre GL JS](https://maplibre.org/) for the amazing 3D map library
- [ESRI](https://www.esri.com/) for satellite imagery
- [AWS Open Data](https://registry.opendata.aws/terrain-tiles/) for terrain elevation tiles
- [OpenStreetMap](https://www.openstreetmap.org/) contributors

---

Made with ❤️ for outdoor enthusiasts
