const config = require('../../config');

module.exports = {
    name: "help",
    alias: ["menu", "h", "commands"],
    desc: "Show the bot menu",
    run: async ({ sock, jid, msg, isSuperAdmin, sender }) => {
        const { commands } = require('../../lib/handler');
        
        const modCommands = ['ban', 'unban', 'hidetag', 'tagall', 'stats'];
        const ownerCommands = ['hardban', 'set', 'publicity', 'safety'];

        const map = {};
        commands.forEach((cmd) => {
            let cat = (cmd.category || 'misc').toUpperCase();
            if (cat === 'ADMIN') {
                if (modCommands.includes(cmd.name)) cat = 'MOD';
                else if (ownerCommands.includes(cmd.name)) cat = 'OWNER';
            }
            if (!map[cat]) map[cat] = [];
            map[cat].push(cmd);
        });

        let text = `*BUNTY v5.5* (._.)\n`;
        text += `  • User: @${sender.split('@')[0]}\n`;
        text += `──────────────────\n`;
        
        const emojis = { 
            'OWNER': ' (⌐■_■)',
            'MOD':   ' (ಠ_ಠ)',
            'ADMIN': ' (¬_¬)',
            'AI':    ' [ 0_0 ]',
            'FUN':   ' (¬‿¬)',
            'CORE':  ' ( ._.)',
            'MISC':  ' (o_O)'
        };

        const sortedCategories = Object.keys(map).sort();
        
        for (const cat of sortedCategories) {
            const emoji = emojis[cat] || ' (›_‹)';
            text += `\n*${cat}* ${emoji}\n`;
            text += map[cat].map(c => `  • \`.${c.name}\` : ${c.desc}`).join('\n');
            text += '\n';
        }

        text += `\n──────────────────\n`;
        text += `(o^ ^o) _Tera Bhai Bunty_ (■_■¬)`;

        await sock.sendMessage(jid, { text, mentions: [sender] }, { quoted: msg });
    }
};
