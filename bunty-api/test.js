require('dotenv').config({ path: '../.env' });
const handler = require('./api/chat');

// Mock request and response helpers
function createMockReqRes({ method = 'POST', headers = {}, body = {} }) {
    let statusCode = 200;
    let responseData = null;
    const responseHeaders = {};

    const req = {
        method,
        headers,
        body
    };

    const res = {
        setHeader: (k, v) => { responseHeaders[k] = v; },
        status: (code) => {
            statusCode = code;
            return res;
        },
        json: (data) => {
            responseData = data;
            return res;
        },
        end: () => {
            return res;
        },
        _getData: () => ({ statusCode, responseData, responseHeaders })
    };

    return { req, res };
}

async function runTests() {
    process.env.BUNTY_CLIENT_KEY = process.env.BUNTY_CLIENT_KEY || "test_secret_bunty_123";

    console.log("=== Running Bunty API Local Tests ===\n");

    // Test 1: Reject GET request
    {
        const { req, res } = createMockReqRes({ method: 'GET' });
        await handler(req, res);
        const { statusCode, responseData } = res._getData();
        console.log(`[TEST 1] GET method rejection: ${statusCode === 405 ? 'PASSED (405)' : 'FAILED (' + statusCode + ')'}`);
    }

    // Test 2: Reject without x-api-key
    {
        const { req, res } = createMockReqRes({
            method: 'POST',
            headers: {},
            body: { prompt: "Hello" }
        });
        await handler(req, res);
        const { statusCode, responseData } = res._getData();
        console.log(`[TEST 2] Missing API Key rejection: ${statusCode === 401 ? 'PASSED (401)' : 'FAILED (' + statusCode + ')'}`);
    }

    // Test 3: Reject invalid x-api-key
    {
        const { req, res } = createMockReqRes({
            method: 'POST',
            headers: { 'x-api-key': 'wrong_key' },
            body: { prompt: "Hello" }
        });
        await handler(req, res);
        const { statusCode, responseData } = res._getData();
        console.log(`[TEST 3] Invalid API Key rejection: ${statusCode === 401 ? 'PASSED (401)' : 'FAILED (' + statusCode + ')'}`);
    }

    // Test 4: Reject missing prompt
    {
        const { req, res } = createMockReqRes({
            method: 'POST',
            headers: { 'x-api-key': process.env.BUNTY_CLIENT_KEY },
            body: {}
        });
        await handler(req, res);
        const { statusCode, responseData } = res._getData();
        console.log(`[TEST 4] Empty prompt rejection: ${statusCode === 400 ? 'PASSED (400)' : 'FAILED (' + statusCode + ')'}`);
    }

    // Test 5: Real Gemini API generation (if GEMINI_API_KEY is available)
    if (process.env.GEMINI_API_KEY) {
        console.log("\nTesting live generation with Gemini...");
        const { req, res } = createMockReqRes({
            method: 'POST',
            headers: { 'x-api-key': process.env.BUNTY_CLIENT_KEY },
            body: { prompt: "Bhai kya haal chaal?" }
        });
        await handler(req, res);
        const { statusCode, responseData } = res._getData();
        console.log(`[TEST 5] Live API response (Status: ${statusCode}):`);
        console.log(JSON.stringify(responseData, null, 2));
    } else {
        console.log("\n[TEST 5] Skipped live Gemini test (No GEMINI_API_KEY found in .env).");
    }

    console.log("\n=== Tests Completed ===");
}

runTests();
