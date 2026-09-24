import { CallFlowGraph, FlowNode, AgentConfig } from '../shared/types';
import { getCleanScriptSpeech } from './ollamaService';

export interface CompilerModelOption {
  id: string;
  name: string;
  provider: 'groq' | 'gemini';
  badge: string;
}

export const COMPILER_MODELS: CompilerModelOption[] = [
  {
    id: 'openai/gpt-oss-120b',
    name: 'Groq: GPT OSS 120B',
    provider: 'groq',
    badge: '120B Flagship Reasoning',
  },
  {
    id: 'openai/gpt-oss-20b',
    name: 'Groq: GPT OSS 20B',
    provider: 'groq',
    badge: 'Fast Reasoning',
  },
  {
    id: 'qwen/qwen3.8-27b',
    name: 'Groq: Qwen 3.8 27B',
    provider: 'groq',
    badge: '27B Conversational',
  },
  {
    id: 'llama-3.3-70b-versatile',
    name: 'Groq: Llama 3.3 70B',
    provider: 'groq',
    badge: 'Meta 70B',
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Google: Gemini 2.5 Flash',
    provider: 'gemini',
    badge: 'Multimodal Speed',
  },
  {
    id: 'gemini-1.5-pro',
    name: 'Google: Gemini 1.5 Pro',
    provider: 'gemini',
    badge: 'Deep Reasoning',
  },
];

/**
 * Automatically inspects the opening greeting node to extract the agent's name
 * and company name (e.g. "Hi, this is Mark from Property Care..." -> { agentName: 'Mark', companyName: 'Property Care' })
 */
