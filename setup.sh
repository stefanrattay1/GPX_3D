#!/bin/bash

# GPX 3D Flyover Visualizer - Setup Script
# This script sets up the development environment

set -e  # Exit on error

echo "================================================"
echo "  GPX 3D Flyover Visualizer - Setup"
echo "================================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# Check Python version
echo "Checking Python installation..."
if command -v python3 &> /dev/null; then
    PYTHON_CMD=python3
elif command -v python &> /dev/null; then
    PYTHON_CMD=python
else
    print_error "Python is not installed. Please install Python 3.8 or higher."
    exit 1
fi

PYTHON_VERSION=$($PYTHON_CMD -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
REQUIRED_VERSION="3.8"

if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$PYTHON_VERSION" | sort -V | head -n1)" = "$REQUIRED_VERSION" ]; then
    print_status "Python $PYTHON_VERSION detected"
else
    print_error "Python $REQUIRED_VERSION or higher is required. Found: $PYTHON_VERSION"
    exit 1
fi

# Create virtual environment
echo ""
echo "Setting up virtual environment..."
if [ -d "venv" ]; then
    print_warning "Virtual environment already exists. Skipping creation."
else
    $PYTHON_CMD -m venv venv
    print_status "Virtual environment created"
fi

# Activate virtual environment
echo ""
echo "Activating virtual environment..."
source venv/bin/activate
print_status "Virtual environment activated"

# Upgrade pip
echo ""
echo "Upgrading pip..."
pip install --upgrade pip -q
print_status "pip upgraded"

# Install dependencies
echo ""
echo "Installing dependencies..."
pip install -r requirements.txt -q
print_status "Dependencies installed"

# Create necessary directories
echo ""
echo "Creating directories..."
mkdir -p uploads
mkdir -p tile_cache
print_status "Directories created"

# Verify installation
echo ""
echo "Verifying installation..."
$PYTHON_CMD -c "import flask; import gpxpy; import requests; print('All dependencies OK')" 2>/dev/null
if [ $? -eq 0 ]; then
    print_status "All dependencies verified"
else
    print_error "Some dependencies failed to install"
    exit 1
fi

echo ""
echo "================================================"
echo -e "${GREEN}  Setup completed successfully!${NC}"
echo "================================================"
echo ""
echo "To start the application:"
echo ""
echo "  1. Activate the virtual environment:"
echo "     source venv/bin/activate"
echo ""
echo "  2. Run the application:"
echo "     python app.py"
echo ""
echo "  Or simply run:"
echo "     ./venv/bin/python app.py"
echo ""
echo "  Then open http://localhost:5000 in your browser"
echo ""
