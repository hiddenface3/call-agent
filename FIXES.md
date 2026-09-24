# 🛠️ Apex Voice AI Agent — Fixes & Architecture History Log

A clean, easy-to-read chronological record of problems identified, root causes, and technical resolutions implemented in the project.

---

## 📌 Milestone 1: Voice Interruption & Audio Latency Fix
* **🐛 The Problem**: When the user spoke into the microphone while the agent was speaking, the agent talked over the user, the user's transcript did not appear, and speech was delayed.
* **🛠️ The Fix**:
  1. Implemented **Barge-in / Speech Interrupt Detection** in `speechService.ts`.
  2. When user starts speaking (`speechSynthesis.speaking === true`), `window.speechSynthesis.cancel()` immediately cuts off the agent's voice.
  3. Increased Web Speech recognition restart stability with silence auto-pause.
* **✅ Result**: Smooth, human-like turn-taking with instant agent cut-off when the user speaks.

---

## 📌 Milestone 2: Dynamic CRM Variable Extraction & CSV Export
* **🐛 The Problem**: Extracted data was limited to static fields. Adding new prompt placeholders (e.g. `{{property_details}}`, `{{callback_time}}`, `{{mortgage_balance}}`) didn't automatically extract data or allow CSV export.
* **🛠️ The Fix**:
  1. Built `LeadExtractor` with regex heuristics for `propertyDetails`, `callbackTime`, `askingPrice`, `clientName`, `propertyAddress`, and dynamic variables.
  2. Built a dynamic custom variable creator in `NodeEditModal.tsx` (`+ Add Custom Variable`).
  3. Created CRM Table views with dynamic variable rows and 1-click **Download Lead CSV** (`downloadLeadCsv()`).
  4. Added regex tag stripping in `ollamaService.ts` so Sarah speaks clean words without pronouncing `{{curly_brackets}}`.
* **✅ Result**: Users can add unlimited custom dynamic variables and download structured lead CSVs.

---

## 📌 Milestone 3: Premature Node Advancement on Identity Questions ("Who Are You?")
* **🐛 The Problem**: When the homeowner asked *"Who are you? Who are you calling? Why are you calling me?"*, neither `agree` nor `disagree` was satisfied, but the agent blindly advanced to Step 2 (Bedrooms & Bathrooms) and Step 3 (Pricing).
* **🛠️ The Fix**:
  1. Added `isIdentityOrClarificationQuestion(text)` to detect caller identity inquiries.
  2. Injected **Identity Clarification Rules** into the LLM system instructions:
     * Sarah clarifies: *"This is Sarah calling from Property Care. We're reaching out to local homeowners to see if you'd be open to considering an offer on your property."*
     * Sarah politely repeats the active step's question.
     * Enforces `[NEXT_NODE: STAY]` so the workflow stays on Step 1 until the caller genuinely agrees or disagrees.
  3. Updated `evaluateDeterministicTransition()` to block node jumps on identity questions.
* **✅ Result**: Sarah now answers who she is and why she is calling, staying on the current step until the customer provides a real answer.

---

## 📌 Milestone 4: Partial Answer Completion & Dynamic Rephrasing Engine
* **🐛 The Problem**: On multi-part questions (e.g., Step 2 asks: *"How many bedrooms and bathrooms does the property have, and does it need any major repairs or updates?"*), if the customer only answered the repairs part (*"No, it doesn't need any repairs"*), the agent previously jumped forward to pricing, skipping the bedroom/bathroom count entirely.
* **🛠️ The Fix (Approach 2: Live Slot Blackboard + Approach 3: CoT Pre-Reasoning)**:
  1. **Live Slot Blackboard (`LeadExtractor.generateBlackboardSummary`)**:
     * Injects a real-time checklist into the LLM prompt on every turn showing collected vs missing fields:
       ```
       === LIVE CALL DATA BLACKBOARD ===
       - Condition/Repairs: ["No major repairs, good shape"]
       - Bedrooms/Bathrooms: [MISSING]
       - Status: INCOMPLETE
       ```
  2. **Chain-of-Thought (CoT) Pre-Reasoning (`<reasoning>...</reasoning>`)**:
     * Forces the LLM to inspect what was answered vs what is still missing before formulating speech.
     * Filters `<reasoning>` from audio so speech output is 100% clean.
  3. **Dynamic Rephrased Follow-Up**:
     * When partial info is received, Sarah **acknowledges what was answered** and **naturally rephrases the missing question**:
       > *"Glad to hear it's in good shape! And roughly how many bedrooms and bathrooms does the house have?"*
     * Stays on `[NEXT_NODE: STAY]` until all required details are confirmed.
