const { normalizeText, HINDI_NUMBER_WORDS } = require('./normalize');
const peopleModule = require('../people');

const COLOURS = [
    'wine', 'beige', 'red', 'blue', 'green', 'yellow', 'black', 'white',
    'pink', 'grey', 'gray', 'peach', 'purple', 'orange', 'brown', 'navy',
    'cream', 'pista', 'magenta', 'maroon', 'rust', 'firozi', 'mustard',
    'lavender', 'teal', 'olive', 'gold', 'silver'
];

const KNOWN_BRANDS = [
    'idhu', 'kessi', 'varun', 'belliza', 'ganga', 'deepsy', 'zulfat',
    'sahiba', 'tannu', 'kesari', 'shree fabs', 'zack', 'ramtex'
];

const SIZES = [
    '36', '38', '40', '42', '44', '46', '48',
    'xxxl', '3xl', 'xxl', '2xl', 'xl', 'l', 'm', 's', 'xs', 'free size'
];

const STOP_WORDS = new Set([
    'ko', 'ne', 'ka', 'ki', 'ke', 'mein', 'me', 'mai', 'se', 'pe', 'par',
    'sold', 'beche', 'bechi', 'becha', 'aaj', 'kal', 'hai', 'hain', 'tha',
    'suit', 'for', 'to', 'in', 'at', 'and', 'or', 'rs', 'rupees', 'paise',
    'cash', 'upi', 'pending', 'paid', 'diye', 'mila', 'aaye', 'paas', 'kisko'
]);

/**
 * Extracts intent and parameters from message.
 * 
 * @param {string} rawText
 * @param {Object} [options]
 * @param {Object} [options.senderPerson] The person who sent the message
 * @param {Object} [options.db] SQLite database connection
 * @returns {Object} Extracted intent and slots
 */
function parseMessage(rawText, options = {}) {
    const norm = normalizeText(rawText);
    const db = options.db || null;
    const sender = options.senderPerson || null;

    if (!norm) {
        return { intent: 'unknown', raw: rawText, normalized: '' };
    }

    // 1. Intent: UNDO
    if (norm === 'undo' || norm === '#undo' || norm === 'cancel') {
        return { intent: 'undo', raw: rawText, normalized: norm };
    }

    // 2. Intent: QUERY_PENDING
    if (/^(pending|udhar|udharr|pending hisaab|pending list|hisab)\b/i.test(norm)) {
        return { intent: 'query_pending', raw: rawText, normalized: norm };
    }

    // 3. Extract all numbers
    const tokens = norm.split(' ');
    const numberMatches = [];
    const numRegex = /\b\d+(?:\.\d+)?\b/g;
    let match;
    while ((match = numRegex.exec(norm)) !== null) {
        numberMatches.push({
            value: parseFloat(match[0]),
            index: match.index,
            text: match[0]
        });
    }

    // 4. Intent: SETTLE_PAYMENT
    // e.g. "Meera ne 2450 cash diye", "Meera 2450 cash", "2450 cash from Meera"
    const hasPaidVerb = /\b(paid|diye|diya|receive|recvd|aaye|aaya|mila|mile)\b/i.test(norm);
    const hasSaleVerb = /\b(sold|beche|bechi|becha|bika|biki)\b/i.test(norm);
    const hasPendingWord = /\bpending\b/i.test(norm);

    if (hasPaidVerb && !hasSaleVerb && !hasPendingWord && numberMatches.length >= 1) {
        return parsePaymentMessage(norm, rawText, numberMatches, options);
    }

    // 5. Intent: RECORD_SALE
    // Identified by sale verbs OR having customer/item/price structure
    if (hasSaleVerb || hasPendingWord || /\b(suit|kurti|saree)\b/i.test(norm) || numberMatches.some(n => n.value >= 100)) {
        return parseSaleMessage(norm, rawText, numberMatches, options);
    }

    return {
        intent: 'unparsed',
        raw: rawText,
        normalized: norm
    };
}

/**
 * Parses payment settling message.
 */
