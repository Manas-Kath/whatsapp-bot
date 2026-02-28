const axios = require('axios');

// STATIC IP set in extension.yaml
const DEVICE_IP = "192.168.1.50"; 
const DEVICE_URL = `http://${DEVICE_IP}`;

const Hardware = {
    toggle: async (id, state) => {
        try {
            const action = (state.toLowerCase() === 'on') ? 'turn_on' : 'turn_off';
            // Web Server v3 expects the action as part of the POST body or a specific endpoint
            // Let's use the most reliable endpoint structure for v3
            await axios.post(`${DEVICE_URL}/switch/relay_${id}/${action}`);
            return `✅ Relay ${id} turned ${state.toUpperCase()}`;
        } catch (error) {
            console.error(`[HARDWARE ERROR] Failed to toggle relay ${id}:`, error.message);
            // If the /turn_on fails, let's try the simple /toggle endpoint as a fallback
            try {
                await axios.post(`${DEVICE_URL}/switch/relay_${id}/toggle`);
                return `✅ Relay ${id} toggled (Fallback used)`;
            } catch (fallbackError) {
                throw new Error(`Failed to control Relay ${id} at ${DEVICE_IP}`);
            }
        }
    },
    
    getStatus: async () => {
        try {
            // Web Server v3 status is best fetched from the /sensor endpoints
            const temp = await axios.get(`${DEVICE_URL}/sensor/room_temperature`);
            const humi = await axios.get(`${DEVICE_URL}/sensor/room_humidity`);
            const signal = await axios.get(`${DEVICE_URL}/sensor/wifi_signal`);
            const uptime = await axios.get(`${DEVICE_URL}/sensor/uptime`);

            return `🏠 *Bunty Home Status*
🌡️ *Temp:* ${temp.data.value.toFixed(1)}°C
💧 *Humidity:* ${humi.data.value.toFixed(1)}%
📶 *Signal:* ${signal.data.value.toFixed(0)} dBm
⏱️ *Uptime:* ${(uptime.data.value / 3600).toFixed(1)} hours`;
        } catch (error) {
            console.error(`[HARDWARE ERROR] Failed to fetch status from ${DEVICE_IP}:`, error.message);
            throw new Error("Hardware is offline.");
        }
    }
};

module.exports = Hardware;
