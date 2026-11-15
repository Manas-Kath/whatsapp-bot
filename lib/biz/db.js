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

/**
 * Creates a rotating SQLite backup using VACUUM INTO.
 * Keeps the last `keepCount` daily backups in biz-data/backups/.
 * Safe to call even if DB is busy (WAL mode makes it consistent).
 *
 * @param {Object} [opts]
 * @param {string} [opts.dbPath] Source DB path (defaults to BIZ_DB_PATH or biz-data/biz.db)
 * @param {string} [opts.backupDir] Backup directory (defaults to biz-data/backups)
 * @param {number} [opts.keepCount] Number of backups to keep (default 7)
 * @returns {{ success: boolean, file?: string, error?: string }}
 */
function createBackup({ dbPath = null, backupDir = null, keepCount = 7 } = {}) {
    const srcPath = dbPath || process.env.BIZ_DB_PATH || path.join(__dirname, '../../biz-data/biz.db');
    if (srcPath === ':memory:') {
        return { success: false, error: 'In-memory DB cannot be backed up' };
    }

    try {
        const targetDir = backupDir || path.join(path.dirname(srcPath), 'backups');
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        // Name snapshots by IST time so repeated manual backups on one day work.
        const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
        const stamp = [
            istNow.getUTCFullYear(),
            String(istNow.getUTCMonth() + 1).padStart(2, '0'),
            String(istNow.getUTCDate()).padStart(2, '0'), '-',
            String(istNow.getUTCHours()).padStart(2, '0'),
            String(istNow.getUTCMinutes()).padStart(2, '0'),
            String(istNow.getUTCSeconds()).padStart(2, '0'),
            String(istNow.getUTCMilliseconds()).padStart(3, '0')
        ].join('');
        const backupFile = path.join(targetDir, `biz-${stamp}.db`);
        const useInstance = !!instance && !dbPath;
        const db = useInstance ? instance : new Database(srcPath, { readonly: true });
        try {
            db.exec(`VACUUM INTO '${backupFile.replace(/'/g, "''")}'`);
        } finally {
            if (!useInstance && db.open) db.close();
        }

        // Prune old backups
        const files = fs.readdirSync(targetDir)
            .filter(f => /^biz-\d{8}(?:-\d{9})?\.db$/.test(f))
            .sort(); // oldest first (YYYYMMDD sort)
        while (files.length > keepCount) {
            const oldest = files.shift();
            try { fs.unlinkSync(path.join(targetDir, oldest)); } catch (e) {}
        }

        return { success: true, file: backupFile };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

module.exports = {
    getDb,
    getSetting,
    setSetting,
    close,
    createBackup
};
