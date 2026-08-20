# Bunty v5.6 Migration Guide: Samsung J7 -> Debian Home Server (Docker / Portainer / CasaOS) 🚀

This guide explains how to migrate **Bunty v5.6** from your Samsung J7 (Termux) to your Debian home server running Docker, Portainer, CasaOS, and Immich.

---

## 🎯 Why Migrate?
- **No More RAM Starvation:** Goodbye to J7's strict 120MB memory limit crashes.
- **24/7 Stability:** Docker container automatically restarts if anything goes wrong (`restart: unless-stopped`).
- **Seamless Portainer & CasaOS Management:** Manage logs, container status, and environment variables visually.
- **Resource Caging:** Container is capped at ~384MB RAM, leaving plenty of system resources for Immich, Mosquitto, and CasaOS.

---

## 📦 Migration Options

### Option A: Quick CLI Test Deployment (Recommended for First Test)

1. **SSH into your Debian Server**:
   ```bash
   ssh user@your-debian-ip
   ```

2. **Run the Automated Deploy Script**:
   ```bash
   mkdir -p ~/bunty-bot && cd ~/bunty-bot
   curl -sSL https://raw.githubusercontent.com/Manas-Kath/whatsapp-bot/main/docker/deploy-debian.sh | bash
   ```
   *Or clone the repository and run:*
   ```bash
   git clone https://github.com/Manas-Kath/whatsapp-bot.git bunty-bot
   cd bunty-bot
   bash docker/deploy-debian.sh
   ```

3. **Configure your `.env`**:
   ```bash
   nano .env
   ```
   Add your `GEMINI_API_KEY`, `SUPER_ADMIN_IDS`, and `MQTT_BROKER_URL`.

4. **Start Container & View QR Code**:
   ```bash
   docker compose up -d
   docker logs -f bunty-bot
   ```

---

### Option B: Portainer Stack Deployment

1. Open **Portainer** web interface (`http://your-debian-ip:9000` or `9443`).
2. Go to **Stacks** -> **Add Stack**.
3. Name: `bunty-bot`.
4. Choose **Web editor** and paste the contents of `docker/portainer-stack.yml`:
   ```yaml
   version: '3.8'

   services:
     bunty:
       build:
         context: https://github.com/Manas-Kath/whatsapp-bot.git#main
         dockerfile: Dockerfile
       container_name: bunty-bot
       restart: unless-stopped
       tty: true
       stdin_open: true
       environment:
         - NODE_ENV=production
         - GEMINI_API_KEY=your_gemini_key_here
         - BOT_PREFIX=.
         - SUPER_ADMIN_IDS=27441082949745@lid
         - MQTT_BROKER_URL=mqtt://192.168.1.90:1883
       volumes:
         - /DATA/AppData/bunty/auth_info:/app/auth_info
         - /DATA/AppData/bunty/database.json:/app/database.json
       deploy:
         resources:
           limits:
             memory: 384M
   ```
5. Click **Deploy the stack**.
6. Click on the `bunty-bot` container and check **Logs** to view the QR Code or startup status.

---

### Option C: CasaOS Custom App

1. Open **CasaOS Dashboard** (`http://your-debian-ip`).
2. Click **+** (Install custom app) -> **Import** (top right corner).
3. Paste the contents of `docker-compose.yml` or `docker/portainer-stack.yml`.
4. Set App Name to `Bunty Bot` and click **Install**.

---

## 🔄 Transferring Existing Auth Session from Samsung J7 (No Re-Scan Needed!)

If you want to transfer your existing WhatsApp session so you **don't** need to scan the QR code again:

1. **On your Samsung J7 (Termux)**, compress the session folder and database:
   ```bash
   cd ~/bunty-data || cd ~/thebuntyproject
   tar -czvf bunty-session.tar.gz auth_info database.json
   ```

2. **Copy `bunty-session.tar.gz` to your Debian Server**:
   ```bash
   scp bunty-session.tar.gz user@your-debian-ip:~/bunty-bot/
   ```

3. **Extract on Debian Server**:
   ```bash
   cd ~/bunty-bot
   tar -xzvf bunty-session.tar.gz
   ```

4. **Restart Docker Container**:
   ```bash
   docker compose restart
   ```
   Bunty will connect instantly without asking for QR scan!

---

## 🛠️ Verification & Maintenance

- **View Logs**: `docker logs -f bunty-bot`
- **Check RAM Usage**: `docker stats bunty-bot`
- **Restart Container**: `docker compose restart`
- **Update to Latest Code**:
  ```bash
  git pull
  docker compose build --no-cache
  docker compose up -d
  ```
