const Hardware = require("../../lib/hardware");
const config = require("../../config");

module.exports = {
    name: "hardware",
    alias: ["hw", "status", "temp"],
    desc: "Extension Control",
    run: async ({ sock, jid, msg, args }) => {
        const sender = msg.key.participant || msg.key.remoteJid;
        const isSuperAdmin = config.superAdminIds.includes(sender);

        if (!args[0] || args[0].toLowerCase() === "status") {
            try {
                const status = await Hardware.getStatus();
                return await sock.sendMessage(jid, { text: status });
            } catch (error) {
                return await sock.sendMessage(jid, { text: `(¬_¬) [ ERROR ]\n  • Hardware Offline.` });
            }
        }

        if (!isSuperAdmin) {
            return await sock.sendMessage(jid, { text: "(¬_¬) [ SYSTEM ]\n  • Unauthorized." });
        }

        const action = args[0].toLowerCase(); 
        if (action !== "on" && action !== "off") {
            return await sock.sendMessage(jid, { text: "(¬_¬) [ SYSTEM ]\n  • Usage: .hw [on/off] [1-5|all]" });
        }

        let targets = [];
        if (args[1] === "all") {
            targets = [1, 2, 3, 4, 5];
        } else {
            targets = args.slice(1)
                .map(id => parseInt(id))
                .filter(id => !isNaN(id) && id >= 1 && id <= 5);
        }

        if (targets.length === 0) {
            return await sock.sendMessage(jid, { text: "(¬_¬) [ SYSTEM ]\n  • No IDs found." });
        }

        const results = await Hardware.toggleMultiple(targets, action);
        const successCount = results.filter(r => r.success).length;
        const summary = results.map(r => `  • Relay ${r.id} : ${r.success ? 'OK' : 'FAIL'}`).join('\n');

        await sock.sendMessage(jid, { 
            text: `(¬_¬) [ HARDWARE ]\n\n${summary}\n\n( ._.) Status: ${successCount}/${targets.length} OK`
        });
    }
};
