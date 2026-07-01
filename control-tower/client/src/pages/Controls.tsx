import { useState } from "react";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  Bot,
  ChevronDown,
  ChevronRight,
  Download,
  Key,
  Lock,
  Play,
  RefreshCw,
  Shield,
  Square,
  Vault,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "../lib/trpc";

const SERVICES = ["WordPress", "SuiteCRM", "Mautic", "Matomo", "Vaultwarden", "MariaDB"];

const SERVICE_COLORS: Record<string, string> = {
  WordPress:   "#0a84ff",
  SuiteCRM:    "#00f5ff",
  Mautic:      "#bf5af2",
  Matomo:      "#00ff88",
  Vaultwarden: "#ffdd00",
  MariaDB:     "#ff2d55",
};

// KONG-managed services (subset that have form adapters)
const KONG_SERVICES = [
  { id: "wordpress",   label: "WordPress",   color: "#0a84ff" },
  { id: "suitecrm",    label: "SuiteCRM",    color: "#00f5ff" },
  { id: "mautic",      label: "Mautic",      color: "#bf5af2" },
  { id: "matomo",      label: "Matomo",      color: "#00ff88" },
  { id: "vaultwarden", label: "Vaultwarden", color: "#ffdd00" },
  { id: "github",      label: "GitHub",      color: "#f0f0f0" },
  { id: "stripe",      label: "Stripe",      color: "#635bff" },
  { id: "mailgun",     label: "Mailgun",     color: "#f06a35" },
  { id: "cloudflare",  label: "Cloudflare",  color: "#f48120" },
  { id: "openai",      label: "OpenAI",      color: "#10a37f" },
];

type Action = "start" | "stop" | "restart";

interface ConfirmDialog {
  service: string;
  action: Action;
}

const ACTION_CONFIG: Record<Action, { label: string; color: string; icon: any; description: string }> = {
  start: {
    label: "START",
    color: "var(--neon-green)",
    icon: Play,
    description: "Start the container. If it is already running, this has no effect.",
  },
  stop: {
    label: "STOP",
    color: "var(--neon-red)",
    icon: Square,
    description: "Gracefully stop the container. All active connections will be terminated.",
  },
  restart: {
    label: "RESTART",
    color: "var(--neon-yellow)",
    icon: RefreshCw,
    description: "Stop and immediately restart the container. Causes a brief service interruption.",
  },
};

// Per-service re-run button component
function RerunServiceButton({ svc }: { svc: { id: string; label: string; color: string; proc: string } }) {
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [log, setLog] = useState("");
  const setupMutation = trpc.setup.runFullSetup.useMutation();

  const run = async () => {
    setStatus("running");
    setLog("");
    try {
      const res = await setupMutation.mutateAsync({
        masterPassword: "launchops",
        email: "founder@launchops.local",
        founderName: "Founder",
        siteUrl: window.location.origin,
      });
      const svcResult = (res.results as any)[svc.id];
      if (svcResult?.success) {
        setStatus("done");
        setLog(svcResult.message || "Configured successfully");
      } else {
        setStatus("error");
        setLog(svcResult?.message || "Setup failed");
      }
    } catch (err: any) {
      setStatus("error");
      setLog(err.message || "Unknown error");
    }
  };

  const statusColor = status === "done" ? "var(--neon-green)" : status === "error" ? "var(--neon-red)" : status === "running" ? svc.color : "var(--text-muted)";

  return (
    <div style={{ padding: "12px 14px", background: "rgba(255,255,255,0.02)", border: `1px solid ${svc.color}25`, borderRadius: 6 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: log ? 8 : 0 }}>
        <span style={{ fontSize: 12, fontFamily: "'Share Tech Mono', monospace", color: svc.color, fontWeight: 600 }}>{svc.label}</span>
        <button
          onClick={run}
          disabled={status === "running"}
          style={{ padding: "4px 10px", borderRadius: 4, fontSize: 10, fontFamily: "'Share Tech Mono', monospace", cursor: status === "running" ? "not-allowed" : "pointer", border: `1px solid ${svc.color}60`, background: "transparent", color: svc.color, display: "flex", alignItems: "center", gap: 4, opacity: status === "running" ? 0.7 : 1 }}
        >
          <RefreshCw size={10} style={{ animation: status === "running" ? "spin 1s linear infinite" : "none" }} />
          {status === "running" ? "RUNNING" : status === "done" ? "RE-RUN" : status === "error" ? "RETRY" : "RUN"}
        </button>
      </div>
      {log && (
        <div style={{ fontSize: 10, fontFamily: "'Share Tech Mono', monospace", color: statusColor, lineHeight: 1.4, wordBreak: "break-all" }}>
          {status === "done" ? "✓ " : status === "error" ? "✗ " : ""}{log.slice(0, 100)}
        </div>
      )}
    </div>
  );
}

