const db = require('../../lib/database');

module.exports = {
    name: "unban",
    alias: ["unblock", "forgive"],
    desc: "Unban user",
    adminOnly: true,
    run: async ({ sock, jid, msg }) => {
        const target = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || 
                       msg.message.extendedTextMessage?.contextInfo?.participant || 
                       null;

        if (!target) return sock.sendMessage(jid, { text: " ( ._.) Tag someone to unban." });

        db.unbanUser(target);
        await sock.sendMessage(jid, { text: ` (¬‿¬) Unbanned @${target.split('@')[0]}`, mentions: [target] });
    }
};
