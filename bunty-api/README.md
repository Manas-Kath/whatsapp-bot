# Bunty AI - Serverless Proxy API

A lightweight, secure Vercel Serverless API proxy for **Bunty AI**. It lets third-party clients (like your friend's app) chat with Bunty while:
- **Protecting your proprietary system instructions** (never exposed to the client).
- **Using the friend's Gemini API key** or dedicated environment variable (preserving your own quota).
- **Enforcing client authentication** via `x-api-key`.
- **Handling automatic model fallbacks** across Gemini models.

---

## 🚀 Quick Deployment to Vercel

### Option 1: Deploy via Vercel CLI (Fastest, 1 minute)
1. Open terminal inside this `bunty-api` directory:
   ```bash
   cd bunty-api
   ```
2. Run:
   ```bash
   npx vercel
   ```
3. Follow the prompts to log in and deploy.
4. Set the environment variables in Vercel dashboard (or via CLI):
   ```bash
   npx vercel env add GEMINI_API_KEY
   npx vercel env add BUNTY_CLIENT_KEY
   ```
5. Deploy to production:
   ```bash
   npx vercel --prod
   ```

### Option 2: Deploy via GitHub
1. Push this folder or create a new GitHub repo containing these files (`package.json`, `vercel.json`, `api/chat.js`).
2. Go to [vercel.com](https://vercel.com/) $\rightarrow$ **Add New Project** $\rightarrow$ Import your repo.
3. Under **Settings $\rightarrow$ Environment Variables**, configure:
   - `GEMINI_API_KEY`: *(The Gemini API key from Google AI Studio)*
   - `BUNTY_CLIENT_KEY`: *(Secret authorization token, e.g. `bunty_app_key_8832`)*
   - *(Optional)* `GEMINI_MODEL`: `gemini-2.5-flash`
4. Click **Deploy**.

---

## 📡 API Integration Reference (For Your Friend)

### Endpoint Details
- **URL:** `https://<your-project-name>.vercel.app/api/chat`
- **Method:** `POST`
- **Headers:**
  ```http
  Content-Type: application/json
  x-api-key: YOUR_BUNTY_CLIENT_KEY
  ```

---

### Request Payload

#### 1. Single Message
```json
{
  "prompt": "Bhai kal cricket chalega?"
}
```

#### 2. Multi-turn Chat with History (Optional)
```json
{
  "prompt": "Mera naam yaad hai?",
  "history": [
    {
      "role": "user",
      "parts": [{ "text": "Mera naam Rohit hai" }]
    },
    {
      "role": "model",
      "parts": [{ "text": "Haan Rohit bhai, yaad hai." }]
    }
  ]
}
```

---

### Response Format

#### Success (`200 OK`)
```json
{
  "success": true,
  "reply": "Haan bhai, bilkul chalega. Kitne baje?",
  "model": "gemini-2.5-flash"
}
```

#### Unauthorized (`401 Unauthorized`)
```json
{
  "error": "Unauthorized",
  "message": "Missing or invalid 'x-api-key' header."
}
```

#### Bad Request (`400 Bad Request`)
```json
{
  "error": "Bad Request",
  "message": "Field 'prompt' is required and must be a non-empty string."
}
```

---

## 💻 Code Examples

### cURL
```bash
curl -X POST "https://<your-project-name>.vercel.app/api/chat" \
     -H "Content-Type: application/json" \
     -H "x-api-key: YOUR_BUNTY_CLIENT_KEY" \
     -d '{"prompt": "Bhai kya scene hai?"}'
```

### JavaScript / Node.js
```javascript
const response = await fetch("https://<your-project-name>.vercel.app/api/chat", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": "YOUR_BUNTY_CLIENT_KEY"
  },
  body: JSON.stringify({
    prompt: "Bhai kya scene hai?"
  })
});

const data = await response.json();
console.log(data.reply);
```

### Python
```python
import requests

url = "https://<your-project-name>.vercel.app/api/chat"
headers = {
    "Content-Type": "application/json",
    "x-api-key": "YOUR_BUNTY_CLIENT_KEY"
}
payload = {
    "prompt": "Bhai kya scene hai?"
}

response = requests.post(url, json=payload, headers=headers)
print(response.json().get("reply"))
```
