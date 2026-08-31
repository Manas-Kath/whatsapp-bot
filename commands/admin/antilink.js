const db = require('../../lib/database');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');

module.exports = {
    name: "antilink",
    alias: ["linkban", "antilinks", "linkprotection"],
    desc: "Manage per-group link protection (delete on 1st link, remove on 2nd)",
    category: "admin",
    adminOnly: true,
    run: async ({ sock, jid, msg, args, isGroup, isAdmin, isSuperAdmin }) => {
        // REMOTE DM MANAGEMENT (Configure groups from private chat)
        if (!isGroup) {
            if (!isSuperAdmin) {
                return sock.sendMessage(jid, { text: "(¬_¬) [ ANTILINK ]\n\nRemote group antilink control is restricted to SuperAdmin." }, { quoted: msg });
            }

            let allGroups = [];
            try {
                const groupsObj = await sock.groupFetchAllParticipating();
                allGroups = Object.values(groupsObj);
            } catch (e) {
                return sock.sendMessage(jid, { text: `(¬_¬) [ ANTILINK ]\n\nFailed to fetch groups: ${e.message}` }, { quoted: msg });
            }

            if (allGroups.length === 0) {
                return sock.sendMessage(jid, { text: "(¬_¬) [ ANTILINK ]\n\nBot is not currently in any groups." }, { quoted: msg });
            }

            const action = (args[0] || "list").toLowerCase();

            // 1. LIST ALL GROUPS
            if (action === "list" || args.length === 0) {
                let text = `(¬_¬) [ ANTILINK - REMOTE GROUPS ]\n\n`;
                allGroups.forEach((g, idx) => {
                    const enabled = db.isAntilinkEnabled(g.id);
                    const status = enabled ? "[ ON ]" : "[ OFF ]";
                    text += `  • *${idx + 1}.* ${g.subject} ${status}\n    ID: \`${g.id}\`\n`;
                });
                text += `\n*Remote Commands:*\n` +
                        `  • \`.antilink on <number/ID>\` : Enable remotely\n` +
                        `  • \`.antilink off <number/ID>\` : Disable remotely\n` +
                        `  • \`.antilink status <number/ID>\` : Inspect group status`;
                return sock.sendMessage(jid, { text }, { quoted: msg });
            }

            // 2. TOGGLE OR INSPECT BY NUMBER OR JID
            const targetRef = args[1];
            if (!targetRef) {
                return sock.sendMessage(jid, { text: `(¬_¬) [ ANTILINK ]\n\nSpecify group number or ID: \`.antilink ${action} 1\`` }, { quoted: msg });
            }

            let targetGroup = null;
            const index = parseInt(targetRef, 10);
            if (!isNaN(index) && index >= 1 && index <= allGroups.length) {
                targetGroup = allGroups[index - 1];
            } else {
                targetGroup = allGroups.find(g => g.id === targetRef || g.id === `${targetRef}@g.us`);
            }

            if (!targetGroup) {
                return sock.sendMessage(jid, { text: `(¬_¬) [ ANTILINK ]\n\nGroup not found for: \`${targetRef}\`. Use \`.antilink list\`.` }, { quoted: msg });
            }

            const targetJid = targetGroup.id;

            if (action === "on" || action === "enable" || action === "1" || action === "true") {
                db.setAntilink(targetJid, true);
                return sock.sendMessage(jid, { 
                    text: `(¬_¬) [ ANTILINK - REMOTE ]\n\n` +
                          `Enabled link protection for:\n` +
                          `• Group: ${targetGroup.subject}\n` +
                          `• ID: \`${targetJid}\`` 
                }, { quoted: msg });
            }

            if (action === "off" || action === "disable" || action === "0" || action === "false") {
                db.setAntilink(targetJid, false);
                return sock.sendMessage(jid, { 
                    text: `(¬_¬) [ ANTILINK - REMOTE ]\n\n` +
                          `Disabled link protection for:\n` +
                          `• Group: ${targetGroup.subject}\n` +
                          `• ID: \`${targetJid}\`` 
                }, { quoted: msg });
            }

            if (action === "status") {
                const isEnabled = db.isAntilinkEnabled(targetJid);
                const gData = db.getGroup(targetJid);
                const activeWarns = Object.keys(gData.linkWarnings || {}).filter(k => (gData.linkWarnings[k] || 0) > 0);
                return sock.sendMessage(jid, { 
                    text: `(¬_¬) [ ANTILINK STATUS ]\n\n` +
                          `• Group: ${targetGroup.subject}\n` +
                          `• Status: ${isEnabled ? "[ ENABLED ]" : "[ DISABLED ]"}\n` +
                          `• Active Strikes: ${activeWarns.length}\n` +
                          `• Whitelisted Members: ${(gData.whitelist || []).length}` 
                }, { quoted: msg });
            }

            return sock.sendMessage(jid, { text: `(¬_¬) [ ANTILINK ]\n\nUnknown action: \`${action}\`. Use on/off/status/list.` }, { quoted: msg });
        }

        // IN-GROUP MANAGEMENT
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
                    botAdminNote = "\n\nNote: Promote Bunty to Admin so it can delete messages and kick offenders.";
                }
            } catch (e) {}

            return sock.sendMessage(jid, { 
                text: `(¬_¬) [ ANTILINK ]\n\n` +
                      `Link protection is now *ENABLED* for this group.\n\n` +
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
                      `Link protection is now *DISABLED* for this group.` 
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
                          `• Status: ${isEnabled ? "[ ENABLED ]" : "[ DISABLED ]"}\n` +
                          `• Bot Power: ${botStatus}\n` +
                          `• Policy: Delete on 1st link, kick on 2nd\n\n` +
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
