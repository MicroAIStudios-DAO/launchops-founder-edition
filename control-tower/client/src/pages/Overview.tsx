import { trpc } from "@/lib/trpc";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  Activity,
  CheckCircle2,
  Cpu,
  Database,
  ExternalLink,
  HardDrive,
  RefreshCw,
  Server,
  ShieldAlert,
  Wifi,
  XCircle,
} from "lucide-react";

const SERVICE_ICONS: Record<string, any> = {
  WordPress: Server,
  SuiteCRM: Database,
  Mautic: Wifi,
  Matomo: Cpu,
  Vaultwarden: HardDrive,
  MariaDB: Database,
};

const SERVICE_COLORS: Record<string, string> = {
  WordPress: "var(--neon-blue)",
  SuiteCRM: "var(--neon-cyan)",
  Mautic: "var(--neon-purple)",
  Matomo: "var(--neon-green)",
  Vaultwarden: "var(--neon-yellow)",
  MariaDB: "var(--neon-red)",
};

function MetricBar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="metric-bar-track" style={{ width: "100%" }}>
      <div
        className="metric-bar-fill"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

function StackHealthWidget({
  services,
  healthy,
  warning,
  down,
  isLoading,
}: {
  services: any[];
  healthy: number;
  warning: number;
  down: number;
  isLoading: boolean;
}) {
  const globalColor =
    down > 0
      ? "var(--neon-red)"
      : warning > 0
      ? "var(--neon-yellow)"
      : "var(--neon-green)";

  const globalLabel =
    isLoading && services.length === 0
      ? "POLLING SERVICES..."
      : down > 0
      ? `${down} SERVICE${down > 1 ? "S" : ""} DOWN`
      : warning > 0
      ? `${warning} WARNING${warning > 1 ? "S" : ""}`
      : "ALL SYSTEMS OPERATIONAL";

  return (
    <div
      style={{
        background: "rgba(0,0,0,0.40)",
        border: "1px solid rgba(0,245,255,0.14)",
        borderRadius: 12,
        padding: "14px 20px",
        marginBottom: 20,
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Activity size={13} style={{ color: "var(--neon-cyan)" }} />
          <span
            style={{
              fontSize: 10,
              fontFamily: "'Share Tech Mono', monospace",
              color: "var(--neon-cyan)",
              letterSpacing: "0.14em",
            }}
          >
            STACK HEALTH
          </span>
        </div>

        {/* Global status */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              display: "inline-block",
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: globalColor,
              boxShadow: `0 0 8px ${globalColor}`,
              animation: "pulse-dot 2s infinite",
            }}
          />
          <span
            style={{
              fontSize: 10,
              fontFamily: "'Share Tech Mono', monospace",
              color: globalColor,
              letterSpacing: "0.1em",
            }}
          >
            {globalLabel}
          </span>
        </div>
      </div>

      {/* Service pills */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {isLoading && services.length === 0
          ? Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                style={{
                  height: 30,
                  width: 115,
                  borderRadius: 6,
                  background: "rgba(255,255,255,0.04)",
                  animation: "pulse 1.5s infinite",
                }}
              />
            ))
          : services.map((row: any) => {
              const pillColor =
                row.status === "healthy"
                  ? "var(--neon-green)"
                  : row.status === "warning"
                  ? "var(--neon-yellow)"
                  : "var(--neon-red)";
              const PillIcon =
                row.status === "healthy"
                  ? CheckCircle2
                  : row.status === "warning"
                  ? ShieldAlert
                  : XCircle;
              const accentColor = SERVICE_COLORS[row.service] || "var(--neon-cyan)";
              return (
                <div
                  key={row.service}
                  title={`CPU: ${(row.cpuPercent || 0).toFixed(1)}%  MEM: ${(row.memPercent || 0).toFixed(0)}%  Status: ${row.status}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "5px 11px",
                    borderRadius: 7,
                    background: `color-mix(in srgb, ${accentColor} 7%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${pillColor} 35%, transparent)`,
                    cursor: "default",
                    transition: "border-color 0.2s ease, background 0.2s ease",
                  }}
                >
                  <PillIcon size={11} style={{ color: pillColor, flexShrink: 0 }} />
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: "'Outfit', sans-serif",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      letterSpacing: "0.02em",
                    }}
                  >
                    {row.service}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "'Share Tech Mono', monospace",
                      color: pillColor,
                      marginLeft: 1,
                    }}
                  >
                    {(row.cpuPercent || 0).toFixed(0)}%
                  </span>
                </div>
              );
            })}
      </div>
    </div>
  );
}

function ServiceCard({ row }: { row: any }) {
  const Icon = SERVICE_ICONS[row.service] || Server;
  const accentColor = SERVICE_COLORS[row.service] || "var(--neon-cyan)";
  const status: "healthy" | "warning" | "down" = row.status || "down";

  const statusLabel = {
    healthy: "HEALTHY",
    warning: "WARNING",
    down: "OFFLINE",
  }[status];

  const statusTextColor = {
    healthy: "var(--neon-green)",
    warning: "var(--neon-yellow)",
    down: "var(--neon-red)",
  }[status];

  const cpuColor =
    (row.cpuPercent || 0) > 80
      ? "var(--neon-red)"
      : (row.cpuPercent || 0) > 50
      ? "var(--neon-yellow)"
      : "var(--neon-green)";

  const memColor =
    (row.memPercent || 0) > 85
      ? "var(--neon-red)"
      : (row.memPercent || 0) > 60
      ? "var(--neon-yellow)"
      : "var(--neon-cyan)";

  return (
    <div
      className="cyber-card"
      style={{
        padding: 20,
        borderColor:
          status === "healthy"
            ? "rgba(0,255,136,0.2)"
            : status === "warning"
            ? "rgba(255,221,0,0.2)"
            : "rgba(255,45,85,0.2)",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: `rgba(${accentColor === "var(--neon-blue)" ? "10,132,255" : accentColor === "var(--neon-cyan)" ? "0,245,255" : accentColor === "var(--neon-purple)" ? "191,90,242" : accentColor === "var(--neon-green)" ? "0,255,136" : accentColor === "var(--neon-yellow)" ? "255,221,0" : "255,45,85"},0.12)`,
              border: `1px solid ${accentColor}40`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon size={16} style={{ color: accentColor }} />
          </div>
          <div>
            <div
              className="font-display"
              style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.05em" }}
            >
              {row.service}
            </div>
            <div
              style={{
                fontSize: 10,
                fontFamily: "'Share Tech Mono', monospace",
                color: "var(--text-muted)",
                marginTop: 2,
              }}
            >
              UP {row.uptime || "N/A"}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className={`status-dot ${status}`} />
          <span
            style={{
              fontSize: 10,
              fontFamily: "'Share Tech Mono', monospace",
              color: statusTextColor,
              letterSpacing: "0.1em",
            }}
          >
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Metrics */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* CPU */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'Share Tech Mono', monospace" }}>
              CPU
            </span>
            <span style={{ fontSize: 11, color: cpuColor, fontFamily: "'Share Tech Mono', monospace" }}>
              {(row.cpuPercent || 0).toFixed(1)}%
            </span>
          </div>
          <MetricBar value={row.cpuPercent || 0} color={cpuColor} />
        </div>

        {/* Memory */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'Share Tech Mono', monospace" }}>
              MEM
            </span>
            <span style={{ fontSize: 11, color: memColor, fontFamily: "'Share Tech Mono', monospace" }}>
              {(row.memUsageMb || 0).toFixed(0)}MB / {(row.memLimitMb || 0).toFixed(0)}MB
            </span>
          </div>
          <MetricBar value={row.memPercent || 0} color={memColor} />
        </div>

        {/* Network */}
        <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
          <div>
            <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'Share Tech Mono', monospace" }}>
              NET↓{" "}
            </span>
            <span style={{ fontSize: 11, color: "var(--neon-cyan)", fontFamily: "'Share Tech Mono', monospace" }}>
              {(row.netRxMb || 0).toFixed(2)}MB
            </span>
          </div>
          <div>
            <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'Share Tech Mono', monospace" }}>
              NET↑{" "}
            </span>
            <span style={{ fontSize: 11, color: "var(--neon-purple)", fontFamily: "'Share Tech Mono', monospace" }}>
              {(row.netTxMb || 0).toFixed(2)}MB
            </span>
          </div>
        </div>
      </div>

      {/* Quick link */}
      {row.url && (
        <a
          href={row.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            marginTop: 14,
            fontSize: 11,
            color: "var(--text-muted)",
            textDecoration: "none",
            fontFamily: "'Share Tech Mono', monospace",
            transition: "color 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = accentColor)}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
        >
          <ExternalLink size={11} />
          OPEN SERVICE
        </a>
      )}
    </div>
  );
}

export default function Overview() {
  const [, navigate] = useLocation();
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Auto-redirect first-time visitors to the onboarding wizard
  useEffect(() => {
    const done = localStorage.getItem("launchops_onboarding_complete");
    if (!done) {
      navigate("/onboarding");
    }
  }, []);

  const pollMutation = trpc.services.pollAll.useMutation();
  const latestQuery = trpc.services.latest.useQuery(undefined, {
    refetchInterval: 30000,
  });

  useEffect(() => {
    document.title = "LaunchOps Control Tower — Stack Monitor";
  }, []);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = async () => {
    try {
      await pollMutation.mutateAsync();
      await latestQuery.refetch();
      setLastRefresh(new Date());
    } catch {}
  };

  useEffect(() => {
    poll();
    intervalRef.current = setInterval(poll, 30000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const services = latestQuery.data || [];
  const healthy = services.filter((s) => s.status === "healthy").length;
  const warning = services.filter((s) => s.status === "warning").length;
  const down = services.filter((s) => s.status === "down").length;

  return (
    <div style={{ padding: "24px 28px", minHeight: "100%" }}>
      {/* Page header */}
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
            SYSTEM OVERVIEW
          </h1>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, fontFamily: "'Share Tech Mono', monospace" }}>
            LAST SYNC: {lastRefresh.toLocaleTimeString()} · AUTO-REFRESH 30s
          </p>
        </div>
        <button
          className="btn-cyber"
          onClick={poll}
          disabled={pollMutation.isPending}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <RefreshCw size={12} style={{ animation: pollMutation.isPending ? "spin 1s linear infinite" : "none" }} />
          REFRESH
        </button>
      </div>

      {/* ── Stack Health Widget ──────────────────────────────────────── */}
      <StackHealthWidget
        services={services}
        healthy={healthy}
        warning={warning}
        down={down}
        isLoading={latestQuery.isLoading}
      />

      {/* SEO H2 — visually hidden but present for crawlers and accessibility */}
      <h2
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0,0,0,0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        Docker infrastructure monitoring dashboard for WordPress, SuiteCRM, Mautic, Matomo, Vaultwarden, and MariaDB services
      </h2>

      {/* Summary bar */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
          marginBottom: 24,
        }}
      >
        {[
          { label: "HEALTHY", count: healthy, color: "var(--neon-green)", status: "healthy" },
          { label: "WARNING", count: warning, color: "var(--neon-yellow)", status: "warning" },
          { label: "OFFLINE", count: down, color: "var(--neon-red)", status: "down" },
        ].map(({ label, count, color, status }) => (
          <div
            key={label}
            className="cyber-panel"
            style={{
              padding: "14px 18px",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span className={`status-dot ${status}`} />
            <div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color,
                  fontFamily: "'Orbitron', sans-serif",
                  lineHeight: 1,
                }}
              >
                {count}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "var(--text-muted)",
                  fontFamily: "'Share Tech Mono', monospace",
                  letterSpacing: "0.1em",
                  marginTop: 2,
                }}
              >
                {label}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Service cards grid */}
      {latestQuery.isLoading && services.length === 0 ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 16,
          }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="cyber-card"
              style={{ height: 200, animation: "pulse 1.5s infinite" }}
            />
          ))}
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 16,
          }}
        >
          {services.map((row: any) => (
            <ServiceCard key={row.service} row={row} />
          ))}
          {services.length === 0 && (
            <div
              style={{
                gridColumn: "1 / -1",
                textAlign: "center",
                padding: 60,
                color: "var(--text-muted)",
                fontFamily: "'Share Tech Mono', monospace",
                fontSize: 13,
              }}
            >
              NO DATA YET — POLLING SERVICES...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
