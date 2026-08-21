import { AgentConfig, ChatMessage, FlowNode } from '../shared/types';
import { LeadExtractor } from './leadExtractor';

/**
 * Utility to extract clean spoken speech from a node prompt
 */
export function getCleanScriptSpeech(rawPrompt: string): string {
  if (!rawPrompt || !rawPrompt.trim()) {
    return "Hi, this is Sarah from Property Care. Are you open to considering selling your property for the best price?";
  }

  let text = rawPrompt.trim();

  // Strip dynamic extraction tags like {{property_details}}, {{client_name}}, {{callback_time}}
  text = text.replace(/\{\{[^}]*\}\}/g, '').trim();

  // Strip wrapping quotes
  if (text.startsWith('"') && text.endsWith('"') && text.length > 2) {
    text = text.slice(1, -1).trim();
  }

  // Clean double spaces
  text = text.replace(/\s+/g, ' ').trim();

  // Convert instructional prompts into direct speech
  if (/^say hello warmly/i.test(text) || /^state you are/i.test(text) || /^ask if/i.test(text)) {
    text = text
      .replace(/^say hello warmly,?\s*/i, 'Hello! ')
      .replace(/state you are\s*/i, 'This is ')
      .replace(/,?\s*and ask if (you would|they would)/i, '. Would you')
      .replace(/,?\s*and ask if/i, '. Would you')
      .replace(/at the best price\??/i, 'for the best price?');

    if (!text.endsWith('?') && !text.endsWith('.')) {
      text += '?';
    }
  }

  return text || "Hi, this is Sarah from Property Care. Are you open to considering selling your property for the best price?";
}

/**
 * Check if the caller is asking who the agent is, why they are calling, or asking for clarification
 */
export function isIdentityOrClarificationQuestion(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase().trim();
  return (
    lower.includes('who are you') ||
    lower.includes('who is this') ||
    lower.includes('who is calling') ||
    lower.includes('who are calling') ||
    lower.includes('who you calling') ||
    lower.includes('who are u') ||
    lower.includes('who am i speaking') ||
    lower.includes('why are you calling') ||
    lower.includes('why you calling') ||
    lower.includes('what company') ||
    lower.includes('who are you with') ||
    lower.includes('what is this regarding') ||
    lower.includes('what is this about') ||
    lower.includes('what do you want') ||
    lower.includes('why do you want') ||
    lower.includes('who gave you my number') ||
    lower.includes('how did you get my number') ||
    lower.includes('what are you talking about') ||
    lower.includes('repeat that') ||
    lower.includes('say that again') ||
    lower.includes('what did you say')
  );
}

/**
 * Generates a clean, natural identity clarification response without redundant greetings
 */
export function getIdentityClarificationSpeech(activeNode: FlowNode | null): string {
  if (!activeNode || activeNode.id === 'node-greeting' || activeNode.type === 'start') {
    return "This is Sarah calling from Property Care. We're reaching out to local homeowners to see if you'd be open to considering a cash offer on your property.";
  }
  if (activeNode.id === 'node-bed-bath') {
    return "This is Sarah with Property Care regarding your property. Could you share roughly how many bedrooms and bathrooms the home has?";
  }
  if (activeNode.id === 'node-pricing-timeline') {
    return "This is Sarah with Property Care. What ballpark cash price were you hoping to get for the home?";
  }
  if (activeNode.id === 'node-senior-buyer') {
    return "This is Sarah with Property Care. Would tomorrow afternoon work for a quick 10-minute follow-up call with our acquisitions manager?";
  }
  return "This is Sarah calling from Property Care regarding your property. How can I help you today?";
}

