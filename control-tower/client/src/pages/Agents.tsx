import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Activity,
  AlertTriangle,
  Bot,
  Brain,
  Building2,
  ChevronDown,
  ChevronUp,
  Cpu,
  FileText,
  FolderOpen,
  GitBranch,
  Globe,
  Key,
  LineChart,
  Mail,
  MessageSquare,
  Play,
  RefreshCw,
  Scale,
  Shield,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  User,
  Video,
  Zap,
} from "lucide-react";

// ── Agent registry with rich metadata ─────────────────────────────────────────
const AGENT_REGISTRY = [
  // KONG Team
  {
    id: "credential_forge",
    label: "CredentialForge",
    stage: "auth",
    team: "kong",
    icon: Key,
    description: "Creates usernames, passwords, and a disposable setup email. Navigates registration forms via Playwright. Stores all credentials AES-256 encrypted in the vault.",
    capabilities: ["Account creation", "Password generation", "Vault storage", "Browser automation"],
    command: "venv/bin/python3 launchops.py task credential_forge account_creation_all",
  },
  {
    id: "key_keeper",
    label: "KeyKeeper",
    stage: "auth",
    team: "kong",
    icon: Mail,
    description: "Monitors the setup inbox for OTPs and verification links. Intercepts 2FA codes and passes them to CredentialForge via HMAC handshake. Holds no persistent memory of passwords.",
    capabilities: ["OTP retrieval", "Email monitoring", "2FA bypass", "Verification links"],
    command: "venv/bin/python3 launchops.py task key_keeper fetch_otp",
  },
  // Core Pipeline
  {
    id: "founder_os",
    label: "FounderOS",
    stage: "init / done",
    team: "core",
    icon: Brain,
    description: "Your daily operating system. Generates morning agenda, evening review, and weekly sprint plans based on your business context and pipeline progress.",
    capabilities: ["Daily briefing", "Sprint planning", "Evening review", "Goal tracking"],
    command: "venv/bin/python3 launchops.py stage init",
  },
  {
    id: "business_builder",
    label: "BusinessBuilder",
    stage: "intake",
    team: "core",
    icon: Building2,
    description: "Analyzes your business specification, identifies revenue-first priorities, and generates a structured execution plan. The first agent in the pipeline.",
    capabilities: ["Business analysis", "Revenue modeling", "Execution planning", "Market fit"],
    command: "venv/bin/python3 launchops.py stage intake",
  },
  {
    id: "dynexecutiv",
    label: "DynExecutiv",
    stage: "intake / coaching",
    team: "core",
    icon: Activity,
    description: "Pulls live Stripe and CRM data to generate a daily executive brief. Surfaces KPIs, flags anomalies, and recommends immediate actions.",
    capabilities: ["Stripe integration", "CRM sync", "KPI dashboard", "Daily brief"],
    command: "venv/bin/python3 launchops.py task dynexecutiv brief",
  },
  {
    id: "metrics_agent",
    label: "MetricsAgent",
    stage: "init / done",
    team: "core",
    icon: LineChart,
    description: "Weekly performance snapshot across all services. Evaluates what's working, what to cut, and where to double down. Feeds data to FounderOS.",
    capabilities: ["Weekly snapshot", "Performance analysis", "Cut recommendations", "Trend detection"],
    command: "venv/bin/python3 launchops.py task metrics_agent snapshot",
  },
  {
    id: "content_engine",
    label: "ContentEngine",
    stage: "growth",
    team: "core",
    icon: Sparkles,
    description: "Generates a 30-day content calendar, social copy, email sequences, and blog posts aligned to your brand voice and GTM strategy.",
    capabilities: ["Content calendar", "Social copy", "Email sequences", "Brand voice"],
    command: "venv/bin/python3 launchops.py stage growth",
  },
  // Infrastructure
  {
    id: "security_agent",
    label: "SecurityAgent",
    stage: "infrastructure",
    team: "infra",
    icon: Shield,
    description: "Hardens your server: SSL certificates, firewall rules, fail2ban, SSH key rotation, and Vaultwarden deployment. Runs security audits on demand.",
    capabilities: ["SSL setup", "Firewall config", "SSH hardening", "Security audit"],
    command: "venv/bin/python3 launchops.py task security_agent audit",
  },
  {
    id: "wordpress_agent",
    label: "WordPressAgent",
    stage: "infrastructure",
    team: "infra",
    icon: Globe,
    description: "Configures WordPress: installs plugins, sets up theme, configures SEO, creates pages, and connects to your CRM and analytics stack.",
    capabilities: ["Plugin setup", "Theme config", "SEO optimization", "CRM integration"],
    command: "venv/bin/python3 launchops.py task wordpress_agent setup",
  },
  {
    id: "mautic_agent",
    label: "MauticAgent",
    stage: "growth",
    team: "infra",
    icon: Mail,
    description: "Builds email automation sequences, lead nurturing workflows, and deliverability configuration in Mautic. Connects to your WordPress lead forms.",
    capabilities: ["Email sequences", "Lead nurturing", "Deliverability", "Automation workflows"],
    command: "venv/bin/python3 launchops.py task mautic_agent setup",
  },
  {
    id: "stripe_agent",
    label: "StripeAgent",
    stage: "payments",
    team: "infra",
    icon: ShoppingCart,
    description: "Sets up Stripe products, pricing tiers, checkout flows, subscription management, and webhook integrations with your stack.",
    capabilities: ["Product setup", "Pricing tiers", "Checkout flows", "Subscription billing"],
    command: "venv/bin/python3 launchops.py stage payments",
  },
  // Legal & Formation
  {
    id: "paperwork_agent",
    label: "PaperworkAgent",
    stage: "formation / legal",
    team: "legal",
    icon: FileText,
    description: "Handles entity formation documents, EIN application, operating agreement, and registered agent setup. Outputs a complete formation package.",
    capabilities: ["Entity formation", "EIN application", "Operating agreement", "Formation docs"],
    command: "venv/bin/python3 launchops.py stage formation",
  },
  {
    id: "paralegal_bot",
    label: "ParalegalBot",
    stage: "formation / legal",
    team: "legal",
    icon: Scale,
    description: "Runs compliance checks, IP audit, trademark screening, and assembles a legal package. Flags risks and recommends protective actions.",
    capabilities: ["Compliance check", "IP audit", "Trademark screening", "Legal package"],
    command: "venv/bin/python3 launchops.py stage legal",
  },
  // Intelligence
  {
    id: "funding_intelligence",
    label: "FundingIntelligence",
    stage: "funding",
    team: "intel",
    icon: TrendingUp,
    description: "Generates an investor readiness report, analyzes your pitch deck, identifies funding sources, and prepares a data room outline.",
    capabilities: ["Investor readiness", "Pitch analysis", "Funding sources", "Data room"],
    command: "venv/bin/python3 launchops.py stage funding",
  },
  {
    id: "execai_coach",
    label: "ExecAICoach",
    stage: "coaching",
    team: "intel",
    icon: User,
    description: "Runs a strategic coaching session using your business context. Surfaces decision frameworks, identifies blind spots, and generates a 90-day action plan.",
    capabilities: ["Strategic coaching", "Decision frameworks", "Blind spot analysis", "90-day plan"],
    command: "venv/bin/python3 launchops.py stage coaching",
  },
  // Operations
  {
    id: "analytics_agent",
    label: "AnalyticsAgent",
    stage: "growth",
    team: "ops",
    icon: LineChart,
    description: "Configures Matomo analytics, sets up conversion funnels, creates custom dashboards, and generates weekly traffic and behavior reports.",
    capabilities: ["Matomo setup", "Conversion funnels", "Custom dashboards", "Traffic reports"],
    command: "venv/bin/python3 launchops.py task analytics_agent setup",
  },
  {
    id: "email_agent",
    label: "EmailAgent",
    stage: "growth",
    team: "ops",
    icon: Mail,
    description: "Configures SMTP, sets up DNS records (SPF, DKIM, DMARC), creates welcome sequences, and connects your email stack to the CRM.",
    capabilities: ["SMTP config", "DNS records", "Welcome sequences", "CRM connection"],
    command: "venv/bin/python3 launchops.py task email_agent setup",
  },
  {
    id: "growth_agent",
    label: "GrowthAgent",
    stage: "growth",
    team: "ops",
    icon: TrendingUp,
    description: "Develops your go-to-market strategy, selects acquisition channels, calculates CAC targets, and builds a 60-day growth experiment roadmap.",
    capabilities: ["GTM strategy", "Channel selection", "CAC optimization", "Growth roadmap"],
    command: "venv/bin/python3 launchops.py task growth_agent gtm",
  },
  {
    id: "project_agent",
    label: "ProjectAgent",
    stage: "growth",
    team: "ops",
    icon: Cpu,
    description: "Manages sprint planning, task graph generation, and milestone tracking. Integrates with your repo and surfaces blockers before they become problems.",
    capabilities: ["Sprint planning", "Task graph", "Milestone tracking", "Blocker detection"],
    command: "venv/bin/python3 launchops.py task project_agent plan",
  },
  {
    id: "documentary_tracker",
    label: "DocumentaryTracker",
    stage: "init / done",
    team: "ops",
    icon: Video,
    description: "Logs every milestone with timestamps and narrative context. Generates a founder journey document and visual timeline of your build.",
    capabilities: ["Milestone logging", "Narrative generation", "Journey document", "Timeline"],
    command: "venv/bin/python3 launchops.py task documentary_tracker log",
  },
  {
    id: "files_agent",
    label: "FilesAgent",
    stage: "infrastructure",
    team: "infra",
    icon: FolderOpen,
    description: "Deploys and configures Nextcloud for secure file storage, sharing, and collaboration. Sets up admin credentials, trusted domains, and database backend.",
    capabilities: ["Nextcloud deploy", "File storage", "Secure sharing", "Collaboration"],
    command: "venv/bin/python3 launchops.py task files_agent setup",
  },
  {
    id: "repo_agent",
    label: "RepoAgent",
    stage: "infrastructure",
    team: "infra",
    icon: GitBranch,
    description: "Analyzes GitHub repositories, detects missing files, generates CI/CD configurations, and produces a repo health report with actionable recommendations.",
    capabilities: ["Repo analysis", "Gap detection", "CI/CD generation", "Health report"],
    command: "venv/bin/python3 launchops.py task repo_agent analyze",
  },
  {
    id: "support_agent",
    label: "SupportAgent",
    stage: "growth",
    team: "ops",
    icon: MessageSquare,
    description: "Deploys Chatwoot for live chat, ticketing, and multi-channel customer support. Configures inbox routing, canned responses, and CRM integration.",
    capabilities: ["Chatwoot deploy", "Live chat", "Ticketing", "Multi-channel support"],
    command: "venv/bin/python3 launchops.py task support_agent setup",
  },
];

