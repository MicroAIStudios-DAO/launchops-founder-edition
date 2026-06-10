import { COOKIE_NAME } from "@shared/const";
import { exec } from "child_process";
import { invokeLLM } from "./_core/llm";
import { promisify } from "util";
import { z } from "zod";
import {
  createVaultDelivery,
  getAlertState,
  getAuditEvents,
  getExportData,
  getHealthChecksByService,
  getLatestHealthChecks,
  getLatestVaultDelivery,
  getLogSnapshots,
  getStatsHistory,
  getVaultDeliveryByToken,
  insertAuditEvent,
  insertHealthCheck,
  insertLogSnapshot,
  insertStatsReading,
  listVaultDeliveries,
  markVaultDeliveryDownloaded,
  updateVaultDeliveryStatus,
  upsertAlertState,
  getDb,
} from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { notifyOwner } from "./_core/notification";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { setupRouter } from "./routers/setup";
import { stripeRouter } from "./routers/stripe";
import { founderProfile } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import * as proofguard from "./proofguard-client";

// ─── Alert state (DB-persisted, survives restarts) ───────────────────────────
// Reads last known status and last alert time from the alert_state table.
// Cooldown: 5 minutes per service to avoid notification storms.
const ALERT_COOLDOWN_MS = 5 * 60 * 1000;

async function fireAlertIfNeeded(
  service: string,
  newStatus: "healthy" | "warning" | "down"
): Promise<void> {
  const now = Date.now();

  // Load persisted state for this service
  const stored = await getAlertState(service);
  const prev = stored?.lastStatus ?? null;
  const lastAlertAt = stored?.lastAlertAt ? stored.lastAlertAt.getTime() : 0;

  const isAlertState = newStatus === "warning" || newStatus === "down";
  const isTransition = prev !== newStatus;
  const cooldownExpired = now - lastAlertAt > ALERT_COOLDOWN_MS;

  if (isAlertState && isTransition && cooldownExpired) {
    const emoji = newStatus === "down" ? "🔴" : "🟡";
    const level = newStatus === "down" ? "OFFLINE" : "WARNING";
    try {
      await notifyOwner({
        title: `${emoji} LaunchOps Alert: ${service} is ${level}`,
        content:
          `Service: **${service}**\n` +
          `Status: **${level}**\n` +
          `Previous: ${prev ?? "unknown"}\n` +
          `Time: ${new Date().toUTCString()}\n\n` +
          (newStatus === "down"
            ? `The container is not running. Check the Controls panel to restart it.`
            : `CPU or memory usage has exceeded safe thresholds. Check the Stats panel for details.`),
      });
      // Persist updated state including alert timestamp
      await upsertAlertState({ service, lastStatus: newStatus, lastAlertAt: new Date() });
      return;
    } catch {
      // Notification failure is non-fatal — polling continues
    }
  }

  // Always persist the latest status (even if no alert fired)
  await upsertAlertState({ service, lastStatus: newStatus });
}

const execAsync = promisify(exec);

// ─── Container name mapping ───────────────────────────────────────────────────
const SERVICE_CONTAINERS: Record<string, string> = {
  WordPress: "launchops_wordpress",
  SuiteCRM: "launchops_suitecrm",
  Mautic: "launchops_mautic",
  Matomo: "launchops_matomo",
  Vaultwarden: "launchops_vaultwarden",
  MariaDB: "launchops_db",
};

const SERVICE_URLS: Record<string, string> = {
  WordPress: "http://137.220.36.18:8080/wp-admin",
  SuiteCRM: "http://137.220.36.18:8081",
  Mautic: "http://137.220.36.18:8082",
  Matomo: "http://137.220.36.18:8083",
  Vaultwarden: "http://137.220.36.18:8000",
  MariaDB: "",
};

