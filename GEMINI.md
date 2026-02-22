# Project Overview: The Bunty Project (WhatsApp Bot) v5.5

"The Bunty Project" is a high-performance WhatsApp bot built using `@whiskeysockets/baileys` and Google's Gemini AI. It features a unique minimalistic "Style A" emoticon-based aesthetic, modular architecture, and advanced group management tools.

## Core Mandates
- **Stability:** Maintain a persistent connection with robust retry logic and state management.
- **Security:** Use environment variables (`.env`) for all sensitive credentials. Never commit secrets.
- **User Experience:** Commands must be fast, intuitive, and follow the established "Style A" aesthetic.
- **Modularity:** Keep commands and library logic strictly separated for easy maintenance.

## Technical Context
- **Runtime:** Node.js (CommonJS - `type: commonjs`).
- **Target Environment:** Rooted Samsung Galaxy J7 running **Termux**.
    - *Optimization:* Use lightweight dependencies and periodic cache clearing to manage the J7's limited RAM.
    - *Note:* The bot is actively run in this environment; ensure shell scripts (`start.sh`) are compatible with the Termux environment.
    - **[IMPORTANT] Termux Setup for Stickers:**
        1. Run `pkg install ffmpeg`.
        2. Run `npm install --ignore-scripts`.
        3. No need for 'sharp' anymore; we use FFmpeg for all sticker conversions.
- **Key Libraries:**
  - `@whiskeysockets/baileys`: WA protocol implementation (v7.x).
  - `@google/generative-ai`: Gemini AI integration (v2.0-flash).
  - `node-cache`: RAM-based caching for performance and AI memory.
  - `fluent-ffmpeg`: Unified media processing for stickers.
  - `pino`: Structured logging.

## Aesthetic Guide (Style A)
The bot uses a specific minimalistic emoticon-based style for all command outputs:
- **Header:** `*BUNTY v5.5*`
- **OWNER:** `(⌐■_■)` (Cool glasses)
- **MOD:** `(ಠ_ಠ)` (Strict look)
- **ADMIN:** `(¬_¬)` (Side eye)
- **AI/BRAIN:** `[ 0_0 ]` (Robot eyes)
- **FUN/MOJ:** `(¬‿¬)` (Smirk)
- **CORE/SYSTEM:** `( ._.)` (Standing there)
- **MISC:** `(o_O)` (Confused)
- **List Style:** `  • \`key\` : value`

## Completed Features (v5.5)
- [x] **Selective Publicity (.publicity):** Broadcast messages with a selection menu and safety delays.
- [x] **Aesthetic .set Command:** Minimalistic settings management with validation.
- [x] **AI Voice-to-Text:** Transcription and summarization of voice notes via Gemini.
- [x] **Sticker Studio (.sticker):** FFmpeg-powered image and video to sticker conversion (Termux friendly).
- [x] **AI Context Memory:** Rolling 10-message memory window (30-minute TTL).
- [x] **Security:** Complete `.env` migration and bot prefix conflict resolution.
- [x] **Stability:** `NodeCache` integration for all RAM caches to prevent J7 memory leaks.

## Implementation Guidelines
- **Command Structure:** Each command must be an object with `name`, `alias` (optional), `adminOnly`, `superAdminOnly`, and a `run` async function.
- **Error Handling:** Always wrap `sendMessage` and `run` calls in `try/catch` to prevent bot crashes.
- **Aesthetic Consistency:** Ensure all new command outputs follow the Style A emoticon and bullet point conventions.

## TODO (DIY Reliability First)
- [ ] **Watchdog:** Add a lightweight watchdog to detect crashes or memory pressure and auto-restart safely.
- [ ] **Auto AI Fallback:** If free RAM is low or AI timeouts repeat, auto-disable AI features and notify owner.
- [ ] **Safe Mode on Repeated Crashes:** On boot, detect recent crash loops and start with minimal features (no AI, no stickers); allow owner to clear safe mode.
- [ ] **Small Persistent Memory:** Persist AI memory window to a small JSON/SQLite store to reduce RAM usage and survive restarts.
- [ ] **Log Hygiene:** Add a minimal rotating log file (small cap) to avoid digging through pm2 logs for every crash.
- [ ] **Media Rate Limits:** Add per-feature rate limits for stickers/media conversions to avoid overload on low RAM.
- [ ] **Settings Actually Enforced:** Wire `public_mode`, `auto_read`, and `anti_delete` into runtime behavior.
- [ ] **Stats Counter Works:** Re-enable command count increment so `.stats` reflects reality.
- [ ] **Env Key Consistency:** Pick one env key for prefix (`BOT_PREFIX` vs `PREFIX`) and align docs/code.
- [ ] **Cache Size Control:** Limit anti-delete cache growth (shorter TTL or max cap) to avoid RAM creep.
- [ ] **AI Temp Cleanup:** Ensure audio/image temp files are cleaned even on failure.
- [ ] **Metadata Caching:** Cache group metadata for admin checks to reduce repeated API calls.
- [ ] **Restart Strategy Choice:** Decide between `pm2` or `start.sh` loop to avoid double restarts.

## Deployment (Laptop → J7 One-Click)
Goal: push from laptop, then run a single command on the J7 to update and restart.

### Repo on J7
- Use Git with SSH (private repo). Auth key stored in `~/.ssh/id_ed25519`.
- Project path: `~/thebuntyproject`
- pm2 process name: `Bunty`

### Persist WhatsApp Auth
Keep auth outside repo so clean pulls don’t wipe session:
- Persistent path: `~/bunty-data/auth_info`
- Symlink: `~/thebuntyproject/auth_info` → `~/bunty-data/auth_info`

### One-Click Updater Script
Create `~/deploy.sh` (run once):
```bash
#!/data/data/com.termux/files/usr/bin/bash
set -e

APP=~/thebuntyproject
DATA=~/bunty-data

cd "$APP"

# Keep auth_info outside repo (survives clean pulls)
if [ -d "$DATA/auth_info" ] && [ ! -L "$APP/auth_info" ]; then
  rm -rf "$APP/auth_info"
  ln -s "$DATA/auth_info" "$APP/auth_info"
elif [ ! -d "$DATA/auth_info" ] && [ -d "$APP/auth_info" ]; then
  mkdir -p "$DATA"
  mv "$APP/auth_info" "$DATA/auth_info"
  ln -s "$DATA/auth_info" "$APP/auth_info"
fi

# Pull latest code
git pull --ff-only

# Install deps if needed (missing or package changed)
if [ ! -d "$APP/node_modules" ]; then
  npm install --ignore-scripts
else
  if git rev-parse --verify HEAD~1 >/dev/null 2>&1; then
    if git diff --name-only HEAD~1 | grep -qE 'package.json|package-lock.json'; then
      npm install --ignore-scripts
    fi
  fi
fi

# Restart bot
pm2 restart Bunty
```

Run updates with:
```bash
~/deploy.sh
```

