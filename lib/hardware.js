const axios = require('axios');

const DEVICE_URL = "http://power-extension.local";

const Hardware = {
    // Control Relays: relay_1 to relay_5
    toggle: async (id, state) => {
        try {
            const action = (state.toLowerCase() === 'on') ? 'turn_on' : 'turn_off';
            await axios.post(`${DEVICE_URL}/switch/relay_${id}/${action}`);
            return `✅ Relay ${id} turned ${state.toUpperCase()}`;
        } catch (error) {
            console.error(`[HARDWARE ERROR] Failed to toggle relay ${id}:`, error.message);
            throw new Error("Failed to communicate with the extension.");
        }
    },
    
    // Get Sensor Data
    getStatus: async () => {
        try {
            // ESPHome web server provides status at specific endpoints
            const temp = await axios.get(`${DEVICE_URL}/sensor/room_temperature`);
            const humi = await axios.get(`${DEVICE_URL}/sensor/room_humidity`);
            const signal = await axios.get(`${DEVICE_URL}/sensor/wifi_signal_strength`);
            const uptime = await axios.get(`${DEVICE_URL}/sensor/uptime`);

            return `🏠 *Bunty Home Status*
🌡️ *Temp:* ${temp.data.value.toFixed(1)}°C
💧 *Humidity:* ${humi.data.value.toFixed(1)}%
📶 *Signal:* ${signal.data.value.toFixed(0)} dBm
⏱️ *Uptime:* ${(uptime.data.value / 3600).toFixed(1)} hours`;
        } catch (error) {
            console.error(`[HARDWARE ERROR] Failed to fetch status:`, error.message);
            throw new Error("Hardware is offline or unreachable.");
        }
    }
};

module.exports = Hardware;
