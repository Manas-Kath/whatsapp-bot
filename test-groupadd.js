// Offline test for lib/contacts.js + lib/groupadd.js using a mock socket.  Run: node test-groupadd.js
const assert = require('assert');
const { parseContacts, normalizeNumber } = require('./lib/contacts');
const { runGroupAdd } = require('./lib/groupadd');

// ── contacts ──
assert.strictEqual(normalizeNumber('9876543210'), '919876543210');
assert.strictEqual(normalizeNumber('09876543210'), '919876543210');
assert.strictEqual(normalizeNumber('+91 98765-43210'), '919876543210');
assert.strictEqual(normalizeNumber('0091 9876543210'), '919876543210');
assert.strictEqual(normalizeNumber('+14155550123'), '14155550123');
assert.strictEqual(normalizeNumber('12345'), null);
assert.strictEqual(normalizeNumber('abc'), null);
assert.strictEqual(normalizeNumber('John 9876543210'), null);

const p = parseContacts('919876543210, +91 98765 43211\n9876543212;9876543212;junk\n919876543213 919876543214');
assert.deepStrictEqual(p.valid.map(c => c.number),
    ['919876543210', '919876543211', '919876543212', '919876543213', '919876543214']);
assert.strictEqual(p.duplicates, 1);
assert.deepStrictEqual(p.invalid, ['junk']);

// ── engine ──
const mkSock = (statusFor, { admin = true, existing = [], addReqFor = null } = {}) => {
    const sent = [];
    return {
        sent,
        user: { id: '911111111111:5@s.whatsapp.net' },
        groupMetadata: async () => ({
            subject: 'Test Group',
            participants: [
                { id: '911111111111@s.whatsapp.net', admin: admin ? 'admin' : null },
                ...existing.map(n => ({ id: `${n}@s.whatsapp.net` }))
            ]
        }),
        onWhatsApp: async (...jids) => jids.map(j => ({ jid: j, exists: !j.startsWith('919876543299') })),
        groupInviteCode: async () => 'INVITECODE',
        calls: [],
        groupParticipantsUpdate: async function (g, jids) {
            this.calls.push(jids.length);
            return jids.map(jid => ({ status: statusFor(jid.split('@')[0]), jid, content: addReqFor ? addReqFor(jid) : undefined }));
        },
        sendMessage: async (jid, c) => sent.push({ jid, text: c.text, content: c })
    };
};
const limits = { minDelay: 0, maxDelay: 0 };
const C = (...n) => n.map(x => ({ number: x, jid: `${x}@s.whatsapp.net` }));