function parsePaymentMessage(norm, rawText, numberMatches, options) {
    const db = options.db || null;
    const sender = options.senderPerson || null;

    // Price is usually the largest number or explicitly designated
    const amountVal = numberMatches[0].value;
    const amountPaise = Math.round(amountVal * 100);

    // Extract mode
    let mode = 'cash';
    if (/\bupi\b/i.test(norm)) mode = 'upi';
    else if (/\bcash\b/i.test(norm)) mode = 'cash';
    else if (/\bother\b/i.test(norm)) mode = 'other';

    // Extract who received it (check aliases against registered people)
    let receiverPerson = sender;
    const allPeople = peopleModule.getAllPeople(db);
    for (const p of allPeople) {
        const pName = p.name.toLowerCase();
        if (new RegExp(`\\b${pName}\\b`, 'i').test(norm)) {
            receiverPerson = p;
            break;
        }
        try {
            const aliases = JSON.parse(p.aliases || '[]');
            for (const a of aliases) {
                if (new RegExp(`\\b${a.toLowerCase()}\\b`, 'i').test(norm)) {
                    receiverPerson = p;
                    break;
                }
            }
        } catch (e) {}
    }

    // Extract customer name
    let customer = '';
    const neMatch = norm.match(/([a-z]+)\s+ne\b/i);
    const fromMatch = norm.match(/(?:from|se)\s+([a-z]+)\b/i);
    if (neMatch && !STOP_WORDS.has(neMatch[1].toLowerCase())) {
        customer = capitalize(neMatch[1]);
    } else if (fromMatch && !STOP_WORDS.has(fromMatch[1].toLowerCase())) {
        customer = capitalize(fromMatch[1]);
    } else {
        // First word if not stop word or number
        const firstToken = norm.split(' ')[0];
        if (firstToken && !STOP_WORDS.has(firstToken) && isNaN(Number(firstToken))) {
            customer = capitalize(firstToken);
        }
    }

    return {
        intent: 'record_payment',
        raw: rawText,
        normalized: norm,
        customer,
        amount: amountVal,
        amount_paise: amountPaise,
        mode,
        received_by: receiverPerson ? receiverPerson.id : (sender ? sender.id : null),
        received_by_name: receiverPerson ? receiverPerson.name : (sender ? sender.name : 'Unknown')
    };
}

/**
 * Parses sale logging message.
 */
