/**
 * Pause execution for a specific time
 * @param {number} ms - Milliseconds to sleep
 */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Randomly pick an item from an array
 */
const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

module.exports = { delay, pickRandom };