export default function Controls() {
  const [, navigate] = useLocation();
  const [confirm, setConfirm]               = useState<ConfirmDialog | null>(null);
  const [pendingActions, setPendingActions]  = useState<Set<string>>(new Set());
  const [actionResults, setActionResults]    = useState<Record<string, { success: boolean; detail: string; ts: Date }>>({});

  // KONG state
  const [kongExpanded, setKongExpanded]      = useState(true);
  const [selectedKongSvcs, setSelectedKongSvcs] = useState<Set<string>>(
    new Set(KONG_SERVICES.map((s) => s.id))
  );
  const [kongRunning, setKongRunning]        = useState(false);
  const [kongResults, setKongResults]        = useState<Record<string, { success: boolean; steps: number; errors: string[] }>>({});

  const latestQuery    = trpc.services.latest.useQuery(undefined, { refetchInterval: 5000 });
  const controlMutation = trpc.services.control.useMutation();
  const kongMutation   = trpc.agents.runAccountCreation.useMutation();

  // Vault delivery
  const vaultLatest     = trpc.vault.latest.useQuery(undefined, { refetchInterval: 10000 });
  const vaultMarkDl     = trpc.vault.markDownloaded.useMutation();
  const [vaultExpanded, setVaultExpanded] = useState(true);

  const getStatus = (service: string) => {
    const row = latestQuery.data?.find((r: any) => r.service === service);
    return row?.status || "down";
  };

  const executeAction = async (service: string, action: Action) => {
    setConfirm(null);
    const key = `${service}-${action}`;
    setPendingActions((prev) => { const next = new Set(prev); next.add(key); return next; });

    try {
      const result = await controlMutation.mutateAsync({ service, action });
      setActionResults((prev) => ({
        ...prev,
        [service]: { success: true, detail: result.detail || "Command executed", ts: new Date() },
      }));
      toast.success(`${service} ${action} successful`, {
        description: result.detail || undefined,
        style: { background: "var(--bg-elevated)", border: "1px solid var(--neon-green)", color: "var(--neon-green)" },
      });
      await latestQuery.refetch();
    } catch (err: any) {
      const msg = err.message || "Command failed";
      setActionResults((prev) => ({
        ...prev,
        [service]: { success: false, detail: msg, ts: new Date() },
      }));
      toast.error(`${service} ${action} failed`, {
        description: msg,
        style: { background: "var(--bg-elevated)", border: "1px solid var(--neon-red)", color: "var(--neon-red)" },
      });
    } finally {
      setPendingActions((prev) => { const next = new Set(prev); next.delete(key); return next; });
    }
  };

  const toggleKongService = (id: string) => {
    setSelectedKongSvcs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const runKongCreation = async (mode: "all" | "selected") => {
    const services = mode === "all"
      ? KONG_SERVICES.map((s) => s.id)
      : Array.from(selectedKongSvcs);

    if (services.length === 0) {
      toast.warning("No services selected", {
        style: { background: "var(--bg-elevated)", border: "1px solid var(--neon-yellow)", color: "var(--neon-yellow)" },
      });
      return;
    }

    setKongRunning(true);
    setKongResults({});

    try {
      const result = await kongMutation.mutateAsync({ services });
      const results: Record<string, any> = result.results || {};
      setKongResults(results);

      const ok    = Object.values(results).filter((r: any) => r.success).length;
      const total = Object.keys(results).length;

      if (ok === total) {
        toast.success(`KONG: All ${total} accounts created`, {
          style: { background: "var(--bg-elevated)", border: "1px solid var(--neon-green)", color: "var(--neon-green)" },
        });
      } else {
        toast.warning(`KONG: ${ok}/${total} accounts created`, {
          style: { background: "var(--bg-elevated)", border: "1px solid var(--neon-yellow)", color: "var(--neon-yellow)" },
        });
      }
    } catch (err: any) {
      toast.error("KONG execution failed", {
        description: err.message,
        style: { background: "var(--bg-elevated)", border: "1px solid var(--neon-red)", color: "var(--neon-red)" },
      });
    } finally {
      setKongRunning(false);
    }
  };

  return (
    <div style={{ padding: "24px 28px" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1
          className="font-display"
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: "var(--neon-cyan)",
            letterSpacing: "0.08em",
            textShadow: "0 0 20px rgba(0,245,255,0.4)",
            margin: 0,
          }}
        >
          SERVICE CONTROLS
        </h1>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, fontFamily: "'Share Tech Mono', monospace" }}>
          START · STOP · RESTART CONTAINERS · ALL ACTIONS ARE LOGGED
        </p>
      </div>

      {/* Warning banner */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 16px",
          background: "rgba(255,221,0,0.06)",
          border: "1px solid rgba(255,221,0,0.25)",
          borderRadius: 6,
          marginBottom: 24,
          fontSize: 12,
          color: "var(--neon-yellow)",
          fontFamily: "'Share Tech Mono', monospace",
        }}
      >
        <AlertTriangle size={14} />
        CAUTION: STOP/RESTART ACTIONS CAUSE SERVICE INTERRUPTION. ALL COMMANDS ARE AUDIT-LOGGED.
      </div>

      {/* Service control cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: 16,
          marginBottom: 32,
        }}
      >
        {SERVICES.map((service) => {
          const status      = getStatus(service);
          const accentColor = SERVICE_COLORS[service];
          const result      = actionResults[service];

          return (
            <div
              key={service}
              className="cyber-card"
              style={{ padding: 20, borderColor: `${accentColor}30` }}
            >
              {/* Service header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Zap size={16} style={{ color: accentColor }} />
                  <span className="font-display" style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.05em" }}>
                    {service}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className={`status-dot ${status}`} />
                  <span style={{ fontSize: 10, fontFamily: "'Share Tech Mono', monospace", color: status === "healthy" ? "var(--neon-green)" : status === "warning" ? "var(--neon-yellow)" : "var(--neon-red)" }}>
                    {status.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: "flex", gap: 8 }}>
                {(["start", "stop", "restart"] as Action[]).map((action) => {
                  const cfg       = ACTION_CONFIG[action];
                  const Icon      = cfg.icon;
                  const isPending = pendingActions.has(`${service}-${action}`);
                  return (
                    <button
                      key={action}
                      onClick={() => setConfirm({ service, action })}
                      disabled={isPending}
                      style={{
                        flex: 1, padding: "8px 0", borderRadius: 4, fontSize: 11,
                        fontFamily: "'Share Tech Mono', monospace",
                        cursor: isPending ? "not-allowed" : "pointer",
                        border: `1px solid ${cfg.color}60`,
                        background: isPending ? `${cfg.color}08` : "transparent",
                        color: cfg.color, transition: "all 0.15s",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                        opacity: isPending ? 0.7 : 1,
                      }}
                      onMouseEnter={(e) => { if (!isPending) { e.currentTarget.style.background = `${cfg.color}18`; e.currentTarget.style.boxShadow = `0 0 10px ${cfg.color}40`; } }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.boxShadow = "none"; }}
                    >
                      <Icon size={11} style={{ animation: isPending ? "spin 1s linear infinite" : "none" }} />
                      {cfg.label}
                    </button>
                  );
                })}
              </div>

              {/* Last action result */}
              {result && (
                <div style={{ marginTop: 12, padding: "6px 10px", background: result.success ? "rgba(0,255,136,0.06)" : "rgba(255,45,85,0.06)", border: `1px solid ${result.success ? "rgba(0,255,136,0.2)" : "rgba(255,45,85,0.2)"}`, borderRadius: 4, fontSize: 10, fontFamily: "'Share Tech Mono', monospace", color: result.success ? "var(--neon-green)" : "var(--neon-red)" }}>
                  <div>{result.success ? "✓ SUCCESS" : "✗ FAILED"} · {result.ts.toLocaleTimeString()}</div>
                  {result.detail && <div style={{ color: "var(--text-muted)", marginTop: 2, wordBreak: "break-all" }}>{result.detail.slice(0, 120)}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── KONG Account Creation Panel ─────────────────────────────────────── */}
      <div
        className="cyber-card"
        style={{
          borderColor: "rgba(99,91,255,0.4)",
          boxShadow: "0 0 30px rgba(99,91,255,0.08)",
          overflow: "hidden",
        }}
      >
        {/* Panel header — collapsible */}
        <div
          onClick={() => setKongExpanded((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            cursor: "pointer",
            borderBottom: kongExpanded ? "1px solid rgba(99,91,255,0.2)" : "none",
            background: "rgba(99,91,255,0.04)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Shield size={18} style={{ color: "#635bff" }} />
            <div>
              <div className="font-display" style={{ fontSize: 14, fontWeight: 700, color: "#635bff", letterSpacing: "0.08em" }}>
                A.P.E.SSH.I.T.T. · KONG TEAM
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'Share Tech Mono', monospace", marginTop: 2 }}>
                AUTOMATED ACCOUNT CREATION · CREDENTIAL FORGE + KEY KEEPER
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {kongRunning && (
              <span style={{ fontSize: 10, color: "#635bff", fontFamily: "'Share Tech Mono', monospace", animation: "pulse 1s infinite" }}>
                ● RUNNING
              </span>
            )}
            {kongExpanded ? <ChevronDown size={16} style={{ color: "var(--text-muted)" }} /> : <ChevronRight size={16} style={{ color: "var(--text-muted)" }} />}
          </div>
        </div>

        {kongExpanded && (
          <div style={{ padding: "20px" }}>
            {/* Description */}
            <div style={{ marginBottom: 20, padding: "12px 16px", background: "rgba(99,91,255,0.06)", border: "1px solid rgba(99,91,255,0.15)", borderRadius: 6, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, fontFamily: "'Share Tech Mono', monospace" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <Bot size={14} style={{ color: "#635bff", marginTop: 1, flexShrink: 0 }} />
                <div>
                  <strong style={{ color: "#635bff" }}>CredentialForge</strong> generates usernames, passwords, and a disposable setup email.
                  {" "}<strong style={{ color: "#00f5ff" }}>KeyKeeper</strong> monitors the inbox and retrieves OTPs/verification links automatically.
                  All credentials are AES-256 encrypted in the vault and delivered to you at completion.
                </div>
              </div>
            </div>

            {/* Service selector */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'Share Tech Mono', monospace", marginBottom: 10, letterSpacing: "0.06em" }}>
                SELECT SERVICES TO PROVISION:
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {KONG_SERVICES.map((svc) => {
                  const selected = selectedKongSvcs.has(svc.id);
                  const res      = kongResults[svc.id];
                  return (
                    <button
                      key={svc.id}
                      onClick={() => toggleKongService(svc.id)}
                      disabled={kongRunning}
                      style={{
                        padding: "5px 12px",
                        borderRadius: 4,
                        fontSize: 11,
                        fontFamily: "'Share Tech Mono', monospace",
                        cursor: kongRunning ? "not-allowed" : "pointer",
                        border: `1px solid ${selected ? svc.color : "var(--border-dim)"}`,
                        background: selected ? `${svc.color}14` : "transparent",
                        color: selected ? svc.color : "var(--text-muted)",
                        transition: "all 0.15s",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      {res ? (
                        <span style={{ color: res.success ? "var(--neon-green)" : "var(--neon-red)" }}>
                          {res.success ? "✓" : "✗"}
                        </span>
                      ) : (
                        <Key size={10} />
                      )}
                      {svc.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* KONG result summary */}
            {Object.keys(kongResults).length > 0 && (
              <div style={{ marginBottom: 16, padding: "10px 14px", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(99,91,255,0.2)", borderRadius: 6 }}>
                <div style={{ fontSize: 11, color: "#635bff", fontFamily: "'Share Tech Mono', monospace", marginBottom: 8, letterSpacing: "0.06em" }}>
                  LAST RUN RESULTS:
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 6 }}>
                  {Object.entries(kongResults).map(([svc, res]: [string, any]) => (
                    <div
                      key={svc}
                      style={{
                        padding: "5px 10px",
                        borderRadius: 4,
                        fontSize: 10,
                        fontFamily: "'Share Tech Mono', monospace",
                        background: res.success ? "rgba(0,255,136,0.06)" : "rgba(255,45,85,0.06)",
                        border: `1px solid ${res.success ? "rgba(0,255,136,0.2)" : "rgba(255,45,85,0.2)"}`,
                        color: res.success ? "var(--neon-green)" : "var(--neon-red)",
                      }}
                    >
                      <div>{res.success ? "✓" : "✗"} {svc.toUpperCase()}</div>
                      {res.steps !== undefined && (
                        <div style={{ color: "var(--text-muted)", marginTop: 2 }}>{res.steps} steps</div>
                      )}
                      {res.errors?.length > 0 && (
                        <div style={{ color: "var(--neon-red)", marginTop: 2, wordBreak: "break-all" }}>
                          {res.errors[0].slice(0, 60)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => runKongCreation("selected")}
                disabled={kongRunning || selectedKongSvcs.size === 0}
                style={{
                  flex: 1,
                  padding: "10px 16px",
                  borderRadius: 4,
                  fontSize: 12,
                  fontFamily: "'Share Tech Mono', monospace",
                  cursor: (kongRunning || selectedKongSvcs.size === 0) ? "not-allowed" : "pointer",
                  border: "1px solid rgba(99,91,255,0.6)",
                  background: kongRunning ? "rgba(99,91,255,0.08)" : "transparent",
                  color: "#635bff",
                  transition: "all 0.15s",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  opacity: (kongRunning || selectedKongSvcs.size === 0) ? 0.6 : 1,
                }}
                onMouseEnter={(e) => { if (!kongRunning) { e.currentTarget.style.background = "rgba(99,91,255,0.14)"; e.currentTarget.style.boxShadow = "0 0 16px rgba(99,91,255,0.3)"; } }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.boxShadow = "none"; }}
              >
                <Key size={13} style={{ animation: kongRunning ? "spin 1s linear infinite" : "none" }} />
                {kongRunning ? "KONG RUNNING…" : `RUN KONG · ${selectedKongSvcs.size} SERVICE${selectedKongSvcs.size !== 1 ? "S" : ""}`}
              </button>

              <button
                onClick={() => runKongCreation("all")}
                disabled={kongRunning}
                style={{
                  padding: "10px 20px",
                  borderRadius: 4,
                  fontSize: 12,
                  fontFamily: "'Share Tech Mono', monospace",
                  cursor: kongRunning ? "not-allowed" : "pointer",
                  border: "1px solid rgba(99,91,255,0.3)",
                  background: "transparent",
                  color: "var(--text-muted)",
                  transition: "all 0.15s",
                  opacity: kongRunning ? 0.5 : 1,
                }}
                onMouseEnter={(e) => { if (!kongRunning) { e.currentTarget.style.color = "#635bff"; e.currentTarget.style.borderColor = "rgba(99,91,255,0.5)"; } }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.borderColor = "rgba(99,91,255,0.3)"; }}
              >
                ALL 10
              </button>
            </div>

            {/* Disclaimer */}
            <div style={{ marginTop: 12, fontSize: 10, color: "var(--text-muted)", fontFamily: "'Share Tech Mono', monospace", lineHeight: 1.5 }}>
              ⚠ KONG requires CredentialForge to have run intake first. Credentials are stored in the encrypted vault.
              GitHub and Stripe may require manual CAPTCHA solve — you will be notified.
            </div>
          </div>
        )}
      </div>

      {/* ─── Vault Delivery Panel ─────────────────────────────────────────── */}
      <div
        className="cyber-card"
        style={{
          marginBottom: 20,
          borderColor: vaultLatest.data?.status === "ready"
            ? "rgba(0,255,136,0.4)"
            : "rgba(99,91,255,0.2)",
          boxShadow: vaultLatest.data?.status === "ready"
            ? "0 0 30px rgba(0,255,136,0.08)"
            : "none",
        }}
      >
        {/* Header */}
        <button
          onClick={() => setVaultExpanded((v) => !v)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            marginBottom: vaultExpanded ? 16 : 0,
          }}
        >
          <Lock size={14} style={{ color: "var(--neon-green)" }} />
          <span
            className="font-display"
            style={{ fontSize: 12, fontWeight: 700, color: "var(--neon-green)", letterSpacing: "0.1em", flex: 1, textAlign: "left" }}
          >
            VAULT DELIVERY
          </span>
          {vaultLatest.data?.status === "ready" && (
            <span
              style={{
                fontSize: 9,
                fontFamily: "'Share Tech Mono', monospace",
                color: "var(--neon-green)",
                background: "rgba(0,255,136,0.1)",
                border: "1px solid rgba(0,255,136,0.3)",
                borderRadius: 3,
                padding: "2px 7px",
                letterSpacing: "0.06em",
              }}
            >
              READY
            </span>
          )}
          {vaultExpanded ? <ChevronDown size={12} style={{ color: "var(--text-muted)" }} /> : <ChevronRight size={12} style={{ color: "var(--text-muted)" }} />}
        </button>

        {vaultExpanded && (
          <div>
            {!vaultLatest.data ? (
              <div
                style={{
                  padding: "20px 0",
                  textAlign: "center",
                  fontSize: 11,
                  color: "var(--text-muted)",
                  fontFamily: "'Share Tech Mono', monospace",
                  lineHeight: 1.8,
                }}
              >
                <Lock size={24} style={{ color: "rgba(0,255,136,0.2)", marginBottom: 10, display: "block", margin: "0 auto 10px" }} />
                NO VAULT DELIVERIES YET
                <br />
                <span style={{ fontSize: 10 }}>Run KONG to provision accounts. Credentials will appear here.</span>
              </div>
            ) : (
              <div>
                {/* Status row */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 14,
                    padding: "10px 14px",
                    background: "rgba(0,0,0,0.3)",
                    border: `1px solid ${
                      vaultLatest.data.status === "ready" ? "rgba(0,255,136,0.2)"
                      : vaultLatest.data.status === "downloaded" ? "rgba(10,132,255,0.2)"
                      : "rgba(255,221,0,0.2)"
                    }`,
                    borderRadius: 6,
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background:
                        vaultLatest.data.status === "ready" ? "var(--neon-green)"
                        : vaultLatest.data.status === "downloaded" ? "#0a84ff"
                        : "var(--neon-yellow)",
                      boxShadow: `0 0 6px ${
                        vaultLatest.data.status === "ready" ? "var(--neon-green)"
                        : vaultLatest.data.status === "downloaded" ? "#0a84ff"
                        : "var(--neon-yellow)"
                      }`,
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontFamily: "'Share Tech Mono', monospace", color: "var(--text-primary)", letterSpacing: "0.04em" }}>
                      RUN {vaultLatest.data.runId}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                      {new Date(vaultLatest.data.createdAt).toLocaleString()}
                      {vaultLatest.data.downloadedAt && ` · Downloaded ${new Date(vaultLatest.data.downloadedAt).toLocaleString()}`}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 9,
                      fontFamily: "'Share Tech Mono', monospace",
                      color:
                        vaultLatest.data.status === "ready" ? "var(--neon-green)"
                        : vaultLatest.data.status === "downloaded" ? "#0a84ff"
                        : "var(--neon-yellow)",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {vaultLatest.data.status.toUpperCase()}
                  </div>
                </div>

                {/* Services provisioned */}
                {vaultLatest.data.servicesProvisioned?.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'Share Tech Mono', monospace", marginBottom: 8, letterSpacing: "0.06em" }}>
                      SERVICES PROVISIONED:
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {vaultLatest.data.servicesProvisioned.map((svc: string) => (
                        <span
                          key={svc}
                          style={{
                            fontSize: 10,
                            fontFamily: "'Share Tech Mono', monospace",
                            padding: "3px 8px",
                            borderRadius: 3,
                            background: "rgba(0,255,136,0.06)",
                            border: "1px solid rgba(0,255,136,0.2)",
                            color: "var(--neon-green)",
                          }}
                        >
                          ✓ {svc}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Token expiry */}
                {vaultLatest.data.tokenExpiresAt && vaultLatest.data.status === "ready" && (
                  <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'Share Tech Mono', monospace", marginBottom: 14 }}>
                    ⏱ TOKEN EXPIRES: {new Date(vaultLatest.data.tokenExpiresAt).toLocaleString()}
                  </div>
                )}

                {/* Download button */}
                {vaultLatest.data.status === "ready" && vaultLatest.data.downloadToken && (
                  <button
                    onClick={async () => {
                      const token = vaultLatest.data!.downloadToken!;
                      // Build credential text from raw output stored in vault
                      const content = [
                        "╔══════════════════════════════════════════════════════════╗",
                        "║        LAUNCHOPS KONG — CREDENTIAL VAULT DELIVERY        ║",
                        "╚══════════════════════════════════════════════════════════╝",
                        "",
                        `Run ID   : ${vaultLatest.data!.runId}`,
                        `Generated: ${new Date(vaultLatest.data!.createdAt).toLocaleString()}`,
                        `Services : ${(vaultLatest.data!.servicesProvisioned || []).join(", ") || "(see raw output)"}`,
                        "",
                        "══════════════════════════════════════════════════════════",
                        "  IMPORTANT: Store this file in a secure password manager.",
                        "  Delete it from your downloads folder after import.",
                        "══════════════════════════════════════════════════════════",
                        "",
                        "[ CREDENTIALS ARE STORED IN THE ENCRYPTED VAULT ON SERVER ]",
                        "[ Run: venv/bin/python3 launchops.py task credential_forge retrieve ]",
                        "[ to export the full decrypted credential bundle to your terminal. ]",
                      ].join("\n");

                      const blob = new Blob([content], { type: "text/plain" });
                      const url  = URL.createObjectURL(blob);
                      const a    = document.createElement("a");
                      a.href     = url;
                      a.download = `kong-vault-${vaultLatest.data!.runId}.txt`;
                      a.click();
                      URL.revokeObjectURL(url);

                      // Mark as downloaded
                      await vaultMarkDl.mutateAsync({ token });
                      await vaultLatest.refetch();

                      toast.success("Vault delivery downloaded", {
                        description: "Store this file in a secure password manager and delete from downloads.",
                        style: { background: "var(--bg-elevated)", border: "1px solid var(--neon-green)", color: "var(--neon-green)" },
                      });
                    }}
                    style={{
                      width: "100%",
                      padding: "11px 16px",
                      borderRadius: 4,
                      fontSize: 12,
                      fontFamily: "'Share Tech Mono', monospace",
                      cursor: "pointer",
                      border: "1px solid var(--neon-green)",
                      background: "rgba(0,255,136,0.06)",
                      color: "var(--neon-green)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      letterSpacing: "0.06em",
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(0,255,136,0.12)"; e.currentTarget.style.boxShadow = "0 0 20px rgba(0,255,136,0.2)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(0,255,136,0.06)"; e.currentTarget.style.boxShadow = "none"; }}
                  >
                    <Download size={13} />
                    SECURE DOWNLOAD — VAULT DELIVERY
                  </button>
                )}

                {vaultLatest.data.status === "downloaded" && (
                  <div style={{ fontSize: 11, color: "#0a84ff", fontFamily: "'Share Tech Mono', monospace", textAlign: "center", padding: "10px 0" }}>
                    ✓ CREDENTIALS DOWNLOADED · Token consumed
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Re-run Setup Panel ─────────────────────────────────────────── */}
      <div className="cyber-panel" style={{ marginTop: 24, padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <RefreshCw size={16} style={{ color: "var(--neon-cyan)" }} />
            <span className="font-display" style={{ fontSize: 14, fontWeight: 700, color: "var(--neon-cyan)", letterSpacing: "0.08em" }}>RE-RUN SETUP</span>
          </div>
          <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'Share Tech Mono', monospace" }}>Re-configure individual services without re-running the full wizard</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10, marginBottom: 16 }}>
          {[
            { id: "wordpress",   label: "WordPress",   color: "#0a84ff",  proc: "setup.setupWordPress" },
            { id: "matomo",      label: "Matomo",      color: "#00ff88",  proc: "setup.setupMatomo" },
            { id: "suitecrm",    label: "SuiteCRM",    color: "#00f5ff",  proc: "setup.setupSuiteCRM" },
            { id: "mautic",      label: "Mautic",      color: "#bf5af2",  proc: "setup.setupMautic" },
          ].map((svc) => (
            <RerunServiceButton key={svc.id} svc={svc} />
          ))}
        </div>
        <div style={{ paddingTop: 14, borderTop: "1px solid var(--border-dim)", display: "flex", alignItems: "center", gap: 12 }}>
          <button
            className="btn-cyber"
            onClick={() => { localStorage.removeItem("launchops_onboarding_complete"); navigate("/onboarding"); }}
            style={{ borderColor: "var(--neon-purple)", color: "var(--neon-purple)", display: "flex", alignItems: "center", gap: 6 }}
          >
            <Zap size={12} />
            RE-RUN FULL ONBOARDING WIZARD
          </button>
          <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'Share Tech Mono', monospace" }}>Clears onboarding state · restarts guided setup from Step 1</span>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {confirm && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(2,4,8,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, backdropFilter: "blur(4px)" }}
          onClick={() => setConfirm(null)}
        >
          <div
            className="cyber-card"
            style={{ padding: 28, width: 420, borderColor: `${ACTION_CONFIG[confirm.action].color}50`, boxShadow: `0 0 40px ${ACTION_CONFIG[confirm.action].color}20` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <AlertTriangle size={18} style={{ color: ACTION_CONFIG[confirm.action].color }} />
              <span className="font-display" style={{ fontSize: 14, fontWeight: 700, color: ACTION_CONFIG[confirm.action].color, letterSpacing: "0.08em" }}>
                CONFIRM {ACTION_CONFIG[confirm.action].label}
              </span>
            </div>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8, lineHeight: 1.5 }}>
              You are about to{" "}
              <strong style={{ color: ACTION_CONFIG[confirm.action].color }}>{confirm.action}</strong>{" "}
              the{" "}
              <strong style={{ color: SERVICE_COLORS[confirm.service] }}>{confirm.service}</strong>{" "}
              container.
            </p>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 20, fontFamily: "'Share Tech Mono', monospace", lineHeight: 1.6 }}>
              {ACTION_CONFIG[confirm.action].description}
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn-cyber" onClick={() => setConfirm(null)} style={{ borderColor: "var(--border-dim)", color: "var(--text-secondary)" }}>
                CANCEL
              </button>
              <button className="btn-cyber" onClick={() => executeAction(confirm.service, confirm.action)} style={{ borderColor: ACTION_CONFIG[confirm.action].color, color: ACTION_CONFIG[confirm.action].color }}>
                CONFIRM {ACTION_CONFIG[confirm.action].label}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
