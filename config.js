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
