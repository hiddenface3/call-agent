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
} from 'lucide-react';
import { AgentConfig, CallFlowGraph } from '../shared/types';
import { OllamaService } from '../services/ollamaService';
import { compileFlowToSystemPrompt } from '../services/promptCompiler';

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
  const [testingEndpoint, setTestingEndpoint] = useState(false);
  const [testResult, setTestResult] = useState<{ isRunning: boolean; models: string[]; error?: string } | null>(null);
  const [compiledBadge, setCompiledBadge] = useState(false);

  useEffect(() => {
    setForm({ ...config });
  }, [config, isOpen]);

  if (!isOpen) return null;

  const handleTest = async () => {
    setTestingEndpoint(true);
    setTestResult(null);
    try {
      const result = await OllamaService.checkHealth(form);
      setTestResult(result);
    } catch (e: unknown) {
      setTestResult({ isRunning: false, models: [], error: e instanceof Error ? e.message : 'Connection failed' });
    } finally {
      setTestingEndpoint(false);
    }
  };

  const handleCompileFromFlow = () => {
    if (flow) {
      const generatedPrompt = compileFlowToSystemPrompt(flow);
      setForm((prev) => ({ ...prev, systemPrompt: generatedPrompt }));
      setCompiledBadge(true);
      setTimeout(() => setCompiledBadge(false), 2500);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Agent & Engine Configuration</h2>
              <p className="text-xs text-slate-400">Configure Cloud LPU LLM, API Key, Voice Audio, and Persona</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSave} className="p-6 overflow-y-auto flex-1 space-y-5 text-xs">
          {/* LLM Engine Section */}
          <div className="space-y-3 p-4 rounded-xl bg-slate-950/50 border border-slate-800">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white flex items-center gap-1.5">
                <CloudLightning className="w-4 h-4 text-amber-400" />
                LLM Thinking Provider
              </span>
              <button
                type="button"
                onClick={handleTest}
                disabled={testingEndpoint}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-400 font-semibold border border-slate-700 text-[11px] transition"
              >
                <RefreshCw className={`w-3 h-3 ${testingEndpoint ? 'animate-spin' : ''}`} />
                <span>Test API Connection</span>
              </button>
            </div>

            {/* Provider Tabs */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setForm({ ...form, provider: 'groq', model: 'openai/gpt-oss-20b' })}
                className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                  form.provider === 'groq'
                    ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <CloudLightning className="w-3.5 h-3.5 text-amber-400" />
                <span>Groq Cloud API (0% CPU / Ultra Fast)</span>
              </button>

              <button
                type="button"
                onClick={() => setForm({ ...form, provider: 'ollama', model: 'llama3.2:3b' })}
                className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                  form.provider === 'ollama'
                    ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>Local Ollama (PC Local)</span>
              </button>
            </div>

            {/* Groq API Key & Model */}
            {form.provider === 'groq' ? (
              <div className="space-y-3 pt-2">
                <div>
                  <label className="text-slate-400 block mb-1 font-medium flex items-center gap-1">
                    <Key className="w-3.5 h-3.5 text-amber-400" />
                    Groq API Key
                  </label>
                  <input
                    type="password"
                    value={form.groqApiKey}
                    onChange={(e) => setForm({ ...form, groqApiKey: e.target.value })}
                    placeholder="gsk_..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400 block mb-1 font-medium">Model ID</label>
                    <select
                      value={form.model}
                      onChange={(e) => setForm({ ...form, model: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:border-blue-500 focus:outline-none"
                    >
                      <option value="openai/gpt-oss-20b">openai/gpt-oss-20b (Recommended)</option>
                      <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile</option>
                      <option value="llama-3.1-8b-instant">llama-3.1-8b-instant</option>
                      <option value="mixtral-8x7b-32768">mixtral-8x7b-32768</option>
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
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
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
            )}

            {/* Test result feedback */}
            {testResult && (
              <div
                className={`p-2.5 rounded-lg border text-xs flex items-center gap-2 ${
                  testResult.isRunning
                    ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                    : 'bg-amber-950/60 border-amber-800 text-amber-300'
                }`}
              >
                {testResult.isRunning ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      API Connected! Found {testResult.models.length} models ready to use.
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
          </div>

          {/* Persona Prompt Section */}
          <div className="space-y-2 p-4 rounded-xl bg-slate-950/50 border border-slate-800">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-white block">Call Center Real Estate System Prompt</span>
                <p className="text-[11px] text-slate-400">
                  Directs Sarah on 1-2 sentence brief phone replies and qualifying location, repairs, timeline, and asking price.
                </p>
              </div>

              {flow && (
                <button
                  type="button"
                  onClick={handleCompileFromFlow}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 border border-purple-500/40 text-[11px] font-bold transition shadow-sm active:scale-95 shrink-0"
                  title="Analyze all workflow nodes and generate a complete master system prompt"
                >
                  <Wand2 className="w-3.5 h-3.5 text-purple-400" />
                  <span>{compiledBadge ? 'Prompt Generated!' : 'Create from All Nodes'}</span>
                </button>
              )}
            </div>

            <textarea
              rows={8}
              value={form.systemPrompt}
              onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
              placeholder="System prompt instructions..."
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-slate-200 font-mono text-[11px] focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Voice & Speech Synthesis */}
          <div className="space-y-3 p-4 rounded-xl bg-slate-950/50 border border-slate-800">
            <span className="font-bold text-white flex items-center gap-1.5">
              <Volume2 className="w-4 h-4 text-cyan-400" />
              Voice & Audio Output
            </span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-slate-400 block mb-1 font-medium">Text-to-Speech Voice</label>
                <select
                  value={form.selectedVoiceName}
                  onChange={(e) => setForm({ ...form, selectedVoiceName: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="Natural Voice (Sarah)">Default: Sarah (Natural English)</option>
                  {availableVoices.map((v, i) => (
                    <option key={i} value={v.name}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center pt-5">
                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.autoSpeak}
                    onChange={(e) => setForm({ ...form, autoSpeak: e.target.checked })}
                    className="w-4 h-4 rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0"
                  />
                  <span>Auto-speak agent responses with audio synthesis</span>
                </label>
              </div>
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
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-600/30 transition active:scale-95"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save & Connect</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
