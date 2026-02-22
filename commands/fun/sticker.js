const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const os = require('os');
const safety = require('../../lib/safety');

module.exports = {
    name: "sticker",
    alias: ["s", "stiker"],
    desc: "Convert image or video to sticker (Termux Optimized)",
    category: "fun",
    run: async ({ sock, jid, msg, quoted, sender, isSuperAdmin }) => {
        // 🛡️ MEDIA RATE LIMIT (Skip for SuperAdmin)
        if (!isSuperAdmin) {
            const limit = safety.checkMediaLimit(sender, 'sticker');
            if (!limit.allowed) {
                return sock.sendMessage(jid, { text: `(ಠ_ಠ) *Chill!* Wait ${limit.timeLeft}s before making another sticker.` });
            }
        }

        const targetMsg = (msg.message?.imageMessage || msg.message?.videoMessage) ? msg : quoted;
        
        if (!targetMsg || (!targetMsg.message?.imageMessage && !targetMsg.message?.videoMessage)) {
            return sock.sendMessage(jid, { text: "⚠️ *Missing Media:* Reply to an image or short video with `.sticker`" });
        }

        const isVideo = !!targetMsg.message.videoMessage;
        const tempDir = os.tmpdir();
        const inputPath = path.join(tempDir, `input_${Date.now()}`);
        const outputPath = path.join(tempDir, `output_${Date.now()}.webp`);

        try {
            await sock.sendMessage(jid, { text: "⌛ *Processing your sticker...*" });

            // 1. Download Media
            const buffer = await downloadMediaMessage(targetMsg, 'buffer', {});
            fs.writeFileSync(inputPath, buffer);

            // 2. CONVERT USING FFMPEG (Works natively in Termux)
            await new Promise((resolve, reject) => {
                let ff = ffmpeg(inputPath);
                
                if (isVideo) {
                    ff.inputOptions(['-t 10']); // Max 10 seconds for video
                }

                ff.outputOptions([
                    "-vcodec", "libwebp",
                    "-vf", "scale='if(gt(iw,ih),512,-1)':'if(gt(iw,ih),-1,512)',fps=15,pad=512:512:(512-iw)/2:(512-ih)/2:color=#00000000",
                    "-lossless", "0",
                    "-compression_level", "4",
                    "-q:v", "50",
                    "-loop", "0",
                    "-preset", "default",
                    "-an",
                    "-vsync", "0"
                ])
                .toFormat('webp')
                .on('end', resolve)
                .on('error', reject)
                .save(outputPath);
            });

            // 3. Send Sticker
            const stickerBuffer = fs.readFileSync(outputPath);
            await sock.sendMessage(jid, { sticker: stickerBuffer }, { quoted: msg });

        } catch (err) {
            console.error("Sticker Error:", err);
            await sock.sendMessage(jid, { text: `❌ *Error:* Failed to create sticker. Make sure 'ffmpeg' is installed (pkg install ffmpeg).` });
        } finally {
            // Cleanup (Survive the crash)
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        }
    }
};
