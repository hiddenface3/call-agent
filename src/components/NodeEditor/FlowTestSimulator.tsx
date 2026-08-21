import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  FlowNode,
  CallFlowGraph,
  ChatMessage,
  AgentConfig,
  CallStatus,
  QualifiedLead,
} from '../../shared/types';
import { SpeechService } from '../../services/speechService';
import { OllamaService, getCleanScriptSpeech } from '../../services/ollamaService';
import { LeadExtractor } from '../../services/leadExtractor';
import { AudioVisualizer } from '../AudioVisualizer';
import {
  PhoneCall,
  PhoneOff,
  Mic,
  MicOff,
  RotateCcw,
  Send,
  Bot,
  User,
  ArrowRight,
  Radio,
  CheckCircle2,
  XCircle,
  Volume2,
  VolumeX,
  X,
  Zap,
  Sparkles,
  Download,
  Table as TableIcon,
  MessageSquare,
  Home,
  Calendar,
  DollarSign,
  MapPin,
  Flame,
  Clock,
  Wrench,
  HelpCircle,
  Copy,
  Check,
} from 'lucide-react';

interface FlowTestSimulatorProps {
  isOpen: boolean;
  flow: CallFlowGraph;
  activeTestNodeId: string;
  onActiveNodeChange: (nodeId: string) => void;
  onHighlightEdge: (sourceNodeId: string, targetNodeId: string) => void;
  onClose: () => void;
  config: AgentConfig;
}

