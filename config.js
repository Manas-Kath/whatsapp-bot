require('dotenv').config();

module.exports = {
    version: require('./package.json').version,
    botName: process.env.BOT_NAME || `Bunty v${require('./package.json').version}`,
    superAdminIds: (process.env.SUPER_ADMIN_IDS || '27441082949745@lid').split(','),
    prefix: process.env.BOT_PREFIX || ".", 
    geminiApiKey: process.env.GEMINI_API_KEY, 
    geminiModel: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
    mqttBrokerUrl: process.env.MQTT_BROKER_URL || "mqtt://192.168.1.90:1883",
    limits: {
        spam: { max: 5, cooldown: 60000 },
        roast: { max: 10, cooldown: 30000 },
        groupadd: {
            max: parseInt(process.env.GROUPADD_MAX || '500', 10),          // numbers accepted per command
            addChunk: parseInt(process.env.GROUPADD_CHUNK || '5', 10),     // numbers per add request (1 = one request per number)
            batch: parseInt(process.env.GROUPADD_BATCH || '30', 10),       // numbers processed per run; rest is queued for .groupadd resume
            minDelay: parseInt(process.env.GROUPADD_MIN_DELAY || '8000', 10),
            maxDelay: parseInt(process.env.GROUPADD_MAX_DELAY || '15000', 10)
        }
    }
};

if (module.exports.geminiApiKey) {
    const k = module.exports.geminiApiKey;
    console.log(`[INIT] Gemini API Key Loaded: ${k.substring(0, 4)}...${k.substring(k.length - 4)} (${k.length} chars)`);
} else {
    console.warn(`[INIT] [WARNING] GEMINI_API_KEY is missing in environment.`);
}