export function detectAgentIdentity(flow?: CallFlowGraph | null): { agentName: string; companyName: string } {
  const initialNode = flow?.nodes?.find((n) => n.id === flow.initialNodeId) || flow?.nodes?.[0];
  const script = initialNode?.agentPrompt || '';

  // Match "this is Mark", "I'm Mark", "my name is Mark", "I am Mark", "this is mark"
  const nameMatch = script.match(/(?:this is|I'm|I am|my name is)\s+([A-Za-z]+)/i);
  let agentName = nameMatch ? nameMatch[1].trim() : 'Sarah';
  agentName = agentName.charAt(0).toUpperCase() + agentName.slice(1).toLowerCase();

  // Match "from Property Care", "with Apex Homes", "at Property Care"
  const companyMatch = script.match(/(?:from|with|at)\s+([A-Za-z0-9\s&]+?)(?:\.|\?|,|!|\s+Are|\s+Calling|\s+How|\{\{|$)/i);
  let companyName = companyMatch ? companyMatch[1].trim() : 'Property Care';

  return { agentName, companyName };
}

/**
 * Uses Groq LPU API to intelligently analyze all nodes,
 * scripts, and branch conditions, and synthesize a cohesive master System Prompt.
 */
export async function compileFlowWithGroq(
  flow: CallFlowGraph,
  apiKey: string,
  preferredModel: string = 'openai/gpt-oss-120b'
): Promise<string> {
  const trimmedKey = apiKey?.trim();
  if (!trimmedKey) {
    throw new Error('Groq API Key is required to perform intelligent prompt analysis.');
  }

  const { agentName, companyName } = detectAgentIdentity(flow);

  // Format node graph details for LLM reasoning with clean speech and isolated variable capture
  const nodesSummary = flow.nodes.map((n, i) => {
    const cleanScript = (n.agentPrompt || '').replace(/\{\{[^}]*\}\}/g, '').replace(/\s{2,}/g, ' ').trim();
    const variableInfo = n.targetVariable
      ? `CRM Variable to Capture: "${n.targetVariableLabel || n.targetVariable}" [${n.targetVariable}] (Captured silently out-of-band by backend AI; AGENT MUST NOT UTTER THIS VARIABLE)`
      : 'CRM Variable to Capture: None (Speech only)';

    const transitions = n.transitions.map(t => {
      const target = flow.nodes.find(targetNode => targetNode.id === t.targetNodeId);
      return `      - Condition: "${t.label}" (${t.conditionText || t.label}) -> Next: "${target?.title || t.targetNodeId}"`;
    }).join('\n');

    return `Node ${i + 1}: "${n.title}" [ID: ${n.id}]
   Type: ${n.type}
   Script to Speak: "${cleanScript}"
   ${variableInfo}
   Branches:
${transitions || '      - (Terminal / End of call)'}`;
  }).join('\n\n');

  const systemInstruction = `You are an elite Conversational AI Prompt Engineer specializing in real estate telephony and acquisitions.
Your task is to analyze a visual call flow graph and synthesize a master System Prompt for "${agentName}", an expert phone acquisitions specialist at ${companyName}.

CRITICAL IDENTITY MANDATE:
- The agent's identity is strictly "${agentName}" representing "${companyName}".
- The synthesized System Prompt MUST begin with: "You are ${agentName}, an expert AI phone acquisition specialist at ${companyName}."
- NEVER call the agent "Sarah" or any other name unless the node script explicitly designates it.

CRITICAL NEGATIVE CONSTRAINT (NEVER SPEAK VARIABLES OR BRACKETS):
- Under NO circumstances should the agent speak, pronounce, or utter variable names, field keys, or curly braces (e.g. {{asking_price}}, {{callback_time}}, asking_price, or callback_time).
- CRM variables are extracted silently out-of-band by the backend AI system.
- The agent MUST speak ONLY natural, conversational English sentences as a real human phone caller.

Guidelines:
1. Tone & Persona: ${agentName} is warm, respectful, natural, confident, and conversational. Speak in 1-2 spoken sentences maximum per turn.
2. Spoken Speech: Strictly forbid bullet points, markdown formatting, emojis, curly braces, variable brackets, or asterisks in spoken output.
3. Objections & Handling: Synthesize smart strategies for handling common objections ("Not interested", "Who are you?", "How did you get my number?").
4. Workflow & Step Progression: Clearly outline the step-by-step logic from greeting to bed/bath qualification, condition, asking price, and callback scheduling based on the provided nodes.
5. Incomplete Responses: Instruct ${agentName} how to acknowledge partial answers and naturally ask for the missing details without repeating robotically.
6. Output: Provide ONLY the raw synthesized System Prompt text that will be used directly as the agent's instructions. Do not include any meta commentary, markdown code fence blocks, or introductory greetings.`;

  const userPrompt = `Here is the visual call workflow graph to analyze and synthesize.
IMPORTANT: The greeting node script establishes that the agent is "${agentName}" from "${companyName}".

=== WORKFLOW GRAPH NODES & BRANCHES ===
${nodesSummary}

Analyze all nodes and synthesize the complete, intelligent master System Prompt for ${agentName} at ${companyName} now:`;

  // Candidate models on Groq in priority order
  const candidateModels = Array.from(new Set([
    preferredModel,
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'qwen/qwen3.8-27b',
  ])).filter(Boolean);

  let lastError: Error | null = null;

  for (const modelToTry of candidateModels) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${trimmedKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelToTry,
          temperature: 0.3,
          max_tokens: 4096,
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: userPrompt },
          ],
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const msg = errData?.error?.message || `Groq API returned error HTTP ${response.status}`;
        throw new Error(msg);
      }

      const data = await response.json();
      const synthesizedPrompt = data.choices?.[0]?.message?.content?.trim();
      if (!synthesizedPrompt) {
        throw new Error('Groq returned an empty response.');
      }

      return synthesizedPrompt;
    } catch (err: any) {
      lastError = err;
      console.warn(`Groq candidate model ${modelToTry} failed: ${err.message}, checking next candidate...`);
    }
  }

  throw lastError || new Error('All Groq candidate models failed to respond.');
}

/**
 * Uses Google Gemini REST API to analyze all nodes and synthesize a master System Prompt.
 */
