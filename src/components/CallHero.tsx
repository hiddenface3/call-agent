import React from 'react';
import {
  PhoneCall,
  PhoneOff,
  Mic,
  MicOff,
  Sparkles,
  Volume2,
  VolumeX,
  Radio,
  Clock,
  Activity,
  Headphones,
} from 'lucide-react';
import { CallStatus } from '../shared/types';
import { AudioVisualizer } from './AudioVisualizer';

interface CallHeroProps {
  status: CallStatus;
  isMuted: boolean;
  callDuration: number;
  analyserNode: AnalyserNode | null;
  currentInterimText: string;
  onStartCall: () => void;
  onEndCall: () => void;
  onToggleMute: () => void;
  onInterrupt: () => void;
}

export const CallHero: React.FC<CallHeroProps> = ({
  status,
  isMuted,
  callDuration,
  analyserNode,
  currentInterimText,
  onStartCall,
  onEndCall,
  onToggleMute,
  onInterrupt,
}) => {
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getStatusBadge = () => {
    switch (status) {
      case 'idle':
        return {
          bg: 'bg-slate-800/80 text-slate-300 border-slate-700',
          dot: 'bg-slate-500',
          text: 'Ready to Call',
        };
      case 'connecting':
        return {
          bg: 'bg-blue-950/80 text-blue-300 border-blue-800',
          dot: 'bg-blue-400 animate-ping',
          text: 'Connecting Line...',
        };
      case 'listening':
        return {
          bg: 'bg-emerald-950/80 text-emerald-300 border-emerald-800',
          dot: 'bg-emerald-400 animate-pulse',
          text: isMuted ? 'Microphone Muted' : 'Listening to Homeowner...',
        };
      case 'thinking':
        return {
          bg: 'bg-amber-950/80 text-amber-300 border-amber-800',
          dot: 'bg-amber-400 animate-spin',
          text: 'Local LLM Reasoning...',
        };
      case 'speaking':
        return {
          bg: 'bg-sky-950/80 text-sky-300 border-sky-800',
          dot: 'bg-sky-400 animate-bounce',
          text: 'Sarah is Speaking...',
        };
      case 'ended':
        return {
          bg: 'bg-rose-950/80 text-rose-300 border-rose-800',
          dot: 'bg-rose-400',
          text: 'Call Completed',
        };
    }
  };

  const badge = getStatusBadge();
  const isCallActive = status !== 'idle' && status !== 'ended';

  return (
    <div className="relative rounded-2xl glass-panel p-6 overflow-hidden flex flex-col items-center justify-between min-h-[360px] border border-slate-800 shadow-2xl">
      {/* Dynamic Background Glow when speaking/listening */}
      {status === 'speaking' && (
        <div className="absolute inset-0 bg-gradient-to-b from-blue-600/10 via-indigo-600/5 to-transparent pointer-events-none transition-all duration-700"></div>
      )}
      {status === 'thinking' && (
        <div className="absolute inset-0 bg-gradient-to-b from-amber-600/10 via-orange-600/5 to-transparent pointer-events-none transition-all duration-700"></div>
      )}
      {status === 'listening' && (
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-600/10 via-teal-600/5 to-transparent pointer-events-none transition-all duration-700"></div>
      )}

      {/* Header bar of Call Hero */}
      <div className="w-full flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-slate-800/80 border border-slate-700">
            <Radio className="w-4 h-4 text-blue-400" />
          </div>
          <span className="text-xs font-semibold text-slate-300 tracking-wide uppercase">
            Live Audio Channel
          </span>
        </div>

        {/* Call Timer */}
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/90 border border-slate-800 text-xs font-mono text-slate-300">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>{formatTime(callDuration)}</span>
        </div>
      </div>

      {/* Center Avatar & Visualizer */}
      <div className="flex flex-col items-center my-4 z-10">
        {/* Holographic Glowing Agent Ring */}
        <div className="relative flex items-center justify-center mb-4">
          {/* Animated pulse rings */}
          {status === 'speaking' && (
            <>
              <div className="absolute w-28 h-28 rounded-full border border-sky-400/40 animate-ping"></div>
              <div className="absolute w-36 h-36 rounded-full border border-indigo-500/20 animate-pulse"></div>
            </>
          )}
          {status === 'listening' && !isMuted && (
            <div className="absolute w-28 h-28 rounded-full border border-emerald-400/40 animate-ping"></div>
          )}

          <div
            className={`w-20 h-20 rounded-full flex items-center justify-center p-1 transition-all duration-500 shadow-xl ${
              status === 'speaking'
                ? 'bg-gradient-to-tr from-sky-500 via-indigo-500 to-cyan-400 shadow-sky-500/30 ring-4 ring-sky-500/20'
                : status === 'thinking'
                ? 'bg-gradient-to-tr from-amber-500 via-orange-500 to-yellow-400 shadow-amber-500/30 ring-4 ring-amber-500/20'
                : status === 'listening'
                ? 'bg-gradient-to-tr from-emerald-500 via-teal-500 to-green-400 shadow-emerald-500/30 ring-4 ring-emerald-500/20'
                : 'bg-slate-800 border-2 border-slate-700'
            }`}
          >
            <div className="w-full h-full rounded-full bg-slate-950 flex flex-col items-center justify-center text-center p-1">
              <Headphones
                className={`w-8 h-8 transition-colors ${
                  status === 'speaking'
                    ? 'text-sky-400 animate-pulse'
                    : status === 'thinking'
                    ? 'text-amber-400'
                    : status === 'listening'
                    ? 'text-emerald-400'
                    : 'text-slate-500'
                }`}
              />
            </div>
          </div>
        </div>

        {/* Persona Title & Role */}
        <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-1.5">
          Sarah Jenkins
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
        </h2>
        <p className="text-xs text-slate-400">Apex Realty Acquisitions Specialist</p>

        {/* Live Audio Status Waveform */}
        <div className="my-2">
          <AudioVisualizer status={status} analyserNode={analyserNode} />
        </div>

        {/* Status Pill */}
        <div
          className={`inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-medium border shadow-sm ${badge.bg}`}
        >
          <span className={`w-2 h-2 rounded-full ${badge.dot}`}></span>
          <span>{badge.text}</span>
        </div>

        {/* Real-time Interim Live Speech Bubble */}
        {currentInterimText && status === 'listening' && (
          <div className="mt-3 max-w-sm px-3 py-1.5 rounded-xl bg-emerald-950/60 border border-emerald-500/30 text-xs text-emerald-200 text-center animate-fade-in">
            <span className="text-emerald-400 font-semibold mr-1">You:</span>
            &quot;{currentInterimText}&quot;
          </div>
        )}
      </div>

      {/* Bottom Control Bar */}
      <div className="w-full flex items-center justify-center gap-4 pt-3 border-t border-slate-800/80 z-10">
        {!isCallActive ? (
          <button
            onClick={onStartCall}
            className="flex items-center gap-2.5 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-sm shadow-lg shadow-emerald-600/30 active:scale-95 transition-all"
          >
            <PhoneCall className="w-4 h-4" />
            <span>Start Voice Call</span>
          </button>
        ) : (
          <div className="flex items-center gap-3">
            {/* Mute Button */}
            <button
              onClick={onToggleMute}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-medium border transition ${
                isMuted
                  ? 'bg-rose-950/80 border-rose-800 text-rose-300 hover:bg-rose-900'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
              }`}
              title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {isMuted ? <MicOff className="w-4 h-4 text-rose-400" /> : <Mic className="w-4 h-4 text-emerald-400" />}
              <span>{isMuted ? 'Muted' : 'Mic On'}</span>
            </button>

            {/* Interrupt Agent Button */}
            {status === 'speaking' && (
              <button
                onClick={onInterrupt}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-amber-950/80 hover:bg-amber-900 border border-amber-800 text-amber-300 text-xs font-medium transition active:scale-95"
                title="Interrupt and speak"
              >
                <Activity className="w-3.5 h-3.5 text-amber-400" />
                <span>Interrupt Agent</span>
              </button>
            )}

            {/* End Call Button */}
            <button
              onClick={onEndCall}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs shadow-lg shadow-rose-600/30 active:scale-95 transition"
            >
              <PhoneOff className="w-4 h-4" />
              <span>End Call</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
