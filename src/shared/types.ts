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
  agentPrompt: string; // What the AI agent should say or ask
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
  provider: 'groq' | 'ollama' | 'lmstudio' | 'local_custom' | 'browser_agent';
  endpoint: string;
  model: string;
  groqApiKey: string;
  temperature: number;
  systemPrompt: string;
  sttEngine: 'web_speech' | 'cloud_whisper' | 'local_whisper';
  ttsEngine: 'web_speech_synth' | 'elevenlabs' | 'kokoro_local';
  elevenLabsApiKey?: string;
  elevenLabsVoiceId?: string;
  selectedVoiceName: string;
  autoSpeak: boolean;
  silenceDetectionMs: number;
  useNodeFlow: boolean;
}
