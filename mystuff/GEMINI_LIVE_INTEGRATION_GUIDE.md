# Gemini 3.1 Flash Live Integration Guide (Speech-to-Speech)

> **Target Audience**: AI Agents & Engineers building a real-time conversational voice system.  
> **Scope**: Implementation of the **Gemini 3.1 Flash Live Preview** bidirectional audio model, API key configuration, service architecture, and a local microphone/speaker testing harness.  
> **Exclusions**: Telephony carriers (Twilio, Vonage, Telnyx) are omitted here to keep the initial implementation focused and verified locally.

---

## 1. Architectural Blueprint & Philosophy

In conventional voice AI, the pipeline uses three distinct cascading services:
$$\text{User Audio} \longrightarrow \text{STT (Deepgram)} \longrightarrow \text{Text LLM (GPT-4o)} \longrightarrow \text{TTS (ElevenLabs)} \longrightarrow \text{Audio Out}$$
*Latency: 1200ms – 2500ms*

In Dograh's **Realtime Speech-to-Speech Architecture**, Gemini Live consolidates all three into a single native neural audio stream:
$$\text{Raw PCM (16 kHz)} \longleftrightarrow \text{Gemini 3.1 Flash Live Session} \longleftrightarrow \text{Raw PCM (24 kHz)}$$
*Latency: 300ms – 700ms*

### Dograh Design Principles to Replicate:
1. **Decoupled Configuration**: Store API keys, models, and voices in a dedicated registry / configuration model. Never hardcode credentials.
2. **Single Service Abstraction**: The core engine implements a standard interface (`connect()`, `sendAudio()`, `receive()`, `close()`) so transports (local mic vs. WebSocket vs. WebRTC) are interchangeable.
3. **Dual-Model Architecture**:
   - **Realtime Model (`gemini-3.1-flash-live-preview`)**: Dedicated exclusively to interactive voice conversation.
   - **Auxiliary Text Model (`gemini-3.5-flash` or similar)**: Used for asynchronous, out-of-band JSON extraction, CRM variable saving, or summarization without interrupting live speech.
4. **Interruption / Barge-in Management**: When the user speaks while the model is responding, the model signals an interruption event. The local audio buffer must instantly flush output playback.

---

## 2. Model Specifications & Registry Setup

### Model Identifier
- **Model Name**: `gemini-3.1-flash-live-preview` (Google AI Studio)
- **Protocol**: Bidirectional Streaming WebSockets via Google GenAI SDK

### Prebuilt Voices
Gemini Live provides 5 native neural voices (configured via `speechConfig`):
- `Puck` (Energetic, natural male tone)
- `Charon` (Deep, calm male tone)
- `Kore` (Clear, warm female tone)
- `Fenrir` (Authoritative male tone)
- `Aoede` (Soft, expressive female tone)

### Audio Format Standards
- **Input (User Mic ➔ Gemini)**:
  - Format: Raw PCM (Linear PCM)
  - Sample Rate: `16000 Hz` (16 kHz)
  - Bit Depth: `16-bit` signed integer, Little-Endian
  - Channels: `1` (Mono)
  - MIME: `audio/pcm;rate=16000`
- **Output (Gemini ➔ Speaker)**:
  - Format: Raw PCM (Linear PCM)
  - Sample Rate: `24000 Hz` (24 kHz)
  - Bit Depth: `16-bit` signed integer, Little-Endian
  - Channels: `1` (Mono)

---

## 3. Configuration & API Key Architecture

In your project structure, keep the configuration clean and typed.

### File Structure:
```
src/
├── config/
│   ├── aiModelConfig.ts      (or ai_model_config.py)
│   └── options.ts            (Model names, voice constants)
├── services/
│   ├── geminiLiveService.ts  (The Live WebSocket adapter)
│   └── toolRegistry.ts       (Function calling schemas)
└── harness/
    └── localAudioHarness.ts  (Microphone & Speaker test runner)
```

### Configuration Schema (TypeScript Example)

```typescript
export interface RealtimeModelConfig {
  provider: 'google_realtime';
  apiKey: string;
  model: string;            // 'gemini-3.1-flash-live-preview'
  voice: 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Aoede';
  language?: string;        // 'en', 'es', 'fr', etc.
  systemInstruction?: string;
  temperature?: number;     // Optional
}

export interface AppAIConfig {
  mode: 'realtime' | 'pipeline';
  realtime: RealtimeModelConfig;
  auxiliaryLlm?: {
    apiKey: string;
    model: string;          // e.g. 'gemini-3.5-flash' for background JSON extraction
  };
}
```