// ─── Docker stats parser ──────────────────────────────────────────────────────
function parseDockerStats(raw: string) {
  try {
    const lines = raw.trim().split("\n").filter(Boolean);
    return lines.map((line) => {
      const obj = JSON.parse(line);
      const cpuDelta =
        obj.cpu_stats?.cpu_usage?.total_usage -
        obj.precpu_stats?.cpu_usage?.total_usage;
      const systemDelta =
        obj.cpu_stats?.system_cpu_usage - obj.precpu_stats?.system_cpu_usage;
      const numCpus = obj.cpu_stats?.online_cpus || 1;
      const cpuPercent =
        systemDelta > 0 ? (cpuDelta / systemDelta) * numCpus * 100 : 0;

      const memUsage = obj.memory_stats?.usage || 0;
      const memLimit = obj.memory_stats?.limit || 1;
      const memPercent = (memUsage / memLimit) * 100;

      const networks = obj.networks || {};
      let rxBytes = 0;
      let txBytes = 0;
      for (const iface of Object.values(networks) as any[]) {
        rxBytes += iface.rx_bytes || 0;
        txBytes += iface.tx_bytes || 0;
      }

      return {
        cpuPercent: Math.round(cpuPercent * 100) / 100,
        memUsageMb: Math.round((memUsage / 1024 / 1024) * 100) / 100,
        memLimitMb: Math.round((memLimit / 1024 / 1024) * 100) / 100,
        memPercent: Math.round(memPercent * 100) / 100,
        netRxMb: Math.round((rxBytes / 1024 / 1024) * 100) / 100,
        netTxMb: Math.round((txBytes / 1024 / 1024) * 100) / 100,
      };
    })[0];
  } catch {
    return null;
  }
}

