const { getDb, getSetting } = require('./db');
const people = require('./people');
const inputs = require('./inputs');
const sales = require('./sales');
const exportModule = require('./export');
const sheets = require('./sheets');
const { parseMessage } = require('./nlp/rules');
const { normalizeText } = require('./nlp/normalize');

const PARSER_VERSION = '0.2.0';
const CHITCHAT_WORDS = new Set([
    'hi', 'hello', 'hey', 'hii', 'namaste', 'thanks', 'thank', 'you', 'shukriya', 'dhanyavad',
    'ok', 'okay', 'k', 'haan', 'han', 'yes', 'yep', 'yup', 'ji', 'bunty', 'dost', 'dosto',
    'morning', 'evening', 'night', 'good'
]);

function isChitchat(text) {
    const normalized = normalizeText(text);
    if (!normalized || /\d/.test(normalized)) return false;
    const words = normalized.match(/[a-z]+/g) || [];
    if (!words.length || !words.every(word => CHITCHAT_WORDS.has(word))) return false;
    return words.every((word, index) => {
        if (word === 'good') return ['morning', 'evening', 'night'].includes(words[index + 1]);
        if (['morning', 'evening', 'night'].includes(word)) return words[index - 1] === 'good';
        if (word === 'thank') return words[index + 1] === 'you';
        if (word === 'you') return words[index - 1] === 'thank';
        return true;
    });
}

function shouldRouteMessage({ fromMe = false, isMentioned = false, isReplyToBot = false, quotedText = '' } = {}) {
    if (fromMe || isMentioned) return false;
    if (isReplyToBot && !String(quotedText).startsWith('(¬_¬) [ BIZ')) return false;
    return true;
}

/**
 * Main entry point for Bunty Business Module.
 * Completely decoupled from Bunty's database.json and Gemini AI.
 * 
 * @param {Object} input
 * @param {string} input.msgId
 * @param {string} input.chat
 * @param {string} input.senderId
 * @param {number} input.ts
 * @param {string} input.type ('text' | 'audio' | 'image')
 * @param {string} input.text
 * @param {string} [input.quotedText]
 * @param {Function} [input.getMedia]
 * @param {Object} [deps] Optional dependency overrides (e.g. { db, nowSec, maxAgeHours })
 * @returns {Promise<{ handled: boolean, replies: Array<{ text: string }> }>}
 */
