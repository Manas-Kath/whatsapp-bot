const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, jidNormalizedUser } = require('@whiskeysockets/baileys');
const pino = require('pino');

async function startDebug() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();

    console.log("🕵️ STARTING DEBUGGER...");
    console.log("Instructions: Reply to a message or Tag the bot to see the RAW EVENT data.");

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'silent' }),
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        if (update.connection === 'open') {
            console.log("✅ Connected! Waiting for events...");
            console.log(`🤖 Bot JID appears to be: ${jidNormalizedUser(sock.user.id)}`);
        }
    });

    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if (!msg.message || m.type !== 'notify') return;
        if (msg.key.fromMe) return; // Ignore self

        console.log("\n" + "=".repeat(50));
        console.log("📨 NEW MESSAGE DETECTED");
        console.log("=".repeat(50));

        // 1. Inspect the Raw Structure
        console.log(JSON.stringify(msg, null, 2));

        console.log("-".repeat(50));

        // 2. Test the Logic used in index.js
        const botId = jidNormalizedUser(sock.user.id);
        
        // Check Context Info (Reply)
        const context = msg.message.extendedTextMessage?.contextInfo;
        const replyParticipant = context?.participant;
        
        console.log("🔍 DEBUG CHECKS:");
        console.log(`👉 Bot ID:       ${botId}`);
        console.log(`👉 Msg Type:     ${Object.keys(msg.message)[0]}`);
        console.log(`👉 Reply From:   ${replyParticipant || "None"}`);
        
        if (replyParticipant) {
            console.log(`👉 Norm Reply:   ${jidNormalizedUser(replyParticipant)}`);
            console.log(`👉 Match?        ${jidNormalizedUser(replyParticipant) === botId}`);
        }

        // Check Mentions
        const mentions = context?.mentionedJid || [];
        console.log(`👉 Mentions:     ${mentions}`);
        console.log(`👉 Mentioned?    ${mentions.some(id => jidNormalizedUser(id) === botId)}`);

        console.log("=".repeat(50) + "\n");
    });
}

startDebug();
