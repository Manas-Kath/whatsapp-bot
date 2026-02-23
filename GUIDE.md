# Bunty v5.6 Technical Architecture Guide

**Target Audience:** IoT Engineers / Developers
**Purpose:** Deep-dive explanation of the codebase, libraries, and logic flows.

---

## 1. High-Level Architecture
Bunty is a **monolithic Node.js application** running in a **Termux** environment on Android.

- **Protocol:** Uses `@whiskeysockets/baileys` to reverse-engineer the WhatsApp Web WebSocket protocol.
- **Process Management:** Managed by `pm2` to handle crashes, environment variables, and auto-restarts.
- **Memory Model:** Uses a "Cage" approach (`--max-old-space-size=120`) to force the V8 engine (JavaScript runtime) to aggressively garbage collect, essential for the Samsung J7's limited RAM.

---

## 2. Core Libraries (The Stack)

### A. `@whiskeysockets/baileys` (The Messenger)
- **What it does:** It creates a WebSocket connection to WhatsApp servers, mimicking a Chrome browser.
- **Auth State:** Stored in `auth_info/`. This folder contains **Noise Protocol** keys (cryptographic key pairs used for end-to-end encryption).
    - *Why we delete it on 401:* A 401 error means the keys on the phone don't match the keys on the server (session invalid). Deleting the folder forces a new key generation (new QR).
- **Event Emitter:** It uses Node.js `EventEmitter`. We listen for specific events like `messages.upsert` (new message arrived) or `connection.update` (internet status).

### B. `@google/generative-ai` (The Brain)
- **Model:** Gemini 2.0 Flash.
- **Interaction:**
    - **Text:** Uses `chatSession` to maintain a "history" array. This array is sent *back* to Google with every new message so the AI "remembers" context.
    - **Images/Audio:** We convert the media file into a **Base64 String** (binary data turned into text) and send it as an "inlineData" part. The model processes this raw data directly.

### C. `fluent-ffmpeg` (The Converter)
- **Role:** Media processing (Stickers, Audio).
- **Mechanism:** It spawns a child process that runs the `ffmpeg` binary installed in Termux.
- **Streams:** Instead of saving a file -> converting -> reading -> deleting, we often use **Streams** (piping data directly through RAM) to save disk I/O, though for stability on J7, we sometimes use temp files in `os.tmpdir()`.

### D. `node-cache` (The Short-Term Memory)
- **Role:** Stores anti-delete logs, AI conversation history, and command cooldowns.
- **Why not a DB?** Writing to disk is slow (I/O blocking). RAM is fast. Since this data is transient (doesn't need to exist forever), `node-cache` keeps it in RAM and auto-deletes it after a set time (`stdTTL`).

---

## 3. Directory & File Breakdown

### 📂 Root Directory
- **`index.js` (The Entry Point):**
    - Initializes the WhatsApp socket connection.
    - Sets up the Global Error Handlers (`uncaughtException`) to prevent hard crashes.
    - **The Watchdog:** A `setInterval` loop that checks RAM usage every minute. If usage > 100MB, it calls `global.gc()` (Garbage Collection).
- **`config.js`:** Central configuration. Loads `.env` variables and sets default values.
- **`deploy.sh`:** The deployment pipeline. It handles git pulling, dependency checking, and `pm2` reloading with specific flags (`--update-env`).

### 📂 `lib/` (The Utility Belt)
- **`handler.js` (The Command Router):**
    - **Dynamic Loading:** Scans the `commands/` folder and `require()`s every `.js` file into a `Map`. This allows hot-reloading (adding commands without restarting).
    - **Parsing:** Breaks the incoming message (`.sticker pack author`) into `cmd` ("sticker") and `args` (["pack", "author"]).
- **`database.js` (The Persistence Layer):**
    - **JSON Store:** Uses a local `database.json` file.
    - **In-Memory Cache:** Loads the JSON into `db.data` variable on startup. All reads happen from RAM (fast). Writes are flushed to disk periodically.
- **`safety.js` (The J7 Protector):**
    - **Crash Loop Detection:** Tracks timestamps of restarts. If 3 restarts happen in < 5 mins, it triggers "Safe Mode" (disables AI/heavy features).
    - **Memory Health:** Calculates `Free RAM %` and `RSS` (Resident Set Size - how much RAM the bot is actually using).

### 📂 `commands/` (The Features)

#### `admin/tagall.js`
1.  **Fetch Metadata:** Calls `sock.groupMetadata(jid)` to get the group's participant list from WA servers.
2.  **Map:** Extracts the `.id` (phone number) from every participant.
3.  **Construct Message:** Creates a text string listing everyone.
4.  **The Secret Sauce:** The `mentions` array in the `sendMessage` payload. Without this array, users won't get the "You were mentioned" notification, even if their name is in the text.

#### `fun/sticker.js`
1.  **Download:** `downloadMediaMessage` pulls the encrypted media, decrypts it, and returns a Buffer.
2.  **Convert:** FFmpeg takes the Buffer.
    - `scale=512:512`: Resizes image to standard sticker size.
    - `format=webp`: Converts to WebP (required by WA).
3.  **Send:** Sends the resulting buffer as a `{ sticker: buffer }` message.

#### `ai/ask.js`
1.  **Rate Limiting:** Checks `cooldowns` cache to prevent spamming the expensive API.
2.  **Context:** Pulls previous chat history from `lib/memory.js`.
3.  **Request:** Sends the prompt + history + any image data to Google.
4.  **Response:** Cleans the response (removes system prompts) and sends it back.

---

## 4. J7 Specific Optimizations (The "IoT" Part)

### 🧠 The "RAM Cage" Logic
Node.js assumes it has 1GB+ RAM available. On a J7, it doesn't.
- **`--max-old-space-size=120`:** This flag tells the V8 engine: *"Treat 120MB as your absolute limit."*
- **What happens at 120MB?** V8 stops execution and runs a "Major GC" (Garbage Collection) sweep, finding every unused variable and deleting it to free up space.
- **`--expose-gc`:** This allows our code (`index.js`) to manually call `global.gc()`. We do this proactively to keep the memory footprint flat, rather than "sawtoothing" (going up and down).

### 💾 The Auto-Fix Logic (Self-Healing)
- **401 Unauthorized:** Means the session file is corrupted or logged out. The bot detects this specific error code, deletes the `auth_info` directory using `fs.rmSync`, and kills itself. PM2 then restarts it, generating a fresh session.
- **408 Request Timeout:** Means the internet is slow. The bot waits 10 seconds (backoff strategy) before retrying to prevent a "retry storm" that overheats the CPU.

---

## 5. Deployment Workflow (DevOps)
1.  **GitHub:** Code is pushed to the repo.
2.  **Termux (Client):** `deploy.sh` pulls the changes.
3.  **Dependency Check:** Script checks if `package.json` changed. If yes, runs `npm install`.
4.  **PM2 Hot Reload:** `pm2 restart Bunty --update-env` reloads the code and environment variables with zero downtime (mostly).

---

**Summary for Engineers:**
Bunty is an **event-driven**, **constraint-aware** Node.js application. It leverages **WebSocket streams** for real-time communication, **child processes** for media transcoding, and **external APIs** for intelligence, all wrapped in a strict **memory management sandbox** to survive on legacy hardware.
