const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion, 
    DisconnectReason, 
    jidNormalizedUser,
    Browsers
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const NodeCache = require('node-cache'); 
const db = require('./lib/database');
const { loadCommands, handleCommand } = require('./lib/handler');
const config = require('./config');
const safety = require('./lib/safety');

// RAM CACHE for anti-delete and performance
const msgCache = new NodeCache({ stdTTL: 3600, checkperiod: 600, maxKeys: 1000 });
const msgRetryCounterCache = new NodeCache();
const metadataCache = new NodeCache({ stdTTL: 300, checkperiod: 60 }); 

// GLOBAL ERROR HANDLING
process.on('uncaughtException', (err) => {
    console.error('CRITICAL ERROR:', err);
    safety.logError(err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    safety.logError(reason);
});

async function startBunty() {
    // 🛡️ SAFETY CHECK: Crash Loop & Safe Mode
    const isSafeMode = safety.checkCrashLoop();
    if (isSafeMode) {
        console.log("🛑 SAFE MODE ACTIVE. Minimal features loaded.");
    }

    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    // Always fetch the latest version to avoid decryption lag
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`🔥 Bunty v5.5 - WA v${version.join('.')}${isLatest ? ' (Latest)' : ' (Outdated)'}`);

    loadCommands(); 

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: Browsers.macOS('Desktop'),
        syncFullHistory: false, 
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: false,
        msgRetryCounterCache,
        retryRequestDelayMs: 5000,
        defaultQueryTimeoutMs: undefined
    });

    sock.ev.on('creds.update', saveCreds);
    
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) qrcode.generate(qr, { small: true });
        
        if (connection === 'close') {
            const reason = (lastDisconnect.error)?.output?.statusCode;
            console.log(`(・_°；) Connection Closed. Reason: ${reason}`);

            const shouldReconnect = (reason !== DisconnectReason.loggedOut);
            
            if (shouldReconnect) {
                const delay = (reason === 408) ? 10000 : 5000; 
                console.log(`(ง •_•)ง Reconnecting in ${delay/1000}s...`);
                setTimeout(() => startBunty(), delay);
            } else {
                console.log("(╯°□°）╯︵ ┻━┻ Logged out. AUTO-FIX: Wiping auth_info and restarting for new QR...");
                try {
                    // Try to clear the directory recursively
                    if (fs.existsSync('auth_info')) {
                        fs.rmSync('auth_info', { recursive: true, force: true });
                    }
                } catch (e) {
                    console.log("❌ Auto-fix failed. Manually run: rm -rf auth_info");
                }
                process.exit(1); 
            }
        } else if (connection === 'open') {
            console.log('＼(≧▽≦)／ Connected! Bunty is ready.');
            if (isSafeMode) {
                const adminJid = config.superAdminIds[0];
                if (adminJid) await sock.sendMessage(adminJid, { text: "⚠️ *Safe Mode Active!*\nI've crashed too many times recently. Use `.safety reset` to clear." });
            }
        }
    });

    // --- HEALTH WATCHDOG ---
    setInterval(() => {
        const health = safety.getMemoryHealth();
        if (health.isStruggling) {
            console.log(`⚠️ HEALTH WARNING: RSS=${health.nodeUsageMB}MB, Free=${health.freePercent.toFixed(1)}%`);
        }
    }, 60000);

    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if (!msg.message || m.type !== 'notify') return;

        const key = msg.key;
        const jid = key.remoteJid;
        const sender = jidNormalizedUser(key.participant || jid);
        
        // AUTO READ
        if (db.data.settings.auto_read) {
            await sock.readMessages([key]);
        }
        
        // Cache messages for anti-delete
        msgCache.set(key.id, msg);

        // Anti-Delete Logic
        if (db.data.settings.anti_delete && msg.message.protocolMessage?.type === 0) {
            const deletedKeyId = msg.message.protocolMessage.key.id;
            const oldMsg = msgCache.get(deletedKeyId);
            if (oldMsg) {
                if (db.isHardBanned(sender)) return;
                const content = oldMsg.message.conversation || oldMsg.message.extendedTextMessage?.text || "[Media]";
                const victim = jidNormalizedUser(oldMsg.key.participant || oldMsg.key.remoteJid);
                const adminJid = config.superAdminIds[0];
                if (adminJid) {
                    const report = `🗑️ *Deleted Message*\n👤 @${victim.split('@')[0]}\n📝 ${content}`;
                    await sock.sendMessage(adminJid, { text: report, mentions: [victim] });
                }
            }
            return;
        }

        // Hard Ban Enforcer
        if (db.isHardBanned(sender) && jid.endsWith('@g.us')) {
            try { await sock.sendMessage(jid, { delete: key }); } catch (e) {}
            return;
        }

        // --- ROBUST TEXT EXTRACTION ---
        let mType = Object.keys(msg.message)[0];
        if (mType === 'ephemeralMessage' || mType === 'viewOnceMessage' || mType === 'viewOnceMessageV2') {
            msg.message = msg.message[mType].message;
            mType = Object.keys(msg.message)[0];
        }
        
        const body = mType === 'conversation' ? msg.message.conversation :
                     mType === 'extendedTextMessage' ? msg.message.extendedTextMessage.text :
                     mType === 'imageMessage' ? msg.message.imageMessage.caption :
                     mType === 'videoMessage' ? msg.message.videoMessage.caption : '';

        const prefix = config.prefix.trim();
        const isCmd = (body || '').startsWith(prefix);
        const isSuperAdmin = config.superAdminIds.includes(sender);
        const isGroup = jid.endsWith('@g.us');

        if (!body && !isCmd) return;

        let isAdmin = false;
        if (isGroup && isCmd) {
            try {
                let meta = metadataCache.get(jid);
                if (!meta) {
                    meta = await sock.groupMetadata(jid);
                    metadataCache.set(jid, meta);
                }
                const participant = meta.participants.find(p => 
                    jidNormalizedUser(p.id) === sender || (p.lid && jidNormalizedUser(p.lid) === sender)
                );
                isAdmin = participant && (participant.admin === 'admin' || participant.admin === 'superadmin');
            } catch (e) {}
        }

        // --- ROBUST QUOTED MESSAGE EXTRACTION ---
        let quoted = null;
        const contextInfo = msg.message.extendedTextMessage?.contextInfo || 
                          msg.message[mType]?.contextInfo;
        
        if (contextInfo?.quotedMessage) {
            let qMsg = contextInfo.quotedMessage;
            let qType = Object.keys(qMsg)[0];
            if (qType === 'ephemeralMessage' || qType === 'viewOnceMessage' || qType === 'viewOnceMessageV2') {
                qMsg = qMsg[qType].message;
                qType = Object.keys(qMsg)[0];
            }
            quoted = {
                message: qMsg,
                key: {
                    remoteJid: jid,
                    fromMe: contextInfo.participant === jidNormalizedUser(sock.user.id),
                    id: contextInfo.stanzaId,
                    participant: contextInfo.participant
                }
            };
        }

        const ctx = { sock, msg, jid, sender, isGroup, body: (body || ''), isSuperAdmin, quoted, isAdmin };

        const ran = await handleCommand(ctx);

        // AI Logic
        if (!ran && db.data.settings.ai_enabled && !db.isBanned(sender)) {
            if (!safety.shouldEnableAI()) return;

            const botId = jidNormalizedUser(sock.user.id);
            const botLid = sock.user.lid ? jidNormalizedUser(sock.user.lid) : null;
            const mentions = contextInfo?.mentionedJid || [];
            const isMentioned = mentions.some(id => {
                const norm = jidNormalizedUser(id);
                return norm === botId || norm === botLid;
            });
            const replyParticipant = contextInfo?.participant ? jidNormalizedUser(contextInfo.participant) : null;
            const isReplyToBot = replyParticipant && (replyParticipant === botId || replyParticipant === botLid);

            if (isMentioned || isReplyToBot) {
                const aiCmd = require('./commands/ai/ask');
                let prompt = body;
                if (isMentioned) prompt = prompt.replace(/@\d+/g, '').trim();
                if (!prompt && ctx.quoted) {
                    const qType = Object.keys(ctx.quoted.message)[0];
                    prompt = ctx.quoted.message.conversation || ctx.quoted.message.extendedTextMessage?.text || 
                             ctx.quoted.message[qType]?.caption || "Explain this.";
                }
                if (!prompt) prompt = "Yo";
                await aiCmd.run({ ...ctx, text: prompt });
            }
        }
    });
}

startBunty();
