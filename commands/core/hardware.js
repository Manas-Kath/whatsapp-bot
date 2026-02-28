const Hardware = require("../../lib/hardware");
const config = require("../../config");

module.exports = {
    name: "hardware",
    alias: ["hw", "status", "temp"],
    desc: "Control Bunty Extension (SuperAdmin Only)",
    run: async ({ sock, jid, msg, args }) => {
        const sender = msg.key.participant || msg.key.remoteJid;
        const isSuperAdmin = config.superAdminIds.includes(sender);

        // Status is PUBLIC (anyone can see temp/humi)
        if (!args[0] || args[0].toLowerCase() === "status") {
            try {
                const status = await Hardware.getStatus();
                return await sock.sendMessage(jid, { text: status });
            } catch (error) {
                return await sock.sendMessage(jid, { text: `❌ Hardware Offline.` });
            }
        }

        // Toggling is SUPERADMIN ONLY
        if (!isSuperAdmin) {
            return await sock.sendMessage(jid, { text: "❌ *Boss Only!* You don't have permission to toggle hardware." });
        }

        const action = args[0].toLowerCase(); // 'on' or 'off'
        if (action !== "on" && action !== "off") {
            return await sock.sendMessage(jid, { text: "⚠️ Use: !hw on [1-5|all] or !hw off [1-5|all]" });
        }

        let targets = [];
        if (args[1] === "all") {
            targets = [1, 2, 3, 4, 5];
        } else {
            // Parse IDs (e.g., !hw on 1 4 5)
            targets = args.slice(1)
                .map(id => parseInt(id))
                .filter(id => !isNaN(id) && id >= 1 && id <= 5);
        }

        if (targets.length === 0) {
            return await sock.sendMessage(jid, { text: "⚠️ No valid relay IDs found. Use [1-5] or 'all'." });
        }

        // Execute Toggles
        const loadingMsg = await sock.sendMessage(jid, { text: `⏳ *Switching ${targets.length} Relays...*` });
        const results = await Hardware.toggleMultiple(targets, action);
        
        const successCount = results.filter(r => r.success).length;
        const summary = results.map(r => `${r.success ? '✅' : '❌'} Relay ${r.id}`).join('\n');

        await sock.sendMessage(jid, { 
            text: `🛠️ *Hardware Update* (${action.toUpperCase()})
${summary}
\n*Status:* ${successCount}/${targets.length} Success`,
            edit: loadingMsg.key 
        });
    }
};
