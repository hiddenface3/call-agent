/**
 * Apex Voice AI — Telnyx Telephony Relay Server
 * 
 * Bridges Telnyx Call Control v2 (PSTN) with Google Gemini Live (Speech-to-Speech)
 * Features:
 *   - Real-time Bidirectional Media Streaming (Telnyx PCMU 8kHz <-> Gemini Live 16k/24k PCM)
 *   - Telnyx Premium Answering Machine Detection (AMD) & Beep-Triggered Voicemail Drop
 *   - Native Tool Calling for In-Flight CRM/CSV Lead Data Extraction (Option A)
 *   - DTMF Touch-Tone Keypad Injection for In-Call IVR Navigation
 *   - SSE Real-time Transcript & State Streaming to Apex React Frontend
 */

try {
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile();
  }
} catch (e) {
  // Ignore missing .env
}

const http = require('http');
const https = require('https');
const { URL } = require('url');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = process.env.PORT || 3001;

// In-Memory Call Sessions
const activeCalls = new Map();

// ============================================================================
// G.711 μ-law (PCMU) <--> 16-bit Linear PCM Audio Transcoding Utilities
// ============================================================================
const ULAW_BIAS = 0x84;
const ULAW_CLIP = 32635;

// Precomputed u-law to linear lookup table for maximum performance
const ULAW_TO_PCM = new Int16Array(256);
for (let i = 0; i < 256; i++) {
  let u = ~i;
  let sign = u & 0x80;
  let exponent = (u >> 4) & 0x07;
  let mantissa = u & 0x0f;
  let sample = ((mantissa << 3) + ULAW_BIAS) << exponent;
  sample -= ULAW_BIAS;
  ULAW_TO_PCM[i] = sign !== 0 ? -sample : sample;
}

function ulawDecode(ulawBuffer) {
  const pcm = new Int16Array(ulawBuffer.length);
  for (let i = 0; i < ulawBuffer.length; i++) {
    pcm[i] = ULAW_TO_PCM[ulawBuffer[i]];
  }
  return pcm;
}

function pcmToUlaw(pcm16Sample) {
  let sign = 0;
  let sample = pcm16Sample;
  if (sample < 0) {
    sample = -sample;
    sign = 0x80;
  }
  if (sample > ULAW_CLIP) sample = ULAW_CLIP;
  sample += ULAW_BIAS;

  let exponent = 7;
  for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; expMask >>= 1) {
    exponent--;
  }
  let mantissa = (sample >> (exponent + 3)) & 0x0f;
  let ulawByte = ~(sign | (exponent << 4) | mantissa);
  return ulawByte & 0xff;
}

function linearPcmToUlaw(pcm16Array) {
  const ulaw = Buffer.alloc(pcm16Array.length);
  for (let i = 0; i < pcm16Array.length; i++) {
    ulaw[i] = pcmToUlaw(pcm16Array[i]);
  }
  return ulaw;
}

// Resampling 8kHz -> 16kHz (Linear Interpolation 2x)
function resample8kTo16k(pcm8k) {
  const out = new Int16Array(pcm8k.length * 2);
  for (let i = 0; i < pcm8k.length - 1; i++) {
    out[i * 2] = pcm8k[i];
    out[i * 2 + 1] = Math.round((pcm8k[i] + pcm8k[i + 1]) / 2);
  }
  if (pcm8k.length > 0) {
    out[(pcm8k.length - 1) * 2] = pcm8k[pcm8k.length - 1];
    out[(pcm8k.length - 1) * 2 + 1] = pcm8k[pcm8k.length - 1];
  }
  return out;
}

// Resampling 24kHz -> 8kHz (Decimation 3x with Averaging Filter)
function resample24kTo8k(pcm24k) {
  const targetLength = Math.floor(pcm24k.length / 3);
  const out = new Int16Array(targetLength);
  for (let i = 0; i < targetLength; i++) {
    const idx = i * 3;
    out[i] = Math.round((pcm24k[idx] + pcm24k[idx + 1] + pcm24k[idx + 2]) / 3);
  }
  return out;
}

