import React, { useState } from 'react';
import {
  PhoneCall,
  PhoneOff,
  Mic,
  MicOff,
  Radio,
  Clock,
  Activity,
  Headphones,
  Phone,
  FileSpreadsheet,
  Hash,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  UserCheck,
  RotateCcw,
} from 'lucide-react';
import { CallStatus, CallMode, TelephonyCallStatus, PhoneContact } from '../shared/types';
import { AudioVisualizer } from './AudioVisualizer';
import { DtmfKeypad } from './DtmfKeypad';

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
  // Telephony Outbound Props
  callMode: CallMode;
  onSelectCallMode: (mode: CallMode) => void;
  targetPhone: string;
  onChangeTargetPhone: (phone: string) => void;
  telephonyStatus: TelephonyCallStatus;
  telephonyDetailText: string;
  onStartTelephonyCall: () => void;
  onEndTelephonyCall: () => void;
  onSendDtmf: (digit: string) => void;
  phoneContacts?: PhoneContact[];
  onSelectContact?: (contact: PhoneContact) => void;
  agentName?: string;
  // Sequential Dialer Props
  isSequentialMode?: boolean;
  onToggleSequentialMode?: (active: boolean) => void;
  currentQueueIndex?: number;
  queueCountdown?: number | null;
  onSkipQueueLead?: () => void;
  onDialQueueNow?: () => void;
  onCancelQueue?: () => void;
  onUploadContacts?: (contacts: PhoneContact[]) => void;
  onTransferCall?: (transferTo: string) => void;
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
  callMode,
  onSelectCallMode,
  targetPhone,
  onChangeTargetPhone,
  telephonyStatus,
  telephonyDetailText,
  onStartTelephonyCall,
  onEndTelephonyCall,
  onSendDtmf,
  phoneContacts = [],
  onSelectContact,
  agentName = 'Agent',
  isSequentialMode = false,
  onToggleSequentialMode,
  currentQueueIndex = 0,
  queueCountdown = null,
  onSkipQueueLead,
  onDialQueueNow,
  onCancelQueue,
  onUploadContacts,
  onTransferCall,
}) => {
  const [showDtmf, setShowDtmf] = useState(false);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferPhone, setTransferPhone] = useState('');

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Badge for Local Browser Test mode
  const getLocalBadge = () => {
    switch (status) {
      case 'idle':
        return {
          bg: 'bg-slate-800/80 text-slate-300 border-slate-700',
          dot: 'bg-slate-500',
          text: 'Local Test Mode: Ready to Speak',
        };
      case 'connecting':
        return {
          bg: 'bg-blue-950/80 text-blue-300 border-blue-800',
          dot: 'bg-blue-400 animate-ping',
          text: 'Connecting Gemini Live...',
        };
      case 'listening':
        return {
          bg: 'bg-emerald-950/80 text-emerald-300 border-emerald-800',
          dot: 'bg-emerald-400 animate-pulse',
          text: isMuted ? 'Microphone Muted' : 'Listening to You (Microphone)...',
        };
      case 'thinking':
        return {
          bg: 'bg-amber-950/80 text-amber-300 border-amber-800',
          dot: 'bg-amber-400 animate-spin',
          text: 'Gemini Live Reasoning...',
        };
      case 'speaking':
        return {
          bg: 'bg-sky-950/80 text-sky-300 border-sky-800',
          dot: 'bg-sky-400 animate-bounce',
          text: `${agentName} is Speaking (24kHz)...`,
        };
      case 'ended':
        return {
          bg: 'bg-rose-950/80 text-rose-300 border-rose-800',
          dot: 'bg-rose-400',
          text: 'Test Call Completed',
        };
    }
  };

  // Badge for Real Outbound Telephony mode
  const getTelephonyBadge = () => {
    switch (telephonyStatus) {
      case 'idle':
        return {
          bg: 'bg-slate-800/80 text-slate-300 border-slate-700',
          dot: 'bg-slate-500',
          text: 'Telnyx PSTN Ready: Enter Phone Number',
        };
      case 'initiating':
        return {
          bg: 'bg-blue-950/80 text-blue-300 border-blue-800',
          dot: 'bg-blue-400 animate-ping',
          text: telephonyDetailText || 'Initiating Telnyx Call Control...',
        };
      case 'ringing':
        return {
          bg: 'bg-amber-950/80 text-amber-300 border-amber-800',
          dot: 'bg-amber-400 animate-pulse',
          text: telephonyDetailText || 'Ringing Customer Phone Line...',
        };
      case 'amd_evaluating':
        return {
          bg: 'bg-purple-950/80 text-purple-300 border-purple-800',
          dot: 'bg-purple-400 animate-spin',
          text: telephonyDetailText || 'Telnyx Premium AMD Analyzing (Human vs Machine)...',
        };
      case 'connected_live':
        return {
          bg: 'bg-emerald-950/80 text-emerald-300 border-emerald-800',
          dot: 'bg-emerald-400 animate-pulse',
          text: telephonyDetailText || 'Live PSTN Call Active • Gemini Live Bridged',
        };
      case 'voicemail_drop':
        return {
          bg: 'bg-indigo-950/80 text-indigo-300 border-indigo-800',
          dot: 'bg-indigo-400 animate-bounce',
          text: telephonyDetailText || 'Voicemail Detected • Leaving Automated Drop...',
        };
      case 'completed':
        return {
          bg: 'bg-slate-900 text-slate-400 border-slate-800',
          dot: 'bg-slate-500',
          text: 'Call Completed & Recorded',
        };
      case 'failed':
        return {
          bg: 'bg-rose-950/80 text-rose-300 border-rose-800',
          dot: 'bg-rose-400',
          text: telephonyDetailText || 'Call Failed / Unanswered',
        };
    }
  };

  const isLocalCallActive = status !== 'idle' && status !== 'ended';
  const isTelephonyCallActive = telephonyStatus !== 'idle' && telephonyStatus !== 'completed' && telephonyStatus !== 'failed';
  const badge = callMode === 'local_test' ? getLocalBadge() : getTelephonyBadge();

  // CSV file parser helper
  const handleCsvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
      const parsedContacts: PhoneContact[] = [];

      // Skip header if present
      const startIndex = lines[0].toLowerCase().includes('phone') || lines[0].toLowerCase().includes('name') ? 1 : 0;

      for (let i = startIndex; i < lines.length; i++) {
        const parts = lines[i].split(',').map(p => p.replace(/^["']|["']$/g, '').trim());
        if (parts.length > 0 && parts[0]) {
          const phoneCandidate = parts.find(p => /^[+]?[0-9()\s-]{7,18}$/.test(p)) || parts[1] || parts[0];
          const nameCandidate = parts.find(p => p !== phoneCandidate && /^[A-Za-z\s.'-]+$/.test(p)) || `Lead #${i}`;
          const addressCandidate = parts.find(p => p !== phoneCandidate && p !== nameCandidate) || '';

          parsedContacts.push({
            id: `csv-${Date.now()}-${i}`,
            name: nameCandidate,
            phone: phoneCandidate,
            address: addressCandidate,
          });
        }
      }

      if (parsedContacts.length > 0) {
        if (onUploadContacts) {
          onUploadContacts(parsedContacts);
        }
        if (onSelectContact) {
          onSelectContact(parsedContacts[0]);
        }
        onChangeTargetPhone(parsedContacts[0].phone);
      }
      setShowCsvModal(false);
    };
    reader.readAsText(file);
  };

  return (
    <div className="relative rounded-2xl glass-panel p-6 overflow-hidden flex flex-col items-center justify-between min-h-[420px] border border-slate-800 shadow-2xl">
      {/* Glow Effects */}
      {status === 'speaking' && (
        <div className="absolute inset-0 bg-gradient-to-b from-blue-600/10 via-indigo-600/5 to-transparent pointer-events-none transition-all duration-700"></div>
      )}
      {status === 'thinking' && (
        <div className="absolute inset-0 bg-gradient-to-b from-amber-600/10 via-orange-600/5 to-transparent pointer-events-none transition-all duration-700"></div>
      )}
      {status === 'listening' && (
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-600/10 via-teal-600/5 to-transparent pointer-events-none transition-all duration-700"></div>
      )}

      {/* Top Bar: Mode Selector & Call Timer */}
      <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-3 z-10 pb-4 border-b border-slate-800/80">
        {/* Dual Mode Switcher Tabs */}
        <div className="flex items-center p-1 rounded-xl bg-slate-950/80 border border-slate-800 shadow-inner">
          <button
            onClick={() => onSelectCallMode('local_test')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              callMode === 'local_test'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Mic className="w-3.5 h-3.5" />
            <span>Local Browser Test (Mic/Speaker)</span>
          </button>

          <button
            onClick={() => onSelectCallMode('telnyx_outbound')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              callMode === 'telnyx_outbound'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Phone className="w-3.5 h-3.5" />
            <span>Real Outbound Call (Telnyx PSTN)</span>
          </button>
        </div>

        {/* Timer & Channel Info */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/90 border border-slate-800 text-xs font-mono text-slate-300">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>{formatTime(callDuration)}</span>
          </div>
        </div>
      </div>

      {/* Center Section: Telephony Input vs Local Avatar */}
      <div className="flex flex-col items-center my-3 z-10 w-full max-w-md">
        {/* Telephony Phone Number Input Bar (Real Outbound Call Mode) */}
        {callMode === 'telnyx_outbound' && (
          <div className="w-full mb-4 p-3.5 rounded-xl bg-slate-950/70 border border-blue-500/30 shadow-lg animate-fade-in">
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-blue-400" />
                Target Customer Phone Number:
              </label>
              <button
                onClick={() => setShowCsvModal(true)}
                className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 transition"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Load Numbers CSV</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="tel"
                value={targetPhone}
                onChange={(e) => onChangeTargetPhone(e.target.value)}
                disabled={isTelephonyCallActive}
                placeholder="+1 (555) 382-9104"
                className="flex-1 px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500 transition disabled:opacity-50"
              />
              {isTelephonyCallActive && (
                <button
                  onClick={() => setShowDtmf(!showDtmf)}
                  className={`p-2 rounded-lg border text-xs font-medium transition ${
                    showDtmf
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                  title="Toggle IVR Touch-Tone Keypad"
                >
                  <Hash className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Sequential Auto-Dialer Control */}
            <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onToggleSequentialMode && onToggleSequentialMode(!isSequentialMode)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold transition ${
                    isSequentialMode
                      ? 'bg-blue-600/30 text-blue-300 border border-blue-500/50 shadow-sm'
                      : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'
                  }`}
                >
                  <RotateCcw className={`w-3 h-3 ${isSequentialMode ? 'animate-spin text-blue-400' : ''}`} />
                  <span>Sequential Auto-Dialer: {isSequentialMode ? 'ACTIVE' : 'OFF'}</span>
                </button>

                {phoneContacts.length > 0 && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                    Lead {Math.min(currentQueueIndex + 1, phoneContacts.length)} of {phoneContacts.length}
                  </span>
                )}
              </div>

              {isSequentialMode && (
                <span className="text-[10px] text-blue-400 font-medium">
                  One call at a time • Auto-advances
                </span>
              )}
            </div>

            {/* Countdown Banner between sequential calls */}
            {queueCountdown !== null && queueCountdown > 0 && (
              <div className="mt-2.5 p-2 rounded-lg bg-blue-950/70 border border-blue-500/40 text-blue-200 flex items-center justify-between gap-2 animate-pulse">
                <span className="text-xs font-semibold flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                  Next call in {queueCountdown}s: {phoneContacts[currentQueueIndex + 1]?.name || 'Next Lead'}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={onDialQueueNow}
                    className="px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px] transition"
                  >
                    Dial Now
                  </button>
                  <button
                    onClick={onCancelQueue}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] transition"
                  >
                    Pause
                  </button>
                  <button
                    onClick={onSkipQueueLead}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] transition"
                  >
                    Skip
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Holographic Glowing Agent Ring */}
        <div className="relative flex items-center justify-center mb-3">
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
              callMode === 'telnyx_outbound'
                ? isTelephonyCallActive
                  ? 'bg-gradient-to-tr from-blue-500 via-indigo-500 to-cyan-400 shadow-blue-500/30 ring-4 ring-blue-500/20'
                  : 'bg-slate-800 border-2 border-slate-700'
                : status === 'speaking'
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
                  callMode === 'telnyx_outbound'
                    ? isTelephonyCallActive
                      ? 'text-blue-400 animate-pulse'
                      : 'text-slate-500'
                    : status === 'speaking'
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
          {agentName}
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
        </h2>
        <p className="text-xs text-slate-400">
          {callMode === 'local_test'
            ? 'Apex Realty Voice AI • Local Browser Test Harness'
            : 'Apex Realty Outbound Agent • Telnyx PSTN Gateway'}
        </p>

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

        {/* Real-time Interim Live Speech Bubble (Local Test) */}
        {callMode === 'local_test' && currentInterimText && status === 'listening' && (
          <div className="mt-3 max-w-sm px-3 py-1.5 rounded-xl bg-emerald-950/60 border border-emerald-500/30 text-xs text-emerald-200 text-center animate-fade-in">
            <span className="text-emerald-400 font-semibold mr-1">You:</span>
            &quot;{currentInterimText}&quot;
          </div>
        )}

        {/* In-Call DTMF Pad Overlay (When toggled during PSTN call) */}
        {showDtmf && callMode === 'telnyx_outbound' && isTelephonyCallActive && (
          <div className="mt-3 w-full">
            <DtmfKeypad
              onSendDtmf={(digit) => {
                onSendDtmf(digit);
              }}
              onClose={() => setShowDtmf(false)}
            />
          </div>
        )}
      </div>

      {/* Bottom Control Bar */}
      <div className="w-full flex items-center justify-center gap-4 pt-3 border-t border-slate-800/80 z-10">
        {callMode === 'local_test' ? (
          /* LOCAL TEST MODE CONTROLS */
          !isLocalCallActive ? (
            <button
              onClick={onStartCall}
              className="flex items-center gap-2.5 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-sm shadow-lg shadow-emerald-600/30 active:scale-95 transition-all"
            >
              <PhoneCall className="w-4 h-4" />
              <span>Start Local Test Call (Mic/Speaker)</span>
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
                <span>End Test Call</span>
              </button>
            </div>
          )
        ) : (
          /* REAL OUTBOUND CALL CONTROLS */
          !isTelephonyCallActive ? (
            <button
              onClick={onStartTelephonyCall}
              disabled={!targetPhone.trim()}
              className="flex items-center gap-2.5 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-sm shadow-lg shadow-blue-600/30 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <PhoneCall className="w-4 h-4" />
              <span>Dial Live PSTN Number ({targetPhone || 'Enter number'})</span>
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowDtmf(!showDtmf)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium transition"
              >
                <Hash className="w-4 h-4 text-blue-400" />
                <span>{showDtmf ? 'Hide Keypad' : 'IVR Keypad'}</span>
              </button>

              <button
                onClick={() => setShowTransferModal(true)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 text-xs font-medium transition"
                title="Transfer call to human manager"
              >
                <UserCheck className="w-4 h-4 text-amber-400" />
                <span>Transfer</span>
              </button>

              <button
                onClick={onEndTelephonyCall}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs shadow-lg shadow-rose-600/30 active:scale-95 transition"
              >
                <PhoneOff className="w-4 h-4" />
                <span>Hang Up Phone Call</span>
              </button>
            </div>
          )
        )}
      </div>

      {/* Call Transfer Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-5 max-w-sm w-full animate-fade-in">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-amber-400" />
                Transfer Call to Human
              </h3>
              <button
                onClick={() => setShowTransferModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-300 mb-3">
              Enter acquisition manager or phone number to transfer this live call:
            </p>
            <input
              type="tel"
              value={transferPhone}
              onChange={(e) => setTransferPhone(e.target.value)}
              placeholder="+1 (512) 555-9876"
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono text-xs mb-3 focus:outline-none focus:border-amber-500"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowTransferModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (onTransferCall && transferPhone.trim()) {
                    onTransferCall(transferPhone.trim());
                    setShowTransferModal(false);
                  }
                }}
                disabled={!transferPhone.trim()}
                className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs transition disabled:opacity-50"
              >
                Transfer Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Numbers Modal */}
      {showCsvModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-6 max-w-md w-full">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                Load Lead Numbers from CSV
              </h3>
              <button
                onClick={() => setShowCsvModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300 mb-4">
              Upload any standard CSV containing phone numbers, names, and property addresses to quickly dial through your lead list.
            </p>

            <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-700 hover:border-emerald-500/50 rounded-xl p-6 cursor-pointer bg-slate-950/50 transition">
              <FileSpreadsheet className="w-8 h-8 text-slate-500 mb-2" />
              <span className="text-xs text-slate-300 font-medium">Click to select .CSV file</span>
              <span className="text-[10px] text-slate-500 mt-1">Columns: Name, Phone, Address</span>
              <input
                type="file"
                accept=".csv"
                onChange={handleCsvFileUpload}
                className="hidden"
              />
            </label>

            {/* Quick Sample Numbers */}
            <div className="mt-4 pt-3 border-t border-slate-800">
              <span className="text-[11px] font-semibold text-slate-400 block mb-2">Or select a quick test number:</span>
              <div className="space-y-1.5">
                {[
                  { name: 'Mark Johnson (Austin, TX)', phone: '+1 (512) 382-9104' },
                  { name: 'Sarah Miller (Dallas, TX)', phone: '+1 (214) 555-0192' },
                  { name: 'Test Line (Echo / AMD)', phone: '+1 (800) 444-4444' },
                ].map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      onChangeTargetPhone(item.phone);
                      if (onSelectContact) {
                        onSelectContact({
                          id: `sample-${idx}`,
                          name: item.name,
                          phone: item.phone,
                        });
                      }
                      setShowCsvModal(false);
                    }}
                    className="w-full flex items-center justify-between p-2 rounded-lg bg-slate-800/70 hover:bg-slate-800 border border-slate-700 text-xs text-slate-200 transition"
                  >
                    <span>{item.name}</span>
                    <span className="font-mono text-emerald-400">{item.phone}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
