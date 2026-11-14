const { getDb } = require('./db');

function getByMsgId(msgId, db = null) {
    if (!msgId) return null;
    const conn = db || getDb();
    return conn.prepare('SELECT * FROM inputs WHERE msg_id = ?').get(msgId);
}

function logRawInput({ msgId, ts, personId, chat, kind = 'text', rawText = '' }, db = null) {
    const conn = db || getDb();
    const existing = getByMsgId(msgId, conn);
    if (existing) {
        return { id: existing.id, isReplay: true, existingRow: existing };
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const msgTs = ts ? Math.floor(Number(ts)) : nowSec;

    const stmt = conn.prepare(`
        INSERT INTO inputs (msg_id, ts, received_at, person_id, chat, kind, raw_text, stage, outcome)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'raw', 'pending')
    `);

    const info = conn.transaction(() => {
        return stmt.run(msgId, msgTs, nowSec, personId, chat, kind, rawText);
    })();

    return { id: info.lastInsertRowid, isReplay: false, existingRow: null };
}

function updateInputOutcome(id, updates = {}, db = null) {
    const conn = db || getDb();
    const allowed = [
        'transcript', 'normalized', 'stage', 'parser_version', 
        'parsed_json', 'outcome', 'final_json', 'reply_text', 
        'error', 'latency_ms'
    ];
    const sets = [];
    const values = [];

    for (const [k, v] of Object.entries(updates)) {
        if (allowed.includes(k)) {
            sets.push(`${k} = ?`);
            let val = v;
            if ((k === 'parsed_json' || k === 'final_json') && typeof v === 'object' && v !== null) {
                val = JSON.stringify(v);
            }
            values.push(val);
        }
    }

    if (!sets.length) return;

    values.push(id);
    conn.prepare(`UPDATE inputs SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

function getRecentInputs(limit = 50, db = null) {
    const conn = db || getDb();
    return conn.prepare('SELECT * FROM inputs ORDER BY id DESC LIMIT ?').all(limit);
}

module.exports = {
    getByMsgId,
    logRawInput,
    updateInputOutcome,
    getRecentInputs
};