// ─── Get container status ─────────────────────────────────────────────────────
async function getContainerStatus(containerName: string) {
  try {
    const { stdout } = await execAsync(
      `docker inspect --format='{{.State.Status}}|{{.State.StartedAt}}' ${containerName} 2>/dev/null`
    );
    const [state, startedAt] = stdout.trim().replace(/'/g, "").split("|");
    return { state: state || "unknown", startedAt };
  } catch {
    return { state: "not_found", startedAt: null };
  }
}

// ─── Compute uptime string ────────────────────────────────────────────────────
function computeUptime(startedAt: string | null): string {
  if (!startedAt) return "N/A";
  const start = new Date(startedAt).getTime();
  const now = Date.now();
  const diffMs = now - start;
  if (diffMs < 0) return "N/A";
  const hours = Math.floor(diffMs / 3600000);
  const mins = Math.floor((diffMs % 3600000) / 60000);
  if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

// ─── Determine health status ──────────────────────────────────────────────────
function determineStatus(
  state: string,
  cpuPercent: number,
  memPercent: number
): "healthy" | "warning" | "down" {
  if (state !== "running") return "down";
  if (cpuPercent > 85 || memPercent > 90) return "warning";
  return "healthy";
}

// ─── Routers ──────────────────────────────────────────────────────────────────
const servicesRouter = router({
  // Poll health for all 6 services and persist to DB
  pollAll: publicProcedure.mutation(async () => {
    const results = await Promise.all(
      Object.entries(SERVICE_CONTAINERS).map(async ([name, container]) => {
        const { state, startedAt } = await getContainerStatus(container);
        let stats = {
          cpuPercent: 0,
          memUsageMb: 0,
          memLimitMb: 0,
          memPercent: 0,
          netRxMb: 0,
          netTxMb: 0,
        };

        if (state === "running") {
          try {
            const { stdout } = await execAsync(
              `docker stats ${container} --no-stream --format '{{json .}}' 2>/dev/null`,
              { timeout: 8000 }
            );
            // docker stats --format json gives us a simpler format
            const line = stdout.trim();
            if (line) {
              const obj = JSON.parse(line);
              // Parse CPU: "0.5%"
              const cpuStr = obj.CPUPerc || "0%";
              const cpuPercent = parseFloat(cpuStr.replace("%", "")) || 0;
              // Parse Mem: "123MiB / 1GiB"
              const memStr = obj.MemUsage || "0B / 0B";
              const [usedStr, limitStr] = memStr.split(" / ");
              const parseMem = (s: string) => {
                const n = parseFloat(s);
                if (s.includes("GiB")) return n * 1024;
                if (s.includes("MiB")) return n;
                if (s.includes("KiB")) return n / 1024;
                return n / 1024 / 1024;
              };
              const memUsageMb = parseMem(usedStr);
              const memLimitMb = parseMem(limitStr);
              const memPercent = memLimitMb > 0 ? (memUsageMb / memLimitMb) * 100 : 0;
              // Parse Net: "1.2MB / 3.4MB"
              const netStr = obj.NetIO || "0B / 0B";
              const [rxStr, txStr] = netStr.split(" / ");
              const parseNet = (s: string) => {
                const n = parseFloat(s);
                if (s.includes("GB")) return n * 1024;
                if (s.includes("MB")) return n;
                if (s.includes("kB")) return n / 1024;
                return n / 1024 / 1024;
              };
              stats = {
                cpuPercent: Math.round(cpuPercent * 100) / 100,
                memUsageMb: Math.round(memUsageMb * 100) / 100,
                memLimitMb: Math.round(memLimitMb * 100) / 100,
                memPercent: Math.round(memPercent * 100) / 100,
                netRxMb: Math.round(parseNet(rxStr) * 100) / 100,
                netTxMb: Math.round(parseNet(txStr) * 100) / 100,
              };
            }
          } catch {
            // stats stay at 0 if docker not accessible
          }
        }

        const uptime = computeUptime(startedAt);
        const status = determineStatus(state, stats.cpuPercent, stats.memPercent);

        // Fire alert if service flipped to warning or down (non-blocking)
        fireAlertIfNeeded(name, status).catch(() => {});

        // Persist health check
        await insertHealthCheck({
          service: name,
          status,
          uptime,
          ...stats,
          rawJson: JSON.stringify({ state, startedAt }),
        });

        // Persist stats reading
        await insertStatsReading({ service: name, ...stats });

        return {
          service: name,
          container,
          state,
          status,
          uptime,
          url: SERVICE_URLS[name] || "",
          ...stats,
        };
      })
    );
    return results;
  }),

  // Get latest stored health checks from DB
  latest: publicProcedure.query(async () => {
    const rows = await getLatestHealthChecks();
    // Return one per service (most recent)
    const seen = new Set<string>();
    const result = [];
    for (const row of rows) {
      if (!seen.has(row.service)) {
        seen.add(row.service);
        result.push({ ...row, url: SERVICE_URLS[row.service] || "" });
      }
    }
    return result;
  }),

  // Fetch logs for a service
  logs: publicProcedure
    .input(z.object({ service: z.string(), lines: z.number().default(100) }))
    .query(async ({ input }) => {
      const container = SERVICE_CONTAINERS[input.service];
      if (!container) return { lines: [], error: "Unknown service" };
      try {
        const { stdout, stderr } = await execAsync(
          `docker logs ${container} --tail ${input.lines} 2>&1`,
          { timeout: 10000 }
        );
        const lines = (stdout + stderr)
          .split("\n")
          .filter(Boolean)
          .slice(-input.lines);

        // Persist snapshot
        await insertLogSnapshot({ service: input.service, lines: lines.join("\n") });

        return { lines, error: null };
      } catch (err: any) {
        return { lines: [], error: err.message || "Failed to fetch logs" };
      }
    }),

  // Control: start / stop / restart
  control: publicProcedure
    .input(
      z.object({
        service: z.string(),
        action: z.enum(["start", "stop", "restart"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const container = SERVICE_CONTAINERS[input.service];
      if (!container) throw new Error("Unknown service");

      let outcome: "success" | "failure" = "success";
      let detail = "";

      try {
        const { stdout, stderr } = await execAsync(
          `docker ${input.action} ${container} 2>&1`,
          { timeout: 30000 }
        );
        detail = (stdout + stderr).trim();
      } catch (err: any) {
        outcome = "failure";
        detail = err.message || "Command failed";
      }

      await insertAuditEvent({
        userId: undefined,
        userName: "founder",
        action: input.action,
        service: input.service,
        detail,
        outcome,
      });

      if (outcome === "failure") throw new Error(detail);
      return { success: true, detail };
    }),
});

const statsRouter = router({
  history: publicProcedure
    .input(
      z.object({
        service: z.string(),
        from: z.date().optional(),
        to: z.date().optional(),
        limit: z.number().default(60),
      })
    )
    .query(async ({ input }) => {
      const rows = await getStatsHistory(
        input.service,
        input.from,
        input.to,
        input.limit
      );
      return rows.reverse(); // chronological order for charts
    }),

  allLatest: publicProcedure.query(async () => {
    const rows = await getLatestHealthChecks();
    const seen = new Set<string>();
    const result = [];
    for (const row of rows) {
      if (!seen.has(row.service)) {
        seen.add(row.service);
        result.push(row);
      }
    }
    return result;
  }),
});

const logsRouter = router({
  snapshots: publicProcedure
    .input(z.object({ service: z.string(), limit: z.number().default(10) }))
    .query(async ({ input }) => {
      return getLogSnapshots(input.service, input.limit);
    }),
});

const auditRouter = router({
  list: publicProcedure
    .input(
      z.object({
        service: z.string().optional(),
        from: z.date().optional(),
        to: z.date().optional(),
        limit: z.number().default(100),
      })
    )
    .query(async ({ input }) => {
      return getAuditEvents(input.service, input.from, input.to, input.limit);
    }),
});

const exportsRouter = router({
  download: publicProcedure
    .input(
      z.object({
        type: z.enum(["health", "stats", "logs", "audit"]),
        format: z.enum(["json", "csv"]),
        service: z.string().optional(),
        from: z.date().optional(),
        to: z.date().optional(),
      })
    )
    .query(async ({ input }) => {
      const rows = await getExportData(
        input.type,
        input.service,
        input.from,
        input.to
      );

      if (input.format === "json") {
        return { content: JSON.stringify(rows, null, 2), mimeType: "application/json" };
      }

      // CSV
      if (rows.length === 0) return { content: "", mimeType: "text/csv" };
      const headers = Object.keys(rows[0] as object);
      const csvLines = [
        headers.join(","),
        ...rows.map((row: any) =>
          headers.map((h) => JSON.stringify(row[h] ?? "")).join(",")
        ),
      ];
      return { content: csvLines.join("\n"), mimeType: "text/csv" };
    }),
});

// ── Atlas Agent Fleet router ─────────────────────────────────────────────────
const AGENT_IDS = [
  "founder_os", "business_builder", "dynexecutiv", "metrics_agent", "content_engine",
  "credential_forge", "key_keeper",
  "security_agent", "wordpress_agent", "mautic_agent", "stripe_agent",
  "paperwork_agent", "paralegal_bot",
  "funding_intelligence", "execai_coach",
  "analytics_agent", "email_agent", "files_agent", "growth_agent",
  "project_agent", "repo_agent", "support_agent", "documentary_tracker",
];

const agentsRouter = router({
  /**
   * Trigger KONG team account creation via the Python launchops CLI.
   * Runs: python3 launchops.py task credential_forge account_creation_all
   * Returns per-service results from the JSON output.
   */
  runAccountCreation: publicProcedure
    .input(
      z.object({
        services: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const launchopsDir = process.env.LAUNCHOPS_DIR ||
        `${process.env.HOME || "/root"}/launchops-founder-edition`;
      const services = (input.services || []).join(",");
      const cmd = services
        ? `cd ${launchopsDir} && python3 launchops.py task credential_forge account_creation_all --services ${services} --output-json 2>&1`
        : `cd ${launchopsDir} && python3 launchops.py task credential_forge account_creation_all --output-json 2>&1`;

      try {
        const { stdout } = await execAsync(cmd, { timeout: 600_000 });
        // Parse JSON output — launchops.py prints a JSON line at the end
        const lines = stdout.trim().split("\n");
        const jsonLine = lines.reverse().find((l) => l.trim().startsWith("{"));
        let result = { success: false, results: {} as Record<string, unknown>, raw: stdout.slice(-1000) };
        if (jsonLine) {
          const parsed = JSON.parse(jsonLine);
          result = {
            success:  parsed.success ?? false,
            results:  parsed.results ?? {},
            raw:      stdout.slice(-1000),
          };
        }

        // Submit attestation to ProofGuard (non-blocking)
        proofguard.submitAttestation({
          agent_id: "credential_forge",
          action: "account_creation_all",
          action_json: { services: input.services || [], success: result.success },
          risk_tier: "high",
          imda_pillar: "Internal Governance",
        }).catch(() => {}); // fire-and-forget

        return result;
      } catch (err: any) {
        // Submit failed attestation to ProofGuard (non-blocking)
        proofguard.submitAttestation({
          agent_id: "credential_forge",
          action: "account_creation_all",
          action_json: { services: input.services || [], error: err.message },
          risk_tier: "critical",
          imda_pillar: "Internal Governance",
        }).catch(() => {});

        return {
          success: false,
          results: {},
          raw: err.message || "Execution failed",
        };
      }
    }),

  /**
   * Atlas AI chat — answers questions about the agent fleet, pipeline, and system.
   */
  atlasChat: publicProcedure
    .input(
      z.object({
        messages: z.array(
          z.object({
            role: z.enum(["user", "assistant"]),
            content: z.string(),
          })
        ),
      })
    )
        .mutation(async ({ input }) => {
      // Fetch founder profile to personalize Atlas context
      let profileContext = "";
      try {
        const db = await getDb();
        if (db) {
          const rows = await db.select().from(founderProfile).limit(1);
          if (rows.length > 0) {
            const p = rows[0];
            profileContext = `\n\nFOUNDER CONTEXT (use this to personalize every response):
- Business: ${p.businessName || "not set"}
- Industry: ${p.industry || "not set"}
- Business Type: ${p.businessType || "not set"}
- Target Market: ${p.targetMarket || "not set"}
- Monthly Revenue Goal: ${p.monthlyRevenueGoal || "not set"}
- Contact Email: ${p.deliveryEmail || "not set"}
Always reference the founder's specific business context when giving advice. Address them by their business name, not generically. Tailor recommendations to their business type (${p.businessType || "general"}).`;
          }
        }
      } catch { /* profile fetch is non-blocking */ }

      const SYSTEM = `You are Atlas, the AI orchestrator for LaunchOps Founder Edition — a no-guardrails AI-powered business operating system.
You coordinate 23 specialized agents in 6 teams:
- KONG (A.P.E.SSH.I.T.T.): CredentialForge, KeyKeeper — automated account creation & 2FA handling
- Core Pipeline: FounderOS, BusinessBuilder, DynExecutiv, MetricsAgent, ContentEngine
- Infrastructure: SecurityAgent, WordPressAgent, MauticAgent, StripeAgent, FilesAgent (Nextcloud), RepoAgent (GitHub CI/CD)
- Legal & Formation: PaperworkAgent, ParalegalBot
- Intelligence: FundingIntelligence, ExecAICoach
- Operations: AnalyticsAgent, EmailAgent, GrowthAgent, ProjectAgent, SupportAgent (Chatwoot), DocumentaryTracker

Pipeline stages: intake → auth → formation → infrastructure → legal → payments → funding → coaching → growth

Stack on Vultr: WordPress (:8080), SuiteCRM (:8081), Mautic (:8082), Matomo (:8083), Vaultwarden (:8000)

CLI: venv/bin/python3 launchops.py [command]
Key commands: kong, stage [name], task [agent] [task], health, status, launch

Be direct, specific, and action-oriented. Speak like a brilliant co-founder who built this system. No corporate speak.`;

      try {
        const response = await invokeLLM({
          messages: [
            { role: "system", content: SYSTEM + profileContext },
            ...input.messages,
          ],
        });
        const reply = response?.choices?.[0]?.message?.content || "Processing. Check Controls panel to run agents directly.";
        return { reply };
      } catch {
        return { reply: "Atlas is temporarily unavailable. Use the Controls panel or Vultr terminal to run agents directly." };
      }
    }),

  /**
   * ProofGuard: submit an attestation for a pipeline agent action.
   */
  submitAttestation: publicProcedure
    .input(z.object({
      agentId: z.string(),
      action: z.string(),
      actionJson: z.record(z.string(), z.unknown()).optional(),
      riskTier: z.enum(["low", "medium", "high", "critical"]).optional(),
      imdaPillar: z.enum(["Internal Governance", "Human Accountability", "Technical Robustness", "User Enablement"]).optional(),
      modelHash: z.string().optional(),
      policyHash: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const result = await proofguard.submitAttestation({
        agent_id: input.agentId,
        action: input.action,
        action_json: input.actionJson,
        risk_tier: input.riskTier,
        imda_pillar: input.imdaPillar,
        model_hash: input.modelHash,
        policy_hash: input.policyHash,
      });
      return result;
    }),

  /**
   * ProofGuard: verify an attestation by ID.
   */
  verifyAttestation: publicProcedure
    .input(z.object({ attestationId: z.string() }))
    .query(async ({ input }) => {
      return proofguard.verifyAttestation(input.attestationId);
    }),

  /**
   * ProofGuard: list recent attestations.
   */
  listAttestations: publicProcedure
    .input(z.object({
      limit: z.number().optional(),
      offset: z.number().optional(),
      flagged: z.boolean().optional(),
    }).optional())
    .query(async ({ input }) => {
      return proofguard.listAttestations(input ?? undefined);
    }),

  /**
   * ProofGuard: health check — is the service configured and reachable?
   */
  proofguardHealth: publicProcedure.query(async () => {
    return proofguard.healthCheck();
  }),

  /**
   * ProofGuard: register a new agent.
   */
  registerAgent: publicProcedure
    .input(z.object({
      name: z.string(),
      description: z.string().optional(),
      runtime: z.string().optional(),
      modelProvider: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return proofguard.registerAgent(input);
    }),

  getStatus: publicProcedure.query(async () => {
    // Read agent audit log from the launchops artifacts directory
    const artifactsBase = process.env.ARTIFACTS_PATH ||
      `${process.env.HOME || "/root"}/.launchops/documents`;
    const result: Record<string, { status: string; lastRun: string | null; lastResult: string | null }> = {};
    for (const id of AGENT_IDS) {
      result[id] = { status: "idle", lastRun: null, lastResult: null };
    }
    // Try to read the latest pipeline context for last-run info
    try {
      const contextPath = `${process.env.HOME || "/root"}/.launchops/context.json`;
      const fs = await import("fs");
      if (fs.existsSync(contextPath)) {
        const raw = fs.readFileSync(contextPath, "utf8");
        const ctx = JSON.parse(raw);
        const outputs = ctx?.agent_outputs || {};
        for (const stage of Object.values(outputs) as Record<string, unknown>[]) {
          for (const [agentName, data] of Object.entries(stage as Record<string, unknown>)) {
            const d = data as { status?: string; timestamp?: string; result?: unknown };
            const id = agentName.toLowerCase();
            if (result[id] !== undefined) {
              result[id] = {
                status: d.status === "completed" ? "idle" : d.status === "error" ? "error" : "idle",
                lastRun: d.timestamp || null,
                lastResult: d.result ? JSON.stringify(d.result).slice(0, 200) : null,
              };
            }
          }
        }
        // Mark currently active stage agents as "active"
        const currentStage = ctx?.stage;
        if (currentStage && outputs[currentStage]) {
          for (const agentName of Object.keys(outputs[currentStage] as object)) {
            const id = agentName.toLowerCase();
            if (result[id]) result[id].status = "active";
          }
        }
      }
    } catch {
      // Context file not present yet — all agents show as idle
    }
    return result;
  }),
});

// ─── Vault Router ─────────────────────────────────────────────────────────────
const vaultRouter = router({
  /**
   * Ingest KONG run output and create a vault delivery record.
   * Called automatically by the Pipeline Monitor when a KONG run completes.
   */
  ingest: publicProcedure
    .input(
      z.object({
        runId: z.string(),
        rawOutput: z.string(),
        deliveryEmail: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const crypto = await import("crypto");
      const token = crypto.randomBytes(32).toString("hex");
      const tokenExpiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72h

      // Parse provisioned services from the raw output
      const serviceMatches = input.rawOutput.match(/\[(CredentialForge|KONG)\]\s+(\w+)\s+→\s+PROVISIONED/g) || [];
      const services = serviceMatches.map((m) => {
        const match = m.match(/→\s+PROVISIONED/);
        const serviceMatch = m.match(/\]\s+(\w+)\s+→/);
        return serviceMatch ? serviceMatch[1] : null;
      }).filter(Boolean);

      // Also detect from lines like "✓ WordPress" or "[OK] WordPress"
      const okMatches = input.rawOutput.match(/(?:✓|\[OK\])\s+(\w+)/g) || [];
      const okServices = okMatches.map((m) => m.replace(/(?:✓|\[OK\])\s+/, "").trim());
      const allServices = Array.from(new Set([...services, ...okServices]));

      const record = await createVaultDelivery({
        runId: input.runId,
        status: "ready",
        servicesProvisioned: JSON.stringify(allServices),
        downloadToken: token,
        tokenExpiresAt,
        deliveryEmail: input.deliveryEmail || null,
        rawOutput: input.rawOutput.slice(0, 50000), // cap at 50KB
      });

      // Notify owner
      const serviceList = allServices.length > 0 ? allServices.join(", ") : "(parsing in progress)";
      await notifyOwner({
        title: "KONG Vault Ready",
        content: `KONG run ${input.runId} completed. Services provisioned: ${serviceList}. Credentials ready for secure download.`,
      }).catch(() => {});

      return {
        success: true,
        runId: input.runId,
        downloadToken: token,
        servicesProvisioned: allServices,
        expiresAt: tokenExpiresAt.toISOString(),
      };
    }),

  /** List recent vault deliveries */
  list: publicProcedure.query(async () => {
    const rows = await listVaultDeliveries(10);
    return rows.map((r) => ({
      id: r.id,
      runId: r.runId,
      status: r.status,
      servicesProvisioned: r.servicesProvisioned ? JSON.parse(r.servicesProvisioned) : [],
      downloadToken: r.downloadToken,
      tokenExpiresAt: r.tokenExpiresAt?.toISOString() ?? null,
      downloadedAt: r.downloadedAt?.toISOString() ?? null,
      deliveryEmail: r.deliveryEmail,
      createdAt: r.createdAt.toISOString(),
    }));
  }),

  /** Get the latest vault delivery */
  latest: publicProcedure.query(async () => {
    const r = await getLatestVaultDelivery();
    if (!r) return null;
    return {
      id: r.id,
      runId: r.runId,
      status: r.status,
      servicesProvisioned: r.servicesProvisioned ? JSON.parse(r.servicesProvisioned) : [],
      downloadToken: r.downloadToken,
      tokenExpiresAt: r.tokenExpiresAt?.toISOString() ?? null,
      downloadedAt: r.downloadedAt?.toISOString() ?? null,
      deliveryEmail: r.deliveryEmail,
      createdAt: r.createdAt.toISOString(),
    };
  }),

  /** Mark a token as downloaded */
  markDownloaded: publicProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ input }) => {
      await markVaultDeliveryDownloaded(input.token);
      return { success: true };
    }),

  /** Expire a vault delivery manually */
  expire: publicProcedure
    .input(z.object({ runId: z.string() }))
    .mutation(async ({ input }) => {
      await updateVaultDeliveryStatus(input.runId, "expired");
      return { success: true };
    }),
});

export const appRouter = router({
  system: systemRouter,
  setup: setupRouter,
  stripe: stripeRouter,
  agents: agentsRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  services: servicesRouter,
  stats: statsRouter,
  logs: logsRouter,
  audit: auditRouter,
  exports: exportsRouter,
  vault: vaultRouter,
  founderProfile: router({
    get: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db.select().from(founderProfile).limit(1);
      return rows[0] ?? null;
    }),
    save: publicProcedure
      .input(z.object({
        businessName: z.string().optional(),
        industry: z.string().optional(),
        targetMarket: z.string().optional(),
        deliveryEmail: z.string().optional(),
        monthlyRevenueGoal: z.string().optional(),
        businessType: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) return { success: false };
        const rows = await db.select().from(founderProfile).limit(1);
        if (rows.length > 0) {
          await db.update(founderProfile).set(input).where(eq(founderProfile.id, rows[0].id));
        } else {
          await db.insert(founderProfile).values(input);
        }
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
