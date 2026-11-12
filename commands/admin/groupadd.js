const config = require('../../config');
const db = require('../../lib/database');
const { parseContacts, normalizeContacts, DEFAULT_CC } = require('../../lib/contacts');
const { runGroupAdd } = require('../../lib/groupadd');

const TAG = '(¬_¬) [ GROUPADD ]';
const LIST_CAP = 15; // max entries printed per section in the report
const SUBCMDS = new Set(['resume', 'pending', 'clear']);

const USAGE =
    `${TAG}\n\n` +
    `*In a group:*\n` +
    `  • \`.groupadd 919876543210, +91 98765 43211, 9876543212\`\n` +
    `  • Reply to a message containing numbers with \`.groupadd\`\n` +
    `  • \`.groupadd resume\` : continue the queued numbers\n` +
    `  • \`.groupadd pending\` / \`.groupadd clear\` : view / drop the queue\n\n` +
    `*In bot DM (SuperAdmin):*\n` +
    `  • \`.groupadd list\` : show groups\n` +
    `  • \`.groupadd <#/ID> <numbers>\`\n` +
    `  • \`.groupadd resume|pending|clear <#/ID>\`\n\n` +
    `*Flags:*\n` +
    `  • \`--batch=N\` : process only N numbers per run (default ${config.limits.groupadd.batch}); the rest is queued\n` +
    `  • \`--nolink\` : don't DM the invite link if adding is blocked\n` +
    `  • \`--dry\` : parse + check only, add nobody\n\n` +
    `Separate numbers with commas, new lines or spaces. 10-digit numbers get +${DEFAULT_CC} prepended.`;

const quotedText = (quoted) => {
    const m = quoted?.message;
    if (!m) return '';
    const type = Object.keys(m)[0];
    return m.conversation || m.extendedTextMessage?.text || m[type]?.caption || '';
};

const section = (title, items) => {
    if (!items.length) return '';
    const shown = items.slice(0, LIST_CAP).map(i => `  - ${i}`).join('\n');
    const more = items.length > LIST_CAP ? `\n  ...and ${items.length - LIST_CAP} more` : '';
    return `\n*${title}*\n${shown}${more}\n`;
};

const formatReport = ({ groupName, results, aborted }, parsed, opts, queued) => {
    const r = results;
    let t = `${TAG}\n\n• Group: *${groupName}*${opts.dryRun ? '  _(dry run)_' : ''}\n`;
    if (opts.dryRun) t += `• Would attempt: ${r.would_add.length}\n`;
    else {
        t += `• Added: ${r.added.length}\n• Invite sent: ${r.invited.length}`;
        if (r.invited.length) t += ` (${r.invited_card.length} card, ${r.invited.length - r.invited_card.length} text link)`;
        t += `\n`;
    }
    t += `• Already in group: ${r.already.length}\n• Not on WhatsApp: ${r.not_on_whatsapp.length}\n`;
    if (r.failed.length) t += `• Failed: ${r.failed.length}\n`;
    if (!opts.dryRun && queued) t += `• Queued for resume: ${queued}\n`;
    if (parsed.invalid.length) t += `• Invalid input: ${parsed.invalid.length}\n`;
    if (parsed.duplicates) t += `• Duplicates removed: ${parsed.duplicates}\n`;

    if (aborted) t += `\n⚠️ ${aborted}\n`;

    t += section('Invite sent (add blocked by privacy)', r.invited);
    t += section('Failed', r.failed.map(f => `${f.number}: ${f.reason}`));
    t += section('Not on WhatsApp', r.not_on_whatsapp);
    t += section('Invalid', parsed.invalid);
    if (!opts.dryRun && queued) t += `\nSend \`.groupadd resume\`${opts.isDm ? ' <#/ID>' : ''} to continue.`;
    return t.trim();
};

