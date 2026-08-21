import React from 'react';
import { Bot, PhoneCall, GitBranch, Settings, CloudLightning, Mic, Volume2, Radio } from 'lucide-react';
import { AgentConfig, FlowNode } from '../shared/types';

interface NavbarProps {
  config: AgentConfig;
  isLlmConnected: boolean;
  activeView: 'call' | 'flow';
  activeNode: FlowNode | null;
  onChangeView: (view: 'call' | 'flow') => void;
  onOpenSettings: () => void;
  onClearSession: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  config,
  isLlmConnected,
  activeView,
  activeNode,
  onChangeView,
  onOpenSettings,
  onClearSession,
}) => {
  return (
    <header className="h-16 border-b border-slate-800/80 bg-slate-950/60 backdrop-blur-xl px-6 flex items-center justify-between z-20 shrink-0">
      {/* Brand & Mode */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-400 p-[1px] shadow-lg shadow-blue-500/20">
          <div className="w-full h-full bg-slate-950 rounded-[11px] flex items-center justify-center">
            <Bot className="w-5 h-5 text-blue-400 animate-pulse-slow" />
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-1.5">
              Apex Voice AI
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
                Node Flow Edition
              </span>
            </h1>
          </div>
          <p className="text-xs text-slate-400 flex items-center gap-1">
            <span>Real Estate Lead Qualification</span>
            <span className="w-1 h-1 rounded-full bg-slate-600"></span>
            <span className="text-slate-300">Persona: Sarah</span>
          </p>
        </div>
      </div>

      {/* Main View Mode Switcher */}
      <div className="flex items-center p-1 bg-slate-900/90 border border-slate-800 rounded-xl shadow-inner">
        <button
          onClick={() => onChangeView('call')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
            activeView === 'call'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <PhoneCall className="w-3.5 h-3.5" />
          <span>Call Interface</span>
        </button>

        <button
          onClick={() => onChangeView('flow')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
            activeView === 'flow'
              ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <GitBranch className="w-3.5 h-3.5" />
          <span>Node Script Editor</span>
          {activeNode && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-0.5"></span>
          )}
        </button>
      </div>

      {/* Center Status Indicators */}
      <div className="hidden lg:flex items-center gap-2 bg-slate-900/80 border border-slate-800 rounded-full px-3.5 py-1.5 shadow-inner">
        {/* Active Node indicator */}
        {activeNode && (
          <div className="flex items-center gap-1.5 text-xs pr-3 border-r border-slate-800">
            <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span className="text-emerald-400 font-bold text-[11px] truncate max-w-[140px]">
              {activeNode.title}
            </span>
          </div>
        )}

        {/* LLM Engine Status */}
        <div className="flex items-center gap-2 text-xs pr-3 border-r border-slate-800">
          <CloudLightning className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-slate-400">LLM:</span>
          {isLlmConnected ? (
            <span className="flex items-center gap-1 text-emerald-400 font-medium font-mono text-[11px]">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              {config.provider === 'groq' ? `Groq: ${config.model}` : config.model}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-amber-400 font-medium text-[11px]">
              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              Smart Engine (Active)
            </span>
          )}
        </div>

        {/* Audio Engine */}
        <div className="flex items-center gap-2 text-xs pr-3 border-r border-slate-800">
          <Mic className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-slate-400">STT:</span>
          <span className="text-slate-200 font-medium text-[11px]">VAD</span>
        </div>

        {/* Voice Synth */}
        <div className="flex items-center gap-2 text-xs">
          <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-slate-400">TTS:</span>
          <span className="text-slate-200 font-medium text-[11px]">Neural Voice</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={onClearSession}
          className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-rose-300 bg-slate-900/60 hover:bg-rose-950/30 border border-slate-800/80 hover:border-rose-800/40 rounded-lg transition"
        >
          Reset Call
        </button>

        <button
          onClick={onOpenSettings}
          className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-md shadow-blue-600/20 transition active:scale-95"
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Config</span>
        </button>
      </div>
    </header>
  );
};