* **✅ Result**: Zero premature node jumping; Sarah systematically captures all required lead info without robotic repetition.

---

## 📌 Milestone 6: Elimination of Duplicate Intro Greetings & Redundant Script Stacking
* **🐛 The Problem**: When the caller asked *"Who are you?"*, Sarah responded with:
  > *"This is Sarah with Property Care. We are reaching out to local homeowners to see if you'd be open to considering an offer on your property. **Hi, this is Sarah from Property Care. Are you open to considering selling your property for the best price?**"*
  The agent was introducing herself twice in the very same reply because fallback templates and prompt instructions were blindly concatenating the raw static node script onto the clarification sentence.
* **🛠️ The Fix**:
  1. Built `getIdentityClarificationSpeech(activeNode)` in `ollamaService.ts` to return one single, clean, contextual clarification sentence:
     * *Greeting step*: *"This is Sarah calling from Property Care. We're reaching out to local homeowners to see if you'd be open to considering a cash offer on your property."*
     * *Other steps*: Reminds who she is and asks the step question directly without repeating the full intro.
  2. Removed all hardcoded string appends (`${getCleanScriptSpeech(activeNode.agentPrompt)}`) across fallback and completion blocks in `ollamaService.ts`.
  3. Updated system instructions in `promptCompiler.ts` and `ollamaService.ts` to forbid duplicate greeting sentences.
* **✅ Result**: Zero double introductions. Sarah answers identity questions concisely in 1 natural sentence and stays on the active node.

## 📌 Milestone 7: Pure Dynamic AI Graph Decision Engine (No Hardcoded Node IDs)
* **🐛 The Problem**: When the user added custom nodes and branch conditions on the visual canvas (e.g. Node 4 "Asking Price & Timeline" connecting to Node 6 "Senior Buyer Callback" via *"Shares price or timeline"* AND to a new node "pricing offer" (`node-1787261927173`) via *"pricing ask"*), the system ignored the custom "pricing ask" branch when the user said *"How much you are going to offer me"*, and stayed trapped in a loop repeating *"Understood! What ballpark price range are you hoping to get for the property?"*.
* **🛠️ The Fix**:
  1. **Dynamic Blackboard (`LeadExtractor.generateBlackboardSummary`)**: Removed all hardcoded `if (activeNode.id === 'node-pricing-timeline')` prompt overrides that forced `STAY`. Now dynamically presents all outgoing canvas branches to the AI.
  2. **Dynamic Graph Decision Matrix (`systemInstruction`)**:
     * Feeds all active node branches, target scripts, and condition descriptions directly to the LLM.
     * The LLM uses Chain-of-Thought `<reasoning>` to evaluate user intent against every outgoing branch:
       * If user asks *"How much you are going to offer me"*, the AI recognizes it matches the *"pricing ask"* branch ➔ Routes to `[NEXT_NODE: node-1787261927173]` and speaks the pricing offer response!
       * If user says *"I want 2 million"*, the AI recognizes it matches the *"Shares price or timeline"* branch ➔ Routes to `[NEXT_NODE: node-senior-buyer]` and schedules the senior buyer callback!
  3. **Dynamic Branch Evaluator (`evaluateDeterministicTransition` & `runLocalSmartAgent`)**:
     * Evaluates custom transition labels (`pricing ask`, `offer inquiry`, `objection`, `timeline`, `agree`, `disagree`, etc.) dynamically without static node ID restrictions.
