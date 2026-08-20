const fs = require('fs');
const path = require('path');

const memoryFile = path.join(__dirname, '../chat_memory.json');
let chatMemory = {};

// Load existing memory
if (fs.existsSync(memoryFile)) {
    try {
        chatMemory = JSON.parse(fs.readFileSync(memoryFile, 'utf-8'));
    } catch (e) {
        console.error("⚠️ AI Memory Corrupted! Resetting.");
    }
}

const MAX_HISTORY = 30; // Expanded memory depth for Debian server headroom
const TTL = 2 * 60 * 60 * 1000; // 2 hours context retention

function cleanOldMemory() {
    const now = Date.now();
    let changed = false;
    for (const jid in chatMemory) {
        if (now - chatMemory[jid].lastUpdate > TTL) {
            delete chatMemory[jid];
            changed = true;
        }
    }
    if (changed) saveMemory();
}

function saveMemory() {
    try {
        fs.writeFileSync(memoryFile, JSON.stringify(chatMemory, null, 2));
    } catch (e) {
        console.error("❌ Memory Save Failed:", e);
    }
}

// Periodic cleanup
setInterval(cleanOldMemory, 5 * 60 * 1000);

module.exports = {
    get: (jid) => chatMemory[jid]?.history || [],
    set: (jid, history) => {
        chatMemory[jid] = {
            history: history.slice(-MAX_HISTORY),
            lastUpdate: Date.now()
        };
        saveMemory();
    },
    del: (jid) => {
        delete chatMemory[jid];
        saveMemory();
    }
};
