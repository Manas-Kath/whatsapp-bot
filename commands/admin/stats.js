const db = require('../../lib/database');

module.exports = {
    name: "stats",
    alias: ["status", "info"],
    desc: "Bot statistics",
    run: async ({ sock, jid }) => {
        const uptime = process.uptime();
        const hrs = Math.floor(uptime / 3600);
        const mins = Math.floor((uptime % 3600) / 60);
        
        let bannedDisplay = "  None";
        let mentions = [];

        if (db.data.banned && db.data.banned.length > 0) {
            mentions = db.data.banned;
            bannedDisplay = db.data.banned.map(id => {
                const isHard = db.isHardBanned(id);
                const icon = isHard ? "💀" : "🚫";
                return `  ${icon} @${id.split('@')[0]}`; 
            }).join('\n');
        }

        const text = `*BUNTY v5.5*\n (¬_¬) [ SYSTEM ]\n\n  • Uptime: ${hrs}h ${mins}m\n  • Commands: ${db.data.stats.cmdCount}\n  • Banned Users: ${db.data.banned.length}\n\n*THE BLACKLIST* 💀\n${bannedDisplay}`;

        await sock.sendMessage(jid, { text, mentions });
    }
};
