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
