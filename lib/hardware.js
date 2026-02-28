const axios = require('axios');

const DEVICE_IP = "192.168.1.50"; 
const DEVICE_URL = `http://${DEVICE_IP}`;

const Hardware = {
    toggle: async (id, state) => {
        try {
            const action = (state.toLowerCase() === 'on') ? 'turn_on' : 'turn_off';
            await axios.post(`${DEVICE_URL}/switch/relay_${id}/${action}`, "", {
                headers: { 'Content-Length': '0' },
                timeout: 5000
            });
            return true;
        } catch (error) {
            console.error(`[HARDWARE] Toggle Error:`, error.message);
            return false;
        }
    },

    toggleMultiple: async (ids, state) => {
        const results = [];
        for (const id of ids) {
            const success = await Hardware.toggle(id, state);
            results.push({ id, success });
            await new Promise(r => setTimeout(r, 300));
        }
        return results;
    },
    
    getStatus: async () => {
        try {
            // Try optimized batch fetch first
            try {
                const { data } = await axios.get(`${DEVICE_URL}/states`, { timeout: 4000 });
                const find = (id) => data.find(s => s.id && s.id.includes(id)) || { value: "0", state: "N/A" };
                
                const temp = find("room_temp");
                const humi = find("room_humi");
                const signal = find("wifi_signal");
                const uptime = find("uptime");
                const intTemp = find("internal_temp");

                return `🏠 *Bunty Home Central*
🌡️ *Temp:* ${parseFloat(temp.value || 0).toFixed(1)}°C
💧 *Humidity:* ${humi.value || 0}%
📶 *WiFi:* ${signal.value || 0} dBm
⏱️ *Uptime:* ${((uptime.value || 0) / 3600).toFixed(1)} hours
🔥 *Core:* ${parseFloat(intTemp.value || 0).toFixed(1)}°C`;
            } catch (batchError) {
                // FALLBACK: Fetch individual sensors if /states fails
                console.log("[HARDWARE] Batch status failed, using fallback...");
                const [temp, humi] = await Promise.all([
                    axios.get(`${DEVICE_URL}/sensor/room_temp`, { timeout: 3000 }),
                    axios.get(`${DEVICE_URL}/sensor/room_humi`, { timeout: 3000 })
                ]);

                return `🏠 *Bunty Home Status (Fallback)*
🌡️ *Temp:* ${temp.data.value.toFixed(1)}°C
💧 *Humidity:* ${humi.data.value.toFixed(0)}%
✅ Device is reachable.`;
            }
        } catch (error) {
            console.error(`[HARDWARE] Status Error:`, error.message);
            throw new Error("Hardware Offline or Unreachable");
        }
    }
};

module.exports = Hardware;
