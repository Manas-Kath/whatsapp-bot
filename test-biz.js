const assert = require('assert');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const biz = require('./lib/biz');
const bizCmd = require('./commands/admin/biz');

console.log('[TEST] Starting Business Module Tests (Phase 1 & Phase 2)...');

// Setup test in-memory SQLite DB
const testDb = new Database(':memory:');
testDb.pragma('journal_mode = WAL');
testDb.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'lib/biz/schema.sql'), 'utf-8');
testDb.exec(schema);

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
    assert.strictEqual(input3.outcome, 'recorded');
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
    console.log('✓ Test 7: Settle pending credit sale passes');

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
        args: ['export'],
        isGroup: true,
        db: testDb
    });
    assert(lastSentText.includes('BIZ EXPORT'));
    assert(lastSentText.includes('Timestamp,Sold to'));
    console.log('✓ Test 11: Admin commands (.biz summary, pending, export) pass');

    // --- TEST 12: Google Sheets Sync (Outbound & Inbound) ---
    assert.strictEqual(biz.sheets.isEnabled(testDb), false, 'Initially disabled without URL');

    // Test .biz setsheet command
    await bizCmd.run({
        sock: mockSock,
        msg: {},
        jid: BIZ_GROUP,
        sender: '11111111@lid',
        args: ['setsheet', 'https://script.google.com/macros/s/TEST/exec'],
        isGroup: true,
        db: testDb
    });
    assert(lastSentText.includes('Google Sheets Web App linked successfully'));
    assert.strictEqual(biz.sheets.isEnabled(testDb), true);

    // Mock global fetch for testing outbound & inbound sheet syncing
    const originalFetch = global.fetch;
    let lastPostPayload = null;
    let mockGetRows = [];

    global.fetch = async (url, options = {}) => {
        if (options.method === 'POST') {
            lastPostPayload = JSON.parse(options.body);
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

        const kavitaRow = testDb.prepare("SELECT * FROM sales WHERE sold_to = 'Kavita'").get();
        assert(kavitaRow, 'Google Form entry should be imported into sales');
        assert.strictEqual(kavitaRow.sold_for_paise, 180000);
        assert.strictEqual(kavitaRow.colour, 'Green');

        // Test .biz sync command
        await bizCmd.run({
            sock: mockSock,
            msg: {},
            jid: BIZ_GROUP,
            sender: '11111111@lid',
            args: ['sync'],
            isGroup: true,
            db: testDb
        });
        assert(lastSentText.includes('BIZ SYNC'));
        console.log('✓ Test 12: Google Sheets two-way sync (outbound push & inbound pull) passes');
    } finally {
        global.fetch = originalFetch;
    }

    console.log('\nALL BUSINESS PHASE 1 & 2 TESTS PASSED! (¬_¬) ✅');
})();
