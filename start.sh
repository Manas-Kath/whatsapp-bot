#!/bin/bash
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Initializing Bunty Auto-Restarter...${NC}"

while true
do
    echo -e "${GREEN}⚡ Starting Bunty...${NC}"
    node index.js
    echo "❌ Bunty crashed. Respawning in 3 seconds..."
    sleep 3
done