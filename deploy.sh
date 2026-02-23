#!/data/data/com.termux/files/usr/bin/bash
set -e

# Deployment Script for Bunty on Termux
APP=~/thebuntyproject
DATA=~/bunty-data

cd "$APP"

echo "🚀 Starting Deployment..."

# 1. Persist WhatsApp Auth (outside repo)
if [ -d "$DATA/auth_info" ] && [ ! -L "$APP/auth_info" ]; then
  echo "📦 Moving auth_info to persistent storage..."
  rm -rf "$APP/auth_info"
  ln -s "$DATA/auth_info" "$APP/auth_info"
elif [ ! -d "$DATA/auth_info" ] && [ -d "$APP/auth_info" ]; then
  echo "📦 Initializing persistent auth storage..."
  mkdir -p "$DATA"
  mv "$APP/auth_info" "$DATA/auth_info"
  ln -s "$DATA/auth_info" "$APP/auth_info"
fi

# 2. Pull latest code
echo "📥 Pulling latest code..."
git pull --ff-only

# 3. Install dependencies if needed
if [ ! -d "$APP/node_modules" ]; then
  echo "📦 Installing node_modules..."
  npm install --ignore-scripts
else
  if git rev-parse --verify HEAD~1 >/dev/null 2>&1; then
    if git diff --name-only HEAD~1 | grep -qE 'package.json|package-lock.json'; then
      echo "📦 Dependencies changed. Updating..."
      npm install --ignore-scripts
    fi
  fi
fi

# 4. Restart bot using pm2 with strict RAM limits
echo "🔄 Restarting Bunty via pm2 (RAM: 120MB, ENV Update)..."
pm2 delete Bunty 2>/dev/null || true
pm2 start index.js --name Bunty --node-args="--expose-gc --max-old-space-size=120" --update-env

echo "✅ Deployment Complete!"
