const { delay } = require('../../lib/utils');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');

module.exports = {
    name: "spam",
    alias: ["bomb", "annoy"],
    desc: "Spam a user (Limit: 5 for all, 50 for BOSS)",
    run: async ({ sock, jid, msg, args, isSuperAdmin, sender }) => {
        // 1. Get Target (Tag, Reply, or direct JID)
        const target = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || 
                      msg.message.extendedTextMessage?.contextInfo?.participant;
        
        if (!target) return sock.sendMessage(jid, { text: "(o_O) Usage: .spam @user <text> <amount>" });

        const normTarget = jidNormalizedUser(target);
        const normSender = jidNormalizedUser(sender);

        // 2. Admin Immunity
        const config = require('../../config');
        if (config.superAdminIds.includes(normTarget)) {
             return sock.sendMessage(jid, { text: "(⌐■_■) Target is immune to your spam." });
        }
        if (normTarget === normSender) {
            return sock.sendMessage(jid, { text: "(._.) You want to spam yourself?" });
        }

        // 3. Parse Count & Text
        let count = 5; // Default
        let textArgs = [];

        args.forEach(arg => {
            const num = parseInt(arg);
            if (!isNaN(num) && num > 0) {
                count = num;
            } else if (!arg.includes('@') && arg !== "-o") {
                textArgs.push(arg);
            }
        });

        const text = textArgs.join(' ') || "Wake up!";

        // 4. Safety Limits (Prevent Bans and J7 overheating)
        const limit = isSuperAdmin ? 50 : 5; // BOSS gets 50, others get 5
        if (count > limit) count = limit;

        await sock.sendMessage(jid, { text: `(¬‿¬) Launching ${count} spams...` });

        // 5. Fire with Delay
        const waitTime = isSuperAdmin ? 1000 : 2000; // 1s for BOSS, 2s for others
        for (let i = 0; i < count; i++) {
            await sock.sendMessage(jid, { 
                text: `@${target.split('@')[0]} ${text}`, 
                mentions: [target] 
            });
            await delay(waitTime); 
        }
        
        await sock.sendMessage(jid, { text: "(＾▽＾) Done." });
    }
};
