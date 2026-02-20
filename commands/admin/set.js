const db = require('../../lib/database');
const config = require('../../config');

module.exports = {
    name: "set",
    alias: ["config", "settings"],
    desc: "Update bot settings",
    adminOnly: true, 
    run: async ({ sock, jid, args, isSuperAdmin }) => {
        if (!isSuperAdmin) {
            return sock.sendMessage(jid, { text: "(ಠ_ಠ) SuperAdmins only." });
        }

        const settingsMap = {
            "ai_enabled": { desc: "Toggle AI chat", type: "boolean", cat: "AI" },
            "public_mode": { desc: "Public bot mode", type: "boolean", cat: "CORE" },
            "auto_read": { desc: "Auto read msgs", type: "boolean", cat: "MISC" },
            "anti_delete": { desc: "Anti-delete log", type: "boolean", cat: "MISC" },
            "prefix": { desc: "Command prefix", type: "string", cat: "CORE" }
        };

        const emojis = { 
            'OWNER': ' ( ͡° ͜ʖ ͡°)',
            'MOD':   ' (ಠ_ಠ)',
            'ADMIN': ' (¬_¬)',
            'AI':    ' [ 0_0 ]',
            'FUN':   ' (¬‿¬)',
            'CORE':  ' ( ._.)',
            'MISC':  ' (o_O)'
        };

        if (args.length === 0) {
            let text = `(｡◕‿◕｡) *SETTINGS*\n`;
            const map = {};
            Object.keys(settingsMap).forEach(key => {
                const cat = settingsMap[key].cat;
                if (!map[cat]) map[cat] = [];
                map[cat].push({ key, ...settingsMap[key] });
            });
            const sortedCats = Object.keys(map).sort();
            for (const cat of sortedCats) {
                const emoji = emojis[cat] || ' (›_‹)';
                text += `\n*${cat}* ${emoji}\n`;
                text += map[cat].map(s => {
                    const val = db.data.settings[s.key] !== undefined ? db.data.settings[s.key] : "N/A";
                    const status = val === true ? 'ON' : (val === false ? 'OFF' : `\`${val}\``);
                    return `  • \`${s.key}\` : ${status}`;
                }).join('\n');
                text += '\n';
            }
            text += `\n💡 Usage: \`.set [key] [val]\``;
            return sock.sendMessage(jid, { text });
        }

        const key = args[0].toLowerCase();
        const value = args[1];
        if (!settingsMap[key]) return sock.sendMessage(jid, { text: ` (o_O) Unknown key: ${key}` });
        if (args.length < 2) return sock.sendMessage(jid, { text: ` ( ._.) Missing value for ${key}.` });

        const targetSetting = settingsMap[key];
        let finalVal = value;
        if (targetSetting.type === "boolean") {
            if (value === "true" || value === "on" || value === "1") finalVal = true;
            else if (value === "false" || value === "off" || value === "0") finalVal = false;
            else return sock.sendMessage(jid, { text: ` (ಠ_ಠ) Use true/false for ${key}.` });
        }

        db.data.settings[key] = finalVal;
        db.save();
        if (key === 'prefix') config.prefix = finalVal;

        const responseStatus = finalVal === true ? "ENABLED" : (finalVal === false ? "DISABLED" : finalVal);
        return sock.sendMessage(jid, { text: `(＾▽＾) Updated *${key}* to *${responseStatus}*` });
    }
};
