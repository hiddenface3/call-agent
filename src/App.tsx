import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  CallStatus,
  ChatMessage,
  QualifiedLead,
  AgentConfig,
  CallFlowGraph,
  FlowNode,
  CallMode,
  TelephonyCallStatus,
  PhoneContact,
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
import { GeminiLiveService } from './services/geminiLiveService';
import { TelnyxClientService } from './services/telnyxClientService';
import { detectAgentIdentity } from './services/promptCompiler';
import { ModelControlHub } from './components/ModelControlHub';
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
          provider: parsed.provider || DEFAULT_CONFIG.provider,
          model: parsed.model || DEFAULT_CONFIG.model,
          groqApiKey: parsed.groqApiKey || DEFAULT_CONFIG.groqApiKey,
          geminiApiKey: parsed.geminiApiKey || DEFAULT_CONFIG.geminiApiKey,
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

  // Telephony & Dual-Mode State
  const [callMode, setCallMode] = useState<CallMode>('local_test');
  const [targetPhone, setTargetPhone] = useState<string>('+1 (512) 382-9104');
  const [telephonyStatus, setTelephonyStatus] = useState<TelephonyCallStatus>('idle');
  const [telephonyDetailText, setTelephonyDetailText] = useState<string>('');
  const [contacts, setContacts] = useState<PhoneContact[]>([
    { id: 'contact-1', name: 'Mark Johnson', phone: '+1 (512) 382-9104', address: '742 Evergreen Terrace, Austin TX' },
    { id: 'contact-2', name: 'Sarah Miller', phone: '+1 (214) 555-0192', address: '1204 Oak Ridge Dr, Dallas TX' },
  ]);

  // Sequential Auto-Dialer State (One Call at a Time Queue)
  const [isSequentialMode, setIsSequentialMode] = useState<boolean>(false);
  const [currentQueueIndex, setCurrentQueueIndex] = useState<number>(0);
  const [queueCountdown, setQueueCountdown] = useState<number | null>(null);

  const isSequentialModeRef = useRef<boolean>(isSequentialMode);
  isSequentialModeRef.current = isSequentialMode;
  const currentQueueIndexRef = useRef<number>(currentQueueIndex);
  currentQueueIndexRef.current = currentQueueIndex;
  const contactsRef = useRef<PhoneContact[]>(contacts);
  contactsRef.current = contacts;

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
   * Process user speech and trigger Groq/Gemini LLM reasoning with Node Flow execution
   */
  const handleProcessUserSpeech = useCallback(
    async (userText: string) => {
      if (!userText.trim() || isTurnBusyRef.current) return;
      if (configRef.current.provider !== 'gemini_live' && SpeechService.isSpeaking()) return;

      isTurnBusyRef.current = true;

      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      setCurrentInterimText('');

      // If running on Gemini Live native speech-to-speech
      if (configRef.current.provider === 'gemini_live') {
        const userMsg: ChatMessage = {
          id: `user-${Date.now()}`,
          sender: 'user',
          text: userText.trim(),
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          currentNodeId: activeNodeIdRef.current,
        };
        const updatedMessages = [...messagesRef.current, userMsg];
        setMessages(updatedMessages);
        const updatedLead = LeadExtractor.extractLeadInfo(updatedMessages, lead, callFlowRef.current.nodes);
        setLead(updatedLead);
        setCallStatus('thinking');

        // Trigger AI Brain extraction in background (Groq 120B/Gemini in JSON mode)
        const currentActiveNode =
          callFlowRef.current.nodes.find((n) => n.id === activeNodeIdRef.current) ||
          callFlowRef.current.nodes[0] ||
          null;
        LeadExtractor.extractLeadWithAi(
          updatedMessages,
          updatedLead,
          currentActiveNode,
          callFlowRef.current.nodes,
          configRef.current
        ).then((aiLead) => {
          setLead((prev) => LeadExtractor.mergeAiLeadData(prev, aiLead));
        }).catch((e) => console.warn('Background AI lead extraction failed:', e));

        GeminiLiveService.sendRealtimeText(userText);
        isTurnBusyRef.current = false;
        return;
      }

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

      // 2. Extract Lead Info (baseline + background AI brain extraction)
      const updatedLead = LeadExtractor.extractLeadInfo(updatedMessages, lead, callFlowRef.current.nodes);
      setLead(updatedLead);

      const currentActiveNode =
        callFlowRef.current.nodes.find((n) => n.id === activeNodeIdRef.current) ||
        callFlowRef.current.nodes[0] ||
        null;

      LeadExtractor.extractLeadWithAi(
        updatedMessages,
        updatedLead,
        currentActiveNode,
        callFlowRef.current.nodes,
        configRef.current
      ).then((aiLead) => {
        setLead((prev) => LeadExtractor.mergeAiLeadData(prev, aiLead));
      }).catch((e) => console.warn('Background AI lead extraction failed:', e));

      // 3. Set Agent Thinking
      setCallStatus('thinking');
      setStreamingAgentText('');

      // 4. Call Groq Cloud API with Node Instructions
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

          // Re-extract lead info with AI Brain
          setLead((prevLead) => {
            const baseline = LeadExtractor.extractLeadInfo([...updatedMessages, agentMsg], prevLead, callFlowRef.current.nodes);
            LeadExtractor.extractLeadWithAi(
              [...updatedMessages, agentMsg],
              baseline,
              currentActiveNode,
              callFlowRef.current.nodes,
              configRef.current
            ).then((aiLead) => {
              setLead((p) => LeadExtractor.mergeAiLeadData(p, aiLead));
            }).catch((e) => console.warn('Background AI lead extraction failed:', e));
            return baseline;
          });

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

    // Provider: Gemini Live Speech-to-Speech
    if (configRef.current.provider === 'gemini_live') {
      try {
        const analyser = await GeminiLiveService.startSession(
          configRef.current,
          callFlowRef.current,
          initialNode,
          {
            onConnected: () => {
              setCallStatus('speaking');
            },
            onDisconnected: () => {
              setCallStatus('ended');
            },
            onError: (err) => {
              console.error('Gemini Live error:', err);
              alert(err);
              setCallStatus('ended');
            },
            onUserTranscript: (text, isInterim) => {
              if (isInterim) {
                setCurrentInterimText(text);
              } else {
                setCurrentInterimText('');
                const userMsg: ChatMessage = {
                  id: `user-${Date.now()}`,
                  sender: 'user',
                  text: text.trim(),
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                  currentNodeId: activeNodeIdRef.current,
                };
                setMessages((prev) => {
                  const updated = [...prev, userMsg];
                  const newLead = LeadExtractor.extractLeadInfo(updated, lead, callFlowRef.current.nodes);
                  setLead(newLead);
                  return updated;
                });
                setCallStatus('thinking');
              }
            },
            onAgentTranscript: (text) => {
              setCallStatus('speaking');
              setStreamingAgentText((prev) => prev + text);
            },
            onTurnComplete: () => {
              setStreamingAgentText((fullText) => {
                if (fullText.trim()) {
                  const agentMsg: ChatMessage = {
                    id: `agent-${Date.now()}`,
                    sender: 'agent',
                    text: fullText.trim(),
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                    currentNodeId: activeNodeIdRef.current,
                  };
                  setMessages((prev) => {
                    const updated = [...prev, agentMsg];
                    const newLead = LeadExtractor.extractLeadInfo(updated, lead, callFlowRef.current.nodes);
                    setLead(newLead);

                    const currentActiveNode =
                      callFlowRef.current.nodes.find((n) => n.id === activeNodeIdRef.current) ||
                      callFlowRef.current.nodes[0] ||
                      null;

                    LeadExtractor.extractLeadWithAi(
                      updated,
                      newLead,
                      currentActiveNode,
                      callFlowRef.current.nodes,
                      configRef.current
                    ).then((aiLead) => {
                      setLead((prevLead) => LeadExtractor.mergeAiLeadData(prevLead, aiLead));
                    }).catch((e) => console.warn('Background AI lead extraction failed:', e));

                    return updated;
                  });
                }
                return '';
              });
              setCallStatus('listening');
            },
            onInterrupted: () => {
              setCallStatus('listening');
              setStreamingAgentText('');
            },
          }
        );
        setAnalyserNode(analyser);
      } catch (err: any) {
        console.error('Failed to start Gemini Live call:', err);
        setCallStatus('ended');
      }
      return;
    }

    // Default: Groq / Ollama STT + TTS pipeline
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
    if (configRef.current.provider === 'gemini_live') {
      GeminiLiveService.stopSession();
    }
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
    if (configRef.current.provider === 'gemini_live') {
      const muted = GeminiLiveService.toggleMute();
      setIsMuted(muted);
      isMutedRef.current = muted;
      return;
    }

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
    if (configRef.current.provider === 'gemini_live') {
      GeminiLiveService.stopPlaybackQueue();
      setCallStatus('listening');
      isTurnBusyRef.current = false;
      return;
    }
    SpeechService.stopSpeaking();
    isTurnBusyRef.current = false;
    setCallStatus('listening');
  };

  /**
   * Start Live Outbound Telephony Call (Telnyx PSTN)
   */
  /**
   * Start Live Outbound Telephony Call (Telnyx PSTN)
   */
  const handleStartTelephonyCallWithTarget = async (phoneToDial?: string) => {
    const dialNumber = phoneToDial || targetPhone;
    if (!dialNumber.trim()) {
      alert('Please enter a target phone number to dial.');
      return;
    }

    setTelephonyStatus('initiating');
    setTelephonyDetailText(`Dialing ${dialNumber}...`);
    setMessages([]);

    const activeContact = contactsRef.current[currentQueueIndexRef.current];
    setLead({
      ...INITIAL_LEAD_STATE,
      phone: dialNumber,
      sellerName: activeContact?.name || 'Homeowner',
      propertyAddress: activeContact?.address || '',
    });

    try {
      await TelnyxClientService.initiateCall(
        {
          to: dialNumber,
          from: config.telnyxFromNumber || '',
          config: config,
          flow: callFlow,
        },
        {
          onStatusChange: (status, detail) => {
            setTelephonyStatus(status);
            if (detail) setTelephonyDetailText(detail);
          },
          onUserTranscript: (text, isFinal) => {
            if (isFinal && text.trim()) {
              const userMsg: ChatMessage = {
                id: `user-${Date.now()}`,
                sender: 'user',
                text: text.trim(),
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                currentNodeId: activeNodeIdRef.current,
              };
              setMessages((prev) => {
                const updated = [...prev, userMsg];
                const newLead = LeadExtractor.extractLeadInfo(updated, lead, callFlowRef.current.nodes);
                setLead(newLead);
                return updated;
              });
            }
          },
          onAgentTranscript: (text) => {
            setStreamingAgentText((prev) => prev + text);
          },
          onLeadExtracted: (extractedData) => {
            if (extractedData) {
              setLead((prev) => ({
                ...prev,
                ...extractedData,
              }));
            }
          },
          onError: (err) => {
            console.error('Telephony error:', err);
            setTelephonyStatus('failed');
            setTelephonyDetailText(err);
            handleCheckNextSequentialLead();
          },
          onEnded: () => {
            setTelephonyStatus('completed');
            setTelephonyDetailText('Call finished.');
            handleCheckNextSequentialLead();
          },
        }
      );
    } catch (err: any) {
      setTelephonyStatus('failed');
      setTelephonyDetailText(err.message || 'Telephony dial failed.');
      handleCheckNextSequentialLead();
    }
  };

  const handleStartTelephonyCall = () => {
    handleStartTelephonyCallWithTarget(targetPhone);
  };

  /**
   * Sequential Queue Auto-Advance Handlers
   */
  const handleCheckNextSequentialLead = () => {
    if (!isSequentialModeRef.current) return;
    const nextIdx = currentQueueIndexRef.current + 1;
    if (nextIdx >= contactsRef.current.length) {
      setTelephonyDetailText('Sequential Campaign Complete! All leads dialed.');
      setIsSequentialMode(false);
      return;
    }
    // Start countdown for next lead
    setQueueCountdown(5);
  };

  useEffect(() => {
    if (queueCountdown === null) return;
    if (queueCountdown > 0) {
      const timer = setTimeout(() => {
        setQueueCountdown((prev) => (prev !== null && prev > 0 ? prev - 1 : null));
      }, 1000);
      return () => clearTimeout(timer);
    } else if (queueCountdown === 0) {
      setQueueCountdown(null);
      handleExecuteNextQueueLead();
    }
  }, [queueCountdown]);

  const handleExecuteNextQueueLead = () => {
    const nextIdx = currentQueueIndexRef.current + 1;
    if (nextIdx < contactsRef.current.length) {
      setCurrentQueueIndex(nextIdx);
      const nextContact = contactsRef.current[nextIdx];
      setTargetPhone(nextContact.phone);
      setTimeout(() => {
        handleStartTelephonyCallWithTarget(nextContact.phone);
      }, 300);
    } else {
      setIsSequentialMode(false);
    }
  };

  const handleSkipQueueLead = () => {
    const nextIdx = currentQueueIndex + 1;
    if (nextIdx < contacts.length) {
      setCurrentQueueIndex(nextIdx);
      setTargetPhone(contacts[nextIdx].phone);
      setQueueCountdown(5);
    } else {
      setQueueCountdown(null);
      setIsSequentialMode(false);
    }
  };

  const handleDialQueueNow = () => {
    setQueueCountdown(null);
    handleExecuteNextQueueLead();
  };

  const handleCancelQueue = () => {
    setQueueCountdown(null);
    setIsSequentialMode(false);
    setTelephonyDetailText('Sequential Auto-Dialer paused.');
  };

  /**
   * Transfer Live Call to Human Acquisition Manager
   */
  const handleTransferTelephonyCall = async (transferTo: string) => {
    setTelephonyDetailText(`Transferring call to ${transferTo}...`);
    const success = await TelnyxClientService.transferCall(transferTo, config.telnyxRelayUrl);
    if (success) {
      setTelephonyDetailText(`Call transferred to ${transferTo}.`);
    } else {
      setTelephonyDetailText(`Failed to transfer call to ${transferTo}.`);
    }
  };

  /**
   * End Live Outbound Telephony Call
   */
  const handleEndTelephonyCall = async () => {
    await TelnyxClientService.hangupCall(config.telnyxRelayUrl);
    setTelephonyStatus('completed');
    setTelephonyDetailText('Call ended by user.');
    handleCheckNextSequentialLead();
  };

  /**
   * Dispatch Touch-Tone DTMF Tone for IVR Navigation
   */
  const handleSendDtmf = async (digit: string) => {
    await TelnyxClientService.sendDtmf(digit, config.telnyxRelayUrl);
  };

  /**
   * Reset Session
   */
  const handleClearSession = () => {
    handleEndCall();
    handleEndTelephonyCall();
    setMessages([]);
    setLead(INITIAL_LEAD_STATE);
    setCallStatus('idle');
    setTelephonyStatus('idle');
    setTelephonyDetailText('');
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

            {/* AI Model & Engine Hub (1-Click Side Switcher & Config) */}
            <ModelControlHub
              config={config}
              onUpdateConfig={handleSaveConfig}
              availableVoices={availableVoices}
              onOpenFullSettings={() => setIsSettingsOpen(true)}
            />

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
              callMode={callMode}
              onSelectCallMode={setCallMode}
              targetPhone={targetPhone}
              onChangeTargetPhone={setTargetPhone}
              telephonyStatus={telephonyStatus}
              telephonyDetailText={telephonyDetailText}
              onStartTelephonyCall={handleStartTelephonyCall}
              onEndTelephonyCall={handleEndTelephonyCall}
              onSendDtmf={handleSendDtmf}
              phoneContacts={contacts}
              onSelectContact={(c) => {
                setTargetPhone(c.phone);
                const idx = contacts.findIndex((x) => x.id === c.id || x.phone === c.phone);
                if (idx !== -1) setCurrentQueueIndex(idx);
                if (c.name) {
                  setLead((prev) => ({
                    ...prev,
                    sellerName: c.name,
                    phone: c.phone,
                    propertyAddress: c.address || prev.propertyAddress,
                  }));
                }
              }}
              agentName={detectAgentIdentity(callFlow).agentName}
              isSequentialMode={isSequentialMode}
              onToggleSequentialMode={setIsSequentialMode}
              currentQueueIndex={currentQueueIndex}
              queueCountdown={queueCountdown}
              onSkipQueueLead={handleSkipQueueLead}
              onDialQueueNow={handleDialQueueNow}
              onCancelQueue={handleCancelQueue}
              onUploadContacts={(newContacts) => {
                setContacts(newContacts);
                setCurrentQueueIndex(0);
              }}
              onTransferCall={handleTransferTelephonyCall}
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
