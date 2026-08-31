/**
 * Pause execution for a specific time
 * @param {number} ms - Milliseconds to sleep
 */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Randomly pick an item from an array
 */
const LINK_REGEX = /(?:https?:\/\/|ftp:\/\/|www\.)[^\s/$.?#].[^\s]*|(?:chat\.whatsapp\.com|wa\.me|t\.me|telegram\.me|discord\.gg|discord\.com\/invite|bit\.ly|tinyurl\.com|cutt\.ly|is\.gd|rb\.gy)\/[^\s]+|\b[a-zA-Z0-9-]+\.(?:com|org|net|io|co|in|xyz|me|info|biz|app|dev|link|site|top|live|online|store|tech|club|space|fun|icu|vip|pro|tv|cc|to|gg)\b(?:\/[^\s]*)?/i;

/**
  * Check if string contains a link or domain URL
  */
const containsLink = (text) => {
    if (!text || typeof text !== 'string') return false;
    return LINK_REGEX.test(text);
};

module.exports = { delay, pickRandom, containsLink, LINK_REGEX };