async function handle(input, deps = {}) {
    if (input?.fromMe) return { handled: false, replies: [] };
    const conn = deps.db || getDb();
    const startTime = Date.now();

    const { msgId, chat, senderId, ts, type = 'text', text = '' } = input;
    if (!msgId || !chat || !senderId) {
        return { handled: false, replies: [] };
    }

    // 1. Allowed chat check:
    // Only one dedicated business group + private DMs with the bot are allowed.
    const isGroup = chat.endsWith('@g.us');
    const configuredGroup = getSetting('biz_group_jid', conn) || process.env.BIZ_GROUP_JID;

    if (isGroup) {
        if (!configuredGroup || chat !== configuredGroup) {
            return { handled: false, replies: [] };
        }
    }

    // 2. Identity & Permission check:
    // Authenticate the actual sender by LID or Phone JID in people table.
    const person = people.findPersonByIdentifier(senderId, conn);
    if (!person || !person.active) {
        // Unauthorized sender gets no reply and no stored message
        return { handled: false, replies: [] };
    }

    // 2b. Message age check is applied after raw input logging so stale deliveries
    // are auditable and idempotent, but never processed or answered.
    const nowSec = deps.nowSec !== undefined ? Number(deps.nowSec) : Math.floor(Date.now() / 1000);
    const msgTs = ts ? Math.floor(Number(ts)) : nowSec;
    const maxAgeHoursSetting = deps.maxAgeHours !== undefined 
        ? deps.maxAgeHours 
        : (getSetting('biz_max_msg_age_hours', conn) || process.env.BIZ_MAX_MSG_AGE_HOURS || '24');
    const configuredMaxAge = Number(maxAgeHoursSetting);
    const maxAgeHours = configuredMaxAge === 0
        ? 0
        : (Number.isFinite(configuredMaxAge) && configuredMaxAge > 0 ? configuredMaxAge : 24);
    const maxAgeSec = maxAgeHours * 3600;

    // 3. Raw input logging (MUST BE FIRST):
    // Stored before any parsing or validation to build the dataset.
    const rawKind = ['audio', 'image'].includes(type) ? type : 'text';
    const logResult = inputs.logRawInput({
        msgId,
        ts: msgTs,
        personId: person.id,
        chat,
        kind: rawKind,
        rawText: text
    }, conn);

    // 4. Idempotency replay check:
    // Only completed outcomes replay. NULL is the transient in-progress state;
    // old rows with outcome='pending' remain retryable for compatibility.
    if (logResult.isReplay) {
        const prev = logResult.existingRow;
        if (prev && prev.outcome !== null && prev.outcome !== 'pending' && prev.outcome !== 'error') {
            if (prev.reply_text) {
                return { handled: true, replies: [{ text: prev.reply_text }] };
            }
            return { handled: true, replies: [] };
        }
        if (prev?.outcome === 'error') {
            inputs.updateInputOutcome(prev.id, { outcome: null, error: null, reply_text: null }, conn);
        }
    }

    const inputId = logResult.id;

    if (maxAgeSec > 0 && (nowSec - msgTs) > maxAgeSec) {
        inputs.updateInputOutcome(inputId, {
            normalized: normalizeText(text),
            stage: 'none',
            parser_version: PARSER_VERSION,
            outcome: 'stale',
            reply_text: null,
            latency_ms: Date.now() - startTime
        }, conn);
        return { handled: true, replies: [] };
    }

    // 5. Process business input safely:
    try {
        const cleanText = (text || '').trim();
        let replyText = '';
        let outcome = 'unparsed';
        let parsed = null;

        if (!cleanText && rawKind !== 'text') {
            replyText = `(¬_¬) [ BIZ ]\n\nMedia input received from ${person.name}. Media extraction will be enabled in future phase.`;
            outcome = 'media_unprocessed';
        } else if (cleanText.toLowerCase() === 'biz ping' || cleanText.toLowerCase() === 'biz test') {
            replyText = `(¬_¬) [ BIZ ]\n\n• Identity: ${person.name} (${person.role})\n• Input ID: #${inputId}\n• System: Online & recording.`;
            outcome = 'query';
        } else if (isChitchat(cleanText)) {
            replyText = '';
            outcome = 'chitchat';
        } else {
            // Check if there is an active pending question for this person in this chat
            const activeQuestion = conn.prepare(`
                SELECT * FROM pending_questions
                WHERE person_id = ? AND chat = ? AND expires_at > ?
                ORDER BY id DESC LIMIT 1
            `).get(person.id, chat, nowSec);

            if (activeQuestion && isPaymentAnswer(cleanText)) {
                // Resolve follow-up question
                const originalParsed = JSON.parse(activeQuestion.parsed_json);
                const paymentInfo = resolvePaymentDetails(cleanText, person, conn);
                originalParsed.payment_status = paymentInfo.status;
                originalParsed.payment_mode = paymentInfo.mode;
                originalParsed.money_note = paymentInfo.note;
                originalParsed.received_by = paymentInfo.received_by;

                const recorded = sales.recordSale({
                    ts: msgTs,
                    sold_to: originalParsed.sold_to,
                    brand: originalParsed.brand,
                    colour: originalParsed.colour,
                    other_details: originalParsed.other_details,
                    sold_for_paise: originalParsed.sold_for_paise,
                    money_note: originalParsed.money_note,
                    qty: originalParsed.qty,
                    seller_id: person.id,
                    input_id: inputId,
                    payment_mode: originalParsed.payment_mode,
                    received_by: originalParsed.received_by
                }, conn);

                // Asynchronously push to Google Sheets if configured
                sheets.pushSale(recorded.sale, conn).catch(e => console.error('[SHEETS] Push error:', e.message));

                // Clean up answered question
                conn.prepare('DELETE FROM pending_questions WHERE id = ?').run(activeQuestion.id);

                replyText = buildSaleReceipt(recorded.sale, originalParsed.amount);
                outcome = 'recorded';
                parsed = originalParsed;
            } else {
                // Standard NLP rules parser
                parsed = parseMessage(cleanText, { senderPerson: person, db: conn });

                if (parsed.intent === 'undo') {
                    const undoResult = sales.undoLastAction(person.id, conn);
                    if (!undoResult) {
                        replyText = `(¬_¬) [ BIZ ]\n\nUndo karne ke liye koi active record nahi mila.`;
                    } else if (undoResult.type === 'sale') {
                        const s = undoResult.record;
                        sheets.pushVoid(s.id, conn).catch(e => console.error('[SHEETS] Void error:', e.message));
                        const rs = Math.round(s.sold_for_paise / 100);
                        replyText = `(¬_¬) [ BIZ ] ↩️\n\nVoided sale #${s.id} (${s.sold_to || 'Unknown'} - ₹${rs}).`;
                    } else if (undoResult.type === 'payment') {
                        const p = undoResult.record;
                        const rs = Math.round(p.amount_paise / 100);
                        replyText = `(¬_¬) [ BIZ ] ↩️\n\nVoided payment #${p.id} (₹${rs}).`;
                    }
                    outcome = 'undone';
                } else if (parsed.intent === 'query_summary') {
                    // Natural language summary: "aaj ka hisaab", "summary", "aaj kitna bika"
                    const sum = sales.getTodaySummary(conn);
                    replyText = `(¬_¬) [ AAJ KA HISAAB ] 📊\n\n` +
                        `• Today's Sales: ${sum.salesCount} (₹${Math.round(sum.salesTotalPaise / 100)})\n` +
                        `• Cash Collected: ₹${Math.round(sum.cashCollectedPaise / 100)}\n` +
                        `• UPI Collected: ₹${Math.round(sum.upiCollectedPaise / 100)}\n` +
                        `• Total Collected: ₹${Math.round(sum.totalCollectedPaise / 100)}\n\n` +
                        `*Total Outstanding Pending:* ₹${Math.round(sum.totalPendingPaise / 100)}`;
                    outcome = 'query';
                } else if (parsed.intent === 'query_collection') {
                    // Person-wise collection report: "Papa ne kitna collect kiya", "Mummy ka collection"
                    const allPeople = people.getAllPeople(conn);
                    // Try to identify a specific person from the message
                    const norm = parsed.normalized;
                    let targetPerson = null;
                    for (const p of allPeople) {
                        let aliases = [];
                        try {
                            aliases = JSON.parse(p.aliases || '[]');
                        } catch (e) {}
                        const labels = [p.name, ...aliases].map(label => String(label).toLowerCase().trim()).filter(Boolean);
                        if (labels.some(label => (` ${norm} `).includes(` ${label} `))) {
                            targetPerson = p;
                            break;
                        }
                    }

                    const cols = sales.getPersonCollections(conn, { allTime: false });
                    if (!cols.length) {
                        replyText = `(¬_¬) [ BIZ COLLECTION ] 📋\n\nAaj koi payment collect nahi hua.`;
                    } else if (targetPerson) {
                        const col = cols.find(c => c.person_id === targetPerson.id);
                        if (!col) {
                            replyText = `(¬_¬) [ BIZ COLLECTION ] 📋\n\n${targetPerson.name} ne aaj koi payment collect nahi kiya.`;
                        } else {
                            replyText = `(¬_¬) [ BIZ COLLECTION ] 📋\n\n` +
                                `*${col.person_name} ka aaj ka collection:*\n` +
                                `• Cash: ₹${Math.round(col.cash_paise / 100)}\n` +
                                `• UPI: ₹${Math.round(col.upi_paise / 100)}\n` +
                                `• *Total: ₹${Math.round(col.total_paise / 100)}*`;
                        }
                    } else {
                        replyText = `(¬_¬) [ BIZ COLLECTION ] 📋\n\n*Aaj ka person-wise collection:*\n`;
                        for (const col of cols) {
                            replyText += `• *${col.person_name}*: ₹${Math.round(col.total_paise / 100)} (Cash ₹${Math.round(col.cash_paise / 100)} + UPI ₹${Math.round(col.upi_paise / 100)})\n`;
                        }
                    }
                    outcome = 'query';
                } else if (parsed.intent === 'query_pending_customer') {
                    // Person-specific pending: "Meera ka udhar", "Kitna pending Meera"
                    const norm = parsed.normalized;
                    // Extract customer name: word before "ka/ki/ke", or after "pending"
                    let customer = '';
                    const kaMatch = norm.match(/([a-z]+)\s+(?:ka|ki|ke|wala|wali|baaki)\b/i);
                    const afterPending = norm.match(/\bpending\s+([a-z]+)\b/i);
                    const afterUdhar = norm.match(/\budhar\s+([a-z]+)\b/i);
                    if (kaMatch && !['kya', 'kitna', 'koi'].includes(kaMatch[1].toLowerCase())) {
                        customer = kaMatch[1];
                    } else if (afterPending) {
                        customer = afterPending[1];
                    } else if (afterUdhar) {
                        customer = afterUdhar[1];
                    }

                    const pendingList = sales.findPendingSales(customer || null, conn);
                    if (!pendingList.length) {
                        const who = customer ? `"${customer[0].toUpperCase() + customer.slice(1)}"` : 'Koi customer';
                        replyText = `(¬_¬) [ BIZ PENDING ] 📋\n\n${who} ka koi pending amount nahi hai.`;
                    } else {
                        let totalPaise = 0;
                        replyText = `(¬_¬) [ BIZ PENDING ] 📋\n\n`;
                        for (const ps of pendingList) {
                            const pendingRs = Math.round(ps.pending_paise / 100);
                            totalPaise += ps.pending_paise;
                            replyText += `• *#${ps.id} ${ps.sold_to}* - ₹${pendingRs} (${ps.brand || 'Suit'} ${ps.colour || ''})\n`;
                        }
                        replyText += `\n*Total Pending:* ₹${Math.round(totalPaise / 100)}`;
                    }
                    outcome = 'query';
                } else if (parsed.intent === 'query_pending') {
                    const pendingList = sales.findPendingSales(null, conn);
                    if (!pendingList.length) {
                        replyText = `(¬_¬) [ BIZ PENDING ] 📋\n\nKoi pending amount nahi hai. Sab clear hai!`;
                    } else {
                        let totalPaise = 0;
                        replyText = `(¬_¬) [ BIZ PENDING ] 📋\n\n`;
                        for (const ps of pendingList) {
                            const pendingRs = Math.round(ps.pending_paise / 100);
                            totalPaise += ps.pending_paise;
                            replyText += `• *#${ps.id} ${ps.sold_to}* - ₹${pendingRs} (${ps.brand || 'Suit'} ${ps.colour || ''})\n`;
                        }
                        replyText += `\n*Total Pending:* ₹${Math.round(totalPaise / 100)}`;
                    }
                    outcome = 'query';
                } else if (parsed.intent === 'record_payment') {
                    // Settle pending credit sale
                    const settleResult = sales.settleCustomerPending({
                        customer: parsed.customer,
                        amount_paise: parsed.amount_paise,
                        mode: parsed.mode,
                        received_by: parsed.received_by,
                        ts: msgTs,
                        input_id: inputId
                    }, conn);

                    if (settleResult.matched === 0) {
                        replyText = `(¬_¬) [ BIZ ] ⚠️\n\n${parsed.customer ? `"${parsed.customer}"` : 'Customer'} ke naam koi pending sale nahi mili.`;
                        outcome = 'rejected';
                    } else if (settleResult.matched === 1) {
                        const s = settleResult.sale;
                        const remRs = Math.round(settleResult.remainingPaise / 100);
                        const payNote = `${parsed.mode.toUpperCase()} - ${parsed.received_by_name}${remRs > 0 ? ` (Pending: ₹${remRs})` : ''}`;
                        sheets.pushPayment(s, payNote, conn).catch(e => console.error('[SHEETS] Payment push error:', e.message));
                        replyText = `(¬_¬) [ BIZ ] ✅ #${s.id} paid ₹${parsed.amount} (${parsed.mode.toUpperCase()} - ${parsed.received_by_name}). Pending: ₹${remRs}.`;
                        outcome = 'recorded';
                    } else {
                        // Multiple pending sales match customer
                        replyText = `(¬_¬) [ BIZ ] ❓ Multiple pending sales for ${parsed.customer}:\n\n`;
                        for (const ps of settleResult.sales) {
                            replyText += `• #${ps.id}: ₹${Math.round(ps.pending_paise / 100)} (${ps.brand} ${ps.colour})\n`;
                        }
                        replyText += `\nKaunse sale number ke liye payment lagani hai?`;
                        outcome = 'asked';
                    }
                } else if (parsed.intent === 'record_sale') {
                    if (!parsed.amount || parsed.amount <= 0) {
                        replyText = `(¬_¬) [ BIZ ] ❓ Price samajh nahi aaya.\n\nExample:\n"Meera ko Idhu wine suit 40 L 2450 mein beche, pending"`;
                        outcome = 'asked';
                    } else if (parsed.payment_status === 'missing') {
                        // Ask one short follow-up question
                        const expiresAt = nowSec + (15 * 60); // 15 min expiry
                        conn.prepare(`
                            INSERT INTO pending_questions (person_id, chat, input_id, parsed_json, question, created_at, expires_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        `).run(person.id, chat, inputId, JSON.stringify(parsed), 'Payment status missing', nowSec, expiresAt);

                        replyText = `(¬_¬) [ BIZ ] ❓ #${inputId}\n\n• Sold to: ${parsed.sold_to}\n• Item: ${parsed.brand} ${parsed.colour} (${parsed.other_details})\n• Amount: ₹${parsed.amount}\n\n*Money kiske paas aur kaise (Cash/UPI), ya Pending?*`;
                        outcome = 'asked';
                    } else {
                        // Complete sale
                        const recorded = sales.recordSale({
                            ts: msgTs,
                            sold_to: parsed.sold_to,
                            brand: parsed.brand,
                            colour: parsed.colour,
                            other_details: parsed.other_details,
                            sold_for_paise: parsed.sold_for_paise,
                            money_note: parsed.money_note,
                            qty: parsed.qty,
                            seller_id: person.id,
                            input_id: inputId,
                            payment_mode: parsed.payment_mode,
                            received_by: parsed.received_by
                        }, conn);

                        // Asynchronously push to Google Sheets if configured
                        sheets.pushSale(recorded.sale, conn).catch(e => console.error('[SHEETS] Sale push error:', e.message));

                        replyText = buildSaleReceipt(recorded.sale, parsed.amount);
                        outcome = 'recorded';
                    }
                } else {
                    replyText = `(¬_¬) [ BIZ ] ❓\n\nSamajh nahi aaya. Aise likho: Meera ko Idhu wine suit 2450 mein beche, pending`;
                    outcome = 'unparsed';
                }
            }
        }

        const latency = Date.now() - startTime;
        inputs.updateInputOutcome(inputId, {
            normalized: normalizeText(cleanText),
            stage: 'rules',
            parser_version: PARSER_VERSION,
            parsed_json: parsed,
            final_json: outcome === 'recorded' ? parsed : null,
            outcome,
            reply_text: replyText,
            latency_ms: latency
        }, conn);

        return {
            handled: true,
            replies: replyText ? [{ text: replyText }] : []
        };
    } catch (err) {
        console.error('[BIZ] Error handling input:', err);
        const errorReply = '(¬_¬) [ BIZ ] ⚠️ Save nahi hua, dobara bhejo.';
        inputs.updateInputOutcome(inputId, {
            outcome: 'error',
            error: err.message,
            reply_text: errorReply,
            latency_ms: Date.now() - startTime
        }, conn);

        return {
            handled: true,
            replies: [{ text: errorReply }]
        };
    }
}

