const axios = require('axios');

// STATIC IP set in extension.yaml
const DEVICE_IP = "192.168.1.50"; 
const DEVICE_URL = `http://${DEVICE_IP}`;

const Hardware = {
    // Control a single relay
    toggle: async (id, state) => {
        try {
            const action = (state.toLowerCase() === 'on') ? 'turn_on' : 'turn_off';
            await axios.post(`${DEVICE_URL}/switch/relay_${id}/${action}`, "", {
                headers: { 'Content-Length': '0' }
            });
            return true;
        } catch (error) {
            console.error(`[HARDWARE ERROR] Single toggle failed for relay ${id}:`, error.message);
            return false;
        }
    },

    // Control multiple relays (all or specific list)
    toggleMultiple: async (ids, state) => {
        const results = [];
        for (const id of ids) {
            const success = await Hardware.toggle(id, state);
            results.push({ id, success });
            // Small delay to prevent overwhelming the ESP32 web server
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        return results;
    },
    
    getStatus: async () => {
        try {
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
            console.error(`[HARDWARE ERROR] Status fetch failed:`, error.message);
            throw new Error("Hardware is offline.");
        }
    }
};

module.exports = Hardware;
