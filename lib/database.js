const fs = require('fs');
const path = require('path');

const dbFile = path.join(__dirname, '../database.json');
const tempFile = path.join(__dirname, '../database.temp.json');

// Default Data Structure
const defaultData = {
    users: {}, 
    stats: { cmdCount: 0, startTime: Date.now() },
    banned: [],
    hardBanned: [], // 🔨 New List
    settings: {
        ai_enabled: true,
        public_mode: true,
        auto_read: false
    }
};

let data;
try {
    if (fs.existsSync(dbFile)) {
        const fileContent = fs.readFileSync(dbFile, 'utf-8');
        data = fileContent.trim().length === 0 ? defaultData : JSON.parse(fileContent);
    } else {
        data = defaultData;
    }
} catch (e) {
    console.error("⚠️ Database Corrupted! Resetting.");
    data = defaultData;
}

// 🛡️ MIGRATION: Ensure new keys exist if loading old DB
if (!data.hardBanned) data.hardBanned = [];
if (!data.settings) data.settings = defaultData.settings;

function save() {
    try {
        fs.writeFileSync(tempFile, JSON.stringify(data, null, 2));
        fs.renameSync(tempFile, dbFile);
    } catch (e) {
        console.error("❌ DB Save Failed:", e);
    }
}

setInterval(save, 30_000);

module.exports = {
    data,
    save, 
    addStat: () => { data.stats.cmdCount++; },
    
    // Standard Ban
    isBanned: (jid) => data.banned.includes(jid),
    banUser: (jid) => { if(!data.banned.includes(jid)) { data.banned.push(jid); save(); }},
    
    // 🔨 Hard Ban (The Deleter)
    isHardBanned: (jid) => data.hardBanned.includes(jid),
    hardBanUser: (jid) => { 
        if(!data.hardBanned.includes(jid)) { 
            data.hardBanned.push(jid); 
            // Ensure they are also regular banned so commands don't run
            if(!data.banned.includes(jid)) data.banned.push(jid);
            save(); 
        }
    },

    // Unban (Clears both)
    unbanUser: (jid) => { 
        data.banned = data.banned.filter(id => id !== jid); 
        data.hardBanned = data.hardBanned.filter(id => id !== jid); 
        save(); 
    }
};