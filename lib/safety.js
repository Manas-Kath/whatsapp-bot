const fs = require('fs');
const path = require('path');
const os = require('os');

const safetyFile = path.join(__dirname, '../safety.json');
const logDirectory = path.join(__dirname, '../logs');
const logFile = path.join(logDirectory, 'error.log');

const MAX_LOG_SIZE = 500 * 1024; // 500KB
const CRASH_WINDOW = 5 * 60 * 1000; // 5 minutes
const MAX_BOOTS_IN_WINDOW = 3;

// Initial state
let safetyData = {
    boots: [],
    safeMode: false,
    lastAiError: 0,
    aiDisabledUntil: 0
};

// Load existing safety data
if (fs.existsSync(safetyFile)) {
    try {
        const data = JSON.parse(fs.readFileSync(safetyFile, 'utf-8'));
        safetyData = { ...safetyData, ...data };
    } catch (e) {
        console.error("⚠️ Safety Data Corrupted! Resetting.");
    }
}

function saveSafety() {
    fs.writeFileSync(safetyFile, JSON.stringify(safetyData, null, 2));
}

function logError(err) {
    const timestamp = new Date().toISOString();
    const message = `[${timestamp}] ${err.stack || err}\n`;
    
    try {
        fs.mkdirSync(logDirectory, { recursive: true });

        if (fs.existsSync(logFile)) {
            const stats = fs.statSync(logFile);
            if (stats.size > MAX_LOG_SIZE) {
                // Keep the last 100KB or just clear it for Termux simplicity
                fs.writeFileSync(logFile, "--- ROTATED ---\n");
            }
        }
        fs.appendFileSync(logFile, message);
    } catch (e) {
        process.stderr.write("Failed to log error: " + e.message + "\n");
    }
}

function checkCrashLoop() {
    const now = Date.now();
    safetyData.boots.push(now);
    
    // Filter boots within the window
    safetyData.boots = safetyData.boots.filter(t => now - t < CRASH_WINDOW);
    
    if (safetyData.boots.length >= MAX_BOOTS_IN_WINDOW) {
        safetyData.safeMode = true;
        logError("🚨 CRASH LOOP DETECTED. ENTERING SAFE MODE.");
    }
    
    saveSafety();
    return safetyData.safeMode;
}

function getMemoryHealth() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const freePercent = (freeMem / totalMem) * 100;
    
    const nodeUsage = process.memoryUsage().rss;
    const nodeUsageMB = (nodeUsage / 1024 / 1024).toFixed(1);
    
    return {
        freePercent,
        nodeUsageMB,
        isStruggling: nodeUsageMB > 320
    };
}

function shouldEnableAI() {
    if (safetyData.safeMode) return false;
    if (Date.now() < safetyData.aiDisabledUntil) return false;
    
    const health = getMemoryHealth();
    if (health.isStruggling) {
        logError(`⚠️ Low Memory (${health.nodeUsageMB}MB). Temporarily disabling AI.`);
        safetyData.aiDisabledUntil = Date.now() + (5 * 60 * 1000); // 5 mins cooldown
        saveSafety();
        return false;
    }
    
    return true;
}

function resetSafeMode() {
    safetyData.safeMode = false;
    safetyData.boots = [];
    saveSafety();
}

const mediaCooldowns = new Map();
const MEDIA_COOLDOWN_MS = 5 * 1000; // 5 seconds between heavy media tasks

function checkMediaLimit(sender, feature = 'media') {
    const key = `${sender}_${feature}`;
    const now = Date.now();
    const last = mediaCooldowns.get(key) || 0;
    
    if (now - last < MEDIA_COOLDOWN_MS) {
        return { 
            allowed: false, 
            timeLeft: Math.ceil((MEDIA_COOLDOWN_MS - (now - last)) / 1000) 
        };
    }
    
    mediaCooldowns.set(key, now);
    return { allowed: true };
}

module.exports = {
    checkCrashLoop,
    getMemoryHealth,
    shouldEnableAI,
    resetSafeMode,
    logError,
    checkMediaLimit,
    getSafetyData: () => safetyData
};
