import { AgentConfig, TelephonyCallStatus, CallFlowGraph } from '../shared/types';

export interface TelnyxCallCallbacks {
  onStatusChange: (status: TelephonyCallStatus, detail?: string) => void;
  onUserTranscript: (text: string, isFinal: boolean) => void;
  onAgentTranscript: (text: string) => void;
  onLeadExtracted?: (leadData: any) => void;
  onError: (error: string) => void;
  onEnded: () => void;
}

export interface DialPayload {
  to: string;
  from: string;
  config: AgentConfig;
  flow: CallFlowGraph;
}

export class TelnyxClientService {
  private static activeCallControlId: string | null = null;
  private static eventSource: EventSource | null = null;
  private static webSocket: WebSocket | null = null;

  /**
   * Check if local or remote relay server is alive
   */
  public static async checkRelayHealth(relayUrl: string = 'http://localhost:3001'): Promise<{ ok: boolean; message: string }> {
    try {
      const trimmed = relayUrl.replace(/\/+$/, '');
      const res = await fetch(`${trimmed}/api/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        return { ok: true, message: data.message || 'Relay Server Online' };
      }
      return { ok: false, message: `Server responded with status ${res.status}` };
    } catch (err: any) {
      return { ok: false, message: 'Relay server offline (run: node server/telnyxRelay.js)' };
    }
  }

  /**
   * Initiate live outbound PSTN call through Telnyx Call Control v2
   */
  public static async initiateCall(
    payload: DialPayload,
    callbacks: TelnyxCallCallbacks
  ): Promise<string> {
    const relayUrl = (payload.config.telnyxRelayUrl || 'http://localhost:3001').replace(/\/+$/, '');

    callbacks.onStatusChange('initiating', 'Contacting Telnyx Call Control Engine...');

    try {
      const res = await fetch(`${relayUrl}/api/calls/dial`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: payload.to,
          from: payload.from || payload.config.telnyxFromNumber,
          connectionId: payload.config.telnyxConnectionId,
          apiKey: payload.config.telnyxApiKey,
          geminiApiKey: payload.config.geminiApiKey,
          model: payload.config.model || 'gemini-3.1-flash-live-preview',
          voice: payload.config.geminiLiveVoice || 'Aoede',
          systemPrompt: payload.config.systemPrompt,
          initialNode: payload.flow.nodes.find(n => n.id === payload.flow.initialNodeId) || payload.flow.nodes[0],
          amdStrategy: payload.config.telnyxAmdStrategy || 'voicemail_drop',
          voicemailScript: payload.config.telnyxVoicemailScript,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Dial request failed with code ${res.status}`);
      }

      const data = await res.json();
      const callControlId = data.call_control_id || `telnyx-${Date.now()}`;
      this.activeCallControlId = callControlId;

      callbacks.onStatusChange('ringing', `Calling ${payload.to}...`);

      // Connect to Real-time Event Stream (SSE or WS)
      this.subscribeToCallEvents(relayUrl, callControlId, callbacks);

      return callControlId;
    } catch (err: any) {
      callbacks.onError(err.message || 'Failed to initiate telephony call.');
      callbacks.onStatusChange('failed', err.message);
      throw err;
    }
  }

  /**
   * Subscribe to server-sent events for call lifecycle and transcripts
   */
  private static subscribeToCallEvents(
    relayUrl: string,
    callControlId: string,
    callbacks: TelnyxCallCallbacks
  ) {
    if (this.eventSource) {
      this.eventSource.close();
    }

    const sseUrl = `${relayUrl}/api/calls/${callControlId}/events`;
    try {
      const es = new EventSource(sseUrl);
      this.eventSource = es;

      es.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          switch (payload.type) {
            case 'call_ringing':
              callbacks.onStatusChange('ringing', 'Ringing homeowner phone...');
              break;
            case 'call_answered':
              callbacks.onStatusChange('amd_evaluating', 'Call answered. Telnyx Premium AMD analyzing...');
              break;
            case 'amd_result':
              if (payload.result === 'human') {
                callbacks.onStatusChange('connected_live', 'Human verified! Gemini Live bridged.');
              } else if (payload.result === 'machine') {
                callbacks.onStatusChange('voicemail_drop', 'Voicemail detected. Waiting for beep...');
              }
              break;
            case 'user_transcript':
              callbacks.onUserTranscript(payload.text, payload.isFinal ?? true);
              break;
            case 'agent_transcript':
              callbacks.onAgentTranscript(payload.text);
              break;
            case 'lead_extracted':
              if (callbacks.onLeadExtracted) {
                callbacks.onLeadExtracted(payload.lead);
              }
              break;
            case 'call_completed':
              callbacks.onStatusChange('completed', 'Call finished.');
              this.cleanup();
              callbacks.onEnded();
              break;
            case 'error':
              callbacks.onError(payload.message || 'Telephony error');
              break;
          }
        } catch (e) {
          console.warn('Failed to parse telephony SSE event:', e);
        }
      };

      es.onerror = () => {
        // SSE disconnected
        es.close();
      };
    } catch (err) {
      console.warn('EventSource connection error:', err);
    }
  }

  /**
   * Send touch-tone DTMF digit to navigate IVR menus
   */
  public static async sendDtmf(
    digits: string,
    relayUrl: string = 'http://localhost:3001'
  ): Promise<boolean> {
    if (!this.activeCallControlId) {
      console.warn('No active call to send DTMF digits to.');
      return false;
    }

    try {
      const trimmed = relayUrl.replace(/\/+$/, '');
      const res = await fetch(`${trimmed}/api/calls/dtmf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callControlId: this.activeCallControlId,
          digits: digits,
        }),
      });
      return res.ok;
    } catch (err) {
      console.error('Failed to dispatch DTMF tone:', err);
      return false;
    }
  }

  /**
   * Hang up active PSTN call
   */
  public static async hangupCall(relayUrl: string = 'http://localhost:3001'): Promise<void> {
    if (!this.activeCallControlId) return;

    const callId = this.activeCallControlId;
    this.cleanup();

    try {
      const trimmed = relayUrl.replace(/\/+$/, '');
      await fetch(`${trimmed}/api/calls/hangup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callControlId: callId }),
      });
    } catch (err) {
      console.error('Error sending hangup signal:', err);
    }
  }

  /**
   * Transfer active PSTN call to a human acquisition manager or phone number
   */
  public static async transferCall(
    transferTo: string,
    relayUrl: string = 'http://localhost:3001'
  ): Promise<boolean> {
    if (!this.activeCallControlId) {
      console.warn('No active call to transfer.');
      return false;
    }

    try {
      const trimmed = relayUrl.replace(/\/+$/, '');
      const res = await fetch(`${trimmed}/api/calls/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callControlId: this.activeCallControlId,
          transferTo,
        }),
      });
      return res.ok;
    } catch (err) {
      console.error('Failed to transfer call:', err);
      return false;
    }
  }

  /**
   * Clean up active connections
   */
  public static cleanup(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    if (this.webSocket) {
      this.webSocket.close();
      this.webSocket = null;
    }
    this.activeCallControlId = null;
  }
}
