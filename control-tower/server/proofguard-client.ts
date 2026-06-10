/**
 * ProofGuard AI — Attestation Client for LaunchOps Control Tower
 *
 * Submits attestations to the ProofGuard API when pipeline agents execute.
 * Provides verification, badge status, and attestation feed queries.
 *
 * Required env vars:
 *   PROOFGUARD_API_URL  — base URL of the ProofGuard instance (e.g. http://137.220.36.18:3001)
 *   PROOFGUARD_API_KEY  — Bearer API key (pg_live_xxx format)
 */

const PROOFGUARD_API_URL = process.env.PROOFGUARD_API_URL || "";
const PROOFGUARD_API_KEY = process.env.PROOFGUARD_API_KEY || "";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AttestationPayload {
  agent_id: string;
  action: string;
  action_json?: Record<string, unknown>;
  risk_tier?: "low" | "medium" | "high" | "critical";
  imda_pillar?: "Internal Governance" | "Human Accountability" | "Technical Robustness" | "User Enablement";
  model_hash?: string;
  policy_hash?: string;
  trace?: Record<string, unknown>;
  compliance?: Record<string, unknown>;
}

export interface AttestationResponse {
  attestation_id: string;
  agent_id: string;
  cqs_score: number;
  flagged: boolean;
  risk_tier: string;
  imda_pillar: string;
  guardrails: {
    passed: boolean;
    blocked: boolean;
    hitl_required: boolean;
    triggered: Array<{ rule_id: string; action: string; reason: string }>;
  };
  timestamp: string;
  badge?: {
    type: string;
    level: "gold" | "silver" | "bronze";
    valid_until: string;
    embed_url: string;
  } | null;
  remediation?: {
    message: string;
    actions: string[];
  };
}

export interface VerificationResponse {
  verified: boolean;
  attestation_id: string;
  agent_id: string;
  agent_name: string;
  cqs_score: number;
  risk_tier: string;
  imda_pillar: string;
  flagged: boolean;
  patched: boolean;
  badge_level: string | null;
  created_at: string;
}

export interface AgentRegistrationPayload {
  name: string;
  description?: string;
  runtime?: string;
  modelProvider?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentRegistrationResponse {
  agent_id: string;
  name: string;
  status: string;
  cqs_score: number;
}

// ─── Client ──────────────────────────────────────────────────────────────────

function isConfigured(): boolean {
  return !!(PROOFGUARD_API_URL && PROOFGUARD_API_KEY);
}

async function proofguardFetch<T>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<{ ok: boolean; data?: T; error?: string }> {
  if (!isConfigured()) {
    return { ok: false, error: "ProofGuard not configured (missing PROOFGUARD_API_URL or PROOFGUARD_API_KEY)" };
  }

  try {
    const url = `${PROOFGUARD_API_URL}/api/v1${path}`;
    const res = await fetch(url, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${PROOFGUARD_API_KEY}`,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(15000),
    });

    const json = await res.json();

    if (!res.ok) {
      return { ok: false, error: json.message || json.error || `HTTP ${res.status}` };
    }

    return { ok: true, data: json as T };
  } catch (err: any) {
    return { ok: false, error: err.message || "ProofGuard API unreachable" };
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Submit an attestation for a pipeline agent action.
 * Called whenever an agent completes a task in the LaunchOps pipeline.
 */
export async function submitAttestation(
  payload: AttestationPayload
): Promise<{ ok: boolean; data?: AttestationResponse; error?: string }> {
  return proofguardFetch<AttestationResponse>("/attest", {
    method: "POST",
    body: payload,
  });
}

/**
 * Verify a previously submitted attestation by ID.
 */
export async function verifyAttestation(
  attestationId: string
): Promise<{ ok: boolean; data?: VerificationResponse; error?: string }> {
  return proofguardFetch<VerificationResponse>(`/verify/${attestationId}`);
}

/**
 * Register a new agent with ProofGuard.
 * Called once per agent when the LaunchOps pipeline is first configured.
 */
export async function registerAgent(
  payload: AgentRegistrationPayload
): Promise<{ ok: boolean; data?: AgentRegistrationResponse; error?: string }> {
  return proofguardFetch<AgentRegistrationResponse>("/agents", {
    method: "POST",
    body: payload,
  });
}

/**
 * List recent attestations for the authenticated account.
 */
export async function listAttestations(params?: {
  limit?: number;
  offset?: number;
  flagged?: boolean;
}): Promise<{ ok: boolean; data?: any; error?: string }> {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  if (params?.flagged !== undefined) qs.set("flagged", String(params.flagged));
  const query = qs.toString() ? `?${qs.toString()}` : "";
  return proofguardFetch(`/attestations${query}`);
}

/**
 * List registered agents for the authenticated account.
 */
export async function listAgents(): Promise<{ ok: boolean; data?: any; error?: string }> {
  return proofguardFetch("/agents");
}

/**
 * Check if ProofGuard is configured and reachable.
 */
export async function healthCheck(): Promise<{
  configured: boolean;
  reachable: boolean;
  error?: string;
}> {
  if (!isConfigured()) {
    return { configured: false, reachable: false, error: "Not configured" };
  }

  try {
    const url = `${PROOFGUARD_API_URL}/api/v1/badges/health`;
    const res = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    return { configured: true, reachable: res.ok || res.status === 404 };
  } catch (err: any) {
    return { configured: true, reachable: false, error: err.message };
  }
}

/**
 * Get the ProofGuard configuration status (for UI display).
 */
export function getConfig(): { url: string; configured: boolean } {
  return {
    url: PROOFGUARD_API_URL,
    configured: isConfigured(),
  };
}
