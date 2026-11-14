const { getDb } = require('./db');

/**
 * Creates an active sale record and optional linked initial payment.
 */
function recordSale(data, db = null) {
    const conn = db || getDb();
    const {
        ts,
        sold_to = '',
        brand = '',
        colour = '',
        other_details = '',
        sold_for_paise,
        money_note = 'Pending',
        qty = 1,
        seller_id = null,
        input_id = null,
        payment_mode = null,
        received_by = null
    } = data;

    const insertSaleStmt = conn.prepare(`
        INSERT INTO sales (ts, sold_to, brand, colour, other_details, sold_for_paise, money_note, qty, seller_id, input_id, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `);

    return conn.transaction(() => {
        const info = insertSaleStmt.run(
            ts || Math.floor(Date.now() / 1000),
            (sold_to || '').trim(),
            (brand || '').trim(),
            (colour || '').trim(),
            (other_details || '').trim(),
            sold_for_paise,
            money_note,
            qty || 1,
            seller_id,
            input_id
        );

        const saleId = info.lastInsertRowid;
        let paymentRecord = null;

        // If payment was received upfront (not pending), create linked payment row
        if (payment_mode && money_note !== 'Pending') {
            const insertPaymentStmt = conn.prepare(`
                INSERT INTO payments (sale_id, ts, amount_paise, mode, received_by, input_id, status)
                VALUES (?, ?, ?, ?, ?, ?, 'active')
            `);
            const payInfo = insertPaymentStmt.run(
                saleId,
                ts || Math.floor(Date.now() / 1000),
                sold_for_paise,
                payment_mode,
                received_by || seller_id,
                input_id
            );
            paymentRecord = conn.prepare('SELECT * FROM payments WHERE id = ?').get(payInfo.lastInsertRowid);
        }

        const saleRecord = conn.prepare('SELECT * FROM sales WHERE id = ?').get(saleId);
        return { sale: saleRecord, payment: paymentRecord };
    })();
}

/**
 * Finds active pending sales (where active payments < sold_for_paise).
 */
function findPendingSales(customer = null, db = null) {
    const conn = db || getDb();
    let query = `
        SELECT s.*, 
               COALESCE(SUM(p.amount_paise), 0) AS paid_paise,
               (s.sold_for_paise - COALESCE(SUM(p.amount_paise), 0)) AS pending_paise
        FROM sales s
        LEFT JOIN payments p ON s.id = p.sale_id AND p.status = 'active'
        WHERE s.status = 'active'
    `;
    const params = [];

    if (customer && customer.trim().length > 0) {
        query += ` AND LOWER(TRIM(s.sold_to)) = LOWER(TRIM(?)) `;
        params.push(customer.trim());
    }

    query += `
        GROUP BY s.id
        HAVING pending_paise > 0
        ORDER BY s.id ASC
    `;

    return conn.prepare(query).all(...params);
}

/**
 * Settles a pending sale for a customer.
 */
function settleCustomerPending(data, db = null) {
    const conn = db || getDb();
    const { customer, amount_paise, mode = 'cash', received_by, ts, input_id } = data;

    const pendingList = findPendingSales(customer, conn);
    if (!pendingList || pendingList.length === 0) {
        return { matched: 0, sales: [] };
    }

    if (pendingList.length > 1) {
        return { matched: pendingList.length, sales: pendingList };
    }

    // Exactly 1 pending sale matches
    const targetSale = pendingList[0];
    const payAmount = amount_paise || targetSale.pending_paise;

    return conn.transaction(() => {
        const stmt = conn.prepare(`
            INSERT INTO payments (sale_id, ts, amount_paise, mode, received_by, input_id, status)
            VALUES (?, ?, ?, ?, ?, ?, 'active')
        `);
        const info = stmt.run(
            targetSale.id,
            ts || Math.floor(Date.now() / 1000),
            payAmount,
            mode,
            received_by,
            input_id
        );
        const paymentRecord = conn.prepare('SELECT * FROM payments WHERE id = ?').get(info.lastInsertRowid);
        const remainingPaise = targetSale.pending_paise - payAmount;

        return {
            matched: 1,
            sale: targetSale,
            payment: paymentRecord,
            remainingPaise: remainingPaise > 0 ? remainingPaise : 0
        };
    })();
}

