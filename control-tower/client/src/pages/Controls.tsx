import { trpc } from "@/lib/trpc";
import { useState } from "react";
import {
  AlertTriangle,
  Bot,
  ChevronDown,
  ChevronRight,
  Key,
  Play,
  RefreshCw,
  Shield,
  Square,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

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

export default function Controls() {
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
