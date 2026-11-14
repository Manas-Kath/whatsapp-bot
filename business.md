# BUSINESS.md - Bunty Business Module (`libbiz`)

Context file for the `business` branch. Read this before touching business code. Last updated 2026-11-13.

Central rule Bunty's general-purpose chatbot is NOT being redesigned. The business module is separate logic that shares only the WhatsApp (Baileys) connection. No shared AI logic, no shared database, no shared intelligence.

Sections marked [Decided] come from the owner. Sections marked [Design] are the proposed implementation; follow them unless the owner changes them.

---

## 1. What this is [Decided]

A WhatsApp-driven sale log and money tracker for a family clothes-reselling business (ladies suits and similar), used by four people the owner, Mom, Dad and Aunt. Only these four may create or modify business records.

Today sales are logged through a Google Form. The sheet Sale Log (Responses) is the reference for the database format. Its columns are

 Column  Example 
------
 Timestamp  2026-11-13 1530 (stored by Sheets as a serial number) 
 Sold to  `Meera` 
 Brand  `Idhu` 
 Colour  `Wine` 
 Other details  `sued 40 L` (size and notes, free text; note the sued typo) 
 Sold for (₹)  `2450` 
 Who got money and how  `Pending` (otherwise a free-text note such as who received it and cashUPI) 

Observations from the sample rows (both are Pending, so credit sales are normal, not an edge case)
- Values have trailing spaces (`Meera `, `Rajesh `, `Beige `) always trim.
- Typos and spelling variants exist (`sued` for suit) the normalizer needs a small lexicon.
- Size appears inside Other details (`40 L`) keep it as free text; parse into fields later only if useful.
- Who got money and how mixes status, person and mode in one free-text cell store the raw text and also parse it into structured payment rows.

Family members write naturally in Hindi, English and Hinglish, for example

```
Meera ko Idhu wine suit 40 L 2450 mein beche, pending
Aaj 2 suit 1200 mein beche, cash Mummy ke paas
Papa ne 2000 UPI receive kiye
Meera ne 2450 cash diye
Sold Idhu beige suit to Rajesh for 2450, pending
```

Scope for now ([Decided]) the sale log, who got the money, and pending amounts. Purchases, expenses, transfers and stock come later. Complicated context resolution (for example kal wale suit) is not needed; add it only if a real need shows up.

---

## 2. Routing [Decided]

 Message  Destination 
------
 Starts with `.` (`BOT_PREFIX`)  Existing Bunty, unchanged. Unknown dot commands keep existing Bunty behavior and are never interpreted as business input. 
 `#memo ...`  Existing Bunty sticky-note feature, unchanged. 
 Anything else, from a registered business user, in an allowed chat  Business module 
 Anything else  Ignored by the business module, silently 

Allowed chats [Design] one dedicated business group plus DMs with the bot. Messages in any other chat are never processed, even from registered users.

Implementation notes (verified in the current code)
- Decide dot message with `body.startsWith(config.prefix)`. Do not use `handleCommand` returned false as the signal for business it also returns false for banned users and when `public_mode` is off.
- Hook the business router before the AI block in `index.js`. The AI block `return`s when `safety.shouldEnableAI()` is false (Safe Mode); business must not be gated by AI Safe Mode.
- Per-group anti-link runs earlier in the handler. Keep `.antilink` off in the business group, otherwise a pasted link strikes (and eventually removes) a family member.
- Anti-delete forwards deleted textmedia to the super admin. Exclude business chats from it. A delete for everyone on a business message must never auto-void a record; voiding is explicit (`undo` or a correction).

---

## 3. Identity and permissions [Decided + Design]

