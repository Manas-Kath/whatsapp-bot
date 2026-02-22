const safety = require('../../lib/safety');
const config = require('../../config');

module.exports = {
    name: "safety",
    alias: ["health", "status", "resetsafety"],
    desc: "Check bot health and reset safety mode",
    run: async ({ sock, jid, sender, isSuperAdmin, body }) => {
        if (!isSuperAdmin) {
            return sock.sendMessage(jid, { text: "(ಠ_ಠ) SuperAdmins only." });
        }

        const args = body.split(/\s+/).slice(1);
        const cmd = args[0]?.toLowerCase();

        if (cmd === 'reset') {
            safety.resetSafeMode();
            return sock.sendMessage(jid, { text: "✅ *Safety Reset!* Crash loop counter cleared and Safe Mode disabled." });
        }

        const health = safety.getMemoryHealth();
        const data = safety.getSafetyData();
        
        let status = `*BUNTY v5.5 HEALTH* (._.)

`;
        status += `  • `Safe Mode` : ${data.safeMode ? '🔴 ACTIVE' : '🟢 inactive'}
`;
        status += `  • `Boots (5m)` : ${data.boots.length} / 3
`;
        status += `  • `RAM Usage` : ${health.nodeUsageMB} MB
`;
        status += `  • `Free RAM` : ${health.freePercent.toFixed(1)}%
`;
        status += `  • `AI Status` : ${Date.now() < data.aiDisabledUntil ? '🟠 throttled' : '🟢 ready'}
`;
        
        if (data.safeMode) {
            status += `
⚠️ *Bot is in Safe Mode.* Some features are limited. Use `.safety reset` to clear.`;
        }

        return sock.sendMessage(jid, { text: status });
    }
};
