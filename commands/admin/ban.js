const db = require('../../lib/database');
const config = require('../../config');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');

module.exports = {
    name: "ban",
    alias: ["block", "ignore"],
    desc: "Ban user",
    adminOnly: true, 
    run: async ({ sock, jid, msg, isSuperAdmin }) => {
        const target = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || 
                       msg.message.extendedTextMessage?.contextInfo?.participant || 
                       null;

        if (!target) return sock.sendMessage(jid, { text: " (ಠ_ಠ) Tag someone to ban." });

        const normTarget = jidNormalizedUser(target);
        if (config.superAdminIds.includes(normTarget)) {
            return sock.sendMessage(jid, { text: " (⌐■_■) Cannot ban the Boss." });
        }

        db.banUser(normTarget);
        await sock.sendMessage(jid, { text: ` (¬_¬) Banned @${normTarget.split('@')[0]}`, mentions: [normTarget] });
    }
};
