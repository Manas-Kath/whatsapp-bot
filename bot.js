/**
 * WhatsApp Bot using whatsapp-web.js
 *
 * Features:
 * 1. $tagall! - Mentions all participants in a group chat.
 * 2. $remind  - Sets a reminder for a user.
 * 3. $roast   - Roasts a tagged user with a random line from an external file.
 */

// ---------------------------------
// --- IMPORTS AND CONFIGURATION ---
// ---------------------------------

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs'); // NEW: Import the File System module
const path = require('path'); // NEW: Import the Path module for robust file paths

// --- PERMISSION CONFIGURATION ---
// List of 'super admins' who can use protected commands in ANY group.
// Use the user's ID (e.g., '919876543210@c.us').
const SUPER_ADMINS = [
    '916239232874@c.us', // Replace with your WhatsApp ID
    // '91yyyyyyyyyy@c.us'  // Add more super admins if needed
];

// --- PERFORMANCE CONFIGURATION for $tagall ---
const TAG_BATCH_SIZE = 50; // How many people to tag in a single message.
const TAG_DELAY_MS = 1000; // Delay in milliseconds (1000ms = 1 second) between each batch.
// WARNING: Setting these values too aggressively (e.g., batch size > 100 or delay < 500ms)
// might increase the risk of your number being temporarily blocked. Adjust with caution.

// ---------------------
// --- CLIENT SETUP ---
// ---------------------

console.log('[INFO] Initializing WhatsApp Bot...');

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ],
    }
});

// ----------------------
// --- EVENT HANDLERS ---
// ----------------------

client.on('qr', (qr) => {
    console.log('--------------------------------------------------');
    console.log('QR Code received. Please scan with your phone.');
    qrcode.generate(qr, { small: true });
    console.log('--------------------------------------------------');
});

client.on('authenticated', () => {
    console.log('[SUCCESS] Client authenticated successfully.');
});

client.on('ready', () => {
    console.log('[SUCCESS] Bot is online and ready for commands.');
    console.log('   - Bot Version: 3.5 (Roast Feature)'); // MODIFIED
    console.log('   - Logged in at:', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));
    console.log('--------------------------------------------------');
});

client.on('auth_failure', (msg) => {
    console.error('[ERROR] Authentication failed:', msg);
});

client.on('error', (err) => {
    console.error('[ERROR] An unexpected error occurred:', err);
});

client.on('message', async (message) => {
    const command = message.body.trim().toLowerCase();

    if (command.startsWith('$tagall!')) {
        await handleTagAll(message);
    } else if (command.startsWith('$remind')) {
        await handleRemind(message);
    } else if (command.startsWith('$roast')) { // NEW: Handle the roast command
        await handleRoast(message);
    }
});

// --------------------------
// --- HELPER FUNCTIONS ---
// --------------------------

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Checks if a user is authorized to perform a command.
 * Authorization is granted if the user is a SUPER_ADMIN or a group admin in the chat.
 * @param {import('whatsapp-web.js').Message} message The message object.
 * @param {import('whatsapp-web.js').Chat} chat The chat object.
 * @returns {Promise<boolean>} True if the user is authorized, false otherwise.
 */
async function isUserAuthorized(message, chat) {
    const senderId = message.author || message.from;
    if (SUPER_ADMINS.includes(senderId)) {
        return true;
    }
    if (chat.isGroup) {
        const senderParticipant = chat.participants.find(p => p.id._serialized === senderId);
        if (senderParticipant && senderParticipant.isAdmin) {
            return true;
        }
    }
    return false;
}

// NEW: Helper function to get a random roast from the 'roasts.txt' file.
/**
 * Reads the roasts.txt file, picks a random line, and returns it.
 * @returns {string} A random roast message, or an error message if the file can't be read.
 */
function getRandomRoast() {
    try {
        const filePath = path.join(__dirname, 'roasts.txt');
        const roasts = fs.readFileSync(filePath, 'utf8')
            .split('\n')
            .filter(line => line.trim() !== ''); // Filter out empty lines

        if (roasts.length === 0) {
            return "I tried to find a roast, but the roast file is empty. My disappointment is immeasurable.";
        }

        const index = Math.floor(Math.random() * roasts.length);
        return roasts[index];

    } catch (error) {
        console.error("[ERROR] Could not read roasts.txt:", error);
        return "I couldn't find my list of roasts. I guess you're safe... for now.";
    }
}


// --------------------------
// --- COMMAND FUNCTIONS ---
// --------------------------

/**
 * Handles the $tagall! command by mentioning users in configurable batches.
 * @param {import('whatsapp-web.js').Message} message The message object.
 */
