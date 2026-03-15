# GEMINI.md - Bunty v5.6

## Project Overview

**Bunty v5.6** is a high-performance WhatsApp bot designed for stability and resource efficiency. It is hosted on an **Intel Core 2 Duo** home server (Debian 12) and integrates with **Gemini 2.0 Flash** and **ESPHome IoT Hardware**.

### Key Architecture
- **Messaging Engine:** Baileys (Multi-device protocol).
- **AI Integration:** Gemini 2.0 Flash (Text, Audio, Image).
- **IoT Integration:** MQTT via Local Mosquitto Broker.
- **Style A Aesthetic:** Minimalistic, emoticon-based responses (¬_¬).

---

## Hardware Control (MQTT)
The bot interacts with the **Bunty Smart Hub** (ESP32) via MQTT topics:
- `room/relay/[1-5]`: Toggles power relays (Phone, Lamp, Fan, etc).
- `room/sensor/temperature`: Monitors room temp.
- `room/sensor/humidity`: Monitors room humidity.

**Key File:** `lib/hardware.js` handles the persistent MQTT connection and state caching.

---

## Deployment & Performance
- **RAM Caging:** PM2 limits the process to **120MB RSS**.
- **Garbage Collection:** Manual `global.gc()` triggered when memory > 100MB.
- **Safe Mode:** Detects crash loops and disables heavy features (AI) automatically.

### Running the Bot
```bash
pm2 start index.js --name Bunty --node-args="--expose-gc --max-old-space-size=120"
```

---

## Development Conventions
1. **CommonJS:** Use `require()`.
2. **Command Pattern:** Commands are objects in `commands/` subfolders.
3. **Style A:** All responses must follow the `(¬_¬) [ CATEGORY ]` format.
4. **Safety:** Use `lib/safety.js` for memory health and crash loop checks.
