module.exports = {
    name: "tagall",
    alias: ["pingall", "everyone"],
    desc: "Tag everyone in the group",
    adminOnly: true,
    run: async ({ sock, jid, isGroup, msg }) => {
        if (!isGroup) return;
        
        const meta = await sock.groupMetadata(jid);
        let text = "*ATTENTION ALL*\n\n";
        meta.participants.forEach(p => text += `@${p.id.split('@')[0]}\n`);
        
        await sock.sendMessage(jid, { 
            text, 
            mentions: meta.participants.map(p => p.id) 
        }, { quoted: msg });
    }
};