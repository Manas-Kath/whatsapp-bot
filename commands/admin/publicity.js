const { jidNormalizedUser, delay } = require('@whiskeysockets/baileys');
const NodeCache = require('node-cache');

const groupCache = new NodeCache({ stdTTL: 600 });

module.exports = {
    name: "publicity",
    alias: ["broadcast", "bc", "announce"],
    desc: "Broadcast message",
    superAdminOnly: true,
    run: async ({ sock, jid, text, quoted, isSuperAdmin, sender }) => {
        if (!isSuperAdmin) return;

        let groups = [];
        try {
            const getGroups = await sock.groupFetchAllParticipating();
            groups = Object.values(getGroups).sort((a, b) => a.subject.localeCompare(b.subject));
        } catch (e) {
            return sock.sendMessage(jid, { text: "(ノ﹏ヽ) Could not fetch groups." });
        }

        if (groups.length === 0) {
            return sock.sendMessage(jid, { text: "(ー_ー) Bot not in any groups." });
        }

        const args = text ? text.split(' ') : [];
        const selection = args[0];

        if (!selection) {
            groupCache.set(sender, groups.map(g => g.id));
            let listMsg = "( ͡° ͜ʖ ͡°) *SELECTIVE PUBLICITY*\nReply with `.publicity [numbers]`\n\n*GROUPS:*\n";
            groups.forEach((g, i) => { listMsg += `  ${i + 1}. ${g.subject}\n`; });
            return sock.sendMessage(jid, { text: listMsg });
        }

        if (!quoted) {
            return sock.sendMessage(jid, { text: "(╯°□°）╯ Reply to a message to broadcast!" });
        }

        let targetJids = [];
        const cachedJids = groupCache.get(sender);
        if (selection.toLowerCase() === 'all') {
            targetJids = groups.map(g => g.id);
        } else {
            const indices = selection.split(',').map(n => parseInt(n.trim()) - 1);
            const sourceJids = cachedJids || groups.map(g => g.id);
            indices.forEach(idx => { if (sourceJids[idx]) targetJids.push(sourceJids[idx]); });
        }

        if (targetJids.length === 0) {
            return sock.sendMessage(jid, { text: "(o^ ^o) No valid selection." });
        }

        await sock.sendMessage(jid, { text: `(◕‿◕✿) Starting broadcast to ${targetJids.length} groups...` });

        let success = 0;
        let failed = 0;

        for (const targetJid of targetJids) {
            try {
                await sock.sendMessage(targetJid, { forward: quoted });
                success++;
                await delay(3000); 
            } catch (err) {
                console.error(`BC Failed: ${targetJid}`, err);
                failed++;
            }
        }

        await sock.sendMessage(jid, { 
            text: `(＾▽＾) *Campaign Complete*\n  • Success: ${success}\n  • Failed: ${failed}` 
        });
        groupCache.del(sender);
    }
};
