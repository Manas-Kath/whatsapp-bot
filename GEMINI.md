# GEMINI.md - Bunty v5.9.2

## Project Overview

**Bunty v5.9.2** is a high-performance WhatsApp bot designed for stability and resource efficiency. It is hosted on an **Intel Core 2 Duo** home server (Debian 12 / Docker / Portainer) with backward compatibility for **Samsung J7 (Termux)**, and integrates with **Google Gemini AI** and **ESPHome IoT Hardware**.

### Key Architecture
- **Messaging Engine:** Baileys (Multi-device protocol).
- **AI Integration:** Google Gemini (Text, Audio, Image, Mentions).
- **IoT Integration:** MQTT via Local Mosquitto Broker.
- **Group Moderation:** Per-group Anti-Link 2-strike automated enforcement.
- **Bulk Group Add:** `commands/admin/groupadd.js` (UI) -> `lib/groupadd.js` (engine, DI, no Baileys import) -> `lib/contacts.js` (parsing). Per-group resumable queue lives in `database.json` (`groups[jid].groupaddQueue`).
- **Style A Aesthetic:** Minimalistic, emoticon-based responses `(¬_¬) [ CATEGORY ]`.

---

## Hardware Control (MQTT)
The bot interacts with the **Bunty Smart Hub** (ESP32) via MQTT topics:
- `room/relay/[1-5]`: Toggles power relays (Phone, Lamp, Fan, etc).
- `room/sensor/temperature`: Monitors room temp.
- `room/sensor/humidity`: Monitors room humidity.

**Key File:** `lib/hardware.js` handles the persistent MQTT connection and state caching.

---

## Deployment & Performance
- **Debian Home Server (Docker):** Resource capped at 384MB memory limit via `docker-compose.yml` with persistent volumes for `auth_info` & `database.json`.
- **Termux (J7 Legacy):** PM2 limits the process to **120MB RSS** with `--max-old-space-size=120`.
- **Garbage Collection:** Manual `global.gc()` triggered when memory > 200MB.
- **Safe Mode:** Detects crash loops and disables heavy features (AI) automatically.

### Running the Bot

**On Debian Server (Docker):**
```bash
docker compose up -d
```

**On Termux / J7 (Legacy):**
```bash
pm2 start index.js --name Bunty --node-args="--expose-gc --max-old-space-size=120"
```

---

## Development Conventions
1. **CommonJS:** Use `require()`.
2. **Command Pattern:** Commands are objects in `commands/` subfolders.
3. **Style A:** All responses must follow the `(¬_¬) [ CATEGORY ]` format.
4. **Safety:** Use `lib/safety.js` for memory health and crash loop checks.
5. **Versioning:** The version lives only in `package.json` (exposed as `config.version`); never hardcode it in strings. Release commits are named `vX.Y.Z, short-tag`.
6. **Testable engines:** Put bulk/WhatsApp logic in `lib/` taking `sock` as a parameter and cover it with a mock-socket test (see `test-groupadd.js`).

---

## Operational Notes (learned in production)
- **Bulk adds are risky:** WhatsApp rate-limits and can restrict a number (`account_reachout_restricted`) for mass adds/cold DMs. Defaults are deliberately slow (30 per run, 8-15s delays, 5 per add request). On a rate-limit error the engine stops and queues the rest; never loop retries.
- **Invite fallback:** refused adds (`403`/`408`) get a native `groupInvite` card if WhatsApp returned an `add_request` code, otherwise a text DM with the group link.
- **401 / logged out:** `auth_info` is a Docker bind mount, so recovery means clearing its contents (`sudo rm -rf auth_info/*`), restarting and re-scanning the QR, then `.safety reset`. See GUIDE.md section 5.
- **Docker image bakes the code:** after changing files, rebuild with `docker compose up -d --build`.
