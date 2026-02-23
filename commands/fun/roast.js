const fs = require('fs');
const path = require('path');
const { pickRandom } = require('../../lib/utils');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');

module.exports = {
    name: "roast",
    alias: ["burn", "insult", "obliterate"],
    desc: "Roast a user (Hint: use -o to obliterate)",
    run: async ({ sock, jid, msg, args, isSuperAdmin, sender }) => {
        const target = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || 
                      msg.message.extendedTextMessage?.contextInfo?.participant;
        
        // 1. Validation
        if (!target) return sock.sendMessage(jid, { text: "(._.) Tag someone or reply to a message, you absolute donut!" });
        
        const normTarget = jidNormalizedUser(target);
        const normSender = jidNormalizedUser(sender);

        // 2. Admin/Self Immunity Check
        const config = require('../../config');
        if (config.superAdminIds.includes(normTarget)) {
            return sock.sendMessage(jid, { text: "(⌐■_■) Cannot roast my Creator." });
        }
        if (normTarget === normSender) {
            return sock.sendMessage(jid, { text: "(o_O) Roast yourself? Really?" });
        }

        // 3. Mode Selection (-o flag)
        const isObliterate = args.includes("-o") || args.includes("--obliterate");
        const filename = isObliterate ? 'obliterates.txt' : 'roasts.txt';
        const emoji = isObliterate ? "💀" : "🔥";

        // 4. Load Roasts/Obliterates
        let lines = ["You look like a blurry screenshot."]; // Default fallback
        try {
            const assetFile = path.join(__dirname, `../../assets/${filename}`);
            if (fs.existsSync(assetFile)) {
                const fileData = fs.readFileSync(assetFile, 'utf8');
                lines = fileData.split('\n').map(r => r.trim()).filter(r => r.length > 0);
            }
        } catch (e) {
            console.error(`Failed to load ${filename}`, e);
        }

        // 5. Fire
        const roastText = pickRandom(lines);
        await sock.sendMessage(jid, { 
            text: `@${target.split('@')[0]} ${emoji} ${roastText}`, 
            mentions: [target] 
        }, { quoted: msg });
    }
};
