/**
 * Bulk group-add engine (Baileys).
 *
 * For every contact:
 *   1. skip if already in the group
 *   2. skip if the number isn't on WhatsApp
 *   3. direct add, sent to WhatsApp in small multi-person requests (like the official app does)
 *   4. if the add is refused (privacy: "who can add me to groups", or recently left),
 *      send them the group invite instead: a native invite card when WhatsApp hands us
 *      the per-user invite code (add_request), otherwise a plain DM with the invite link
 *
 * Pure dependency-injection: takes `sock`, no Baileys import, so it can be unit-tested with a mock.
 */

const { delay } = require('./utils');

// groupParticipantsUpdate status codes
const ST_OK = '200';
const ST_NOT_FOUND = '404';
const ST_ALREADY = '409';
const LINK_FALLBACK_STATUSES = new Set(['403', '408']); // 403 = privacy block, 408 = recently left

const running = new Set(); // group JIDs with an active run

const baseId = (jid) => String(jid || '').split('@')[0].split(':')[0];
const normJid = (jid) => String(jid || '').replace(/:\d+@/, '@');
const rand = (min, max) => Math.floor(min + Math.random() * (max - min + 1));

const isAdminParticipant = (p) => !!p && (p.admin === 'admin' || p.admin === 'superadmin');

const isBotAdmin = (sock, meta) => {
    const botId = normJid(sock.user?.id);
    const botLid = sock.user?.lid ? normJid(sock.user.lid) : null;
    const me = (meta.participants || []).find(p => {
        const id = normJid(p.id);
        return id === botId || (botLid && id === botLid) ||
               (p.lid && normJid(p.lid) === botId) ||
               (p.phoneNumber && normJid(p.phoneNumber) === botId);
    });
    return isAdminParticipant(me);
};

/** Set of phone-number digits already in the group */
const existingNumbers = (meta) => {
    const set = new Set();
    (meta.participants || []).forEach(p => {
        [p.id, p.phoneNumber, p.lid].forEach(x => x && set.add(baseId(x)));
    });
    return set;
};

/** Bulk "is on WhatsApp" check. Returns Map<number, jid|null>; null jid = not on WA. Missing key = unknown. */
const checkOnWhatsApp = async (sock, contacts, chunkSize = 50) => {
    const map = new Map();
    for (let i = 0; i < contacts.length; i += chunkSize) {
        const chunk = contacts.slice(i, i + chunkSize);
        try {
            const res = await sock.onWhatsApp(...chunk.map(c => c.jid));
            const found = new Map((res || []).map(r => [baseId(r.jid), r]));
            chunk.forEach(c => {
                const hit = found.get(c.number);
                if (hit) map.set(c.number, hit.exists ? hit.jid : null);
                else map.set(c.number, null);
            });
        } catch (e) {
            // lookup failed -> leave unknown, the add attempt will decide
            console.error('[GROUPADD] onWhatsApp failed:', e.message);
        }
    }
    return map;
};

/**
 * On a refused add WhatsApp may attach <add_request code expiration> to the participant node.
 * That is the per-user invite code the official app uses for its invite card.
 * @returns {{code:string, expiration:number}|null}
 */
const extractAddRequest = (node) => {
    const kids = Array.isArray(node?.content) ? node.content : [];
    const req = kids.find(n => n?.tag === 'add_request');
    if (!req?.attrs?.code) return null;
    return { code: req.attrs.code, expiration: Number(req.attrs.expiration) || 0 };
};

const buildInviteText = (subject, link) =>
    `(¬_¬) [ GROUP INVITE ]\n\n` +
    `You were invited to join *${subject}*.\n` +
    `A direct add wasn't possible (check your privacy settings > Groups), so here's the invite link:\n\n` +
    `${link}`;

/**
 * @param {object} p
 * @param {object} p.sock
 * @param {string} p.groupJid
 * @param {{number:string,jid:string}[]} p.contacts   from lib/contacts.js
 * @param {boolean} [p.useLinkFallback=true]
 * @param {boolean} [p.dryRun=false]
 * @param {number} [p.batchSize=0]  max numbers to actually process this run (0 = all); the rest land in results.skipped (queue for resume)
 * @param {number} [p.addChunk=1]   numbers per add request (official app sends several at once)
 * @param {{minDelay:number,maxDelay:number}} [p.limits]  ms between WhatsApp operations
 * @param {(done:number,total:number)=>Promise|void} [p.onProgress]
 * @param {number} [p.progressEvery=20]
 * @returns {Promise<{ groupName:string, results:object, aborted:string|null }>}
 */
