import React from 'react';
import { Hash, Phone, Volume2, X } from 'lucide-react';

interface DtmfKeypadProps {
  onSendDtmf: (digit: string) => void;
  onClose?: () => void;
  disabled?: boolean;
}

const DTMF_KEYS = [
  { key: '1', sub: '', freq1: 697, freq2: 1209 },
  { key: '2', sub: 'ABC', freq1: 697, freq2: 1336 },
  { key: '3', sub: 'DEF', freq1: 697, freq2: 1477 },
  { key: '4', sub: 'GHI', freq1: 770, freq2: 1209 },
  { key: '5', sub: 'JKL', freq1: 770, freq2: 1336 },
  { key: '6', sub: 'MNO', freq1: 770, freq2: 1477 },
  { key: '7', sub: 'PQRS', freq1: 852, freq2: 1209 },
  { key: '8', sub: 'TUV', freq1: 852, freq2: 1336 },
  { key: '9', sub: 'WXYZ', freq1: 852, freq2: 1477 },
  { key: '*', sub: '', freq1: 941, freq2: 1209 },
  { key: '0', sub: '+', freq1: 941, freq2: 1336 },
  { key: '#', sub: '', freq1: 941, freq2: 1477 },
];

export const DtmfKeypad: React.FC<DtmfKeypadProps> = ({ onSendDtmf, onClose, disabled = false }) => {
  // Play genuine dual-tone multi-frequency sound in browser for authentic feedback
  const playDtmfTone = (freq1: number, freq2: number) => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.frequency.value = freq1;
      osc2.frequency.value = freq2;

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + 0.18);
      osc2.stop(ctx.currentTime + 0.18);
    } catch {
      // AudioContext failure gracefully ignored
    }
  };

  const handleKeyPress = (digit: string, freq1: number, freq2: number) => {
    if (disabled) return;
    playDtmfTone(freq1, freq2);
    onSendDtmf(digit);
  };

  return (
    <div className="p-4 rounded-2xl bg-slate-900/95 border border-slate-700/80 shadow-2xl backdrop-blur-xl max-w-xs mx-auto animate-fade-in">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400">
            <Hash className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white tracking-wide">IVR Touch-Tone Dialpad</h4>
            <p className="text-[10px] text-slate-400">Send DTMF tones to navigate phone menus</p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Dialpad Grid */}
      <div className="grid grid-cols-3 gap-2.5">
        {DTMF_KEYS.map(({ key, sub, freq1, freq2 }) => (
          <button
            key={key}
            onClick={() => handleKeyPress(key, freq1, freq2)}
            disabled={disabled}
            className="flex flex-col items-center justify-center py-2.5 rounded-xl bg-slate-800/80 hover:bg-blue-600/30 active:bg-blue-600/50 border border-slate-700/70 hover:border-blue-500/50 text-white transition active:scale-95 disabled:opacity-50 group"
          >
            <span className="text-base font-bold group-hover:text-blue-300 transition">{key}</span>
            {sub ? (
              <span className="text-[9px] font-medium text-slate-400 group-hover:text-blue-200 transition tracking-widest uppercase">
                {sub}
              </span>
            ) : (
              <span className="text-[9px] text-transparent select-none">-</span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400">
        <span className="flex items-center gap-1">
          <Volume2 className="w-3 h-3 text-emerald-400" />
          <span>Acoustic DTMF Feedback</span>
        </span>
        <span className="text-blue-400 font-mono">PSTN Injected</span>
      </div>
    </div>
  );
};
