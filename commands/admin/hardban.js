const db = require('../../lib/database');
const config = require('../../config');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');

module.exports = {
    name: "hardban",
    alias: ["superban", "begone", "nuke"],
    desc: "Ban + Auto-Delete user",
    adminOnly: true, 
    run: async ({ sock, jid, msg, isSuperAdmin }) => {
        const target = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || 
                       msg.message.extendedTextMessage?.contextInfo?.participant;

        if (!target) return sock.sendMessage(jid, { text: " (ಠ_ಠ) Tag the victim." });

        const normTarget = jidNormalizedUser(target);
        if (config.superAdminIds.includes(normTarget)) {
            return sock.sendMessage(jid, { text: " (⌐■_■) I cannot ban the Boss." });
        }

        db.hardBanUser(normTarget);
        
        await sock.sendMessage(jid, { 
            text: `🔨 (⌐■_■) *HAMMER DROPPED* \n@${normTarget.split('@')[0]} is now Hard Banned.\nEverything they type will be deleted.`, 
            mentions: [normTarget] 
        });
    }
};
