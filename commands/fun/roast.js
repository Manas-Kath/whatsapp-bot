const fs = require('fs');
const path = require('path');
const { pickRandom } = require('../../lib/utils');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');

module.exports = {
    name: "roast",
    alias: ["burn", "insult"],
    desc: "Roast a user",
    run: async ({ sock, jid, msg, args, isSuperAdmin }) => {
        const target = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        
        // 1. Validation
        if (!target) return sock.sendMessage(jid, { text: "Tag someone, freakin donut!" });
        
        // 2. Admin Immunity Check
        // If target is SuperAdmin, don't roast them.
        const config = require('../../config');
        if (config.superAdminIds.includes(jidNormalizedUser(target))) {
            return sock.sendMessage(jid, { text: "Cannot roast my Creator." });
        }

        // 3. Load Roasts
        let roasts = ["You look like a blurry screenshot."]; // Default fallback
        try {
            const roastFile = path.join(__dirname, '../../assets/roasts.txt');
            if (fs.existsSync(roastFile)) {
                const fileData = fs.readFileSync(roastFile, 'utf8');
                roasts = fileData.split('\n').map(r => r.trim()).filter(r => r.length > 0);
            }
        } catch (e) {
            console.error("Failed to load roasts.txt", e);
        }

        // 4. Fire
        const roastText = pickRandom(roasts);
        await sock.sendMessage(jid, { 
            text: `@${target.split('@')[0]} ${roastText}`, 
            mentions: [target] 
        });
    }
};