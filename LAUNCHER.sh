#!/usr/bin/env bash
# ==============================================================================
# WebNovel Forge — Cross-Platform POSIX Launcher (Linux / macOS)
# Usage: ./LAUNCHER.sh [--dev]
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== WebNovel Forge — POSIX Launcher (Linux / macOS) ==="
echo "Directory: $SCRIPT_DIR"
echo ""

# 1. Environment Verification
check_cmd() {
  if command -v "$1" >/dev/null 2>&1; then
    echo "✓ $2"
    return 0
  else
    echo "✗ $2 MISSING"
    return 1
  fi
}

HAS_NODE=0
HAS_NPM=0
HAS_NPX=0
HAS_FFMPEG=0

check_cmd "node" "Node.js" && HAS_NODE=1 || true
check_cmd "npm" "npm" && HAS_NPM=1 || true
check_cmd "npx" "npx" && HAS_NPX=1 || true
check_cmd "ffmpeg" "FFmpeg" && HAS_FFMPEG=1 || true

if [ "$HAS_NODE" -eq 0 ] || [ "$HAS_NPM" -eq 0 ]; then
  echo ""
  echo "Error: Node.js and npm are required to run WebNovel Forge."
  echo "Install Node.js 18+ or 20+ LTS from https://nodejs.org or via your package manager."
  exit 1
fi

if [ "$HAS_FFMPEG" -eq 0 ]; then
  if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "⚠ FFmpeg not found — install via Homebrew: brew install ffmpeg"
  else
    echo "⚠ FFmpeg not found — install via apt: sudo apt install ffmpeg (or pacman -S ffmpeg)"
  fi
fi

# 2. Dependency check
if [ ! -d "node_modules/electron" ]; then
  echo ""
  echo "Installing dependencies (first run, please wait)..."
  npm install
fi

# 3. Build check
if [ ! -f "dist/main/main.js" ] || [ ! -f "dist/renderer/index.html" ]; then
  echo ""
  echo "Building application bundles..."
  npm run build
fi

# 4. Launch Mode
if [[ "$*" == *"--dev"* ]]; then
  echo ""
  echo "Starting in DEVELOPMENT mode..."
  npm run dev
else
  echo ""
  echo "Starting WebNovel Forge..."
  npx electron .
fi
