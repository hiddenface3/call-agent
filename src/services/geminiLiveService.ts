/* eslint-disable @typescript-eslint/no-explicit-any */
import { AgentConfig, CallFlowGraph, FlowNode } from '../shared/types';
import { compileFlowToSystemPrompt, detectAgentIdentity } from './promptCompiler';
import { getCleanScriptSpeech } from './ollamaService';

export interface GeminiLiveCallbacks {
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: string) => void;
  onUserTranscript?: (text: string, isInterim: boolean) => void;
  onAgentTranscript?: (text: string, isInterim: boolean) => void;
  onTurnComplete?: () => void;
  onInterrupted?: () => void;
  onThinking?: (isThinking: boolean) => void;
  onNodeAdvanced?: (nodeId: string) => void;
}

export class GeminiLiveService {
  private static ws: WebSocket | null = null;
  private static isConnected: boolean = false;
  private static setupComplete: boolean = false;
  private static audioContext: AudioContext | null = null;
  private static micStream: MediaStream | null = null;
  private static inputProcessor: ScriptProcessorNode | null = null;
  private static analyserNode: AnalyserNode | null = null;
  private static activeSources: AudioBufferSourceNode[] = [];
  private static nextPlaybackTime: number = 0;
  private static callbacks: GeminiLiveCallbacks = {};
  private static currentConfig: AgentConfig | null = null;
  private static currentFlow: CallFlowGraph | null = null;
  private static currentActiveNode: FlowNode | null = null;
  private static isMuted: boolean = false;
  private static lastAgentSpokenText: string = '';

  /**
   * Start Gemini Live bidirectional session
   */
  static async startSession(
    config: AgentConfig,
    flow: CallFlowGraph,
    activeNode: FlowNode | null,
    callbacks: GeminiLiveCallbacks = {}
  ): Promise<AnalyserNode | null> {
    this.stopSession();
    this.callbacks = callbacks;
    this.currentConfig = config;
    this.currentFlow = flow;
    this.currentActiveNode = activeNode;
    this.isMuted = false;
    this.lastAgentSpokenText = '';

    const apiKey = config.geminiApiKey || (import.meta as any).env?.VITE_GEMINI_API_KEY || '';
    if (!apiKey) {
      const err = 'Gemini API Key is missing. Please set your Gemini API key in Settings (Gear Icon) or .env file.';
      this.callbacks.onError?.(err);
      throw new Error(err);
    }

    try {
      // 1. Initialize Single Unified Audio Context (works across all Windows hardware audio drivers)
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtxClass();
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 256;
      this.analyserNode.smoothingTimeConstant = 0.8;
      this.analyserNode.connect(this.audioContext.destination);

      // 2. Compile Real Estate Node Flow Instructions for Gemini Live
      const systemInstructionText = this.buildGeminiLiveSystemInstruction(config, flow, activeNode);

      // 3. Connect WebSocket to Gemini Live v1beta BidiGenerateContent
      const endpoint = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;
      const ws = new WebSocket(endpoint);
      this.ws = ws;

      ws.onopen = () => {
        let modelName = config.model || 'gemini-3.1-flash-live-preview';
        // Ensure model name is valid for Gemini Live WebSocket
        if (!modelName.toLowerCase().includes('gemini') || modelName.includes('2.0-flash-exp')) {
          modelName = 'gemini-3.1-flash-live-preview';
        }
        if (!modelName.startsWith('models/')) {
          modelName = `models/${modelName}`;
        }

        console.info(`[GeminiLive] Connecting with model: ${modelName}, voice: ${config.geminiLiveVoice || 'Aoede'}`);

        const setupMessage = {
          setup: {
            model: modelName,
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: config.geminiLiveVoice || 'Aoede',
                  },
                },
              },
              thinkingConfig: {
                thinkingLevel: config.thinkingLevel || 'low',
              },
              temperature: config.temperature ?? 0.6,
            },
            systemInstruction: {
              parts: [{ text: systemInstructionText }],
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
          },
        };

