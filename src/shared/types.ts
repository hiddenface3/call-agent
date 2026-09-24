export type CallStatus = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'ended';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'agent' | 'system';
  text: string;
  timestamp: string;
  confidence?: number;
  stage?: 'greeting' | 'property_info' | 'motivation' | 'price_timeline' | 'closing';
  currentNodeId?: string;
}

export interface QualifiedLead {
  id?: string;
  sellerName: string;
  phone: string;
  propertyAddress: string;
  propertyType: 'Single Family' | 'Multi Family' | 'Condo/Townhouse' | 'Commercial' | 'Unknown';
  condition: 'Move-in Ready' | 'Needs Minor TLC' | 'Heavy Fixer' | 'Distressed' | 'Unknown';
  bedrooms?: string;
  bathrooms?: string;
  propertyDetails?: string; // e.g. "2 bedroom 2 bathrooms", "3 Bed / 2 Bath Ranch"
  callbackTime?: string; // e.g. "Tomorrow at 2:00 PM", "Friday afternoon"
  askingPrice: string;
  reasonForSelling: string;
  timeline: 'Immediate (0-30 days)' | '1-3 Months' | '3-6 Months' | 'Just Exploring' | 'Unknown';
  qualificationScore: number; // 0-100%
  dealStatus: 'Hot Lead' | 'Warm Follow-Up' | 'Nurture' | 'Disqualified';
  customFields?: Record<string, string>; // Dynamic slot extractions from {{custom_var}}
  extractedAt?: string;
}

export interface FlowTransition {
  id: string;
  label: string; // e.g. "Customer willing to sell"
  conditionText: string; // criteria for LLM to match
  targetNodeId: string; // target FlowNode id
}

export interface FlowNode {
  id: string;
  type: 'start' | 'question' | 'objection' | 'action' | 'end';
  title: string;
  agentPrompt: string; // Pure spoken speech (strictly NO curly braces or variable names)
  targetVariable?: string; // Dedicated data extraction variable key (e.g. 'asking_price', 'callback_time')
  targetVariableLabel?: string; // User-friendly label (e.g. 'Asking Price', 'Scheduled Callback Time')
  customVariables?: string[]; // Node-specific custom extraction variables
  position: { x: number; y: number };
  defaultNextNodeId?: string; // Direct link without adding branch conditions
  transitions: FlowTransition[];
}

export interface CallFlowGraph {
  id: string;
  name: string;
  initialNodeId: string;
  nodes: FlowNode[];
}

export interface AgentConfig {
  provider: 'gemini_live' | 'groq' | 'ollama' | 'lmstudio' | 'local_custom' | 'browser_agent';
  endpoint: string;
  model: string;
  groqApiKey: string;
  geminiApiKey?: string;
  geminiLiveVoice?: 'Aoede' | 'Puck' | 'Charon' | 'Fenrir' | 'Kore';
  thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high';
  temperature: number;
  systemPrompt: string;
  compilerModel?: string;
  sttEngine: 'web_speech' | 'cloud_whisper' | 'local_whisper';
  ttsEngine: 'web_speech_synth' | 'elevenlabs' | 'kokoro_local';
  elevenLabsApiKey?: string;
  elevenLabsVoiceId?: string;
  selectedVoiceName: string;
  autoSpeak: boolean;
  silenceDetectionMs: number;
  useNodeFlow: boolean;
  // Telnyx Real Telephony Config
  telnyxApiKey?: string;
  telnyxConnectionId?: string;
  telnyxFromNumber?: string;
  telnyxRelayUrl?: string;
  telnyxAmdStrategy?: 'hangup_on_machine' | 'voicemail_drop' | 'wait_for_human';
  telnyxVoicemailScript?: string;
}

export type CallMode = 'local_test' | 'telnyx_outbound';

export type TelephonyCallStatus =
  | 'idle'
  | 'initiating'
  | 'ringing'
  | 'amd_evaluating'
  | 'connected_live'
  | 'voicemail_drop'
  | 'completed'
  | 'failed';

export interface PhoneContact {
  id: string;
  name: string;
  phone: string;
  address?: string;
  notes?: string;
}

