import { CallFlowGraph, FlowNode, AgentConfig, QualifiedLead } from './types';

export const DEFAULT_CONFIG: AgentConfig = {
  provider: 'groq',
  endpoint: 'https://api.groq.com/openai/v1',
  model: 'openai/gpt-oss-20b',
  groqApiKey: (import.meta as any).env?.VITE_GROQ_API_KEY || '',
  temperature: 0.5,
  systemPrompt: `You are Sarah, a professional and friendly phone acquisition specialist.
You speak naturally, warmly, and concisely in 1-2 conversational phone sentences.
Always follow the exact script, identity, and company name provided in the active flow step.
Never use bullet points, markdown formatting, or asterisks.`,
  sttEngine: 'web_speech',
  ttsEngine: 'web_speech_synth',
  selectedVoiceName: 'Google US English',
  silenceDetectionMs: 1400,
  autoSpeak: true,
  useNodeFlow: true,
};

export const INITIAL_LEAD_STATE: QualifiedLead = {
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
};

export const SAMPLE_CALLER_SCENARIOS = [
  {
    title: 'Motivated Seller (Willing to Sell)',
    description: 'Homeowner open to cash offer on 3 bed 2 bath house in Austin',
    dialogues: [
      'Hi, yes this is Mark Johnson. What is this regarding?',
      'It is a 3 bedroom 2 bath ranch style house in North Austin. It needs some minor roof repairs.',
      'We want around $340,000 for it and would like to close within 45 days.',
      'Tomorrow at 2:00 PM works great for the follow-up callback call.',
    ],
  },
  {
    title: 'Objection (Not Selling Right Now)',
    description: 'Homeowner initially declines but considers selling next year',
    dialogues: [
      'No, I am not interested in selling my house right now.',
      'Well, maybe in about 6 to 12 months once my daughter finishes school.',
      'Sure, you can send me a quick text estimate to this number.',
    ],
  },
  {
    title: 'Firm Refusal (Polite Exit)',
    description: 'Homeowner strictly not selling and requests removal',
    dialogues: [
      'No, definitely not selling. Please do not call this number again.',
    ],
  },
];

export const DEFAULT_CALL_FLOW: CallFlowGraph = {
  id: 'flow-real-estate-v1',
  name: 'Real Estate Cold Call Lead Qualification',
  initialNodeId: 'node-greeting',
  nodes: [
    {
      id: 'node-greeting',
      type: 'start',
      title: '1. Greeting & Selling Intent',
      agentPrompt: 'Hi, this is Sarah from Property Care. Are you open to considering selling your property for the best price? {{client_name}}',
      position: { x: 50, y: 220 },
      transitions: [
        {
          id: 'trans-greeting-agree',
          label: 'agree',
          conditionText: 'Customer agrees, says yes, asks for details, or is open to selling',
          targetNodeId: 'node-bed-bath',
        },
        {
          id: 'trans-greeting-disagree',
          label: 'disagree',
          conditionText: 'Customer says no, not selling, not interested, or objects',
          targetNodeId: 'node-future-interest',
        },
      ],
    },
    {
      id: 'node-bed-bath',
      type: 'question',
      title: '2. Bedrooms & Bathrooms Specs',
      agentPrompt: 'Great! How many bedrooms and bathrooms does the property have, and does it need any major repairs or updates? {{property_details}} {{condition}}',
      position: { x: 450, y: 100 },
      transitions: [
        {
          id: 'trans-bed-bath-details',
          label: 'Gives property details',
          conditionText: 'Customer shares bedrooms, bathrooms, condition, or house specs',
          targetNodeId: 'node-pricing-timeline',
        },
      ],
    },
    {
      id: 'node-future-interest',
      type: 'objection',
      title: '3. Objection: Future Selling Interest',
      agentPrompt: 'Completely understand! If you are not looking to sell right now, might you consider selling down the road in the next 6 to 12 months?',
      position: { x: 450, y: 440 },
      transitions: [
        {
          id: 'trans-future-maybe',
          label: 'Maybe in the future / Later',
          conditionText: 'Customer says maybe later, in 6 months, next year, or might consider',
          targetNodeId: 'node-nurture-text',
        },
        {
          id: 'trans-future-no',
          label: 'Definite No / Still not selling',
          conditionText: 'Customer says definitely not, never, remove me, or firm no',
          targetNodeId: 'node-politely-end',
        },
      ],
    },
    {
      id: 'node-pricing-timeline',
      type: 'question',
      title: '4. Asking Price & Timeline',
      agentPrompt: 'Got it! What ballpark cash price do you have in mind, and how quickly would you ideally like to close the sale? {{asking_price}} {{timeline}}',
      position: { x: 860, y: 100 },
      transitions: [
        {
          id: 'trans-price-timeline-done',
          label: 'Shares price or timeline',
          conditionText: 'Customer shares asking price, ballpark amount, or timeframe',
          targetNodeId: 'node-senior-buyer',
        },
      ],
    },
    {
      id: 'node-nurture-text',
      type: 'action',
      title: '5. Future Nurture & Valuation',
      agentPrompt: 'Would it be okay if we send you a free, no-obligation cash estimate via text so you have it for future reference? {{property_address}}',
      position: { x: 860, y: 440 },
      transitions: [
        {
          id: 'trans-nurture-done',
          label: 'Agrees or declines text',
          conditionText: 'Customer agrees to text estimate, provides cell number, or declines',
          targetNodeId: 'node-politely-end',
        },
      ],
    },
    {
      id: 'node-senior-buyer',
      type: 'action',
      title: '6. Senior Buyer Callback',
      agentPrompt: 'Thank you for all those details! Would tomorrow afternoon work for a quick 10-minute follow-up call with our senior acquisition manager to present a firm cash offer? {{callback_time}}',
      position: { x: 1260, y: 100 },
      transitions: [
        {
          id: 'trans-senior-callback-done',
          label: 'Confirms callback time',
          conditionText: 'Customer agrees to callback, confirms time, says sounds good, fine, or provides availability',
          targetNodeId: 'node-politely-end',
        },
      ],
    },
    {
      id: 'node-politely-end',
      type: 'end',
      title: '7. Politely Conclude Call',
      agentPrompt: 'Perfect! I have that scheduled. Thank you so much for your time today! Have a wonderful rest of your day, goodbye!',
      position: { x: 1260, y: 440 },
      transitions: [],
    },
  ],
};
