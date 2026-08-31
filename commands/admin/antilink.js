const db = require('../../lib/database');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');

module.exports = {
    name: "antilink",
    alias: ["linkban", "antilinks", "linkprotection"],
    desc: "Manage per-group link protection (delete on 1st link, remove on 2nd)",
    category: "admin",
    adminOnly: true,
    run: async ({ sock, jid, msg, args, isGroup, isAdmin, isSuperAdmin }) => {
        if (!isGroup) {
            return sock.sendMessage(jid, { text: "(¬_¬) [ ANTILINK ]\n\nThis command can only be used inside a group." }, { quoted: msg });
        }

        if (!isAdmin && !isSuperAdmin) {
            return sock.sendMessage(jid, { text: "(¬_¬) [ ANTILINK ]\n\nGroup Admins only." }, { quoted: msg });
        }

        const subCmd = (args[0] || "status").toLowerCase();

        // 1. ENABLE
        if (subCmd === "on" || subCmd === "enable" || subCmd === "1" || subCmd === "true") {
            db.setAntilink(jid, true);
            let botAdminNote = "";
            try {
                const meta = await sock.groupMetadata(jid);
                const botId = jidNormalizedUser(sock.user.id);
                const botLid = sock.user.lid ? jidNormalizedUser(sock.user.lid) : null;
                const botParticipant = meta.participants.find(p => {
                    const pId = jidNormalizedUser(p.id);
                    return pId === botId || (botLid && pId === botLid) || (p.lid && jidNormalizedUser(p.lid) === botId);
                });
                const isBotAdmin = botParticipant && (botParticipant.admin === 'admin' || botParticipant.admin === 'superadmin');
                if (!isBotAdmin) {
                    botAdminNote = "\n\n⚠️ *Note:* Promote Bunty to Admin so it can delete messages and kick offenders.";
                }
            } catch (e) {}

            return sock.sendMessage(jid, { 
                text: `(¬_¬) [ ANTILINK ]\n\n` +
                      `✅ Link protection is now *ENABLED* for this group.\n\n` +
                      `*Policy:*\n` +
                      `• 1st Link: Message deleted + Warning.\n` +
                      `• 2nd Link: Message deleted + Removal from group.\n` +
                      `• Admins and whitelisted members are exempt.${botAdminNote}` 
            }, { quoted: msg });
        }

        // 2. DISABLE
        if (subCmd === "off" || subCmd === "disable" || subCmd === "0" || subCmd === "false") {
            db.setAntilink(jid, false);
            return sock.sendMessage(jid, { 
                text: `(¬_¬) [ ANTILINK ]\n\n` +
                      `❌ Link protection is now *DISABLED* for this group.` 
            }, { quoted: msg });
        }

        // 3. RESET WARNINGS
        if (subCmd === "reset" || subCmd === "clear") {
            const target = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || 
                           msg.message.extendedTextMessage?.contextInfo?.participant || 
                           null;
            
            if (target) {
                const normTarget = jidNormalizedUser(target);
                db.resetLinkWarnings(jid, normTarget);
                return sock.sendMessage(jid, { 
                    text: `(¬_¬) [ ANTILINK ]\n\nReset link warnings for @${normTarget.split('@')[0]}.`, 
                    mentions: [normTarget] 
                }, { quoted: msg });
            } else {
                db.resetLinkWarnings(jid);
                return sock.sendMessage(jid, { 
                    text: `(¬_¬) [ ANTILINK ]\n\nCleared all link warnings for this group.` 
                }, { quoted: msg });
            }
        }

        // 4. WHITELIST / ALLOW SPECIFIC MEMBERS
        if (subCmd === "allow" || subCmd === "whitelist" || subCmd === "add") {
            const target = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || 
                           (args[1] && args[1].includes('@') ? args[1] : null);
            
            if (!target) {
                return sock.sendMessage(jid, { 
                    text: `(¬_¬) [ ANTILINK ]\n\nTag a member to whitelist: \`.antilink allow @user\`` 
                }, { quoted: msg });
            }

            const normTarget = jidNormalizedUser(target);
            db.addLinkWhitelist(jid, normTarget);
            return sock.sendMessage(jid, { 
                text: `(¬_¬) [ ANTILINK ]\n\nAllowed @${normTarget.split('@')[0]} to send links in this group.`, 
                mentions: [normTarget] 
            }, { quoted: msg });
        }

        // 5. DENY / REMOVE FROM WHITELIST
        if (subCmd === "deny" || subCmd === "remove" || subCmd === "unallow") {
            const target = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || 
                           (args[1] && args[1].includes('@') ? args[1] : null);
            
            if (!target) {
                return sock.sendMessage(jid, { 
                    text: `(¬_¬) [ ANTILINK ]\n\nTag a member to remove: \`.antilink deny @user\`` 
                }, { quoted: msg });
            }

            const normTarget = jidNormalizedUser(target);
            db.removeLinkWhitelist(jid, normTarget);
            return sock.sendMessage(jid, { 
                text: `(¬_¬) [ ANTILINK ]\n\nRemoved @${normTarget.split('@')[0]} from link whitelist.`, 
                mentions: [normTarget] 
            }, { quoted: msg });
        }

        // 6. STATUS / HELP (DEFAULT)
        const isEnabled = db.isAntilinkEnabled(jid);
        const groupData = db.getGroup(jid);
        const warningKeys = Object.keys(groupData.linkWarnings || {});
        const activeWarnings = warningKeys.filter(k => (groupData.linkWarnings[k] || 0) > 0);
        const whitelist = groupData.whitelist || [];

        let botStatus = "Unknown";
        try {
            const meta = await sock.groupMetadata(jid);
            const botId = jidNormalizedUser(sock.user.id);
            const botLid = sock.user.lid ? jidNormalizedUser(sock.user.lid) : null;
            const botParticipant = meta.participants.find(p => {
                const pId = jidNormalizedUser(p.id);
                return pId === botId || (botLid && pId === botLid) || (p.lid && jidNormalizedUser(p.lid) === botId);
            });
            const isBotAdmin = botParticipant && (botParticipant.admin === 'admin' || botParticipant.admin === 'superadmin');
            botStatus = isBotAdmin ? "ADMIN (Active)" : "NOT ADMIN (Cannot delete/kick)";
        } catch (e) {}

        const mentions = [];
        let warningsList = "None";
        if (activeWarnings.length > 0) {
            warningsList = activeWarnings.map(u => {
                mentions.push(u);
                return `  • @${u.split('@')[0]}: ${groupData.linkWarnings[u]} strike(s)`;
            }).join('\n');
        }

        let whitelistStr = "None (Admins only)";
        if (whitelist.length > 0) {
            whitelistStr = whitelist.map(u => {
                mentions.push(u);
                return `  • @${u.split('@')[0]}`;
            }).join('\n');
        }

        const statusMsg = `(¬_¬) [ ANTILINK STATUS ]\n\n` +
                          `• *Status:* ${isEnabled ? "[ ENABLED ]" : "[ DISABLED ]"}\n` +
                          `• *Bot Power:* ${botStatus}\n` +
                          `• *Policy:* Delete on 1st link, kick on 2nd\n\n` +
                          `*Active Warnings:*\n${warningsList}\n\n` +
                          `*Whitelisted Members:*\n${whitelistStr}\n\n` +
                          `*Commands:*\n` +
                          `  • \`.antilink on\` : Enable protection\n` +
                          `  • \`.antilink off\` : Disable protection\n` +
                          `  • \`.antilink allow @user\` : Whitelist member\n` +
                          `  • \`.antilink deny @user\` : Remove whitelist\n` +
                          `  • \`.antilink reset [@user]\` : Clear warning(s)`;

        return sock.sendMessage(jid, { text: statusMsg, mentions }, { quoted: msg });
    }
};