async function handleTagAll(message) {
    try {
        const contact = await message.getContact();
        const chat = await message.getChat();
        console.log(`[CMD] Received $tagall! from "${contact.pushname}" in chat "${chat.name}".`);
        if (!chat.isGroup) {
            return await message.reply('A novel concept, I know, but this command only functions within a group.');
        }
        const authorized = await isUserAuthorized(message, chat);
        if (!authorized) {
            return await message.reply('An admirable attempt, but this feature requires administrative privileges.');
        }
        const participants = chat.participants;
        console.log(`[INFO] Tagging ${participants.length} participants in batches of ${TAG_BATCH_SIZE}...`);
        for (let i = 0; i < participants.length; i += TAG_BATCH_SIZE) {
            const batch = participants.slice(i, i + TAG_BATCH_SIZE);
            let text = '';
            let mentions = [];
            for (const participant of batch) {
                mentions.push(participant.id._serialized);
                text += `@${participant.id.user} `;
            }
            await chat.sendMessage(text.trim(), { mentions });
            console.log(`[INFO] Sent batch ${Math.floor(i / TAG_BATCH_SIZE) + 1} of ${Math.ceil(participants.length / TAG_BATCH_SIZE)}.`);
            await sleep(TAG_DELAY_MS);
        }
        console.log(`[SUCCESS] Finished tagging all participants in chat "${chat.name}".`);
    } catch (error) {
        console.error('[ERROR] Failed to handle $tagall! command:', error);
        await message.reply('A critical error was encountered during the tagging process. Please try again later.');
    }
}

/**
 * Handles the $remind command.
 * @param {import('whatsapp-web.js').Message} message The message object.
 */
async function handleRemind(message) {
    try {
        const command = message.body.toLowerCase();
        const senderContact = await message.getContact();
        const chat = await message.getChat();
        console.log(`[CMD] Received $remind from "${senderContact.pushname}".`);
        let totalSeconds = 0;
        const timeParts = {
            hours: command.match(/(\d+)\s*h(our)?s?/),
            minutes: command.match(/(\d+)\s*m(inute)?s?/),
            seconds: command.match(/(\d+)\s*s(econd)?s?/),
        };
        const hours = timeParts.hours ? parseInt(timeParts.hours[1], 10) : 0;
        const minutes = timeParts.minutes ? parseInt(timeParts.minutes[1], 10) : 0;
        const seconds = timeParts.seconds ? parseInt(timeParts.seconds[1], 10) : 0;
        totalSeconds = (hours * 3600) + (minutes * 60) + seconds;
        if (totalSeconds <= 0) {
            return await message.reply("The time format provided is indecipherable. Please use a coherent structure, for instance: 'in 1 hour 30 minutes'.");
        }
        let targetContact = senderContact;
        const mentions = await message.getMentions();
        if (mentions && mentions.length > 0) {
            targetContact = mentions[0];
            console.log(`[INFO] Reminder target is mentioned user: "${targetContact.pushname}"`);
        } else {
             console.log('[INFO] Reminder target is the message sender.');
        }
        let confirmationMessage = `Acknowledged. A reminder has been scheduled for @${targetContact.number} in `;
        if (hours > 0) confirmationMessage += `${hours} hour(s) `;
        if (minutes > 0) confirmationMessage += `${minutes} minute(s) `;
        if (seconds > 0) confirmationMessage += `${seconds} second(s)`;
        await chat.sendMessage(confirmationMessage.trim(), { mentions: [targetContact] });
        setTimeout(async () => {
            try {
                const reminderText = `Attention @${targetContact.number}: This is your scheduled reminder.`;
                await chat.sendMessage(reminderText, { mentions: [targetContact] });
                console.log(`[SUCCESS] Sent reminder to "${targetContact.pushname}".`);
            } catch (err) {
                console.error('[ERROR] Failed to send scheduled reminder:', err);
            }
        }, totalSeconds * 1000);
    } catch (error) {
        console.error('[ERROR] Failed to handle $remind command:', error);
        await message.reply('An unexpected error prevented the reminder from being set.');
    }
}

// NEW: Function to handle the $roast command.
/**
 * Handles the $roast command by roasting a mentioned user.
 * @param {import('whatsapp-web.js').Message} message The message object.
 */
async function handleRoast(message) {
    try {
        const senderContact = await message.getContact();
        const chat = await message.getChat();
        console.log(`[CMD] Received $roast from "${senderContact.pushname}" in chat "${chat.name || 'private chat'}".`);

        const mentions = await message.getMentions();

        if (!mentions || mentions.length === 0) {
            return await message.reply('Whom shall I verbally obliterate? Please specify by tagging them. \nUsage: $roast @name');
        }

        const targetContact = mentions[0];
        const roast = getRandomRoast(); 

        const roastMessage = `Attention @${targetContact.number}, a message for you: ${roast}`;

        await chat.sendMessage(roastMessage, { mentions: [targetContact] });
        console.log(`[SUCCESS] Roasted "${targetContact.pushname}" in chat "${chat.name}".`);

    } catch (error) {
        console.error('[ERROR] Failed to handle $roast command:', error);
        await message.reply('An error occurred during my attempt at humor. How predictably disappointing.');
    }
}


// ------------------
// --- INITIALIZE ---
// ------------------

client.initialize();