* **✅ Result**: 100% dynamic, canvas-driven AI routing. You can add any custom nodes, branch conditions, or inquiry handlers, and Sarah will reason through the user's intent and route to the correct node automatically.

## 📌 Milestone 8: Natural Timeline & Closing Phrase Recognition + Elimination of Double "Got It!"
* **🐛 The Problem**: When the caller provided a closing timeframe like *"I would like to close the cell in two weeks"* or *"I would like to close the cell in less than two weeks"*, the agent failed to transition to Node 6 (Senior Buyer Callback) and instead looped on Node 4, repeatedly saying:
  > *"Got it! Got it! What ballpark cash price do you have in mind, and how quickly would you ideally like to close the sale?"*
* **🛠️ The Fix**:
  1. **Expanded Timeline & Closing Phrases**: Added recognition for natural closing and timeline statements (`week`, `weeks`, `month`, `months`, `day`, `days`, `two weeks`, `less than two weeks`, `close`, `closing`, `timeframe`, `soon`, `asap`, `fast`, `flexible`, `urgent`, `quick`, etc.) across `evaluateDeterministicTransition` and the LLM prompt.
  2. **Eliminated Double "Got It!"**: Removed hardcoded `"Got it!"` string prefix concatenation in fallback handlers, ensuring prompts that already begin with *"Got it!"* are never doubled.
  3. **Guaranteed Branch Advance**: When any closing timeframe is shared, the agent acknowledges the timeline and transitions smoothly to Node 6 (`node-senior-buyer`) to schedule the acquisitions manager callback.
* **✅ Result**: Statements like *"I would like to close in two weeks"* immediately advance the call to Senior Buyer Callback without stuttering or double phrases.

---

## 📌 Milestone 9: Gemini 3.1 Flash Live Integration (Native Speech-to-Speech + Thinking Mode)
* **🐛 The Problem**: Previous architecture relied on a fragmented, multi-stage pipeline (`Web Speech API STT` ➔ `Cloud LPU LLM` ➔ `Browser SpeechSynthesis TTS`). This created unavoidable roundtrip latency, robotic browser voices, disjointed pauses, and lacked the ability for the model to natively process audio intonation or perform native thinking on speech input.
* **🛠️ The Fix**: Built a native bidirectional WebSocket streaming architecture powered by **Google Gemini 3.1 Flash Live Preview (`gemini-3.1-flash-live-preview`)**:
  1. **Bidirectional WebSocket Pipeline (`GeminiLiveService.ts`)**:
     * Connects directly to `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent`.
     * Negotiates initial `setup` frame specifying `models/gemini-3.1-flash-live-preview`, `responseModalities: ["AUDIO"]`, voice persona (`Aoede`, `Puck`, `Charon`, `Fenrir`, `Kore`), and real-time audio transcription configs.
  2. **Live 16kHz PCM Audio Ingestion**:
     * Captures browser microphone via Web Audio API, dynamically resamples to 16kHz Int16 Little-Endian mono PCM, and streams live base64 audio chunks via `{ realtimeInput: { audio: { mimeType: 'audio/pcm;rate=16000', data } } }`.
  3. **High-Fidelity 24kHz Native Audio Playback & Jitter Queue**:
     * Receives raw 24kHz 16-bit PCM chunks in `serverContent.modelTurn.parts` (`inlineData.data`).
     * Decodes and schedules jitter-free playback via Web Audio API `AudioBufferSourceNode` connected directly to the pulsing `analyserNode` visualizer.
  4. **Native Audio Thinking Engine**:
     * Implements configurable `thinkingConfig.thinkingLevel` (`minimal`, `low`, `medium`, `high`) allowing Gemini to perform deep reasoning on seller objections before and during speech delivery.
  5. **Instant Barge-in Interruption**:
     * Listens for `serverContent.interrupted === true` from Gemini Live; automatically aborts active audio sources and flushes the playback queue the exact millisecond the user interrupts.
  6. **Real-Time CRM & Transcript Sync**:
     * Streams user speech via `inputTranscription` and agent speech via `outputTranscription`.
     * Automatically feeds live transcripts into `LeadExtractor.extractLeadInfo()` to update seller name, property specifications, asking price, closing timeline, and qualification score in real time.
