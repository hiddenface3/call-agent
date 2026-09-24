import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Zap,
  Radio,
  Key,
  Volume2,
  Brain,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Phone,
  Server,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { AgentConfig } from '../shared/types';
import { GEMINI_LIVE_VOICES } from '../shared/constants';
import { TelnyxClientService } from '../services/telnyxClientService';

interface ModelControlHubProps {
  config: AgentConfig;
  onUpdateConfig: (newConfig: AgentConfig) => void;
  availableVoices?: SpeechSynthesisVoice[];
  onOpenFullSettings?: () => void;
}

export const ModelControlHub: React.FC<ModelControlHubProps> = ({
  config,
  onUpdateConfig,
  availableVoices = [],
  onOpenFullSettings,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'gemini_live' | 'groq' | 'ollama' | 'telnyx'>(
    config.provider === 'groq' ? 'groq' : config.provider === 'ollama' ? 'ollama' : 'gemini_live'
  );
  const [showGeminiKey, setShowGeminiKey] = useState<boolean>(false);
  const [showGroqKey, setShowGroqKey] = useState<boolean>(false);
  const [showTelnyxKey, setShowTelnyxKey] = useState<boolean>(false);
  const [relayStatus, setRelayStatus] = useState<{ checked: boolean; ok: boolean; message: string }>({
    checked: false,
    ok: false,
    message: '',
  });
  const [isCheckingRelay, setIsCheckingRelay] = useState(false);

  // Switch Provider
  const handleSelectProvider = (provider: 'gemini_live' | 'groq' | 'ollama') => {
    setActiveTab(provider);
    let updatedModel = config.model;
    if (provider === 'gemini_live') {
      updatedModel = config.model.includes('gemini') && !config.model.includes('2.0') ? config.model : 'gemini-3.1-flash-live-preview';
    } else if (provider === 'groq') {
      updatedModel = config.model.includes('gemini') ? 'openai/gpt-oss-120b' : config.model;
    } else {
      updatedModel = 'llama3.2:3b';
    }

    onUpdateConfig({
      ...config,
      provider,
      model: updatedModel,
    });
  };

  const handleFieldChange = <K extends keyof AgentConfig>(key: K, value: AgentConfig[K]) => {
    onUpdateConfig({
      ...config,
      [key]: value,
    });
  };

  const checkRelayServer = async () => {
    setIsCheckingRelay(true);
    const res = await TelnyxClientService.checkRelayHealth(config.telnyxRelayUrl || 'http://localhost:3001');
    setRelayStatus({ checked: true, ok: res.ok, message: res.message });
    setIsCheckingRelay(false);
  };

  useEffect(() => {
    if (activeTab === 'telnyx' && !relayStatus.checked) {
      checkRelayServer();
    }
  }, [activeTab]);

  const hasGeminiKey = Boolean(config.geminiApiKey?.trim());
  const hasGroqKey = Boolean(config.groqApiKey?.trim());
  const hasTelnyxKey = Boolean(config.telnyxApiKey?.trim());

  return (
    <div className="rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl overflow-hidden backdrop-blur-md transition-all">
      {/* Header bar with provider indicator & collapse toggle */}
      <div className="p-3.5 border-b border-slate-800/80 flex items-center justify-between bg-slate-950/50">
        <div className="flex items-center gap-2.5">
          <div className={`p-1.5 rounded-xl border ${
            activeTab === 'telnyx'
              ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
              : config.provider === 'gemini_live'
              ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
              : config.provider === 'groq'
              ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
          }`}>
            {activeTab === 'telnyx' ? (
              <Phone className="w-4 h-4" />
            ) : config.provider === 'gemini_live' ? (
              <Sparkles className="w-4 h-4" />
            ) : config.provider === 'groq' ? (
              <Zap className="w-4 h-4" />
            ) : (
              <Radio className="w-4 h-4" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-white tracking-wide">
                AI Engine & Telephony Hub
              </h3>
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                activeTab === 'telnyx'
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                  : config.provider === 'gemini_live'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 animate-pulse'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}>
                {activeTab === 'telnyx'
                  ? 'Telnyx PSTN Gateway'
                  : config.provider === 'gemini_live'
                  ? 'Live Voice 24kHz'
                  : config.provider === 'groq'
                  ? 'Groq Text LPU'
                  : 'Local Ollama'}
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              Configure speech-to-speech models and Telnyx PSTN calling in one place
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {onOpenFullSettings && (
            <button
              onClick={onOpenFullSettings}
              className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-slate-800 transition text-xs"
              title="Open Full Settings Modal"
            >
              <Sliders className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title={isExpanded ? 'Collapse Panel' : 'Expand Panel'}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* 4-Tab Engine & Telephony Selector */}
      <div className="p-2.5 bg-slate-950/80 border-b border-slate-800/80 grid grid-cols-4 gap-1.5">
        {/* Gemini Live Tab */}
        <button
          type="button"
          onClick={() => handleSelectProvider('gemini_live')}
          className={`py-2 px-1.5 rounded-xl text-left border transition flex flex-col justify-between ${
            activeTab === 'gemini_live'
              ? 'bg-cyan-500/15 border-cyan-500/60 shadow-xs shadow-cyan-500/20 text-cyan-200'
              : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <div className="flex items-center gap-1 mb-1">
            <Sparkles className={`w-3 h-3 ${activeTab === 'gemini_live' ? 'text-cyan-400' : 'text-slate-400'}`} />
            <span className="text-[10px] font-bold truncate">Gemini Live</span>
          </div>
          <span className="text-[8.5px] opacity-75 font-medium truncate">Native Speech</span>
        </button>

        {/* Telnyx PSTN Tab */}
        <button
          type="button"
          onClick={() => setActiveTab('telnyx')}
          className={`py-2 px-1.5 rounded-xl text-left border transition flex flex-col justify-between ${
            activeTab === 'telnyx'
              ? 'bg-blue-500/15 border-blue-500/60 shadow-xs shadow-blue-500/20 text-blue-200'
              : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <div className="flex items-center gap-1 mb-1">
            <Phone className={`w-3 h-3 ${activeTab === 'telnyx' ? 'text-blue-400' : 'text-slate-400'}`} />
            <span className="text-[10px] font-bold truncate">Telnyx PSTN</span>
          </div>
          <span className="text-[8.5px] opacity-75 font-medium truncate">Real Calling</span>
        </button>

        {/* Groq Cloud Tab */}
        <button
          type="button"
          onClick={() => handleSelectProvider('groq')}
          className={`py-2 px-1.5 rounded-xl text-left border transition flex flex-col justify-between ${
            activeTab === 'groq'
              ? 'bg-amber-500/15 border-amber-500/60 shadow-xs shadow-amber-500/20 text-amber-200'
              : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <div className="flex items-center gap-1 mb-1">
            <Zap className={`w-3 h-3 ${activeTab === 'groq' ? 'text-amber-400' : 'text-slate-400'}`} />
            <span className="text-[10px] font-bold truncate">Groq Cloud</span>
          </div>
          <span className="text-[8.5px] opacity-75 font-medium truncate">Text LPU</span>
        </button>

        {/* Local Ollama Tab */}
        <button
          type="button"
          onClick={() => handleSelectProvider('ollama')}
          className={`py-2 px-1.5 rounded-xl text-left border transition flex flex-col justify-between ${
            activeTab === 'ollama'
              ? 'bg-emerald-500/15 border-emerald-500/60 shadow-xs shadow-emerald-500/20 text-emerald-200'
              : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <div className="flex items-center gap-1 mb-1">
            <Radio className={`w-3 h-3 ${activeTab === 'ollama' ? 'text-emerald-400' : 'text-slate-400'}`} />
            <span className="text-[10px] font-bold truncate">Local Ollama</span>
          </div>
          <span className="text-[8.5px] opacity-75 font-medium truncate">Offline</span>
        </button>
      </div>

      {/* Expandable Configuration Body */}
      {isExpanded && (
        <div className="p-3.5 space-y-3.5 text-xs animate-in fade-in duration-200">
          {/* ============================================================
              1. GEMINI LIVE CONTROLS (NATIVE VOICE-TO-VOICE)
             ============================================================ */}
          {activeTab === 'gemini_live' && (
            <div className="space-y-3">
              <div className="px-3 py-2 rounded-xl bg-cyan-950/40 border border-cyan-800/40 text-[10px] text-cyan-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                  Gemini Live Model Voice Active (Zero Windows TTS)
                </span>
                <span className="font-mono text-[9px] bg-cyan-900/40 px-1.5 py-0.5 rounded text-cyan-200">
                  24kHz PCM
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">
                    Live Model
                  </label>
                  <select
                    value={config.model}
                    onChange={(e) => handleFieldChange('model', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none transition"
                  >
                    <option value="gemini-3.1-flash-live-preview">Gemini 3.1 Flash Live (Recommended)</option>
                    <option value="gemini-2.5-flash-native-audio-latest">Gemini 2.5 Flash Native Audio</option>
                    <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash Experimental</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">
                    Speech Voice
                  </label>
                  <select
                    value={config.geminiLiveVoice || 'Aoede'}
                    onChange={(e) => handleFieldChange('geminiLiveVoice', e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none transition"
                  >
                    {GEMINI_LIVE_VOICES.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Gemini API Key */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <Key className="w-3 h-3 text-cyan-400" />
                    Google AI Studio API Key
                  </label>
                  {hasGeminiKey ? (
                    <span className="text-emerald-400 font-bold text-[10px] flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Key Loaded
                    </span>
                  ) : (
                    <a
                      href="https://aistudio.google.com/apikey"
                      target="_blank"
                      rel="noreferrer"
                      className="text-cyan-400 hover:underline font-bold text-[10px] flex items-center gap-0.5"
                    >
                      <AlertCircle className="w-3 h-3" />
                      Get Free Key <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
                    </a>
                  )}
                </div>

                <div className="relative">
                  <input
                    type={showGeminiKey ? 'text' : 'password'}
                    value={config.geminiApiKey || ''}
                    onChange={(e) => handleFieldChange('geminiApiKey', e.target.value.trim())}
                    placeholder="AQ.Ab8RN6I-..."
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-1.5 pr-8 text-xs font-mono text-slate-200 focus:border-cyan-500 focus:outline-none transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGeminiKey(!showGeminiKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition"
                  >
                    {showGeminiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================
              2. TELNYX PSTN REAL TELEPHONY CONTROLS
             ============================================================ */}
          {activeTab === 'telnyx' && (
            <div className="space-y-3">
              <div className="px-3 py-2 rounded-xl bg-blue-950/40 border border-blue-800/40 text-[10px] text-blue-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                  Telnyx Call Control v2 • Powered by Gemini 3.1 Live
                </span>
                <span className="font-mono text-[9px] bg-blue-900/40 px-1.5 py-0.5 rounded text-blue-200">
                  Tier 1 PSTN
                </span>
              </div>

              {/* Telnyx API Key */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <Key className="w-3 h-3 text-blue-400" />
                    Telnyx V2 API Key
                  </label>
                  {hasTelnyxKey ? (
                    <span className="text-emerald-400 font-bold text-[10px] flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Key Loaded
                    </span>
                  ) : (
                    <a
                      href="https://portal.telnyx.com/#/app/api-keys"
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-400 hover:underline font-bold text-[10px] flex items-center gap-0.5"
                    >
                      <AlertCircle className="w-3 h-3" />
                      Get Telnyx Key <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
                    </a>
                  )}
                </div>

                <div className="relative">
                  <input
                    type={showTelnyxKey ? 'text' : 'password'}
                    value={config.telnyxApiKey || ''}
                    onChange={(e) => handleFieldChange('telnyxApiKey', e.target.value.trim())}
                    placeholder="KEY018b..."
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-1.5 pr-8 text-xs font-mono text-slate-200 focus:border-blue-500 focus:outline-none transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowTelnyxKey(!showTelnyxKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition"
                  >
                    {showTelnyxKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Connection ID & Outbound Caller ID */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">
                    Call Control / Connection ID
                  </label>
                  <input
                    type="text"
                    value={config.telnyxConnectionId || ''}
                    onChange={(e) => handleFieldChange('telnyxConnectionId', e.target.value.trim())}
                    placeholder="726784cd-8854-43cb-b097..."
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none transition font-mono text-[11px]"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">
                    Outbound Caller ID Number
                  </label>
                  <input
                    type="text"
                    value={config.telnyxFromNumber || ''}
                    onChange={(e) => handleFieldChange('telnyxFromNumber', e.target.value.trim())}
                    placeholder="+1 (512) 555-0199"
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none transition font-mono text-[11px]"
                  />
                </div>
              </div>

              {/* AMD Strategy & Relay URL */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">
                    Answering Machine Detection (AMD)
                  </label>
                  <select
                    value={config.telnyxAmdStrategy || 'voicemail_drop'}
                    onChange={(e) => handleFieldChange('telnyxAmdStrategy', e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none transition"
                  >
                    <option value="voicemail_drop">Voicemail Drop (Leave message after beep)</option>
                    <option value="hangup_on_machine">Hang Up on Machine (Fast Lead Recycle)</option>
                    <option value="wait_for_human">Wait for Human Only</option>
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Relay Server URL
                    </label>
                    <button
                      type="button"
                      onClick={checkRelayServer}
                      className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1 font-semibold"
                    >
                      <RefreshCw className={`w-2.5 h-2.5 ${isCheckingRelay ? 'animate-spin' : ''}`} />
                      Check
                    </button>
                  </div>
                  <input
                    type="text"
                    value={config.telnyxRelayUrl || 'http://localhost:3001'}
                    onChange={(e) => handleFieldChange('telnyxRelayUrl', e.target.value.trim())}
                    placeholder="http://localhost:3001"
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none transition font-mono text-[11px]"
                  />
                </div>
              </div>

              {/* Relay Status Pill */}
              {relayStatus.checked && (
                <div className={`p-2 rounded-xl border text-[11px] flex items-center justify-between ${
                  relayStatus.ok
                    ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                    : 'bg-amber-950/40 border-amber-800 text-amber-300'
                }`}>
                  <span className="flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5" />
                    <span>{relayStatus.message}</span>
                  </span>
                  <span className="text-[10px] font-mono opacity-80">
                    {relayStatus.ok ? 'Ready for PSTN calls' : 'Run: npm run relay'}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ============================================================
              3. GROQ CLOUD CONTROLS
             ============================================================ */}
          {activeTab === 'groq' && (
            <div className="space-y-3">
              <div className="px-3 py-2 rounded-xl bg-amber-950/40 border border-amber-800/40 text-[10px] text-amber-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  Groq Ultra-Fast LPU Cloud Inference Active
                </span>
                <span className="font-mono text-[9px] bg-amber-900/40 px-1.5 py-0.5 rounded text-amber-200">
                  ~300 T/s
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">
                    Groq Model
                  </label>
                  <select
                    value={config.model}
                    onChange={(e) => handleFieldChange('model', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:border-amber-500 focus:outline-none transition"
                  >
                    <option value="openai/gpt-oss-120b">GPT OSS 120B (Reasoning Flagship)</option>
                    <option value="openai/gpt-oss-20b">GPT OSS 20B (Fastest)</option>
                    <option value="qwen/qwen3.8-27b">Qwen 3.8 27B</option>
                    <option value="llama-3.3-70b-versatile">Llama 3.3 70B Versatile</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">
                    Endpoint
                  </label>
                  <input
                    type="text"
                    value={config.endpoint}
                    onChange={(e) => handleFieldChange('endpoint', e.target.value)}
                    placeholder="https://api.groq.com/openai/v1"
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:border-amber-500 focus:outline-none transition font-mono text-[11px]"
                  />
                </div>
              </div>

              {/* Groq API Key */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <Key className="w-3 h-3 text-amber-400" />
                    Groq Cloud API Key
                  </label>
                  {hasGroqKey ? (
                    <span className="text-emerald-400 font-bold text-[10px] flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Key Loaded
                    </span>
                  ) : (
                    <a
                      href="https://console.groq.com/keys"
                      target="_blank"
                      rel="noreferrer"
                      className="text-amber-400 hover:underline font-bold text-[10px] flex items-center gap-0.5"
                    >
                      <AlertCircle className="w-3 h-3" />
                      Get Groq Key <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
                    </a>
                  )}
                </div>

                <div className="relative">
                  <input
                    type={showGroqKey ? 'text' : 'password'}
                    value={config.groqApiKey || ''}
                    onChange={(e) => handleFieldChange('groqApiKey', e.target.value.trim())}
                    placeholder="gsk_..."
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-1.5 pr-8 text-xs font-mono text-slate-200 focus:border-amber-500 focus:outline-none transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGroqKey(!showGroqKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition"
                  >
                    {showGroqKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================
              4. LOCAL OLLAMA CONTROLS (OFFLINE)
             ============================================================ */}
          {activeTab === 'ollama' && (
            <div className="space-y-3">
              <div className="px-3 py-2 rounded-xl bg-emerald-950/40 border border-emerald-800/40 text-[10px] text-emerald-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-emerald-400" />
                  Local Offline Model (Zero Cloud Dependencies)
                </span>
                <span className="font-mono text-[9px] bg-emerald-900/40 px-1.5 py-0.5 rounded text-emerald-200">
                  Localhost
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">
                    Ollama Model Tag
                  </label>
                  <input
                    type="text"
                    value={config.model}
                    onChange={(e) => handleFieldChange('model', e.target.value)}
                    placeholder="llama3.2:3b"
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none transition"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">
                    Endpoint URL
                  </label>
                  <input
                    type="text"
                    value={config.endpoint}
                    onChange={(e) => handleFieldChange('endpoint', e.target.value)}
                    placeholder="http://localhost:11434"
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none transition font-mono text-[11px]"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
