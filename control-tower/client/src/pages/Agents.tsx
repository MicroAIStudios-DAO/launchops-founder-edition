import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";

// ── Agent definitions ──────────────────────────────────────────────────────────
const AGENT_REGISTRY = [
  // Core pipeline agents
  { id: "founder_os",              label: "FounderOS",              stage: "init / done",       team: "core",    description: "Morning agenda, evening review, weekly sprint" },
  { id: "business_builder",        label: "BusinessBuilder",        stage: "intake",            team: "core",    description: "Analyzes business spec, sets revenue-first priorities" },
  { id: "dynexecutiv",             label: "DynExecutiv",            stage: "intake / coaching", team: "core",    description: "Pulls live Stripe + CRM data, generates daily brief" },
  { id: "metrics_agent",           label: "MetricsAgent",           stage: "init / done",       team: "core",    description: "Weekly snapshot, evaluate-and-cut recommendations" },
  { id: "content_engine",          label: "ContentEngine",          stage: "growth",            team: "core",    description: "30-day content calendar, social copy generation" },
  // KONG Team — A.P.E.SSH.I.T.T.
  { id: "credential_forge",        label: "CredentialForge",        stage: "auth",              team: "kong",    description: "Creates usernames, passwords, disposable setup email" },
  { id: "key_keeper",              label: "KeyKeeper",              stage: "auth",              team: "kong",    description: "Monitors inbox, retrieves OTPs and verification links" },
  // Infrastructure
  { id: "security_agent",          label: "SecurityAgent",          stage: "infrastructure",    team: "infra",   description: "Server hardening, SSL, firewall, Vaultwarden deploy" },
  { id: "wordpress_agent",         label: "WordPressAgent",         stage: "infrastructure",    team: "infra",   description: "WordPress site setup, plugins, theme configuration" },
  { id: "mautic_agent",            label: "MauticAgent",            stage: "growth",            team: "infra",   description: "Email sequences, automation workflows, deliverability" },
  { id: "stripe_agent",            label: "StripeAgent",            stage: "payments",          team: "infra",   description: "Products, pricing, checkout, subscription setup" },
  // Legal & Formation
  { id: "paperwork_agent",         label: "PaperworkAgent",         stage: "formation / legal", team: "legal",   description: "Entity formation docs, EIN, operating agreement" },
  { id: "paralegal_bot",           label: "ParalegalBot",           stage: "formation / legal", team: "legal",   description: "Compliance checks, IP audit, legal package" },
  // Intelligence
  { id: "funding_intelligence",    label: "FundingIntelligence",    stage: "funding",           team: "intel",   description: "Investor readiness report, pitch deck analysis" },
  { id: "execai_coach",            label: "ExecAICoach",            stage: "coaching",          team: "intel",   description: "Strategic coaching session, decision frameworks" },
  // Operations
  { id: "analytics_agent",         label: "AnalyticsAgent",         stage: "growth",            team: "ops",     description: "Matomo integration, conversion funnel analysis" },
  { id: "email_agent",             label: "EmailAgent",             stage: "growth",            team: "ops",     description: "SMTP config, welcome sequences, DNS records" },
  { id: "files_agent",             label: "FilesAgent",             stage: "growth",            team: "ops",     description: "Document management, artifact storage" },
  { id: "growth_agent",            label: "GrowthAgent",            stage: "growth",            team: "ops",     description: "GTM strategy, channel selection, CAC optimization" },
  { id: "project_agent",           label: "ProjectAgent",           stage: "growth",            team: "ops",     description: "Sprint planning, task graph management" },
  { id: "repo_agent",              label: "RepoAgent",              stage: "infrastructure",    team: "ops",     description: "GitHub repo setup, CI/CD, branch strategy" },
  { id: "support_agent",           label: "SupportAgent",           stage: "done",              team: "ops",     description: "Customer support workflows, ticket routing" },
  { id: "documentary_tracker",     label: "DocumentaryTracker",     stage: "init / done",       team: "ops",     description: "Milestone logging, narrative generation" },
];

const TEAM_COLORS: Record<string, string> = {
  kong:  "var(--neon-yellow)",
  core:  "var(--neon-cyan)",
  infra: "var(--neon-blue)",
  legal: "var(--neon-purple)",
  intel: "var(--neon-green)",
  ops:   "var(--text-muted)",
};

