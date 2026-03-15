const mqtt = require('mqtt');

// Bunty (J7) connects to Mi Pad Mocha (Custom room/ structure)
const BROKER_URL = "mqtt://192.168.1.90:1883"; 
const client = mqtt.connect(BROKER_URL);

const state = {
    temp: "N/A",
    humi: "N/A",
    relays: { 1: "0", 2: "0", 3: "0", 4: "0", 5: "0" },
    lastSeen: 0
};

client.on('connect', () => {
    // Subscribing to the unified room tree
    client.subscribe("room/#");
});

client.on('message', (topic, message) => {
    const payload = message.toString();
    state.lastSeen = Date.now();

    // Map ESPHome topics to Bot state
    if (topic === "room/sensor/temp/state") state.temp = payload;
    if (topic === "room/sensor/humi/state") state.humi = payload;
    
    if (topic.includes("room/switch/relay_")) {
        const id = topic.match(/relay_(\d)/)[1];
        state.relays[id] = (payload === "ON") ? "1" : "0";
    }
});

const Hardware = {
    toggle: (id, targetState) => {
        return new Promise((resolve) => {
            const payload = targetState.toLowerCase() === 'on' ? 'ON' : 'OFF';
            const topic = `room/switch/relay_${id}/command`;
            
            client.publish(topic, payload, { retain: true }, (err) => {
                if (err) resolve(false);
                else {
                    state.relays[id] = (payload === 'ON') ? '1' : '0';
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
        const rIcon = (id) => state.relays[id] === "1" ? "[ ON ]" : "[ OFF ]";

        return `(¬_¬) [ HARDWARE ]\n\n` +
               `  • Temperature: ${state.temp} C\n` +
               `  • Humidity: ${state.humi} %\n\n` +
               `*RELAYS*\n` +
               `  • 1. Charger : ${rIcon(1)}\n` +
               `  • 2. Lamp    : ${rIcon(2)}\n` +
               `  • 3. Outlet  : ${rIcon(3)}\n` +
               `  • 4. Desk    : ${rIcon(4)}\n` +
               `  • 5. Fan     : ${rIcon(5)}\n\n` +
               `( ._.) Status: ${isOffline ? 'OFFLINE' : 'ONLINE'}`;
    }
};

module.exports = Hardware;