- Authenticate the actual sender (`key.participant` in groups, `remoteJid` in DMs), never the group ID.
- Identity is a lookup in the business `people` table. Store both LID and phone-JID forms. Registration is a super-admin-only command that records the exact sender IDs seen in logs; do not try to derive one form from the other in code.
- Languagevocabulary preferences and aliases are stored separately and never affect permissions. `people.aliases` (Mom, Mummy, Papa, Dad, Aunt, owner's name, ...) are used only to understand who a message talks about.
- Roles `owner` (can register people, voidcorrect anyone's records, export) and `member`. Only the four registered people exist.
- Unauthorized or unknown senders get no reply and no stored message body (a counter is enough).

---

## 4. Architecture [Design]

The business module lives in the Bunty process for now. It is a plain module with a clean boundary so it can be moved out later if needed.

```
WhatsApp - Baileys (index.js)
              
      +-------+----------------------------+
       dot  #memo                         other + registered sender + allowed chat
      v                                    v
  Existing Bunty                    libbizindex.js   handle(input) - { replies }
                                           
                  1. save raw input (inputs table)   - always first
                  2. normalize - rules - (classifier) - (LLM fallback, optional)
                  3. validate - receipt  question
                  4. write sales  payments (SQLite)
                                           
                                  replies[] sent by index.js
```

Boundary rules (so extraction into a container stays cheap later)
- `libbiz` imports nothing from Bunty's `database.js`, `memory.js`, Gemini or mention code. `index.js` passes in plain data and sends back the returned replies.
- `handle(input)` takes `{ msgId, chat, senderId, ts, type, text, getMedia }` and returns `{ replies [{ text }] }`.
- Own SQLite file (`biz-databiz.db`), never `database.json`.
- Errors wrap the call in trycatch. On failure, the raw input is already stored; reply with a short save nahi hua, dobara bhejo message. A business error must never crash Bunty.
- No receipt means not recorded. Every recorded, rejected or failed action gets a visible reply. Family members are told if there is no reply, resend.
- Business replies follow Bunty's Style A `(¬_¬) [ BIZ ] ...`.
- `index.js` must iterate over all messages in each `messages.upsert` event (the current code reads only `m.messages[0]`) and must also accept `m.type === 'append'` for the business path. Dedupe by `msgId`, not by timestamp.

Dockerruntime changes needed
- The Dockerfile uses `npm install --only=production --ignore-scripts`, which skips the native binding of `better-sqlite3`. Add `RUN npm rebuild better-sqlite3` right after it (the image already has `python3 make g++` as a build fallback).
- Mount a directory (`.biz-dataappbiz-data`), not a single file; SQLite creates journalWAL files next to the database.
- Set `TZ=AsiaKolkata`, or format all displayed times explicitly in IST. Store timestamps as UTC epoch seconds.
- The 384 MB container cap stays for now. Watch memory when OCR is added (Tesseract must run as a one-at-a-time subprocess).

Repo layout (proposed)

```
libbiz
  index.js            # handle(input)
  db.js               # open, migrate, prepared statements
  schema.sql
  inputs.js           # input logging
  nlpnormalize.js    # scriptspellingnumber-word normalization, lexicon
  nlprules.js        # intent + slot extraction
  sales.js            # createvoidcorrect sales, payments, settle pending
  reports.js
  export.js           # XLSXCSV in the Google Form column layout; import of the existing sheet
testbiz             # parser examples, replay tests
```

---

## 5. Hardware constraints [Decided]

- Only the home server is available at runtime Intel Core 2 Duo, 4 GB RAM, Debian headless, DockerCasaOS, other services running.
- The i5-10400F desktop is a personal PC, not a server and not 24x7 out of scope for runtime. It may be used occasionally for offline trainingevaluation only; nothing may depend on it being on.
- The Pixel 7 Pro (broken screen) is not assumed available.
- Consequences no local LLM, no local Whisper-class ASR on the server. Local compute is rules, SQLite, a tiny classical classifier (later), and Tesseract (later, serialized). Any heavy AI is optional and cloud-based, never required for recording sales.
- No benchmarks of this CPU exist yet. Measure before depending on any model.

---

## 6. Data integrity rules [Decided + Design]

1. NLPML extracts information; it never executes SQL or writes records directly. Only deterministic code in `sales.js` writes.
2. Validate before recording (sender authorized, price is a sane positive number, required fields present).
3. Ask a short question when a required field is missing or unclear.
4. Idempotency via WhatsApp message ID (unique key).
5. Audit trail the raw input is stored first; every salepayment row links to the input that created it.
6. Corrections void the old row and create a new one. Financial rows are never overwritten or deleted (enforce with triggers only the `status`void fields of `sales` and `payments` may change).
7. Regular backups with a tested restore.
8. The database is the source of truth; SheetsCSV is an export.

Money is stored as integer paise. Display in ₹.

---

## 7. Data model [Design]

Version 0 is deliberately simple sales plus payments. Receivable (pending) = sale amount minus its active payments. Move to a double-entry ledger only when purchases, expenses and transfers arrive (Phase 4); payments already record receiver and mode, so they map cleanly.

```sql
CREATE TABLE people (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL,
  aliases TEXT NOT NULL DEFAULT '[]',           -- JSON array [mom,mummy]
  wa_lid TEXT UNIQUE, wa_pn TEXT UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('owner','member')),
  lang TEXT, active INTEGER NOT NULL DEFAULT 1
);

-- EVERY business input from an authorized person is stored here, before processing.
CREATE TABLE inputs (
  id INTEGER PRIMARY KEY,
  msg_id TEXT NOT NULL UNIQUE,                  -- idempotency key
  ts INTEGER NOT NULL,                          -- message time, UTC epoch seconds
  received_at INTEGER NOT NULL,
  person_id INTEGER REFERENCES people(id),
  chat TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('text','audio','image')),
  raw_text TEXT,                                -- exactly what was sent
  transcript TEXT,                              -- voiceOCR text if any
  normalized TEXT,                              -- after the normalizer
  stage TEXT,                                   -- rules  classifier  llm  none
  parser_version TEXT,
  parsed_json TEXT,                             -- what the parser extracted
  outcome TEXT,                                 -- recorded  asked  corrected  undone  unparsed  rejected  error
  final_json TEXT,                              -- what was finally confirmed (the label)
  reply_text TEXT,
  error TEXT,
  latency_ms INTEGER
);

-- Same fields as the Google Form sheet, plus a few system columns.
CREATE TABLE sales (
  id INTEGER PRIMARY KEY,
  ts INTEGER NOT NULL,                          -- Timestamp
  sold_to TEXT,                                 -- Sold to        (trimmed)
  brand TEXT,                                   -- Brand
  colour TEXT,                                  -- Colour
  other_details TEXT,                           -- Other details  (sizenotes, free text)
  sold_for_paise INTEGER NOT NULL,              -- Sold for (₹)   (total for this row)
  money_note TEXT,                              -- Who got money and how (raw text kept as typed)
  qty INTEGER NOT NULL DEFAULT 1,
  seller_id INTEGER REFERENCES people(id),      -- who logged it
  input_id INTEGER REFERENCES inputs(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','void')),
  void_reason TEXT, replaced_by INTEGER REFERENCES sales(id)
);

CREATE TABLE payments (
  id INTEGER PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id),
  ts INTEGER NOT NULL,
  amount_paise INTEGER NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('cash','upi','other')),
  received_by INTEGER REFERENCES people(id),
  account TEXT,                                 -- e.g. bank2 for UPI, later
  input_id INTEGER REFERENCES inputs(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','void'))
);

CREATE TABLE pending_questions (               -- short-lived follow-ups
  id INTEGER PRIMARY KEY, person_id INTEGER NOT NULL REFERENCES people(id), chat TEXT NOT NULL,
  input_id INTEGER NOT NULL REFERENCES inputs(id), parsed_json TEXT NOT NULL,
  question TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
```

Mapping of the Who got money and how cell keep the raw text in `sales.money_note` (so the export is identical to the sheet), and also create a `payments` row when a personmode is stated. `Pending` creates no payment.

Export a plain `SELECT` over `sales` plus the latest payment info in the sheet's exact column order, with Timestamp converted to IST. Import read the existing Google Form responses (CSVXLSX), convert the serial timestamps, trim values, and insert as `sales` (with `input_id` NULL and a note that they were imported).

Later (design when reached, do not build now) purchasescartons, expenses, transfers between family members and accounts, optional batch-level stock.

---

## 8. Input log and learning loop [Decided + Design]

All inputs are stored for future improvement. This is the `inputs` table above, written before any parsing, in its own statement so it survives parser crashes and rolled-back writes.

- Stored raw text, voice transcript or OCR text, normalized text, which stage handled it, parser version, parsed result, outcome, the final confirmed result, the reply, errors, latency.
- Corrections (`undo`, reply-to-receipt fixes) update `outcome` and `final_json` of the original input; that pair (input, final result) is the gold label.
- Unrecognized messages are stored with `outcome='unparsed'` these are the most valuable rows for extending the lexicon and rules.
- Not stored payment screenshot images (only extracted fields, UTR and hash, later). Voice audio is kept only when `BIZ_KEEP_AUDIO=1`; the transcript is always stored.
- Unauthorized senders' message bodies are not stored.
- The table is append-only (outcomefinal fields may be updated once), included in the nightly backup.
- Uses
  1. Replay tests run every stored input through the current parser and diff against `final_json`. Any parser change must not regress real family messages.
  2. Weekly review of `unparsed` and `corrected` rows.
  3. Training data for a tiny classifier (later) or few-shot examples for the optional LLM fallback.
  4. `export inputs` command writes JSONL for offline work.

---

## 9. Language understanding [Design]

Order of processing

1. Normalize trim, lowercase, Devanagari to Roman, Hinglish spelling variants and typos from a lexicon (`sued``sut` to `suit`, `bechibechebika` to sold, `udharbaad meinpending` to pending), number words (`dedh hazaar`, `paune do sau`, `pachas`), currency noise (`rs`, `₹`, `rupaye`).
2. Rules + lexicon intent plus slots (customer, brand, colour, detailssize, price, quantity, payment status, receiver, mode). Intents for v0 record sale, record payment (settle pending), pendingreport query, undocorrect.
3. Tiny intent classifier (only if rules plateau) char n-gram features plus logistic regression, trained offline on `inputs`, exported as a weights JSON, run in JS.
4. Optional cloud LLM fallback (never required) JSON-schema output; a Google Cloud projectquota separate from Bunty's `.ask` (quotas are per project, as far as known); free-tier data may be used by the provider, so never send screenshots or account details. Every extracted number must appear in the normalized input. If unavailable, reply with an example of the supported format.
5. Validate, then record or ask.

Default rules (v0)
- Price is the total for the row unless the message says eachperhar ek; the receipt echoes the interpretation so a wrong guess is visible and can be undone.
- Money is assumed received by the sender unless another person is named (`Papa ko`, `Mummy ke paas`).
- If the message says nothing about money, ask one question who got it and how (cashUPI), or pending.
- Settling a pending sale match by customer name (trimmed, case-insensitive, aliases later). If exactly one active pending sale matches, settle it; if several match, show a short numbered list and ask. If none, say so.
- Out of scope for now resolving vague references like kal wale suit. If a message depends on that, ask the person to restate it fully.

Receipts and undo

```
Mom  Meera ko Idhu wine suit 40 L 2450 mein beche, pending
Bot  (¬_¬) [ BIZ ] ✅ #12  Meera  Idhu  Wine  40 L  ₹2450  pending
      Reply undo to cancel.
Mom  Meera ne 2450 cash diye
Bot  (¬_¬) [ BIZ ] ✅ #12 paid ₹2450 cash - Mom. Pending none.
```

- Commit automatically when the parse is complete; ask only when something required is missing or ambiguous; always echo.
- `undo` voids the last record by that sender. Replying to a receipt with a correction voids it and creates a new row.
- Pending questions expire after a short time.

---

## 10. Voice and screenshots (later) [Design]

Voice
- First choice family uses the keyboard mic (Gboard voice typing), so the message arrives as text.
- Voice notes later reuse the existing ffmpeg conversion; candidates are Vosk small Hindi model (local, likely mediocre on numbers) or a cloud ASR. Benchmark digit accuracy before enabling. Amounts from voice are always confirmed.

Payment screenshots
- Tesseract (Hindi + English) as a one-at-a-time subprocess, cropped to amount and UTR regions with a digit whitelist.
- A screenshot is a claim, not proof store UTR, amount, time, SHA-256, direction; mark `matched` only after reconciliation with a bank statement CSV or explicit confirmation. Delete the image after extraction.

---

## 11. Development conventions

1. CommonJS, matching the repo.
2. Business logic lives in `libbiz` as functions taking dependencies (db handle, clock) as parameters; cover them with tests in the style of `test-groupadd.js`. Parser changes ship with example messages in `testbiz`.
3. Parsing code never touches the database; only `sales.js` writes sale and payment rows. `inputs.js` is the only other writer.
4. Every write is idempotent for a given `msgId`.
5. Style A for business replies `(¬_¬) [ BIZ ] ...`.
6. Keep v0 small. Do not start a later phase until the family has used the previous one for a few days.

---

## 12. Operational notes

- SQLite lives in a directory volume; never bind-mount the `.db` file alone.
- Nightly backup with SQLite's `.backup` or `VACUUM INTO` into a backups folder, keep a rotating set, copy off the server periodically, and test a restore. Set this up early; the `inputs` table is also training data.
- Baileys is unofficial if the bot number is restricted or logged out (see the `.groupadd` notes in `GEMINI.md`), business data stays intact in SQLite. A second interface can be added later if needed.
- Logs must not contain full payment screenshot data or account details.

---

## 13. Roadmap

See `TODO.md`, section Business Module. Order 0 Bunty prerequisites, 1 `libbiz` skeleton and input log, 2 sale log and payments (sheet format), 3 reports, 4 purchasesexpensestransfers, 5 use stored inputs (replay tests, classifier), 6 optional LLM fallback, 7 voice, 8 screenshots, 9 backupsmirroroptional container.

## 14. Open questions

- Confirm the bot runs on a dedicated number (not the owner's personal one).
- Should the Google Form stay in use during the transition, or is the bot replacing it from day one (affects the importexport step)
- Does Who got money and how ever hold anything besides status, person and mode (for example partial payments)
- Per-unit vs total price default for each family member (currently total).