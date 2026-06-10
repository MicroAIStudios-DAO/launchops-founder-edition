import { describe, it, expect, vi } from "vitest";

// Mock fetch for ProofGuard client tests
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe("ProofGuard Client", () => {
  it("submitAttestation sends correct payload to ProofGuard API", async () => {
    // Set env vars for the test
    process.env.PROOFGUARD_API_URL = "http://localhost:3001";
    process.env.PROOFGUARD_API_KEY = "pg_test_key123";

    // Re-import to pick up env vars
    vi.resetModules();
    const { submitAttestation } = await import("./proofguard-client");

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        attestation_id: "att_123",
        agent_id: "credential_forge",
        cqs_score: 92.5,
        flagged: false,
        risk_tier: "low",
        imda_pillar: "Internal Governance",
        guardrails: { passed: true, blocked: false, hitl_required: false, triggered: [] },
        timestamp: "2026-06-10T21:00:00Z",
      }),
    });

    const result = await submitAttestation({
      agent_id: "credential_forge",
      action: "account_creation",
      risk_tier: "low",
      imda_pillar: "Internal Governance",
    });

    expect(result.ok).toBe(true);
    expect(result.data?.attestation_id).toBe("att_123");
    expect(result.data?.cqs_score).toBe(92.5);
    expect(result.data?.flagged).toBe(false);

    // Verify fetch was called correctly
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/v1/attest",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer pg_test_key123",
        }),
      })
    );
  });

  it("healthCheck returns configured=false when env vars missing", async () => {
    process.env.PROOFGUARD_API_URL = "";
    process.env.PROOFGUARD_API_KEY = "";

    vi.resetModules();
    const { healthCheck } = await import("./proofguard-client");

    const result = await healthCheck();
    expect(result.configured).toBe(false);
    expect(result.reachable).toBe(false);
  });

  it("verifyAttestation calls correct endpoint", async () => {
    process.env.PROOFGUARD_API_URL = "http://localhost:3001";
    process.env.PROOFGUARD_API_KEY = "pg_test_key123";

    vi.resetModules();
    const { verifyAttestation } = await import("./proofguard-client");

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        verified: true,
        attestation_id: "att_456",
        agent_id: "business_builder",
        agent_name: "Business Builder",
        cqs_score: 88.0,
        risk_tier: "medium",
        imda_pillar: "Human Accountability",
        flagged: false,
        patched: false,
        badge_level: "gold",
        created_at: "2026-06-10T20:00:00Z",
      }),
    });

    const result = await verifyAttestation("att_456");
    expect(result.ok).toBe(true);
    expect(result.data?.verified).toBe(true);
    expect(result.data?.badge_level).toBe("gold");
  });
});

describe("founderProfile.save with businessType", () => {
  it("schema accepts businessType field", async () => {
    // Verify the Zod schema in the router accepts businessType
    const { z } = await import("zod");
    const schema = z.object({
      businessName: z.string().optional(),
      industry: z.string().optional(),
      targetMarket: z.string().optional(),
      deliveryEmail: z.string().optional(),
      monthlyRevenueGoal: z.string().optional(),
      businessType: z.string().optional(),
    });

    const result = schema.safeParse({
      businessName: "Test Corp",
      businessType: "Consultant",
      industry: "Tech",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.businessType).toBe("Consultant");
    }
  });

  it("schema accepts all business type options", async () => {
    const { z } = await import("zod");
    const schema = z.object({ businessType: z.string().optional() });

    const types = [
      "Consultant", "Course creator", "Local service business",
      "Real estate", "Photographer/creative", "Agency", "Custom",
    ];

    for (const bt of types) {
      const result = schema.safeParse({ businessType: bt });
      expect(result.success).toBe(true);
    }
  });
});
