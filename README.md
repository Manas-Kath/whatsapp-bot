# Project Overview: The Bunty Project (WhatsApp Bot)

"The Bunty Project" is a feature-rich WhatsApp bot designed for interactivity, group management, and AI-powered assistance. It leverages the `@whiskeysockets/baileys` library for the WhatsApp protocol and Google's Gemini AI for intelligent chat capabilities.

## Architecture & Core Technologies
- **Runtime:** Node.js (CommonJS).
- **WhatsApp Library:** `@whiskeysockets/baileys` (v7.x).
- **AI Engine:** Google Generative AI (Gemini 2.0 Flash) with context memory.
- **Data Persistence:** Local JSON-based database (`database.json`) with periodic saving.
- **Caching:** `node-cache` for session data, anti-delete, and AI memory.
- **Media Processing:** `sharp` for images and `fluent-ffmpeg` for video-to-sticker conversion.

## Directory Structure
- `index.js`: Main entry point. Handles connection, authentication, and event listeners.
- `config.js`: Configuration manager (loads from `.env`).
- `lib/`:
    - `handler.js`: Command dispatcher and loader.
    - `database.js`: DB abstraction layer for bans and settings.
- `commands/`: Categorized command modules (`admin`, `ai`, `core`, `fun`).
- `auth_info/`: Stores WhatsApp authentication credentials (multi-file state).

## Building and Running
### Prerequisites
- Node.js installed.
- `ffmpeg` installed on the system (required for video stickers).
- A valid Google Gemini API Key.

### Installation
```bash
cd "the bunty project"
npm install
```

### Environment Setup
Create a `.env` file in `the bunty project/` with:
```env
GEMINI_API_KEY=your_key_here
SUPER_ADMIN_IDS=jid1@lid,jid2@s.whatsapp.net
BOT_NAME=Bunty
PREFIX=.
```

### Running the Bot
```bash
npm start
```
Upon running, scan the QR code in the terminal using WhatsApp's "Linked Devices" feature.

## Development Conventions
- **Command Structure:** Every command in `commands/` must export an object:
    ```javascript
    module.exports = {
        name: "cmdname",
        alias: ["alias1"],
        desc: "Description",
        adminOnly: false, // optional
        superAdminOnly: false, // optional
        run: async ({ sock, jid, msg, text, ...ctx }) => { /* code */ }
    };
    ```
- **Safety:** Use `jidNormalizedUser()` when comparing IDs to handle both LID and standard JIDs.
- **Error Handling:** Wrap all asynchronous operations, especially `sock.sendMessage`, in `try/catch` blocks.
- **Stability:** Prefer `NodeCache` over manual `Map` objects for temporary data to ensure automatic memory cleanup.

## Key Features
- **AI Chat (Gemini):** Intelligent responses with context memory and vision support.
- **Anti-Delete:** Automatically logs deleted messages to the super admin.
- **Selective Publicity:** Interactive broadcasting tool to specific or all groups.
- **Sticker Studio:** High-quality image and video-to-webp sticker conversion.
- **Hard Ban:** A specialized ban that automatically deletes every message sent by the target in groups.