// ============================================================================
// HTTP Server & REST API Endpoints
// ============================================================================
const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);

  // Health Check
  if (parsedUrl.pathname === '/api/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', message: 'Telnyx Telephony Relay Server Online', port: PORT }));
    return;
  }

  // SSE Event Stream for frontend clients
  if (parsedUrl.pathname.startsWith('/api/calls/') && parsedUrl.pathname.endsWith('/events') && req.method === 'GET') {
    const parts = parsedUrl.pathname.split('/');
    const callControlId = parts[3];

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    res.write(`data: ${JSON.stringify({ type: 'connected', callControlId })}\n\n`);

    const callSession = activeCalls.get(callControlId);
    if (callSession) {
      callSession.sseClients.push(res);
    }

    req.on('close', () => {
      if (callSession) {
        callSession.sseClients = callSession.sseClients.filter(c => c !== res);
      }
    });
    return;
  }

  // Dial Outbound Call
  if (parsedUrl.pathname === '/api/calls/dial' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const {
          to,
          from,
          apiKey,
          connectionId,
          geminiApiKey,
          model = 'gemini-3.1-flash-live-preview',
          voice = 'Aoede',
          systemPrompt = 'You are Sarah, property acquisition specialist.',
          amdStrategy = 'voicemail_drop',
          voicemailScript,
          publicRelayUrl,
        } = payload;

        if (!to) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Target phone number "to" is required' }));
          return;
        }

        const callControlId = `telnyx-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

        const session = {
          callControlId,
          to,
          from,
          apiKey,
          connectionId,
          geminiApiKey,
          model,
          voice,
          systemPrompt,
          amdStrategy,
          voicemailScript,
          publicRelayUrl,
          sseClients: [],
          status: 'initiating',
          geminiWs: null,
          telnyxWs: null,
          audioQueue: [],
          isHumanVerified: false,
          hasSpokenGreeting: false,
          pendingGreetingTrigger: false,
          leadData: {},
        };

        activeCalls.set(callControlId, session);

        // If Telnyx API Key and Connection ID are provided, trigger real Telnyx Call Control v2
        if (apiKey && connectionId) {
          try {
            const rawPublicHost = publicRelayUrl || process.env.PUBLIC_RELAY_URL || req.headers.host;
            const cleanHost = rawPublicHost.replace(/^https?:\/\//i, '').replace(/^wss?:\/\//i, '').replace(/\/+$/, '');
            const isHttps = Boolean(publicRelayUrl || process.env.PUBLIC_RELAY_URL || req.headers['x-forwarded-proto'] === 'https' || rawPublicHost.includes('trycloudflare.com') || rawPublicHost.includes('ngrok'));
            const wsProto = isHttps ? 'wss' : 'ws';
            const httpProto = isHttps ? 'https' : 'http';

            const telnyxReqBody = JSON.stringify({
              to: to.replace(/[^\d+]/g, ''),
              from: from ? from.replace(/[^\d+]/g, '') : '+15125550199',
              connection_id: connectionId,
              answering_machine_detection: 'premium',
              answering_machine_detection_config: {
                total_analysis_time_millis: 5000,
                after_greeting_silence_millis: 1200,
              },
              stream_url: `${wsProto}://${cleanHost}/telnyx-media`,
              stream_track: 'both_tracks',
              stream_bidirectional_mode: 'rtp',
              stream_bidirectional_codec: 'PCMU',
              webhook_url: `${httpProto}://${cleanHost}/api/telnyx/webhooks`,
              client_state: Buffer.from(JSON.stringify({ callControlId })).toString('base64'),
            });

            console.log(`[Telnyx Dial Trigger] stream_url: ${wsProto}://${cleanHost}/telnyx-media`);

            const tReq = https.request('https://api.telnyx.com/v2/calls', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(telnyxReqBody),
              },
            }, (tRes) => {
              let tData = '';
              tRes.on('data', d => { tData += d; });
              tRes.on('end', () => {
                console.log(`[Telnyx Dial Response] Code: ${tRes.statusCode}`);
                try {
                  const parsed = JSON.parse(tData || '{}');
                  const realCallControlId = parsed?.data?.call_control_id;
                  if (realCallControlId) {
                    console.log(`[Telnyx Real Call Control ID]: ${realCallControlId} mapped to session ${callControlId}`);
                    session.realCallControlId = realCallControlId;
                    activeCalls.set(realCallControlId, session);
                  }
                } catch (e) {}
              });
            });

            tReq.on('error', (e) => console.error('[Telnyx Dial Error]:', e));
            tReq.write(telnyxReqBody);
            tReq.end();
          } catch (e) {
            console.error('[Telnyx HTTP Exception]:', e);
          }
        }

        // Initialize Gemini Live Session for this call
        initGeminiLiveSession(session);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, call_control_id: callControlId, status: 'ringing' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Hangup Active Call
  if (parsedUrl.pathname === '/api/calls/hangup' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { callControlId } = JSON.parse(body || '{}');
        const session = activeCalls.get(callControlId);
        if (session) {
          broadcastCallEvent(session, { type: 'call_completed', reason: 'User hung up' });
          if (session.geminiWs) session.geminiWs.close();
          if (session.telnyxWs) session.telnyxWs.close();
          activeCalls.delete(callControlId);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // DTMF Tone Dispatch (IVR Navigation)
  if (parsedUrl.pathname === '/api/calls/dtmf' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { callControlId, digits } = JSON.parse(body || '{}');
        const session = activeCalls.get(callControlId);
        if (session && session.apiKey) {
          // Telnyx Call Control Action: send_dtmf
          const dtmfBody = JSON.stringify({ digits: String(digits) });
          const dReq = https.request(`https://api.telnyx.com/v2/calls/${callControlId}/actions/send_dtmf`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.apiKey}`,
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(dtmfBody),
            },
          }, (dRes) => {
            console.log(`[Telnyx DTMF Sent] Digits: ${digits}, Code: ${dRes.statusCode}`);
          });
          dReq.on('error', (e) => console.error('[Telnyx DTMF Error]:', e));
          dReq.write(dtmfBody);
          dReq.end();
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, digits }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Live Call Transfer to Human Representative
  if (parsedUrl.pathname === '/api/calls/transfer' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { callControlId, transferTo } = JSON.parse(body || '{}');
        const session = activeCalls.get(callControlId);
        if (session && session.apiKey && transferTo) {
          const transferBody = JSON.stringify({
            to: transferTo.replace(/[^\d+]/g, '')
          });
          const tReq = https.request(`https://api.telnyx.com/v2/calls/${callControlId}/actions/transfer`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.apiKey}`,
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(transferBody),
            },
          }, (tRes) => {
            console.log(`[Telnyx Call Transfer Sent] To: ${transferTo}, Code: ${tRes.statusCode}`);
          });
          tReq.on('error', (e) => console.error('[Telnyx Transfer Error]:', e));
          tReq.write(transferBody);
          tReq.end();
          broadcastCallEvent(session, { type: 'call_transferred', transferTo });
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, transferTo }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Telnyx Webhook Ingestion
  if (parsedUrl.pathname === '/api/telnyx/webhooks' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const event = JSON.parse(body || '{}');
        const eventType = event?.data?.event_type;
        const payload = event?.data?.payload;

        console.log(`[Telnyx Webhook Received]: ${eventType}`);

        let callControlId = payload?.call_control_id;
        if (payload?.client_state) {
          try {
            const decoded = JSON.parse(Buffer.from(payload.client_state, 'base64').toString('utf8'));
            if (decoded.callControlId) callControlId = decoded.callControlId;
          } catch (e) {}
        }

        const session = activeCalls.get(callControlId);
        if (session) {
          if (eventType === 'call.answered') {
            broadcastCallEvent(session, { type: 'call_answered' });
            triggerAgentGreeting(session);
          } else if (eventType === 'call.machine.premium.detection.ended') {
            const result = payload?.result; // "human", "machine", "silence", "fax_detected"
            broadcastCallEvent(session, { type: 'amd_result', result });

            if (result === 'human') {
              session.isHumanVerified = true;
              triggerAgentGreeting(session);
            } else if (result === 'machine' && session.amdStrategy === 'hangup_on_machine') {
              // Hang up immediately to save minutes
              broadcastCallEvent(session, { type: 'call_completed', reason: 'Machine detected (Hangup strategy)' });
              activeCalls.delete(callControlId);
            }
          } else if (eventType === 'call.machine.beep.detected') {
            // Trigger Voicemail Drop
            broadcastCallEvent(session, { type: 'voicemail_beep' });
            if (session.geminiWs && session.geminiWs.readyState === WebSocket.OPEN) {
              const dropScript = session.voicemailScript || 'Hi, this is Sarah from Property Care. Please give me a call back regarding your property. Thanks!';
              session.geminiWs.send(JSON.stringify({
                clientContent: {
                  turns: [
                    {
                      role: 'user',
                      parts: [{ text: `The answering machine beeped. Speak aloud this voicemail message now: "${dropScript}"` }],
                    },
                  ],
                  turnComplete: true,
                },
              }));
            }
          } else if (eventType === 'call.hangup') {
            broadcastCallEvent(session, { type: 'call_completed', reason: 'Customer hung up line' });
            activeCalls.delete(callControlId);
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ received: true }));
      } catch (err) {
        res.writeHead(200);
        res.end();
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

// Broadcast event to SSE clients attached to this call
function broadcastCallEvent(session, eventObj) {
  if (!session || !session.sseClients) return;
  const payloadStr = `data: ${JSON.stringify(eventObj)}\n\n`;
  for (const client of session.sseClients) {
    try {
      client.write(payloadStr);
    } catch (e) {}
  }
}

// ============================================================================
// Google Gemini Live WebSocket Bridge (Speech-to-Speech + Option A Tool Call)
// ============================================================================
function triggerAgentGreeting(session) {
  if (!session) return;
  if (session.hasSpokenGreeting) return;

  if (!session.geminiWs || session.geminiWs.readyState !== WebSocket.OPEN || !session.setupComplete) {
    session.pendingGreetingTrigger = true;
    console.log(`[Gemini Live Greeting Queued] Waiting for setupComplete for call ${session.callControlId}`);
    return;
  }

  session.hasSpokenGreeting = true;
  session.pendingGreetingTrigger = false;

  const greetingPrompt = `The phone call has connected to the homeowner. Speak aloud immediately now to greet the homeowner and introduce yourself according to your instructions: "${session.systemPrompt || 'Hi, this is Sarah from Property Care. Are you open to considering selling your property for the best price?'}"`;

  const startMsg = {
    clientContent: {
      turns: [
        {
          role: 'user',
          parts: [{ text: greetingPrompt }],
        },
      ],
      turnComplete: true,
    },
  };

  try {
    console.log(`[Gemini Live Greeting Dispatched] for call ${session.callControlId}`);
    session.geminiWs.send(JSON.stringify(startMsg));
  } catch (err) {
    console.error('[Gemini Live Greeting Send Error]:', err);
  }
}

function initGeminiLiveSession(session) {
  const apiKey = session.geminiApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[Gemini Live Bridge] No GEMINI_API_KEY provided.');
    return;
  }

  const modelId = session.model || 'gemini-3.1-flash-live-preview';
  const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;

  const geminiWs = new WebSocket(url);
  session.geminiWs = geminiWs;

  geminiWs.on('open', () => {
    console.log(`[Gemini Live Bridge] Connected for call ${session.callControlId}`);

    // Session Setup with Option A Tool Calling (save_lead_to_crm)
    const setupMsg = {
      setup: {
        model: `models/${modelId}`,
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: session.voice || 'Aoede',
              },
            },
          },
        },
        systemInstruction: {
          parts: [{ text: session.systemPrompt || 'You are Sarah, a professional real estate acquisition specialist.' }],
        },
        tools: [{
          functionDeclarations: [{
            name: 'save_lead_to_crm',
            description: 'Trigger immediately when customer gives their name, phone, address, price, bedrooms, or bathrooms.',
            parameters: {
              type: 'OBJECT',
              properties: {
                sellerName: { type: 'STRING', description: 'Customer or seller name' },
                propertyAddress: { type: 'STRING', description: 'Street address or neighborhood' },
                askingPrice: { type: 'STRING', description: 'Price or ballpark amount' },
                bedrooms: { type: 'NUMBER', description: 'Count of bedrooms' },
                bathrooms: { type: 'NUMBER', description: 'Count of bathrooms' },
                condition: { type: 'STRING', description: 'Property condition' },
                timeline: { type: 'STRING', description: 'Timeline to sell' },
              },
              required: ['propertyAddress'],
            },
          }],
        }],
      },
    };

    geminiWs.send(JSON.stringify(setupMsg));
    broadcastCallEvent(session, { type: 'call_ringing' });
  });

  geminiWs.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.setupComplete) {
        session.setupComplete = true;
        console.log(`[Gemini Live Setup Complete] for call ${session.callControlId}`);
        if (session.pendingGreetingTrigger || session.isHumanVerified) {
          triggerAgentGreeting(session);
        }
        return;
      }
      const serverContent = msg?.serverContent;
      if (!serverContent) return;

      // 1. Native Output Audio Chunks (24kHz Linear PCM -> 8kHz PCMU -> Telnyx)
      if (serverContent.modelTurn?.parts) {
        for (const part of serverContent.modelTurn.parts) {
          // Tool Call Handshake (Option A)
          if (part.toolCall?.functionCalls) {
            for (const fc of part.toolCall.functionCalls) {
              if (fc.name === 'save_lead_to_crm') {
                console.log(`[Option A Tool Call Triggered]:`, fc.args);
                session.leadData = { ...session.leadData, ...fc.args };
                broadcastCallEvent(session, { type: 'lead_extracted', lead: session.leadData });

                // Send toolResponse back to Gemini Live
                geminiWs.send(JSON.stringify({
                  realtimeInput: {
                    mediaChunks: [],
                    toolResponse: {
                      functionResponses: [{
                        id: fc.id,
                        response: { output: { success: true, status: 'Lead saved to CRM' } },
                      }],
                    },
                  },
                }));
              }
            }
          }

          // Audio Output
          if (part.inlineData?.data) {
            const pcm24kBuffer = Buffer.from(part.inlineData.data, 'base64');
            const pcm24kArray = new Int16Array(pcm24kBuffer.buffer, pcm24kBuffer.byteOffset, pcm24kBuffer.length / 2);

            // Resample 24k -> 8k and compress to u-law
            const pcm8k = resample24kTo8k(pcm24kArray);
            const ulawChunk = linearPcmToUlaw(pcm8k);

            // Send to Telnyx WebSocket if connected
            if (session.telnyxWs && session.telnyxWs.readyState === WebSocket.OPEN) {
              session.telnyxWs.send(JSON.stringify({
                event: 'media',
                media: {
                  payload: ulawChunk.toString('base64'),
                },
              }));
            }
          }
        }
      }

      // 2. Output Transcription
      if (serverContent.outputTranscription?.text) {
        broadcastCallEvent(session, {
          type: 'agent_transcript',
          text: serverContent.outputTranscription.text,
        });
      }

      // 3. User Speech Transcription
      if (serverContent.inputTranscription?.text) {
        broadcastCallEvent(session, {
          type: 'user_transcript',
          text: serverContent.inputTranscription.text,
          isFinal: true,
        });
      }
    } catch (e) {
      console.error('[Gemini Live Msg Error]:', e);
    }
  });

  geminiWs.on('error', (err) => {
    console.error(`[Gemini Live Bridge Error]:`, err);
    broadcastCallEvent(session, { type: 'error', message: err.message });
  });

  geminiWs.on('close', () => {
    console.log(`[Gemini Live Bridge Closed]`);
  });
}

