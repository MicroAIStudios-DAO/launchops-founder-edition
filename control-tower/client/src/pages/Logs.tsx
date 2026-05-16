import { trpc } from "@/lib/trpc";
import { useEffect, useRef, useState } from "react";
import { RefreshCw, Search, X } from "lucide-react";

const SERVICES = ["WordPress", "SuiteCRM", "Mautic", "Matomo", "Vaultwarden", "MariaDB"];

function classifyLine(line: string): string {
  const l = line.toLowerCase();
  if (l.includes("error") || l.includes("fatal") || l.includes("crit")) return "log-line-error";
  if (l.includes("warn") || l.includes("warning")) return "log-line-warn";
  return "log-line-info";
}

export default function Logs() {
  const [selectedService, setSelectedService] = useState("WordPress");
  const [filter, setFilter] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [lineCount, setLineCount] = useState(200);
  const bottomRef = useRef<HTMLDivElement>(null);

  const logsQuery = trpc.services.logs.useQuery(
    { service: selectedService, lines: lineCount },
    { refetchInterval: 4000 }
  );

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logsQuery.data, autoScroll]);

  const lines: string[] = logsQuery.data?.lines || [];
  const filtered = filter
    ? lines.filter((l) => l.toLowerCase().includes(filter.toLowerCase()))
    : lines;

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
            LIVE LOGS
          </h1>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, fontFamily: "'Share Tech Mono', monospace" }}>
            TAILING {lineCount} LINES · AUTO-REFRESH 4s
          </p>
        </div>
        <button
          className="btn-cyber"
          onClick={() => logsQuery.refetch()}
          disabled={logsQuery.isFetching}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <RefreshCw size={12} style={{ animation: logsQuery.isFetching ? "spin 1s linear infinite" : "none" }} />
          REFRESH
        </button>
      </div>

      {/* Controls bar */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 16,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {/* Service selector */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
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
                border: `1px solid ${selectedService === s ? "var(--neon-cyan)" : "var(--border-dim)"}`,
                background: selectedService === s ? "rgba(0,245,255,0.1)" : "transparent",
                color: selectedService === s ? "var(--neon-cyan)" : "var(--text-secondary)",
                transition: "all 0.15s",
                letterSpacing: "0.05em",
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Search */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "var(--bg-card)",
            border: "1px solid var(--border-dim)",
            borderRadius: 4,
            padding: "5px 10px",
            flex: 1,
            minWidth: 200,
          }}
        >
          <Search size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter logs..."
            style={{
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--text-primary)",
              fontSize: 12,
              fontFamily: "'Share Tech Mono', monospace",
              flex: 1,
            }}
          />
          {filter && (
            <button
              onClick={() => setFilter("")}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 0 }}
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Line count */}
        <select
          value={lineCount}
          onChange={(e) => setLineCount(Number(e.target.value))}
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-dim)",
            borderRadius: 4,
            color: "var(--text-secondary)",
            fontSize: 11,
            fontFamily: "'Share Tech Mono', monospace",
            padding: "5px 8px",
            cursor: "pointer",
          }}
        >
          <option value={50}>50 lines</option>
          <option value={100}>100 lines</option>
          <option value={200}>200 lines</option>
          <option value={500}>500 lines</option>
        </select>

        {/* Auto-scroll toggle */}
        <button
          onClick={() => setAutoScroll((v) => !v)}
          style={{
            padding: "5px 12px",
            borderRadius: 4,
            fontSize: 11,
            fontFamily: "'Share Tech Mono', monospace",
            cursor: "pointer",
            border: `1px solid ${autoScroll ? "var(--neon-green)" : "var(--border-dim)"}`,
            background: autoScroll ? "rgba(0,255,136,0.08)" : "transparent",
            color: autoScroll ? "var(--neon-green)" : "var(--text-secondary)",
            transition: "all 0.15s",
          }}
        >
          AUTO-SCROLL {autoScroll ? "ON" : "OFF"}
        </button>
      </div>

      {/* Stats bar */}
      <div
        style={{
          display: "flex",
          gap: 20,
          marginBottom: 12,
          fontSize: 11,
          fontFamily: "'Share Tech Mono', monospace",
          color: "var(--text-muted)",
        }}
      >
        <span>TOTAL: <span style={{ color: "var(--neon-cyan)" }}>{lines.length}</span></span>
        <span>FILTERED: <span style={{ color: "var(--neon-yellow)" }}>{filtered.length}</span></span>
        <span style={{ color: lines.filter(l => l.toLowerCase().includes("error")).length > 0 ? "var(--neon-red)" : "var(--text-muted)" }}>
          ERRORS: {lines.filter(l => l.toLowerCase().includes("error")).length}
        </span>
        <span style={{ color: lines.filter(l => l.toLowerCase().includes("warn")).length > 0 ? "var(--neon-yellow)" : "var(--text-muted)" }}>
          WARNINGS: {lines.filter(l => l.toLowerCase().includes("warn")).length}
        </span>
      </div>

      {/* Terminal */}
      <div
        className="log-terminal"
        style={{ flex: 1, minHeight: 0, overflowY: "auto" }}
      >
        {logsQuery.isLoading && filtered.length === 0 ? (
          <div style={{ color: "var(--text-muted)", padding: 20 }}>LOADING LOGS...</div>
        ) : filtered.length === 0 ? (
          <div style={{ color: "var(--text-muted)", padding: 20 }}>
            {filter ? "NO LINES MATCH FILTER" : "NO LOGS AVAILABLE"}
          </div>
        ) : (
          filtered.map((line, i) => (
            <div key={i} className={`log-line ${classifyLine(line)}`}>
              <span style={{ color: "var(--text-muted)", marginRight: 8, userSelect: "none" }}>
                {String(i + 1).padStart(4, "0")}
              </span>
              {line}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {logsQuery.data?.error && (
        <div
          style={{
            marginTop: 8,
            padding: "8px 12px",
            background: "rgba(255,45,85,0.1)",
            border: "1px solid rgba(255,45,85,0.3)",
            borderRadius: 4,
            fontSize: 12,
            color: "var(--neon-red)",
            fontFamily: "'Share Tech Mono', monospace",
          }}
        >
          ERROR: {logsQuery.data.error}
        </div>
      )}
    </div>
  );
}
