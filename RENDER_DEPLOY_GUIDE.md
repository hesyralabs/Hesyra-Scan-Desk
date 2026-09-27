# Hesyra Scan Desk — Free Hosting & Deployment Guide

This guide explains both ways to access **Hesyra Scan Desk** online from mobile phones anywhere.

---

## Method 1: Instant Free Public Link (Live Right Now)

Your local server is currently linked via a **Cloudflare Free Secure Tunnel**:

* **Live Mobile Access URL:** `https://belts-belt-rough-martial.trycloudflare.com`
* **Local Backend URL:** `http://localhost:3005`
* **Google Drive Target:** `G:\My Drive\Hesyra Invoices\Hesyra_Master_Billing.xlsx`

### Benefits:
1. **Direct Google Drive Integration:** Because it runs on your machine, any scan submitted from a technician's mobile phone writes directly and instantaneously into `G:\My Drive\Hesyra Invoices\Hesyra_Master_Billing.xlsx` and `Hesyra_Field_Scan_Orders.xlsx`!
2. **Zero Cost & No Setup:** Completely free forever with automatic HTTPS SSL.
3. **1-Click Future Launch:** Double-click `start-public-server.bat` in the project folder whenever you want to start the server and tunnel.

---

## Method 2: 24/7 Standalone Cloud Server (Render.com)

If you want the web app to run 24 hours a day, 7 days a week in the cloud even when your PC is turned off:

### Step 1: Push this folder to a GitHub Repository
1. Install [Git for Windows](https://git-scm.com/download/win) if not already installed.
2. In this folder (`C:\Users\admin\Desktop\Hesyra Scan Desk`), initialize and push:
   ```bash
   git init
   git add .
   git commit -m "Initial commit for Hesyra Scan Desk"
   git remote add origin https://github.com/<your-username>/hesyra-scan-desk.git
   git branch -M main
   git push -u origin main
   ```

### Step 2: Deploy for Free on Render.com
1. Go to [https://render.com](https://render.com) and sign up for a free account.
2. Click **New +** > **Web Service**.
3. Connect your GitHub account and select your `hesyra-scan-desk` repository.
4. Render will automatically read `render.yaml`:
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Plan:** `Free` ($0/month)
5. Click **Create Web Service**.
6. Within 2 minutes, your web app will be live at:
   `https://hesyra-scan-desk.onrender.com`

### Step 3: Google Drive Sync from Cloud
Because cloud servers cannot see physical drive letters like `G:\`, your cloud instance syncs seamlessly via the built-in **Google Apps Script Webhook**:
1. Open the web app on Render.
2. Click **⚙️ Google Sheets Sync** in the top toolbar.
3. Copy the 1-click Google Apps Script and paste your Google Webhook URL.
4. Every case enrolled on phones anywhere will automatically append rows into your Google Sheet in Google Drive in real-time!
