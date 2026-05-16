import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock the db module so tests don't need a real database ──────────────────
vi.mock("./db", () => ({
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
  insertHealthCheck: vi.fn().mockResolvedValue(undefined),
  getLatestHealthChecks: vi.fn().mockResolvedValue([
    {
      id: 1,
      service: "WordPress",
      status: "healthy",
      uptime: "2h 30m",
      cpuPercent: 5.2,
      memUsageMb: 128.0,
      memLimitMb: 512.0,
      memPercent: 25.0,
      netRxMb: 1.2,
      netTxMb: 0.8,
      rawJson: "{}",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    },
    {
      id: 2,
      service: "MariaDB",
      status: "healthy",
      uptime: "5h 10m",
      cpuPercent: 1.1,
      memUsageMb: 64.0,
      memLimitMb: 512.0,
      memPercent: 12.5,
      netRxMb: 0.5,
      netTxMb: 0.2,
      rawJson: "{}",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    },
  ]),
  getHealthChecksByService: vi.fn().mockResolvedValue([]),
  insertStatsReading: vi.fn().mockResolvedValue(undefined),
  getStatsHistory: vi.fn().mockResolvedValue([]),
  insertLogSnapshot: vi.fn().mockResolvedValue(undefined),
  getLogSnapshots: vi.fn().mockResolvedValue([]),
  insertAuditEvent: vi.fn().mockResolvedValue(undefined),
  getAuditEvents: vi.fn().mockResolvedValue([
    {
      id: 1,
      userId: 1,
      userName: "B",
      action: "restart",
      service: "WordPress",
      detail: "Container restarted successfully",
      outcome: "success",
      createdAt: new Date("2026-01-01T12:00:00Z"),
    },
  ]),
  getExportData: vi.fn().mockResolvedValue([
    {
      id: 1,
      service: "WordPress",
      status: "healthy",
      cpuPercent: 5.2,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    },
  ]),
}));

// ─── Mock child_process so docker commands don't run in CI ───────────────────
vi.mock("child_process", () => ({
  exec: vi.fn((cmd: string, opts: any, cb?: Function) => {
    const callback = typeof opts === "function" ? opts : cb;
    if (callback) {
      callback(null, { stdout: "launchops_wordpress\n", stderr: "" });
    }
    return { on: vi.fn() };
  }),
}));

vi.mock("util", () => ({
  promisify: (fn: any) => async (...args: any[]) => {
    // Simulate docker inspect returning running state
    if (args[0]?.includes("inspect")) {
      return { stdout: "running|2026-01-01T00:00:00Z", stderr: "" };
    }
    // Simulate docker stats returning JSON
    if (args[0]?.includes("stats")) {
      return {
        stdout: JSON.stringify({
          CPUPerc: "5.2%",
          MemUsage: "128MiB / 512MiB",
          NetIO: "1.2MB / 0.8MB",
        }),
        stderr: "",
      };
    }
    // Simulate docker logs
    if (args[0]?.includes("logs")) {
      return { stdout: "2026-01-01 INFO WordPress started\n", stderr: "" };
    }
    // Simulate docker start/stop/restart
    return { stdout: "launchops_wordpress\n", stderr: "" };
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────
function makePublicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as any,
    res: { clearCookie: vi.fn() } as any,
  };
}

function makeAuthCtx(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      name: "B",
      email: "b@microaistudios.com",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as any,
    res: { clearCookie: vi.fn() } as any,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────
describe("services.latest", () => {
  it("returns latest health checks from DB with service URLs", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    const result = await caller.services.latest();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    const wp = result.find((r) => r.service === "WordPress");
    expect(wp).toBeDefined();
    expect(wp?.status).toBe("healthy");
    expect(wp?.url).toContain("8080");
  });
});

describe("services.logs", () => {
  it("returns log lines for a known service", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    const result = await caller.services.logs({ service: "WordPress", lines: 50 });
    expect(result).toHaveProperty("lines");
    expect(Array.isArray(result.lines)).toBe(true);
  });

  it("returns error for unknown service", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    const result = await caller.services.logs({ service: "UnknownService", lines: 50 });
    expect(result.error).toBeTruthy();
  });
});

