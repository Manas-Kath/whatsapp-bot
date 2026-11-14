const assert = require('assert');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const biz = require('./lib/biz');

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
    }, { db: testDb });
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
    }, { db: testDb });
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
    }, { db: testDb });
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
    }, { db: testDb });
    assert.strictEqual(res4.handled, true);
    assert(res4.replies[0].text.includes('Logged by Papa'));
    const input4 = testDb.prepare("SELECT * FROM inputs WHERE msg_id = 'MSG-004'").get();
    assert.strictEqual(input4.person_id, dad.id);
    assert.strictEqual(input4.raw_text, 'Meera ko Idhu wine suit 40 L 2450 mein beche, pending');

    // --- TEST 5: Idempotency Replay ---
    // Re-sending MSG-004 returns the previous reply and adds no new inputs
    const inputsBefore = testDb.prepare('SELECT count(*) as c FROM inputs').get().c;
    const res5 = await biz.handle({
        msgId: 'MSG-004',
        chat: BIZ_GROUP,
        senderId: '22222222@lid',
        ts: 1700000003,
        type: 'text',
        text: 'Meera ko Idhu wine suit 40 L 2450 mein beche, pending'
    }, { db: testDb });
    const inputsAfter = testDb.prepare('SELECT count(*) as c FROM inputs').get().c;
    assert.strictEqual(inputsBefore, inputsAfter, 'Replay must not add duplicate input rows');
    assert.strictEqual(res5.handled, true);
    assert.strictEqual(res5.replies[0].text, res4.replies[0].text, 'Replay must return original reply');
    console.log('✓ Test 4 & 5: Permissions, raw logging, and idempotency replay pass');

    console.log('\nALL BUSINESS TESTS PASSED! (¬_¬) ✅');
})();
