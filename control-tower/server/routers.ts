import { COOKIE_NAME } from "@shared/const";
import { exec } from "child_process";
import { invokeLLM } from "./_core/llm";
import { promisify } from "util";
import { z } from "zod";
import {
  getAlertState,
  getAuditEvents,
  getExportData,
  getHealthChecksByService,
  getLatestHealthChecks,
  getLogSnapshots,
  getStatsHistory,
  insertAuditEvent,
  insertHealthCheck,
  insertLogSnapshot,
  insertStatsReading,
  upsertAlertState,
} from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { notifyOwner } from "./_core/notification";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";

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
  control: protectedProcedure
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
        userId: ctx.user?.id,
        userName: ctx.user?.name || "unknown",
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
        if (jsonLine) {
          const parsed = JSON.parse(jsonLine);
          return {
            success:  parsed.success ?? false,
            results:  parsed.results ?? {},
            raw:      stdout.slice(-1000),
          };
        }
        return { success: false, results: {}, raw: stdout.slice(-1000) };
      } catch (err: any) {
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
      const SYSTEM = `You are Atlas, the AI orchestrator for LaunchOps Founder Edition — a no-guardrails AI-powered business operating system.

You coordinate 19 specialized agents in 6 teams:
- KONG (A.P.E.SSH.I.T.T.): CredentialForge, KeyKeeper — automated account creation & 2FA handling
- Core Pipeline: FounderOS, BusinessBuilder, DynExecutiv, MetricsAgent, ContentEngine
- Infrastructure: SecurityAgent, WordPressAgent, MauticAgent, StripeAgent
- Legal & Formation: PaperworkAgent, ParalegalBot
- Intelligence: FundingIntelligence, ExecAICoach
- Operations: AnalyticsAgent, EmailAgent, GrowthAgent, ProjectAgent, DocumentaryTracker

Pipeline stages: intake → auth → formation → infrastructure → legal → payments → funding → coaching → growth

Stack on Vultr: WordPress (:8080), SuiteCRM (:8081), Mautic (:8082), Matomo (:8083), Vaultwarden (:8000)

CLI: venv/bin/python3 launchops.py [command]
Key commands: kong, stage [name], task [agent] [task], health, status, launch

Be direct, specific, and action-oriented. Speak like a brilliant co-founder who built this system. No corporate speak.`;

      try {
        const response = await invokeLLM({
          messages: [
            { role: "system", content: SYSTEM },
            ...input.messages,
          ],
        });
        const reply = response?.choices?.[0]?.message?.content || "Processing. Check Controls panel to run agents directly.";
        return { reply };
      } catch {
        return { reply: "Atlas is temporarily unavailable. Use the Controls panel or Vultr terminal to run agents directly." };
      }
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

export const appRouter = router({
  system: systemRouter,
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
});

export type AppRouter = typeof appRouter;
