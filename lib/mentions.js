const { jidNormalizedUser } = require('@whiskeysockets/baileys');
const db = require('./database');

function cleanDisplayName(value, fallback) {
    const name = String(value || '').replace(/\s+/g, ' ').trim();
    return name || fallback;
}

function participantJid(participant, addressingMode) {
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

            const primaryId = identifiers[0] || `user_${index + 1}`;
            const knownName = db.getUserName(jid) || participant.name || participant.notify || participant.verifiedName;
            const displayName = cleanDisplayName(knownName, `@${primaryId}`);

            return {
                token: `member_${index + 1}`,
                jid,
                identifiers: [...new Set(identifiers)],
                name: displayName,
                hasRealName: !!knownName
            };
        })
        .filter(Boolean);
}

function replaceIncomingMentions(text, directory) {
    if (!text || !directory?.length) return text || '';

    return text.replace(/@(\d{5,20})\b/g, (rawMention, identifier) => {
        const member = directory.find(entry => entry.identifiers.includes(identifier));
        return member ? `@${member.name.replace(/^@/, '')}` : rawMention;
    });
}

function mentionInstruction(directory, promptText = '') {
    if (!directory?.length) return '';

    // Only inject directory if the prompt actually involves mentioning, tagging, or querying members
    const hasMentionIntent = /@|tag|mention|kaun|who|kisko|kise/i.test(promptText);
    if (!hasMentionIntent) return '';

    // Prefer members with actual recorded names
    const namedMembers = directory.filter(entry => entry.hasRealName);
    const listToInclude = namedMembers.length > 0 ? namedMembers.slice(0, 15) : directory.slice(0, 5);

    const members = listToInclude
        .map(entry => `- ${entry.token}: ${entry.name}`)
        .join('\n');

    return `[SYSTEM: GROUP MEMBERS]\n${members}\n` +
        'To mention one of these members, use exactly [[mention:member_N]] or @Name. ' +
        'Never output raw phone numbers or LIDs.';
}

function resolveGeneratedMentions(text, directory = []) {
    const mentions = [];
    const addMemberMention = member => {
        if (member?.jid && !mentions.includes(member.jid)) {
            mentions.push(member.jid);
        }
        return `@${member.name.replace(/^@/, '')}`;
    };

    // 1. Resolve [[mention:member_N]] tokens
    let resolvedText = String(text || '').replace(/\[\[mention:(member_\d+)\]\]/gi, (rawToken, token) => {
        const member = directory.find(entry => entry.token.toLowerCase() === token.toLowerCase());
        return member ? addMemberMention(member) : 'someone';
    });

    // 2. Resolve @phone_number mentions
    resolvedText = resolvedText.replace(/@(\d{5,20})\b/g, (rawMention, identifier) => {
        const member = directory.find(entry => entry.identifiers.includes(identifier));
        return member ? addMemberMention(member) : rawMention;
    });

    // 3. Resolve @Name mentions (matches real display names like @Rahul, @Manas)
    if (directory.length > 0) {
        for (const member of directory) {
            if (!member.name || member.name.startsWith('@')) continue;
            const cleanName = member.name.replace(/^@/, '');
            const escapedName = cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`@${escapedName}\\b`, 'gi');
            if (regex.test(resolvedText)) {
                if (member.jid && !mentions.includes(member.jid)) {
                    mentions.push(member.jid);
                }
            }
        }
    }

    return { text: resolvedText, mentions };
}

module.exports = {
    buildMentionDirectory,
    replaceIncomingMentions,
    mentionInstruction,
    resolveGeneratedMentions
};
