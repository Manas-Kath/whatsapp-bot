const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

let instance = null;

function getDb(customPath = null) {
    if (instance && !customPath) return instance;

    const dbPath = customPath || process.env.BIZ_DB_PATH || path.join(__dirname, '../../biz-data/biz.db');
    
    if (dbPath !== ':memory:') {
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
        const schema = fs.readFileSync(schemaPath, 'utf-8');
        db.exec(schema);
    }

    if (!customPath) {
        instance = db;
    }
    return db;
}

function getSetting(key, db = null) {
    const conn = db || getDb();
    const row = conn.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
}

function setSetting(key, value, db = null) {
    const conn = db || getDb();
    conn.prepare(`
        INSERT INTO settings (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, String(value));
}

function close() {
    if (instance) {
        try {
            instance.close();
        } catch (e) {}
        instance = null;
    }
}

module.exports = {
    getDb,
    getSetting,
    setSetting,
    close
};