const runGroupAdd = async ({
    sock, groupJid, contacts,
    useLinkFallback = true,
    dryRun = false,
    batchSize = 0,
    addChunk = 1,
    limits = {},
    onProgress,
    progressEvery = 20
}) => {
    if (running.has(groupJid)) throw new Error('A group-add run is already active for this group.');
    running.add(groupJid);

    const minDelay = limits.minDelay ?? 3000;
    const maxDelay = limits.maxDelay ?? 6000;
    const chunkSize = Math.max(1, addChunk | 0);

    const results = {
        added: [], invited: [], invited_card: [], already: [], not_on_whatsapp: [],
        failed: [], skipped: [], would_add: []
    };
    let aborted = null;

    try {
        const meta = await sock.groupMetadata(groupJid);
        if (!dryRun && !isBotAdmin(sock, meta)) {
            throw new Error('Bot is not an admin in this group. Promote it first.');
        }

        const inGroup = existingNumbers(meta);
        const queue = [];
        contacts.forEach(c => (inGroup.has(c.number) ? results.already.push(c.number) : queue.push(c)));

        const waMap = await checkOnWhatsApp(sock, queue);
        let todo = [];
        queue.forEach(c => {
            if (waMap.size && waMap.has(c.number) && waMap.get(c.number) === null) results.not_on_whatsapp.push(c.number);
            else todo.push({ ...c, jid: waMap.get(c.number) || c.jid });
        });

        // batch cap: defer the overflow (queued for `.groupadd resume`)
        if (batchSize > 0 && todo.length > batchSize) {
            todo.slice(batchSize).forEach(x => results.skipped.push(x.number));
            todo = todo.slice(0, batchSize);
        }

        if (dryRun) {
            todo.forEach(c => results.would_add.push(c.number));
            return { groupName: meta.subject, results, aborted };
        }

        let inviteLink = null;
        const getInviteLink = async () => {
            if (!inviteLink) inviteLink = `https://chat.whatsapp.com/${await sock.groupInviteCode(groupJid)}`;
            return inviteLink;
        };

        /** Send the invite: native card if we have a per-user code, else plain-text link DM. Returns 'card' | 'text'. */
        const sendInvite = async (c, addReq) => {
            if (addReq) {
                try {
                    await sock.sendMessage(c.jid, {
                        groupInvite: {
                            inviteCode: addReq.code,
                            inviteExpiration: addReq.expiration,
                            text: '',
                            jid: groupJid,
                            subject: meta.subject
                        }
                    });
                    return 'card';
                } catch (e) {
                    console.error('[GROUPADD] invite card failed, falling back to text link:', e.message);
                }
            }
            const link = await getInviteLink();
            await sock.sendMessage(c.jid, { text: buildInviteText(meta.subject, link) });
            return 'text';
        };

        let done = 0;
        let lastReported = 0;
        const skipRest = (from) => todo.slice(from).forEach(x => results.skipped.push(x.number));

        for (let i = 0; i < todo.length && !aborted; i += chunkSize) {
            const chunk = todo.slice(i, i + chunkSize);
            let res;
            try {
                res = await sock.groupParticipantsUpdate(groupJid, chunk.map(c => c.jid), 'add');
            } catch (e) {
                const msg = String(e.message || e);
                if (/rate-overlimit|too many|429/i.test(msg)) {
                    console.error('[GROUPADD] rate limit:', msg);
                    aborted = `WhatsApp rate limit hit (${msg}). Stopped to protect the account. Wait a few hours before resuming.`;
                    skipRest(i);
                    break;
                }
                if (/forbidden|not-authorized/i.test(msg)) {
                    aborted = 'Not authorized to add members (is the bot still admin?).';
                    skipRest(i);
                    break;
                }
                console.error('[GROUPADD] add request failed:', msg);
                chunk.forEach(c => results.failed.push({ number: c.number, reason: msg }));
                done += chunk.length;
                await delay(rand(minDelay, maxDelay));
                continue;
            }

            // match each result to its contact (by number; fall back to order if WhatsApp answers with LIDs)
            const list = Array.isArray(res) ? res : [];
            const byId = new Map(list.map(r => [baseId(r.jid), r]));
            const tally = {};
            const invites = [];
            chunk.forEach((c, k) => {
                const r = byId.get(c.number) || (list.length === chunk.length ? list[k] : null);
                if (!r) {
                    results.failed.push({ number: c.number, reason: 'no result returned by WhatsApp' });
                    return;
                }
                const status = String(r.status ?? ST_OK);
                tally[status] = (tally[status] || 0) + 1;

                if (status === ST_OK) results.added.push(c.number);
                else if (status === ST_ALREADY) results.already.push(c.number);
                else if (status === ST_NOT_FOUND) results.not_on_whatsapp.push(c.number);
                else if (LINK_FALLBACK_STATUSES.has(status) && useLinkFallback) invites.push({ c, status, addReq: extractAddRequest(r.content) });
                else results.failed.push({ number: c.number, reason: LINK_FALLBACK_STATUSES.has(status) ? `add refused (${status})` : `status ${status}` });
            });
            console.log(`[GROUPADD] chunk ${Math.floor(i / chunkSize) + 1}: statuses ${JSON.stringify(tally)}${invites.length ? `, add_request codes: ${invites.filter(x => x.addReq).length}/${invites.length}` : ''}`);

            // invites go out one at a time with a pause between them (cold DMs are the riskiest part)
            for (let k = 0; k < invites.length; k++) {
                const { c, status, addReq } = invites[k];
                try {
                    const how = await sendInvite(c, addReq);
                    results.invited.push(c.number);
                    if (how === 'card') results.invited_card.push(c.number);
                } catch (e) {
                    results.failed.push({ number: c.number, reason: `add refused (${status}), invite failed: ${e.message}` });
                }
                if (k < invites.length - 1) await delay(rand(minDelay, maxDelay));
            }

            done += chunk.length;
            if (onProgress && progressEvery && done - lastReported >= progressEvery && i + chunkSize < todo.length) {
                lastReported = done;
                try { await onProgress(done, todo.length); } catch (_) {}
            }
            if (i + chunkSize < todo.length) await delay(rand(minDelay, maxDelay));
        }

        return { groupName: meta.subject, results, aborted };
    } finally {
        running.delete(groupJid);
    }
};

module.exports = { runGroupAdd, isBotAdmin, existingNumbers, checkOnWhatsApp, extractAddRequest, buildInviteText, baseId };