module.exports = {
    name: "groupadd",
    alias: ["gadd", "massadd", "addmany"],
    desc: "Bulk add numbers to a group (invite link DM fallback, resumable)",
    category: "admin",
    adminOnly: true,
    run: async ({ sock, jid, msg, args, isGroup, isSuperAdmin, quoted }) => {
        const reply = (text) => sock.sendMessage(jid, { text }, { quoted: msg });
        const limits = config.limits.groupadd;

        // ── flags ──
        const flagArgs = args.filter(a => a.startsWith('--'));
        const flags = new Set(flagArgs.map(a => a.toLowerCase().split('=')[0]));
        const batchFlag = flagArgs.find(a => a.toLowerCase().startsWith('--batch='));
        let batchSize = limits.batch;
        if (batchFlag) {
            const n = parseInt(batchFlag.split('=')[1], 10);
            if (isNaN(n) || n < 1) return reply(`${TAG}\n\nUse \`--batch=N\` with N >= 1.`);
            batchSize = n;
        }
        let rest = args.filter(a => !a.startsWith('--'));
        const opts = { dryRun: flags.has('--dry'), useLinkFallback: !flags.has('--nolink'), isDm: !isGroup };

        // ── subcommand (resume | pending | clear) ──
        let sub = null;
        if (rest.length && SUBCMDS.has(rest[0].toLowerCase())) sub = rest.shift().toLowerCase();

        // ── resolve target group ──
        let groupJid = jid;
        if (!isGroup) {
            if (!isSuperAdmin) return reply(`${TAG}\n\nUse this inside a group.`);

            let groups;
            try {
                groups = Object.values(await sock.groupFetchAllParticipating())
                    .sort((a, b) => a.subject.localeCompare(b.subject));
            } catch (e) {
                return reply(`${TAG}\n\nFailed to fetch groups: ${e.message}`);
            }

            if (!sub && (!rest.length || rest[0].toLowerCase() === 'list')) {
                if (!groups.length) return reply(`${TAG}\n\nBot is not in any groups.`);
                const list = groups.map((g, i) => {
                    const q = db.getGroupAddQueue(g.id).length;
                    return `  • *${i + 1}.* ${g.subject}${q ? `  _(${q} queued)_` : ''}\n    ID: \`${g.id}\``;
                }).join('\n');
                return reply(`${TAG}\n\n${list}\n\nUsage: \`.groupadd <#/ID> <numbers>\``);
            }

            const ref = rest.shift();
            if (!ref) return reply(`${TAG}\n\nSpecify the group: \`.groupadd ${sub} <#/ID>\``);
            const idx = parseInt(ref, 10);
            const target = (!isNaN(idx) && String(idx) === ref && idx >= 1 && idx <= groups.length)
                ? groups[idx - 1]
                : groups.find(g => g.id === ref || g.id === `${ref}@g.us`);
            if (!target) return reply(`${TAG}\n\nGroup not found: \`${ref}\`. Use \`.groupadd list\`.`);
            groupJid = target.id;
        }

        // ── pending / clear ──
        const queue = db.getGroupAddQueue(groupJid);
        if (sub === 'pending') {
            return reply(queue.length
                ? `${TAG}\n\n${queue.length} number(s) queued.${section('Next up', queue)}\nSend \`.groupadd resume\` to process the next ${Math.min(batchSize, queue.length)}.`
                : `${TAG}\n\nNothing queued for this group.`);
        }
        if (sub === 'clear') {
            db.setGroupAddQueue(groupJid, []);
            return reply(`${TAG}\n\nCleared ${queue.length} queued number(s).`);
        }

        // ── collect contacts ──
        let parsed;
        let replacedQueue = 0;
        if (sub === 'resume') {
            if (!queue.length) return reply(`${TAG}\n\nNothing queued for this group.`);
            parsed = normalizeContacts(queue);
        } else {
            const source = [rest.join(' '), quotedText(quoted)].filter(Boolean).join('\n');
            parsed = parseContacts(source);
            if (!parsed.valid.length) {
                return reply(parsed.invalid.length
                    ? `${TAG}\n\nNo valid numbers found. Invalid: ${parsed.invalid.slice(0, LIST_CAP).join(', ')}`
                    : USAGE);
            }
            if (parsed.valid.length > limits.max) {
                return reply(`${TAG}\n\n${parsed.valid.length} numbers is over the limit of ${limits.max} per command. Split the list.`);
            }
            replacedQueue = queue.length; // a fresh list replaces the old queue
        }

        // persist the full list up front so a crash/restart mid-run loses nothing
        if (!opts.dryRun) db.setGroupAddQueue(groupJid, parsed.valid.map(c => c.number));

        const willProcess = Math.min(parsed.valid.length, batchSize);
        const eta = Math.max(1, Math.ceil(willProcess * ((limits.minDelay + limits.maxDelay) / 2) / 60000));
        await reply(`${TAG}\n\n${opts.dryRun ? 'Checking' : 'Processing'} ${willProcess} of ${parsed.valid.length} number(s)` +
                    `${opts.dryRun ? '' : ` (~${eta} min, throttled to protect the account)`}...` +
                    (replacedQueue ? `\n_Replaced a previous queue of ${replacedQueue}._` : ''));

        let outcome;
        try {
            outcome = await runGroupAdd({
                sock, groupJid,
                contacts: parsed.valid,
                useLinkFallback: opts.useLinkFallback,
                dryRun: opts.dryRun,
                batchSize,
                addChunk: limits.addChunk,
                limits,
                onProgress: (done, total) => sock.sendMessage(jid, { text: `${TAG}\n\nProgress: ${done}/${total}` })
            });
        } catch (e) {
            return reply(`${TAG}\n\n${e.message}`);
        }

        // whatever wasn't processed (batch overflow or rate-limit abort) stays queued
        const queued = outcome.results.skipped.length;
        if (!opts.dryRun) db.setGroupAddQueue(groupJid, outcome.results.skipped);

        return reply(formatReport(outcome, parsed, opts, queued));
    }
};
