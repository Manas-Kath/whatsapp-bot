# GEMINI.md

## Project Overview

**Bunty v5.6** is a high-performance WhatsApp bot designed for stability and resource efficiency on low-end hardware (specifically a Samsung Galaxy J7 running Termux). It leverages the `@whiskeysockets/baileys` library for the WhatsApp protocol and integrates Google's **Gemini 2.0 Flash** AI for intelligent interactions, including text, image analysis, and voice-to-text transcription.

### Key Architecture & Features
- **Messaging Engine:** Baileys (Multi-device protocol).
- **AI Integration:** Gemini 2.0 Flash (Multimodal: Text, Audio, Image).
- **Process Management:** PM2 with strict RAM caging and manual Garbage Collection (GC).
- **Self-Healing:** 
  - **Auto-Fix:** Automatically wipes `auth_info` and restarts on 401 (Unauthorized) errors.
  - **Reconnection Delay:** Implements backoff strategies for 408 (Timeout) errors.
  - **Safe Mode:** Detects crash loops and starts with minimal features.
- **Persistence:** Local JSON-based database (`database.json`) with periodic flushing.

---

## Building and Running

### Prerequisites
- Node.js (v18+ recommended).
- FFmpeg (installed via `pkg install ffmpeg` in Termux).
- A valid Google Gemini API Key.

### Key Commands

- **Install Dependencies:**
  ```bash
  npm install --ignore-scripts
  ```
- **Run (Development/PC):**
  ```bash
  npm start
  ```
- **Run (Production/Termux with Optimization):**
  It is recommended to run with PM2 to leverage the RAM cage and manual GC:
  ```bash
  pm2 start index.js --name Bunty --node-args="--expose-gc --max-old-space-size=120"
  ```
- **Deployment/Update:**
  Execute the included deployment script to pull latest changes and refresh the PM2 process:
  ```bash
  chmod +x deploy.sh
  ./deploy.sh
  ```
- **Testing AI:**
  A standalone test script is available to verify API connectivity:
  ```bash
  node test-ai.js
  ```

---

## Development Conventions

### 1. Code Style & Architecture
- **CommonJS:** The project uses `require()` (CommonJS) rather than ESM.
- **Command Pattern:** Every command is an object with a `name`, `alias`, and a `run` async function. These are dynamically loaded from the `commands/` directory.
- **Stability First:** All critical operations (API calls, file I/O) should be wrapped in `try/catch` blocks.
- **Aesthetic (Style A):** All user-facing responses must follow the minimalistic emoticon-based "Style A" aesthetic (e.g., `(¬_¬) [ SYSTEM ]`, `  • \`key\` : value`).

### 2. Memory Management (The J7 Rule)
- Always prioritize memory efficiency.
- Use the `metadataCache` and `node-cache` for temporary data to avoid repeated heavy lookups.
- Avoid large in-memory buffers; prefer streams for media processing.
- Ensure `global.gc()` is accessible if manual cleanup is needed for heavy operations.

### 3. Testing
- Verify new commands on a PC environment using `test-ai.js` or manual triggers before deploying to the J7.
- Check RAM impact using `.stats` or `adb shell dumpsys meminfo` during development of media-heavy features.

### 4. Git Hygiene
- **Commit Messages:** Use clear, concise titles (e.g., `v5.6`, `fix: reconnect logic`).
- **Environment:** Never commit the `.env` file or the `auth_info` directory.
