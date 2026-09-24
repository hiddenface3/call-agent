import React, { useState, useEffect } from 'react';
import {
  X,
  Save,
  RefreshCw,
  Volume2,
  Sliders,
  CheckCircle2,
  AlertCircle,
  CloudLightning,
  Key,
  Sparkles,
  Wand2,
  Mic,
  Brain,
  Info,
  Radio,
  Eye,
  EyeOff,
  Phone,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';
import { AgentConfig, CallFlowGraph } from '../shared/types';
import { OllamaService } from '../services/ollamaService';
import { TelnyxClientService } from '../services/telnyxClientService';
import {
  compileFlowToSystemPrompt,
  compileFlowWithSelectedModel,
  COMPILER_MODELS,
} from '../services/promptCompiler';

interface AgentSettingsModalProps {
  isOpen: boolean;
  config: AgentConfig;
  flow?: CallFlowGraph;
  availableVoices: SpeechSynthesisVoice[];
  onClose: () => void;
  onSave: (newConfig: AgentConfig) => void;
}

export const AgentSettingsModal: React.FC<AgentSettingsModalProps> = ({
  isOpen,
  config,
  flow,
  availableVoices,
  onClose,
  onSave,
}) => {
  const [form, setForm] = useState<AgentConfig>({ ...config });
  const [activeTab, setActiveTab] = useState<'gemini_live' | 'groq' | 'ollama' | 'telnyx'>(
    config.provider === 'gemini_live' || config.provider === 'groq' || config.provider === 'ollama'
      ? config.provider
      : 'gemini_live'
  );
  const [testingEndpoint, setTestingEndpoint] = useState(false);
  const [testResult, setTestResult] = useState<{ isRunning: boolean; models: string[]; error?: string } | null>(null);
  const [compiledBadge, setCompiledBadge] = useState(false);
  const [isCompilingWithAi, setIsCompilingWithAi] = useState(false);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showGroqKey, setShowGroqKey] = useState(false);
  const [showTelnyxKey, setShowTelnyxKey] = useState(false);
  const [isCheckingRelay, setIsCheckingRelay] = useState(false);
  const [relayCheckResult, setRelayCheckResult] = useState<{ ok: boolean; message: string } | null>(null);

  const handleFieldChange = (field: keyof AgentConfig, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const checkRelayServer = async () => {
    setIsCheckingRelay(true);
    setRelayCheckResult(null);
    const res = await TelnyxClientService.checkRelayHealth(form.telnyxRelayUrl || 'http://localhost:3001');
    setRelayCheckResult(res);
    setIsCheckingRelay(false);
  };

  useEffect(() => {
    setForm({ ...config });
    if (config.provider === 'gemini_live' || config.provider === 'groq' || config.provider === 'ollama') {
      setActiveTab(config.provider);
    }
  }, [config, isOpen]);

  if (!isOpen) return null;

  const handleTest = async () => {
    setTestingEndpoint(true);
    setTestResult(null);
    try {
      if (activeTab === 'gemini_live') {
        const rawKey = form.geminiApiKey || (import.meta as any).env?.VITE_GEMINI_API_KEY || '';
        const key = rawKey.trim();
        if (!key) {
          throw new Error('Please enter your Google Gemini API Key');
        }
        const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
        if (!resp.ok) {
          const data = await resp.json().catch(() => ({}));
          throw new Error(data?.error?.message || `HTTP ${resp.status} - Invalid API Key`);
        }
        setTestResult({
          isRunning: true,
          models: ['gemini-3.1-flash-live-preview', 'gemini-2.5-flash-native-audio-latest', 'gemini-3.8-live'],
        });
      } else if (activeTab === 'groq') {
        const key = (form.groqApiKey || (import.meta as any).env?.VITE_GROQ_API_KEY || '').trim();
        if (!key) {
          throw new Error('Please enter your Groq Cloud API Key');
        }
        const resp = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { Authorization: `Bearer ${key}` },
        });
        if (!resp.ok) {
          const data = await resp.json().catch(() => ({}));
          throw new Error(data?.error?.message || `HTTP ${resp.status} - Invalid Groq API Key`);
        }
        const json = await resp.json();
        setTestResult({
          isRunning: true,
          models: json.data?.map((m: any) => m.id) || ['openai/gpt-oss-20b'],
        });
      } else if (activeTab === 'telnyx') {
        const res = await TelnyxClientService.checkRelayHealth(form.telnyxRelayUrl || 'http://localhost:3001');
        if (!res.ok) {
          throw new Error(res.message);
        }
        setTestResult({
          isRunning: true,
          models: ['Telnyx Call Control v2 Engine Online (Port 3001)'],
        });
      } else {
        const result = await OllamaService.checkHealth(form);
        setTestResult(result);
      }
    } catch (e: unknown) {
      setTestResult({ isRunning: false, models: [], error: e instanceof Error ? e.message : 'Connection failed' });
    } finally {
      setTestingEndpoint(false);
    }
  };

  const handleCompileFromFlow = async () => {
    let activeFlow = flow;
    try {
      const saved = localStorage.getItem('apex_call_flow_graph');
      if (saved) {
        activeFlow = JSON.parse(saved);
      }
    } catch (e) {
      // ignore
    }

    if (!activeFlow) {
      setCompileError('No flow graph found to compile.');
      return;
    }

    setIsCompilingWithAi(true);
    setCompileError(null);

    try {
      const selectedModel = form.compilerModel || 'openai/gpt-oss-120b';
      const synthesizedPrompt = await compileFlowWithSelectedModel(activeFlow, selectedModel, form);
      setForm((prev) => ({ ...prev, systemPrompt: synthesizedPrompt }));
      setCompiledBadge(true);
      setTimeout(() => {
        const textarea = document.getElementById('system-prompt-textarea') as HTMLTextAreaElement;
        if (textarea) {
          textarea.scrollTop = 0;
        }
      }, 50);
      setTimeout(() => setCompiledBadge(false), 4000);
    } catch (err: any) {
      console.warn('AI prompt compilation failed, using fallback:', err);
      const fallbackPrompt = compileFlowToSystemPrompt(activeFlow);
      setForm((prev) => ({ ...prev, systemPrompt: fallbackPrompt }));
      setCompileError(`${err.message || 'API error'}. Used structured fallback.`);
      setCompiledBadge(true);
      setTimeout(() => setCompiledBadge(false), 5000);
    } finally {
      setIsCompilingWithAi(false);
    }
  };

  const handleSelectTab = (tab: 'gemini_live' | 'groq' | 'ollama' | 'telnyx') => {
    setActiveTab(tab);
    setTestResult(null);
    if (tab === 'gemini_live') {
      setForm((prev) => ({
        ...prev,
        provider: 'gemini_live',
        model: prev.model.includes('gemini') ? prev.model : 'gemini-3.1-flash-live-preview',
      }));
    } else if (tab === 'groq') {
      setForm((prev) => ({
        ...prev,
        provider: 'groq',
        model: prev.model.includes('gemini') ? 'openai/gpt-oss-20b' : prev.model,
      }));
    } else if (tab === 'ollama') {
      setForm((prev) => ({
        ...prev,
        provider: 'ollama',
        model: 'llama3.2:3b',
      }));
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const updatedForm = { ...form, provider: activeTab === 'telnyx' ? form.provider : activeTab };
    onSave(updatedForm);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-600/20 text-cyan-400 border border-cyan-500/30">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">AI Engine & Telephony Configuration</h2>
              <p className="text-xs text-slate-400">Configure Speech Brain (Gemini Live), Groq, or Telnyx PSTN Carrier</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Primary Engine Selector Tabs */}
        <div className="p-4 bg-slate-950/60 border-b border-slate-800/80">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => handleSelectTab('gemini_live')}
              className={`py-3 px-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition ${
                activeTab === 'gemini_live'
                  ? 'bg-cyan-600/20 border-cyan-500 text-cyan-200 shadow-md shadow-cyan-500/20'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span className="text-xs">Gemini Live</span>
              </div>
              <span className="text-[10px] text-cyan-400/80 font-normal">Native Voice</span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectTab('telnyx')}
              className={`py-3 px-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition ${
                activeTab === 'telnyx'
                  ? 'bg-blue-600/20 border-blue-500 text-blue-200 shadow-md shadow-blue-500/20'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Phone className="w-4 h-4 text-blue-400" />
                <span className="text-xs">Telnyx PSTN</span>
              </div>
              <span className="text-[10px] text-blue-400/80 font-normal">Real Calling & SIP</span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectTab('groq')}
              className={`py-3 px-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition ${
                activeTab === 'groq'
                  ? 'bg-blue-600/20 border-blue-500 text-blue-200 shadow-md shadow-blue-500/20'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <CloudLightning className="w-4 h-4 text-amber-400" />
                <span className="text-xs">Groq Cloud</span>
              </div>
              <span className="text-[10px] text-slate-400 font-normal">Text LPU + TTS</span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectTab('ollama')}
              className={`py-3 px-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition ${
                activeTab === 'ollama'
                  ? 'bg-blue-600/20 border-blue-500 text-blue-200 shadow-md shadow-blue-500/20'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Radio className="w-4 h-4 text-emerald-400" />
                <span className="text-xs">Local Ollama</span>
              </div>
              <span className="text-[10px] text-slate-400 font-normal">Offline PC Local</span>
            </button>
          </div>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSave} className="p-6 overflow-y-auto flex-1 space-y-5 text-xs">
          {/* ============================================================
              TAB 1: GEMINI LIVE (NATIVE SPEECH-TO-SPEECH)
             ============================================================ */}
          {activeTab === 'gemini_live' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-cyan-950/30 border border-cyan-800/50 flex items-start gap-3">
                <Info className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-cyan-300">Native Speech-to-Speech Architecture</h4>
                  <p className="text-[11px] text-cyan-200/80 leading-relaxed mt-0.5">
                    Gemini Live ingests raw 16kHz microphone audio, reasons with native audio thinking, and delivers
                    ultra-low-latency 24kHz neural speech output. Browser SpeechSynthesis (Windows voice) is completely bypassed.
                  </p>
                </div>
              </div>

              {/* Gemini API Key */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-slate-300 font-bold flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-cyan-400" />
                    Google Gemini API Key
                  </label>
                  <button
                    type="button"
                    onClick={handleTest}
                    disabled={testingEndpoint}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 font-semibold border border-slate-700 text-[11px] transition"
                  >
                    <RefreshCw className={`w-3 h-3 ${testingEndpoint ? 'animate-spin' : ''}`} />
                    <span>Test Connection</span>
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showGeminiKey ? 'text' : 'password'}
                    value={form.geminiApiKey || ''}
                    onChange={(e) => setForm({ ...form, geminiApiKey: e.target.value.trim() })}
                    placeholder="AQ... or AIzaSy..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 pr-10 text-white font-mono focus:border-cyan-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGeminiKey(!showGeminiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition"
                    title={showGeminiKey ? 'Hide key' : 'Show key'}
                  >
                    {showGeminiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500">
                  Required for real-time WebSocket connection to Google Gemini Live API.
                </p>
              </div>

              {/* Model & Voice Configuration */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                <span className="font-bold text-white block">Gemini Live Voice & Reasoning Parameters</span>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-slate-400 block mb-1 font-medium">Model ID</label>
                    <select
                      value={form.model}
                      onChange={(e) => setForm({ ...form, model: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:border-cyan-500 focus:outline-none"
                    >
                      <option value="gemini-3.1-flash-live-preview">gemini-3.1-flash-live-preview (Recommended)</option>
                      <option value="gemini-2.5-flash-native-audio-latest">gemini-2.5-flash-native-audio-latest (Fastest)</option>
                      <option value="gemini-3.8-live">gemini-3.8-live (Advanced)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1 font-medium">Prebuilt Voice Persona</label>
                    <select
                      value={form.geminiLiveVoice || 'Aoede'}
                      onChange={(e) => setForm({ ...form, geminiLiveVoice: e.target.value as any })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white font-medium focus:border-cyan-500 focus:outline-none"
                    >
                      <option value="Aoede">Aoede (Warm & Expressive - Female)</option>
                      <option value="Puck">Puck (Natural & Energetic - Youth)</option>
                      <option value="Charon">Charon (Calm & Authoritative - Male)</option>
                      <option value="Fenrir">Fenrir (Direct & Confident - Male)</option>
                      <option value="Kore">Kore (Gentle & Friendly - Female)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1 font-medium">Native Thinking Depth</label>
                    <select
                      value={form.thinkingLevel || 'low'}
                      onChange={(e) => setForm({ ...form, thinkingLevel: e.target.value as any })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white font-medium focus:border-cyan-500 focus:outline-none"
                    >
                      <option value="minimal">minimal (Lowest Latency)</option>
                      <option value="low">low (Balanced Reasoning - Recommended)</option>
                      <option value="medium">medium (Deeper Objection Handling)</option>
                      <option value="high">high (Maximum Depth)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================
              TAB 2: GROQ CLOUD (TEXT LPU + BROWSER TTS)
             ============================================================ */}
          {activeTab === 'groq' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-blue-950/30 border border-blue-800/50 flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-blue-300">Text-Based LPU Pipeline</h4>
                  <p className="text-[11px] text-blue-200/80 leading-relaxed mt-0.5">
                    Utilizes Web Speech API for speech recognition, Groq Cloud LPU for text generation, and browser
                    SpeechSynthesis for spoken audio.
                  </p>
                </div>
              </div>

              {/* Groq API Key */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-slate-300 font-bold flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-amber-400" />
                    Groq Cloud API Key
                  </label>
                  <button
                    type="button"
                    onClick={handleTest}
                    disabled={testingEndpoint}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-300 font-semibold border border-slate-700 text-[11px] transition"
                  >
                    <RefreshCw className={`w-3 h-3 ${testingEndpoint ? 'animate-spin' : ''}`} />
                    <span>Test Connection</span>
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showGroqKey ? 'text' : 'password'}
                    value={form.groqApiKey || ''}
                    onChange={(e) => setForm({ ...form, groqApiKey: e.target.value.trim() })}
                    placeholder="gsk_..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 pr-10 text-white font-mono focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGroqKey(!showGroqKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition"
                    title={showGroqKey ? 'Hide key' : 'Show key'}
                  >
                    {showGroqKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Model & Temp */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                <span className="font-bold text-white block">Groq LPU Model Parameters</span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400 block mb-1 font-medium">Model ID</label>
                    <select
                      value={form.model}
                      onChange={(e) => setForm({ ...form, model: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:border-blue-500 focus:outline-none text-xs"
                    >
                      <option value="openai/gpt-oss-120b">openai/gpt-oss-120b (Flagship Reasoning 120B - Best)</option>
                      <option value="openai/gpt-oss-20b">openai/gpt-oss-20b (Fastest 20B)</option>
                      <option value="qwen/qwen3.8-27b">qwen/qwen3.8-27b (Qwen 27B)</option>
                      <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1 font-medium">Temperature</label>
                    <input
                      type="number"
                      min="0.1"
                      max="1.0"
                      step="0.1"
                      value={form.temperature}
                      onChange={(e) => setForm({ ...form, temperature: parseFloat(e.target.value) })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* TTS Voice for Text Mode */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="text-slate-400 block mb-1 font-medium">Browser TTS Voice</label>
                    <select
                      value={form.selectedVoiceName}
                      onChange={(e) => setForm({ ...form, selectedVoiceName: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                    >
                      {availableVoices.map((v, i) => (
                        <option key={i} value={v.name}>
                          {v.name} ({v.lang})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1 font-medium">Silence Detection (ms)</label>
                    <input
                      type="number"
                      min="800"
                      max="3000"
                      step="100"
                      value={form.silenceDetectionMs}
                      onChange={(e) => setForm({ ...form, silenceDetectionMs: parseInt(e.target.value) })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================
              TAB 3: LOCAL OLLAMA
             ============================================================ */}
          {activeTab === 'ollama' && (
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
              <span className="font-bold text-white block">Local Ollama Configuration</span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1 font-medium">Ollama Endpoint URL</label>
                  <input
                    type="text"
                    value={form.endpoint}
                    onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
                    placeholder="http://localhost:11434"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1 font-medium">Local Model Name</label>
                  <input
                    type="text"
                    value={form.model}
                    onChange={(e) => setForm({ ...form, model: e.target.value })}
                    placeholder="llama3.2:3b"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ============================================================
              TAB 4: TELNYX PSTN (REAL OUTBOUND CALLING & SIP)
             ============================================================ */}
          {activeTab === 'telnyx' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-blue-950/40 border border-blue-800/50 flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-blue-300">Telnyx Call Control v2 • Real PSTN Calling</h4>
                    <p className="text-[11px] text-blue-200/80 leading-relaxed mt-0.5">
                      Direct carrier connection with Answering Machine Detection (AMD), bidirectional audio streaming,
                      and live human call transfer. Powered by Gemini 3.1 Live.
                    </p>
                  </div>
                </div>
                <span className="font-mono text-[9px] bg-blue-900/40 px-2 py-1 rounded text-blue-200 shrink-0">
                  Tier 1 PSTN
                </span>
              </div>

              {/* Telnyx API Key */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-slate-400 font-medium flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-blue-400" />
                    <span>Telnyx V2 API Key</span>
                  </label>
                  {form.telnyxApiKey ? (
                    <span className="text-emerald-400 font-bold text-[10px] flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Key Loaded
                    </span>
                  ) : (
                    <a
                      href="https://portal.telnyx.com/#/app/api-keys"
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-400 hover:underline font-bold text-[11px] flex items-center gap-1"
                    >
                      <span>Get Telnyx API Key</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>

                <div className="relative">
                  <input
                    type={showTelnyxKey ? 'text' : 'password'}
                    value={form.telnyxApiKey || ''}
                    onChange={(e) => handleFieldChange('telnyxApiKey', e.target.value.trim())}
                    placeholder="KEY018b..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 pr-10 text-white font-mono focus:border-blue-500 focus:outline-none text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowTelnyxKey(!showTelnyxKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition"
                  >
                    {showTelnyxKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Connection ID & Outbound Caller ID */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1 font-medium">
                    Call Control / Connection ID
                  </label>
                  <input
                    type="text"
                    value={form.telnyxConnectionId || ''}
                    onChange={(e) => handleFieldChange('telnyxConnectionId', e.target.value.trim())}
                    placeholder="726784cd-8854-43cb-b097..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:border-blue-500 focus:outline-none text-xs"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">Found in Telnyx Call Control Applications portal</span>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1 font-medium">
                    Outbound Caller ID (Your Phone Number)
                  </label>
                  <input
                    type="text"
                    value={form.telnyxFromNumber || ''}
                    onChange={(e) => handleFieldChange('telnyxFromNumber', e.target.value.trim())}
                    placeholder="+1 (512) 555-0199"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:border-blue-500 focus:outline-none text-xs"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">Your purchased Telnyx number in E.164 format</span>
                </div>
              </div>

              {/* AMD Strategy & Relay URL */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1 font-medium">
                    Answering Machine Detection (AMD)
                  </label>
                  <select
                    value={form.telnyxAmdStrategy || 'voicemail_drop'}
                    onChange={(e) => handleFieldChange('telnyxAmdStrategy', e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none text-xs"
                  >
                    <option value="voicemail_drop">Voicemail Drop (Leave message after beep)</option>
                    <option value="hangup_on_machine">Hang Up on Machine (Fast Lead Recycle)</option>
                    <option value="wait_for_human">Wait for Human Only</option>
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-slate-400 font-medium">
                      Relay Server URL
                    </label>
                    <button
                      type="button"
                      onClick={checkRelayServer}
                      className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 font-semibold"
                    >
                      <RefreshCw className={`w-3 h-3 ${isCheckingRelay ? 'animate-spin' : ''}`} />
                      Check Relay
                    </button>
                  </div>
                  <input
                    type="text"
                    value={form.telnyxRelayUrl || 'http://localhost:3001'}
                    onChange={(e) => handleFieldChange('telnyxRelayUrl', e.target.value.trim())}
                    placeholder="http://localhost:3001"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:border-blue-500 focus:outline-none text-xs"
                  />
                  {relayCheckResult && (
                    <span className={`text-[10px] mt-1 block font-semibold ${relayCheckResult.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {relayCheckResult.ok ? '✓ ' : '✗ '}{relayCheckResult.message}
                    </span>
                  )}
                </div>
              </div>

              {/* Voicemail Audio Script */}
              {form.telnyxAmdStrategy === 'voicemail_drop' && (
                <div>
                  <label className="text-slate-400 block mb-1 font-medium">
                    Voicemail Drop Audio Script
                  </label>
                  <textarea
                    rows={2}
                    value={form.telnyxVoicemailScript || ''}
                    onChange={(e) => handleFieldChange('telnyxVoicemailScript', e.target.value)}
                    placeholder="Hi, this is Sarah calling regarding your property..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-white text-xs focus:border-blue-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500">
                    Spoken automatically by the AI when Telnyx detects answering machine tone.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Test connection feedback */}
          {testResult && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center gap-2.5 ${
                testResult.isRunning
                  ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                  : 'bg-amber-950/60 border-amber-800 text-amber-300'
              }`}
            >
              {testResult.isRunning ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    API Connected successfully! Engine ready for live calls.
                  </span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    Could not reach API: {testResult.error || 'Check key and network'}.
                  </span>
                </>
              )}
            </div>
          )}

          {/* System Prompt Section */}
          <div className="space-y-2 p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white block">Persona System Prompt</span>
                  {flow && (
                    <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-[10px] font-mono text-cyan-300">
                      {flow.nodes?.length || 0} Nodes • {flow.nodes?.reduce((acc, n) => acc + (n.transitions?.length || 0), 0) || 0} Branches
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400">
                  Compiled from your visual canvas nodes and conditional branching scripts.
                </p>
              </div>

              {/* Model Selector & Compile Button */}
              {flow && (
                <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
                  <select
                    value={form.compilerModel || 'openai/gpt-oss-120b'}
                    onChange={(e) => setForm({ ...form, compilerModel: e.target.value })}
                    disabled={isCompilingWithAi}
                    className="bg-slate-900 border border-slate-700/80 rounded-lg px-2 py-1.5 text-xs text-slate-200 font-mono focus:border-cyan-500 focus:outline-none"
                    title="Select AI Model to analyze workflow nodes and compile master system prompt"
                  >
                    {COMPILER_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.badge})
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={handleCompileFromFlow}
                    disabled={isCompilingWithAi}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-600/40 to-indigo-600/40 hover:from-blue-600/60 hover:to-indigo-600/60 text-blue-200 border border-blue-500/40 text-xs font-semibold transition shrink-0 active:scale-95 disabled:opacity-50"
                  >
                    <Wand2 className={`w-3.5 h-3.5 ${isCompilingWithAi ? 'animate-spin text-amber-400' : 'text-blue-300'}`} />
                    <span>
                      {isCompilingWithAi
                        ? 'Analyzing Nodes...'
                        : compiledBadge
                        ? `✓ Synthesized!`
                        : 'Compile from Flow'}
                    </span>
                  </button>
                </div>
              )}
            </div>

            {/* Notification when compiled */}
            {compiledBadge && (
              <div className="p-2 rounded-lg bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 text-[11px] flex items-center gap-1.5 animate-fade-in">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>
                  {compileError
                    ? compileError
                    : `${COMPILER_MODELS.find(m => m.id === (form.compilerModel || 'openai/gpt-oss-120b'))?.name || 'Selected Model'} analyzed all ${flow?.nodes?.length || 0} workflow nodes & synthesized an intelligent Master System Prompt!`}
                </span>
              </div>
            )}

            <textarea
              id="system-prompt-textarea"
              rows={8}
              value={form.systemPrompt}
              onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
              placeholder="System prompt instructions..."
              className="w-full min-h-[160px] bg-slate-900 border border-slate-800 rounded-lg p-3 text-white font-mono text-xs focus:border-cyan-500 focus:outline-none leading-relaxed"
            />

            <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
              <span>Tip: Scroll down inside the prompt box to see all your node scripts and routing rules.</span>
              <span className="font-mono">{form.systemPrompt?.length || 0} characters</span>
            </div>
          </div>

          {/* Footer Controls */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg shadow-cyan-600/30 transition active:scale-95"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save & Connect Engine</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
