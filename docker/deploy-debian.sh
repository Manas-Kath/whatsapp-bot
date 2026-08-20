#!/usr/bin/env bash
set -e

# Bunty v5.6 - Deployment Script for Debian Home Server (Docker)
echo "=================================================="
echo "Deploying Bunty Bot Container on Debian"
echo "=================================================="

APP_DIR="${HOME}/bunty-bot"

# 1. Create App Directory if missing
if [ ! -d "$APP_DIR" ]; then
    echo "[+] Creating application directory at $APP_DIR..."
    mkdir -p "$APP_DIR"
fi

cd "$APP_DIR"

# 2. Check if git repo exists or clone
if [ ! -d ".git" ]; then
    echo "[+] Cloning repository..."
    git clone https://github.com/Manas-Kath/whatsapp-bot.git .
else
    echo "[+] Pulling latest updates..."
    git pull
fi

# 3. Check for .env file
if [ ! -f ".env" ]; then
    if [ -f "docker/env.example" ]; then
        echo "[!] .env file missing. Copying docker/env.example to .env..."
        cp docker/env.example .env
        echo "[i] Please edit $APP_DIR/.env with your GEMINI_API_KEY before starting."
    fi
fi

# 4. Initialize database.json if missing
if [ ! -f "database.json" ]; then
    echo "[+] Creating default database.json..."
    echo '{"users":{},"stats":{"cmdCount":0},"banned":[],"hardBanned":[],"settings":{"ai_enabled":true,"public_mode":true,"auto_read":false}}' > database.json
fi

# 5. Build and run Docker Container
echo "[+] Building and starting Docker container..."
docker compose build --no-cache
docker compose up -d

echo ""
echo "[+] Bunty Bot container started successfully."
echo "--------------------------------------------------"
echo "To view connection logs & QR Code, run:"
echo "   docker logs -f bunty-bot"
echo "--------------------------------------------------"
