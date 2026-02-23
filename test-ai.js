require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

const key = process.env.GEMINI_API_KEY;

console.log("--- DEBUG START ---");
console.log(`Key Length: ${key ? key.length : 'NULL'}`);
console.log(`Key Start: [${key ? key.substring(0, 5) : ''}]`);
console.log(`Key End: [${key ? key.substring(key.length - 5) : ''}]`);

if (!key) {
    console.error("❌ Error: GEMINI_API_KEY is missing from .env!");
    process.exit(1);
}

// Check for whitespace
if (key.trim() !== key) {
    console.error("❌ Error: Key contains hidden whitespace or newlines!");
}

async function test() {
    try {
        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        console.log("🚀 Testing API call...");
        const result = await model.generateContent("Hello");
        console.log("✅ API Success! Response:", result.response.text());
    } catch (e) {
        console.error("❌ API Failed!");
        console.error("Status:", e.status);
        console.error("Reason:", e.reason);
        console.error("Details:", JSON.stringify(e.errorDetails, null, 2));
        console.error("Full Error:", e.message);
    }
}

test();