function parseSaleMessage(norm, rawText, numberMatches, options) {
    const db = options.db || null;
    const sender = options.senderPerson || null;

    // 1. Identify Price
    // Price is typically >= 100 and not followed by size markers (L, XL, etc.)
    let priceVal = null;
    let sizeVal = null;
    let qty = 1;

    // Check quantity: "2 suit", "3 suit", etc.
    const qtyMatch = norm.match(/\b(\d+)\s*(?:suit|pc|piece|kurti|saree)\b/i);
    if (qtyMatch) {
        qty = parseInt(qtyMatch[1], 10);
    } else {
        for (const [w, val] of Object.entries(HINDI_NUMBER_WORDS)) {
            if (new RegExp(`\\b${w}\\s*(?:suit|pc|piece|kurti|saree)\\b`, 'i').test(norm)) {
                qty = val;
                break;
            }
        }
    }

    // Identify candidate numbers
    for (const numObj of numberMatches) {
        const val = numObj.value;
        // Check if this number is followed by size letter: e.g. "40 l", "42 xl"
        const afterStr = norm.slice(numObj.index + numObj.text.length, numObj.index + numObj.text.length + 10).trim();
        if (/^(l|xl|xxl|m|s)\b/i.test(afterStr) || (val >= 34 && val <= 48 && !priceVal && numberMatches.length > 1)) {
            sizeVal = `${numObj.text} ${afterStr.split(' ')[0]}`.trim();
            continue;
        }

        // If it looks like price:
        if (val >= 100) {
            priceVal = val;
        }
    }

    // Default if only one number and >= 100
    if (!priceVal && numberMatches.length > 0) {
        priceVal = numberMatches[numberMatches.length - 1].value;
    }

    const pricePaise = priceVal ? Math.round(priceVal * 100) : null;

    // 2. Extract Customer ("Meera ko", "to Rajesh", "customer Meera")
    let customer = '';
    const koMatch = norm.match(/([a-z]+)\s+ko\b/i);
    const toMatch = norm.match(/to\s+([a-z]+)\b/i);
    const custMatch = norm.match(/customer\s*:?\s*([a-z]+)\b/i);

    if (koMatch && !STOP_WORDS.has(koMatch[1].toLowerCase())) {
        customer = capitalize(koMatch[1]);
    } else if (toMatch && !STOP_WORDS.has(toMatch[1].toLowerCase())) {
        customer = capitalize(toMatch[1]);
    } else if (custMatch && !STOP_WORDS.has(custMatch[1].toLowerCase())) {
        customer = capitalize(custMatch[1]);
    }

    // 3. Extract Colour
    let colour = '';
    for (const c of COLOURS) {
        if (new RegExp(`\\b${c}\\b`, 'i').test(norm)) {
            colour = capitalize(c);
            break;
        }
    }

    // 4. Extract Brand
    let brand = '';
    for (const b of KNOWN_BRANDS) {
        if (new RegExp(`\\b${b}\\b`, 'i').test(norm)) {
            brand = capitalize(b);
            break;
        }
    }

    // If brand not found in known list, check word immediately preceding colour or item type
    if (!brand) {
        const brandMatch = norm.match(/([a-z]{3,})\s+(?:[a-z]+\s+)?suit\b/i);
        if (brandMatch) {
            const cand = brandMatch[1].toLowerCase();
            if (!STOP_WORDS.has(cand) && !COLOURS.includes(cand) && cand !== customer.toLowerCase()) {
                brand = capitalize(cand);
            }
        }
    }

    // 5. Extract Details / Size
    let detailsParts = [];
    if (sizeVal) {
        detailsParts.push(sizeVal.toUpperCase());
    } else {
        for (const s of SIZES) {
            if (new RegExp(`\\b${s}\\b`, 'i').test(norm) && !detailsParts.includes(s.toUpperCase())) {
                detailsParts.push(s.toUpperCase());
                break;
            }
        }
    }

    // Check item type
    const itemMatch = norm.match(/\b(suit|kurti|saree|dupatta|plazo|sharara)\b/i);
    if (itemMatch) {
        detailsParts.push(capitalize(itemMatch[1]));
    }
    const otherDetails = detailsParts.join(' ').trim() || 'Suit';

    // 6. Payment Status & Mode
    let isPending = /\bpending\b/i.test(norm);
    let paymentMode = null;
    let receiverPerson = null;

    if (/\bupi\b/i.test(norm)) paymentMode = 'upi';
    else if (/\bcash\b/i.test(norm)) paymentMode = 'cash';

    if (paymentMode) {
        // Check if receiver person named
        const allPeople = peopleModule.getAllPeople(db);
        for (const p of allPeople) {
            const pName = p.name.toLowerCase();
            if (new RegExp(`\\b${pName}\\b`, 'i').test(norm)) {
                receiverPerson = p;
                break;
            }
            try {
                const aliases = JSON.parse(p.aliases || '[]');
                for (const a of aliases) {
                    if (new RegExp(`\\b${a.toLowerCase()}\\b`, 'i').test(norm)) {
                        receiverPerson = p;
                        break;
                    }
                }
            } catch (e) {}
        }
        // If receiver not named, default to sender
        if (!receiverPerson && sender) {
            receiverPerson = sender;
        }
    }

    // Formatted "Who got money and how" note
    let moneyNote = 'Pending';
    let paymentStatus = 'pending';

    if (isPending) {
        moneyNote = 'Pending';
        paymentStatus = 'pending';
    } else if (paymentMode) {
        const receiverName = receiverPerson ? receiverPerson.name : (sender ? sender.name : 'Unknown');
        const modeLabel = paymentMode === 'cash' ? 'Cash' : 'UPI';
        moneyNote = `${modeLabel} - ${receiverName}`;
        paymentStatus = 'received';
    } else {
        // Neither pending nor payment mentioned
        paymentStatus = 'missing';
        moneyNote = 'Unspecified';
    }

    return {
        intent: 'record_sale',
        raw: rawText,
        normalized: norm,
        sold_to: customer || 'Unknown',
        brand: brand || 'Other',
        colour: colour || 'Standard',
        other_details: otherDetails,
        amount: priceVal,
        sold_for_paise: pricePaise,
        qty,
        payment_status: paymentStatus,
        payment_mode: paymentMode,
        received_by: receiverPerson ? receiverPerson.id : (sender ? sender.id : null),
        received_by_name: receiverPerson ? receiverPerson.name : (sender ? sender.name : null),
        money_note: moneyNote
    };
}

function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

module.exports = {
    parseMessage,
    COLOURS,
    KNOWN_BRANDS
};