function buildSaleReceipt(sale, amountRs) {
    const rs = amountRs || Math.round(sale.sold_for_paise / 100);
    return `(¬_¬) [ BIZ ] ✅ #${sale.id}\n\n` +
        `• Sold to: ${sale.sold_to || 'Unknown'}\n` +
        `• Brand: ${sale.brand || 'Other'}\n` +
        `• Colour: ${sale.colour || 'Standard'}\n` +
        `• Details: ${sale.other_details || 'Suit'}\n` +
        `• Amount: ₹${rs}\n` +
        `• Payment: ${sale.money_note || 'Pending'}\n\n` +
        `_Reply "undo" to cancel._`;
}

function isPaymentAnswer(text) {
    const norm = normalizeText(text);
    return /\b(pending|cash|upi|mila|aaya|paid|diye)\b/i.test(norm);
}

function resolvePaymentDetails(text, sender, db) {
    const norm = normalizeText(text);
    if (/\bpending\b/i.test(norm)) {
        return { status: 'pending', mode: null, note: 'Pending', received_by: null };
    }

    let mode = 'cash';
    if (/\bupi\b/i.test(norm)) mode = 'upi';

    let receiverPerson = sender;
    const allPeople = people.getAllPeople(db);
    for (const p of allPeople) {
        const pName = p.name.toLowerCase();
        if (new RegExp(`\\b${pName}\\b`, 'i').test(norm)) {
            receiverPerson = p;
            break;
        }
        try {
            const aliases = JSON.parse(p.aliases || '[]');
            for (const a of aliases) {
                if (new RegExp(`\\b${a.toLowerCase()}\\b`, 'i').test(norm)) {
                    receiverPerson = p;
                    break;
                }
            }
        } catch (e) {}
    }

    const receiverName = receiverPerson ? receiverPerson.name : sender.name;
    const modeLabel = mode === 'cash' ? 'Cash' : 'UPI';

    return {
        status: 'received',
        mode,
        note: `${modeLabel} - ${receiverName}`,
        received_by: receiverPerson ? receiverPerson.id : sender.id
    };
}

module.exports = {
    handle,
    shouldRouteMessage,
    db: require('./db'),
    people,
    inputs,
    sales,
    export: exportModule,
    sheets,
    nlp: {
        normalize: require('./nlp/normalize'),
        rules: require('./nlp/rules')
    }
};
