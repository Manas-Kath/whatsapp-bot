# Bunty v5.6 Migration Guide: Samsung J7 to Debian Home Server

This document outlines the procedure to migrate Bunty v5.6 from a Samsung J7 (Termux) environment to a Debian home server operating Docker, Portainer, CasaOS, and related home server services.

---

## Migration Rationale

- **Memory Constraints:** Eliminates process crashes caused by the 120MB RSS memory limitation on Termux.
- **Process Isolation & Resilience:** Uses Docker container restart policies (`restart: unless-stopped`) to ensure 24/7 process uptime.
- **Management Interface:** Enables centralized container management via Portainer or CasaOS dashboards.
- **Resource Management:** Hard caps container memory allocation at 384MB, preserving system capacity for co-located services (such as Immich and Mosquitto).

---

## Migration Procedures

### Method 1: Automated Command-Line Deployment

1. Establish an SSH connection to your Debian host:
   ```bash
   ssh user@your-debian-ip
   ```

2. Execute the automated deployment script:
   ```bash
   git clone https://github.com/Manas-Kath/whatsapp-bot.git ~/bunty-bot
   cd ~/bunty-bot
   bash docker/deploy-debian.sh
   ```

3. Configure environment variables in `.env`:
   ```bash
   nano .env
   ```
   Define `GEMINI_API_KEY`, `SUPER_ADMIN_IDS`, and `MQTT_BROKER_URL`.

4. Build and initialize the service container:
   ```bash
   docker compose up -d
   docker logs -f bunty-bot
   ```

---

### Method 2: Portainer Stack Deployment

1. Access the Portainer management UI (`http://your-debian-ip:9000`).
2. Navigate to **Stacks** > **Add Stack**.
3. Name the stack: `bunty-bot`.
4. Copy and paste the configuration from `docker/portainer-stack.yml`:
   ```yaml
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
6. Inspect the `bunty-bot` container logs to complete authentication.

---

### Method 3: CasaOS Custom Application

1. Open the CasaOS dashboard (`http://your-debian-ip`).
2. Select **+ (Install custom app)** > **Import**.
3. Import `docker-compose.yml` or `docker/portainer-stack.yml`.
4. Name the application `Bunty Bot` and complete installation.

---

## Session Migration (Bypassing QR Authentication)

To migrate active authentication keys from the existing Termux environment without generating a new QR code:

1. On the Samsung J7 (Termux), archive session storage and persistent database:
   ```bash
   cd ~/bunty-data || cd ~/thebuntyproject
   tar -czvf bunty-session.tar.gz auth_info database.json
   ```

2. Securely copy the archive to the Debian host:
   ```bash
   scp bunty-session.tar.gz user@your-debian-ip:~/bunty-bot/
   ```

3. Extract the archive into the application directory on Debian:
   ```bash
   cd ~/bunty-bot
   tar -xzvf bunty-session.tar.gz
   ```

4. Restart the container to load restored credentials:
   ```bash
   docker compose restart
   ```

---

## Operation & Monitoring

- View container logs: `docker logs -f bunty-bot`
- Monitor resource consumption: `docker stats bunty-bot`
- Restart container service: `docker compose restart`
- Rebuild after code updates:
  ```bash
  git pull
  docker compose up -d --build
  ```
