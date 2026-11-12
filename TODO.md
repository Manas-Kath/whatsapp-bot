# Bunty Bot - Project Todo List

## Completed in v5.9.2
- [x] `.groupadd` bulk group add: numbers parsed/deduped (`lib/contacts.js`), existing-member and on-WhatsApp checks, batched add requests, throttling, native invite card / link DM fallback, `--dry` / `--nolink` / `--batch=N`.
- [x] Resumable per-group queue (`.groupadd resume | pending | clear`) persisted in `database.json`.
- [x] Version is now read from `package.json` (`config.version`) everywhere.

## Completed in v5.8 (Stable Release)
- [x] Migrate deployment architecture to Debian Home Server (Docker / Portainer / CasaOS) with persistent volumes and 384MB memory caging.
- [x] Fix Docker volume single-file mount inode locking (`EBUSY`) with fallback handlers in `lib/database.js`.
- [x] Upgrade Anti-Delete with media buffer restoration (images, audio/voice notes, video, stickers) and blank message spam filtering.
- [x] Implement Per-Group Anti-Link protection (`.antilink`) with two-strike enforcement (Delete on 1st, Remove on 2nd) and member whitelisting.
- [x] Configure Google Gemini 3.1 Flash Lite default with automatic multi-model fallback chain (`3.1-flash-lite` -> `3.5-flash-lite` -> `2.5-flash`).
- [x] Add dual JID and LID domain support for natural WhatsApp mention tags rendering.
- [x] Enable automatic message read receipts (`auto_read`) with safe execution handling.

## Backlog / Future Enhancements
- [ ] Conversational Tone Tuning: Continue fine-tuning the system prompt to strike a natural balance between witty, dry, and conversational without robotic filler phrases.
- [ ] ESPHome Active Automation Alerts: WhatsApp push alerts when room temperature or humidity cross defined thresholds.
- [ ] Document / PDF Code Debugging: Multi-modal document summarization and code analysis via `.ask`.
- [ ] Group Add: Excel/CSV loader. Read a single `contact(s)` column from an uploaded sheet and feed it into `normalizeContacts()` (`lib/contacts.js`); the engine in `lib/groupadd.js` needs no changes.
- [ ] Join-approval mode for large groups: share the invite link, enable approval mode, and have the bot auto-approve requests whose number is on an allowlist (`groupRequestParticipantsList` / `groupRequestParticipantsUpdate`).
- [ ] Group Add drip mode: resume a small batch every few hours and stop for the day on the first rate-limit error.
- [ ] Logout auto-fix: clear the *contents* of `auth_info` (it is a bind mount, `rmSync` on the folder fails) and stop the restart loop after a 401.
