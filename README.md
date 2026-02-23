# The Bunty Project (WhatsApp Bot) v5.6 🚀

A high-performance, **J7-Optimized** WhatsApp bot featuring Google's Gemini 2.0 Flash AI. Built for stability on low-end hardware (Termux/Rooted Android).

## Key Features
- **🧠 Gemini 2.0 AI:** Voice transcription, image analysis, and conversational memory.
- **🛡️ Bulletproof Stability:** 
  - **Auto-Fix:** Wipes corrupted sessions (401 error) automatically.
  - **Reconnection Delay:** Prevents 408 timeout loops.
  - **Safe Mode:** Detects crash loops and boots with minimal features.
- **⚡ J7 Optimization:**
  - **RAM Cage:** Locked to 120MB with manual Garbage Collection.
  - **Smart Caching:** Auto-clears metadata to save memory.
- **🎨 Style A Aesthetic:** Minimalistic emoticon-based responses.

## Installation (Termux)

1. **Clone & Setup:**
   ```bash
   git clone https://github.com/Manas-Kath/whatsapp-bot.git thebuntyproject
   cd thebuntyproject
   npm install
   ```

2. **Configure:**
   Create a `.env` file with your credentials:
   ```env
   GEMINI_API_KEY=your_key_here
   BOT_NAME="Bunty v5.6"
   BOT_PREFIX=.
   SUPER_ADMIN_IDS=919876543210@s.whatsapp.net
   ```

3. **Deploy:**
   ```bash
   chmod +x deploy.sh
   ./deploy.sh
   ```

## Commands
- **Admin:** `.ban`, `.unban`, `.set`, `.publicity`, `.stats`
- **AI:** `.ask`, `.reset` (or just mention/reply to bot)
- **Fun:** `.sticker`, `.roast`

## J7 Optimization Tips
- Run `pm2 start index.js --node-args="--max-old-space-size=120 --expose-gc"`
- Keep free RAM above 50MB for stability.
