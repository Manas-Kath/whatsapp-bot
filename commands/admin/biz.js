const biz = require('../../lib/biz');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');
const OWNER_MANAGEMENT_COMMANDS = new Set(['adduser', 'edituser', 'addid', 'removeuser', 'restoreuser', 'listusers']);

// Helper: build person-wise collection text (reused by both command and NL route)
function buildCollectionText(cols, targetPersonName = null) {
    if (!cols.length) {
        return targetPersonName
            ? `${targetPersonName} ne aaj koi payment collect nahi kiya.`
            : `Aaj koi payment collect nahi hua.`;
    }
    if (targetPersonName) {
        const col = cols.find(c => c.person_name.toLowerCase() === targetPersonName.toLowerCase());
        if (!col) return `${targetPersonName} ne aaj koi payment collect nahi kiya.`;
        return `*${col.person_name} ka aaj ka collection:*\n` +
            `• Cash: ₹${Math.round(col.cash_paise / 100)}\n` +
            `• UPI: ₹${Math.round(col.upi_paise / 100)}\n` +
            `• *Total: ₹${Math.round(col.total_paise / 100)}*`;
    }
    let text = `*Aaj ka person-wise collection:*\n`;
    for (const col of cols) {
        text += `• *${col.person_name}*: ₹${Math.round(col.total_paise / 100)} ` +
            `(Cash ₹${Math.round(col.cash_paise / 100)} + UPI ₹${Math.round(col.upi_paise / 100)})\n`;
    }
    return text.trim();
}

