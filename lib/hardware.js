const axios = require('axios');

const DEVICE_IP = "192.168.1.50"; 
const DEVICE_URL = `http://${DEVICE_IP}`;

const Hardware = {
    toggle: async (id, state) => {
        try {
            const action = (state.toLowerCase() === 'on') ? 'turn_on' : 'turn_off';
            await axios.post(`${DEVICE_URL}/switch/relay_${id}/${action}`, "", {
                headers: { 'Content-Length': '0' }
            });
            return true;
        } catch (error) {
            return false;
        }
    },

    toggleMultiple: async (ids, state) => {
        const results = [];
        for (const id of ids) {
            const success = await Hardware.toggle(id, state);
            results.push({ id, success });
            await new Promise(r => setTimeout(r, 250));
        }
        return results;
    },
    
    getStatus: async () => {
        try {
            // Optimized: Fetch ALL states in one single JSON request
            const { data } = await axios.get(`${DEVICE_URL}/states`);
            
            const find = (id) => data.find(s => s.id.endsWith(id)) || { value: 0, state: "N/A" };
            
            const temp = find("room_temp");
            const humi = find("room_humi");
            const signal = find("wifi_signal");
            const uptime = find("uptime");
            const intTemp = find("internal_temp");

            return `🏠 *Bunty Home Central*
🌡️ *Temp:* ${parseFloat(temp.value).toFixed(1)}°C
💧 *Humidity:* ${humi.value}%
📶 *WiFi:* ${signal.value} dBm
⏱️ *Uptime:* ${(uptime.value / 3600).toFixed(1)} hours
🔥 *Core:* ${parseFloat(intTemp.value).toFixed(1)}°C`;
        } catch (error) {
            throw new Error("Hardware Offline");
        }
    }
};

module.exports = Hardware;