describe("audit.list", () => {
  it("returns audit events with timestamps and user info", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    const result = await caller.audit.list({ limit: 10 });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    const event = result[0] as any;
    expect(event).toHaveProperty("action");
    expect(event).toHaveProperty("service");
    expect(event).toHaveProperty("outcome");
    expect(event).toHaveProperty("createdAt");
    expect(event.outcome).toMatch(/^(success|failure)$/);
  });

  it("filters by service name", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    const result = await caller.audit.list({ service: "WordPress", limit: 10 });
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("exports.download", () => {
  it("returns JSON export with correct mime type", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    const result = await caller.exports.download({
      type: "health",
      format: "json",
    });
    expect(result.mimeType).toBe("application/json");
    expect(typeof result.content).toBe("string");
    const parsed = JSON.parse(result.content);
    expect(Array.isArray(parsed)).toBe(true);
  });

  it("returns CSV export with headers row", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    const result = await caller.exports.download({
      type: "health",
      format: "csv",
    });
    expect(result.mimeType).toBe("text/csv");
    expect(typeof result.content).toBe("string");
    const lines = result.content.split("\n");
    expect(lines.length).toBeGreaterThan(1);
    // First line should be headers
    expect(lines[0]).toContain("service");
  });

  it("returns empty CSV gracefully when no data", async () => {
    const { getExportData } = await import("./db");
    vi.mocked(getExportData).mockResolvedValueOnce([]);
    const caller = appRouter.createCaller(makePublicCtx());
    const result = await caller.exports.download({
      type: "stats",
      format: "csv",
    });
    expect(result.content).toBe("");
    expect(result.mimeType).toBe("text/csv");
  });
});

describe("services.pollAll", () => {
  it("calls insertHealthCheck and insertStatsReading for each service", async () => {
    const { insertHealthCheck, insertStatsReading } = await import("./db");
    vi.mocked(insertHealthCheck).mockClear();
    vi.mocked(insertStatsReading).mockClear();

    const caller = appRouter.createCaller(makePublicCtx());
    const result = await caller.services.pollAll();

    // Should return an array of service results
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(6);

    // insertHealthCheck should be called once per service
    expect(insertHealthCheck).toHaveBeenCalledTimes(6);
    // insertStatsReading should be called once per service
    expect(insertStatsReading).toHaveBeenCalledTimes(6);

    // Each result should have the required shape
    const wp = result.find((r) => r.service === "WordPress");
    expect(wp).toBeDefined();
    expect(wp).toHaveProperty("status");
    expect(wp).toHaveProperty("uptime");
    expect(wp).toHaveProperty("cpuPercent");
    expect(wp).toHaveProperty("memUsageMb");
    expect(wp?.url).toContain("8080");
  });
});

describe("services.control", () => {
  it("calls insertAuditEvent with correct fields on restart", async () => {
    const { insertAuditEvent } = await import("./db");
    vi.mocked(insertAuditEvent).mockClear();

    const caller = appRouter.createCaller(makeAuthCtx());
    const result = await caller.services.control({ service: "WordPress", action: "restart" });

    expect(result.success).toBe(true);
    expect(insertAuditEvent).toHaveBeenCalledTimes(1);

    const call = vi.mocked(insertAuditEvent).mock.calls[0][0];
    expect(call.service).toBe("WordPress");
    expect(call.action).toBe("restart");
    expect(call.outcome).toBe("success");
    expect(call.userName).toBe("B");
    expect(call.userId).toBe(1);
  });

  it("throws for unknown service and does not call insertAuditEvent", async () => {
    const { insertAuditEvent } = await import("./db");
    vi.mocked(insertAuditEvent).mockClear();

    const caller = appRouter.createCaller(makeAuthCtx());
    await expect(
      caller.services.control({ service: "UnknownService", action: "restart" })
    ).rejects.toThrow();
    expect(insertAuditEvent).not.toHaveBeenCalled();
  });
});

describe("auth.logout", () => {
  it("clears session cookie and returns success", async () => {
    const ctx = makeAuthCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
  });
});
