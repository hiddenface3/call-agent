# 🚀 Apex Voice AI — Live Outbound Calling Handover Guide

> **Quick Summary**: The frontend UI, visual node script engine, Gemini Live speech-to-speech engine, and Telnyx telephony bridge are fully built. Both local servers are running. This document outlines the exact status and next steps to resume and execute live PSTN phone calls.

---

## 📌 1. Current Running Servers

| Service | Port / URL | Status | Launch Command |
| :--- | :--- | :---: | :--- |
| **Vite Frontend & CRM** | [http://localhost:5173](http://localhost:5173) | 🟢 **ACTIVE** | `npm run dev` |
| **Telnyx PSTN Relay** | [http://localhost:3001](http://localhost:3001) | 🟢 **ACTIVE** | `npm run relay` |
| **Relay Health API** | [http://localhost:3001/api/health](http://localhost:3001/api/health) | 🟢 **`{"status":"ok"}`** | Verified |

---

## 🛠️ 2. The 4 Relay Code Fixes Needed (`server/telnyxRelay.js`)

To bridge real Telnyx carrier audio to Google Gemini Live without packet drops:

### 🐛 Patch 1: Dynamic Public Tunnel URL (Lines 214–218)
* **Problem**: Hardcodes `req.headers.host` (`localhost:3001`), which Telnyx cloud cannot reach.
* **Fix**: Support public tunnel URL (from request payload or `PUBLIC_RELAY_URL` env variable):
  ```javascript
  const publicHost = payload.publicRelayUrl 
    ? payload.publicRelayUrl.replace(/^https?:\/\//, '') 
    : req.headers.host;

  stream_url: `wss://${publicHost}/telnyx-media`,
  webhook_url: `https://${publicHost}/api/telnyx/webhooks`,
  ```

### 🐛 Patch 2: Real Telnyx Call Control ID Mapping (Lines 229–235 & 611–618)
* **Problem**: Server keys `activeCalls` with random string `telnyx-17...`. Telnyx connects WebSocket using its real `v3:...` ID, causing `activeCalls.get()` to return `undefined`.
* **Fix**: Save Telnyx's returned `data.call_control_id` on dial and decode `client_state` on WebSocket connection.

### 🐛 Patch 3: Opening Greeting Trigger on Answer (Lines 377–380)
* **Problem**: When homeowner answers ("Hello?"), Gemini Live waits silently because no opening turn was sent.
* **Fix**: On `call.answered` webhook, send standard `clientContent` turn to Gemini Live to speak Sarah's opening script immediately.

### 🐛 Patch 4: Update Gemini Endpoint to `v1beta` (Line 441)
* **Problem**: Uses deprecated `v1alpha` GenerativeService endpoint.
* **Fix**: Change `v1alpha` to `v1beta`.

---

## 🌐 3. Public Networking (Cloudflare Tunnel)

Run in a separate terminal to give Telnyx access to your local machine:
```bash
# Free, zero-setup public HTTPS/WSS tunnel
cloudflared tunnel --url http://localhost:3001
```
*Copy the generated URL (e.g. `https://xyz-abc.trycloudflare.com`) into the App Settings.*

---

## 📞 4. Telnyx Portal Setup Checklist

1. **Balance**: Ensure at least $5.00 in [Telnyx Mission Control Portal](https://portal.telnyx.com/).
2. **Phone Number**: Buy 1 US Voice DID number (e.g. `+1 (512) ...`).
3. **Call Control App**:
   * Create application under **Voice** -> **Call Control Applications**.
   * Copy the **Connection ID / Application ID**.
   * Copy your **Telnyx V2 API Key**.
   * Assign your purchased number to this application.

---

## 🎯 5. How to Resume & Make First Live Call

1. Open [http://localhost:5173](http://localhost:5173) in your browser.
2. Click the **Gear Icon (Settings)** -> Select **Telnyx PSTN** tab:
   * Paste your **Telnyx API Key**.
   * Paste your **Connection ID**.
   * Paste your **Purchased Phone Number** (E.164 format: `+1XXXXXXXXXX`).
   * Paste your **Public Cloudflare Tunnel URL**.
   * Click **Save Settings**.
3. In the main **Call Hero** interface:
   * Switch mode to **Real Outbound Call (Telnyx PSTN)**.
   * Enter your cell phone number in the dial bar.
   * Click **Dial Live PSTN Number**.
4. Answer the phone $\rightarrow$ Sarah speaks via Gemini Live 24kHz neural voice $\rightarrow$ CRM updates dynamically in real-time.

---
*Created: September 2026 • Apex Voice AI Engine*