export async function compileFlowWithGemini(
  flow: CallFlowGraph,
  apiKey: string,
  model: string = 'gemini-2.5-flash'
): Promise<string> {
  const trimmedKey = apiKey?.trim();
  if (!trimmedKey) {
    throw new Error('Google Gemini API Key is required to compile with Gemini.');
  }

  const { agentName, companyName } = detectAgentIdentity(flow);

  const nodesSummary = flow.nodes.map((n, i) => {
    const cleanScript = (n.agentPrompt || '').replace(/\{\{[^}]*\}\}/g, '').replace(/\s{2,}/g, ' ').trim();
    const variableInfo = n.targetVariable
      ? `CRM Variable to Capture: "${n.targetVariableLabel || n.targetVariable}" [${n.targetVariable}] (Captured silently out-of-band by backend AI; AGENT MUST NOT UTTER THIS VARIABLE)`
      : 'CRM Variable to Capture: None (Speech only)';

    const transitions = n.transitions.map(t => {
      const target = flow.nodes.find(targetNode => targetNode.id === t.targetNodeId);
      return `      - Condition: "${t.label}" (${t.conditionText || t.label}) -> Next: "${target?.title || t.targetNodeId}"`;
    }).join('\n');

    return `Node ${i + 1}: "${n.title}" [ID: ${n.id}]
   Type: ${n.type}
   Script to Speak: "${cleanScript}"
   ${variableInfo}
   Branches:
${transitions || '      - (Terminal / End of call)'}`;
  }).join('\n\n');

  const systemInstruction = `You are an elite Conversational AI Prompt Engineer specializing in real estate telephony and acquisitions.
Your task is to analyze a visual call flow graph and synthesize a master System Prompt for "${agentName}", an expert phone acquisitions specialist at ${companyName}.

CRITICAL IDENTITY MANDATE:
- The agent's identity is strictly "${agentName}" representing "${companyName}".
- The synthesized System Prompt MUST begin with: "You are ${agentName}, an expert AI phone acquisition specialist at ${companyName}."
- NEVER call the agent "Sarah" or any other name unless the node script explicitly designates it.

CRITICAL NEGATIVE CONSTRAINT (NEVER SPEAK VARIABLES OR BRACKETS):
- Under NO circumstances should the agent speak, pronounce, or utter variable names, field keys, or curly braces (e.g. {{asking_price}}, {{callback_time}}, asking_price, or callback_time).
- CRM variables are extracted silently out-of-band by the backend AI system.
- The agent MUST speak ONLY natural, conversational English sentences as a real human phone caller.

Guidelines:
1. Tone & Persona: ${agentName} is warm, respectful, natural, confident, and conversational. Speak in 1-2 spoken sentences maximum per turn.
2. Spoken Speech: Strictly forbid bullet points, markdown formatting, emojis, curly braces, variable brackets, or asterisks in spoken output.
3. Objections & Handling: Synthesize smart strategies for handling common objections ("Not interested", "Who are you?", "How did you get my number?").
4. Workflow & Step Progression: Clearly outline the step-by-step logic from greeting to bed/bath qualification, condition, asking price, and callback scheduling based on the provided nodes.
5. Incomplete Responses: Instruct ${agentName} how to acknowledge partial answers and naturally ask for the missing details without repeating robotically.
6. Output: Provide ONLY the raw synthesized System Prompt text that will be used directly as the agent's instructions. Do not include any meta commentary, markdown code fence blocks, or introductory greetings.`;

  const userPrompt = `Here is the visual call workflow graph to analyze and synthesize.
IMPORTANT: The greeting node script establishes that the agent is "${agentName}" from "${companyName}".

=== WORKFLOW GRAPH NODES & BRANCHES ===
${nodesSummary}

Analyze all nodes and synthesize the complete, intelligent master System Prompt for ${agentName} at ${companyName} now:`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(trimmedKey)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemInstruction }]
      },
      contents: [{
        role: 'user',
        parts: [{ text: userPrompt }]
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 4096,
      }
    })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData?.error?.message || `Gemini API returned error HTTP ${response.status}`);
  }

  const data = await response.json();
  const synthesizedPrompt = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!synthesizedPrompt) {
    throw new Error('Gemini returned an empty response.');
  }

  return synthesizedPrompt;
}

/**
 * Unified compiler dispatcher: supports selecting any Groq or Gemini model.
 */
export async function compileFlowWithSelectedModel(
  flow: CallFlowGraph,
  selectedModel: string,
  config: AgentConfig
): Promise<string> {
  const isGemini = selectedModel.toLowerCase().startsWith('gemini');
  if (isGemini) {
    const geminiKey = (config.geminiApiKey || (import.meta as any).env?.VITE_GEMINI_API_KEY || '').trim();
    return compileFlowWithGemini(flow, geminiKey, selectedModel);
  } else {
    const groqKey = (config.groqApiKey || (import.meta as any).env?.VITE_GROQ_API_KEY || '').trim();
    return compileFlowWithGroq(flow, groqKey, selectedModel);
  }
}