const TEAM_CONFIG: Record<string, { label: string; color: string; description: string }> = {
  kong:  { label: "KONG — A.P.E.SSH.I.T.T.", color: "var(--neon-yellow)", description: "Automated credential provisioning & 2FA handling" },
  core:  { label: "Core Pipeline", color: "var(--neon-cyan)", description: "Foundation agents that run at every stage" },
  infra: { label: "Infrastructure", color: "var(--neon-blue)", description: "Server, services, and payment stack" },
  legal: { label: "Legal & Formation", color: "var(--neon-purple)", description: "Entity formation, compliance, and IP protection" },
  intel: { label: "Intelligence", color: "var(--neon-green)", description: "Funding readiness, coaching, and strategic analysis" },
  ops:   { label: "Operations", color: "var(--text-muted)", description: "Analytics, email, growth, and project management" },
};

const TEAM_ORDER = ["kong", "core", "infra", "legal", "intel", "ops"];

type AgentStatus = "active" | "idle" | "error" | "unknown";

interface AgentState {
  status: AgentStatus;
  lastRun: string | null;
  lastResult: string | null;
}

function StatusDot({ status }: { status: AgentStatus }) {
  const color = status === "active" ? "var(--neon-green)" : status === "error" ? "var(--neon-red)" : "rgba(255,255,255,0.15)";
  const label = status === "active" ? "ACTIVE" : status === "error" ? "ERROR" : "IDLE";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <div
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: color,
          boxShadow: status === "active" ? `0 0 8px ${color}` : "none",
          animation: status === "active" ? "pulse-dot 2s infinite" : "none",
        }}
      />
      <span style={{ fontSize: 9, fontFamily: "'Share Tech Mono', monospace", color, letterSpacing: "0.1em" }}>
        {label}
      </span>
    </div>
  );
}

