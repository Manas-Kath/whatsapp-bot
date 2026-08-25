const { jidNormalizedUser } = require('@whiskeysockets/baileys');

function cleanDisplayName(value, fallback) {
    const name = String(value || '').replace(/\s+/g, ' ').trim();
    return name || fallback;
}

function participantJid(participant, addressingMode) {
    // WhatsApp groups use either LIDs or phone-number JIDs for addressing.
    // Prefer the group's active addressing mode, but retain a valid fallback.
    const candidates = addressingMode === 'lid'
        ? [participant.lid, participant.id, participant.phoneNumber]
        : [participant.phoneNumber, participant.id, participant.lid];

    const jid = candidates.find(value => typeof value === 'string' && value.includes('@'));
    return jid ? jidNormalizedUser(jid) : null;
}

function buildMentionDirectory(metadata) {
    if (!metadata?.participants) return [];

    return metadata.participants
        .map((participant, index) => {
            const jid = participantJid(participant, metadata.addressingMode);
            if (!jid) return null;

            const identifiers = [participant.id, participant.lid, participant.phoneNumber, jid]
                .filter(Boolean)
                .map(value => String(value).split('@')[0]);

            return {
                token: `member_${index + 1}`,
                jid,
                identifiers: [...new Set(identifiers)],
                name: cleanDisplayName(
                    participant.name || participant.notify || participant.verifiedName,
                    `member ${index + 1}`
                )
            };
        })
        .filter(Boolean);
}

function replaceIncomingMentions(text, directory) {
    if (!text || !directory?.length) return text || '';

    return text.replace(/@(\d{5,20})\b/g, (rawMention, identifier) => {
        const member = directory.find(entry => entry.identifiers.includes(identifier));
        return member ? `@${member.name}` : rawMention;
    });
}

function mentionInstruction(directory) {
    if (!directory?.length) return '';

    const members = directory
        .map(entry => `- ${entry.token}: ${entry.name}`)
        .join('\n');

    return `[SYSTEM: GROUP MEMBERS]\n${members}\n` +
        'To mention one of these members, use exactly [[mention:member_N]]. ' +
        'Never output phone numbers, LIDs, or any other @number mention.';
}

function resolveGeneratedMentions(text, directory) {
    const mentions = [];
    const addMemberMention = member => {
        if (!mentions.includes(member.jid)) mentions.push(member.jid);
        return `@${member.name}`;
    };

    let resolvedText = String(text || '').replace(/\[\[mention:(member_\d+)\]\]/gi, (rawToken, token) => {
        const member = directory?.find(entry => entry.token.toLowerCase() === token.toLowerCase());
        return member ? addMemberMention(member) : 'someone';
    });

    // A model may still ignore the token format. Resolve only identities from
    // the live directory and remove every unknown numeric mention.
    resolvedText = resolvedText.replace(/@(\d{5,20})\b/g, (rawMention, identifier) => {
        const member = directory?.find(entry => entry.identifiers.includes(identifier));
        return member ? addMemberMention(member) : 'someone';
    });

    return { text: resolvedText, mentions };
}

module.exports = {
    buildMentionDirectory,
    replaceIncomingMentions,
    mentionInstruction,
    resolveGeneratedMentions
};