        ws.send(JSON.stringify(setupMessage));
      };

      ws.onmessage = async (event) => {
        try {
          let data: any;
          if (typeof event.data === 'string') {
            data = JSON.parse(event.data);
          } else if (event.data instanceof Blob) {
            const text = await event.data.text();
            data = JSON.parse(text);
          } else {
            return;
          }

          this.handleServerMessage(data);
        } catch (err: any) {
          console.error('[GeminiLive] Error handling server message:', err);
        }
      };

      ws.onerror = (err) => {
        console.error('[GeminiLive] WebSocket error:', err);
        this.callbacks.onError?.('Gemini Live WebSocket connection failed. Verify your Google Gemini API key and network connection.');
      };

      ws.onclose = (event) => {
        console.warn(`[GeminiLive] WebSocket closed (code: ${event.code}, reason: ${event.reason || 'None'})`);
        if (event.code !== 1000 && !this.setupComplete) {
          const detail = event.reason ? `: ${event.reason}` : '';
          this.callbacks.onError?.(`Gemini Live connection closed (Code ${event.code}${detail}). Verify your Google Gemini API key in the Model panel.`);
        }
        this.isConnected = false;
        this.setupComplete = false;
        this.callbacks.onDisconnected?.();
      };

      // 4. Capture User Microphone Stream (16kHz PCM mono)
      await this.initMicrophoneCapture();

      return this.analyserNode;
    } catch (error: any) {
      console.error('[GeminiLive] Session initialization failed:', error);
      this.stopSession();
      this.callbacks.onError?.(error.message || 'Failed to start Gemini Live audio session');
      throw error;
    }
  }

  /**
   * Builds the System Instruction injecting the real estate call flow and qualification requirements
   */
  private static buildGeminiLiveSystemInstruction(
    config: AgentConfig,
    flow: CallFlowGraph,
    activeNode: FlowNode | null
  ): string {
    const { agentName, companyName } = detectAgentIdentity(flow);
    const initialScript = activeNode?.agentPrompt || `Hi, this is ${agentName} from ${companyName}. Are you open to considering selling your property for the best price?`;

    // 1. Respect user's intelligent compiled prompt (from Groq or Settings)
    let masterPrompt = config.systemPrompt?.trim();

    // 2. Only fallback to deterministic compiler if systemPrompt is completely empty
    if (!masterPrompt || masterPrompt.length < 30) {
      masterPrompt = compileFlowToSystemPrompt(flow);
    }

    return `${masterPrompt}

=== RUNTIME CALL CONTEXT ===
Active Step: "${activeNode?.title || 'Greeting'}"
Step Script: "${initialScript}"

Deliver ${agentName}'s opening greeting warmly to begin the conversation.`;
  }

  /**
   * Initializes browser microphone capture at 16kHz PCM Int16
   */
  private static async initMicrophoneCapture() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone access is not supported by your browser.');
    }

    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    if (!this.audioContext) return;

    const source = this.audioContext.createMediaStreamSource(this.micStream);
    const bufferSize = 2048;
    this.inputProcessor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

    this.inputProcessor.onaudioprocess = (e) => {
      if (this.isMuted || !this.ws || this.ws.readyState !== WebSocket.OPEN || !this.setupComplete) {
        return;
      }

      const inputData = e.inputBuffer.getChannelData(0);
      const pcm16 = this.downsampleTo16kPCM(inputData, this.audioContext!.sampleRate);
      if (!pcm16 || pcm16.length === 0) return;

      const base64Audio = this.int16ToBase64(pcm16);

      const realtimeAudioMessage = {
        realtimeInput: {
          audio: {
            mimeType: 'audio/pcm;rate=16000',
            data: base64Audio,
          },
        },
      };

      try {
        this.ws.send(JSON.stringify(realtimeAudioMessage));
      } catch (err) {
        console.warn('[GeminiLive] Failed to send mic audio chunk:', err);
      }
    };

    source.connect(this.inputProcessor);
    this.inputProcessor.connect(this.audioContext.destination);
  }

  /**
   * Processes incoming server frames from Gemini Live
   */
  private static handleServerMessage(data: any) {
    if (data.setupComplete) {
      this.setupComplete = true;
      this.isConnected = true;
      this.callbacks.onConnected?.();

      // Trigger Gemini to speak opening greeting immediately in native audio!
      const { agentName, companyName } = detectAgentIdentity(this.currentFlow);
      const greetingScript = this.currentActiveNode?.agentPrompt
        ? getCleanScriptSpeech(this.currentActiveNode.agentPrompt)
        : `Hi, this is ${agentName} from ${companyName}. Are you open to considering selling your property for the best price?`;

      const promptTrigger = `Call connected. You are ${agentName} from ${companyName}. Speak aloud immediately to greet the homeowner and ask: "${greetingScript}"`;

      const startMsg = {
        clientContent: {
          turns: [
            {
              role: 'user',
              parts: [{ text: promptTrigger }],
            },
          ],
          turnComplete: true,
        },
      };

      try {
        console.info('[GeminiLive] Sending opening greeting trigger via clientContent');
        this.ws?.send(JSON.stringify(startMsg));
      } catch (err) {
        console.warn('[GeminiLive] Failed to send opening trigger:', err);
      }
      return;
    }

    const serverContent = data.serverContent;
    if (!serverContent) return;

    // 1. Interruption signal (User spoke over the agent)
    if (serverContent.interrupted) {
      this.stopPlaybackQueue();
      this.callbacks.onInterrupted?.();
      return;
    }

    // 2. Input Audio Transcription (User's words)
    if (serverContent.interimInputTranscription?.text) {
      this.callbacks.onUserTranscript?.(serverContent.interimInputTranscription.text, true);
    }
    if (serverContent.inputTranscription?.text) {
      this.callbacks.onUserTranscript?.(serverContent.inputTranscription.text, false);
    }

    // 3. Output Audio Transcription (Agent's spoken words)
    if (serverContent.outputTranscription?.text) {
      this.lastAgentSpokenText += serverContent.outputTranscription.text;
      this.callbacks.onAgentTranscript?.(serverContent.outputTranscription.text, false);
    }

    // 4. Native Model Turn Audio (24kHz PCM chunks)
    if (serverContent.modelTurn?.parts) {
      for (const part of serverContent.modelTurn.parts) {
        if (part.inlineData && part.inlineData.data) {
          this.queueAudioChunk(part.inlineData.data);
        }
      }
    }

    // 5. Turn Complete: Wait until all queued 24kHz audio buffers finish playing before releasing turn
    if (serverContent.turnComplete) {
      if (this.audioContext && this.nextPlaybackTime > this.audioContext.currentTime) {
        const remainingSec = this.nextPlaybackTime - this.audioContext.currentTime;
        setTimeout(() => {
          this.callbacks.onTurnComplete?.();
        }, Math.ceil(remainingSec * 1000) + 120);
      } else {
        this.callbacks.onTurnComplete?.();
      }
    }
  }

  /**
   * Decodes 24kHz Int16 base64 PCM and queues for seamless playback
   */
  private static queueAudioChunk(base64Data: string) {
    if (!this.audioContext) return;

    try {
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }

      const float32Samples = this.base64ToFloat32(base64Data);
      if (float32Samples.length === 0) return;

      // Web Audio API automatically resamples from 24000 to system rate smoothly
      const audioBuffer = this.audioContext.createBuffer(1, float32Samples.length, 24000);
      audioBuffer.getChannelData(0).set(float32Samples);

      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;

      // Connect through visualizer analyser node
      if (this.analyserNode) {
        source.connect(this.analyserNode);
      } else {
        source.connect(this.audioContext.destination);
      }

      const currentTime = this.audioContext.currentTime;
      const startTime = Math.max(currentTime, this.nextPlaybackTime);
      source.start(startTime);
      this.nextPlaybackTime = startTime + audioBuffer.duration;

      this.activeSources.push(source);
      source.onended = () => {
        const idx = this.activeSources.indexOf(source);
        if (idx !== -1) {
          this.activeSources.splice(idx, 1);
        }
      };
    } catch (err) {
      console.error('[GeminiLive] Error decoding/playing audio chunk:', err);
    }
  }

  /**
   * Instantly stops playback and flushes queued audio on interruption
   */
  static stopPlaybackQueue() {
    for (const src of this.activeSources) {
      try {
        src.stop();
      } catch {}
    }
    this.activeSources = [];
    if (this.audioContext) {
      this.nextPlaybackTime = this.audioContext.currentTime;
    }
  }

  /**
   * Injects text message into Gemini Live (for Caller Simulator or text chat)
   */
  static sendRealtimeText(text: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.setupComplete) {
      console.warn('[GeminiLive] Cannot send text: session not ready');
      return;
    }

    const textMessage = {
      clientContent: {
        turns: [
          {
            role: 'user',
            parts: [{ text: text }],
          },
        ],
        turnComplete: true,
      },
    };

    try {
      this.ws.send(JSON.stringify(textMessage));
    } catch (err) {
      console.error('[GeminiLive] Error sending realtime text:', err);
    }
  }

  /**
   * Toggle mute state
   */
  static toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }

  /**
   * Stops active session and releases microphone and audio contexts
   */
  static stopSession() {
    this.stopPlaybackQueue();

    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
        }
        this.ws.close();
      } catch {}
      this.ws = null;
    }

    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }

    if (this.inputProcessor) {
      this.inputProcessor.disconnect();
      this.inputProcessor = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch {}
      this.audioContext = null;
    }

    this.isConnected = false;
    this.setupComplete = false;
    this.analyserNode = null;
    this.nextPlaybackTime = 0;
  }

  /**
   * Resamples incoming Float32 samples to 16kHz Int16 PCM
   */
  private static downsampleTo16kPCM(input: Float32Array, inputSampleRate: number): Int16Array {
    const targetSampleRate = 16000;
    if (inputSampleRate === targetSampleRate) {
      const output = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      return output;
    }

    const ratio = inputSampleRate / targetSampleRate;
    const newLength = Math.round(input.length / ratio);
    const output = new Int16Array(newLength);

    for (let i = 0; i < newLength; i++) {
      const originalIndex = Math.floor(i * ratio);
      const s = Math.max(-1, Math.min(1, input[originalIndex]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    return output;
  }

  /**
   * Converts Int16Array to Base64
   */
  private static int16ToBase64(int16Array: Int16Array): string {
    const bytes = new Uint8Array(int16Array.buffer, int16Array.byteOffset, int16Array.byteLength);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  /**
   * Decodes Base64 string to Float32Array
   */
  private static base64ToFloat32(base64: string): Float32Array {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const int16Array = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768.0;
    }
    return float32Array;
  }

  static getIsConnected(): boolean {
    return this.isConnected;
  }
}
