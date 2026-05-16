import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { RefreshCw, ScrollText } from "lucide-react";

const SERVICES = ["All", "WordPress", "SuiteCRM", "Mautic", "Matomo", "Vaultwarden", "MariaDB"];

const ACTION_COLORS: Record<string, string> = {
  start: "var(--neon-green)",
  stop: "var(--neon-red)",
  restart: "var(--neon-yellow)",
};

const SERVICE_COLORS: Record<string, string> = {
  WordPress: "#0a84ff",
  SuiteCRM: "#00f5ff",
  Mautic: "#bf5af2",
  Matomo: "#00ff88",
  Vaultwarden: "#ffdd00",
  MariaDB: "#ff2d55",
};

export default function AuditLog() {
  const [serviceFilter, setServiceFilter] = useState("All");
  const [limit, setLimit] = useState(100);

  const auditQuery = trpc.audit.list.useQuery(
    {
      service: serviceFilter === "All" ? undefined : serviceFilter,
      limit,
    },
    { refetchInterval: 10000 }
  );

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
            }}
          >
            AUDIT LOG
          </h1>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, fontFamily: "'Share Tech Mono', monospace" }}>
            ALL CONTROL ACTIONS · IMMUTABLE RECORD
          </p>
        </div>
        <button
          className="btn-cyber"
          onClick={() => auditQuery.refetch()}
          disabled={auditQuery.isFetching}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <RefreshCw size={12} style={{ animation: auditQuery.isFetching ? "spin 1s linear infinite" : "none" }} />
          REFRESH
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {SERVICES.map((s) => (
          <button
            key={s}
            onClick={() => setServiceFilter(s)}
            style={{
              padding: "5px 12px",
              borderRadius: 4,
              fontSize: 11,
              fontFamily: "'Share Tech Mono', monospace",
              cursor: "pointer",
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
            marginLeft: "auto",
            background: "var(--bg-card)",
            border: "1px solid var(--border-dim)",
            borderRadius: 4,
            color: "var(--text-secondary)",
            fontSize: 11,
            fontFamily: "'Share Tech Mono', monospace",
            padding: "5px 8px",
          }}
        >
          <option value={50}>50 events</option>
          <option value={100}>100 events</option>
          <option value={250}>250 events</option>
          <option value={500}>500 events</option>
        </select>
      </div>

      {/* Stats bar */}
      <div
        style={{
          display: "flex",
          gap: 20,
          marginBottom: 14,
          fontSize: 11,
          fontFamily: "'Share Tech Mono', monospace",
          color: "var(--text-muted)",
        }}
      >
        <span>TOTAL: <span style={{ color: "var(--neon-cyan)" }}>{events.length}</span></span>
        <span style={{ color: "var(--neon-green)" }}>
          SUCCESS: {events.filter((e: any) => e.outcome === "success").length}
        </span>
        <span style={{ color: "var(--neon-red)" }}>
          FAILED: {events.filter((e: any) => e.outcome === "failure").length}
        </span>
      </div>

      {/* Table */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          background: "var(--bg-card)",
          border: "1px solid var(--border-dim)",
          borderRadius: 6,
        }}
      >
        {auditQuery.isLoading ? (
          <div
            style={{
              padding: 40,
              textAlign: "center",
              color: "var(--text-muted)",
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: 13,
            }}
          >
            LOADING AUDIT EVENTS...
          </div>
        ) : events.length === 0 ? (
          <div
            style={{
              padding: 60,
              textAlign: "center",
              color: "var(--text-muted)",
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: 13,
            }}
          >
            <ScrollText size={32} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
            NO AUDIT EVENTS YET
            <div style={{ fontSize: 11, marginTop: 6, opacity: 0.6 }}>
              USE THE CONTROLS PAGE TO START/STOP/RESTART SERVICES
            </div>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr
                style={{
                  background: "var(--bg-elevated)",
                  borderBottom: "1px solid var(--border-dim)",
                  position: "sticky",
                  top: 0,
                  zIndex: 1,
                }}
              >
                {["TIMESTAMP", "USER", "ACTION", "SERVICE", "OUTCOME", "DETAIL"].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "10px 14px",
                      textAlign: "left",
                      fontSize: 10,
                      fontFamily: "'Share Tech Mono', monospace",
                      color: "var(--text-muted)",
                      letterSpacing: "0.1em",
                      fontWeight: 600,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((event: any, i: number) => (
                <tr
                  key={event.id}
                  style={{
                    borderBottom: "1px solid var(--border-dim)",
                    background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,245,255,0.03)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)")}
                >
                  <td
                    style={{
                      padding: "9px 14px",
                      fontSize: 11,
                      fontFamily: "'Share Tech Mono', monospace",
                      color: "var(--text-muted)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {new Date(event.createdAt).toLocaleString()}
                  </td>
                  <td
                    style={{
                      padding: "9px 14px",
                      fontSize: 11,
                      fontFamily: "'Share Tech Mono', monospace",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {event.userName || "—"}
                  </td>
                  <td style={{ padding: "9px 14px" }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontFamily: "'Share Tech Mono', monospace",
                        color: ACTION_COLORS[event.action] || "var(--neon-cyan)",
                        background: `${ACTION_COLORS[event.action] || "var(--neon-cyan)"}15`,
                        border: `1px solid ${ACTION_COLORS[event.action] || "var(--neon-cyan)"}40`,
                        borderRadius: 3,
                        padding: "2px 8px",
                        letterSpacing: "0.08em",
                      }}
                    >
                      {event.action.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: "9px 14px" }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontFamily: "'Share Tech Mono', monospace",
                        color: SERVICE_COLORS[event.service] || "var(--text-primary)",
                      }}
                    >
                      {event.service}
                    </span>
                  </td>
                  <td style={{ padding: "9px 14px" }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontFamily: "'Share Tech Mono', monospace",
                        color: event.outcome === "success" ? "var(--neon-green)" : "var(--neon-red)",
                        letterSpacing: "0.08em",
                      }}
                    >
                      {event.outcome === "success" ? "✓ SUCCESS" : "✗ FAILED"}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: "9px 14px",
                      fontSize: 11,
                      fontFamily: "'Share Tech Mono', monospace",
                      color: "var(--text-muted)",
                      maxWidth: 260,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={event.detail || ""}
                  >
                    {event.detail || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
