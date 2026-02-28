const Hardware = require("../../lib/hardware");

module.exports = {
    name: "hardware",
    alias: ["hw", "extension", "relay", "status", "temp"],
    desc: "Control and check Bunty Home Automation Extension",
    run: async ({ sock, jid, args }) => {
        if (!args[0]) {
            // Default: Show Status
            try {
                const status = await Hardware.getStatus();
                return await sock.sendMessage(jid, { text: status });
            } catch (error) {
                return await sock.sendMessage(jid, { text: `❌ ${error.message}` });
            }
        }

        // Subcommands: !hardware on [id] | !hardware off [id]
        const action = args[0].toLowerCase();
        const relayId = args[1] ? parseInt(args[1]) : null;

        if ((action === "on" || action === "off") && relayId >= 1 && relayId <= 5) {
            try {
                const response = await Hardware.toggle(relayId, action);
                return await sock.sendMessage(jid, { text: response });
            } catch (error) {
                return await sock.sendMessage(jid, { text: `❌ ${error.message}` });
            }
        } else if (action === "status" || action === "temp") {
            try {
                const status = await Hardware.getStatus();
                return await sock.sendMessage(jid, { text: status });
            } catch (error) {
                return await sock.sendMessage(jid, { text: `❌ ${error.message}` });
            }
        } else {
            return await sock.sendMessage(jid, { text: `⚠️ *Usage:*
• !hw (status)
• !hw on [1-5]
• !hw off [1-5]` });
        }
    }
};
