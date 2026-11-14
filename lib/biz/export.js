const { getDb } = require('./db');

const COLUMNS = [
    'Timestamp',
    'Sold to',
    'Brand',
    'Colour',
    'Other details',
    'Sold for (₹)',
    'Who got money and how'
];

/**
 * Formats epoch timestamp into IST (UTC+5:30) string: YYYY-MM-DD HH:mm
 */
function formatIst(epochSec) {
    if (!epochSec) return '';
    const date = new Date(epochSec * 1000);
    const istOffset = 5.5 * 3600 * 1000;
    const istDate = new Date(date.getTime() + istOffset);
    return istDate.toISOString().replace('T', ' ').substring(0, 16);
}

/**
 * Exports all active sales matching the exact Google Form responses column layout.
 */
function exportToCsv(db = null) {
    const conn = db || getDb();
    const rows = conn.prepare(`
        SELECT ts, sold_to, brand, colour, other_details, sold_for_paise, money_note
        FROM sales
        WHERE status = 'active'
        ORDER BY id ASC
    `).all();

    const lines = [COLUMNS.join(',')];

    for (const r of rows) {
        const timeStr = formatIst(r.ts);
        const soldTo = escapeCsv(r.sold_to);
        const brand = escapeCsv(r.brand);
        const colour = escapeCsv(r.colour);
        const details = escapeCsv(r.other_details);
        const amountRs = Math.round(r.sold_for_paise / 100);
        const moneyNote = escapeCsv(r.money_note || 'Pending');

        lines.push(`${timeStr},${soldTo},${brand},${colour},${details},${amountRs},${moneyNote}`);
    }

    return lines.join('\n');
}

/**
 * Imports seed sales from CSV text formatted like Google Form responses.
 */
function importFromCsv(csvText, db = null) {
    const conn = db || getDb();
    const lines = csvText.trim().split(/\r?\n/);
    if (lines.length <= 1) return { imported: 0, errors: [] };

    // Skip header
    const dataLines = lines.slice(1);
    let count = 0;
    const errors = [];

    const insertStmt = conn.prepare(`
        INSERT INTO sales (ts, sold_to, brand, colour, other_details, sold_for_paise, money_note, qty, seller_id, input_id, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, NULL, NULL, 'active')
    `);

    conn.transaction(() => {
        for (let i = 0; i < dataLines.length; i++) {
            const line = dataLines[i].trim();
            if (!line) continue;

            const cols = parseCsvLine(line);
            if (cols.length < 6) {
                errors.push(`Line ${i + 2}: insufficient columns`);
                continue;
            }

            const rawTs = cols[0].trim();
            const soldTo = (cols[1] || '').trim();
            const brand = (cols[2] || '').trim();
            const colour = (cols[3] || '').trim();
            const details = (cols[4] || '').trim();
            const rawAmount = (cols[5] || '0').replace(/[^0-9.]/g, '');
            const moneyNote = (cols[6] || 'Pending').trim();

            const amountPaise = Math.round(parseFloat(rawAmount || '0') * 100);
            if (!amountPaise || isNaN(amountPaise)) {
                errors.push(`Line ${i + 2}: invalid amount "${cols[5]}"`);
                continue;
            }

            let tsSec = Math.floor(Date.now() / 1000);
            if (rawTs) {
                const parsedDate = new Date(rawTs);
                if (!isNaN(parsedDate.getTime())) {
                    tsSec = Math.floor(parsedDate.getTime() / 1000);
                }
            }

            insertStmt.run(tsSec, soldTo, brand, colour, details, amountPaise, moneyNote);
            count++;
        }
    })();

    return { imported: count, errors };
}

function escapeCsv(val) {
    const s = String(val || '').trim();
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

function parseCsvLine(line) {
    const result = [];
    let cur = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
            if (inQuotes && line[i + 1] === '"') {
                cur += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (c === ',' && !inQuotes) {
            result.push(cur);
            cur = '';
        } else {
            cur += c;
        }
    }
    result.push(cur);
    return result;
}

module.exports = {
    exportToCsv,
    importFromCsv,
    formatIst
};
