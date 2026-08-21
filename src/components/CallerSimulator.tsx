import React from 'react';
import { Play, Sparkles, UserCheck, FastForward, ArrowRight } from 'lucide-react';
import { SAMPLE_CALLER_SCENARIOS } from '../shared/constants';

interface CallerSimulatorProps {
  onInjectCallerSpeech: (text: string) => void;
  disabled?: boolean;
}

export const CallerSimulator: React.FC<CallerSimulatorProps> = ({
  onInjectCallerSpeech,
  disabled = false,
}) => {
  return (
    <div className="rounded-2xl glass-panel p-5 border border-slate-800 shadow-xl">
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">Test Caller Simulator</h3>
            <p className="text-[11px] text-slate-400">1-Click realistic homeowner responses</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {SAMPLE_CALLER_SCENARIOS.map((scenario, sIdx) => (
          <div
            key={sIdx}
            className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/90 flex flex-col justify-between hover:border-slate-700 transition"
          >
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-white mb-1">
                <UserCheck className="w-3.5 h-3.5 text-blue-400" />
                <span>{scenario.title}</span>
              </div>
              <p className="text-[11px] text-slate-400 mb-2.5 leading-snug">
                {scenario.description}
              </p>
            </div>

            <div className="space-y-1.5">
              <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">
                Quick Prompts:
              </span>
              <div className="flex flex-col gap-1">
                {scenario.dialogues.slice(0, 3).map((line, lIdx) => (
                  <button
                    key={lIdx}
                    disabled={disabled}
                    onClick={() => onInjectCallerSpeech(line)}
                    className="text-left px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-blue-600/30 hover:text-blue-200 border border-slate-700/60 hover:border-blue-500/40 text-[11px] text-slate-300 transition truncate flex items-center justify-between group disabled:opacity-40"
                    title={line}
                  >
                    <span className="truncate">{line}</span>
                    <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 text-blue-400 shrink-0 ml-1 transition" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