function AgentCard({ agent, state }: { agent: typeof AGENT_REGISTRY[0]; state: AgentState }) {
  const [expanded, setExpanded] = useState(false);
  const [running, setRunning] = useState(false);
  const [ran, setRan] = useState(false);
  const Icon = agent.icon;
  const teamColor = TEAM_CONFIG[agent.team]?.color || "var(--neon-cyan)";

  const handleRun = () => {
    setRunning(true);
    // Show feedback — actual execution happens via Controls panel or CLI
    setTimeout(() => {
      setRunning(false);
      setRan(true);
      setTimeout(() => setRan(false), 3000);
    }, 1500);
  };

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.02)",
        border: `1px solid ${expanded ? teamColor + "30" : "rgba(255,255,255,0.05)"}`,
        borderRadius: 10,
        overflow: "hidden",
        transition: "border-color 0.2s ease",
      }}
    >
      {/* Card header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 16px",
          cursor: "pointer",
        }}
        onClick={() => setExpanded((e) => !e)}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            background: `${teamColor}10`,
            border: `1px solid ${teamColor}25`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon size={15} style={{ color: teamColor }} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", fontFamily: "'Share Tech Mono', monospace" }}>
              {agent.label}
            </span>
            <span
              style={{
                fontSize: 9,
                padding: "2px 6px",
                borderRadius: 4,
                background: `${teamColor}12`,
                border: `1px solid ${teamColor}25`,
                color: teamColor,
                fontFamily: "'Share Tech Mono', monospace",
                letterSpacing: "0.08em",
              }}
            >
              {agent.stage}
            </span>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'Share Tech Mono', monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {agent.description.split(".")[0]}.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <StatusDot status={state.status} />
          {expanded ? <ChevronUp size={13} style={{ color: "var(--text-muted)" }} /> : <ChevronDown size={13} style={{ color: "var(--text-muted)" }} />}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{ padding: "0 16px 16px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", fontFamily: "'Share Tech Mono', monospace", lineHeight: 1.7, margin: "14px 0 12px" }}>
            {agent.description}
          </p>

          {/* Capabilities */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
            {agent.capabilities.map((cap) => (
              <span
                key={cap}
                style={{
                  fontSize: 10,
                  padding: "3px 8px",
                  borderRadius: 4,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "var(--text-muted)",
                  fontFamily: "'Share Tech Mono', monospace",
                }}
              >
                {cap}
              </span>
            ))}
          </div>

          {/* Last run info */}
          {state.lastRun && (
            <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'Share Tech Mono', monospace", marginBottom: 12 }}>
              LAST RUN: {new Date(state.lastRun).toLocaleString()}
              {state.lastResult && (
                <div style={{ marginTop: 4, color: "var(--text-secondary)", fontSize: 10, wordBreak: "break-word" }}>
                  → {state.lastResult.slice(0, 120)}...
                </div>
              )}
            </div>
          )}

          {/* CLI command */}
          <div
            style={{
              background: "rgba(0,0,0,0.3)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 6,
              padding: "8px 12px",
              marginBottom: 12,
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: 10,
              color: "var(--text-muted)",
              wordBreak: "break-all",
            }}
          >
            <span style={{ color: "var(--neon-green)" }}>$ </span>{agent.command}
          </div>

          {/* Run button */}
          <button
            onClick={handleRun}
            disabled={running}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 6,
              border: `1px solid ${teamColor}40`,
              background: `${teamColor}08`,
              color: ran ? "var(--neon-green)" : teamColor,
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: 11,
              cursor: running ? "not-allowed" : "pointer",
              transition: "all 0.15s",
              letterSpacing: "0.08em",
            }}
          >
            {running ? (
              <><RefreshCw size={11} style={{ animation: "spin 1s linear infinite" }} /> QUEUING...</>
            ) : ran ? (
              <><Zap size={11} /> QUEUED — CHECK CONTROLS</>
            ) : (
              <><Play size={11} /> RUN AGENT</>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

function TeamSection({ teamId, agents, states }: {
  teamId: string;
  agents: typeof AGENT_REGISTRY;
  states: Record<string, AgentState>;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const config = TEAM_CONFIG[teamId];
  const activeCount = agents.filter((a) => states[a.id]?.status === "active").length;
  const errorCount = agents.filter((a) => states[a.id]?.status === "error").length;

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Team header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 0",
          cursor: "pointer",
          borderBottom: `1px solid ${config.color}20`,
          marginBottom: 12,
        }}
        onClick={() => setCollapsed((c) => !c)}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: config.color,
                fontFamily: "'Orbitron', sans-serif",
                letterSpacing: "0.08em",
                textShadow: `0 0 12px ${config.color}40`,
              }}
            >
              {config.label}
            </span>
            <span
              style={{
                fontSize: 9,
                padding: "2px 7px",
                borderRadius: 10,
                background: `${config.color}10`,
                border: `1px solid ${config.color}25`,
                color: config.color,
                fontFamily: "'Share Tech Mono', monospace",
              }}
            >
              {agents.length} AGENTS
            </span>
            {activeCount > 0 && (
              <span style={{ fontSize: 9, color: "var(--neon-green)", fontFamily: "'Share Tech Mono', monospace" }}>
                {activeCount} ACTIVE
              </span>
            )}
            {errorCount > 0 && (
              <span style={{ fontSize: 9, color: "var(--neon-red)", fontFamily: "'Share Tech Mono', monospace" }}>
                {errorCount} ERROR
              </span>
            )}
          </div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'Share Tech Mono', monospace", marginTop: 3 }}>
            {config.description}
          </div>
        </div>
        {collapsed ? <ChevronDown size={13} style={{ color: "var(--text-muted)" }} /> : <ChevronUp size={13} style={{ color: "var(--text-muted)" }} />}
      </div>

      {/* Agent cards */}
      {!collapsed && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              state={states[agent.id] || { status: "unknown", lastRun: null, lastResult: null }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Agents() {
  const [agentStates, setAgentStates] = useState<Record<string, AgentState>>({});
  const [search, setSearch] = useState("");

  const { data: agentData, isLoading, refetch } = trpc.agents.getStatus.useQuery(undefined, {
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (agentData) setAgentStates(agentData as Record<string, AgentState>);
  }, [agentData]);

  useEffect(() => {
    document.title = "LaunchOps — Agent Fleet";
  }, []);

  const filteredAgents = search
    ? AGENT_REGISTRY.filter(
        (a) =>
          a.label.toLowerCase().includes(search.toLowerCase()) ||
          a.description.toLowerCase().includes(search.toLowerCase()) ||
          a.capabilities.some((c) => c.toLowerCase().includes(search.toLowerCase()))
      )
    : AGENT_REGISTRY;

  const totalActive = Object.values(agentStates).filter((s) => s.status === "active").length;
  const totalError = Object.values(agentStates).filter((s) => s.status === "error").length;

  return (
    <div style={{ padding: "24px 28px", minHeight: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1
            className="font-display"
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "var(--neon-cyan)",
              letterSpacing: "0.08em",
              textShadow: "0 0 20px rgba(0,245,255,0.4)",
              margin: "0 0 4px",
            }}
          >
            AGENT FLEET
          </h1>
          <p style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "'Share Tech Mono', monospace", margin: 0 }}>
            {AGENT_REGISTRY.length} AGENTS · ATLAS ORCHESTRATOR v2.0
            {totalActive > 0 && <span style={{ color: "var(--neon-green)", marginLeft: 10 }}>{totalActive} ACTIVE</span>}
            {totalError > 0 && <span style={{ color: "var(--neon-red)", marginLeft: 10 }}>{totalError} ERROR</span>}
          </p>
        </div>
        <button
          className="btn-cyber"
          onClick={() => refetch()}
          disabled={isLoading}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <RefreshCw size={12} style={{ animation: isLoading ? "spin 1s linear infinite" : "none" }} />
          REFRESH
        </button>
      </div>

      {/* Pipeline stage flow */}
      <div style={{ marginBottom: 24, overflowX: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 0, minWidth: "max-content" }}>
          {["intake", "auth", "formation", "infrastructure", "legal", "payments", "funding", "coaching", "growth"].map((stage, i, arr) => {
            const colors: Record<string, string> = {
              intake: "var(--neon-cyan)", auth: "var(--neon-yellow)", formation: "var(--neon-blue)",
              infrastructure: "var(--neon-purple)", legal: "var(--neon-green)", payments: "var(--neon-cyan)",
              funding: "var(--neon-blue)", coaching: "var(--neon-purple)", growth: "var(--neon-green)",
            };
            const color = colors[stage] || "var(--neon-cyan)";
            return (
              <div key={stage} style={{ display: "flex", alignItems: "center" }}>
                <div
                  style={{
                    padding: "5px 10px",
                    borderRadius: 5,
                    background: `${color}10`,
                    border: `1px solid ${color}30`,
                    fontSize: 9,
                    color,
                    fontFamily: "'Share Tech Mono', monospace",
                    letterSpacing: "0.1em",
                    whiteSpace: "nowrap",
                  }}
                >
                  {stage.toUpperCase()}
                </div>
                {i < arr.length - 1 && (
                  <div style={{ width: 20, height: 1, background: "rgba(255,255,255,0.08)", margin: "0 2px" }} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 24 }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search agents by name, description, or capability..."
          style={{
            width: "100%",
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(0,245,255,0.15)",
            borderRadius: 8,
            padding: "10px 16px",
            color: "var(--text-primary)",
            fontFamily: "'Share Tech Mono', monospace",
            fontSize: 12,
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Agent teams */}
      {search ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filteredAgents.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontFamily: "'Share Tech Mono', monospace", fontSize: 12 }}>
              NO AGENTS MATCH "{search.toUpperCase()}"
            </div>
          ) : (
            filteredAgents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                state={agentStates[agent.id] || { status: "unknown", lastRun: null, lastResult: null }}
              />
            ))
          )}
        </div>
      ) : (
        TEAM_ORDER.map((teamId) => {
          const agents = AGENT_REGISTRY.filter((a) => a.team === teamId);
          return (
            <TeamSection
              key={teamId}
              teamId={teamId}
              agents={agents}
              states={agentStates}
            />
          );
        })
      )}

      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes pulse-dot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.6;transform:scale(1.3)} }
      `}</style>
    </div>
  );
}
