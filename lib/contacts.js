/**
 * Contact list parsing & normalization.
 *
 * Pipeline:  source -> splitRaw()/loader -> raw string[] -> normalizeContacts() -> { valid, invalid, duplicates }
 *
 * Any future source (Excel/CSV sheet with a "contact(s)" column, vCard, etc.)
 * only needs to produce a raw string[] and call normalizeContacts().
 */

const DEFAULT_CC = (process.env.DEFAULT_COUNTRY_CODE || '91').replace(/\D/g, '');
const MIN_DIGITS = 8;
const MAX_DIGITS = 15; // E.164 upper bound

/**
 * Split free text into raw contact entries.
 * Separators: newline, comma, semicolon, pipe.
 * A chunk with more than 15 digits is assumed to hold several space-separated numbers.
 */
const splitRaw = (text) => {
    if (!text || typeof text !== 'string') return [];
    const out = [];
    text.split(/[\n\r,;|]+/).forEach(chunk => {
        const c = chunk.trim();
        if (!c) return;
        const digits = c.replace(/\D/g, '');
        if (digits.length > MAX_DIGITS && /\s/.test(c)) {
            c.split(/\s+/).forEach(t => t && out.push(t));
        } else {
            out.push(c);
        }
    });
    return out;
};

/**
 * Normalize one raw entry to an international digit string (no +), or null.
 *  +<cc><num>   -> kept as-is
 *  00<cc><num>  -> 00 stripped
 *  10 digits    -> DEFAULT_COUNTRY_CODE prepended
 *  0<10 digits> -> leading 0 stripped, DEFAULT_COUNTRY_CODE prepended
 *  otherwise    -> assumed to already include country code
 */
const normalizeNumber = (raw, defaultCc = DEFAULT_CC) => {
    if (raw === null || raw === undefined) return null;
    let s = String(raw).trim();
    // strip WhatsApp JID suffix / mention prefix if someone pasted one
    s = s.replace(/@(s\.whatsapp\.net|c\.us|lid)$/i, '').replace(/^@/, '');
    // strict: only digits and common phone punctuation. Anything else (names, letters) is rejected
    // rather than guessed, since this feeds a mass-add.
    if (/[^\d\s+\-().]/.test(s)) return null;
    const hadPlus = s.startsWith('+');
    let d = s.replace(/\D/g, '');
    if (!d) return null;

    if (!hadPlus) {
        if (d.startsWith('00')) d = d.slice(2);
        else if (d.length === 11 && d.startsWith('0')) d = defaultCc + d.slice(1);
        else if (d.length === 10) d = defaultCc + d;
    }

    if (d.length < MIN_DIGITS || d.length > MAX_DIGITS) return null;
    return d;
};

const toJid = (number) => `${number}@s.whatsapp.net`;

/**
 * Normalize + dedupe a raw string[].
 * @returns {{ valid: {raw:string, number:string, jid:string}[], invalid: string[], duplicates: number }}
 */
const normalizeContacts = (rawList, defaultCc = DEFAULT_CC) => {
    const valid = [];
    const invalid = [];
    const seen = new Set();
    let duplicates = 0;

    (rawList || []).forEach(raw => {
        const number = normalizeNumber(raw, defaultCc);
        if (!number) return invalid.push(String(raw).trim());
        if (seen.has(number)) return duplicates++;
        seen.add(number);
        valid.push({ raw: String(raw).trim(), number, jid: toJid(number) });
    });

    return { valid, invalid, duplicates };
};

/** Convenience: free text -> normalized contacts */
const parseContacts = (text, defaultCc = DEFAULT_CC) => normalizeContacts(splitRaw(text), defaultCc);

module.exports = { splitRaw, normalizeNumber, normalizeContacts, parseContacts, toJid, DEFAULT_CC };
