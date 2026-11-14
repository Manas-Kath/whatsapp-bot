/**
 * Hindi / Hinglish / English normalizer and lexicon for Bunty Business Module.
 */

// Lexicon for spelling variants and typos
const REPLACEMENTS = [
    // Suit variants
    [/\b(sued|sut|soot|soots|suitt)\b/gi, 'suit'],
    [/\b(suits)\b/gi, 'suit'],

    // Selling words
    [/\b(bechi|beche|becha|bika|biki|bikk|sell|selled)\b/gi, 'sold'],

    // Payment action words
    [/\b(diye|diya|dia|de diye|de diya|paid|pay|recvd|received|receive|aaye|aaya|mila|mile)\b/gi, 'paid'],

    // Pending / credit words
    [/\b(udhar|udhaari|udharr|baad mein|baad me|bad me|baadmai|credit)\b/gi, 'pending'],

    // Modes
    [/\b(gpay|phonepe|paytm|online|netbanking|bank|upi id)\b/gi, 'upi'],
    [/\b(rokda|nakad|nakad cash|cashh)\b/gi, 'cash'],

    // Currency symbols and words
    [/[₹]/g, ' rs '],
    [/\binr\b/gi, ' rs '],
    [/\b(rupaye|rupayee|rupee|rupees|rupay)\b/gi, ' rs '],
    [/\/\-/g, ' '],
];

// Common Hindi number words
const HINDI_NUMBER_WORDS = {
    'ek': 1, 'do': 2, 'teen': 3, 'char': 4, 'paanch': 5,
    'chhah': 6, 'che': 6, 'saat': 7, 'aath': 8, 'nau': 9, 'das': 10,
    'gyarah': 11, 'barah': 12, 'terah': 13, 'chaudah': 14, 'pandrah': 15,
    'solah': 16, 'satrah': 17, 'atharah': 18, 'unnis': 19, 'bees': 20,
    'pachees': 25, 'tees': 30, 'paintis': 35, 'chaalis': 40, 'paitaalis': 45,
    'pachas': 50, 'pachaas': 50, 'saath': 60, 'sattar': 70, 'assi': 80, 'nabbe': 90
};

// Compound Hindi amount expressions
const COMPOUND_AMOUNTS = [
    [/\bdedh\s*(hazaar|hazar)\b/gi, '1500'],
    [/\bdhai\s*(hazaar|hazar)\b/gi, '2500'],
    [/\bpaune\s*do\s*(hazaar|hazar)\b/gi, '1750'],
    [/\bsawa\s*do\s*(hazaar|hazar)\b/gi, '2250'],
    [/\bdedh\s*sau\b/gi, '150'],
    [/\bdhai\s*sau\b/gi, '250'],
    [/\bpaune\s*do\s*sau\b/gi, '175'],
    [/\bsawa\s*do\s*sau\b/gi, '225']
];

/**
 * Normalizes text: trims, lowercases, handles currency noise, spelling variants, and number words.
 * 
 * @param {string} rawText
 * @returns {string} normalized string
 */
function normalizeText(rawText) {
    if (!rawText) return '';
    let text = String(rawText).trim().toLowerCase();

    // 1. Compound Hindi amounts first
    for (const [regex, rep] of COMPOUND_AMOUNTS) {
        text = text.replace(regex, rep);
    }

    // 2. Lexical replacements
    for (const [regex, rep] of REPLACEMENTS) {
        text = text.replace(regex, rep);
    }

    // 3. Number words with sau / hazar / k
    // e.g. "2 hazar" -> 2000, "12 sau" -> 1200, "2.5k" -> 2500
    text = text.replace(/(\d+(?:\.\d+)?)\s*(?:hazaar|hazar|k)\b/gi, (m, n) => {
        return String(Math.round(parseFloat(n) * 1000));
    });
    text = text.replace(/(\d+(?:\.\d+)?)\s*sau\b/gi, (m, n) => {
        return String(Math.round(parseFloat(n) * 100));
    });

    // Handle single Hindi number word before sau / hazar
    // e.g. "do hazar" -> 2000
    for (const [word, val] of Object.entries(HINDI_NUMBER_WORDS)) {
        const hazarRegex = new RegExp(`\\b${word}\\s*(?:hazaar|hazar)\\b`, 'gi');
        text = text.replace(hazarRegex, String(val * 1000));

        const sauRegex = new RegExp(`\\b${word}\\s*sau\\b`, 'gi');
        text = text.replace(sauRegex, String(val * 100));
    }

    // 4. Remove 'rs' or 'rs.' attached to digits (e.g. "rs2450" -> "2450", "2450rs" -> "2450")
    text = text.replace(/\brs\.?\s*(\d+)/gi, '$1');
    text = text.replace(/(\d+)\s*rs\.?\b/gi, '$1');

    // Clean whitespace
    text = text.replace(/\s+/g, ' ').trim();

    return text;
}

module.exports = {
    normalizeText,
    HINDI_NUMBER_WORDS
};
