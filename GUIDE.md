# Bunty v5.9.2 Technical Manual

**Version:** 5.9.2 (Debian Docker & J7 Cross-Platform)
**Purpose:** Comprehensive documentation for every single script in the codebase.

---

## 1. Root Directory (The Engine Room)

### `index.js`
**Role:** The Main Entry Point & Process Manager.
**Key Functions:**
- **`startBunty()`:** Initializes the bot. It uses a recursive calling strategy—if the connection closes, it calls itself again to reconnect.
- **Connection Logic:** Uses `@whiskeysockets/baileys` to connect to WA.
    - `auth_info`: Loads keys from this folder.
    - `printQRInTerminal`: Set to true via `qrcode-terminal`.
- **Event Listeners:**
    - `connection.update`: Handles 401 (Logout) and 408 (Timeout) errors. **v5.6 Feature:** Auto-wipes `auth_info` on 401 errors.
    - `messages.upsert`: The main "ear". Listens for incoming messages and passes them to `handler.js`.
- **Watchdog:** A `setInterval` loop that checks RAM every minute. If usage > 100MB, it forces `global.gc()` to free memory.

### `config.js`
**Role:** Configuration Loader.
**Key Logic:**
- Loads `.env` file using `dotenv`.
- Exports a single object containing `geminiApiKey`, `prefix`, and `superAdminIds`.
- **Debug:** Logs a masked version of the API key on startup to help debug `.env` issues.

### `deploy.sh`
**Role:** The "One-Click" Updater for Termux.
**Flow:**
1.  **Auth Persistence:** Moves `auth_info` out of the project folder to `~/bunty-data` so it survives git pulls.
2.  **Git Pull:** Fetches the latest code from GitHub.
3.  **Dependency Check:** Runs `npm install` only if `package.json` changed.
4.  **PM2 Reload:** Restarts the process with specific flags: `--node-args="--expose-gc --max-old-space-size=120"` to enforce the RAM cage.

### `database.json`
**Role:** The Brain's Long-Term Memory.
**Structure:**
- `settings`: Boolean flags like `public_mode`, `ai_enabled`.
- `banned`: Array of user JIDs who are blocked from using the bot.
- `stats`: Counters for commands executed.

---

## 2. Libraries (`lib/`) - The Utilities

### `lib/handler.js`
**Role:** Command Parser & Loader.
**Key Functions:**
- **`loadCommands()`:** Reads the `commands/` directory recursively. It `require()`s every file and stores it in a `Map` (Key: Command Name, Value: Command Object).
- **`handleCommand(ctx)`:**
    1.  Checks if sender is Banned.
    2.  Checks `public_mode` (if false, only Admins can use bot).
    3.  Parses the message body to find the `prefix`.
    4.  Looks up the command in the Map.
    5.  **Executes:** Calls `cmd.run(ctx)`.

### `lib/database.js`
**Role:** JSON File Wrapper.
**Key Logic:**
- **Singleton:** Uses a global variable `global.db` to ensure only one instance exists.
- **`save()`:** Writes the in-memory object to `database.json`. Use sparingly to avoid disk wear on the J7.
- **`isBanned(jid)`:** Helper to quickly check the ban list.

### `lib/contacts.js`
Phone-number parsing for bulk features. `splitRaw(text)` splits free text (commas, newlines, semicolons, pipes, space-separated 12+ digit numbers) into raw entries; `normalizeNumber()` converts each to international digits (`+..`, `00..`, 10-digit and `0`-prefixed numbers get `DEFAULT_COUNTRY_CODE`, default `91`) and rejects anything containing letters; `normalizeContacts(rawList)` dedupes and returns `{ valid, invalid, duplicates }`. Input-source agnostic: a future Excel/CSV loader only has to produce a `string[]`.

### `lib/groupadd.js`
Bulk group-add engine, dependency-injected (takes `sock`, no Baileys import) so it is unit-testable (`node test-groupadd.js`). Per run: skip current members, bulk-check `onWhatsApp`, cap to the batch size, add in multi-person requests (`addChunk`), then for refused adds (status `403` privacy / `408` recently left) send a native `groupInvite` card when WhatsApp returns an `add_request` code, else a DM with the invite link. Throttles with random delays, stops on a rate-limit error and returns everything unprocessed in `results.skipped` so the command can queue it.

### `lib/memory.js`
**Role:** AI Short-Term Context Manager.
**Logic:**
- Uses `node-cache` (RAM only).
- **`get(jid)`:** Returns an array of the last 10 messages for a specific user.
- **`set(jid, history)`:** Updates the history.
- **TTL:** Memories expire after 30 minutes to save RAM.

### `lib/safety.js`
**Role:** The J7 Guardian (Crash & RAM Protection).
**Key Functions:**
- **`checkCrashLoop()`:** Tracks boot times. If 3 boots happen in 5 mins, it triggers "Safe Mode".
- **`getMemoryHealth()`:** Returns `nodeUsageMB` (how much RAM bot is using) and `freePercent` (how much RAM phone has left).
- **`shouldEnableAI()`:** Returns `false` if RAM is critical (<2% free), preventing the heavy AI from crashing the phone.

---

## 3. Commands (The Features)

### 📂 `commands/admin/` (Boss Tools)