### Environment Variable Loading (`.env`)
```bash
GEMINI_API_KEY=AIzaSy...
GEMINI_LIVE_MODEL=gemini-3.1-flash-live-preview
GEMINI_LIVE_VOICE=Puck
```

---

## 4. Live Service Implementation

This service manages the WebSocket lifecycle with Google's servers, sends audio chunks, and dispatches audio/text/interruption events.

### Implementation: TypeScript (`@google/genai`)

#### Prerequisites:
```bash
npm install @google/genai dotenv
```

#### Code: `src/services/geminiLiveService.ts`

```typescript
import { GoogleGenAI } from '@google/genai';

export interface GeminiLiveCallbacks {
  onAudioData: (pcm24kBuffer: Buffer) => void;
  onUserTranscript?: (text: string) => void;
  onModelTranscript?: (text: string) => void;
  onInterrupted?: () => void;
  onError?: (error: any) => void;
  onClose?: () => void;
}

export class GeminiLiveService {
  private ai: GoogleGenAI;
  private session: any = null;
  private model: string;
  private voice: string;
  private systemInstruction: string;
  private callbacks: GeminiLiveCallbacks;

  constructor(options: {
    apiKey: string;
    model?: string;
    voice?: string;
    systemInstruction?: string;
    callbacks: GeminiLiveCallbacks;
  }) {
    this.ai = new GoogleGenAI({ apiKey: options.apiKey });
    this.model = options.model || 'gemini-3.1-flash-live-preview';
    this.voice = options.voice || 'Puck';
    this.systemInstruction = options.systemInstruction || 'You are a helpful, conversational voice assistant.';
    this.callbacks = options.callbacks;
  }

  public async connect(): Promise<void> {
    const liveConfig = {
      model: this.model,
      config: {
        responseModalities: ['audio'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: this.voice,
            },
          },
        },
        systemInstruction: {
          parts: [{ text: this.systemInstruction }],
        },
      },
      callbacks: {
        onopen: () => {
          console.log('✅ Connected to Gemini 3.1 Live API');
        },
        onmessage: (event: any) => {
          this.handleServerMessage(event);
        },
        onerror: (err: any) => {
          console.error('❌ Gemini Live WebSocket Error:', err);
          if (this.callbacks.onError) this.callbacks.onError(err);
        },
        onclose: () => {
          console.log('🔌 Gemini Live Connection Closed');
          if (this.callbacks.onClose) this.callbacks.onClose();
        },
      },
    };

    this.session = await this.ai.live.connect(liveConfig);
  }

  private handleServerMessage(message: any) {
    const serverContent = message?.serverContent;
    if (!serverContent) return;

    // 1. Interruption Detection (Barge-In)
    if (serverContent.interrupted) {
      console.log('⚡ User interrupted model speech');
      if (this.callbacks.onInterrupted) {
        this.callbacks.onInterrupted();
      }
      return;
    }

    // 2. Synthesized Audio Chunks (24kHz Mono PCM)
    if (serverContent.modelTurn?.parts) {
      for (const part of serverContent.modelTurn.parts) {
        if (part.inlineData?.data) {
          const rawPcm = Buffer.from(part.inlineData.data, 'base64');
          this.callbacks.onAudioData(rawPcm);
        }
      }
    }

    // 3. Native Transcriptions
    if (serverContent.inputTranscription?.text) {
      if (this.callbacks.onUserTranscript) {
        this.callbacks.onUserTranscript(serverContent.inputTranscription.text);
      }
    }
    if (serverContent.outputTranscription?.text) {
      if (this.callbacks.onModelTranscript) {
        this.callbacks.onModelTranscript(serverContent.outputTranscription.text);
      }
    }
  }

  /**
   * Stream raw microphone PCM audio to Gemini
   * @param pcmChunk 16kHz, 16-bit mono PCM buffer
   */
  public sendAudioChunk(pcmChunk: Buffer): void {
    if (!this.session) return;
    this.session.sendRealtimeInput({
      audio: {
        data: pcmChunk.toString('base64'),
        mimeType: 'audio/pcm;rate=16000',
      },
    });
  }

  /**
   * Send text message or trigger an initial greeting
   */
  public sendTextMessage(text: string): void {
    if (!this.session) return;
    this.session.sendRealtimeInput({ text });
  }

  public async disconnect(): Promise<void> {
    if (this.session) {
      try {
        await this.session.close();
      } catch (err) {
        // ignore
      }
      this.session = null;
    }
  }
}
```

---

### Implementation: Python (`google-genai`)

If the target agent is working in Python, here is the exact equivalent:

#### Prerequisites:
```bash
pip install google-genai
```

#### Code: `services/gemini_live_service.py`

