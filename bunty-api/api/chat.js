const { GoogleGenerativeAI } = require("@google/generative-ai");

// Directly from ask.js
const SYSTEM_INSTRUCTION = `
    ROLE: You are Bunty v5.5, a witty Indian guy on WhatsApp.
    PERSONALITY: Casual, Hinglish, extremely concise.
    BUNTY RULES: 
    - Keep replies extremely short, direct, and conversational (max 20 words).
    - Talk like a real human on WhatsApp. Do not yap. No emoji-spam, no robotic excitement.
    - Avoid generic AI filler phrases (e.g., "Got it, boss!", "Save kar liya maine", "is officially in my system now", "Aur koi seva?"). Just be cool, dry, and direct.
    - If asked to remember something, reply with something brief like "Noted" or "Yaad rakhega".
`.trim();

// Generation parameters from ask.js
const GENERATION_CONFIG = {
    temperature: 0.8,
    topP: 0.9,
    maxOutputTokens: 80
};

// Exact fallback chain from ask.js (Line 174)
const FALLBACK_MODELS = [
    process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
    "gemini-3.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.0-flash-lite"
];

function cleanResponse(text) {
    if (!text) return "";
    return text.replace(/\[SYSTEM:.*?\]/g, '').trim();
}

module.exports = async function handler(req, res) {
    // 1. CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') {
        return res.status(405).json({
            error: "Method Not Allowed",
            message: "Only POST requests are supported."
        });
    }

    // 2. Secret Key Validation
    const clientKey = req.headers['x-api-key'] || req.headers['X-Api-Key'];
    const expectedKey = process.env.BUNTY_CLIENT_KEY;

    if (!expectedKey) {
        return res.status(500).json({
            error: "Server Configuration Error",
            message: "BUNTY_CLIENT_KEY is not configured on the server."
        });
    }

    if (!clientKey || clientKey !== expectedKey) {
        return res.status(401).json({
            error: "Unauthorized",
            message: "Missing or invalid 'x-api-key' header."
        });
    }

    // 3. Gemini API Key Check
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
        return res.status(500).json({
            error: "Server Configuration Error",
            message: "GEMINI_API_KEY is not configured on the server."
        });
    }

    // 4. Request Validation
    const body = req.body || {};
    const prompt = typeof body === 'string' ? JSON.parse(body).prompt : body.prompt;

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Field 'prompt' is required and must be a non-empty string."
        });
    }

    const history = Array.isArray(body.history) ? body.history : [];

    // 5. Model Execution with Fallback Chain
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const modelChain = [...new Set(FALLBACK_MODELS.filter(Boolean))];
    let lastError = null;

    for (const modelName of modelChain) {
        try {
            const model = genAI.getGenerativeModel({
                model: modelName,
                systemInstruction: SYSTEM_INSTRUCTION,
                generationConfig: GENERATION_CONFIG
            });

            let responseText = "";

            if (history.length > 0) {
                const chat = model.startChat({ history });
                const result = await chat.sendMessage(prompt.trim());
                responseText = result.response.text();
            } else {
                const result = await model.generateContent(prompt.trim());
                responseText = result.response.text();
            }

            const cleanedText = cleanResponse(responseText);

            return res.status(200).json({
                success: true,
                reply: cleanedText,
                model: modelName
            });
        } catch (err) {
            lastError = err;
            console.warn(`[AI FALLBACK] Model ${modelName} failed, trying next...:`, err.message || err);
        }
    }

    const isQuota = lastError?.status === 429 || lastError?.message?.includes("Quota exceeded");
    return res.status(isQuota ? 429 : 502).json({
        error: isQuota ? "Quota Exceeded" : "AI Provider Error",
        message: lastError?.message || "Failed to generate response."
    });
};
