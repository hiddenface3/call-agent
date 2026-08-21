# 🎙️ Apex Voice AI — Real Estate Call Agent (Node Flow Edition)

A real-time AI Voice Agent application for Windows and Web built with **Electron, React 18, TypeScript, Tailwind CSS, Interactive Visual Node Editor Canvas, and Groq Cloud LPU / Local LLMs (Ollama)**.

---

## 🚀 Key Features

- **🕸️ Interactive Visual Node Script Editor**:
  - **Drag-and-Drop Canvas**: Drag, reposition, zoom, pan, add, edit, and delete script nodes.
  - **SVG Bezier Connection Wires**: Link step ports and define condition branches (e.g. *Willing to sell* -> *Ask Bedrooms/Bathrooms*; *Not willing* -> *Ask Future Interest* -> *Politely Conclude*).
  - **Live Step Tracking**: During an active voice call, the currently active node illuminates with a neon green beacon and active path lighting.
- **🎙️ Real-Time Voice Pipeline**:
  - Live microphone streaming with speech recognition (Web Audio API & STT).
  - Voice Activity Detection (VAD) with turn-isolation locks to eliminate echo or accidental interruptions.
  - Live animated audio waveform visualizer and holographic pulsing agent ring.
- **⚡ High-Speed Cloud LPU Reasoning (Groq API)**:
  - Default model: **`openai/gpt-oss-20b`** (with fast fallback to `llama3.2:3b`).
  - Sub-200ms latency, zero local CPU strain.
- **📊 Live Lead Qualification CRM**:
  - Automatic parsing of Seller Name, Address, Specs, Timeline, and Asking Price.
  - Dynamic Qualification Score (0–100%) and Deal Status categorization (*Hot Lead*, *Warm Follow-Up*, *Nurture*).
- **🧪 Test Caller Simulator**:
  - 1-click realistic homeowner dialogue scenarios (*Motivated Seller*, *Not Selling Now Objection*, *Firm Refusal Exit*).

---

## 🛠️ Quickstart Guide

### 1. Run in Browser
```bash
npm run dev
```
Open **`http://localhost:5173`** in your browser.

### 2. Switch Views
- Click **"Node Script Editor"** in the top navbar to view and edit the visual graph.
- Click **"Call Interface"** to return to the live phone call screen.

### 3. Run as Windows Desktop Application (Electron)
```bash
npm run electron:dev
```