- **`antilink.js`**: Per-group link protection with 2-strike automated enforcement (strike 1: delete + warn, strike 2: delete + kick). Supports in-group stealth mode (`.antilink on -s` auto-deletes command and confirms in private DM) and remote DM management (`.antilink on <group>` in bot DM). Admins and whitelisted members are exempt.
- **`ban.js` / `unban.js`**: Adds/Removes users from `database.json`. Banned users are ignored by `handler.js`.
- **`hardban.js`**: A more aggressive ban. If a hardbanned user sends a message, the bot attempts to *delete* their message immediately (Anti-Spam).
- **`hidetag.js`**: Sends a message that *looks* empty but secretly mentions everyone in the group. Used for announcements without the ugly list of names.
- **`publicity.js`**: A broadcasting tool. It sends a message to *all* groups the bot is in. Includes a safety delay (5s) between messages to avoid getting banned by WhatsApp.
- **`safety.js`**: **SuperAdmin Only.** Displays RAM usage and "Safe Mode" status. Can manually `reset` the crash counter.
- **`set.js`**: Toggles settings like `ai_enabled` or `auto_read`. Updates `database.json`.
- **`stats.js`**: Displays Uptime, RAM usage, and valid API Key status. **v5.6 Update:** Shows the actual masked API key for debugging.
- **`tagall.js`**: Lists every member in the group text and "mentions" them so they get a notification.
- **`groupadd.js`**: Bulk-adds a list of numbers to a group (`.groupadd 919876543210, +91 98765 43211`, or reply to a message containing numbers; SuperAdmin can target any group from DM with `.groupadd <#/ID> <numbers>`). Numbers are normalized/deduped (`lib/contacts.js`), checked against WhatsApp and current members, then added one by one with randomized throttling (`lib/groupadd.js`). If WhatsApp refuses the add (member's privacy setting, or they recently left), the bot sends them a native group-invite card (when WhatsApp supplies the per-user code) or, failing that, a DM with the group link. Large lists are processed in batches (`--batch=N`, default 30); anything unprocessed (batch overflow or a rate-limit stop) is saved to a per-group queue in `database.json` and continued with `.groupadd resume` (`.groupadd pending` / `.groupadd clear` to inspect or drop it; in DM add the group `<#/ID>`). Flags: `--nolink` (skip DM fallback), `--dry` (check only), `--batch=N`. Limits via `GROUPADD_MAX` (500) / `GROUPADD_BATCH` (30) / `GROUPADD_CHUNK` (5 numbers per add request, like the official app) / `GROUPADD_MIN_DELAY` (8000) / `GROUPADD_MAX_DELAY` (15000); default country code via `DEFAULT_COUNTRY_CODE` (default `91`). The bot must be a group admin.

### 📂 `commands/ai/` (The Brain)

- **`ask.js`**: The interface to Gemini.
    - **Logic:**
        1. Checks `safety.shouldEnableAI()`.
        2. Detects if there is an Image or Audio in the message.
        3. If Audio: Uses `ffmpeg` to convert OGG (WhatsApp voice note) to MP3.
        4. Sends text/image/audio to Google API.
        5. Sends the response back to chat.

### 📂 `commands/core/` (Essentials)

- **`help.js`**: dynamically generates a list of commands by reading the `commands` Map from `handler.js`.
- **`ping.js`**: Calculates "Speed" by measuring the difference between `Date.now()` and the message timestamp.

### 📂 `commands/fun/` (Entertainment)

- **`roast.js`**: Picks a random savage line from `assets/roasts.txt` and replies to the target.
- **`spam.js`**: **Admin Only.** Sends a specific message X times. Used for... "testing".
- **`sticker.js`**: The most complex media command.
    - **Flow:** `Message -> Buffer -> FFmpeg (Scale & Format) -> WebP Buffer -> WhatsApp`.
    - **Optimization:** Uses a temporary file path in `os.tmpdir()` to handle the conversion stream.

---

## 4. How to Read the Code
Every command follows this interface:
```javascript
module.exports = {
    name: "commandName",
    alias: ["cmd", "c"],
    desc: "Description",
    run: async ({ sock, jid, msg, args }) => {
        // Logic here
    }
}
```
- **`sock`**: The WhatsApp connection object (use this to send messages).
- **`jid`**: The ID of the person/group you are talking to.
- **`msg`**: The full raw message object (contains quotas, media, etc).

---
**End of Manual.**

---

## 5. Operations & Troubleshooting

- **`Connection Closed. Reason: 401` (logged out) + crash loop:** WhatsApp rejected the session (device unlinked, or the number was logged out). The built-in auto-fix cannot delete `auth_info` because it is a Docker bind mount, so clear its *contents* and relink:
  ```bash
  docker compose down
  sudo rm -rf auth_info/*
  docker compose up -d && docker logs -f bunty-bot   # scan the QR: Linked devices > Link a device
  ```
  Then send `.safety reset` to leave Safe Mode.
- **`account_reachout_restricted` (from `.groupadd`):** WhatsApp has restricted the number from contacting people it does not know (adds and cold DMs). Stop all bulk actions on that number; do not retry. Queued numbers stay in `database.json` and `.groupadd resume` continues later. Prefer invite links, join-approval, or adds from admins' own phones for large lists.
- **Check a deploy is live:** `docker exec bunty-bot grep -c extractAddRequest /app/lib/groupadd.js` (code is baked into the image; rebuild with `docker compose up -d --build`).
- **Release convention:** bump `package.json` version (the bot's logs, `.help` and `.stats` read it via `config.version`), then commit with a message of just the version and a short tag, e.g. `v5.9.2, groupadd`.
