const assert = require('assert');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const biz = require('./lib/biz');
const bizCmd = require('./commands/admin/biz');

console.log('[TEST] Starting Business Module Tests...');

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
    assert.strictEqual(input3.raw_text, 'biz ping');
    assert.strictEqual(input3.outcome, 'recorded');

    // 4D: Authorized user in biz group -> handled & pre-logged
    const res4 = await biz.handle({
        msgId: 'MSG-004',
        chat: BIZ_GROUP,
        senderId: '22222222@lid',
        ts: 1700000003,
        type: 'text',
        text: 'Meera ko Idhu wine suit 40 L 2450 mein beche, pending'
    }, { db: testDb, nowSec: 1700000003 });
    assert.strictEqual(res4.handled, true);
    assert(res4.replies[0].text.includes('Logged by Papa'));
    const input4 = testDb.prepare("SELECT * FROM inputs WHERE msg_id = 'MSG-004'").get();
    assert.strictEqual(input4.person_id, dad.id);
    assert.strictEqual(input4.raw_text, 'Meera ko Idhu wine suit 40 L 2450 mein beche, pending');

    // --- TEST 5: Idempotency Replay (completed row) ---
    // Re-sending MSG-004 returns the previous reply and adds no new inputs
    const inputsBefore = testDb.prepare('SELECT count(*) as c FROM inputs').get().c;
    const res5 = await biz.handle({
        msgId: 'MSG-004',
        chat: BIZ_GROUP,
        senderId: '22222222@lid',
        ts: 1700000003,
        type: 'text',
        text: 'Meera ko Idhu wine suit 40 L 2450 mein beche, pending'
    }, { db: testDb, nowSec: 1700000003 });
    const inputsAfter = testDb.prepare('SELECT count(*) as c FROM inputs').get().c;
    assert.strictEqual(inputsBefore, inputsAfter, 'Replay must not add duplicate input rows');
    assert.strictEqual(res5.handled, true);
    assert.strictEqual(res5.replies[0].text, res4.replies[0].text, 'Replay must return original reply');
    console.log('✓ Test 4 & 5: Permissions, raw logging, and idempotency replay pass');

    // --- TEST 6: Item (2) - Ignore messages older than 24h ---
    const nowSec = 1700100000;
    // 25 hours old: 25 * 3600 = 90000s
    const oldTs = nowSec - 90000;
    const resOld = await biz.handle({
        msgId: 'MSG-OLD-001',
        chat: BIZ_GROUP,
        senderId: '22222222@lid',
        ts: oldTs,
        type: 'text',
        text: 'Purana hisaab 5000'
    }, { db: testDb, nowSec });
    assert.strictEqual(resOld.handled, false, 'Message older than 24h should be ignored');
    assert.strictEqual(testDb.prepare("SELECT * FROM inputs WHERE msg_id = 'MSG-OLD-001'").get(), undefined, 'Old message must not be saved to inputs');

    // 2 hours old: 2 * 3600 = 7200s (within 24h window) -> should be processed
    const freshTs = nowSec - 7200;
    const resFresh = await biz.handle({
        msgId: 'MSG-FRESH-001',
        chat: BIZ_GROUP,
        senderId: '22222222@lid',
        ts: freshTs,
        type: 'text',
        text: 'Fresh suit 1200'
    }, { db: testDb, nowSec });
    assert.strictEqual(resFresh.handled, true, 'Message within 24h should be handled');
    assert.strictEqual(testDb.prepare("SELECT * FROM inputs WHERE msg_id = 'MSG-FRESH-001'").get()?.outcome, 'recorded');

    // Test configurable setting: override maxAgeHours to 1 hour
    biz.db.setSetting('biz_max_msg_age_hours', '1', testDb);
    const resConfigOld = await biz.handle({
        msgId: 'MSG-CONFIG-001',
        chat: BIZ_GROUP,
        senderId: '22222222@lid',
        ts: nowSec - 7200, // 2 hours old, but max age is now 1 hour
        type: 'text',
        text: 'Should be ignored with 1h setting'
    }, { db: testDb, nowSec });
    assert.strictEqual(resConfigOld.handled, false, 'Message exceeding custom max age setting should be ignored');
    console.log('✓ Test 6: Item (2) - Age filtering (24h default & custom setting) passes');

    // --- TEST 7: Item (5) - Re-process existing pending input row on redelivery ---
    // Manually insert an input with outcome = 'pending' and reply_text = null (simulating a crash mid-processing)
    testDb.prepare(`
        INSERT INTO inputs (msg_id, ts, received_at, person_id, chat, kind, raw_text, stage, outcome)
        VALUES ('MSG-PENDING-001', ?, ?, ?, ?, 'text', 'Crashed sale message 3000', 'raw', 'pending')
    `).run(nowSec, nowSec, dad.id, BIZ_GROUP);

    const pendingRowBefore = testDb.prepare("SELECT * FROM inputs WHERE msg_id = 'MSG-PENDING-001'").get();
    assert.strictEqual(pendingRowBefore.outcome, 'pending');
    assert.strictEqual(pendingRowBefore.reply_text, null);

    const countBeforeRedelivery = testDb.prepare('SELECT count(*) as c FROM inputs').get().c;

    // Redelivery arrives:
    const resRedelivery = await biz.handle({
        msgId: 'MSG-PENDING-001',
        chat: BIZ_GROUP,
        senderId: '22222222@lid',
        ts: nowSec,
        type: 'text',
        text: 'Crashed sale message 3000'
    }, { db: testDb, nowSec });

    const countAfterRedelivery = testDb.prepare('SELECT count(*) as c FROM inputs').get().c;
    assert.strictEqual(countBeforeRedelivery, countAfterRedelivery, 'Re-delivery must not add a new row');
    assert.strictEqual(resRedelivery.handled, true, 'Redelivery of pending row must be handled');
    assert(resRedelivery.replies.length > 0 && resRedelivery.replies[0].text.length > 0, 'Redelivery must produce a reply');

    // Verify row in database is now updated to recorded with reply_text
    const pendingRowAfter = testDb.prepare("SELECT * FROM inputs WHERE msg_id = 'MSG-PENDING-001'").get();
    assert.strictEqual(pendingRowAfter.outcome, 'recorded', 'Pending row should now be recorded');
    assert(pendingRowAfter.reply_text && pendingRowAfter.reply_text.includes('Crashed sale message 3000'));
    console.log('✓ Test 7: Item (5) - Re-processing pending input row on redelivery passes');

    // --- TEST 8: Item (6) - .biz whoami command tests ---
    let lastSentText = '';
    const mockSock = {
        sendMessage: async (jid, content) => {
            lastSentText = content.text;
            return { key: { id: 'MOCK-MSG' } };
        }
    };

    // 8A: Caller checking whoami without quote
    await bizCmd.run({
        sock: mockSock,
        msg: {},
        jid: BIZ_GROUP,
        sender: '22222222@lid',
        args: ['whoami'],
        isGroup: true,
        db: testDb
    });
    assert(lastSentText.includes('Target: You (Command Caller)'));
    assert(lastSentText.includes('22222222@lid'));
    assert(lastSentText.includes('Registered: Yes (Papa - member)'));

    // 8B: Caller quoting someone else's message
    await bizCmd.run({
        sock: mockSock,
        msg: {},
        jid: BIZ_GROUP,
        sender: '22222222@lid',
        quoted: {
            key: { participant: '11111111@lid', remoteJid: BIZ_GROUP }
        },
        args: ['whoami'],
        isGroup: true,
        db: testDb
    });
    assert(lastSentText.includes('Target: Quoted Message Sender'));
    assert(lastSentText.includes('11111111@lid'));
    assert(lastSentText.includes('Registered: Yes (Mummy - member)'));

    // 8C: Caller quoting an unregistered user
    await bizCmd.run({
        sock: mockSock,
        msg: {},
        jid: BIZ_GROUP,
        sender: '22222222@lid',
        quoted: {
            key: { participant: '99999999@s.whatsapp.net', remoteJid: BIZ_GROUP }
        },
        args: ['whoami'],
        isGroup: true,
        db: testDb
    });
    assert(lastSentText.includes('99999999@s.whatsapp.net'));
    assert(lastSentText.includes('Registered: No'));
    console.log('✓ Test 8: Item (6) - .biz whoami (quoted & self) passes');

    console.log('\nALL BUSINESS TESTS PASSED! (¬_¬) ✅');
})();
