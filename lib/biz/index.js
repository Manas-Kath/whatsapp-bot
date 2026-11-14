const { getDb, getSetting } = require('./db');
const people = require('./people');
const inputs = require('./inputs');

const PARSER_VERSION = '0.1.0';

/**
 * Main entry point for Bunty Business Module.
 * Completely decoupled from Bunty's database.json and Gemini AI.
 * 
 * @param {Object} input
 * @param {string} input.msgId
 * @param {string} input.chat
 * @param {string} input.senderId
 * @param {number} input.ts
 * @param {string} input.type ('text' | 'audio' | 'image')
 * @param {string} input.text
 * @param {string} [input.quotedText]
 * @param {Function} [input.getMedia]
 * @param {Object} [deps] Optional dependency overrides (e.g. { db })
 * @returns {Promise<{ handled: boolean, replies: Array<{ text: string }> }>}
 */
async function handle(input, deps = {}) {
    const conn = deps.db || getDb();
    const startTime = Date.now();

    const { msgId, chat, senderId, ts, type = 'text', text = '' } = input;
    if (!msgId || !chat || !senderId) {
        return { handled: false, replies: [] };
    }

    // 1. Allowed chat check:
    // Only one dedicated business group + private DMs with the bot are allowed.
    const isGroup = chat.endsWith('@g.us');
    const configuredGroup = getSetting('biz_group_jid', conn) || process.env.BIZ_GROUP_JID;

    if (isGroup) {
        if (!configuredGroup || chat !== configuredGroup) {
            return { handled: false, replies: [] };
        }
    }

    // 2. Identity & Permission check:
    // Authenticate the actual sender by LID or Phone JID in people table.
    const person = people.findPersonByIdentifier(senderId, conn);
    if (!person || !person.active) {
        // Unauthorized sender gets no reply and no stored message
        return { handled: false, replies: [] };
    }

    // 3. Raw input logging (MUST BE FIRST):
    // Stored before any parsing or validation to build the dataset.
    const rawKind = ['audio', 'image'].includes(type) ? type : 'text';
    const logResult = inputs.logRawInput({
        msgId,
        ts,
        personId: person.id,
        chat,
        kind: rawKind,
        rawText: text
    }, conn);

    // 4. Idempotency replay check:
    if (logResult.isReplay) {
        const prev = logResult.existingRow;
        if (prev && prev.reply_text) {
            return { handled: true, replies: [{ text: prev.reply_text }] };
        }
        return { handled: true, replies: [] };
    }

    const inputId = logResult.id;

    // 5. Process business input safely:
    try {
        const cleanText = (text || '').trim();
        let replyText = '';
        let outcome = 'unparsed';
        let parsedJson = null;

        if (!cleanText && rawKind !== 'text') {
            replyText = `(¬_¬) [ BIZ ]\n\nMedia input received from ${person.name}. Media extraction will be enabled in future phase.`;
            outcome = 'recorded';
        } else if (cleanText.toLowerCase() === 'biz ping' || cleanText.toLowerCase() === 'biz test') {
            replyText = `(¬_¬) [ BIZ ]\n\n• Identity: ${person.name} (${person.role})\n• Input ID: #${inputId}\n• System: Online & recording.`;
            outcome = 'recorded';
        } else {
            // Default Phase 1 handler: raw input is safely persisted.
            // Full rules parser in Phase 2 will process sales and payments.
            replyText = `(¬_¬) [ BIZ ] ✅ #${inputId}\n\nReceived: "${cleanText}"\nLogged by ${person.name}.`;
            outcome = 'recorded';
        }

        const latency = Date.now() - startTime;
        inputs.updateInputOutcome(inputId, {
            normalized: cleanText.toLowerCase(),
            stage: 'rules',
            parser_version: PARSER_VERSION,
            parsed_json: parsedJson,
            outcome,
            reply_text: replyText,
            latency_ms: latency
        }, conn);

        return {
            handled: true,
            replies: [{ text: replyText }]
        };
    } catch (err) {
        console.error('[BIZ] Error handling input:', err);
        const errorReply = '(¬_¬) [ BIZ ] ⚠️ Save nahi hua, dobara bhejo.';
        inputs.updateInputOutcome(inputId, {
            outcome: 'error',
            error: err.message,
            reply_text: errorReply,
            latency_ms: Date.now() - startTime
        }, conn);

        return {
            handled: true,
            replies: [{ text: errorReply }]
        };
    }
}

module.exports = {
    handle,
    db: require('./db'),
    people,
    inputs
};
