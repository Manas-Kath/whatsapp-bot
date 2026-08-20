# Bunty v5.6 - Debian Home Server Dockerfile
FROM node:20-alpine

# Install ffmpeg for voice note & sticker conversion
RUN apk add --no-cache ffmpeg python3 make g++

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install production dependencies
RUN npm install --only=production --ignore-scripts

# Copy source code
COPY index.js config.js ./
COPY lib/ ./lib/
COPY commands/ ./commands/
COPY assets/ ./assets/

# Default environment variables
ENV NODE_ENV=production

# Run with garbage collection enabled and 256MB max memory
CMD ["node", "--expose-gc", "--max-old-space-size=256", "index.js"]
