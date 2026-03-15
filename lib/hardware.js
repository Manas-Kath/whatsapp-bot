const mqtt = require('mqtt');

// Broker is on the Core Home Server (Tailscale/Local IP)
const BROKER_URL = "mqtt://127.0.0.1";
const client = mqtt.connect(BROKER_URL);

// State cache
const state = {
    temp: "N/A",
    humi: "N/A",
    relays: { 1: "0", 2: "0", 3: "0", 4: "0", 5: "0" },
    lastSeen: 0
};

client.on('connect', () => {
    client.subscribe("room/sensor/#");
    client.subscribe("room/relay/#");
});

client.on('message', (topic, message) => {
    const payload = message.toString();
    state.lastSeen = Date.now();

    if (topic === "room/sensor/temperature") state.temp = payload;
    if (topic === "room/sensor/humidity") state.humi = payload;
    
    if (topic.startsWith("room/relay/")) {
        const id = topic.split('/').pop();
        state.relays[id] = payload;
    }
});

const Hardware = {
    toggle: (id, targetState) => {
        return new Promise((resolve) => {
            const payload = targetState.toLowerCase() === 'on' ? '1' : '0';
            client.publish(`room/relay/${id}`, payload, { retain: true }, (err) => {
                if (err) resolve(false);
                else {
                    state.relays[id] = payload; 
                    resolve(true);
                }
            });
        });
    },

    toggleMultiple: async (ids, targetState) => {
        const results = [];
        for (const id of ids) {
            const success = await Hardware.toggle(id, targetState);
            results.push({ id, success });
        }
        return results;
    },

    getStatus: async () => {
        const diff = Date.now() - state.lastSeen;
        const isOffline = diff > 60000; 
        
        const relayIcon = (id) => state.relays[id] === "1" ? "[ ON ]" : "[ OFF ]";

        return `(¬_¬) [ HARDWARE ]\n\n` +
               `  • Temperature: ${state.temp}°C\n` +
               `  • Humidity: ${state.humi}%\n\n` +
               `*RELAYS*\n` +
               `  • 1. Charger : ${relayIcon(1)}\n` +
               `  • 2. Lamp    : ${relayIcon(2)}\n` +
               `  • 3. Outlet  : ${relayIcon(3)}\n` +
               `  • 4. Desk    : ${relayIcon(4)}\n` +
               `  • 5. Fan     : ${relayIcon(5)}\n\n` +
               `( ._.) ${isOffline ? 'Status: OFFLINE' : 'Status: ONLINE'}`;
    }
};

module.exports = Hardware;