const TEAM_LABELS: Record<string, string> = {
  kong:  "KONG — A.P.E.SSH.I.T.T.",
  core:  "Core Pipeline",
  infra: "Infrastructure",
  legal: "Legal & Formation",
  intel: "Intelligence",
  ops:   "Operations",
};

const STAGE_ORDER = ["init", "intake", "auth", "formation", "infrastructure", "legal", "payments", "funding", "coaching", "growth", "done"];

type AgentStatus = "active" | "idle" | "error" | "unknown";

interface AgentState {
  status: AgentStatus;
  lastRun: string | null;
  lastResult: string | null;
}

export default function Agents() {
  const [filter, setFilter] = useState<string>("all");
  const [agentStates, setAgentStates] = useState<Record<string, AgentState>>({});

  // Poll agent status from the server
  const { data: agentData, isLoading } = trpc.agents.getStatus.useQuery(undefined, {
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (agentData) {
      setAgentStates(agentData as Record<string, AgentState>);
    }
  }, [agentData]);

  const teams = ["all", "kong", "core", "infra", "legal", "intel", "ops"];
  const filtered = filter === "all" ? AGENT_REGISTRY : AGENT_REGISTRY.filter(a => a.team === filter);

  function getStatus(agentId: string): AgentStatus {
    return agentStates[agentId]?.status ?? "unknown";
  }

  function getLastRun(agentId: string): string {
    const lr = agentStates[agentId]?.lastRun;
    if (!lr) return "Never";
    const d = new Date(lr);
    const diff = Date.now() - d.getTime();
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString();
  }

  const statusColor: Record<AgentStatus, string> = {
    active:  "var(--neon-green)",
    idle:    "var(--neon-cyan)",
    error:   "var(--neon-red)",
    unknown: "var(--text-muted)",
  };

  const statusGlow: Record<AgentStatus, string> = {
    active:  "0 0 8px rgba(0,255,136,0.6)",
    idle:    "0 0 8px rgba(0,245,255,0.3)",
    error:   "0 0 8px rgba(255,0,85,0.6)",
    unknown: "none",
  };

  const activeCount  = Object.values(agentStates).filter(s => s.status === "active").length;
  const errorCount   = Object.values(agentStates).filter(s => s.status === "error").length;
  const idleCount    = Object.values(agentStates).filter(s => s.status === "idle").length;

  return (
    <div style={{ padding: "24px", maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1
          className="font-display"
          style={{
            fontSize: 22,
            fontWeight: 900,
            color: "var(--neon-cyan)",
            letterSpacing: "0.08em",
            textShadow: "0 0 20px rgba(0,245,255,0.4)",
            margin: 0,
          }}
        >
          ATLAS AGENT FLEET
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: 12, fontFamily: "'Share Tech Mono', monospace", marginTop: 4 }}>
          {AGENT_REGISTRY.length} agents registered · Gnoscenti Atlas Engine v2
        </p>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "TOTAL AGENTS",  value: AGENT_REGISTRY.length, color: "var(--neon-cyan)" },
          { label: "ACTIVE",        value: activeCount,            color: "var(--neon-green)" },
          { label: "IDLE",          value: idleCount,              color: "var(--neon-blue)" },
          { label: "ERRORS",        value: errorCount,             color: "var(--neon-red)" },
        ].map(card => (
          <div
            key={card.label}
            style={{
              background: "var(--bg-base)",
              border: `1px solid ${card.color}33`,
              borderRadius: 8,
              padding: "14px 16px",
            }}
          >
            <div style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "'Share Tech Mono', monospace", letterSpacing: "0.15em", marginBottom: 4 }}>
              {card.label}
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, color: card.color, fontFamily: "'Orbitron', monospace", textShadow: `0 0 12px ${card.color}66` }}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* Team filter tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {teams.map(team => (
          <button
            key={team}
            onClick={() => setFilter(team)}
            style={{
              padding: "5px 14px",
              borderRadius: 20,
              border: `1px solid ${filter === team ? (TEAM_COLORS[team] || "var(--neon-cyan)") : "var(--border-dim)"}`,
              background: filter === team ? `${TEAM_COLORS[team] || "var(--neon-cyan)"}22` : "transparent",
              color: filter === team ? (TEAM_COLORS[team] || "var(--neon-cyan)") : "var(--text-muted)",
              fontSize: 11,
              fontFamily: "'Share Tech Mono', monospace",
              cursor: "pointer",
              letterSpacing: "0.08em",
              transition: "all 0.15s ease",
            }}
          >
            {team === "all" ? "ALL AGENTS" : TEAM_LABELS[team]?.toUpperCase() || team.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Agent grid */}
      {isLoading ? (
        <div style={{ color: "var(--text-muted)", fontFamily: "'Share Tech Mono', monospace", fontSize: 12, padding: 20 }}>
          Polling agent states…
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
          {filtered.map(agent => {
            const status = getStatus(agent.id);
            const color  = TEAM_COLORS[agent.team] || "var(--text-muted)";
            const sColor = statusColor[status];
            return (
              <div
                key={agent.id}
                style={{
                  background: "var(--bg-base)",
                  border: `1px solid var(--border-dim)`,
                  borderLeft: `3px solid ${color}`,
                  borderRadius: 8,
                  padding: "14px 16px",
                  position: "relative",
                  transition: "border-color 0.2s ease",
                }}
              >
                {/* Status dot */}
                <div
                  style={{
                    position: "absolute",
                    top: 14,
                    right: 14,
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: sColor,
                    boxShadow: statusGlow[status],
                  }}
                />

                {/* Agent name */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span
                    className="font-display"
                    style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.05em" }}
                  >
                    {agent.label}
                  </span>
                  {agent.team === "kong" && (
                    <span style={{
                      fontSize: 8,
                      padding: "1px 6px",
                      borderRadius: 10,
                      background: "var(--neon-yellow)22",
                      color: "var(--neon-yellow)",
                      border: "1px solid var(--neon-yellow)44",
                      fontFamily: "'Share Tech Mono', monospace",
                      letterSpacing: "0.1em",
                    }}>
                      KONG
                    </span>
                  )}
                </div>

                {/* Description */}
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10, lineHeight: 1.5 }}>
                  {agent.description}
                </div>

                {/* Meta row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 12 }}>
                    <span style={{ fontSize: 9, color: color, fontFamily: "'Share Tech Mono', monospace", letterSpacing: "0.1em" }}>
                      STAGE: {agent.stage.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "'Share Tech Mono', monospace" }}>
                    {getLastRun(agent.id)}
                  </div>
                </div>

                {/* Status label */}
                <div style={{ marginTop: 8 }}>
                  <span style={{
                    fontSize: 9,
                    padding: "2px 8px",
                    borderRadius: 10,
                    background: `${sColor}22`,
                    color: sColor,
                    border: `1px solid ${sColor}44`,
                    fontFamily: "'Share Tech Mono', monospace",
                    letterSpacing: "0.1em",
                  }}>
                    {status.toUpperCase()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pipeline stage flow */}
      <div style={{ marginTop: 32 }}>
        <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'Share Tech Mono', monospace", letterSpacing: "0.15em", marginBottom: 12 }}>
          ATLAS PIPELINE STAGE FLOW
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 0, flexWrap: "wrap" }}>
          {STAGE_ORDER.map((stage, i) => {
            const isAuth = stage === "auth";
            return (
              <div key={stage} style={{ display: "flex", alignItems: "center" }}>
                <div style={{
                  padding: "4px 12px",
                  borderRadius: 4,
                  background: isAuth ? "var(--neon-yellow)22" : "var(--bg-base)",
                  border: `1px solid ${isAuth ? "var(--neon-yellow)" : "var(--border-dim)"}`,
                  fontSize: 9,
                  color: isAuth ? "var(--neon-yellow)" : "var(--text-muted)",
                  fontFamily: "'Share Tech Mono', monospace",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}>
                  {stage}
                  {isAuth && <span style={{ marginLeft: 4, fontSize: 7 }}>⚡KONG</span>}
                </div>
                {i < STAGE_ORDER.length - 1 && (
                  <div style={{ width: 16, height: 1, background: "var(--border-dim)", margin: "0 2px" }} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
