# Google Sheets Two-Way Sync Guide for Bunty Bot

Bunty keeps your local SQLite database and your Google Sheet ("Sale Log") **in two-way synchronization in real-time**:
1. **WhatsApp $\rightarrow$ Google Sheet:** Every time a family member records a sale or settles a payment on WhatsApp, Bunty instantly appends or updates the row in your Google Sheet.
2. **Google Sheet / Form $\rightarrow$ WhatsApp / Database:** If someone fills the Google Form or types into the Google Sheet directly, Bunty automatically imports those new entries into the database (via periodic 10-minute check or `.biz sync`).

---

## 🚀 2-Minute Setup

### Step 1: Open Google Apps Script
1. Open your existing Google Sheet (e.g. `Sale Log (Responses)`).
2. In the top menu, click **Extensions** $\rightarrow$ **Apps Script**.

### Step 2: Paste the Sync Script
1. Delete any default code in `Code.gs`.
2. Open [`lib/biz/google-sheet-script.js`](./lib/biz/google-sheet-script.js) in this repo, copy all its contents, and paste it into `Code.gs`.
3. Click the **Save** icon (diskette).

### Step 3: Deploy as Web App
1. Click the blue **Deploy** button (top right) $\rightarrow$ **New deployment**.
2. Click the **Gear icon** next to "Select type" $\rightarrow$ choose **Web app**.
3. Fill in:
   - **Description:** `Bunty Bot Sync`
   - **Execute as:** `Me (your Google email)`
   - **Who has access:** `Anyone`
4. Click **Deploy**.
5. Grant permissions when prompted by Google (click *Advanced* $\rightarrow$ *Go to Bunty Bot Sync (unsafe)* $\rightarrow$ *Allow*).
6. **Copy the Web App URL** (looks like `https://script.google.com/macros/s/AKfycb.../exec`).

### Step 4: Link URL with Bunty
You can link it directly from WhatsApp! Send:
```text
.biz setsheet https://script.google.com/macros/s/AKfycb.../exec
```

*(Alternatively, add `GOOGLE_SHEET_WEBAPP_URL=https://script.google.com/...` into your `.env` file).*

---

## 📋 Available Commands

* **`.biz sync`** — Manually triggers an immediate two-way pull from the Google Sheet and reports new entries.
* **`.biz setsheet <url>`** — Updates the Google Sheet Web App URL.
* **`.biz status`** — Displays whether Google Sheets sync is active.
* **`.biz export`** — Views raw CSV export matching Google Form layout.
* **`.biz summary`** — Views today's total sales, cash vs UPI collections, and pending amounts.
