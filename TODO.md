# Bunty Bot - Project Todo List

## Business Module (branch: `business`, target v6.0)
Clothes-reselling sale log and money tracker for the family, driven through WhatsApp. Runs **inside the Bunty process** as `lib/biz/` (no separate container for now), with its own SQLite file and its own logic. Shares only the Baileys connection with Bunty. Full context in `BUSINESS.md`.

### Phase 0: Bunty core prerequisites (small changes in `index.js` / Docker)
- [x] Iterate over **all** `m.messages` in `messages.upsert` for the business path (currently only `m.messages[0]` is read, so batched or simultaneous messages are silently dropped).
- [x] Accept `m.type === 'append'` (offline/backfilled messages) for the business path; dedupe with the unique `msg_id`, never by timestamp.
- [x] Add the business router **before** the AI block (the AI block `return`s on Safe Mode); decide "dot message" with `body.startsWith(config.prefix)` directly, not via `handleCommand` returning `false` (it also returns `false` for banned users and `public_mode` off).
- [x] Leave `#memo` to Bunty (not business).
- [x] Wrap the business call in try/catch: a business error must never crash Bunty, and the raw input must already be saved.
- [x] Dockerfile: add `RUN npm rebuild better-sqlite3` after the existing `npm install --only=production --ignore-scripts` (the flag skips the native binding; `python3 make g++` are already in the image as a build fallback).
- [x] `docker-compose.yml` / `docker/portainer-stack.yml`: add a **directory** volume for the SQLite file (e.g. `./biz-data:/app/biz-data`). Not a single-file mount.
- [x] Set `TZ=Asia/Kolkata` for the container (or format times explicitly in IST).

### Phase 1: `lib/biz` skeleton, identity, input log
- [x] `lib/biz/index.js` exposing one entry point `handle(input) -> { replies }` with no imports from Bunty's `database.js`, Gemini, or `memory.js` (keeps it movable into its own container later).
- [x] DB init and migrations (`better-sqlite3`, WAL mode).
- [x] `people` table (the four family members) with aliases (Mom/Mummy, Dad/Papa, Aunt, ...); super-admin-only registration command that stores the exact sender IDs (LID and phone JID) seen in logs.
- [x] Allowed chats: one business group plus DMs; everything else ignored. Unauthorized senders get no reply.
- [x] **`inputs` table: every business input from an authorized person is stored before any processing** (raw text, transcript if voice, normalized text, which stage handled it, parser version, parsed result, outcome, final confirmed result, errors, latency). This is the dataset for all future improvements.
- [x] Unique `msg_id` for idempotency; replayed messages return the original reply and write nothing.

### Phase 2: Sale log and payments (same fields as the Google Form sheet)
- [x] `sales` table mirroring the form columns: Timestamp, Sold to, Brand, Colour, Other details, Sold for, Who got money and how (plus qty, seller, ids).
- [x] `payments` table: amount, mode (cash/UPI/other), received_by, linked to a sale. "Pending" = sale with no payment yet.
- [x] Rules parser v1 for Hindi/Hinglish/English sale messages (normalizer, number words, spelling variants such as `sued`/`suit`, payment words, people aliases).
- [x] Default rules: price is the total for the row unless "each/per/har ek"; money went to the sender unless another person is named.
- [x] If the money status is missing, ask one short question (who got it and how, or pending).
- [x] Receipt after every action `(¬_¬) [ BIZ ] ✅ #12 ...`; `undo` and reply-to-receipt corrections (void plus new row, no overwriting).
- [x] Settle pending: `Meera ne 2450 cash diye` links a payment to Meera's pending sale; if several pending sales match, show a short numbered list and ask.
- [x] Import the existing Google Form responses (CSV/XLSX) as seed data; export back to the exact same column layout.

### Phase 3: Reports (read-only queries)
- [ ] `aaj ka hisaab` (today's sales and collections), `pending` / `udhar` (per customer), person-wise collections, cash vs UPI totals.

### Phase 4: Purchases, expenses, transfers (build when needed)
- [ ] Carton purchases, shipping/packaging and other expenses, transfers between family members and accounts.
- [ ] Revisit the money model here: move to double-entry-lite ledger if net profit, cash balances and transfers need it (payments already carry cash/UPI and receiver, so they map cleanly).
- [ ] Optional batch-level stock (no per-article registration, no cross-day context resolution unless a real need appears).

### Phase 5: Use the stored inputs
- [ ] Replay script: run every stored input through the current parser and compare with the confirmed `final_json` (regression tests built from real family messages).
- [ ] Weekly review: unparsed and corrected messages, to extend the lexicon and rules.
- [ ] Tiny intent classifier (char n-gram + logistic regression) trained offline from `inputs`, exported as a weights JSON, run in JS. Only if rules plateau.
- [ ] `export inputs` command: JSONL dump for training/evaluation.

### Phase 6: Optional cloud LLM fallback (never required)
- [ ] Separate Google Cloud project/quota from Bunty's `.ask`; JSON-schema output; every extracted number must appear in the normalized input; fall back to "supported format" reply when unavailable.

### Phase 7: Voice
- [ ] First: ask family to use the keyboard mic (Gboard voice typing).
- [ ] Then voice notes (ffmpeg conversion already exists) with Vosk small Hindi or a cloud ASR; amounts from voice always confirmed. Store transcript in `inputs`; audio kept only if `BIZ_KEEP_AUDIO=1`.

### Phase 8: Payment screenshots
- [ ] Tesseract (Hindi+English) as a one-at-a-time subprocess; crop amount/UTR; claims keyed by UTR; reconcile with bank statement CSV; delete the image after extraction (keep SHA-256, UTR, amount, time).

### Phase 9: Later
- [ ] Nightly SQLite backup and tested restore (do this early, before Phase 3 if possible).
- [ ] Google Sheets/Datasette read-only mirror.
- [ ] Move `lib/biz` into its own container only if a real need appears (memory, crashes, second interface).

---

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