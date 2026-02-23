const { GoogleGenerativeAI } = require("@google/generative-ai");
const config = require('../../config');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const NodeCache = require('node-cache');
const memory = require('../../lib/memory');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const os = require('os');

const cooldowns = new NodeCache({ stdTTL: 10 }); 

let genAI;
let model;

try {
    genAI = new GoogleGenerativeAI(config.geminiApiKey);

    model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash", 
        systemInstruction: `
            ROLE: You are Bunty v5.5, a witty Indian guy on WhatsApp.
            PERSONALITY: Casual, Hinglish, witty, and helpful.
            BUNTY RULES: 
            - Keep replies short (max 40 words).
            - If audio is provided, transcribe or summarize it creatively.
            - Use slang like 'vibe', 'scene', 'gazab'.
        `,
        generationConfig: {
            temperature: 1.0, 
            topP: 0.95,
            maxOutputTokens: 250,
        }
    });

    console.log("🔥 Bunty AI (2.0-Flash) Brain Initialized");
} catch (e) {
    console.error("AI Initialization Failed:", e);
}

module.exports = {
    name: "ask",
    alias: ["bunty", "ai"],
    desc: "Chat with Bunty (Supports Image & Voice Notes)",
    run: async ({ sock, jid, msg, text, quoted, sender, isSuperAdmin }) => {
        if (!model) return sock.sendMessage(jid, { text: "⚠️ Bunty is sleeping right now." });

        if (text === 'reset' || text === 'clear') {
            memory.del(jid);
            return sock.sendMessage(jid, { text: "🚮 *Memory Cleared.*" });
        }

        if (cooldowns.has(sender)) return;
        cooldowns.set(sender, true);

        let promptText = text;
        let mediaData = null;
        let mimeType = "";

        // --- MEDIA HANDLING ---
        const isImage = msg.message?.imageMessage || quoted?.message?.imageMessage;
        const isAudio = msg.message?.audioMessage || quoted?.message?.audioMessage;

        let tempIn = null;
        let tempOut = null;

        if (isImage || isAudio) {
            try {
                const targetMsg = (msg.message?.imageMessage || msg.message?.audioMessage) ? msg : quoted;
                const buffer = await downloadMediaMessage(targetMsg, 'buffer', {});
                
                if (isImage) {
                    mediaData = buffer.toString("base64");
                    mimeType = "image/jpeg";
                    if (!promptText) promptText = "Is photo pe comment maar.";
                } else if (isAudio) {
                    // Convert OGG/OPUS to MP3 for better Gemini compatibility
                    tempIn = path.join(os.tmpdir(), `ai_in_${Date.now()}.ogg`);
                    tempOut = path.join(os.tmpdir(), `ai_out_${Date.now()}.mp3`);
                    fs.writeFileSync(tempIn, buffer);

                    await new Promise((resolve, reject) => {
                        ffmpeg(tempIn)
                            .toFormat('mp3')
                            .on('end', resolve)
                            .on('error', reject)
                            .save(tempOut);
                    });

                    mediaData = fs.readFileSync(tempOut).toString("base64");
                    mimeType = "audio/mp3";
                    if (!promptText) promptText = "Is voice note mein kya hai? Transcribe and summarize it briefly in Bunty style.";
                }
            } catch (err) {
                console.error("Media processing failed:", err);
            } finally {
                // CLEANUP (Immediate)
                if (tempIn && fs.existsSync(tempIn)) fs.unlinkSync(tempIn);
                if (tempOut && fs.existsSync(tempOut)) fs.unlinkSync(tempOut);
            }
        }

        const statusContext = isSuperAdmin ? "[SYSTEM: BOSS user]" : "[SYSTEM: Regular user]";
        let history = memory.get(jid);

        try {
            let responseText = "";

            if (mediaData) {
                // Multi-modal call
                const result = await model.generateContent([
                    statusContext,
                    promptText || "Analyze this.",
                    { inlineData: { data: mediaData, mimeType } }
                ]);
                responseText = result.response.text();
            } else {
                // Chat history call
                const chat = model.startChat({ history });
                const result = await chat.sendMessage(`${statusContext}\n${promptText || "Yo"}`);
                responseText = result.response.text();

                history.push({ role: "user", parts: [{ text: promptText || "Yo" }] });
                history.push({ role: "model", parts: [{ text: responseText }] });
                memory.set(jid, history);
            }

            await sock.sendMessage(jid, { text: `(＾▽＾) ${cleanResponse(responseText)}` }, { quoted: msg });

        } catch (e) {
            console.error("Gemini Error:", e);
            let errorMsg = "(ノ﹏ヽ) Brain hang ho gaya mera. Phir se try kar?";
            if (isSuperAdmin && e.status === 400 && e.message.includes("API key not valid")) {
                errorMsg = `🚨 *SYSTEM ERROR: INVALID API KEY*\nCheck your .env on Termux. \`pm2 delete Bunty && pm2 start index.js --name Bunty\``;
            } else if (isSuperAdmin) {
                errorMsg = `❌ *AI Error:* ${e.message.substring(0, 100)}`;
            }
            await sock.sendMessage(jid, { text: errorMsg }, { quoted: msg });
        }
    }
};

function cleanResponse(text) {
    if (!text) return "";
    return text.replace(/\[SYSTEM:.*?\]/g, '').trim();
}
