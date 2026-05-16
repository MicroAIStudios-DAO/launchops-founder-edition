import { trpc } from "@/lib/trpc";
import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const SERVICES = ["WordPress", "SuiteCRM", "Mautic", "Matomo", "Vaultwarden", "MariaDB"];

const SERVICE_COLORS: Record<string, string> = {
  WordPress: "#0a84ff",
  SuiteCRM: "#00f5ff",
  Mautic: "#bf5af2",
  Matomo: "#00ff88",
  Vaultwarden: "#ffdd00",
  MariaDB: "#ff2d55",
};

function formatTime(date: Date | string) {
  return new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="cyber-card" style={{ padding: 20 }}>
      <div
        className="font-display"
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: "var(--neon-cyan)",
          letterSpacing: "0.1em",
          marginBottom: 16,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-dim)",
        borderRadius: 6,
        padding: "8px 12px",
        fontSize: 11,
        fontFamily: "'Share Tech Mono', monospace",
      }}
    >
      <div style={{ color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {typeof p.value === "number" ? p.value.toFixed(2) : p.value}
          {p.unit || ""}
        </div>
      ))}
    </div>
  );
};

export default function Stats() {
  const [selectedService, setSelectedService] = useState("WordPress");
  const [limit, setLimit] = useState(60);

  const historyQuery = trpc.stats.history.useQuery(
    { service: selectedService, limit },
    { refetchInterval: 8000 }
  );

  const allLatestQuery = trpc.stats.allLatest.useQuery(undefined, {
    refetchInterval: 8000,
  });

  const data = (historyQuery.data || []).map((row) => ({
    time: formatTime(row.createdAt),
    cpu: row.cpuPercent,
    mem: row.memPercent,
    memMb: row.memUsageMb,
    netRx: row.netRxMb,
    netTx: row.netTxMb,
  }));

  // Multi-service latest snapshot for comparison bar
  const latest = allLatestQuery.data || [];

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
          PERFORMANCE STATS
        </h1>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, fontFamily: "'Share Tech Mono', monospace" }}>
          TIME-SERIES METRICS · AUTO-REFRESH 8s
        </p>
      </div>

      {/* Service selector + range */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap", alignItems: "center" }}>
        {SERVICES.map((s) => (
          <button
            key={s}
            onClick={() => setSelectedService(s)}
            style={{
              padding: "5px 12px",
              borderRadius: 4,
              fontSize: 11,
              fontFamily: "'Share Tech Mono', monospace",
              cursor: "pointer",
              border: `1px solid ${selectedService === s ? SERVICE_COLORS[s] : "var(--border-dim)"}`,
              background: selectedService === s ? `${SERVICE_COLORS[s]}18` : "transparent",
              color: selectedService === s ? SERVICE_COLORS[s] : "var(--text-secondary)",
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
          <option value={30}>Last 30 readings</option>
          <option value={60}>Last 60 readings</option>
          <option value={120}>Last 120 readings</option>
        </select>
      </div>

      {/* Multi-service CPU snapshot */}
      <div style={{ marginBottom: 20 }}>
        <ChartCard title="CURRENT CPU % — ALL SERVICES">
          <ResponsiveContainer width="100%" height={120}>
            <AreaChart data={latest.map((r: any) => ({ name: r.service, cpu: r.cpuPercent || 0 }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--text-muted)", fontFamily: "'Share Tech Mono', monospace" }} />
              <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} unit="%" />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="cpu"
                stroke="var(--neon-cyan)"
                fill="rgba(0,245,255,0.08)"
                strokeWidth={2}
                name="CPU"
                unit="%"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Charts grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* CPU over time */}
        <ChartCard title={`CPU % — ${selectedService}`}>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" tick={{ fontSize: 9, fill: "var(--text-muted)", fontFamily: "'Share Tech Mono', monospace" }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 9, fill: "var(--text-muted)" }} unit="%" domain={[0, 100]} />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="cpu"
                stroke={SERVICE_COLORS[selectedService]}
                strokeWidth={2}
                dot={false}
                name="CPU"
                unit="%"
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Memory % over time */}
        <ChartCard title={`MEMORY % — ${selectedService}`}>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" tick={{ fontSize: 9, fill: "var(--text-muted)", fontFamily: "'Share Tech Mono', monospace" }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 9, fill: "var(--text-muted)" }} unit="%" domain={[0, 100]} />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="mem"
                stroke="var(--neon-purple)"
                fill="rgba(191,90,242,0.1)"
                strokeWidth={2}
                name="MEM"
                unit="%"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Memory MB */}
        <ChartCard title={`MEMORY USAGE (MB) — ${selectedService}`}>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" tick={{ fontSize: 9, fill: "var(--text-muted)", fontFamily: "'Share Tech Mono', monospace" }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 9, fill: "var(--text-muted)" }} unit="MB" />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="memMb"
                stroke="var(--neon-yellow)"
                fill="rgba(255,221,0,0.08)"
                strokeWidth={2}
                name="MEM"
                unit="MB"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Network I/O */}
        <ChartCard title={`NETWORK I/O (MB) — ${selectedService}`}>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" tick={{ fontSize: 9, fill: "var(--text-muted)", fontFamily: "'Share Tech Mono', monospace" }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 9, fill: "var(--text-muted)" }} unit="MB" />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 10, fontFamily: "'Share Tech Mono', monospace", color: "var(--text-muted)" }} />
              <Line type="monotone" dataKey="netRx" stroke="var(--neon-green)" strokeWidth={2} dot={false} name="RX ↓" unit="MB" />
              <Line type="monotone" dataKey="netTx" stroke="var(--neon-red)" strokeWidth={2} dot={false} name="TX ↑" unit="MB" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {data.length === 0 && !historyQuery.isLoading && (
        <div
          style={{
            textAlign: "center",
            padding: 40,
            color: "var(--text-muted)",
            fontFamily: "'Share Tech Mono', monospace",
            fontSize: 13,
          }}
        >
          NO STATS DATA YET — VISIT OVERVIEW TO START POLLING
        </div>
      )}
    </div>
  );
}
