const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const Database = require('better-sqlite3');
const biz = require('./lib/biz');
const bizCmd = require('./commands/admin/biz');
const { restoreDatabase } = require('./scripts/restore-biz');

console.log('[TEST] Starting Business Module Tests (Phases 1, 2 & 3)...');

// Setup test in-memory SQLite DB
const testDb = new Database(':memory:');
testDb.pragma('journal_mode = WAL');
testDb.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'lib/biz/schema.sql'), 'utf-8');
testDb.exec(schema);
biz.db.migrate(testDb);

// A legacy populated database with user_version 0 is stamped and upgraded safely.
const legacyDb = new Database(':memory:');
legacyDb.pragma('foreign_keys = ON');
legacyDb.exec(schema);
const legacyPerson = legacyDb.prepare("INSERT INTO people (name, role) VALUES ('Legacy', 'member')").run();
legacyDb.prepare(`
    INSERT INTO inputs (msg_id, ts, received_at, person_id, chat, kind, raw_text, outcome)
    VALUES ('LEGACY-001', 10, 11, ?, 'chat', 'text', 'legacy input', 'recorded')
`).run(legacyPerson.lastInsertRowid);
assert.strictEqual(legacyDb.pragma('user_version', { simple: true }), 0);
assert.strictEqual(biz.db.migrate(legacyDb), 2);
assert.strictEqual(legacyDb.prepare("SELECT raw_text FROM inputs WHERE msg_id = 'LEGACY-001'").get().raw_text, 'legacy input');
assert(legacyDb.prepare('PRAGMA table_info(inputs)').all().some(column => column.name === 'label'));
legacyDb.close();

// --- TEST 1: Schema & Tables Verification ---
const tables = testDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
const expectedTables = ['people', 'inputs', 'sales', 'payments', 'pending_questions', 'settings'];
for (const t of expectedTables) {
    assert(tables.includes(t), `Table ${t} should exist`);
}
console.log('✓ Test 1: Tables exist');

// --- TEST 2: Financial Deletion Protection Triggers ---
testDb.prepare("INSERT INTO people (name, role) VALUES ('Tester', 'owner')").run();
testDb.prepare("INSERT INTO sales (ts, sold_for_paise) VALUES (12345, 10000)").run();
testDb.prepare("INSERT INTO payments (sale_id, ts, amount_paise, mode) VALUES (1, 12345, 10000, 'cash')").run();

let salesDeleteBlocked = false;
try {
    testDb.prepare('DELETE FROM sales WHERE id = 1').run();
} catch (e) {
    salesDeleteBlocked = e.message.includes('Deleting sales records is not permitted');
}
assert(salesDeleteBlocked, 'Trigger should block deletion of sales');

let paymentsDeleteBlocked = false;
try {
    testDb.prepare('DELETE FROM payments WHERE id = 1').run();
} catch (e) {
    paymentsDeleteBlocked = e.message.includes('Deleting payments records is not permitted');
}
assert(paymentsDeleteBlocked, 'Trigger should block deletion of payments');
testDb.prepare("UPDATE people SET role = 'member' WHERE name = 'Tester'").run();
console.log('✓ Test 2: Immutability triggers block DELETE on sales and payments');

// --- TEST 3: People Management & Alias Lookup ---
const mom = biz.people.registerPerson({
    name: 'Mummy',
    role: 'member',
    wa_pn: '919811111111@s.whatsapp.net',
    wa_lid: '11111111@lid',
    aliases: ['mom', 'mummy', 'maa']
}, testDb);

const dad = biz.people.registerPerson({
    name: 'Papa',
    role: 'member',
    wa_pn: '919822222222@s.whatsapp.net',
    wa_lid: '22222222@lid',
    aliases: ['dad', 'papa', 'pitaji']
}, testDb);

assert.strictEqual(biz.people.findPersonByIdentifier('11111111@lid', testDb)?.name, 'Mummy');
assert.strictEqual(biz.people.findPersonByIdentifier('919822222222@s.whatsapp.net', testDb)?.name, 'Papa');
assert.strictEqual(biz.people.findPersonByAlias('maa', testDb)?.name, 'Mummy');
assert.strictEqual(biz.people.findPersonByAlias('pitaji', testDb)?.name, 'Papa');
assert.strictEqual(biz.people.findPersonByIdentifier('99999999@lid', testDb), undefined);
console.log('✓ Test 3: People registration, LID/PN and alias lookups succeed');

// --- TEST 4: Chat & Sender Permissions ---
const BIZ_GROUP = '120363000000000000@g.us';
const OTHER_GROUP = '120363999999999999@g.us';
biz.db.setSetting('biz_group_jid', BIZ_GROUP, testDb);