module.exports = {
    name: 'biz',
    category: 'admin',
    desc: 'Business module management (registration, group setup, status, reports)',
    superAdminOnly: false,

    run: async (ctx) => {
        const { sock, msg, jid, args, isGroup } = ctx;
        const sub = (args[0] || '').toLowerCase();

        if (!sub || sub === 'help') {
            const helpText = `(¬_¬) [ BIZ ADMIN ]\n\n` +
                `• \`.biz whoami\` - Show sender ID (or reply to a message)\n` +
                `• \`.biz summary\` - Today's sales, collections & pending\n` +
                `• \`.biz pending\` - List all pending sales\n` +
                `• \`.biz pending <name>\` - Pending for a specific customer\n` +
                `• \`.biz report [Papa|Mummy|...]\` - Person-wise collection report\n` +
                `• \`.biz backup\` - Trigger manual SQLite backup\n` +
                `• \`.biz sync\` - Sync entries between Google Sheet and database\n` +
                `• \`.biz setsheet <url>\` - Link Google Sheet Web App URL\n` +
                `• \`.biz export\` - Export sales in Google Form CSV layout\n` +
                `• \`.biz status\` - Overview of business DB & settings\n` +
                `• \`.biz setgroup\` - Set current group as official business group\n` +
                `• \`.biz adduser <name> <role> <id> [alias1,alias2]\` - Register member\n` +
                `• \`.biz listusers\` - View registered family members\n` +
                `• \`.biz inputs [limit]\` - View recent business inputs`;
            return sock.sendMessage(jid, { text: helpText }, { quoted: msg });
        }

        const db = ctx.db || biz.db.getDb();
        const isSuperAdmin = Boolean(ctx.isSuperAdmin);
        const requester = ctx.sender ? biz.people.findPersonByIdentifier(ctx.sender, db) : null;
        const isOwner = requester?.role === 'owner' && requester.active === 1;
        if (!isSuperAdmin && (!OWNER_MANAGEMENT_COMMANDS.has(sub) || !isOwner)) {
            if (OWNER_MANAGEMENT_COMMANDS.has(sub)) {
                return sock.sendMessage(jid, { text: `(¬_¬) [ BIZ ]\n\nOnly a registered owner or super admin can manage users.` }, { quoted: msg });
            }
            return;
        }

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

        if (sub === 'summary') {
            const sum = biz.sales.getTodaySummary(db);
            const text = `(¬_¬) [ AAJ KA HISAAB ] 📊\n\n` +
                `• Today's Sales: ${sum.salesCount} (₹${Math.round(sum.salesTotalPaise / 100)})\n` +
                `• Cash Collected: ₹${Math.round(sum.cashCollectedPaise / 100)}\n` +
                `• UPI Collected: ₹${Math.round(sum.upiCollectedPaise / 100)}\n` +
                `• Total Collected: ₹${Math.round(sum.totalCollectedPaise / 100)}\n\n` +
                `*Total Outstanding Pending:* ₹${Math.round(sum.totalPendingPaise / 100)}`;
            return sock.sendMessage(jid, { text }, { quoted: msg });
        }

        if (sub === 'pending') {
            // Optional: .biz pending <CustomerName>
            const customerFilter = args.length > 1 ? args.slice(1).join(' ') : null;
            const pendingList = biz.sales.findPendingSales(customerFilter, db);
            if (!pendingList.length) {
                const who = customerFilter ? `"${customerFilter}"` : 'Koi customer';
                return sock.sendMessage(jid, { text: `(¬_¬) [ BIZ PENDING ] 📋\n\n${who} ka koi pending amount nahi hai. Sab clear hai!` }, { quoted: msg });
            }
            let totalPaise = 0;
            let text = `(¬_¬) [ BIZ PENDING ] 📋\n\n`;
            for (const ps of pendingList) {
                const pendingRs = Math.round(ps.pending_paise / 100);
                totalPaise += ps.pending_paise;
                text += `• *#${ps.id} ${ps.sold_to}* - ₹${pendingRs} (${ps.brand || 'Suit'} ${ps.colour || ''})\n`;
            }
            text += `\n*Total Pending:* ₹${Math.round(totalPaise / 100)}`;
            return sock.sendMessage(jid, { text }, { quoted: msg });
        }

        if (sub === 'export') {
            const csvData = biz.export.exportToCsv(db);
            const text = `(¬_¬) [ BIZ EXPORT ] 📁\n\n\`\`\`\n${csvData}\n\`\`\``;
            return sock.sendMessage(jid, { text }, { quoted: msg });
        }

        if (sub === 'setsheet') {
            const url = args[1];
            if (!url || !url.startsWith('http')) {
                return sock.sendMessage(jid, {
                    text: `(¬_¬) [ BIZ ]\n\nUsage: \`.biz setsheet <Google_Apps_Script_Web_App_URL>\`\n\nSee GUIDE_GOOGLE_SHEETS.md for 2-minute setup instructions.`
                }, { quoted: msg });
            }
            biz.db.setSetting('biz_sheets_url', url.trim(), db);
            return sock.sendMessage(jid, {
                text: `(¬_¬) [ BIZ ] ✅\n\nGoogle Sheets URL saved. Set GOOGLE_SHEET_SYNC_SECRET in Bunty and use the same value for SECRET_TOKEN in Apps Script before syncing.\nUse \`.biz sync\` to pull new Google Form entries.`
            }, { quoted: msg });
        }

        if (sub === 'report') {
            // Person-wise collection report. Optional arg: person name
            let personName = args.length > 1 ? args.slice(1).join(' ') : null;
            if (personName) {
                const target = biz.people.getAllPeople(db).find(person => {
                    let aliases = [];
                    try { aliases = JSON.parse(person.aliases || '[]'); } catch (e) {}
                    return [person.name, ...aliases].some(label =>
                        String(label).trim().toLowerCase() === personName.toLowerCase()
                    );
                });
                if (target) personName = target.name;
            }
            const cols = biz.sales.getPersonCollections(db, { allTime: false });
            const body = buildCollectionText(cols, personName);
            return sock.sendMessage(jid, { text: `(¬_¬) [ BIZ COLLECTION ] 📋\n\n${body}` }, { quoted: msg });
        }

        if (sub === 'backup') {
            const result = biz.db.createBackup({ keepCount: 7 });
            if (!result.success) {
                return sock.sendMessage(jid, {
                    text: `(¬_¬) [ BIZ BACKUP ] ❌\n\nBackup failed: ${result.error}`
                }, { quoted: msg });
            }
            const fname = require('path').basename(result.file);
            return sock.sendMessage(jid, {
                text: `(¬_¬) [ BIZ BACKUP ] ✅\n\nManual backup saved:\n\`${fname}\`\n\nLast 7 snapshots are retained.`
            }, { quoted: msg });
        }

        if (sub === 'sync') {
            const syncRes = await biz.sheets.syncAll(db);
            if (!syncRes.success) {
                return sock.sendMessage(jid, { text: `(¬_¬) [ BIZ SYNC ] ❌\n\n${syncRes.error}` }, { quoted: msg });
            }
            return sock.sendMessage(jid, {
                text: `(¬_¬) [ BIZ SYNC ] ✅\n\n• Pulled from Sheet: ${syncRes.pulled} new entries\n• Status: Database & Google Sheet are in sync!`
            }, { quoted: msg });
        }

        if (sub === 'status') {
            const bizGroup = biz.db.getSetting('biz_group_jid', db) || process.env.BIZ_GROUP_JID || 'Not configured';
            const sheetUrl = biz.sheets.isEnabled(db)
                ? 'Linked & Active'
                : (biz.sheets.getWebappUrl(db) ? 'URL saved; sync secret missing' : 'Not configured (use .biz setsheet)');
            const maxAgeHours = biz.db.getSetting('biz_max_msg_age_hours', db) || process.env.BIZ_MAX_MSG_AGE_HOURS || '24';
            const peopleCount = db.prepare('SELECT count(*) as count FROM people').get().count;
            const inputCount = db.prepare('SELECT count(*) as count FROM inputs').get().count;
            const salesCount = db.prepare("SELECT count(*) as count FROM sales WHERE status = 'active'").get().count;

            const statusText = `(¬_¬) [ BIZ STATUS ]\n\n` +
                `• Business Group: \`${bizGroup}\`\n` +
                `• Google Sheets: ${sheetUrl}\n` +
                `• Max Msg Age: ${maxAgeHours} hours\n` +
                `• Registered People: ${peopleCount}\n` +
                `• Active Sales: ${salesCount}\n` +
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

        if (sub === 'edituser') {
            const name = args[1];
            const person = biz.people.findPersonByName(name, db);
            const optionArgs = args.slice(2);
            const fields = {};
            for (const option of optionArgs) {
                const splitAt = option.indexOf('=');
                if (splitAt < 1) {
                    return sock.sendMessage(jid, { text: `(¬_¬) [ BIZ ]\n\nUse: .biz edituser <name> [name=New] [role=owner|member] [aliases=a,b]` }, { quoted: msg });
                }
                const key = option.slice(0, splitAt).toLowerCase();
                const value = option.slice(splitAt + 1);
                if (key === 'name' && value.trim()) fields.name = value.trim();
                else if (key === 'role' && ['owner', 'member'].includes(value.toLowerCase())) fields.role = value.toLowerCase();
                else if (key === 'aliases') fields.aliases = value ? value.split(',').map(alias => alias.trim().toLowerCase()).filter(Boolean) : [];
                else return sock.sendMessage(jid, { text: `(¬_¬) [ BIZ ]\n\nInvalid edit option: ${option}` }, { quoted: msg });
            }
            if (!person || !Object.keys(fields).length) {
                return sock.sendMessage(jid, { text: `(¬_¬) [ BIZ ]\n\nUser not found or no edit fields supplied.` }, { quoted: msg });
            }
            if (fields.name) {
                const duplicate = biz.people.findPersonByName(fields.name, db);
                if (duplicate && duplicate.id !== person.id) {
                    return sock.sendMessage(jid, { text: `(¬_¬) [ BIZ ]\n\nAnother user already has that name.` }, { quoted: msg });
                }
            }
            try {
                const updated = biz.people.updatePerson(person.id, fields, db);
                return sock.sendMessage(jid, { text: `(¬_¬) [ BIZ ] ✅\n\nUpdated #${updated.id}: ${updated.name} (${updated.role}, ${updated.active ? 'active' : 'inactive'}).\nAliases: ${updated.aliases}` }, { quoted: msg });
            } catch (err) {
                return sock.sendMessage(jid, { text: `(¬_¬) [ BIZ ] ❌\n\n${err.message}` }, { quoted: msg });
            }
        }

        if (sub === 'addid') {
            const person = biz.people.findPersonByName(args[1], db);
            const identifier = args[2];
            if (!person || !identifier || !identifier.includes('@')) {
                return sock.sendMessage(jid, { text: `(¬_¬) [ BIZ ]\n\nUse: .biz addid <name> <wa_lid_or_phone_jid>` }, { quoted: msg });
            }
            const isLid = identifier.endsWith('@lid');
            const field = isLid ? 'wa_lid' : 'wa_pn';
            if (person[field] && person[field] !== identifier) {
                return sock.sendMessage(jid, { text: `(¬_¬) [ BIZ ] ❌\n\n${person.name} already has a ${isLid ? 'LID' : 'phone'} ID.` }, { quoted: msg });
            }
            try {
                const updated = biz.people.updatePerson(person.id, { [field]: identifier }, db);
                return sock.sendMessage(jid, { text: `(¬_¬) [ BIZ ] ✅\n\nAdded ID for ${updated.name}: ${identifier}` }, { quoted: msg });
            } catch (err) {
                return sock.sendMessage(jid, { text: `(¬_¬) [ BIZ ] ❌\n\nCould not add ID: ${err.message}` }, { quoted: msg });
            }
        }

        if (sub === 'removeuser' || sub === 'restoreuser') {
            const person = biz.people.findPersonByName(args[1], db);
            if (!person) return sock.sendMessage(jid, { text: `(¬_¬) [ BIZ ]\n\nUser not found.` }, { quoted: msg });
            const active = sub === 'restoreuser' ? 1 : 0;
            try {
                const updated = biz.people.updatePerson(person.id, { active }, db);
                return sock.sendMessage(jid, { text: `(¬_¬) [ BIZ ] ✅\n\n${updated.name} is now ${updated.active ? 'active' : 'inactive'} (${updated.role}).` }, { quoted: msg });
            } catch (err) {
                return sock.sendMessage(jid, { text: `(¬_¬) [ BIZ ] ❌\n\n${err.message}` }, { quoted: msg });
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
                text += `• *#${u.id} ${u.name}* (${u.role}, ${u.active ? 'active' : 'inactive'})\n  ID: \`${idStr}\`\n  Aliases: ${u.aliases}\n\n`;
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
