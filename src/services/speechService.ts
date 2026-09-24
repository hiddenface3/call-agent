/* eslint-disable @typescript-eslint/no-explicit-any */
import { AgentConfig } from '../shared/types';

export class SpeechService {
  private static recognition: any = null;
  private static isListening: boolean = false;
  private static shouldBeListening: boolean = false;
  private static isAgentSpeaking: boolean = false;
  private static lastSpokenText: string = '';
  private static speechEndTime: number = 0;
  private static restartTimer: NodeJS.Timeout | null = null;
  private static audioContext: AudioContext | null = null;
  private static analyserNode: AnalyserNode | null = null;
  private static micStream: MediaStream | null = null;
  private static currentUtterance: SpeechSynthesisUtterance | null = null;
  private static ttsKeepAliveTimer: NodeJS.Timeout | null = null;
  private static activeOnResult: ((transcript: string, isFinal: boolean) => void) | null = null;
  private static activeOnError: ((error: string) => void) | null = null;
  private static activeOnSpeechEnd: (() => void) | null = null;

  /**
   * Check if speech recognition is supported in current environment
   */
  static isSpeechRecognitionSupported(): boolean {
    return typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);
  }

  /**
   * Check if currently listening
   */
  static getIsListening(): boolean {
    return this.isListening;
  }

  /**
   * Check if TTS is currently speaking
   */
  static isSpeaking(): boolean {
    if (typeof window === 'undefined') return false;
    return !!(this.isAgentSpeaking || window.speechSynthesis?.speaking || this.currentUtterance);
  }

  /**
   * Check if a transcript is an acoustic echo of what the agent recently spoke
   */
  static isEchoOfAgent(transcript: string): boolean {
    if (!transcript || !this.lastSpokenText) return false;
    const cleanT = transcript.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const cleanAgent = this.lastSpokenText.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    if (!cleanT || !cleanAgent) return false;

    // Substring match
    if (cleanAgent.includes(cleanT) && cleanT.length > 3) return true;

    // Check word overlap for short phrases
    const wordsT = cleanT.split(/\s+/).filter(w => w.length > 2);
    if (wordsT.length === 0) return false;
    let matchCount = 0;
    for (const w of wordsT) {
      if (cleanAgent.includes(w)) matchCount++;
    }
    return (matchCount / wordsT.length) >= 0.6 && (Date.now() - this.speechEndTime < 4000);
  }

  /**
   * Start live microphone speech recognition with auto-restarting keep-alive
   */
  static startListening(
    onResult: (transcript: string, isFinal: boolean) => void,
    onError: (error: string) => void,
    onSpeechEnd: () => void
  ): boolean {
    if (!this.isSpeechRecognitionSupported()) {
      onError('Speech Recognition API not supported in this browser. You can type in the simulator.');
      return false;
    }

    this.activeOnResult = onResult;
    this.activeOnError = onError;
    this.activeOnSpeechEnd = onSpeechEnd;
    this.shouldBeListening = true;

    return this.initRecognitionInstance();
  }

  /**
   * Internal helper to initialize or restart recognition instance
   */
  private static initRecognitionInstance(): boolean {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {
        // Ignore abort errors
      }
      this.recognition = null;
    }

    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';
      this.recognition.maxAlternatives = 1;

      this.recognition.onresult = (event: any) => {
        // ACOUSTIC ECHO SUPPRESSION: Ignore audio if agent is currently speaking through speakers or within reverb window
        if (this.isSpeaking() || (Date.now() - this.speechEndTime < 600)) {
          return;
        }

        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          if (!item || !item[0]) continue;
          const transcript = item[0].transcript;
          if (item.isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        const cleanFinal = finalTranscript.trim();
        const cleanInterim = interimTranscript.trim();

        // Discard any residual echo matching agent's recent speech
        if (cleanFinal.length > 0) {
          if (!this.isEchoOfAgent(cleanFinal) && this.activeOnResult) {
            this.activeOnResult(cleanFinal, true);
          }
        } else if (cleanInterim.length > 0) {
          if (!this.isEchoOfAgent(cleanInterim) && this.activeOnResult) {
            this.activeOnResult(cleanInterim, false);
          }
        }
      };

      this.recognition.onerror = (event: any) => {
        const error = event.error;
        if (error !== 'no-speech' && error !== 'aborted') {
          console.warn('Speech recognition notice:', error);
          if (this.activeOnError) {
            this.activeOnError(`Speech recognition notice: ${error}`);
          }
        }

        // On transient errors, schedule an automatic restart if we should still be listening
        if (this.shouldBeListening && error !== 'not-allowed') {
          this.scheduleRestart();
        }
      };

      this.recognition.onend = () => {
        this.isListening = false;
        if (this.activeOnSpeechEnd) {
          this.activeOnSpeechEnd();
        }

        // Keep-alive: Automatically restart listening if still in active session
        if (this.shouldBeListening) {
          this.scheduleRestart();
        }
      };

      this.recognition.start();
      this.isListening = true;
      return true;
    } catch (err: unknown) {
      this.isListening = false;
      const errorMsg = err instanceof Error ? err.message : 'Failed to start mic recognition';
      if (this.activeOnError) {
        this.activeOnError(errorMsg);
      }
      if (this.shouldBeListening) {
        this.scheduleRestart(300);
      }
      return false;
    }
  }

  /**
   * Schedule automatic restart of recognition if browser stops it on silence
   */
  private static scheduleRestart(delayMs: number = 80): void {
    if (!this.shouldBeListening) return;
    if (this.restartTimer) clearTimeout(this.restartTimer);

    this.restartTimer = setTimeout(() => {
      if (this.shouldBeListening) {
        this.initRecognitionInstance();
      }
    }, delayMs);
  }

  /**
   * Stop microphone recognition safely
   */
  static stopListening(): void {
    this.shouldBeListening = false;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {
        // Ignore abort errors
      }
      this.recognition = null;
    }
    this.isListening = false;
    this.activeOnResult = null;
    this.activeOnError = null;
    this.activeOnSpeechEnd = null;
  }

  /**
   * Initialize Web Audio API Analyser for real-time visualizer canvas
   */
  static async initAudioAnalyser(): Promise<AnalyserNode | null> {
    try {
      if (this.analyserNode && this.audioContext?.state === 'running') {
        return this.analyserNode;
      }

      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = this.audioContext.createMediaStreamSource(this.micStream);

      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 256;
      this.analyserNode.smoothingTimeConstant = 0.8;

      source.connect(this.analyserNode);
      return this.analyserNode;
    } catch (err) {
      console.warn('Could not initialize microphone audio analyser:', err);
      return null;
    }
  }

  /**
   * Cleanup microphone and audio context
   */
  static stopAudioAnalyser(): void {
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
      this.analyserNode = null;
    }
  }

  /**
   * Speak text using Web Speech Synthesis with garbage-collection protection & keep-alive
   */
  static speak(
    text: string,
    config: AgentConfig,
    onStart?: () => void,
    onEnd?: () => void,
    onError?: (err: string) => void
  ): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      if (onError) onError('Speech synthesis not supported');
      return;
    }

    // Never speak through browser SpeechSynthesis if Gemini Live native voice model is active
    if (config.provider === 'gemini_live') {
      console.warn('[SpeechService.speak] Bypassed browser SpeechSynthesis because Gemini Live native audio is active.');
      if (onEnd) onEnd();
      return;
    }

    // Stop any ongoing speech first
    this.stopSpeaking();

    // Clean text of any thinking tokens or markdown formatting
    const cleanText = text
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/\[thought\][\s\S]*?\[\/thought\]/gi, '')
      .replace(/\*/g, '')
      .replace(/#/g, '')
      .replace(/\[.*?\]/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .trim();

    if (!cleanText) {
      if (onEnd) onEnd();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.05; // natural conversational tempo
    utterance.pitch = 1.0;

    // Pick best English voice
    const voices = window.speechSynthesis.getVoices();
    let selectedVoice: SpeechSynthesisVoice | undefined;

    if (config.selectedVoiceName && config.selectedVoiceName !== 'Natural Voice (Sarah)') {
      selectedVoice = voices.find((v) => v.name === config.selectedVoiceName);
    }

    if (!selectedVoice) {
      selectedVoice =
        voices.find((v) => v.name.includes('Natural') && v.lang.startsWith('en')) ||
        voices.find((v) => (v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Zira') || v.name.includes('Jenny')) && v.lang.startsWith('en')) ||
        voices.find((v) => v.lang.startsWith('en-US')) ||
        voices[0];
    }

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    // Retain reference to prevent GC cancellation
    this.currentUtterance = utterance;
    this.isAgentSpeaking = true;
    this.lastSpokenText = cleanText;

    utterance.onstart = () => {
      this.isAgentSpeaking = true;
      if (onStart) onStart();
    };

    utterance.onend = () => {
      this.isAgentSpeaking = false;
      this.speechEndTime = Date.now();
      this.cleanupTTS();
      if (onEnd) onEnd();
    };

    utterance.onerror = (e) => {
      this.isAgentSpeaking = false;
      this.speechEndTime = Date.now();
      this.cleanupTTS();
      if (e.error !== 'canceled' && e.error !== 'interrupted') {
        console.warn('Speech synthesis notice:', e);
        if (onError) onError(e.error || 'TTS error');
      } else {
        if (onEnd) onEnd();
      }
    };

    // Keep-alive heartbeat for long speech synthesis on Chromium
    if (this.ttsKeepAliveTimer) clearInterval(this.ttsKeepAliveTimer);
    this.ttsKeepAliveTimer = setInterval(() => {
      if (window.speechSynthesis && window.speechSynthesis.speaking) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      } else {
        this.cleanupTTS();
      }
    }, 10000);

    window.speechSynthesis.speak(utterance);
  }

  /**
   * Cleanup TTS utterance and timers
   */
  private static cleanupTTS(): void {
    if (this.ttsKeepAliveTimer) {
      clearInterval(this.ttsKeepAliveTimer);
      this.ttsKeepAliveTimer = null;
    }
    this.currentUtterance = null;
    this.isAgentSpeaking = false;
  }

  /**
   * Stop any currently playing speech immediately (barge-in / interrupt)
   */
  static stopSpeaking(): void {
    this.cleanupTTS();
    this.isAgentSpeaking = false;
    this.speechEndTime = Date.now();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore cancel errors
      }
    }
  }

  /**
   * Get available system voices
   */
  static getAvailableVoices(): SpeechSynthesisVoice[] {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
    return window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'));
  }
}
