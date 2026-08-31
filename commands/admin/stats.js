const db = require('../../lib/database');
const config = require('../../config');
const safety = require('../../lib/safety');

module.exports = {
    name: "stats",
    alias: ["status", "info"],
    desc: "Bot statistics",
    run: async ({ sock, jid, isSuperAdmin }) => {
        const uptime = process.uptime();
        const hrs = Math.floor(uptime / 3600);
        const mins = Math.floor((uptime % 3600) / 60);
        
        let bannedDisplay = "  None";
        let mentions = [];

        if (db.data.banned && db.data.banned.length > 0) {
            mentions = db.data.banned;
            bannedDisplay = db.data.banned.map(id => {
                const isHard = db.isHardBanned(id);
                const tag = isHard ? "[HARD]" : "[BAN]";
                return `  • ${tag} @${id.split('@')[0]}`; 
            }).join('\n');
        }

        const key = config.geminiApiKey || "NONE";
        const maskedKey = key !== "NONE" ? `${key.substring(0, 5)}...${key.substring(key.length - 4)}` : "MISSING";

        let text = `(¬_¬) [ SYSTEM STATS ]\n\n*Bunty v5.8*\n  • Uptime: ${hrs}h ${mins}m\n  • Commands Executed: ${db.data.stats.cmdCount}\n  • Banned Users: ${db.data.banned.length}\n\n*Blacklist:*\n${bannedDisplay}`;

        if (isSuperAdmin) {
            text += `\n\n*Debug Info:*\n  • Gemini Key: \`${maskedKey}\` (${key.length} chars)\n  • RAM Usage: ${safety.getMemoryHealth().nodeUsageMB}MB`;
        }

        await sock.sendMessage(jid, { text, mentions });
    }
};
