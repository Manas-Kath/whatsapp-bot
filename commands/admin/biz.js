const biz = require('../../lib/biz');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');

module.exports = {
    name: 'biz',
    category: 'admin',
    desc: 'Business module management (registration, group setup, status)',
    superAdminOnly: true,

    run: async (ctx) => {
        const { sock, msg, jid, args, isGroup } = ctx;
        const sub = (args[0] || '').toLowerCase();

        if (!sub || sub === 'help') {
            const helpText = `(¬_¬) [ BIZ ADMIN ]\n\n` +
                `• \`.biz whoami\` - Show sender ID (or reply to a message to get quoted sender's ID)\n` +
                `• \`.biz status\` - Overview of business DB & settings\n` +
                `• \`.biz setgroup\` - Set current group as official business group\n` +
                `• \`.biz adduser <name> <role> <id> [alias1,alias2]\` - Register family member\n` +
                `• \`.biz listusers\` - View registered family members\n` +
                `• \`.biz inputs [limit]\` - View recent business inputs`;
            return sock.sendMessage(jid, { text: helpText }, { quoted: msg });
        }

        const db = ctx.db || biz.db.getDb();

        if (sub === 'whoami') {
            let targetJid = null;
            let isQuoted = false;

            if (ctx.quoted && ctx.quoted.key) {
                targetJid = ctx.quoted.key.participant || ctx.quoted.key.remoteJid;
                isQuoted = true;
            } else {
                targetJid = ctx.sender;
            }

            const normalizedJid = targetJid ? jidNormalizedUser(targetJid) : null;
            const person = normalizedJid ? biz.people.findPersonByIdentifier(normalizedJid, db) : null;

            let text = `(¬_¬) [ BIZ WHOAMI ]\n\n` +
                `• Target: ${isQuoted ? 'Quoted Message Sender' : 'You (Command Caller)'}\n` +
                `• Raw ID: \`${targetJid || 'Unknown'}\`\n` +
                `• Normalized ID: \`${normalizedJid || 'Unknown'}\`\n` +
                `• Registered: ${person ? `Yes (${person.name} - ${person.role})` : 'No'}`;

            if (!isQuoted) {
                text += `\n\n_(Tip: Reply to someone's message with \`.biz whoami\` to view their exact ID for registration)_`;
            }

            return sock.sendMessage(jid, { text }, { quoted: msg });
        }

        if (sub === 'status') {
            const bizGroup = biz.db.getSetting('biz_group_jid', db) || process.env.BIZ_GROUP_JID || 'Not configured';
            const maxAgeHours = biz.db.getSetting('biz_max_msg_age_hours', db) || process.env.BIZ_MAX_MSG_AGE_HOURS || '24';
            const peopleCount = db.prepare('SELECT count(*) as count FROM people').get().count;
            const inputCount = db.prepare('SELECT count(*) as count FROM inputs').get().count;

            const statusText = `(¬_¬) [ BIZ STATUS ]\n\n` +
                `• Business Group: \`${bizGroup}\`\n` +
                `• Max Msg Age: ${maxAgeHours} hours\n` +
                `• Registered People: ${peopleCount}\n` +
                `• Total Inputs Logged: ${inputCount}\n` +
                `• SQLite WAL Mode: Enabled`;
            return sock.sendMessage(jid, { text: statusText }, { quoted: msg });
        }

        if (sub === 'setgroup') {
            if (!isGroup) {
                return sock.sendMessage(jid, { text: `(¬_¬) [ BIZ ]\n\nThis command must be run inside the target group.` }, { quoted: msg });
            }
            biz.db.setSetting('biz_group_jid', jid, db);
            return sock.sendMessage(jid, { text: `(¬_¬) [ BIZ ]\n\nBusiness group updated to:\n\`${jid}\`` }, { quoted: msg });
        }

        if (sub === 'adduser') {
            // .biz adduser Meera member 919876543210@s.whatsapp.net mummy,mom
            const name = args[1];
            const role = (args[2] || 'member').toLowerCase();
            const identifier = args[3];
            const rawAliases = args[4] ? args[4].split(',').map(s => s.trim().toLowerCase()) : [];

            if (!name || !identifier || !['owner', 'member'].includes(role)) {
                return sock.sendMessage(jid, {
                    text: `(¬_¬) [ BIZ ]\n\nUsage: \`.biz adduser <Name> <owner|member> <wa_lid_or_jid> [aliases separated by comma]\`\n\nExample:\n\`.biz adduser Mummy member 919876543210@s.whatsapp.net mom,mummy\``
                }, { quoted: msg });
            }

            const isLid = identifier.endsWith('@lid');
            const wa_lid = isLid ? identifier : null;
            const wa_pn = !isLid ? identifier : null;

            try {
                const person = biz.people.registerPerson({
                    name,
                    role,
                    wa_lid,
                    wa_pn,
                    aliases: rawAliases
                }, db);

                return sock.sendMessage(jid, {
                    text: `(¬_¬) [ BIZ ] ✅\n\nRegistered ${person.name} (${person.role}) with ID #${person.id}.\nIdentifier: \`${identifier}\``
                }, { quoted: msg });
            } catch (err) {
                return sock.sendMessage(jid, {
                    text: `(¬_¬) [ BIZ ] ❌\n\nFailed to register: ${err.message}`
                }, { quoted: msg });
            }
        }

        if (sub === 'listusers') {
            const users = biz.people.getAllPeople(db);
            if (!users.length) {
                return sock.sendMessage(jid, { text: `(¬_¬) [ BIZ ]\n\nNo registered users yet. Use \`.biz adduser\` to register.` }, { quoted: msg });
            }

            let text = `(¬_¬) [ BIZ USERS ]\n\n`;
            for (const u of users) {
                const idStr = u.wa_lid || u.wa_pn || 'No WA ID';
                text += `• *#${u.id} ${u.name}* (${u.role})\n  ID: \`${idStr}\`\n  Aliases: ${u.aliases}\n\n`;
            }
            return sock.sendMessage(jid, { text: text.trim() }, { quoted: msg });
        }

        if (sub === 'inputs') {
            const limit = parseInt(args[1] || '5', 10);
            const recent = biz.inputs.getRecentInputs(limit, db);
            if (!recent.length) {
                return sock.sendMessage(jid, { text: `(¬_¬) [ BIZ ]\n\nNo inputs recorded yet.` }, { quoted: msg });
            }

            let text = `(¬_¬) [ RECENT INPUTS ]\n\n`;
            for (const item of recent) {
                text += `• *#${item.id}* [${item.kind}] [${item.outcome}]\n  Raw: "${item.raw_text || ''}"\n  Time: ${new Date(item.ts * 1000).toLocaleString()}\n\n`;
            }
            return sock.sendMessage(jid, { text: text.trim() }, { quoted: msg });
        }

        return sock.sendMessage(jid, { text: `(¬_¬) Unknown sub-command. Try \`.biz help\`.` }, { quoted: msg });
    }
};
