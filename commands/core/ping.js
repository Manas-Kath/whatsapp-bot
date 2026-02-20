module.exports = {
    name: "ping",
    alias: ["speed", "test"],
    desc: "Check latency",
    run: async ({ sock, jid }) => {
        const start = Date.now();
        const msg = await sock.sendMessage(jid, { text: '(・_・;) . . .' });
        const latency = Date.now() - start;
        await sock.sendMessage(jid, { text: `＼(≧▽≦)／ Speed: ${latency}ms`, edit: msg.key });
    }
};
