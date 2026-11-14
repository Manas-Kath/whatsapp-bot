# Bunty - Debian Home Server Dockerfile
FROM node:22-alpine

# Install ffmpeg for voice note & sticker conversion
RUN apk add --no-cache ffmpeg python3 make g++

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install production dependencies
RUN npm install --only=production --ignore-scripts
RUN npm rebuild better-sqlite3

# Copy source code
COPY index.js config.js ./
COPY lib/ ./lib/
COPY commands/ ./commands/
COPY assets/ ./assets/

# Default environment variables
ENV NODE_ENV=production
ENV TZ=Asia/Kolkata

# Run with garbage collection enabled and 256MB max memory
CMD ["node", "--expose-gc", "--max-old-space-size=256", "index.js"]
