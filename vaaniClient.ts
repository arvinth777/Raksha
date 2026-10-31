/**
 * Vaani Voice AI Client (TypeScript / Node / Convex)
 * ==================================================
 * Works with Node.js, Next.js, and Convex Actions using standard `fetch`.
 * Base URL: https://api.vaanivoice.ai
 * Docs: https://docs.vaani.dev
 */

export interface CreateAgentOptions {
  displayName: string;
  systemPrompt?: string;
  config?: Record<string, any>;
}

export interface TriggerTelephonyOptions {
  agentId?: string;
  contactNumber: string;
  customerName?: string;
  metadata?: Record<string, any>;
  modifyAgent?: {
    persona?: {
      identity?: {
        system_prompt?: string;
      };
    };
    [key: string]: any;
  };
}

export interface TriggerWebRTCOptions {
  agentId?: string;
  metadata?: Record<string, any>;
  modifyAgent?: Record<string, any>;
  primaryLanguage?: string;
}

export class VaaniClient {
  private apiKey: string;
  private baseUrl: string;
  private defaultAgentId?: string;

  constructor(options?: { apiKey?: string; baseUrl?: string; defaultAgentId?: string }) {
    this.apiKey = options?.apiKey || process.env.VAANI_API_KEY || "";
    this.baseUrl = (options?.baseUrl || process.env.VAANI_BASE_URL || "https://api.vaanivoice.ai").replace(/\/+$/, "");
    this.defaultAgentId = options?.defaultAgentId || process.env.VAANI_AGENT_ID;

    if (!this.apiKey) {
      console.warn("[VaaniClient] Warning: VAANI_API_KEY is not set in environment or constructor options.");
    }
  }

  private async request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      "X-API-Key": this.apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers || {}),
    };

    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Vaani API Error [${res.status} ${res.statusText}]: ${errText}`);
    }
    return res.json();
  }

  /**
   * 1. Create a new Voice Agent
   * POST /api/create-agent
   */
  async createAgent(options: CreateAgentOptions) {
    const body: Record<string, any> = {
      agent_display_name: options.displayName,
    };
    if (options.config) {
      body.config = options.config;
    } else if (options.systemPrompt) {
      body.config = {
        persona: {
          identity: {
            system_prompt: options.systemPrompt,
          },
        },
      };
    }
    return this.request("/api/create-agent", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /**
   * 2. Trigger an Outbound Phone Call
   * POST /api/trigger-call/
   */
  async triggerTelephonyCall(options: TriggerTelephonyOptions) {
    const agentId = options.agentId || this.defaultAgentId;
    if (!agentId) throw new Error("agentId must be specified or configured in VAANI_AGENT_ID");

    const metadata = { ...(options.metadata || {}) };
    if (options.customerName) {
      metadata.customer_name = options.customerName;
    }

    const body: Record<string, any> = {
      agent_id: agentId,
      contact_number: options.contactNumber,
      medium: "telephony",
      metadata,
    };

    if (options.modifyAgent) {
      body.modify_agent = options.modifyAgent;
    }

    return this.request("/api/trigger-call/", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /**
   * 3. Trigger In-Browser WebRTC Session
   * Returns: { room_name, room_url, access_token }
   * POST /api/trigger-call/
   */
  async triggerWebRTCSession(options: TriggerWebRTCOptions = {}) {
    const agentId = options.agentId || this.defaultAgentId;
    if (!agentId) throw new Error("agentId must be specified or configured in VAANI_AGENT_ID");

    const body: Record<string, any> = {
      agent_id: agentId,
      medium: "webrtc",
      primary_language: options.primaryLanguage || "en",
    };

    if (options.metadata) body.metadata = options.metadata;
    if (options.modifyAgent) body.modify_agent = options.modifyAgent;

    return this.request("/api/trigger-call/", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /**
   * 4. Call History
   * GET /api/call-history/{agent_id}
   */
  async getCallHistory(agentId?: string, page = 1, pageSize = 50) {
    const targetAgentId = agentId || this.defaultAgentId;
    if (!targetAgentId) throw new Error("agentId is required");
    return this.request(`/api/call-history/${targetAgentId}?page=${page}&page_size=${pageSize}`);
  }

  /**
   * 5. Call Details
   * GET /api/call-details/{call_id}
   */
  async getCallDetails(callId: string) {
    return this.request(`/api/call-details/${callId}`);
  }

  /**
   * 6. Call Transcript
   * GET /api/transcript/{call_id}
   */
  async getTranscript(callId: string) {
    return this.request(`/api/transcript/${callId}`);
  }

  /**
   * 7. Stream URL
   * GET /api/stream/{call_id}
   */
  getStreamUrl(callId: string): string {
    return `${this.baseUrl}/api/stream/${callId}`;
  }
}

