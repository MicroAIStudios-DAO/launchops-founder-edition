import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { RefreshCw, Shield, AlertTriangle, CheckCircle2, XCircle, Activity, Zap, Eye } from "lucide-react";

// ─── ProofGuard Page ─────────────────────────────────────────────────────────
// Shows live attestation feed from ProofGuard API + legacy Docker audit events

type ViewMode = "attestations" | "docker-audit";

const RISK_COLORS: Record<string, string> = {
  low: "var(--neon-green)",
  medium: "var(--neon-yellow)",
  high: "#ff8c00",
  critical: "var(--neon-red)",
};

const PILLAR_COLORS: Record<string, string> = {
  "Internal Governance": "#bf5af2",
  "Human Accountability": "#0a84ff",
  "Technical Robustness": "#00ff88",
  "User Enablement": "#ffdd00",
};

const SERVICES = ["All", "WordPress", "SuiteCRM", "Mautic", "Matomo", "Vaultwarden", "MariaDB"];

const ACTION_COLORS: Record<string, string> = {
  start: "var(--neon-green)",
  stop: "var(--neon-red)",
  restart: "var(--neon-yellow)",
};

export default function AuditLog() {
  const [viewMode, setViewMode] = useState<ViewMode>("attestations");
  const [serviceFilter, setServiceFilter] = useState("All");
  const [limit, setLimit] = useState(100);

  // ProofGuard health check
  const healthQ = trpc.agents.proofguardHealth.useQuery(undefined, { refetchInterval: 30000 });

  // ProofGuard attestation feed
  const attestationsQ = trpc.agents.listAttestations.useQuery(
    { limit: 50 },
    { refetchInterval: 8000, enabled: viewMode === "attestations" }
  );

  // Legacy Docker audit events
  const auditQuery = trpc.audit.list.useQuery(
    { service: serviceFilter === "All" ? undefined : serviceFilter, limit },
    { refetchInterval: 10000, enabled: viewMode === "docker-audit" }
  );

  const health = healthQ.data;
  const attestations = attestationsQ.data?.data?.attestations || attestationsQ.data?.data || [];
  const events = auditQuery.data || [];

  return (
    <div style={{ padding: "24px 28px", height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1
            className="font-display"
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "var(--neon-cyan)",
              letterSpacing: "0.08em",
              textShadow: "0 0 20px rgba(0,245,255,0.4)",
              margin: 0,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Shield size={20} />
            PROOFGUARD
          </h1>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, fontFamily: "'Share Tech Mono', monospace" }}>
            PROOF-OF-AGENT™ ATTESTATION PLATFORM
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Connection status indicator */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "5px 12px", borderRadius: 6,
            background: health?.reachable ? "rgba(0,255,136,0.06)" : health?.configured ? "rgba(255,45,85,0.06)" : "rgba(255,221,0,0.06)",
            border: `1px solid ${health?.reachable ? "rgba(0,255,136,0.3)" : health?.configured ? "rgba(255,45,85,0.3)" : "rgba(255,221,0,0.3)"}`,
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%",
              background: health?.reachable ? "var(--neon-green)" : health?.configured ? "var(--neon-red)" : "var(--neon-yellow)",
              boxShadow: `0 0 8px ${health?.reachable ? "var(--neon-green)" : health?.configured ? "var(--neon-red)" : "var(--neon-yellow)"}`,
              animation: health?.reachable ? "pulse 2s infinite" : "none",
            }} />
            <span style={{ fontSize: 10, fontFamily: "'Share Tech Mono', monospace", color: health?.reachable ? "var(--neon-green)" : "var(--text-muted)" }}>
              {health?.reachable ? "CONNECTED" : health?.configured ? "UNREACHABLE" : "NOT CONFIGURED"}
            </span>
          </div>
          <button
            className="btn-cyber"
            onClick={() => viewMode === "attestations" ? attestationsQ.refetch() : auditQuery.refetch()}
            disabled={viewMode === "attestations" ? attestationsQ.isFetching : auditQuery.isFetching}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <RefreshCw size={12} style={{ animation: (attestationsQ.isFetching || auditQuery.isFetching) ? "spin 1s linear infinite" : "none" }} />
            REFRESH
          </button>
        </div>
      </div>

      {/* View Mode Tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 16 }}>
        <button
          onClick={() => setViewMode("attestations")}
          style={{
            padding: "8px 16px", borderRadius: "6px 6px 0 0", fontSize: 11,
            fontFamily: "'Share Tech Mono', monospace", cursor: "pointer",
            border: `1px solid ${viewMode === "attestations" ? "var(--neon-cyan)" : "var(--border-dim)"}`,
            borderBottom: viewMode === "attestations" ? "1px solid var(--bg-card)" : "1px solid var(--border-dim)",
            background: viewMode === "attestations" ? "var(--bg-card)" : "transparent",
            color: viewMode === "attestations" ? "var(--neon-cyan)" : "var(--text-muted)",
            display: "flex", alignItems: "center", gap: 6,
          }}
        >
          <Activity size={12} /> ATTESTATION FEED
        </button>
        <button
          onClick={() => setViewMode("docker-audit")}
          style={{
            padding: "8px 16px", borderRadius: "6px 6px 0 0", fontSize: 11,
            fontFamily: "'Share Tech Mono', monospace", cursor: "pointer",
            border: `1px solid ${viewMode === "docker-audit" ? "var(--neon-cyan)" : "var(--border-dim)"}`,
            borderBottom: viewMode === "docker-audit" ? "1px solid var(--bg-card)" : "1px solid var(--border-dim)",
            background: viewMode === "docker-audit" ? "var(--bg-card)" : "transparent",
            color: viewMode === "docker-audit" ? "var(--neon-cyan)" : "var(--text-muted)",
            display: "flex", alignItems: "center", gap: 6,
          }}
        >
          <Zap size={12} /> DOCKER AUDIT
        </button>
      </div>

      {/* ─── ATTESTATION FEED VIEW ─── */}
      {viewMode === "attestations" && (
        <>
          {/* Stats bar */}
          {Array.isArray(attestations) && attestations.length > 0 && (
            <div style={{ display: "flex", gap: 20, marginBottom: 14, fontSize: 11, fontFamily: "'Share Tech Mono', monospace", color: "var(--text-muted)" }}>
              <span>TOTAL: <span style={{ color: "var(--neon-cyan)" }}>{attestations.length}</span></span>
              <span style={{ color: "var(--neon-green)" }}>
                PASSED: {attestations.filter((a: any) => !a.flagged).length}
              </span>
              <span style={{ color: "var(--neon-red)" }}>
                FLAGGED: {attestations.filter((a: any) => a.flagged).length}
              </span>
              <span style={{ color: "var(--neon-yellow)" }}>
                AVG CQS: {(attestations.reduce((sum: number, a: any) => sum + (a.cqs_score || 0), 0) / attestations.length).toFixed(1)}
              </span>
            </div>
          )}

          {/* Attestation table */}
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", background: "var(--bg-card)", border: "1px solid var(--border-dim)", borderRadius: 6 }}>
            {attestationsQ.isLoading ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontFamily: "'Share Tech Mono', monospace", fontSize: 13 }}>
                LOADING ATTESTATION FEED...
              </div>
            ) : !health?.configured ? (
              <div style={{ padding: 60, textAlign: "center", color: "var(--text-muted)", fontFamily: "'Share Tech Mono', monospace", fontSize: 13 }}>
                <Shield size={32} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
                PROOFGUARD NOT CONFIGURED
                <div style={{ fontSize: 11, marginTop: 6, opacity: 0.6 }}>
                  Set PROOFGUARD_API_URL and PROOFGUARD_API_KEY environment variables
                </div>
                <div style={{ fontSize: 10, marginTop: 12, opacity: 0.5, maxWidth: 400, margin: "12px auto 0" }}>
                  ProofGuard provides Proof-of-Agent™ attestations for every pipeline agent action.
                  When configured, this feed shows real-time CQS scores, guardrail triggers, and HITL flags.
                </div>
              </div>
            ) : !health?.reachable ? (
              <div style={{ padding: 60, textAlign: "center", color: "var(--text-muted)", fontFamily: "'Share Tech Mono', monospace", fontSize: 13 }}>
                <AlertTriangle size={32} style={{ margin: "0 auto 12px", opacity: 0.5, color: "var(--neon-red)" }} />
                PROOFGUARD UNREACHABLE
                <div style={{ fontSize: 11, marginTop: 6, opacity: 0.6 }}>
                  Cannot connect to {health?.error || "ProofGuard API"}. Check that the service is running.
                </div>
              </div>
            ) : !Array.isArray(attestations) || attestations.length === 0 ? (
              <div style={{ padding: 60, textAlign: "center", color: "var(--text-muted)", fontFamily: "'Share Tech Mono', monospace", fontSize: 13 }}>
                <Shield size={32} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
                NO ATTESTATIONS YET
                <div style={{ fontSize: 11, marginTop: 6, opacity: 0.6 }}>
                  Attestations appear here when pipeline agents execute and submit Proof-of-Agent™ records.
                </div>
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--bg-elevated)", borderBottom: "1px solid var(--border-dim)", position: "sticky", top: 0, zIndex: 1 }}>
                    {["TIMESTAMP", "AGENT", "ACTION", "CQS", "RISK", "PILLAR", "BADGE", "STATUS"].map((h) => (
                      <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 10, fontFamily: "'Share Tech Mono', monospace", color: "var(--text-muted)", letterSpacing: "0.1em", fontWeight: 600 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {attestations.map((att: any, i: number) => (
                    <tr
                      key={att.attestation_id || i}
                      style={{
                        borderBottom: "1px solid var(--border-dim)",
                        background: att.flagged ? "rgba(255,45,85,0.03)" : i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)",
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,245,255,0.03)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = att.flagged ? "rgba(255,45,85,0.03)" : i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)")}
                    >
                      <td style={{ padding: "9px 14px", fontSize: 11, fontFamily: "'Share Tech Mono', monospace", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                        {att.timestamp ? new Date(att.timestamp).toLocaleString() : "—"}
                      </td>
                      <td style={{ padding: "9px 14px", fontSize: 11, fontFamily: "'Share Tech Mono', monospace", color: "var(--neon-cyan)" }}>
                        {att.agent_id || att.agent_name || "—"}
                      </td>
                      <td style={{ padding: "9px 14px", fontSize: 11, fontFamily: "'Share Tech Mono', monospace", color: "var(--text-secondary)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={att.action}>
                        {att.action || "—"}
                      </td>
                      <td style={{ padding: "9px 14px" }}>
                        <span style={{
                          fontSize: 12, fontFamily: "'Share Tech Mono', monospace", fontWeight: 700,
                          color: (att.cqs_score || 0) >= 80 ? "var(--neon-green)" : (att.cqs_score || 0) >= 60 ? "var(--neon-yellow)" : "var(--neon-red)",
                        }}>
                          {att.cqs_score != null ? att.cqs_score.toFixed(1) : "—"}
                        </span>
                      </td>
                      <td style={{ padding: "9px 14px" }}>
                        <span style={{
                          fontSize: 10, fontFamily: "'Share Tech Mono', monospace",
                          color: RISK_COLORS[att.risk_tier] || "var(--text-muted)",
                          background: `${RISK_COLORS[att.risk_tier] || "var(--text-muted)"}15`,
                          border: `1px solid ${RISK_COLORS[att.risk_tier] || "var(--text-muted)"}40`,
                          borderRadius: 3, padding: "2px 8px", letterSpacing: "0.08em",
                        }}>
                          {(att.risk_tier || "—").toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: "9px 14px" }}>
                        <span style={{
                          fontSize: 10, fontFamily: "'Share Tech Mono', monospace",
                          color: PILLAR_COLORS[att.imda_pillar] || "var(--text-muted)",
                        }}>
                          {att.imda_pillar || "—"}
                        </span>
                      </td>
                      <td style={{ padding: "9px 14px" }}>
                        {att.badge ? (
                          <span style={{
                            fontSize: 9, fontFamily: "'Share Tech Mono', monospace", fontWeight: 700,
                            color: att.badge.level === "gold" ? "#ffd700" : att.badge.level === "silver" ? "#c0c0c0" : "#cd7f32",
                            background: `${att.badge.level === "gold" ? "#ffd700" : att.badge.level === "silver" ? "#c0c0c0" : "#cd7f32"}15`,
                            border: `1px solid ${att.badge.level === "gold" ? "#ffd700" : att.badge.level === "silver" ? "#c0c0c0" : "#cd7f32"}40`,
                            borderRadius: 3, padding: "2px 6px", letterSpacing: "0.06em",
                          }}>
                            {att.badge.level.toUpperCase()}
                          </span>
                        ) : (
                          <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'Share Tech Mono', monospace" }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "9px 14px" }}>
                        {att.flagged ? (
                          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontFamily: "'Share Tech Mono', monospace", color: "var(--neon-red)" }}>
                            <XCircle size={12} /> FLAGGED
                          </span>
                        ) : att.guardrails?.hitl_required ? (
                          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontFamily: "'Share Tech Mono', monospace", color: "var(--neon-yellow)" }}>
                            <Eye size={12} /> HITL
                          </span>
                        ) : (
                          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontFamily: "'Share Tech Mono', monospace", color: "var(--neon-green)" }}>
                            <CheckCircle2 size={12} /> PASSED
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ─── DOCKER AUDIT VIEW (Legacy) ─── */}
      {viewMode === "docker-audit" && (
        <>
          {/* Filters */}
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
            {SERVICES.map((s) => (
              <button
                key={s}
                onClick={() => setServiceFilter(s)}
                style={{
                  padding: "5px 12px", borderRadius: 4, fontSize: 11,
                  fontFamily: "'Share Tech Mono', monospace", cursor: "pointer",
                  border: `1px solid ${serviceFilter === s ? "var(--neon-cyan)" : "var(--border-dim)"}`,
                  background: serviceFilter === s ? "rgba(0,245,255,0.1)" : "transparent",
                  color: serviceFilter === s ? "var(--neon-cyan)" : "var(--text-secondary)",
                  transition: "all 0.15s",
                }}
              >
                {s}
              </button>
            ))}
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              style={{
                marginLeft: "auto", background: "var(--bg-card)", border: "1px solid var(--border-dim)",
                borderRadius: 4, color: "var(--text-secondary)", fontSize: 11,
                fontFamily: "'Share Tech Mono', monospace", padding: "5px 8px",
              }}
            >
              <option value={50}>50 events</option>
              <option value={100}>100 events</option>
              <option value={250}>250 events</option>
              <option value={500}>500 events</option>
            </select>
          </div>

          {/* Stats bar */}
          <div style={{ display: "flex", gap: 20, marginBottom: 14, fontSize: 11, fontFamily: "'Share Tech Mono', monospace", color: "var(--text-muted)" }}>
            <span>TOTAL: <span style={{ color: "var(--neon-cyan)" }}>{events.length}</span></span>
            <span style={{ color: "var(--neon-green)" }}>SUCCESS: {events.filter((e: any) => e.outcome === "success").length}</span>
            <span style={{ color: "var(--neon-red)" }}>FAILED: {events.filter((e: any) => e.outcome === "failure").length}</span>
          </div>

          {/* Table */}
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", background: "var(--bg-card)", border: "1px solid var(--border-dim)", borderRadius: 6 }}>
            {auditQuery.isLoading ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontFamily: "'Share Tech Mono', monospace", fontSize: 13 }}>
                LOADING AUDIT EVENTS...
              </div>
            ) : events.length === 0 ? (
              <div style={{ padding: 60, textAlign: "center", color: "var(--text-muted)", fontFamily: "'Share Tech Mono', monospace", fontSize: 13 }}>
                <Shield size={32} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
                NO DOCKER AUDIT EVENTS YET
                <div style={{ fontSize: 11, marginTop: 6, opacity: 0.6 }}>
                  USE THE CONTROLS PAGE TO START/STOP/RESTART SERVICES
                </div>
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--bg-elevated)", borderBottom: "1px solid var(--border-dim)", position: "sticky", top: 0, zIndex: 1 }}>
                    {["TIMESTAMP", "USER", "ACTION", "SERVICE", "OUTCOME", "DETAIL"].map((h) => (
                      <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 10, fontFamily: "'Share Tech Mono', monospace", color: "var(--text-muted)", letterSpacing: "0.1em", fontWeight: 600 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {events.map((event: any, i: number) => (
                    <tr
                      key={event.id}
                      style={{ borderBottom: "1px solid var(--border-dim)", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)", transition: "background 0.1s" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,245,255,0.03)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)")}
                    >
                      <td style={{ padding: "9px 14px", fontSize: 11, fontFamily: "'Share Tech Mono', monospace", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                        {new Date(event.createdAt).toLocaleString()}
                      </td>
                      <td style={{ padding: "9px 14px", fontSize: 11, fontFamily: "'Share Tech Mono', monospace", color: "var(--text-secondary)" }}>
                        {event.userName || "—"}
                      </td>
                      <td style={{ padding: "9px 14px" }}>
                        <span style={{
                          fontSize: 10, fontFamily: "'Share Tech Mono', monospace",
                          color: ACTION_COLORS[event.action] || "var(--neon-cyan)",
                          background: `${ACTION_COLORS[event.action] || "var(--neon-cyan)"}15`,
                          border: `1px solid ${ACTION_COLORS[event.action] || "var(--neon-cyan)"}40`,
                          borderRadius: 3, padding: "2px 8px", letterSpacing: "0.08em",
                        }}>
                          {event.action.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: "9px 14px", fontSize: 11, fontFamily: "'Share Tech Mono', monospace", color: "var(--text-primary)" }}>
                        {event.service}
                      </td>
                      <td style={{ padding: "9px 14px" }}>
                        <span style={{ fontSize: 10, fontFamily: "'Share Tech Mono', monospace", color: event.outcome === "success" ? "var(--neon-green)" : "var(--neon-red)", letterSpacing: "0.08em" }}>
                          {event.outcome === "success" ? "✓ SUCCESS" : "✗ FAILED"}
                        </span>
                      </td>
                      <td style={{ padding: "9px 14px", fontSize: 11, fontFamily: "'Share Tech Mono', monospace", color: "var(--text-muted)", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={event.detail || ""}>
                        {event.detail || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
