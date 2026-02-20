const { delay } = require('../../lib/utils');

module.exports = {
    name: "spam",
    alias: ["bomb", "annoy"],
    desc: "Spam a user with messages",
    run: async ({ sock, jid, msg, args, isSuperAdmin }) => {
        // 1. Get Target
        const target = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!target) return sock.sendMessage(jid, { text: "❌ Usage: .spam @user <text> <amount>" });

        // 2. Admin Immunity
        const config = require('../../config');
        const { jidNormalizedUser } = require('@whiskeysockets/baileys');
        if (config.superAdminIds.includes(jidNormalizedUser(target))) {
             return sock.sendMessage(jid, { text: "Target is immune." });
        }

        // 3. Parse Count & Text intelligently
        // We look for the number in the arguments. 
        let count = 5; // Default
        let textArgs = [];

        args.forEach(arg => {
            if (!isNaN(arg) && textArgs.length === 0 && count === 5) {
                // If it's a number and we haven't found text yet, assume it's the count
                count = parseInt(arg);
            } else if (!isNaN(arg) && args.indexOf(arg) === args.length - 1) {
                // If it's a number and it's the LAST argument, it's definitely the count
                count = parseInt(arg);
            } else if (!arg.includes('@')) {
                // If it's not a mention, add to text
                textArgs.push(arg);
            }
        });

        const text = textArgs.join(' ') || "Wake up!";

        // 4. Safety Limits (Prevent Bans)
        const limit = isSuperAdmin ? 50 : 10; // You get 50, others get 10
        if (count > limit) count = limit;

        await sock.sendMessage(jid, { text: `Launching ${count} spams...` });

        // 5. Fire with Delay
        for (let i = 0; i < count; i++) {
            await sock.sendMessage(jid, { 
                text: `@${target.split('@')[0]} ${text}`, 
                mentions: [target] 
            });
            await delay(1500); // 1.5s delay is safe for J7
        }
        
        await sock.sendMessage(jid, { text: "✅ Done." });
    }
};