require('dotenv').config();

module.exports = {
    botName: process.env.BOT_NAME || "Bunty v5.5",
    superAdminIds: (process.env.SUPER_ADMIN_IDS || '27441082949745@lid').split(','),
    prefix: process.env.BOT_PREFIX || ".", 
    geminiApiKey: process.env.GEMINI_API_KEY, 
    limits: {
        spam: { max: 5, cooldown: 60000 },
        roast: { max: 10, cooldown: 30000 }
    }
};

if (module.exports.geminiApiKey) {
    const k = module.exports.geminiApiKey;
    console.log(`[INIT] Gemini API Key Loaded: ${k.substring(0, 4)}...${k.substring(k.length - 4)} (${k.length} chars)`);
} else {
    console.warn(`[INIT] âš ï¸ GEMINI_API_KEY is missing in environment!`);
}