// ============================================================================
// WebSocket Server for Telnyx Bidirectional Media Streaming
// ============================================================================
const wss = new WebSocketServer({ server, path: '/telnyx-media' });

wss.on('connection', (ws) => {
  console.log('[Telnyx Media WebSocket] Stream connected from Telnyx PSTN Gateway');
  let currentSession = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());

      if (data.event === 'media' && data.media?.payload) {
        // Base64 decode raw 8kHz G.711 u-law bytes
        const ulawBuffer = Buffer.from(data.media.payload, 'base64');
        const pcm8k = ulawDecode(ulawBuffer);

        // Upsample 2x to 16kHz Linear PCM for Gemini Live
        const pcm16k = resample8kTo16k(pcm8k);
        const pcm16kBuffer = Buffer.from(pcm16k.buffer, pcm16k.byteOffset, pcm16k.byteLength);

        // Forward to Gemini Live
        if (currentSession && currentSession.geminiWs && currentSession.geminiWs.readyState === WebSocket.OPEN) {
          currentSession.geminiWs.send(JSON.stringify({
            realtimeInput: {
              mediaChunks: [{
                mimeType: 'audio/pcm;rate=16000',
                data: pcm16kBuffer.toString('base64'),
              }],
            },
          }));
        }
      } else if (data.event === 'start') {
        const callControlId = data.call_control_id || data.start?.call_control_id;
        console.log(`[Telnyx Media Start] Call Control ID: ${callControlId}`);
        currentSession = activeCalls.get(callControlId);

        // Fallback: check client_state if available
        const rawState = data.client_state || data.start?.client_state;
        if (!currentSession && rawState) {
          try {
            const decoded = JSON.parse(Buffer.from(rawState, 'base64').toString('utf8'));
            if (decoded.callControlId) {
              currentSession = activeCalls.get(decoded.callControlId);
              if (currentSession && callControlId) {
                activeCalls.set(callControlId, currentSession);
              }
            }
          } catch (e) {}
        }

        if (currentSession) {
          currentSession.telnyxWs = ws;
          console.log(`[Telnyx Media Attached] to session ${currentSession.callControlId}`);
        } else {
          console.warn(`[Telnyx Media Warning] Could not find session for callControlId: ${callControlId}`);
        }
      }
    } catch (e) {
      console.error('[Telnyx Media Packet Error]:', e);
    }
  });

  ws.on('close', () => {
    console.log('[Telnyx Media WebSocket] Disconnected');
    if (currentSession) {
      currentSession.telnyxWs = null;
    }
  });
});

// Start Server
server.listen(PORT, () => {
  console.log(`====================================================================`);
  console.log(`  APEX VOICE AI — TELNYX PSTN RELAY SERVER`);
  console.log(`  Listening on: http://localhost:${PORT}`);
  console.log(`  Telnyx Media WebSocket: ws://localhost:${PORT}/telnyx-media`);
  console.log(`====================================================================`);
});
