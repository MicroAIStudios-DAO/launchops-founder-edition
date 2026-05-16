import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { AlertTriangle, Play, RefreshCw, Square, Zap } from "lucide-react";
import { toast } from "sonner";

const SERVICES = ["WordPress", "SuiteCRM", "Mautic", "Matomo", "Vaultwarden", "MariaDB"];

const SERVICE_COLORS: Record<string, string> = {
  WordPress: "#0a84ff",
  SuiteCRM: "#00f5ff",
  Mautic: "#bf5af2",
  Matomo: "#00ff88",
  Vaultwarden: "#ffdd00",
  MariaDB: "#ff2d55",
};

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
  const [confirm, setConfirm] = useState<ConfirmDialog | null>(null);
  const [pendingActions, setPendingActions] = useState<Set<string>>(new Set());
  const [actionResults, setActionResults] = useState<Record<string, { success: boolean; detail: string; ts: Date }>>({});

  const latestQuery = trpc.services.latest.useQuery(undefined, { refetchInterval: 5000 });
  const controlMutation = trpc.services.control.useMutation();

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
      setPendingActions((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
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
        }}
      >
        {SERVICES.map((service) => {
          const status = getStatus(service);
          const accentColor = SERVICE_COLORS[service];
          const result = actionResults[service];
          const isRunning = status === "healthy" || status === "warning";

          return (
            <div
              key={service}
              className="cyber-card"
              style={{
                padding: 20,
                borderColor: `${accentColor}30`,
              }}
            >
              {/* Service header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Zap size={16} style={{ color: accentColor }} />
                  <span
                    className="font-display"
                    style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.05em" }}
                  >
                    {service}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className={`status-dot ${status}`} />
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "'Share Tech Mono', monospace",
                      color:
                        status === "healthy"
                          ? "var(--neon-green)"
                          : status === "warning"
                          ? "var(--neon-yellow)"
                          : "var(--neon-red)",
                    }}
                  >
                    {status.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: "flex", gap: 8 }}>
                {(["start", "stop", "restart"] as Action[]).map((action) => {
                  const cfg = ACTION_CONFIG[action];
                  const Icon = cfg.icon;
                  const isPending = pendingActions.has(`${service}-${action}`);

                  return (
                    <button
                      key={action}
                      onClick={() => setConfirm({ service, action })}
                      disabled={isPending}
                      style={{
                        flex: 1,
                        padding: "8px 0",
                        borderRadius: 4,
                        fontSize: 11,
                        fontFamily: "'Share Tech Mono', monospace",
                        cursor: isPending ? "not-allowed" : "pointer",
                        border: `1px solid ${cfg.color}60`,
                        background: isPending ? `${cfg.color}08` : "transparent",
                        color: cfg.color,
                        transition: "all 0.15s",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 5,
                        opacity: isPending ? 0.7 : 1,
                      }}
                      onMouseEnter={(e) => {
                        if (!isPending) {
                          e.currentTarget.style.background = `${cfg.color}18`;
                          e.currentTarget.style.boxShadow = `0 0 10px ${cfg.color}40`;
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.boxShadow = "none";
                      }}
                    >
                      <Icon
                        size={11}
                        style={{ animation: isPending ? "spin 1s linear infinite" : "none" }}
                      />
                      {cfg.label}
                    </button>
                  );
                })}
              </div>

              {/* Last action result */}
              {result && (
                <div
                  style={{
                    marginTop: 12,
                    padding: "6px 10px",
                    background: result.success ? "rgba(0,255,136,0.06)" : "rgba(255,45,85,0.06)",
                    border: `1px solid ${result.success ? "rgba(0,255,136,0.2)" : "rgba(255,45,85,0.2)"}`,
                    borderRadius: 4,
                    fontSize: 10,
                    fontFamily: "'Share Tech Mono', monospace",
                    color: result.success ? "var(--neon-green)" : "var(--neon-red)",
                  }}
                >
                  <div>{result.success ? "✓ SUCCESS" : "✗ FAILED"} · {result.ts.toLocaleTimeString()}</div>
                  {result.detail && (
                    <div style={{ color: "var(--text-muted)", marginTop: 2, wordBreak: "break-all" }}>
                      {result.detail.slice(0, 120)}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Confirmation Dialog */}
      {confirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2,4,8,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            backdropFilter: "blur(4px)",
          }}
          onClick={() => setConfirm(null)}
        >
          <div
            className="cyber-card"
            style={{
              padding: 28,
              width: 420,
              borderColor: `${ACTION_CONFIG[confirm.action].color}50`,
              boxShadow: `0 0 40px ${ACTION_CONFIG[confirm.action].color}20`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <AlertTriangle size={18} style={{ color: ACTION_CONFIG[confirm.action].color }} />
              <span
                className="font-display"
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: ACTION_CONFIG[confirm.action].color,
                  letterSpacing: "0.08em",
                }}
              >
                CONFIRM {ACTION_CONFIG[confirm.action].label}
              </span>
            </div>

            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8, lineHeight: 1.5 }}>
              You are about to{" "}
              <strong style={{ color: ACTION_CONFIG[confirm.action].color }}>
                {confirm.action}
              </strong>{" "}
              the{" "}
              <strong style={{ color: SERVICE_COLORS[confirm.service] }}>
                {confirm.service}
              </strong>{" "}
              container.
            </p>
            <p
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                marginBottom: 20,
                fontFamily: "'Share Tech Mono', monospace",
                lineHeight: 1.6,
              }}
            >
              {ACTION_CONFIG[confirm.action].description}
            </p>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                className="btn-cyber"
                onClick={() => setConfirm(null)}
                style={{ borderColor: "var(--border-dim)", color: "var(--text-secondary)" }}
              >
                CANCEL
              </button>
              <button
                className="btn-cyber"
                onClick={() => executeAction(confirm.service, confirm.action)}
                style={{
                  borderColor: ACTION_CONFIG[confirm.action].color,
                  color: ACTION_CONFIG[confirm.action].color,
                }}
              >
                CONFIRM {ACTION_CONFIG[confirm.action].label}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
