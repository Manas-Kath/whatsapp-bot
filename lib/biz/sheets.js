const { getDb, getSetting, setSetting } = require('./db');
const { formatIst } = require('./export');

/**
 * Gets configured Google Sheets Web App URL from DB or environment.
 */
function getWebappUrl(db = null) {
    const conn = db || getDb();
    return getSetting('biz_sheets_url', conn) || process.env.GOOGLE_SHEET_WEBAPP_URL || null;
}

/**
 * Gets optional secret token.
 */
function getSecret(db = null) {
    const conn = db || getDb();
    return getSetting('biz_sheets_secret', conn) || process.env.GOOGLE_SHEET_SYNC_SECRET || '';
}

/**
 * Checks if Google Sheets integration is enabled.
 */
function isEnabled(db = null) {
    return Boolean(getWebappUrl(db));
}

/**
 * Non-blocking outbound push of a new sale to Google Sheet.
 */
async function pushSale(sale, db = null) {
    const url = getWebappUrl(db);
    if (!url || !sale) return { success: false, reason: 'not_configured' };

    const payload = {
        action: 'append_sale',
        secret: getSecret(db),
        bunty_id: sale.id,
        timestamp: formatIst(sale.ts),
        sold_to: sale.sold_to || '',
        brand: sale.brand || '',
        colour: sale.colour || '',
        other_details: sale.other_details || '',
        amount: Math.round(sale.sold_for_paise / 100),
        money_note: sale.money_note || 'Pending'
    };

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(10000)
        });
        const data = await res.json();
        return data;
    } catch (err) {
        console.error('[SHEETS SYNC] Push sale error:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Non-blocking outbound update of payment note for a sale in Google Sheet.
 */
async function pushPayment(sale, newMoneyNote, db = null) {
    const url = getWebappUrl(db);
    if (!url || !sale) return { success: false, reason: 'not_configured' };

    const payload = {
        action: 'update_payment',
        secret: getSecret(db),
        bunty_id: sale.id,
        money_note: newMoneyNote || sale.money_note || 'Paid'
    };

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(10000)
        });
        return await res.json();
    } catch (err) {
        console.error('[SHEETS SYNC] Push payment error:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Non-blocking outbound update to void a sale in Google Sheet.
 */
async function pushVoid(saleId, db = null) {
    const url = getWebappUrl(db);
    if (!url || !saleId) return { success: false, reason: 'not_configured' };

    const payload = {
        action: 'void_sale',
        secret: getSecret(db),
        bunty_id: saleId
    };

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(10000)
        });
        return await res.json();
    } catch (err) {
        console.error('[SHEETS SYNC] Push void error:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Inbound pull: Fetches any new rows from Google Sheet (e.g. submitted via Google Form)
 * and imports them into local SQLite database.
 */
async function pullNewRows(db = null) {
    const conn = db || getDb();
    const url = getWebappUrl(conn);
    if (!url) return { success: false, reason: 'not_configured', pulled: 0 };

    const lastSyncedRowStr = getSetting('biz_sheets_last_row', conn) || '2';
    const fromRow = parseInt(lastSyncedRowStr, 10);
    const secret = getSecret(conn);

    const queryUrl = `${url}?from_row=${fromRow}${secret ? `&secret=${encodeURIComponent(secret)}` : ''}`;

    try {
        const res = await fetch(queryUrl, {
            method: 'GET',
            signal: AbortSignal.timeout(15000)
        });
        const result = await res.json();
        if (!result.success || !Array.isArray(result.rows)) {
            return { success: false, error: result.error || 'Invalid sheet response', pulled: 0 };
        }

        let pulledCount = 0;

        const insertSaleStmt = conn.prepare(`
            INSERT INTO sales (ts, sold_to, brand, colour, other_details, sold_for_paise, money_note, qty, seller_id, input_id, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, NULL, NULL, 'active')
        `);

        const insertPaymentStmt = conn.prepare(`
            INSERT INTO payments (sale_id, ts, amount_paise, mode, received_by, input_id, status)
            VALUES (?, ?, ?, ?, NULL, NULL, 'active')
        `);

        conn.transaction(() => {
            for (const r of result.rows) {
                // If this row already has a Bunty ID, check if it exists in SQLite
                if (r.bunty_id) {
                    const existing = conn.prepare('SELECT id FROM sales WHERE id = ?').get(r.bunty_id);
                    if (existing) continue; // Already known and tracked
                }

                const rawAmount = String(r.amount || '0').replace(/[^0-9.]/g, '');
                const amountPaise = Math.round(parseFloat(rawAmount || '0') * 100);
                if (!amountPaise || isNaN(amountPaise)) continue;

                let tsSec = Math.floor(Date.now() / 1000);
                if (r.timestamp) {
                    const parsedDate = new Date(r.timestamp);
                    if (!isNaN(parsedDate.getTime())) {
                        tsSec = Math.floor(parsedDate.getTime() / 1000);
                    }
                }

                const info = insertSaleStmt.run(
                    tsSec,
                    (r.sold_to || '').trim(),
                    (r.brand || '').trim(),
                    (r.colour || '').trim(),
                    (r.other_details || '').trim(),
                    amountPaise,
                    (r.money_note || 'Pending').trim()
                );

                const newSaleId = info.lastInsertRowid;

                // If payment was not pending, create payment row
                const note = (r.money_note || '').toLowerCase();
                if (note && !note.includes('pending') && !note.includes('void')) {
                    const mode = note.includes('upi') ? 'upi' : 'cash';
                    insertPaymentStmt.run(newSaleId, tsSec, amountPaise, mode);
                }

                pulledCount++;
            }

            if (result.last_row) {
                setSetting('biz_sheets_last_row', String(result.last_row + 1), conn);
            }
        })();

        return { success: true, pulled: pulledCount, last_row: result.last_row };
    } catch (err) {
        console.error('[SHEETS SYNC] Pull error:', err.message);
        return { success: false, error: err.message, pulled: 0 };
    }
}

/**
 * Full bidirectional sync: pulls new form rows and pushes un-pushed bot sales.
 */
async function syncAll(db = null) {
    const conn = db || getDb();
    if (!isEnabled(conn)) {
        return { success: false, error: 'Google Sheets integration is not configured. Set URL with .biz setsheet <url>' };
    }

    const pullResult = await pullNewRows(conn);
    return {
        success: true,
        pulled: pullResult.pulled || 0
    };
}

module.exports = {
    isEnabled,
    getWebappUrl,
    pushSale,
    pushPayment,
    pushVoid,
    pullNewRows,
    syncAll
};
