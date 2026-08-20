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
let currentModelName = config.geminiModel || "gemini-3.1-flash-lite";

const SYSTEM_INSTRUCTION = `
    ROLE: You are Bunty v5.5, a witty Indian guy on WhatsApp.
    PERSONALITY: Casual, Hinglish, extremely concise.
    BUNTY RULES: 
    - Keep replies extremely short, direct, and conversational (max 20 words).
    - Talk like a real human on WhatsApp. Do not yap. No emoji-spam, no robotic excitement.
    - Avoid generic AI filler phrases (e.g., "Got it, boss!", "Save kar liya maine", "is officially in my system now", "Aur koi seva?"). Just be cool, dry, and direct.
    - If asked to remember something, reply with something brief like "Noted" or "Yaad rakhega".
`;

function createModelInstance(modelName) {
    if (!genAI || !config.geminiApiKey) return null;
    return genAI.getGenerativeModel({
        model: modelName, 
        systemInstruction: SYSTEM_INSTRUCTION,
        generationConfig: {
            temperature: 0.8, 
            topP: 0.9,
            maxOutputTokens: 80,
        }
    });
}

try {
    if (config.geminiApiKey) {
        genAI = new GoogleGenerativeAI(config.geminiApiKey);
        model = createModelInstance(currentModelName);
        console.log(`🔥 Bunty AI (${currentModelName}) Brain Initialized`);
    }
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

            const cleanedResponse = cleanResponse(responseText);
            const { text: finalText, mentions } = parseMentions(cleanedResponse);
            await sock.sendMessage(jid, { text: `(＾▽＾) ${finalText}`, mentions }, { quoted: msg });

        } catch (e) {
            console.error("Gemini Error:", e);

            // Dynamic model fallback on 404 (not found) or 429 (rate limit / quota exceeded)
            const isQuotaOrNotFound = e.status === 404 || e.status === 429 || 
                                      e.message?.includes('not found') || 
                                      e.message?.includes('no longer available') ||
                                      e.message?.includes('Quota exceeded') ||
                                      e.message?.includes('Too Many Requests');

            if (isQuotaOrNotFound) {
                // Fallback chain ordered by quota (RPD): 3.1-flash-lite (500) > 3.5-flash-lite (500) > 2.5-flash (20)
                const fallbackList = ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-2.5-flash", "gemini-2.0-flash-lite"];
                for (const fbModel of fallbackList) {
                    if (fbModel !== currentModelName) {
                        try {
                            console.log(`[AI FALLBACK] Quota/Model fail on ${currentModelName}. Retrying with: ${fbModel}`);
                            currentModelName = fbModel;
                            model = createModelInstance(fbModel);
                            if (!model) break;

                            let fbText = "";
                            if (mediaData) {
                                const result = await model.generateContent([
                                    statusContext,
                                    promptText || "Analyze this.",
                                    { inlineData: { data: mediaData, mimeType } }
                                ]);
                                fbText = result.response.text();
                            } else {
                                const chat = model.startChat({ history });
                                const result = await chat.sendMessage(`${statusContext}\n${promptText || "Yo"}`);
                                fbText = result.response.text();
                                history.push({ role: "user", parts: [{ text: promptText || "Yo" }] });
                                history.push({ role: "model", parts: [{ text: fbText }] });
                                memory.set(jid, history);
                            }
                            return sock.sendMessage(jid, { text: `(＾▽＾) ${cleanResponse(fbText)}` }, { quoted: msg });
                        } catch (fbErr) {
                            console.error(`Fallback ${fbModel} failed:`, fbErr.message);
                        }
                    }
                }
            }

            let errorMsg = "(ノ﹏ヽ) Brain hang ho gaya mera. Phir se try kar?";
            if (e.status === 429 || e.message?.includes("Quota exceeded")) {
                errorMsg = `⏳ *Quota Exceeded:* Gemini Free Tier limit reached for model (${currentModelName}). Please wait a minute or set \`GEMINI_MODEL=gemini-1.5-flash\` in your .env.`;
            } else if (isSuperAdmin && e.status === 400 && e.message.includes("API key not valid")) {
                errorMsg = `🚨 *SYSTEM ERROR: INVALID API KEY*\nCheck your .env file credentials.`;
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

function parseMentions(text) {
    const mentionRegex = /@(\d{5,20})/g;
    const mentions = [];
    let match;
    while ((match = mentionRegex.exec(text)) !== null) {
        const jidS = `${match[1]}@s.whatsapp.net`;
        const jidL = `${match[1]}@lid`;
        if (!mentions.includes(jidS)) mentions.push(jidS);
        if (!mentions.includes(jidL)) mentions.push(jidL);
    }
    return { text, mentions };
}