(async () => {
    const status = { '919876543210': '200', '919876543211': '403', '919876543212': '408', '919876543213': '500' };
    const sock = mkSock(n => status[n] || '200', { existing: ['919876543214'] });
    const { results } = await runGroupAdd({
        sock, groupJid: 'g@g.us', limits,
        contacts: C('919876543210', '919876543211', '919876543212', '919876543213', '919876543214', '919876543299')
    });
    assert.deepStrictEqual(results.added, ['919876543210']);
    assert.deepStrictEqual(results.invited, ['919876543211', '919876543212']);
    assert.deepStrictEqual(results.already, ['919876543214']);
    assert.deepStrictEqual(results.not_on_whatsapp, ['919876543299']);
    assert.strictEqual(results.failed.length, 1);
    assert.strictEqual(sock.sent.length, 2);
    assert.ok(sock.sent[0].text.includes('https://chat.whatsapp.com/INVITECODE'));

    // --nolink: refused adds are reported as failed, no DMs
    const s2 = mkSock(() => '403');
    const r2 = await runGroupAdd({ sock: s2, groupJid: 'g@g.us', limits, useLinkFallback: false, contacts: C('919876543211') });
    assert.strictEqual(r2.results.failed.length, 1);
    assert.strictEqual(s2.sent.length, 0);

    // dry run: nothing added, nothing sent, even if bot isn't admin
    const s3 = mkSock(() => '200', { admin: false });
    const r3 = await runGroupAdd({ sock: s3, groupJid: 'g@g.us', limits, dryRun: true, contacts: C('919876543210') });
    assert.deepStrictEqual(r3.results.would_add, ['919876543210']);

    // not admin: refuses
    await assert.rejects(runGroupAdd({ sock: s3, groupJid: 'g@g.us', limits, contacts: C('919876543210') }), /not an admin/);

    // rate limit aborts and reports the rest as skipped
    const s4 = mkSock(() => '200');
    s4.groupParticipantsUpdate = async () => { throw new Error('rate-overlimit'); };
    const r4 = await runGroupAdd({ sock: s4, groupJid: 'g@g.us', limits, contacts: C('919876543210', '919876543211') });
    assert.ok(r4.aborted);
    assert.deepStrictEqual(r4.results.skipped, ['919876543210', '919876543211']);

    // batch cap: only first N processed, overflow reported as skipped (queued)
    const s5 = mkSock(() => '200');
    const r5 = await runGroupAdd({ sock: s5, groupJid: 'g@g.us', limits, batchSize: 2, contacts: C('919876543210', '919876543211', '919876543212', '919876543213') });
    assert.deepStrictEqual(r5.results.added, ['919876543210', '919876543211']);
    assert.deepStrictEqual(r5.results.skipped, ['919876543212', '919876543213']);

    // chunked adds: 7 numbers, chunk 3 -> 3 requests (3,3,1), mixed statuses resolved per number
    const st6 = { '919000000002': '403', '919000000005': '409' };
    const s6 = mkSock(n => st6[n] || '200');
    const nums = ['919000000001','919000000002','919000000003','919000000004','919000000005','919000000006','919000000007'];
    const r6 = await runGroupAdd({ sock: s6, groupJid: 'g@g.us', limits, addChunk: 3, contacts: C(...nums) });
    assert.deepStrictEqual(s6.calls, [3, 3, 1]);
    assert.strictEqual(r6.results.added.length, 5);
    assert.deepStrictEqual(r6.results.invited, ['919000000002']);
    assert.deepStrictEqual(r6.results.already, ['919000000005']);
    assert.strictEqual(r6.results.invited_card.length, 0);   // no add_request -> text link

    // native invite card when WhatsApp supplies add_request
    const s7 = mkSock(() => '403', { addReqFor: () => ({ tag: 'participant', attrs: {}, content: [{ tag: 'add_request', attrs: { code: 'USERCODE', expiration: '1799999999' } }] }) });
    const r7 = await runGroupAdd({ sock: s7, groupJid: 'g@g.us', limits, contacts: C('919000000001') });
    assert.deepStrictEqual(r7.results.invited_card, ['919000000001']);
    assert.strictEqual(s7.sent[0].content.groupInvite.inviteCode, 'USERCODE');
    assert.strictEqual(s7.sent[0].content.groupInvite.inviteExpiration, 1799999999);

    // results keyed by LID instead of number -> matched by order
    const s8 = mkSock(() => '200');
    s8.groupParticipantsUpdate = async (g, jids) => jids.map((j, i) => ({ status: '200', jid: `99999${i}@lid` }));
    const r8 = await runGroupAdd({ sock: s8, groupJid: 'g@g.us', limits, addChunk: 2, contacts: C('919000000001', '919000000002') });
    assert.strictEqual(r8.results.added.length, 2);

    // rate limit mid-run: whole remaining set (incl. the failing chunk) is skipped
    let n = 0;
    const s9 = mkSock(() => '200');
    s9.groupParticipantsUpdate = async (g, jids) => { if (++n === 2) throw new Error('rate-overlimit'); return jids.map(jid => ({ status: '200', jid })); };
    const r9 = await runGroupAdd({ sock: s9, groupJid: 'g@g.us', limits, addChunk: 2, contacts: C('919000000001','919000000002','919000000003','919000000004','919000000005') });
    assert.deepStrictEqual(r9.results.added, ['919000000001', '919000000002']);
    assert.deepStrictEqual(r9.results.skipped, ['919000000003', '919000000004', '919000000005']);
    assert.ok(r9.aborted);

    console.log('ALL GROUPADD TESTS PASSED');
})().catch(e => { console.error(e); process.exit(1); });
