import React, { useState } from 'react';
import { X, Copy, Check, Terminal, ExternalLink, Cpu, Sparkles, CheckCircle2 } from 'lucide-react';

interface OllamaSetupGuideProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OllamaSetupGuide: React.FC<OllamaSetupGuideProps> = ({ isOpen, onClose }) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  if (!isOpen) return null;

  const copyCommand = (cmd: string, idx: number) => {
    navigator.clipboard.writeText(cmd);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">How to Run Local LLMs on Windows</h2>
              <p className="text-xs text-slate-400">Step-by-step setup in under 2 minutes</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs">
          {/* Step 1 */}
          <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white text-xs flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">1</span>
                Download & Install Ollama for Windows
              </span>
              <a
                href="https://ollama.com/download/windows"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-blue-400 hover:text-blue-300 font-semibold text-[11px]"
              >
                <span>ollama.com</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <p className="text-slate-400 text-[11px]">
              Download and run the official Windows installer. It automatically sets up GPU acceleration (NVIDIA CUDA or AMD/Intel).
            </p>
          </div>

          {/* Step 2 */}
          <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 space-y-2">
            <span className="font-bold text-white text-xs flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">2</span>
              Pull Recommended Lightweight Models
            </span>
            <p className="text-slate-400 text-[11px]">
              Open PowerShell or Command Prompt and run one of these commands:
            </p>

            {/* Command 1: Llama 3.2 3B */}
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 font-mono text-[11px] flex items-center justify-between">
              <div>
                <span className="text-slate-500 mr-2"># Fastest (~2.2GB VRAM)</span>
                <p className="text-emerald-400 font-bold">ollama run llama3.2:3b</p>
              </div>
              <button
                onClick={() => copyCommand('ollama run llama3.2:3b', 1)}
                className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
                title="Copy"
              >
                {copiedIndex === 1 ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Command 2: Qwen 2.5 3B */}
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 font-mono text-[11px] flex items-center justify-between">
              <div>
                <span className="text-slate-500 mr-2"># Great Reasoning (~2.5GB VRAM)</span>
                <p className="text-cyan-400 font-bold">ollama run qwen2.5:3b</p>
              </div>
              <button
                onClick={() => copyCommand('ollama run qwen2.5:3b', 2)}
                className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
                title="Copy"
              >
                {copiedIndex === 2 ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Step 3 */}
          <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 space-y-2">
            <span className="font-bold text-white text-xs flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">3</span>
              Automatic Connection
            </span>
            <p className="text-slate-400 text-[11px]">
              Ollama serves its API on <code className="text-blue-400 bg-slate-900 px-1 py-0.5 rounded">http://localhost:11434</code> automatically.
              As soon as it is running, this app will automatically detect it and use your local PC model for speech thinking!
            </p>
          </div>

          {/* Offline Engine notice */}
          <div className="p-3 rounded-xl bg-blue-950/40 border border-blue-800/40 text-[11px] text-blue-300 flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <span>
              <strong>Note:</strong> You can test and use the app immediately right now. If Ollama is not detected, the app automatically runs the integrated local conversational engine.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 flex justify-end bg-slate-950/60">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-md"
          >
            Got it, Let&apos;s Test!
          </button>
        </div>
      </div>
    </div>
  );
};
