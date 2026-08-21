import { CallFlowGraph, FlowNode } from '../shared/types';
import { getCleanScriptSpeech } from './ollamaService';

/**
 * Compiles all nodes, scripts, and branch conditions in a CallFlowGraph
 * into an optimized master System Prompt for the LLM.
 */
export function compileFlowToSystemPrompt(flow: CallFlowGraph): string {
  const initialNode = flow.nodes.find((n) => n.id === flow.initialNodeId) || flow.nodes[0];

  let prompt = `You are Sarah, an expert AI phone acquisition specialist at Property Care.
You speak naturally, warmly, and concisely in 1 to 2 conversational phone sentences.
Never use bullet points, markdown formatting, or asterisks in your spoken speech.
Follow this exact conversation flow, step scripts, and conditional branching decision tree:

=== COMPLETE CALL WORKFLOW & BRANCHING TREE ===\n`;

  flow.nodes.forEach((node, index) => {
    const isStart = node.id === (initialNode?.id || 'node-greeting');
    const cleanScript = getCleanScriptSpeech(node.agentPrompt);

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
   - DO NOT repeat or concatenate the intro greeting ("Hi, this is Sarah from Property Care...").
   - Speak ONE clean natural sentence: "This is Sarah calling from Property Care. We're reaching out to local homeowners in the area to see if you'd be open to considering a cash offer on your property."
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
6. Keep all spoken responses to 1-2 phone sentences maximum.`;

  return prompt.trim();
}
