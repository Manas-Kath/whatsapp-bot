module.exports = {
    name: "hidetag",
    alias: ["ht", "tot"],
    desc: "Tag everyone invisibly",
    adminOnly: true,
    run: async ({ sock, jid, isGroup, msg, text }) => {
        if (!isGroup) return;

        const meta = await sock.groupMetadata(jid);
        const participants = meta.participants.map(p => p.id);
        
        // If text exists, send that. If not, send a blank space.
        const msgText = text ? text : "@everyone";

        await sock.sendMessage(jid, { 
            text: msgText, 
            mentions: participants 
        }, { quoted: msg });
    }
};