```python
import asyncio
from google import genai
from google.genai import types

class GeminiLiveService:
    def __init__(self, api_key: str, voice: str = "Puck", system_instruction: str = "You are a helpful assistant."):
        self.client = genai.Client(api_key=api_key)
        self.model = "gemini-3.1-flash-live-preview"
        self.voice = voice
        self.system_instruction = system_instruction
        self.session = None

    async def connect(self, on_audio_callback, on_transcript_callback=None, on_interrupt_callback=None):
        config = types.LiveConnectConfig(
            response_modalities=[types.Modality.AUDIO],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=self.voice)
                )
            ),
            system_instruction=types.Content(
                parts=[types.Part(text=self.system_instruction)]
            ),
        )

        async with self.client.aio.live.connect(model=self.model, config=config) as session:
            self.session = session
            async for response in session.receive():
                content = response.server_content
                if not content:
                    continue

                if content.interrupted and on_interrupt_callback:
                    on_interrupt_callback()
                    continue

                if content.model_turn:
                    for part in content.model_turn.parts:
                        if part.inline_data:
                            on_audio_callback(part.inline_data.data)

                if on_transcript_callback:
                    if content.input_transcription:
                        on_transcript_callback("User", content.input_transcription.text)
                    if content.output_transcription:
                        on_transcript_callback("Model", content.output_transcription.text)

    async def send_audio(self, pcm_16k_bytes: bytes):
        if self.session:
            await self.session.send_realtime_input(
                audio=types.Blob(data=pcm_16k_bytes, mime_type="audio/pcm;rate=16000")
            )
```

---

## 5. Local Audio Test Harness (Microphone & Speaker)

To test the system immediately on a local workstation using your own hardware (without needing any phone numbers or Twilio):

### Required Node packages:
```bash
npm install node-record-lpcm16 speaker
```
*(Note: `node-record-lpcm16` uses `sox` or `rec` to record microphone audio at 16000Hz. Alternatively, use WebRTC or browser mic via simple local web page).*

### Full Test Script: `src/harness/localMicTest.ts`

```typescript
import recorder from 'node-record-lpcm16';
import Speaker from 'speaker';
import { GeminiLiveService } from '../services/geminiLiveService';
import * as dotenv from 'dotenv';
dotenv.config();

async function runLocalVoiceTest() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is required.');
  }

  // Speaker output setup: 24kHz, 16-bit mono (Matches Gemini Live output)
  let speaker = new Speaker({
    channels: 1,
    bitDepth: 16,
    sampleRate: 24000,
  });

  const liveService = new GeminiLiveService({
    apiKey: apiKey,
    model: 'gemini-3.1-flash-live-preview',
    voice: 'Puck',
    systemInstruction: 'You are an upbeat voice AI assistant. Keep responses brief, conversational, and direct.',
    callbacks: {
      onAudioData: (pcm24kBuffer) => {
        speaker.write(pcm24kBuffer);
      },
      onUserTranscript: (text) => {
        console.log(`\n👤 You: ${text}`);
      },
      onModelTranscript: (text) => {
        process.stdout.write(text);
      },
      onInterrupted: () => {
        console.log('\n🛑 User interrupted - flushing speaker buffer');
        // Reset speaker to immediately stop playing stale audio
        speaker.end();
        speaker = new Speaker({
          channels: 1,
          bitDepth: 16,
          sampleRate: 24000,
        });
      },
      onError: (err) => {
        console.error('Service error:', err);
      },
    },
  });

  await liveService.connect();

  console.log('🎤 Microphone active (16kHz PCM). Start speaking now...');

  // Start recording from local microphone: 16kHz, 16-bit mono
  const recording = recorder.record({
    sampleRate: 16000,
    channels: 1,
    audioType: 'raw', // 16-bit PCM
  });

  recording.stream().on('data', (chunk: Buffer) => {
    liveService.sendAudioChunk(chunk);
  });
}

runLocalVoiceTest().catch(console.error);
```

---

## 6. How Telephony Will Attach Later (Next Step Preview)

When you are ready to connect this to real phone calls (Twilio, Vonage, etc.):
1. **Audio Resampling / Translation**:
   - Telephony transmits in **8 kHz $\mu$-law** (PCMU).
   - You only need to add a translation step:
     - Inbound call: `8kHz μ-law ➔ 16kHz Linear PCM` ➔ `liveService.sendAudioChunk()`.
     - Outbound call: `liveService onAudioData (24kHz Linear PCM)` ➔ `8kHz μ-law` ➔ `Telephony WebSocket`.
2. **The Core Live Service Remains 100% Unchanged**.
