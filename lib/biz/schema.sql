PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  aliases TEXT NOT NULL DEFAULT '[]',
  wa_lid TEXT UNIQUE,
  wa_pn TEXT UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  lang TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS inputs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  msg_id TEXT NOT NULL UNIQUE,
  ts INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  person_id INTEGER REFERENCES people(id),
  chat TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('text', 'audio', 'image')),
  raw_text TEXT,
  transcript TEXT,
  normalized TEXT,
  stage TEXT,
  parser_version TEXT,
  parsed_json TEXT,
  outcome TEXT,
  final_json TEXT,
  reply_text TEXT,
  error TEXT,
  latency_ms INTEGER
);

CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  sold_to TEXT,
  brand TEXT,
  colour TEXT,
  other_details TEXT,
  sold_for_paise INTEGER NOT NULL,
  money_note TEXT,
  qty INTEGER NOT NULL DEFAULT 1,
  seller_id INTEGER REFERENCES people(id),
  input_id INTEGER REFERENCES inputs(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'void')),
  void_reason TEXT,
  replaced_by INTEGER REFERENCES sales(id)
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL REFERENCES sales(id),
  ts INTEGER NOT NULL,
  amount_paise INTEGER NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('cash', 'upi', 'other')),
  received_by INTEGER REFERENCES people(id),
  account TEXT,
  input_id INTEGER REFERENCES inputs(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'void'))
);

CREATE TABLE IF NOT EXISTS pending_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id INTEGER NOT NULL REFERENCES people(id),
  chat TEXT NOT NULL,
  input_id INTEGER NOT NULL REFERENCES inputs(id),
  parsed_json TEXT NOT NULL,
  question TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Financial rows are never deleted; void them instead.
CREATE TRIGGER IF NOT EXISTS prevent_sales_delete
BEFORE DELETE ON sales
BEGIN
  SELECT RAISE(FAIL, 'Deleting sales records is not permitted. Void them instead.');
END;

CREATE TRIGGER IF NOT EXISTS prevent_payments_delete
BEFORE DELETE ON payments
BEGIN
  SELECT RAISE(FAIL, 'Deleting payments records is not permitted. Void them instead.');
END;