---

## 📌 Milestone 10: Elimination of Old Windows Voice TTS Leakage + Unified Model Control Hub
* **🐛 The Problem**:
  1. When testing calls with Gemini Live selected and an API key provided, the user still heard the old robotic Windows browser voice (`SpeechSynthesis`) instead of Gemini Live's native 24kHz neural voice (`Aoede`/`Puck`/`Charon`).
  2. Investigation revealed three root causes:
     * **Protocol Schema Mismatch**: `geminiLiveService.ts` attempted to send text triggers via `{ realtimeInput: { text } }` which is invalid in the Gemini Live WebSocket API (`BidiGenerateContent`). The API requires `{ clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true } }`. Because of this, the server ignored the prompt and never sent audio chunks.
     * **Test Drawer TTS Fallback**: The canvas test drawer (`FlowTestSimulator.tsx`) called `SpeechService.speak()` which triggered `window.speechSynthesis`.
     * **Unsynchronized Audio Completion**: The server sent `turnComplete` hundreds of milliseconds before the queued 24kHz audio buffers actually finished playing through the speakers, causing turn collision.
  3. Model configuration was hidden away in a secondary modal rather than being conveniently accessible on the sidebar.
* **🛠️ The Fix**:
  1. **Strict Zero-TTS Guard (`speechService.ts`)**:
     * Added an ironclad check in `SpeechService.speak()` that immediately returns if `config.provider === 'gemini_live'`, completely eliminating browser `SpeechSynthesis` and Windows voices.
  2. **Compliant WebSocket `clientContent` Messages (`geminiLiveService.ts`)**:
     * Rewrote greeting trigger and `sendRealtimeText()` to use official Google BidiGenerateContent `clientContent` turn format with `turnComplete: true`.
     * Added resilient model string handling: ensures model begins with `models/` and defaults smoothly to `gemini-2.0-flash-exp` / `gemini-3.1-flash-live-preview`.
     * Added audio buffer playback synchronization: `onTurnComplete` now waits until `nextPlaybackTime - audioContext.currentTime` completes before releasing the turn.
  3. **Unified Side Model Control Hub (`ModelControlHub.tsx`)**:
     * Built a dedicated control card placed prominently on the left sidebar in `App.tsx` above `CallHero`.
     * **Gemini Live Tab**: Configure live voice model (`gemini-2.0-flash-exp`, `gemini-3.1-flash-live-preview`), prebuilt voice (`Aoede`, `Puck`, `Charon`, `Fenrir`, `Kore`), Google Gemini API key (with show/hide and validation badge), and reasoning thinking depth (`minimal`, `low`, `medium`, `high`).
     * **Groq Cloud Tab**: Configure text-based LPU models (`llama-3.3-70b-versatile`, `openai/gpt-oss-20b`), Groq API key, and browser TTS voices.
     * **Local Ollama Tab**: Configure offline endpoint and local model tags.
  4. **Canvas Test Call Drawer Engine Integration (`FlowTestSimulator.tsx`)**:
     * Added a direct 1-click engine switch (`Gemini Live` vs `Groq Text`) and voice selector directly inside the test drawer header with inline API key entry.
* **✅ Result**: Test calls and live sessions speak strictly using Gemini Live's crystal-clear 24kHz neural audio with zero Windows voice leakage, and all model settings are centralized in one convenient place on the side.

---

*Last Updated: September 2026*

