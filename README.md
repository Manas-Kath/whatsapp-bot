# The Bunty Project (WhatsApp Bot) v5.6

A high-performance WhatsApp bot powered by Google Gemini 2.0 Flash AI and ESPHome IoT Integration. Designed for resource efficiency, system stability, and deployment flexibility across Debian Home Servers (Docker / Portainer / CasaOS) and legacy low-end hardware (Termux / Android).

---

## Technical Overview

- **AI Integration:** Google Gemini 2.0 Flash for multi-modal processing (text, voice note transcription, and image analysis) with short-term conversational context.
- **Hardware Control:** Built-in MQTT client interfacing with ESPHome Smart Hub relays and environment sensors.
- **System Stability:**
  - Automatic session cleanup on authentication invalidation.
  - Exponential backoff delay on network timeout events.
  - Safe Mode loop detection to prevent startup crash cycles.
- **Resource Management:** Capped memory footprint with manual garbage collection triggers for constrained environments.
- **Response Format:** Structured, minimalistic output following standard system categories.

---

## Deployment Architectures

### 1. Debian Home Server (Docker / Portainer / CasaOS)

#### Automated Script Deployment
```bash
git clone https://github.com/Manas-Kath/whatsapp-bot.git ~/bunty-bot
cd ~/bunty-bot
bash docker/deploy-debian.sh
```

#### Manual Docker Compose Setup
```bash
# 1. Copy environment template
cp docker/env.example .env

# 2. Configure credentials in .env
nano .env

# 3. Launch container
docker compose up -d

# 4. Inspect container logs and authentication QR code
docker logs -f bunty-bot
```

#### Portainer / CasaOS Stack
Import `docker/portainer-stack.yml` into the Portainer Stack Web Editor or CasaOS Custom App Manager.

For instructions on transferring existing session credentials without re-scanning QR codes, refer to `docker/MIGRATION_GUIDE.md`.

---

### 2. Termux (Samsung J7 Legacy Setup)

#### Setup Instructions
```bash
# 1. Clone repository and install dependencies
git clone https://github.com/Manas-Kath/whatsapp-bot.git thebuntyproject
cd thebuntyproject
npm install --ignore-scripts

# 2. Configure environment file
cat <<EOF > .env
GEMINI_API_KEY=your_gemini_api_key
BOT_NAME="Bunty v5.6"
BOT_PREFIX=.
SUPER_ADMIN_IDS=27441082949745@lid
MQTT_BROKER_URL=mqtt://192.168.1.90:1883
EOF

# 3. Start process via PM2 with memory limits
chmod +x deploy.sh
./deploy.sh
```

---

## Command Reference

| Category | Commands |
| :--- | :--- |
| **Admin** | `.ban`, `.unban`, `.hardban`, `.set`, `.publicity`, `.stats`, `.safety`, `.hidetag`, `.tagall` |
| **AI** | `.ask` (or direct mention / message reply) |
| **Utilities & Fun** | `.sticker`, `.roast`, `.spam` |
| **System** | `.help`, `.ping` |

---

## Documentation

- Technical Specification: [GUIDE.md](file:///D:/projects/my-ai-project/thebuntyproject/GUIDE.md)
- Docker Migration Guide: [docker/MIGRATION_GUIDE.md](file:///D:/projects/my-ai-project/thebuntyproject/docker/MIGRATION_GUIDE.md)
- Agent & System Rules: [GEMINI.md](file:///D:/projects/my-ai-project/thebuntyproject/GEMINI.md)
