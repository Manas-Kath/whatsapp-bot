const fs = require('fs');
const path = require('path');
const db = require('./database'); // <--- MAKE SURE DB IS IMPORTED
const config = require('../config');

const commands = new Map();
const aliases = new Map();

const loadCommands = () => {
    // ... (Keep your existing loadCommands logic) ...
    // (Just leave this part as it is in your file)
    const cmdDir = path.join(__dirname, '../commands');
    if (!fs.existsSync(cmdDir)) fs.mkdirSync(cmdDir);
    const categories = fs.readdirSync(cmdDir);
    categories.forEach(category => {
        const catPath = path.join(cmdDir, category);
        if (fs.statSync(catPath).isDirectory()) {
            const files = fs.readdirSync(catPath).filter(f => f.endsWith('.js'));
            files.forEach(file => {
                try {
                    const cmd = require(path.join(catPath, file));
                    if (cmd.name) {
                        cmd.category = category;
                        commands.set(cmd.name, cmd);
                        if (cmd.alias) cmd.alias.forEach(a => aliases.set(a, cmd.name));
                    }
                } catch (e) {
                    console.error(`❌ Failed to load ${file}:`, e);
                }
            });
        }
    });
    console.log(`✅ Loaded ${commands.size} commands.`);
};

const handleCommand = async (ctx) => {
    const { sock, msg, jid, body, isSuperAdmin, sender } = ctx;
    
    // 🛡️ NEW: CHECK IF BANNED (Block commands)
    if (db.isBanned(sender) && !isSuperAdmin) {
        return false; // Silent ignore
    }

    if (!body.startsWith(config.prefix)) return false;

    const args = body.slice(config.prefix.length).trim().split(/ +/);
    const cmdName = args.shift().toLowerCase();
    const cmd = commands.get(cmdName) || commands.get(aliases.get(cmdName));

    if (!cmd) return false;

    // A. Permissions Check
    if (cmd.adminOnly && !ctx.isAdmin && !isSuperAdmin) {
        await sock.sendMessage(jid, { text: '⚠️ Admins only.' }, { quoted: msg });
        return true;
    }
    if (cmd.superAdminOnly && !isSuperAdmin) {
        return true; 
    }

    // B. Execution
    try {
        // db.addStat(); // Optional: Count stats
        await cmd.run({ ...ctx, args, text: args.join(' ') });
    } catch (e) {
        console.error(`Command Error (${cmdName}):`, e);
        await sock.sendMessage(jid, { text: `❌ Error: ${e.message}` });
    }
    return true;
};

module.exports = { loadCommands, handleCommand, commands };