export class OllamaService {
  /**
   * Check if Groq Cloud API or Local LLM endpoint is reachable
   */
  static async checkHealth(config: AgentConfig): Promise<{ isRunning: boolean; models: string[]; error?: string }> {
    if (config.provider === 'groq') {
      try {
        const apiKey = config.groqApiKey || (import.meta as any).env?.VITE_GROQ_API_KEY || '';
        const response = await fetch('https://api.groq.com/openai/v1/models', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
          signal: AbortSignal.timeout(4000),
        });

        if (!response.ok) {
          return { isRunning: false, models: [], error: `Groq HTTP ${response.status}` };
        }

        const data = await response.json();
        const models = data.data ? data.data.map((m: { id: string }) => m.id) : [];
        return { isRunning: true, models };
      } catch (err: unknown) {
        return {
          isRunning: false,
          models: [],
          error: err instanceof Error ? err.message : 'Cannot reach Groq API',
        };
      }
    }

    try {
      const sanitizedUrl = config.endpoint.replace(/\/+$/, '');
      const response = await fetch(`${sanitizedUrl}/api/tags`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(2500),
      });

      if (!response.ok) {
        return { isRunning: false, models: [], error: `Server responded with HTTP ${response.status}` };
      }

      const data = await response.json();
      const models = data.models ? data.models.map((m: { name: string }) => m.name) : [];
      return { isRunning: true, models };
    } catch (err: unknown) {
      return {
        isRunning: false,
        models: [],
        error: err instanceof Error ? err.message : 'Cannot reach local endpoint',
      };
    }
  }

  /**
   * Deterministically evaluate outgoing conditions for the current node based on user input
   */
  public static evaluateDeterministicTransition(
    activeNode: FlowNode | null,
    userText: string,
    allNodes: FlowNode[]
  ): { targetNodeId?: string; targetScript?: string; stayOnCurrentNode?: boolean } {
    if (!activeNode || !activeNode.transitions || activeNode.transitions.length === 0) {
      return {};
    }

    const lower = userText.toLowerCase().trim();

    // Check identity / clarification first
    if (isIdentityOrClarificationQuestion(lower)) {
      return { stayOnCurrentNode: true, targetScript: getIdentityClarificationSpeech(activeNode) };
    }

    // Evaluate each transition
    for (const trans of activeNode.transitions) {
      if (!trans.targetNodeId) continue;
      const targetNode = allNodes.find((n) => n.id === trans.targetNodeId);
      const targetScript = targetNode ? getCleanScriptSpeech(targetNode.agentPrompt) : '';

      const label = trans.label.toLowerCase();
      const cond = (trans.conditionText || '').toLowerCase();

      // Agreement / Selling Intent
      if (
        (label.includes('agree') || cond.includes('agree') || cond.includes('yes') || cond.includes('open to selling')) &&
        (lower.includes('yes') || lower.includes('yeah') || lower.includes('yep') || lower.includes('sure') || lower.includes('consider') || lower.includes('selling') || lower.includes('sold') || lower.includes('okay') || lower.includes('ok') || lower.includes('interested') || lower.includes('open to') || lower.includes('cash offer'))
      ) {
        return { targetNodeId: trans.targetNodeId, targetScript };
      }

      // Disagreement / Objection
      if (
        (label.includes('disagree') || cond.includes('disagree') || cond.includes('no') || cond.includes('not selling') || cond.includes('not interested')) &&
        (lower.includes('no') || lower.includes('not interested') || lower.includes('not selling') || lower.includes("don't want") || lower.includes('never') || lower.includes('stop calling'))
      ) {
        return { targetNodeId: trans.targetNodeId, targetScript };
      }

      // Property Details / Bed & Bath / Repairs
      if (
        (cond.includes('bedroom') || cond.includes('bathroom') || cond.includes('details') || cond.includes('specs') || cond.includes('repair') || label.includes('details') || label.includes('specs')) &&
        (/\d+\s*(?:bed|bath|br|ba|room|bhk)/i.test(lower) || lower.includes('bedroom') || lower.includes('bathroom') || lower.includes('house') || lower.includes('condition') || lower.includes('repair') || lower.includes('update') || lower.includes('roof') || lower.includes('square') || lower.includes('renovat') || lower.includes('fix') || lower.includes('good shape') || lower.includes('no repair'))
      ) {
        return { targetNodeId: trans.targetNodeId, targetScript };
      }

      // Price & Timeline (handles "2 million", "$500k", "close in 30 days", "asap", etc.)
      if (
        (cond.includes('price') || cond.includes('timeline') || cond.includes('ballpark') || cond.includes('timeframe') || label.includes('price') || label.includes('timeline')) &&
        (/\d+/.test(lower) || lower.includes('million') || lower.includes('thousand') || lower.includes('hundred') || lower.includes('k') || lower.includes('mil') || lower.includes('month') || lower.includes('week') || lower.includes('day') || lower.includes('asap') || lower.includes('soon') || lower.includes('fast') || lower.includes('close') || lower.includes('cash') || lower.includes('dollar') || lower.includes('asking') || lower.includes('offer') || lower.includes('around') || lower.includes('about'))
      ) {
        return { targetNodeId: trans.targetNodeId, targetScript };
      }

      // Callback / Time / Senior Buyer / Single-Branch Progression
      if (
        (cond.includes('callback') || cond.includes('afternoon') || cond.includes('tomorrow') || cond.includes('time') || cond.includes('senior') || label.includes('callback') || label.includes('time') || activeNode.transitions.length === 1) &&
        (lower.includes('tomorrow') || lower.includes('afternoon') || lower.includes('morning') || lower.includes('evening') || lower.includes('pm') || lower.includes('am') || lower.includes('works') || lower.includes('call me') || lower.includes('yes') || lower.includes('yeah') || lower.includes('sure') || lower.includes('okay') || lower.includes('ok') || lower.includes('perfect') || lower.includes('fine') || lower.includes('good') || lower.includes('sounds good') || lower.includes('proceed') || lower.includes('great') || lower.includes('will be good') || lower.includes('thank') || lower.includes('schedule') || lower.includes('set it up'))
      ) {
        return { targetNodeId: trans.targetNodeId, targetScript };
      }
    }

    return {};
  }

  /**
   * Stream LLM response from Groq API or Ollama with Node Flow context
   */
  static async generateStreamingResponse(
    messages: ChatMessage[],
    config: AgentConfig,
    activeNode: FlowNode | null,
    allNodes: FlowNode[],
    onChunk: (chunk: string) => void,
    onComplete: (spokenText: string, nextNodeId?: string) => void,
    _onError: (err: string) => void
  ): Promise<void> {
    if (messages.length === 0 && activeNode) {
      const openingSpeech = getCleanScriptSpeech(activeNode.agentPrompt);
      onComplete(openingSpeech, undefined);
      return;
    }

    const userMessages = messages.filter((m) => m.sender === 'user');
    const lastUserText = userMessages[userMessages.length - 1]?.text || '';

    let systemInstruction = '';

    if (activeNode) {
      const cleanCurrentScript = getCleanScriptSpeech(activeNode.agentPrompt);
      const branchOptions = activeNode.transitions
        .filter((t) => !!t.targetNodeId)
        .map((t, idx) => {
          const targetNode = allNodes.find((n) => n.id === t.targetNodeId);
          const targetScript = targetNode ? getCleanScriptSpeech(targetNode.agentPrompt) : '';
          return `[BRANCH ${idx + 1}] Condition: "${t.label}" (${t.conditionText || t.label})
  -> TARGET NODE: "${targetNode?.title || t.targetNodeId}" (ID: "${t.targetNodeId}")
  -> TARGET NODE SCRIPT TO SPEAK: "${targetScript}"`;
        });

      const branchesPrompt =
        branchOptions.length > 0
          ? branchOptions.join('\n\n')
          : '- (Terminal step: Conclude call politely and output [NEXT_NODE: STAY])';

      const blackboardSummary = LeadExtractor.generateBlackboardSummary(messages, activeNode, allNodes);

      systemInstruction = `You are Sarah, an expert AI phone acquisition specialist calling on behalf of Property Care.

${blackboardSummary}

======================================================================
CURRENT CONVERSATION FLOW STATE:
======================================================================
- CURRENT ACTIVE NODE: "${activeNode.title}" (Node ID: "${activeNode.id}")
- SCRIPT SARAH SPOKE: "${cleanCurrentScript}"
- CALLER'S LATEST MESSAGE: "${lastUserText}"

======================================================================
AVAILABLE OUTGOING BRANCHES FROM CURRENT NODE:
======================================================================
${branchesPrompt}

======================================================================
MANDATORY INTENT EVALUATION & DYNAMIC ROUTING INSTRUCTIONS:
======================================================================
You are an intelligent decision-making agent. Your primary job is to evaluate the caller's intent against the current node and all connected branch conditions:

1. EVALUATE CALLER INTENT AGAINST OUTGOING BRANCHES:
   - Analyze what the caller meant by: "${lastUserText}".
   - Check every available branch condition listed above under AVAILABLE OUTGOING BRANCHES:
     * If the caller's intent satisfies a specific condition (e.g. agrees, disagrees, gives property specs, gives price, confirms callback time, or answers the question), SELECT that branch.
     * Advance to the corresponding TARGET NODE and include the routing tag: [NEXT_NODE: <target_node_id>].
     * Formulate your 1-2 sentence spoken reply to smoothly deliver the target node's question/script.
   - If the current node has ONLY 1 outgoing branch connected, and the caller responds positively or answers the question, ALWAYS ADVANCE to that connected target node!
   - If the current node has NO outgoing branches (or target node is an End Node), conclude the conversation politely and output [NEXT_NODE: STAY] or [NEXT_NODE: <end_node_id>].

2. IDENTITY & CLARIFICATIONS:
   - If the caller asks "Who are you?", "Why are you calling?", "Who is this?", or asks for clarification:
     * Explain politely in 1 sentence: "This is Sarah calling from Property Care regarding your property to see if you'd consider a cash offer."
     * Do not advance to another node; output [NEXT_NODE: STAY].

3. UNCLEAR OR OFF-TOPIC RESPONSES:
   - If the response does not answer the question, politely acknowledge their statement, rephrase the current node question, and output [NEXT_NODE: STAY].

4. OUTPUT FORMAT:
   - 1-2 natural, warm spoken phone sentences maximum. No bullet points, asterisks, or markdown formatting.
   - ALWAYS append the exact routing tag at the very end: [NEXT_NODE: <target_node_id>] or [NEXT_NODE: STAY].`;
    } else {
      systemInstruction = config.systemPrompt;
    }

    const nonSystemMessages = messages.filter((m) => m.sender !== 'system');
    const formattedMessages = [
      { role: 'system', content: systemInstruction },
      ...nonSystemMessages.map((m) => ({
        role: m.sender === 'agent' ? 'assistant' : 'user',
        content: m.text,
      })),
    ];

    try {
      // 1. STREAM VIA GROQ CLOUD API (openai/gpt-oss-20b or llama-3.3-70b-versatile)
      if (config.provider === 'groq') {
        const apiKey = config.groqApiKey || (import.meta as any).env?.VITE_GROQ_API_KEY || '';
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: config.model || 'openai/gpt-oss-20b',
            messages: formattedMessages,
            temperature: config.temperature ?? 0.2,
            max_tokens: 800,
            stream: true,
          }),
        });

        if (!response.ok) {
          const errBody = await response.text();
          throw new Error(`Groq API returned HTTP ${response.status}: ${errBody}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('Groq response body is empty');

        const decoder = new TextDecoder('utf-8');
        let rawAccumulated = '';
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':')) continue;
            if (trimmed === 'data: [DONE]') break;

            if (trimmed.startsWith('data: ')) {
              try {
                const jsonStr = trimmed.slice(6);
                const parsed = JSON.parse(jsonStr);
                const delta = parsed.choices?.[0]?.delta;
                const token = delta?.content;

                if (token) {
                  rawAccumulated += token;

                  const inReasoning = rawAccumulated.includes('<reasoning>') && !rawAccumulated.includes('</reasoning>');
                  const inThinking = rawAccumulated.includes('<think>') && !rawAccumulated.includes('</think>');

                  if (!inReasoning && !inThinking && !token.includes('[NEXT_NODE') && !token.includes('<reasoning>') && !token.includes('<think>')) {
                    const cleanToken = token.replace(/<\/?(?:reasoning|think)>/gi, '').replace(/\[NEXT_NODE:[^\]]*\]?/gi, '');
                    if (cleanToken) {
                      onChunk(cleanToken);
                    }
                  }
                }
              } catch {
                // Ignore partial JSON parse errors
              }
            }
          }
        }

        let { spokenText, nextNodeId } = this.parseNextNodeTag(rawAccumulated);

        // If caller asked identity / clarification, stay on current node
        if (isIdentityOrClarificationQuestion(lastUserText)) {
          nextNodeId = undefined;
        }

        // Validate and complete speech if advancing to a target node
        if (nextNodeId && nextNodeId !== activeNode?.id) {
          const targetNode = allNodes.find((n) => n.id === nextNodeId);
          if (targetNode) {
            const cleanTargetScript = getCleanScriptSpeech(targetNode.agentPrompt);
            if (
              !spokenText ||
              spokenText.length < 10 ||
              spokenText.endsWith('follow') ||
              spokenText.endsWith('minute') ||
              spokenText.endsWith('with') ||
              !/[.?!]$/.test(spokenText)
            ) {
              spokenText = cleanTargetScript;
            }
          }
        }

        if (!spokenText || spokenText.length < 3) {
          if (isIdentityOrClarificationQuestion(lastUserText)) {
            spokenText = getIdentityClarificationSpeech(activeNode);
          } else {
            spokenText = activeNode ? getCleanScriptSpeech(activeNode.agentPrompt) : 'Hello! How can I help you today?';
          }
        }

        onComplete(spokenText, nextNodeId);
        return;
      }

      // 2. STREAM VIA LOCAL OLLAMA
      const sanitizedUrl = config.endpoint.replace(/\/+$/, '');
      const response = await fetch(`${sanitizedUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.model || 'llama3.2:3b',
          messages: formattedMessages,
          stream: true,
          options: {
            temperature: config.temperature ?? 0.2,
            num_predict: 400,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama returned status ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Ollama response body is empty');

      const decoder = new TextDecoder('utf-8');
      let rawAccumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const rawChunk = decoder.decode(value, { stream: true });
        const lines = rawChunk.split('\n').filter((l) => l.trim().length > 0);

        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.message?.content) {
              const token = parsed.message.content;
              rawAccumulated += token;

              const inReasoning = rawAccumulated.includes('<reasoning>') && !rawAccumulated.includes('</reasoning>');
              const inThinking = rawAccumulated.includes('<think>') && !rawAccumulated.includes('</think>');

              if (!inReasoning && !inThinking && !token.includes('[NEXT_NODE') && !token.includes('<reasoning>') && !token.includes('<think>')) {
                const cleanToken = token.replace(/<\/?(?:reasoning|think)>/gi, '').replace(/\[NEXT_NODE:[^\]]*\]?/gi, '');
                if (cleanToken) {
                  onChunk(cleanToken);
                }
              }
            }
          } catch {
            // Ignore partial JSON lines
          }
        }
      }

      let { spokenText, nextNodeId } = this.parseNextNodeTag(rawAccumulated);

      if (isIdentityOrClarificationQuestion(lastUserText)) {
        nextNodeId = undefined;
      }

      if (nextNodeId && nextNodeId !== activeNode?.id) {
        const targetNode = allNodes.find((n) => n.id === nextNodeId);
        if (targetNode) {
          const cleanTargetScript = getCleanScriptSpeech(targetNode.agentPrompt);
          if (!spokenText || spokenText.length < 10 || !/[.?!]$/.test(spokenText)) {
            spokenText = cleanTargetScript;
          }
        }
      }

      if (!spokenText || spokenText.length < 3) {
        if (isIdentityOrClarificationQuestion(lastUserText)) {
          spokenText = getIdentityClarificationSpeech(activeNode);
        } else {
          spokenText = activeNode ? getCleanScriptSpeech(activeNode.agentPrompt) : 'Hello! How can I help you today?';
        }
      }

      onComplete(spokenText, nextNodeId);
    } catch (err: unknown) {
      console.warn('Fallback to Smart Semantic Evaluator due to fetch error:', err);
      await this.runLocalSmartAgent(messages, activeNode, allNodes, onChunk, onComplete);
    }
  }

  /**
   * Helper to strip internal transition tag and reasoning tags from spoken output
   */
  private static parseNextNodeTag(fullText: string): { spokenText: string; nextNodeId?: string } {
    const nextNodeMatch = fullText.match(/\[NEXT_NODE:\s*([a-zA-Z0-9_-]+)\]/i);
    let nextNodeId: string | undefined;

    if (nextNodeMatch && nextNodeMatch[1]) {
      const parsedId = nextNodeMatch[1].trim();
      if (parsedId !== 'STAY' && parsedId !== 'stay') {
        nextNodeId = parsedId;
      }
    }

    let spokenText = fullText.replace(/\[NEXT_NODE:\s*[a-zA-Z0-9_-]+\]/gi, '');

    // Strip <reasoning> blocks
    if (spokenText.includes('</reasoning>')) {
      spokenText = spokenText.split('</reasoning>').pop() || '';
    } else {
      spokenText = spokenText.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '').replace(/<reasoning>[\s\S]*/gi, '');
    }

    // Strip <think> blocks
    if (spokenText.includes('</think>')) {
      spokenText = spokenText.split('</think>').pop() || '';
    } else {
      spokenText = spokenText.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<think>[\s\S]*/gi, '');
    }

    spokenText = spokenText.trim();
    return { spokenText, nextNodeId };
  }

  /**
   * Built-in intelligent semantic fallback engine with dynamic transition matching
   */
  private static async runLocalSmartAgent(
    messages: ChatMessage[],
    activeNode: FlowNode | null,
    allNodes: FlowNode[],
    onChunk: (chunk: string) => void,
    onComplete: (spokenText: string, nextNodeId?: string) => void
  ): Promise<void> {
    const userMessages = messages.filter((m) => m.sender === 'user');
    const lastUserMsg = userMessages[userMessages.length - 1]?.text || '';

    let responseText = '';
    let nextNodeId: string | undefined;

    if (activeNode) {
      // Evaluate deterministic semantic transition
      const evalResult = this.evaluateDeterministicTransition(activeNode, lastUserMsg, allNodes);

      if (evalResult.targetNodeId) {
        nextNodeId = evalResult.targetNodeId;
        responseText = evalResult.targetScript || 'Great! Moving forward to the next step.';
      } else if (evalResult.stayOnCurrentNode && evalResult.targetScript) {
        nextNodeId = undefined;
        responseText = evalResult.targetScript;
      } else {
        const currentScript = getCleanScriptSpeech(activeNode.agentPrompt);
        let cleanPrompt = currentScript;
        if (cleanPrompt.toLowerCase().startsWith('got it!')) {
          cleanPrompt = cleanPrompt.slice(7).trim();
        }
        if (cleanPrompt.toLowerCase().startsWith('hi, this is sarah')) {
          cleanPrompt = 'Are you open to considering selling your property for the best price?';
        }
        responseText = cleanPrompt;
        nextNodeId = undefined;
      }
    } else {
      responseText = 'Hi, this is Sarah from Property Care. Are you open to considering selling your property for the best price?';
      nextNodeId = 'node-greeting';
    }

    const words = responseText.split(' ');
    let accumulated = '';

    for (let i = 0; i < words.length; i++) {
      const wordChunk = (i === 0 ? '' : ' ') + words[i];
      accumulated += wordChunk;
      onChunk(wordChunk);
      await new Promise((res) => setTimeout(res, 18 + Math.random() * 12));
    }

    onComplete(accumulated, nextNodeId);
  }
}