/**
 * Undoes (voids) the latest action by the given person.
 */
function undoLastAction(personId, db = null) {
    const conn = db || getDb();
    return conn.transaction(() => {
        // Look for latest active payment by this person
        const latestPayment = conn.prepare(`
            SELECT * FROM payments 
            WHERE (received_by = ? OR input_id IN (SELECT id FROM inputs WHERE person_id = ?))
              AND status = 'active'
            ORDER BY id DESC LIMIT 1
        `).get(personId, personId);

        // Look for latest active sale by this person
        const latestSale = conn.prepare(`
            SELECT * FROM sales 
            WHERE seller_id = ? AND status = 'active'
            ORDER BY id DESC LIMIT 1
        `).get(personId);

        if (!latestPayment && !latestSale) {
            return null;
        }

        // Void whichever is newer
        const payId = latestPayment ? latestPayment.id : -1;
        const saleId = latestSale ? latestSale.id : -1;

        if (payId > saleId) {
            conn.prepare("UPDATE payments SET status = 'void' WHERE id = ?").run(latestPayment.id);
            return { type: 'payment', record: latestPayment };
        } else {
            conn.prepare("UPDATE sales SET status = 'void', void_reason = 'User undo' WHERE id = ?").run(latestSale.id);
            // Also void any associated payments
            conn.prepare("UPDATE payments SET status = 'void' WHERE sale_id = ?").run(latestSale.id);
            return { type: 'sale', record: latestSale };
        }
    })();
}

/**
 * Aggregates sales and collections summary for today.
 */
function getTodaySummary(db = null) {
    const conn = db || getDb();
    // Start of day in IST (UTC+5:30)
    const now = new Date();
    const istOffset = 5.5 * 3600 * 1000;
    const istNow = new Date(now.getTime() + istOffset);
    istNow.setUTCHours(0, 0, 0, 0);
    const startOfTodayUtcSec = Math.floor((istNow.getTime() - istOffset) / 1000);

    const salesToday = conn.prepare(`
        SELECT count(*) as count, COALESCE(SUM(sold_for_paise), 0) as total_paise
        FROM sales
        WHERE status = 'active' AND ts >= ?
    `).get(startOfTodayUtcSec);

    const paymentsToday = conn.prepare(`
        SELECT 
            COALESCE(SUM(CASE WHEN mode = 'cash' THEN amount_paise ELSE 0 END), 0) as cash_paise,
            COALESCE(SUM(CASE WHEN mode = 'upi' THEN amount_paise ELSE 0 END), 0) as upi_paise,
            COALESCE(SUM(amount_paise), 0) as total_collected_paise
        FROM payments
        WHERE status = 'active' AND ts >= ?
    `).get(startOfTodayUtcSec);

    const allPending = conn.prepare(`
        SELECT COALESCE(SUM(s.sold_for_paise - COALESCE(p.paid, 0)), 0) as pending_paise
        FROM sales s
        LEFT JOIN (
            SELECT sale_id, SUM(amount_paise) as paid 
            FROM payments WHERE status = 'active' GROUP BY sale_id
        ) p ON s.id = p.sale_id
        WHERE s.status = 'active'
    `).get();

    return {
        salesCount: salesToday.count,
        salesTotalPaise: salesToday.total_paise,
        cashCollectedPaise: paymentsToday.cash_paise,
        upiCollectedPaise: paymentsToday.upi_paise,
        totalCollectedPaise: paymentsToday.total_collected_paise,
        totalPendingPaise: allPending.pending_paise
    };
}

module.exports = {
    recordSale,
    findPendingSales,
    settleCustomerPending,
    undoLastAction,
    getTodaySummary
};