export const FlowTestSimulator: React.FC<FlowTestSimulatorProps> = ({
  isOpen,
  flow,
  activeTestNodeId,
  onActiveNodeChange,
  onHighlightEdge,
  onClose,
  config,
}) => {
  // Call State
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [callDuration, setCallDuration] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentInterimText, setCurrentInterimText] = useState<string>('');
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const [inputText, setInputText] = useState<string>('');
  const [isVoiceAudioEnabled, setIsVoiceAudioEnabled] = useState<boolean>(true);
  const [lead, setLead] = useState<QualifiedLead>({
    sellerName: '',
    phone: '(555) 382-9104',
    propertyAddress: '',
    propertyType: 'Unknown',
    condition: 'Unknown',
    bedrooms: '',
    bathrooms: '',
    propertyDetails: '',
    callbackTime: '',
    askingPrice: '',
    reasonForSelling: '',
    timeline: 'Unknown',
    qualificationScore: 0,
    dealStatus: 'Nurture',
    customFields: {},
  });
  const [activeTab, setActiveTab] = useState<'chat' | 'table'>('chat');

  // Refs
  const isTurnBusyRef = useRef<boolean>(false);
  const callStatusRef = useRef<CallStatus>(callStatus);
  callStatusRef.current = callStatus;
  const isMutedRef = useRef<boolean>(isMuted);
  isMutedRef.current = isMuted;
  const activeNodeIdRef = useRef<string>(activeTestNodeId);
  activeNodeIdRef.current = activeTestNodeId;
  const messagesRef = useRef<ChatMessage[]>(messages);
  messagesRef.current = messages;
  const configRef = useRef<AgentConfig>(config);
  configRef.current = config;
  const callFlowRef = useRef<CallFlowGraph>(flow);
  callFlowRef.current = flow;
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null);

  const activeNode: FlowNode | undefined =
    flow.nodes.find((n) => n.id === activeTestNodeId) || flow.nodes[0];

  // Auto scroll transcript
  useEffect(() => {
    if (transcriptScrollRef.current) {
      transcriptScrollRef.current.scrollTop = transcriptScrollRef.current.scrollHeight;
    }
  }, [messages, callStatus, currentInterimText]);

  // Duration Timer
  useEffect(() => {
    if (callStatus === 'listening' || callStatus === 'thinking' || callStatus === 'speaking') {
      if (!timerRef.current) {
        timerRef.current = setInterval(() => {
          setCallDuration((prev) => prev + 1);
        }, 1000);
      }
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [callStatus]);

  // Cleanup on close
  useEffect(() => {
    if (!isOpen && (callStatus === 'listening' || callStatus === 'speaking' || callStatus === 'thinking')) {
      handleEndCall();
    }
  }, [isOpen]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  /**
   * Helper: Start Microphone Listening with acoustic echo & self-voice suppression
   */
  const startMicListening = useCallback(() => {
    if (isMutedRef.current) return;

    SpeechService.startListening(
      (transcript, isFinal) => {
        // If LLM is actively reasoning, turn is busy, or agent is currently speaking, IGNORE microphone audio
        if (isTurnBusyRef.current || callStatusRef.current === 'speaking' || SpeechService.isSpeaking()) {
          return;
        }

        const trimmed = transcript.trim();
        if (!trimmed) return;

        // Discard any residual acoustic echo of agent's own speech
        if (SpeechService.isEchoOfAgent(trimmed)) {
          return;
        }

        if (isFinal) {
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          handleProcessUserSpeech(trimmed);
        } else {
          setCurrentInterimText(trimmed);
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(() => {
            if (
              !isTurnBusyRef.current &&
              trimmed.length > 1 &&
              callStatusRef.current === 'listening' &&
              !SpeechService.isSpeaking()
            ) {
              handleProcessUserSpeech(trimmed);
            }
          }, configRef.current.silenceDetectionMs || 1200);
        }
      },
      (err) => console.warn('STT Notice in Simulator:', err),
      () => {}
    );
  }, []);

  /**
   * Process User Speech / Intent & Transition Active Node + Extract Lead Data
   */
  const handleProcessUserSpeech = useCallback(
    async (userText: string) => {
      if (!userText.trim() || isTurnBusyRef.current || SpeechService.isSpeaking()) return;
      isTurnBusyRef.current = true;

      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      setCurrentInterimText('');

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        sender: 'user',
        text: userText.trim(),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        currentNodeId: activeNodeIdRef.current,
      };

      const updatedHistory = [...messagesRef.current, userMsg];
      setMessages(updatedHistory);
      setCallStatus('thinking');

      // Live Lead Variable Extraction
      setLead((prevLead: QualifiedLead) => LeadExtractor.extractLeadInfo(updatedHistory, prevLead, callFlowRef.current.nodes));

      const currentNode =
        callFlowRef.current.nodes.find((n) => n.id === activeNodeIdRef.current) ||
        callFlowRef.current.nodes[0] ||
        null;

      await OllamaService.generateStreamingResponse(
        updatedHistory,
        configRef.current,
        currentNode,
        callFlowRef.current.nodes,
        () => {},
        (spokenResponse, nextNodeId) => {
          // Transition Node and Highlight Canvas Edge in Real Time
          if (nextNodeId && callFlowRef.current.nodes.some((n) => n.id === nextNodeId)) {
            if (currentNode) {
              onHighlightEdge(currentNode.id, nextNodeId);
            }
            activeNodeIdRef.current = nextNodeId;
            onActiveNodeChange(nextNodeId);
          }

          const agentMsg: ChatMessage = {
            id: `agent-${Date.now()}`,
            sender: 'agent',
            text: spokenResponse,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            currentNodeId: nextNodeId || activeNodeIdRef.current,
          };

          const fullHistoryWithAgent = [...updatedHistory, agentMsg];
          setMessages(fullHistoryWithAgent);

          // Re-extract lead info after agent turn
          setLead((prevLead: QualifiedLead) => LeadExtractor.extractLeadInfo(fullHistoryWithAgent, prevLead, callFlowRef.current.nodes));

          // Unlock turn
          isTurnBusyRef.current = false;

          // Voice Speech Synthesis
          if (configRef.current.autoSpeak) {
            setCallStatus('speaking');
            SpeechService.speak(
              spokenResponse,
              configRef.current,
              () => {
                setCallStatus('speaking');
              },
              () => {
                setTimeout(() => {
                  if (callStatusRef.current === 'speaking') {
                    setCallStatus('listening');
                  }
                }, 400);
              },
              () => {
                setTimeout(() => {
                  if (callStatusRef.current === 'speaking') {
                    setCallStatus('listening');
                  }
                }, 400);
              }
            );
          } else {
            setCallStatus('listening');
          }
        },
        (err) => {
          console.error('Workflow Test Error:', err);
          isTurnBusyRef.current = false;
          setCallStatus('listening');
        }
      );
    },
    [onActiveNodeChange, onHighlightEdge]
  );

  /**
   * Start Live Voice Call
   */
  const handleStartCall = async () => {
    isTurnBusyRef.current = false;
    setCallStatus('connecting');
    setCallDuration(0);

    const initialNode = flow.nodes.find((n) => n.id === flow.initialNodeId) || flow.nodes[0];
    if (initialNode) {
      onActiveNodeChange(initialNode.id);
    }

    // Init Mic Analyser
    const analyser = await SpeechService.initAudioAnalyser();
    setAnalyserNode(analyser);

    // Get clean opening speech directly from the initial node prompt
    const openingGreeting = getCleanScriptSpeech(initialNode?.agentPrompt || '');

    const agentGreetingMsg: ChatMessage = {
      id: `agent-${Date.now()}`,
      sender: 'agent',
      text: openingGreeting,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      currentNodeId: initialNode?.id,
    };

    setMessages([agentGreetingMsg]);

    // Activate mic listening right away for instant barge-in support
    startMicListening();

    if (configRef.current.autoSpeak) {
      setCallStatus('speaking');
      SpeechService.speak(
        openingGreeting,
        configRef.current,
        () => {
          setCallStatus('speaking');
        },
        () => {
          if (callStatusRef.current === 'speaking') {
            setCallStatus('listening');
          }
        },
        () => {
          if (callStatusRef.current === 'speaking') {
            setCallStatus('listening');
          }
        }
      );
    } else {
      setCallStatus('listening');
    }
  };

  /**
   * End Voice Call
   */
  const handleEndCall = () => {
    isTurnBusyRef.current = false;
    SpeechService.stopListening();
    SpeechService.stopSpeaking();
    SpeechService.stopAudioAnalyser();
    setAnalyserNode(null);
    setCallStatus('ended');
    setCurrentInterimText('');
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
  };

  /**
   * Toggle Mute
   */
  const handleToggleMute = () => {
    if (isMuted) {
      setIsMuted(false);
      isMutedRef.current = false;
      startMicListening();
    } else {
      setIsMuted(true);
      isMutedRef.current = true;
      SpeechService.stopListening();
    }
  };

  /**
   * Reset Call & Re-run
   */
  const handleResetCall = () => {
    handleEndCall();
    setMessages([]);
    setCallStatus('idle');
    setCallDuration(0);
    const initialNode = flow.nodes.find((n) => n.id === flow.initialNodeId) || flow.nodes[0];
    if (initialNode) {
      onActiveNodeChange(initialNode.id);
    }
  };

  if (!isOpen) return null;

  return (
    <aside className="absolute top-0 right-0 bottom-0 w-[420px] z-40 bg-white/95 backdrop-blur-2xl border-l border-slate-200 shadow-2xl flex flex-col font-['Plus_Jakarta_Sans',sans-serif] animate-slide-left select-none">
      {/* Header */}
      <div className="p-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-[1px] shadow-md shadow-emerald-500/20">
            <div className="w-full h-full bg-white rounded-[11px] flex items-center justify-center">
              <PhoneCall className="w-4 h-4 text-emerald-600" />
            </div>
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              Live Voice Call Testing
              {callStatus !== 'idle' && callStatus !== 'ended' && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              )}
            </h3>
            <p className="text-[10px] text-slate-500">Live Voice STT + Neural TTS + Real-Time Flow</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleResetCall}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
            title="Reset Simulation"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Live Voice Call Hero Card (Compact for Canvas Drawer) */}
      <div className="p-4 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 text-white border-b border-slate-800 flex flex-col items-center relative overflow-hidden">
        {/* Ambient Top Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-16 bg-blue-500/20 rounded-full blur-2xl pointer-events-none"></div>

        {/* Status Badge & Call Timer */}
        <div className="w-full flex items-center justify-between text-xs mb-3 z-10">
          <div className="flex items-center gap-1.5">
            {callStatus === 'speaking' ? (
              <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-bold flex items-center gap-1 animate-pulse">
                <Volume2 className="w-3 h-3 text-cyan-400" />
                Sarah Speaking...
              </span>
            ) : callStatus === 'thinking' ? (
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-bold flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-indigo-400 animate-spin" />
                LLM Thinking...
              </span>
            ) : callStatus === 'listening' ? (
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1 animate-pulse">
                <Mic className="w-3 h-3 text-emerald-400" />
                Listening to Homeowner...
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 text-[10px] font-bold">
                Call Ready
              </span>
            )}
          </div>

          <div className="font-mono text-[11px] font-bold text-slate-300 bg-slate-800/80 px-2.5 py-0.5 rounded-full border border-slate-700">
            {formatDuration(callDuration)}
          </div>
        </div>

        {/* Pulsing Voice Avatar & Frequency Waveform */}
        <div className="relative my-2 flex flex-col items-center">
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 ${
              callStatus === 'speaking'
                ? 'bg-cyan-500/20 ring-8 ring-cyan-500/20 shadow-lg shadow-cyan-500/50'
                : callStatus === 'listening'
                ? 'bg-emerald-500/20 ring-8 ring-emerald-500/20 shadow-lg shadow-emerald-500/50 animate-pulse'
                : callStatus === 'thinking'
                ? 'bg-indigo-500/20 ring-8 ring-indigo-500/20 shadow-lg shadow-indigo-500/50'
                : 'bg-slate-800 border border-slate-700'
            }`}
          >
            <Bot className={`w-8 h-8 ${callStatus === 'speaking' ? 'text-cyan-400 animate-pulse' : callStatus === 'listening' ? 'text-emerald-400' : 'text-slate-400'}`} />
          </div>

          {/* Audio Visualizer Waves */}
          <div className="w-48 h-8 mt-2">
            <AudioVisualizer analyserNode={analyserNode} status={callStatus} />
          </div>
        </div>

        {/* Interim Speech Caption */}
        {currentInterimText && (
          <div className="w-full mt-1 mb-2 px-3 py-1.5 rounded-xl bg-slate-800/90 border border-slate-700/80 text-[11px] text-emerald-300 text-center italic truncate">
            &quot;{currentInterimText}...&quot;
          </div>
        )}

        {/* Call Controls */}
        <div className="flex items-center gap-3 mt-1 z-10">
          {callStatus === 'idle' || callStatus === 'ended' ? (
            <button
              onClick={handleStartCall}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 transition active:scale-95"
            >
              <PhoneCall className="w-4 h-4" />
              <span>Start Voice Call</span>
            </button>
          ) : (
            <>
              <button
                onClick={handleToggleMute}
                className={`p-2.5 rounded-xl border transition ${
                  isMuted ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                }`}
                title={isMuted ? 'Unmute Mic' : 'Mute Mic'}
              >
                {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              <button
                onClick={handleEndCall}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-600/30 transition active:scale-95"
              >
                <PhoneOff className="w-4 h-4" />
                <span>End Call</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Active Script Node Banner */}
      <div className="p-3 bg-emerald-50/70 border-b border-emerald-100 flex items-center justify-between">
        <div className="truncate mr-2">
          <span className="text-[9px] font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1">
            <Radio className="w-3 h-3 text-emerald-600 animate-pulse" />
            Active Node Step
          </span>
          <h4 className="text-xs font-bold text-slate-900 truncate">{activeNode?.title || 'Node Step'}</h4>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-mono text-[9px] font-bold uppercase">
          {activeNode?.type || 'step'}
        </span>
      </div>

      {/* View Switcher Tabs: Chat Stream vs Extracted CRM Table */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-100/90 border-b border-slate-200 text-xs">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('chat')}
            className={`px-3 py-1.5 rounded-lg font-bold text-[11px] flex items-center gap-1.5 transition ${
              activeTab === 'chat'
                ? 'bg-white text-blue-700 shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Live Dialogue</span>
          </button>

          <button
            onClick={() => setActiveTab('table')}
            className={`px-3 py-1.5 rounded-lg font-bold text-[11px] flex items-center gap-1.5 transition ${
              activeTab === 'table'
                ? 'bg-white text-emerald-700 shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <TableIcon className="w-3.5 h-3.5" />
            <span>Extracted CRM Table</span>
            {lead.qualificationScore > 0 && (
              <span className="px-1.5 py-0.2 bg-emerald-600 text-white rounded-full text-[9px] font-mono">
                {lead.qualificationScore}%
              </span>
            )}
          </button>
        </div>

        <button
          onClick={() => LeadExtractor.downloadLeadCsv(lead)}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold shadow-xs transition active:scale-95"
          title="Download Extracted Data as CSV"
        >
          <Download className="w-3 h-3" />
          <span>CSV</span>
        </button>
      </div>

      {activeTab === 'chat' ? (
        /* Live Conversation Transcript */
        <div ref={transcriptScrollRef} className="flex-1 p-3.5 overflow-y-auto space-y-2.5 bg-slate-50/40 text-xs">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-400">
              <Bot className="w-8 h-8 mb-2 text-slate-300" />
              <p className="font-semibold text-slate-700 text-xs">Voice Session Ready</p>
              <p className="text-[11px] text-slate-400 mt-1 max-w-[220px]">
                Click &quot;Start Voice Call&quot; above to speak naturally or click quick customer chips below!
              </p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-center gap-1 text-[10px] text-slate-400 font-semibold mb-1">
                  {msg.sender === 'agent' ? (
                    <>
                      <Bot className="w-3 h-3 text-blue-600" />
                      <span>Sarah</span>
                    </>
                  ) : (
                    <>
                      <span>Homeowner</span>
                      <User className="w-3 h-3 text-emerald-600" />
                    </>
                  )}
                  <span className="text-[9px] opacity-60 ml-1">{msg.timestamp}</span>
                </div>
                <div
                  className={`max-w-[88%] p-2.5 rounded-2xl text-[11px] leading-relaxed shadow-2xs ${
                    msg.sender === 'user'
                      ? 'bg-blue-600 text-white rounded-tr-xs'
                      : 'bg-white text-slate-800 border border-slate-200/90 rounded-tl-xs'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))
          )}

          {/* Live Speaking Homeowner Bubble */}
          {currentInterimText && (
            <div className="flex flex-col items-end animate-fade-in">
              <div className="flex items-center gap-1 text-[10px] text-emerald-600 font-semibold mb-1">
                <span>Homeowner (Speaking...)</span>
                <Mic className="w-3 h-3 text-emerald-600 animate-pulse" />
              </div>
              <div className="max-w-[88%] p-2.5 rounded-2xl text-[11px] leading-relaxed shadow-md bg-emerald-600 text-white rounded-tr-xs italic border border-emerald-400/40">
                &quot;{currentInterimText}...&quot;
              </div>
            </div>
          )}

          {/* LLM Thinking Bubble */}
          {callStatus === 'thinking' && (
            <div className="flex flex-col items-start animate-fade-in">
              <div className="flex items-center gap-1 text-[10px] text-indigo-600 font-semibold mb-1">
                <Bot className="w-3 h-3 text-indigo-600" />
                <span>Sarah (Reasoning...)</span>
              </div>
              <div className="p-2.5 rounded-2xl text-[11px] bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-tl-xs flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-indigo-500 animate-spin" />
                <span>Matching flow condition & script...</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Extracted CRM Data Table in Simulator */
        <div className="flex-1 p-3 overflow-y-auto space-y-2.5 bg-slate-50/70 text-xs">
          <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              <div>
                <span className="font-bold text-slate-800 text-[11px] block">Live Slot Extraction</span>
                <span className="text-[10px] text-slate-500">Variables detected across caller turns</span>
              </div>
            </div>
            <button
              onClick={() => LeadExtractor.downloadLeadCsv(lead)}
              className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold shadow-xs flex items-center gap-1"
            >
              <Download className="w-3 h-3" />
              <span>Export CSV</span>
            </button>
          </div>

          {/* Table Container */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[9px] text-slate-500 uppercase tracking-wider font-bold">
                  <th className="py-2 px-2.5">Field / Variable</th>
                  <th className="py-2 px-2.5">Extracted Data</th>
                  <th className="py-2 px-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[11px]">
                {[
                  { tag: '{{client_name}}', label: 'Client Name', value: lead.sellerName, icon: <User className="w-3 h-3 text-blue-500" /> },
                  { tag: '{{property_details}}', label: 'Property Details', value: lead.propertyDetails, icon: <Home className="w-3 h-3 text-emerald-500" /> },
                  { tag: '{{callback_time}}', label: 'Callback Time', value: lead.callbackTime, icon: <Calendar className="w-3 h-3 text-cyan-500" /> },
                  { tag: '{{asking_price}}', label: 'Asking Price', value: lead.askingPrice, icon: <DollarSign className="w-3 h-3 text-emerald-600" /> },
                  { tag: '{{property_address}}', label: 'Property Address', value: lead.propertyAddress, icon: <MapPin className="w-3 h-3 text-purple-500" /> },
                  { tag: '{{condition}}', label: 'Condition', value: lead.condition !== 'Unknown' ? lead.condition : '', icon: <Wrench className="w-3 h-3 text-amber-500" /> },
                  { tag: '{{timeline}}', label: 'Timeline', value: lead.timeline !== 'Unknown' ? lead.timeline : '', icon: <Clock className="w-3 h-3 text-teal-500" /> },
                  { tag: '{{motivation}}', label: 'Motivation', value: lead.reasonForSelling, icon: <HelpCircle className="w-3 h-3 text-indigo-500" /> },
                ].map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/80 transition">
                    <td className="py-2 px-2.5 align-top">
                      <div className="flex items-center gap-1.5">
                        {row.icon}
                        <span className="font-semibold text-slate-800 text-[10px]">{row.label}</span>
                      </div>
                      <span className="text-[9px] font-mono text-slate-400 block">{row.tag}</span>
                    </td>
                    <td className="py-2 px-2.5 align-middle">
                      {row.value ? (
                        <span className="font-semibold text-slate-900 select-text">{row.value}</span>
                      ) : (
                        <span className="text-slate-400 italic text-[10px]">Listening...</span>
                      )}
                    </td>
                    <td className="py-2 px-2 align-middle text-right">
                      {row.value ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800">
                          Extracted
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-100 text-slate-400">
                          Empty
                        </span>
                      )}
                    </td>
                  </tr>
                ))}

                {/* Custom Slots */}
                {lead.customFields &&
                  Object.entries(lead.customFields).map(([cKey, cVal], cIdx) => (
                    <tr key={`c-${cIdx}`} className="bg-indigo-50/40">
                      <td className="py-2 px-2.5 align-top">
                        <div className="flex items-center gap-1.5">
                          <Sparkles className="w-3 h-3 text-indigo-600" />
                          <span className="font-semibold text-indigo-900 text-[10px] capitalize">{cKey}</span>
                        </div>
                        <span className="text-[9px] font-mono text-indigo-500 block">{`{{${cKey}}}`}</span>
                      </td>
                      <td className="py-2 px-2.5 align-middle">
                        <span className="font-semibold text-indigo-900 select-text">{String(cVal)}</span>
                      </td>
                      <td className="py-2 px-2 align-middle text-right">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-100 text-indigo-800">
                          Custom
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 1-Click Simulation Scenario Chips (Trigger Branches Directly on the Live Call!) */}
      <div className="p-3 bg-white border-t border-slate-100 space-y-2">
        <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-wider">
          <span>1-Click Voice Triggers:</span>
          <span className="text-[9px] text-blue-600">Simulate Homeowner</span>
        </div>

        <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
          {activeNode && activeNode.transitions.length > 0 ? (
            activeNode.transitions.map((t) => (
              <button
                key={t.id}
                disabled={callStatus === 'thinking' || isTurnBusyRef.current}
                onClick={() => handleProcessUserSpeech(t.conditionText || t.label)}
                className={`px-2.5 py-1.5 rounded-xl border text-[10px] font-semibold flex items-center gap-1.5 transition active:scale-95 text-left truncate max-w-full disabled:opacity-40 ${
                  t.label.toLowerCase().includes('no') || t.label.toLowerCase().includes('not')
                    ? 'bg-rose-50 hover:bg-rose-100 text-rose-800 border-rose-200'
                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                }`}
                title={`Trigger: ${t.label} (Routes to: ${t.targetNodeId})`}
              >
                {t.label.toLowerCase().includes('no') || t.label.toLowerCase().includes('not') ? (
                  <XCircle className="w-3 h-3 text-rose-600 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                )}
                <span className="truncate">{t.label}</span>
                <ArrowRight className="w-2.5 h-2.5 opacity-60 shrink-0" />
              </button>
            ))
          ) : (
            <button
              disabled={callStatus === 'thinking' || isTurnBusyRef.current}
              onClick={() => handleProcessUserSpeech("Yes, that sounds good, let's proceed.")}
              className="px-2.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 text-[10px] font-semibold flex items-center gap-1 disabled:opacity-40"
            >
              <CheckCircle2 className="w-3 h-3 text-blue-600" />
              <span>Next Step Progression</span>
            </button>
          )}

          {/* Universal Quick Injections */}
          <button
            disabled={callStatus === 'thinking' || isTurnBusyRef.current}
            onClick={() => handleProcessUserSpeech("No, I'm not looking to sell the property right now.")}
            className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-medium disabled:opacity-40"
          >
            ❌ &quot;Not Selling&quot;
          </button>
          <button
            disabled={callStatus === 'thinking' || isTurnBusyRef.current}
            onClick={() => handleProcessUserSpeech("It is a 3 bedroom 2 bath house in great condition.")}
            className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-medium disabled:opacity-40"
          >
            ✅ &quot;3 Bed 2 Bath&quot;
          </button>
        </div>

        {/* Text Input Fallback Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!inputText.trim() || isTurnBusyRef.current) return;
            handleProcessUserSpeech(inputText.trim());
            setInputText('');
          }}
          className="flex items-center gap-1.5 pt-1"
        >
          <input
            type="text"
            value={inputText}
            disabled={callStatus === 'thinking' || isTurnBusyRef.current}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type homeowner reply..."
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-xs focus:border-blue-600 focus:bg-white focus:outline-none transition disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || callStatus === 'thinking' || isTurnBusyRef.current}
            className="p-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 transition shadow-sm"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </aside>
  );
};