(async () => {
    // 4A: Unauthorized user in biz group -> ignored
    const res1 = await biz.handle({
        msgId: 'MSG-001',
        chat: BIZ_GROUP,
        senderId: '919999999999@s.whatsapp.net',
        ts: 1700000000,
        type: 'text',
        text: 'hello'
    }, { db: testDb, nowSec: 1700000000 });
    assert.strictEqual(res1.handled, false);
    assert.strictEqual(testDb.prepare('SELECT count(*) as c FROM inputs').get().c, 0);

    // 4B: Authorized user in unauthorized group -> ignored
    const res2 = await biz.handle({
        msgId: 'MSG-002',
        chat: OTHER_GROUP,
        senderId: '11111111@lid',
        ts: 1700000001,
        type: 'text',
        text: 'hello'
    }, { db: testDb, nowSec: 1700000001 });
    assert.strictEqual(res2.handled, false);
    assert.strictEqual(testDb.prepare('SELECT count(*) as c FROM inputs').get().c, 0);

    // 4C: Authorized user in DM -> handled
    const res3 = await biz.handle({
        msgId: 'MSG-003',
        chat: '919811111111@s.whatsapp.net',
        senderId: '919811111111@s.whatsapp.net',
        ts: 1700000002,
        type: 'text',
        text: 'biz ping'
    }, { db: testDb, nowSec: 1700000002 });
    assert.strictEqual(res3.handled, true);
    assert(res3.replies[0].text.includes('Identity: Mummy'));
    const input3 = testDb.prepare("SELECT * FROM inputs WHERE msg_id = 'MSG-003'").get();
    assert.strictEqual(input3.person_id, mom.id);
    assert.strictEqual(input3.outcome, 'query');

    const fromMeResult = await biz.handle({
        msgId: 'MSG-FROM-ME-001',
        chat: '919811111111@s.whatsapp.net',
        senderId: '919811111111@s.whatsapp.net',
        fromMe: true,
        ts: 1700000003,
        type: 'text',
        text: 'hello'
    }, { db: testDb, nowSec: 1700000003 });
    assert.strictEqual(fromMeResult.handled, false);
    assert.strictEqual(testDb.prepare("SELECT count(*) AS c FROM inputs WHERE msg_id = 'MSG-FROM-ME-001'").get().c, 0);
    assert.strictEqual(biz.shouldRouteMessage({ fromMe: true }), false);
    assert.strictEqual(biz.shouldRouteMessage({ isMentioned: true }), false);
    assert.strictEqual(biz.shouldRouteMessage({ isReplyToBot: true, quotedText: 'normal AI reply' }), false);
    assert.strictEqual(biz.shouldRouteMessage({ isReplyToBot: true, quotedText: '(¬_¬) [ BIZ ] ✅ receipt' }), true);
    assert.strictEqual(biz.shouldRouteMessage({}), true);

    const greeting = await biz.handle({
        msgId: 'MSG-GREETING-001', chat: BIZ_GROUP, senderId: '11111111@lid',
        ts: 1700000004, type: 'text', text: 'Hi bunty, good morning dosto'
    }, { db: testDb, nowSec: 1700000004 });
    assert.deepStrictEqual(greeting.replies, []);
    assert.strictEqual(testDb.prepare("SELECT outcome FROM inputs WHERE msg_id = 'MSG-GREETING-001'").get().outcome, 'chitchat');

    const unknown = await biz.handle({
        msgId: 'MSG-UNPARSED-001', chat: BIZ_GROUP, senderId: '11111111@lid',
        ts: 1700000005, type: 'text', text: 'random words here'
    }, { db: testDb, nowSec: 1700000005 });
    assert(unknown.replies[0].text.includes('Samajh nahi aaya'));
    assert(!unknown.replies[0].text.includes('logged'));
    assert.strictEqual(testDb.prepare("SELECT outcome FROM inputs WHERE msg_id = 'MSG-UNPARSED-001'").get().outcome, 'unparsed');

    await biz.handle({
        msgId: 'MSG-MEDIA-001', chat: BIZ_GROUP, senderId: '11111111@lid',
        ts: 1700000006, type: 'image', text: ''
    }, { db: testDb, nowSec: 1700000006 });
    assert.strictEqual(testDb.prepare("SELECT outcome FROM inputs WHERE msg_id = 'MSG-MEDIA-001'").get().outcome, 'media_unprocessed');

    const staleRes = await biz.handle({
        msgId: 'MSG-STALE-001',
        chat: BIZ_GROUP,
        senderId: '11111111@lid',
        ts: 1700000000,
        type: 'text',
        text: 'Meera ko Idhu suit 1000 pending'
    }, { db: testDb, nowSec: 1700000000 + (25 * 3600) });
    assert.strictEqual(staleRes.handled, true);
    assert.deepStrictEqual(staleRes.replies, [], 'Stale messages must not receive a reply');
    const staleInput = testDb.prepare("SELECT * FROM inputs WHERE msg_id = 'MSG-STALE-001'").get();
    assert.strictEqual(staleInput.outcome, 'stale', 'Stale input should be retained in the audit log');

    biz.db.setSetting('biz_max_msg_age_hours', 'invalid', testDb);
    await biz.handle({
        msgId: 'MSG-AGE-INVALID-001', chat: BIZ_GROUP, senderId: '11111111@lid',
        ts: 1700000000, type: 'text', text: 'hello'
    }, { db: testDb, nowSec: 1700000000 + (25 * 3600) });
    assert.strictEqual(testDb.prepare("SELECT outcome FROM inputs WHERE msg_id = 'MSG-AGE-INVALID-001'").get().outcome, 'stale');

    biz.db.setSetting('biz_max_msg_age_hours', '0', testDb);
    const noAgeLimit = await biz.handle({
        msgId: 'MSG-AGE-DISABLED-001', chat: BIZ_GROUP, senderId: '11111111@lid',
        ts: 1700000000, type: 'text', text: 'biz ping'
    }, { db: testDb, nowSec: 1700000000 + (25 * 3600) });
    assert(noAgeLimit.replies[0].text.includes('Identity: Mummy'), 'Zero disables the age limit');
    biz.db.setSetting('biz_max_msg_age_hours', '24', testDb);
    console.log('✓ Test 4: Chat and sender permission boundaries validated');

    // --- TEST 5: NLP Normalizer & Lexicon ---
    const norm1 = biz.nlp.normalize.normalizeText('Meera ko Idhu wine sued 40 L ₹2450 mein beche, pending');
    assert(norm1.includes('suit'), 'Spelling variant sued -> suit');
    assert(norm1.includes('2450'), 'Currency ₹ stripped to 2450');
    assert(norm1.includes('pending'), 'Pending preserved');

    const norm2 = biz.nlp.normalize.normalizeText('dedh hazaar cash diye');
    assert(norm2.includes('1500'), 'dedh hazaar -> 1500');

    const norm3 = biz.nlp.normalize.normalizeText('2 hazar upi');
    assert(norm3.includes('2000'), '2 hazar -> 2000');
    const digitSale = biz.nlp.rules.parseMessage('Meera ko 2450 mein beche', { db: testDb, senderPerson: mom });
    assert.strictEqual(digitSale.intent, 'record_sale', 'Digit-bearing sale language must remain a sale intent');
    console.log('✓ Test 5: Normalizer & Hindi amount lexicons pass');

    // --- TEST 6: Phase 2 - Record Real Sales ---
    // 6A: Pending credit sale (Meera)
    const saleRes1 = await biz.handle({
        msgId: 'MSG-SALE-001',
        chat: BIZ_GROUP,
        senderId: '11111111@lid',
        ts: 1700000100,
        type: 'text',
        text: 'Meera ko Idhu wine suit 40 L 2450 mein beche, pending'
    }, { db: testDb, nowSec: 1700000100 });

    assert.strictEqual(saleRes1.handled, true);
    assert(saleRes1.replies[0].text.includes('Sold to: Meera'));
    assert(saleRes1.replies[0].text.includes('₹2450'));
    assert(saleRes1.replies[0].text.includes('Payment: Pending'));
    assert(saleRes1.replies[0].text.includes('Brand: Idhu'));
    const saleInput1 = testDb.prepare("SELECT * FROM inputs WHERE msg_id = 'MSG-SALE-001'").get();
    assert.strictEqual(JSON.parse(saleInput1.parsed_json).intent, 'record_sale', 'Digit-bearing pending sale must parse as a sale');

    const saleRow1 = testDb.prepare("SELECT * FROM sales WHERE sold_to = 'Meera'").get();
    assert.strictEqual(saleRow1.sold_for_paise, 245000);
    assert.strictEqual(saleRow1.money_note, 'Pending');

    // 6B: Cash upfront sale (Aaj 2 suit 1200 mein beche, cash Mummy ke paas)
    const saleRes2 = await biz.handle({
        msgId: 'MSG-SALE-002',
        chat: BIZ_GROUP,
        senderId: '22222222@lid',
        ts: 1700000200,
        type: 'text',
        text: 'Aaj 2 suit 1200 mein beche, cash Mummy ke paas'
    }, { db: testDb, nowSec: 1700000200 });

    assert.strictEqual(saleRes2.handled, true);
    assert(saleRes2.replies[0].text.includes('₹1200'));
    assert(saleRes2.replies[0].text.includes('Cash - Mummy'));

    const saleRow2 = testDb.prepare("SELECT * FROM sales WHERE id = ?").get(saleRow1.id + 1);
    assert.strictEqual(saleRow2.sold_for_paise, 120000);
    const payRow2 = testDb.prepare("SELECT * FROM payments WHERE sale_id = ?").get(saleRow2.id);
    assert(payRow2, 'Upfront cash sale must have linked payments row');
    assert.strictEqual(payRow2.amount_paise, 120000);
    assert.strictEqual(payRow2.mode, 'cash');
    console.log('✓ Test 6: Recording sales (credit/pending & cash upfront) passes');

    // --- TEST 7: Phase 2 - Settle Pending Credit Sale ---
    // Meera was pending ₹2450; now paying ₹2450 cash
    const settleRes = await biz.handle({
        msgId: 'MSG-PAY-001',
        chat: BIZ_GROUP,
        senderId: '11111111@lid',
        ts: 1700000300,
        type: 'text',
        text: 'Meera ne 2450 cash diye'
    }, { db: testDb, nowSec: 1700000300 });

    assert.strictEqual(settleRes.handled, true);
    assert(settleRes.replies[0].text.includes('paid ₹2450'));
    assert(settleRes.replies[0].text.includes('Pending: ₹0'));

    const pendingAfter = biz.sales.findPendingSales('Meera', testDb);
    assert.strictEqual(pendingAfter.length, 0, 'Meera pending sale should now be settled');

    // Regression: a numeric payment phrase must not be mistaken for a collection report.
    const papaPending = biz.sales.recordSale({
        ts: 1700000310,
        sold_to: 'Papa',
        brand: 'Idhu',
        colour: 'Blue',
        other_details: 'Suit',
        sold_for_paise: 200000,
        money_note: 'Pending',
        seller_id: mom.id
    }, testDb).sale;
    const papaPayRes = await biz.handle({
        msgId: 'MSG-PAY-UPI-001',
        chat: BIZ_GROUP,
        senderId: '11111111@lid',
        ts: 1700000320,
        type: 'text',
        text: 'Papa ne 2000 UPI received'
    }, { db: testDb, nowSec: 1700000320 });
    assert(papaPayRes.replies[0].text.includes('paid ₹2000'), 'Papa UPI payment should settle the pending sale');
    const papaPayment = testDb.prepare('SELECT * FROM payments WHERE sale_id = ?').get(papaPending.id);
    assert(papaPayment, 'Payment message should create a payment row');
    assert.strictEqual(papaPayment.amount_paise, 200000);
    assert.strictEqual(papaPayment.mode, 'upi');
    assert.strictEqual(JSON.parse(testDb.prepare("SELECT parsed_json FROM inputs WHERE msg_id = 'MSG-PAY-UPI-001'").get().parsed_json).intent, 'record_payment');
    assert.strictEqual(testDb.prepare("SELECT outcome FROM inputs WHERE msg_id = 'MSG-PAY-UPI-001'").get().outcome, 'recorded');

    const rejectedPayment = await biz.handle({
        msgId: 'MSG-PAY-REJECT-001', chat: BIZ_GROUP, senderId: '11111111@lid',
        ts: 1700000330, type: 'text', text: 'UnknownCustomer ne 500 cash diye'
    }, { db: testDb, nowSec: 1700000330 });
    assert(rejectedPayment.replies[0].text.includes('koi pending sale nahi mili'));
    assert.strictEqual(testDb.prepare("SELECT outcome FROM inputs WHERE msg_id = 'MSG-PAY-REJECT-001'").get().outcome, 'rejected');
    console.log('✓ Test 7: Settle pending credit sale passes');

    // Simulate a failure after the sale INSERT but during payment INSERT.
    testDb.exec(`
        CREATE TRIGGER fail_one_test_payment BEFORE INSERT ON payments
        WHEN NEW.input_id = (SELECT id FROM inputs WHERE msg_id = 'MSG-CRASH-001')
          AND (SELECT value FROM settings WHERE key = 'test_fail_payment') = '1'
        BEGIN
            SELECT RAISE(ABORT, 'simulated payment insert failure');
        END;
    `);
    biz.db.setSetting('test_fail_payment', '1', testDb);
    const crashMessage = {
        msgId: 'MSG-CRASH-001', chat: BIZ_GROUP, senderId: '11111111@lid',
        ts: 1700000340, type: 'text', text: 'CrashCustomer ko Idhu red suit 1300 mein beche, cash Mummy ke paas'
    };
    const failedSale = await biz.handle(crashMessage, { db: testDb, nowSec: 1700000340 });
    assert(failedSale.replies[0].text.includes('Save nahi hua'));
    assert.strictEqual(testDb.prepare("SELECT count(*) AS c FROM sales WHERE sold_to = 'Crashcustomer'").get().c, 0);
    assert.strictEqual(testDb.prepare("SELECT outcome FROM inputs WHERE msg_id = 'MSG-CRASH-001'").get().outcome, 'error');

    biz.db.setSetting('test_fail_payment', '0', testDb);
    const retriedSale = await biz.handle(crashMessage, { db: testDb, nowSec: 1700000340 });
    assert(retriedSale.replies[0].text.includes('Crashcustomer'));
    const recoveredSale = testDb.prepare("SELECT * FROM sales WHERE sold_to = 'Crashcustomer'").get();
    assert(recoveredSale);
    assert.strictEqual(testDb.prepare('SELECT count(*) AS c FROM sales WHERE sold_to = ?').get('Crashcustomer').c, 1);
    assert.strictEqual(testDb.prepare('SELECT count(*) AS c FROM payments WHERE sale_id = ?').get(recoveredSale.id).c, 1);
    testDb.exec('DROP TRIGGER fail_one_test_payment');

    const duplicateSale = {
        msgId: 'MSG-REDILIVERY-001', chat: BIZ_GROUP, senderId: '11111111@lid',
        ts: 1700000350, type: 'text', text: 'RepeatCustomer ko Idhu suit 750 mein beche, pending'
    };
    await biz.handle(duplicateSale, { db: testDb, nowSec: 1700000350 });
    await biz.handle(duplicateSale, { db: testDb, nowSec: 1700000350 });
    assert.strictEqual(testDb.prepare("SELECT count(*) AS c FROM sales WHERE sold_to = 'Repeatcustomer'").get().c, 1);
    console.log('✓ Test 7B: Sale transaction rollback and message redelivery are idempotent');

    // --- TEST 8: Phase 2 - Missing Payment Status & Follow-up Question ---
    // User sends sale without specifying payment status
    const askRes = await biz.handle({
        msgId: 'MSG-ASK-001',
        chat: BIZ_GROUP,
        senderId: '11111111@lid',
        ts: 1700000400,
        type: 'text',
        text: 'Varun red suit 1800 mein becha'
    }, { db: testDb, nowSec: 1700000400 });

    assert.strictEqual(askRes.handled, true);
    assert(askRes.replies[0].text.includes('Money kiske paas aur kaise'));
    assert.strictEqual(testDb.prepare("SELECT outcome FROM inputs WHERE msg_id = 'MSG-ASK-001'").get().outcome, 'asked');

    // Answering the pending question with "UPI Papa"
    const ansRes = await biz.handle({
        msgId: 'MSG-ANS-001',
        chat: BIZ_GROUP,
        senderId: '11111111@lid',
        ts: 1700000410,
        type: 'text',
        text: 'UPI Papa'
    }, { db: testDb, nowSec: 1700000410 });

    assert.strictEqual(ansRes.handled, true);
    assert(ansRes.replies[0].text.includes('Amount: ₹1800'));
    assert(ansRes.replies[0].text.includes('Payment: UPI - Papa'));
    console.log('✓ Test 8: Follow-up question and resolution flow passes');

    // --- TEST 9: Phase 2 - Undo / Void Functionality ---
    // Undo the last action
    const undoRes = await biz.handle({
        msgId: 'MSG-UNDO-001',
        chat: BIZ_GROUP,
        senderId: '11111111@lid',
        ts: 1700000420,
        type: 'text',
        text: 'undo'
    }, { db: testDb, nowSec: 1700000420 });

    assert.strictEqual(undoRes.handled, true);
    assert(undoRes.replies[0].text.includes('Voided'));
    assert.strictEqual(testDb.prepare("SELECT outcome FROM inputs WHERE msg_id = 'MSG-UNDO-001'").get().outcome, 'undone');
    console.log('✓ Test 9: Undo voids recent record cleanly');

    // --- TEST 10: Phase 2 - Export & Import Matching Google Form Layout ---
    const csvExport = biz.export.exportToCsv(testDb);
    assert(csvExport.startsWith('Timestamp,Sold to,Brand,Colour,Other details,Sold for (₹),Who got money and how'));
    assert(csvExport.includes('Meera'));
    assert(csvExport.includes('Idhu'));

    // Test import
    const seedCsv = `Timestamp,Sold to,Brand,Colour,Other details,Sold for (₹),Who got money and how
2026-11-13 15:30,Rajesh,Idhu,Beige,sued 40 L,2450,Pending`;
    const importRes = biz.export.importFromCsv(seedCsv, testDb);
    assert.strictEqual(importRes.imported, 1);
    const importedRow = testDb.prepare("SELECT * FROM sales WHERE sold_to = 'Rajesh'").get();
    assert.strictEqual(importedRow.sold_for_paise, 245000);
    assert.strictEqual(importedRow.colour, 'Beige');
    console.log('✓ Test 10: Google Form CSV export and import pass');

    // --- TEST 11: Phase 2 - Admin Commands (.biz summary, pending, export) ---
    let lastSentText = '';
    const mockSock = {
        sendMessage: async (jid, content) => {
            lastSentText = content.text;
            return { key: { id: 'MOCK-MSG' } };
        }
    };

    await bizCmd.run({
        sock: mockSock,
        msg: {},
        jid: BIZ_GROUP,
        sender: '11111111@lid',
        isSuperAdmin: true,
        args: ['summary'],
        isGroup: true,
        db: testDb
    });
    assert(lastSentText.includes('AAJ KA HISAAB'));
    assert(lastSentText.includes('Today\'s Sales:'));

    await bizCmd.run({
        sock: mockSock,
        msg: {},
        jid: BIZ_GROUP,
        sender: '11111111@lid',
        isSuperAdmin: true,
        args: ['pending'],
        isGroup: true,
        db: testDb
    });
    assert(lastSentText.includes('BIZ PENDING'));

    await bizCmd.run({
        sock: mockSock,
        msg: {},
        jid: BIZ_GROUP,
        sender: '11111111@lid',
        isSuperAdmin: true,
        args: ['export'],
        isGroup: true,
        db: testDb
    });
    assert(lastSentText.includes('BIZ EXPORT'));
    assert(lastSentText.includes('Timestamp,Sold to'));
    await bizCmd.run({
        sock: mockSock, msg: {}, jid: BIZ_GROUP, sender: '11111111@lid',
        isSuperAdmin: true, args: ['status'], isGroup: true, db: testDb
    });
    assert(lastSentText.includes('DB Schema Version: v2'));
    assert(lastSentText.includes('Inputs by outcome:'));
    assert(lastSentText.includes('chitchat: 1'));
    console.log('✓ Test 11: Admin commands (.biz summary, pending, export) pass');

    // --- TEST 12: Google Sheets Sync (Outbound & Inbound) ---
    assert.strictEqual(biz.sheets.isEnabled(testDb), false, 'Initially disabled without URL');

    // Test .biz setsheet command
    await bizCmd.run({
        sock: mockSock,
        msg: {},
        jid: BIZ_GROUP,
        sender: '11111111@lid',
        isSuperAdmin: true,
        args: ['setsheet', 'https://script.google.com/macros/s/TEST/exec'],
        isGroup: true,
        db: testDb
    });
    assert(lastSentText.includes('Google Sheets URL saved'));
    assert.strictEqual(biz.sheets.isEnabled(testDb), false, 'Sheets should stay disabled without a sync secret');
    const noSecretSync = await biz.sheets.syncAll(testDb);
    assert.strictEqual(noSecretSync.success, false);
    assert(noSecretSync.error.includes('secret is required'));
    biz.db.setSetting('biz_sheets_secret', 'test-sync-secret', testDb);
    assert.strictEqual(biz.sheets.isEnabled(testDb), true);

    // Mock global fetch for testing outbound & inbound sheet syncing
    const originalFetch = global.fetch;
    let lastPostPayload = null;
    let mockGetRows = [];

    global.fetch = async (url, options = {}) => {
        if (options.method === 'POST') {
            lastPostPayload = JSON.parse(options.body);
            if (lastPostPayload.action === 'pull_rows') {
                return {
                    json: async () => ({
                        success: true,
                        last_row: 5,
                        rows: mockGetRows
                    })
                };
            }
            return {
                json: async () => ({ success: true, row: 10 })
            };
        }
        if (!options.method || options.method === 'GET') {
            return {
                json: async () => ({
                    success: true,
                    last_row: 5,
                    rows: mockGetRows
                })
            };
        }
    };

    try {
        // Test outbound push
        const testSale = {
            id: 99,
            ts: 1700000000,
            sold_to: 'Simran',
            brand: 'Idhu',
            colour: 'Wine',
            other_details: 'Suit 40',
            sold_for_paise: 250000,
            money_note: 'Pending'
        };
        const pushRes = await biz.sheets.pushSale(testSale, testDb);
        assert.strictEqual(pushRes.success, true);
        assert.strictEqual(lastPostPayload.action, 'append_sale');
        assert.strictEqual(lastPostPayload.secret, 'test-sync-secret');
        assert.strictEqual(lastPostPayload.sold_to, 'Simran');
        assert.strictEqual(lastPostPayload.amount, 2500);

        // Test payment update push
        const payPushRes = await biz.sheets.pushPayment(testSale, 'Cash - Mummy', testDb);
        assert.strictEqual(payPushRes.success, true);
        assert.strictEqual(lastPostPayload.action, 'update_payment');
        assert.strictEqual(lastPostPayload.money_note, 'Cash - Mummy');

        // Test inbound pull: simulate new row submitted via Google Form
        mockGetRows = [
            {
                row_number: 5,
                timestamp: '2026-11-14 18:00',
                sold_to: 'Kavita',
                brand: 'Varun',
                colour: 'Green',
                other_details: 'Suit 38 M',
                amount: 1800,
                money_note: 'Pending',
                bunty_id: '' // Empty because it was entered via Google Form!
            }
        ];

        const pullRes = await biz.sheets.pullNewRows(testDb);
        assert.strictEqual(pullRes.success, true);
        assert.strictEqual(pullRes.pulled, 1);
        assert.strictEqual(lastPostPayload.action, 'pull_rows');
        assert.strictEqual(lastPostPayload.secret, 'test-sync-secret');
        assert.strictEqual(typeof lastPostPayload.from_row, 'number');

        const kavitaRow = testDb.prepare("SELECT * FROM sales WHERE sold_to = 'Kavita'").get();
        assert(kavitaRow, 'Google Form entry should be imported into sales');
        assert.strictEqual(kavitaRow.sold_for_paise, 180000);
        assert.strictEqual(kavitaRow.colour, 'Green');

        // A concurrent pull must be rejected while the first request is still in flight.
        const pullFetch = global.fetch;
        let finishBlockedFetch;
        global.fetch = async () => new Promise(resolve => {
            finishBlockedFetch = () => resolve({
                json: async () => ({ success: true, last_row: 5, rows: [] })
            });
        });
        const blockedPull = biz.sheets.pullNewRows(testDb);
        await new Promise(resolve => setImmediate(resolve));
        const overlappingPull = await biz.sheets.pullNewRows(testDb);
        assert.strictEqual(overlappingPull.reason, 'already_in_progress');
        finishBlockedFetch();
        assert.strictEqual((await blockedPull).success, true);
        global.fetch = pullFetch;

        // Test .biz sync command
        await bizCmd.run({
            sock: mockSock,
            msg: {},
            jid: BIZ_GROUP,
            sender: '11111111@lid',
            isSuperAdmin: true,
            args: ['sync'],
            isGroup: true,
            db: testDb
        });
        assert(lastSentText.includes('BIZ SYNC'));
        console.log('✓ Test 12: Google Sheets two-way sync (outbound push & inbound pull) passes');
    } finally {
        global.fetch = originalFetch;
    }
    // Keep later tests from attempting a real async Sheets write.
    biz.db.setSetting('biz_sheets_url', '', testDb);

    // --- TEST 13: Phase 3 - Natural Language Report Intents ---
    // 13A: "aaj ka hisaab" → query_summary
    const sumRes = await biz.handle({
        msgId: 'MSG-SUM-001',
        chat: BIZ_GROUP,
        senderId: '11111111@lid',
        ts: 1700001000,
        type: 'text',
        text: 'aaj ka hisaab'
    }, { db: testDb, nowSec: 1700001000 });
    assert.strictEqual(sumRes.handled, true);
    assert(sumRes.replies[0].text.includes('AAJ KA HISAAB'), 'Should return daily summary');
    assert(sumRes.replies[0].text.includes("Today's Sales:"), 'Should include sales count');
    assert.strictEqual(testDb.prepare("SELECT outcome FROM inputs WHERE msg_id = 'MSG-SUM-001'").get().outcome, 'query');

    // 13B: "summary" → query_summary
    const sumRes2 = await biz.handle({
        msgId: 'MSG-SUM-002',
        chat: BIZ_GROUP,
        senderId: '11111111@lid',
        ts: 1700001010,
        type: 'text',
        text: 'summary'
    }, { db: testDb, nowSec: 1700001010 });
    assert(sumRes2.replies[0].text.includes('AAJ KA HISAAB'), 'summary → daily hisaab');

    // 13C: Customer-specific pending: "Meera ka udhar" → query_pending_customer
    // We need an active pending sale first (Meera was settled; create a new one)
    const saleRes3 = await biz.handle({
        msgId: 'MSG-SALE-NLP-01',
        chat: BIZ_GROUP,
        senderId: '11111111@lid',
        ts: 1700001100,
        type: 'text',
        text: 'Meera ko Belliza pink suit 1800 pending'
    }, { db: testDb, nowSec: 1700001100 });
    assert(saleRes3.handled, 'Should record new Meera pending sale');

    const pendingCustomerRes = await biz.handle({
        msgId: 'MSG-PEND-CUST-01',
        chat: BIZ_GROUP,
        senderId: '11111111@lid',
        ts: 1700001200,
        type: 'text',
        text: 'Meera ka udhar'
    }, { db: testDb, nowSec: 1700001200 });
    assert.strictEqual(pendingCustomerRes.handled, true);
    assert(pendingCustomerRes.replies[0].text.includes('BIZ PENDING'), 'Customer pending query reply');
    assert(pendingCustomerRes.replies[0].text.includes('Meera'), 'Reply should mention Meera');

    // 13D: Global pending: "pending" → query_pending (all pending)
    const pendingGlobalRes = await biz.handle({
        msgId: 'MSG-PEND-GLOB-01',
        chat: BIZ_GROUP,
        senderId: '11111111@lid',
        ts: 1700001300,
        type: 'text',
        text: 'pending'
    }, { db: testDb, nowSec: 1700001300 });
    assert.strictEqual(pendingGlobalRes.handled, true);
    assert(pendingGlobalRes.replies[0].text.includes('BIZ PENDING'));
    assert.strictEqual(testDb.prepare("SELECT outcome FROM inputs WHERE msg_id = 'MSG-PEND-GLOB-01'").get().outcome, 'query');
    console.log('✓ Test 13: Natural language report intents (summary, customer pending, global pending) pass');

    // --- TEST 14: Phase 3 - Person-wise Collection Query & .biz report ---
    // 14A: NL collection query ("Papa ne kitna collect kiya")
    // First need a payment collected by Papa; settle the Rajesh import row
    const rajeshSale = testDb.prepare("SELECT * FROM sales WHERE sold_to = 'Rajesh'").get();
    if (rajeshSale) {
        biz.sales.settleCustomerPending({
            customer: 'Rajesh',
            amount_paise: rajeshSale.sold_for_paise,
            mode: 'cash',
            received_by: dad.id,
            ts: 1700001400,
            input_id: null
        }, testDb);
    }

    const colRes = await biz.handle({
        msgId: 'MSG-COL-001',
        chat: BIZ_GROUP,
        senderId: '11111111@lid',
        ts: 1700001500,
        type: 'text',
        text: 'Papa ne kitna collect kiya'
    }, { db: testDb, nowSec: 1700001500 });
    assert.strictEqual(colRes.handled, true);
    assert(colRes.replies[0].text.includes('BIZ COLLECTION'), 'Collection intent routed correctly');
    assert.strictEqual(testDb.prepare("SELECT outcome FROM inputs WHERE msg_id = 'MSG-COL-001'").get().outcome, 'query');

    // 14B: .biz report command
    await bizCmd.run({
        sock: mockSock,
        msg: {},
        jid: BIZ_GROUP,
        sender: '11111111@lid',
        isSuperAdmin: true,
        args: ['report'],
        isGroup: true,
        db: testDb
    });
    assert(lastSentText.includes('BIZ COLLECTION'), '.biz report returns collection text');

    // 14C: .biz report Papa (person-specific)
    await bizCmd.run({
        sock: mockSock,
        msg: {},
        jid: BIZ_GROUP,
        sender: '11111111@lid',
        isSuperAdmin: true,
        args: ['report', 'Papa'],
        isGroup: true,
        db: testDb
    });
    assert(lastSentText.includes('BIZ COLLECTION'), '.biz report Papa returns collection text');

    // User management is available to active owners and super admins only.
    const owner = biz.people.registerPerson({ name: 'OwnerOne', role: 'owner', wa_lid: '33333333@lid' }, testDb);
    const runAsOwner = (args, sender = owner.wa_lid) => bizCmd.run({
        sock: mockSock, msg: {}, jid: BIZ_GROUP, sender,
        isSuperAdmin: false, args, isGroup: true, db: testDb
    });
    await bizCmd.run({
        sock: mockSock, msg: {}, jid: BIZ_GROUP, sender: mom.wa_lid,
        isSuperAdmin: false, args: ['adduser', 'Blocked', 'member', '44444444@lid'],
        isGroup: true, db: testDb
    });
    assert(lastSentText.includes('Only a registered owner'));

    await runAsOwner(['edituser', 'OwnerOne', 'role=member']);
    assert(lastSentText.includes('last active owner'));
    assert.strictEqual(biz.people.findPersonByName('OwnerOne', testDb).role, 'owner');

    await runAsOwner(['adduser', 'OwnerTwo', 'owner', '55555555@lid', 'second']);
    assert(lastSentText.includes('Registered OwnerTwo'));
    await runAsOwner(['adduser', 'Guest', 'member', '66666666@s.whatsapp.net']);
    await runAsOwner(['addid', 'Guest', '77777777@lid']);
    assert.strictEqual(biz.people.findPersonByName('Guest', testDb).wa_lid, '77777777@lid');
    await runAsOwner(['edituser', 'Guest', 'name=GuestNew', 'aliases=customer,client']);
    const editedGuest = biz.people.findPersonByName('GuestNew', testDb);
    assert.deepStrictEqual(JSON.parse(editedGuest.aliases), ['customer', 'client']);
    await runAsOwner(['removeuser', 'GuestNew']);
    assert.strictEqual(biz.people.findPersonByName('GuestNew', testDb).active, 0);
    await runAsOwner(['restoreuser', 'GuestNew']);
    assert.strictEqual(biz.people.findPersonByName('GuestNew', testDb).active, 1);
    await runAsOwner(['edituser', 'OwnerOne', 'role=member']);
    assert.strictEqual(biz.people.findPersonByName('OwnerOne', testDb).role, 'member');
    await runAsOwner(['removeuser', 'OwnerTwo'], '55555555@lid');
    assert(lastSentText.includes('last active owner'));
    console.log('✓ Test 11A: Owner and super-admin user management commands pass');

    // Exact sale phrase stays a sale intent and completes after the existing payment question.
    const shortSaleQuestion = await biz.handle({
        msgId: 'MSG-SHORT-SALE-001', chat: BIZ_GROUP, senderId: '11111111@lid',
        ts: 1700001600, type: 'text', text: 'Meera ko 2450 mein beche'
    }, { db: testDb, nowSec: 1700001600 });
    assert(shortSaleQuestion.replies[0].text.includes('Money kiske paas'));
    const shortSaleSaved = await biz.handle({
        msgId: 'MSG-SHORT-SALE-ANSWER-001', chat: BIZ_GROUP, senderId: '11111111@lid',
        ts: 1700001610, type: 'text', text: 'pending'
    }, { db: testDb, nowSec: 1700001610 });
    assert(shortSaleSaved.replies[0].text.includes('₹2450'));
    assert.strictEqual(testDb.prepare("SELECT count(*) AS c FROM sales WHERE sold_for_paise = 245000 AND sold_to = 'Meera'").get().c, 2);

    // 14D: .biz backup (manual backup — skipped in :memory: test, just verify no crash)
    const backupResult = biz.db.createBackup({ dbPath: ':memory:' });
    assert.strictEqual(backupResult.success, false, ':memory: DB backup should fail gracefully');
    assert(backupResult.error, 'Should have an error message');
    console.log('✓ Test 14: Person-wise collection reports & backup utility pass');

    const restoreDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bunty-biz-restore-'));
    const restorePath = path.join(restoreDir, 'biz.db');
    const restoreDb = biz.db.getDb(restorePath);
    biz.sales.recordSale({ ts: 1700001700, sold_to: 'BeforeBackup', sold_for_paise: 10000, money_note: 'Pending' }, restoreDb);
    const backup = biz.db.createBackup({ dbPath: restorePath, backupDir: path.join(restoreDir, 'backups') });
    assert.strictEqual(backup.success, true, backup.error);
    biz.sales.recordSale({ ts: 1700001710, sold_to: 'AfterBackup', sold_for_paise: 20000, money_note: 'Pending' }, restoreDb);
    assert.strictEqual(restoreDatabase({ backupFile: backup.file, dbPath: restorePath }).success, false, 'Restore must require force');
    restoreDb.close();
    const restoreResult = restoreDatabase({ backupFile: backup.file, dbPath: restorePath, force: true });
    assert.strictEqual(restoreResult.success, true, restoreResult.error);
    assert(fs.existsSync(`${restorePath}.before-restore`), 'Previous database should be retained');
    const restoredDb = new Database(restorePath, { readonly: true });
    assert.strictEqual(restoredDb.prepare('SELECT count(*) AS c FROM sales').get().c, 1);
    assert.strictEqual(restoredDb.prepare("SELECT count(*) AS c FROM sales WHERE sold_to = 'AfterBackup'").get().c, 0);
    restoredDb.close();
    fs.rmSync(restoreDir, { recursive: true, force: true });
    console.log('✓ Test 16: Backup integrity check and forced restore remove later changes');

    console.log('\nALL BUSINESS PHASE 1, 2 & 3 TESTS PASSED! (¬_¬) ✅');
})();