/**
 * Fast deterministic fallback compiler for compiling nodes into structured rules
 */
export function compileFlowToSystemPrompt(flow: CallFlowGraph): string {
  const initialNode = flow.nodes.find((n) => n.id === flow.initialNodeId) || flow.nodes[0];
  const { agentName, companyName } = detectAgentIdentity(flow);

  let prompt = `You are ${agentName}, an expert AI phone acquisition specialist at ${companyName}.
You speak naturally, warmly, and concisely in 1 to 2 conversational phone sentences.
Never use bullet points, markdown formatting, or asterisks in your spoken speech.
STRICT NEGATIVE CONSTRAINT: Never speak or output variable brackets or database field names (e.g. {{asking_price}}, {{callback_time}}). Speak only natural English sentences.
Follow this exact conversation flow, step scripts, and conditional branching decision tree:

=== COMPLETE CALL WORKFLOW & BRANCHING TREE ===\n`;

  flow.nodes.forEach((node, index) => {
    const isStart = node.id === (initialNode?.id || 'node-greeting');
    const cleanScript = (node.agentPrompt || '').replace(/\{\{[^}]*\}\}/g, '').replace(/\s{2,}/g, ' ').trim();

    prompt += `\n[STEP ${index + 1}: ${node.title}] (Node ID: "${node.id}")${isStart ? ' - START OF CALL' : ''}
- EXACT SCRIPT TO SPEAK: "${cleanScript}"
- BRANCH CONDITIONS & NEXT STEPS:`;

    if (node.transitions.length === 0) {
      prompt += `\n  * (Terminal Node - Conclude the call politely)`;
    } else {
      node.transitions.forEach((t) => {
        const targetNode = flow.nodes.find((n) => n.id === t.targetNodeId);
        const targetTitle = targetNode ? targetNode.title : t.targetNodeId;
        prompt += `\n  * If customer response matches "${t.label}" (${t.conditionText || t.label}): -> TRANSITION TO "${targetTitle}" [NEXT_NODE: ${t.targetNodeId}]`;
      });
    }
    prompt += '\n';
  });

  prompt += `
=== EXECUTION & ROUTING INSTRUCTIONS ===
1. START OF CALL: Speak the EXACT SCRIPT from Step 1 directly.
2. IDENTITY & CLARIFICATION QUESTIONS:
   - If the customer asks "Who are you?", "Who are you calling?", "Why are you calling?", "What is this about?", or asks for repetition:
   - DO NOT ADVANCE TO ANOTHER STEP ([NEXT_NODE: STAY]).
   - DO NOT repeat or concatenate the intro greeting ("Hi, this is ${agentName} from ${companyName}...").
   - Speak ONE clean natural sentence: "This is ${agentName} calling from ${companyName}. We're reaching out to local homeowners in the area to see if you'd be open to considering a cash offer on your property."
   - Output [NEXT_NODE: STAY].
3. PARTIAL & INCOMPLETE RESPONSES (REPHRASED FOLLOW-UP):
   - If the customer only answers ONE part of a multi-part question (for example: they say "No repairs needed" but omit the bedroom/bathroom count, or give timeline without price):
   - DO NOT advance to the next node.
   - DO NOT repeat the entire prompt robotically.
   - ACKNOWLEDGE what they answered, and NATURALLY REPHRASE the missing part (e.g. "Glad to hear it doesn't need repairs! And roughly how many bedrooms and bathrooms does it have?").
   - Output [NEXT_NODE: STAY].
4. STRICT CONDITIONAL BRANCHING:
   - ONLY advance to a child step [NEXT_NODE: <node_id>] once all required details for the step are genuinely provided.
   - If neither condition is satisfied (unclear, confused, or off-topic response), address their statement, repeat the current step question, and output [NEXT_NODE: STAY].
5. ROUTING TAG: At the very end of your response, you MUST append either [NEXT_NODE: <node_id>] or [NEXT_NODE: STAY].
6. Keep all spoken responses to 1-2 phone sentences maximum.
7. CRITICAL SPEECH RULE: Under NO circumstances should you speak out loud any curly braces or variable names (e.g. {{asking_price}}, {{callback_time}}).`;

  return prompt.trim();
}
