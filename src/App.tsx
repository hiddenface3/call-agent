import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  CallStatus,
  ChatMessage,
  QualifiedLead,
  AgentConfig,
  CallFlowGraph,
  FlowNode,
} from './shared/types';
import { DEFAULT_CONFIG, INITIAL_LEAD_STATE, DEFAULT_CALL_FLOW } from './shared/constants';
import { Navbar } from './components/Navbar';
import { CallHero } from './components/CallHero';
import { TranscriptView } from './components/TranscriptView';
import { LeadCard } from './components/LeadCard';
import { CallerSimulator } from './components/CallerSimulator';
import { AgentSettingsModal } from './components/AgentSettingsModal';
import { NodeCanvas } from './components/NodeEditor/NodeCanvas';
import { SpeechService } from './services/speechService';
import { OllamaService, getCleanScriptSpeech } from './services/ollamaService';
import { LeadExtractor } from './services/leadExtractor';
import { GitBranch, Radio, Sparkles, ArrowRight } from 'lucide-react';

export const App: React.FC = () => {
  // State
  const [config, setConfig] = useState<AgentConfig>(() => {
    const saved = localStorage.getItem('apex_voice_config_v4');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...DEFAULT_CONFIG,
          ...parsed,
          provider: 'groq',
          model: parsed.model && parsed.model !== 'llama3.2:3b' && parsed.model !== 'llama-3.3-70b-versatile' ? parsed.model : DEFAULT_CONFIG.model,
          groqApiKey: parsed.groqApiKey || DEFAULT_CONFIG.groqApiKey,
        };
      } catch {
        return DEFAULT_CONFIG;
      }
    }
    return DEFAULT_CONFIG;
  });

  const [callFlow, setCallFlow] = useState<CallFlowGraph>(() => {
    const saved = localStorage.getItem('apex_call_flow_graph');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as CallFlowGraph;
        const seniorNode = parsed.nodes?.find((n) => n.id === 'node-senior-buyer');
        if (seniorNode && (!seniorNode.transitions || seniorNode.transitions.length === 0)) {
          seniorNode.transitions = [
            {
              id: 'trans-senior-callback-done',
              label: 'Confirms callback time',
              conditionText: 'Customer agrees to callback, confirms time, says sounds good, fine, or provides availability',
              targetNodeId: 'node-politely-end',
            },
          ];
        }
        return parsed;
      } catch {
        return DEFAULT_CALL_FLOW;
      }
    }
    return DEFAULT_CALL_FLOW;
  });

  const [activeView, setActiveView] = useState<'call' | 'flow'>('call');
  const [activeNodeId, setActiveNodeId] = useState<string>(callFlow.initialNodeId || 'node-greeting');
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [callDuration, setCallDuration] = useState<number>(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [lead, setLead] = useState<QualifiedLead>(INITIAL_LEAD_STATE);
  const [streamingAgentText, setStreamingAgentText] = useState<string>('');
  const [currentInterimText, setCurrentInterimText] = useState<string>('');
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const [isLlmConnected, setIsLlmConnected] = useState<boolean>(true);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);

  // Modals
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Refs
  const isTurnBusyRef = useRef<boolean>(false);
  const callStatusRef = useRef<CallStatus>(callStatus);
  callStatusRef.current = callStatus;
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const messagesRef = useRef<ChatMessage[]>(messages);
  messagesRef.current = messages;
  const configRef = useRef<AgentConfig>(config);
  configRef.current = config;
  const isMutedRef = useRef<boolean>(isMuted);
  isMutedRef.current = isMuted;
  const callFlowRef = useRef<CallFlowGraph>(callFlow);
  callFlowRef.current = callFlow;
  const activeNodeIdRef = useRef<string>(activeNodeId);
  activeNodeIdRef.current = activeNodeId;

  // Active Flow Node computed
  const activeNode: FlowNode | null =
    callFlow.nodes.find((n) => n.id === activeNodeId) || callFlow.nodes[0] || null;

  // Check LLM endpoint health and load voices
  useEffect(() => {
    const checkConnection = async () => {
      const res = await OllamaService.checkHealth(config);
      setIsLlmConnected(res.isRunning);
    };
    checkConnection();
    const interval = setInterval(checkConnection, 10000);

    const loadVoices = () => {
      setAvailableVoices(SpeechService.getAvailableVoices());
    };
    loadVoices();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    return () => {
      clearInterval(interval);
    };
  }, [config]);

  // Call timer effect
  useEffect(() => {
    if (callStatus === 'listening' || callStatus === 'thinking' || callStatus === 'speaking') {
      if (!callTimerRef.current) {
        callTimerRef.current = setInterval(() => {
          setCallDuration((prev) => prev + 1);
        }, 1000);
      }
    } else if (callStatus === 'idle' || callStatus === 'ended') {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
        callTimerRef.current = null;
      }
    }
    return () => {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
        callTimerRef.current = null;
      }
    };
  }, [callStatus]);

  // Save config
  const handleSaveConfig = (newConfig: AgentConfig) => {
    setConfig(newConfig);
    localStorage.setItem('apex_voice_config_v4', JSON.stringify(newConfig));
  };

  // Save updated flow graph
  const handleUpdateFlow = (updatedFlow: CallFlowGraph) => {
    setCallFlow(updatedFlow);
    localStorage.setItem('apex_call_flow_graph', JSON.stringify(updatedFlow));
  };

  /**
   * Start listening helper with acoustic echo & self-voice suppression
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

        // Discard any residual echo of agent's own speech
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
      (err) => {
        console.warn('STT Notice in App:', err);
      },
      () => {}
    );
  }, []);

  /**
   * Process user speech and trigger Groq LLM reasoning with Node Flow execution
   */
  const handleProcessUserSpeech = useCallback(
    async (userText: string) => {
      if (!userText.trim() || isTurnBusyRef.current || SpeechService.isSpeaking()) return;
      isTurnBusyRef.current = true;

      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      setCurrentInterimText('');

      // 1. Add User Message to Transcript
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        sender: 'user',
        text: userText.trim(),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        currentNodeId: activeNodeIdRef.current,
      };

      const updatedMessages = [...messagesRef.current, userMsg];
      setMessages(updatedMessages);

      // 2. Extract Lead Info (including dynamic custom variable tags)
      const updatedLead = LeadExtractor.extractLeadInfo(updatedMessages, lead, callFlowRef.current.nodes);
      setLead(updatedLead);

      // 3. Set Agent Thinking
      setCallStatus('thinking');
      setStreamingAgentText('');

      // 4. Find current active node in graph
      const currentActiveNode =
        callFlowRef.current.nodes.find((n) => n.id === activeNodeIdRef.current) ||
        callFlowRef.current.nodes[0] ||
        null;

      // 5. Call Groq Cloud API with Node Instructions
      await OllamaService.generateStreamingResponse(
        updatedMessages,
        configRef.current,
        currentActiveNode,
        callFlowRef.current.nodes,
        (token) => {
          setStreamingAgentText((prev) => prev + token);
        },
        (spokenResponse, nextNodeId) => {
          // Advance to next node if returned
          if (nextNodeId && callFlowRef.current.nodes.some((n) => n.id === nextNodeId)) {
            activeNodeIdRef.current = nextNodeId;
            setActiveNodeId(nextNodeId);
          }

          const agentMsg: ChatMessage = {
            id: `agent-${Date.now()}`,
            sender: 'agent',
            text: spokenResponse,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            currentNodeId: nextNodeId || activeNodeIdRef.current,
          };

          setMessages((prev) => [...prev, agentMsg]);
          setStreamingAgentText('');

          // Re-extract lead info
          setLead((prevLead) => LeadExtractor.extractLeadInfo([...updatedMessages, agentMsg], prevLead, callFlowRef.current.nodes));

          // Unlock turn
          isTurnBusyRef.current = false;

          // 6. Speak Agent Response
          if (configRef.current.autoSpeak) {
            setCallStatus('speaking');
            SpeechService.speak(
              spokenResponse,
              configRef.current,
              () => {
                setCallStatus('speaking');
              },
              () => {
                // Buffer to allow room audio reverb to settle before listening
                setTimeout(() => {
                  if (callStatusRef.current === 'speaking') {
                    setCallStatus('listening');
                  }
                }, 400);
              },
              (err) => {
                console.warn('TTS error:', err);
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
          console.error('LLM Error:', err);
          isTurnBusyRef.current = false;
          setCallStatus('listening');
        }
      );
    },
    [lead]
  );

  /**
   * Start Voice Call
   */
  const handleStartCall = async () => {
    isTurnBusyRef.current = false;
    setCallStatus('connecting');
    setCallDuration(0);

    const initialNode = callFlow.nodes.find((n) => n.id === callFlow.initialNodeId) || callFlow.nodes[0];
    if (initialNode) {
      setActiveNodeId(initialNode.id);
    }

    // Init Mic Analyser
    const analyser = await SpeechService.initAudioAnalyser();
    setAnalyserNode(analyser);

    const openingGreeting = getCleanScriptSpeech(initialNode?.agentPrompt || '');

    const agentGreetingMsg: ChatMessage = {
      id: `agent-${Date.now()}`,
      sender: 'agent',
      text: openingGreeting,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      stage: 'greeting',
      currentNodeId: initialNode?.id,
    };

    setMessages([agentGreetingMsg]);

    // Activate mic listening right away for instant barge-in support
    startMicListening();

    // Speak initial greeting
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
    setStreamingAgentText('');
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
   * Manual Interrupt Agent Speech
   */
  const handleInterrupt = () => {
    SpeechService.stopSpeaking();
    isTurnBusyRef.current = false;
    setCallStatus('listening');
  };

  /**
   * Reset Session
   */
  const handleClearSession = () => {
    handleEndCall();
    setMessages([]);
    setLead(INITIAL_LEAD_STATE);
    setCallStatus('idle');
    setCallDuration(0);
    setActiveNodeId(callFlow.initialNodeId || 'node-greeting');
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#070a12] text-slate-100 overflow-hidden select-none">
      {/* Top Navigation */}
      <Navbar
        config={config}
        isLlmConnected={isLlmConnected}
        activeView={activeView}
        activeNode={activeNode}
        onChangeView={setActiveView}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onClearSession={handleClearSession}
      />

      {/* Main View Area */}
      {activeView === 'flow' ? (
        /* Visual Node Script Editor Canvas */
        <div className="flex-1 p-4 overflow-hidden">
          <NodeCanvas
            flow={callFlow}
            activeNodeId={activeNodeId}
            onUpdateFlow={handleUpdateFlow}
            config={config}
            onUpdateConfig={handleSaveConfig}
          />
        </div>
      ) : (
        /* Active Call Dashboard */
        <main className="flex-1 p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 overflow-hidden">
          {/* Left Column (5 cols): Call Interface & Caller Simulator */}
          <div className="lg:col-span-5 flex flex-col gap-4 overflow-y-auto pr-1">
            {/* Active Script Node Banner */}
            {activeNode && (
              <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl flex items-center justify-between">
                <div className="flex items-center gap-2.5 truncate mr-3">
                  <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
                    <GitBranch className="w-4 h-4" />
                  </div>
                  <div className="truncate">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">
                        Active Script Node
                      </span>
                      {callStatus !== 'idle' && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      )}
                    </div>
                    <p className="text-xs font-bold text-white truncate">{activeNode.title}</p>
                  </div>
                </div>

                <button
                  onClick={() => setActiveView('flow')}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/40 text-cyan-300 font-semibold text-xs transition active:scale-95 shrink-0"
                >
                  <span>Open Canvas</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <CallHero
              status={callStatus}
              isMuted={isMuted}
              callDuration={callDuration}
              analyserNode={analyserNode}
              currentInterimText={currentInterimText}
              onStartCall={handleStartCall}
              onEndCall={handleEndCall}
              onToggleMute={handleToggleMute}
              onInterrupt={handleInterrupt}
            />

            <CallerSimulator
              onInjectCallerSpeech={(line) => {
                if (callStatus === 'idle' || callStatus === 'ended') {
                  handleStartCall();
                  setTimeout(() => handleProcessUserSpeech(line), 1200);
                } else {
                  handleProcessUserSpeech(line);
                }
              }}
              disabled={callStatus === 'thinking' || isTurnBusyRef.current}
            />
          </div>

          {/* Middle Column (4 cols): Live Transcript Stream */}
          <div className="lg:col-span-4 h-full overflow-hidden">
            <TranscriptView
              messages={messages}
              streamingAgentText={streamingAgentText}
              currentInterimText={currentInterimText}
              isThinking={callStatus === 'thinking'}
              onSendMessage={(text) => handleProcessUserSpeech(text)}
              disabled={callStatus === 'thinking' || isTurnBusyRef.current}
            />
          </div>

          {/* Right Column (3 cols): Qualified Lead CRM Card */}
          <div className="lg:col-span-3 h-full overflow-hidden">
            <LeadCard lead={lead} />
          </div>
        </main>
      )}

      {/* Settings Modal */}
      <AgentSettingsModal
        isOpen={isSettingsOpen}
        config={config}
        flow={callFlow}
        availableVoices={availableVoices}
        onClose={() => setIsSettingsOpen(false)}
        onSave={handleSaveConfig}
      />
    </div>
  );
};
export default App;
