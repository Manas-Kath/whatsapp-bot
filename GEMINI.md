# Project Overview: The Bunty Project (WhatsApp Bot) v5.6

"The Bunty Project" is a high-performance WhatsApp bot optimized for low-end hardware (Samsung J7/Termux). It features a unique minimalistic "Style A" aesthetic, robust crash recovery, and advanced memory management.

## Core Mandates
- **Stability:** "Safe Mode" and "Auto-Fix" systems for 401/408 errors.
- **Efficiency:** Strict 120MB RAM limit with manual Garbage Collection.
- **Security:** `.env` credentials and masked debug tools.

## Technical Context
- **Runtime:** Node.js (CommonJS).
- **Target Environment:** Rooted Samsung Galaxy J7 running **Termux**.
    - *RAM Optimization:* `--max-old-space-size=120` and `--expose-gc`.
    - *Storage:* Auto-wiping `auth_info` on corruption.
- **Key Libraries:**
  - `@whiskeysockets/baileys`: WA protocol.
  - `@google/generative-ai`: Gemini 2.0 Flash.
  - `fluent-ffmpeg`: Media processing.

## Completed Features (v5.6)
- [x] **J7 Optimization Pack:**
    - 120MB Hard RAM Limit + Manual GC.
    - 10s Reconnect Delay for 408 Timeouts.
    - Auto-Wipe `auth_info` on 401 Logout.
- [x] **Debug Tools:** `.stats` shows API key status and real-time RAM usage.
- [x] **Selective Publicity (.publicity):** Broadcast messages with safety delays.
- [x] **AI Voice-to-Text:** Transcription via Gemini.
- [x] **Sticker Studio (.sticker):** FFmpeg-powered conversion.

## TODO (System Level)
- [ ] **Android Debloat:** Strip Samsung J7 bloatware via ADB.
- [ ] **Process Killer:** Script to kill non-Termux background apps.
- [ ] **Swap File:** Increase Termux swap if root allows.
