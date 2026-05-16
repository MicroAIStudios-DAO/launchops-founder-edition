import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Download, FileJson, FileText } from "lucide-react";
import { toast } from "sonner";

const SERVICES = ["All", "WordPress", "SuiteCRM", "Mautic", "Matomo", "Vaultwarden", "MariaDB"];
const DATA_TYPES = [
  { value: "health", label: "Health Checks", description: "Service status, uptime, CPU, memory snapshots" },
  { value: "stats", label: "Stats Readings", description: "Time-series CPU, memory, and network metrics" },
  { value: "logs", label: "Log Snapshots", description: "Stored log captures per service" },
  { value: "audit", label: "Audit Events", description: "All control actions with timestamps and outcomes" },
] as const;

type DataType = "health" | "stats" | "logs" | "audit";
type Format = "json" | "csv";

export default function Exports() {
  const [dataType, setDataType] = useState<DataType>("health");
  const [format, setFormat] = useState<Format>("json");
  const [service, setService] = useState("All");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);

  const exportQuery = trpc.exports.download.useQuery(
    {
      type: dataType,
      format,
      service: service === "All" ? undefined : service,
      from: fromDate ? new Date(fromDate) : undefined,
      to: toDate ? new Date(toDate) : undefined,
    },
    { enabled: false }
  );

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const result = await exportQuery.refetch();
      if (!result.data?.content) {
        toast.error("No data to export", {
          style: { background: "var(--bg-elevated)", border: "1px solid var(--neon-red)", color: "var(--neon-red)" },
        });
        return;
      }

      const blob = new Blob([result.data.content], { type: result.data.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const svcLabel = service === "All" ? "all" : service.toLowerCase();
      a.href = url;
      a.download = `launchops-${dataType}-${svcLabel}-${ts}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Export downloaded", {
        style: { background: "var(--bg-elevated)", border: "1px solid var(--neon-green)", color: "var(--neon-green)" },
      });
    } catch (err: any) {
      toast.error("Export failed: " + (err.message || "Unknown error"), {
        style: { background: "var(--bg-elevated)", border: "1px solid var(--neon-red)", color: "var(--neon-red)" },
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const selectedType = DATA_TYPES.find((t) => t.value === dataType);

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
          EXPORT CENTER
        </h1>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, fontFamily: "'Share Tech Mono', monospace" }}>
          DOWNLOAD STORED DATA AS JSON OR CSV
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, maxWidth: 900 }}>
        {/* Left: Config panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Data type */}
          <div className="cyber-panel" style={{ padding: 18 }}>
            <div
              style={{
                fontSize: 10,
                color: "var(--text-muted)",
                fontFamily: "'Share Tech Mono', monospace",
                letterSpacing: "0.12em",
                marginBottom: 12,
              }}
            >
              DATA TYPE
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {DATA_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setDataType(t.value)}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 6,
                    border: `1px solid ${dataType === t.value ? "var(--neon-cyan)" : "var(--border-dim)"}`,
                    background: dataType === t.value ? "rgba(0,245,255,0.08)" : "transparent",
                    color: dataType === t.value ? "var(--neon-cyan)" : "var(--text-secondary)",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, fontFamily: "'Share Tech Mono', monospace" }}>
                    {t.label}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                    {t.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Format */}
          <div className="cyber-panel" style={{ padding: 18 }}>
            <div
              style={{
                fontSize: 10,
                color: "var(--text-muted)",
                fontFamily: "'Share Tech Mono', monospace",
                letterSpacing: "0.12em",
                marginBottom: 12,
              }}
            >
              FORMAT
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              {(["json", "csv"] as Format[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  style={{
                    flex: 1,
                    padding: "10px 0",
                    borderRadius: 6,
                    border: `1px solid ${format === f ? "var(--neon-cyan)" : "var(--border-dim)"}`,
                    background: format === f ? "rgba(0,245,255,0.08)" : "transparent",
                    color: format === f ? "var(--neon-cyan)" : "var(--text-secondary)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    fontSize: 12,
                    fontFamily: "'Share Tech Mono', monospace",
                    transition: "all 0.15s",
                  }}
                >
                  {f === "json" ? <FileJson size={14} /> : <FileText size={14} />}
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Filters + download */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Service filter */}
          <div className="cyber-panel" style={{ padding: 18 }}>
            <div
              style={{
                fontSize: 10,
                color: "var(--text-muted)",
                fontFamily: "'Share Tech Mono', monospace",
                letterSpacing: "0.12em",
                marginBottom: 12,
              }}
            >
              SERVICE FILTER
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {SERVICES.map((s) => (
                <button
                  key={s}
                  onClick={() => setService(s)}
                  style={{
                    padding: "5px 10px",
                    borderRadius: 4,
                    fontSize: 11,
                    fontFamily: "'Share Tech Mono', monospace",
                    cursor: "pointer",
                    border: `1px solid ${service === s ? "var(--neon-cyan)" : "var(--border-dim)"}`,
                    background: service === s ? "rgba(0,245,255,0.1)" : "transparent",
                    color: service === s ? "var(--neon-cyan)" : "var(--text-secondary)",
                    transition: "all 0.15s",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Date range */}
          <div className="cyber-panel" style={{ padding: 18 }}>
            <div
              style={{
                fontSize: 10,
                color: "var(--text-muted)",
                fontFamily: "'Share Tech Mono', monospace",
                letterSpacing: "0.12em",
                marginBottom: 12,
              }}
            >
              DATE RANGE (OPTIONAL)
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { label: "FROM", value: fromDate, onChange: setFromDate },
                { label: "TO", value: toDate, onChange: setToDate },
              ].map(({ label, value, onChange }) => (
                <div key={label}>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'Share Tech Mono', monospace", marginBottom: 4 }}>
                    {label}
                  </div>
                  <input
                    type="datetime-local"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    style={{
                      width: "100%",
                      background: "var(--bg-card)",
                      border: "1px solid var(--border-dim)",
                      borderRadius: 4,
                      color: "var(--text-primary)",
                      fontSize: 12,
                      fontFamily: "'Share Tech Mono', monospace",
                      padding: "6px 10px",
                      outline: "none",
                    }}
                  />
                </div>
              ))}
              {(fromDate || toDate) && (
                <button
                  onClick={() => { setFromDate(""); setToDate(""); }}
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "'Share Tech Mono', monospace",
                    textAlign: "left",
                  }}
                >
                  CLEAR DATES
                </button>
              )}
            </div>
          </div>

          {/* Download button */}
          <div className="cyber-panel" style={{ padding: 18 }}>
            <div
              style={{
                fontSize: 11,
                color: "var(--text-secondary)",
                fontFamily: "'Share Tech Mono', monospace",
                marginBottom: 14,
                lineHeight: 1.6,
              }}
            >
              <span style={{ color: "var(--neon-cyan)" }}>{selectedType?.label}</span>
              {" · "}
              <span style={{ color: "var(--neon-yellow)" }}>{format.toUpperCase()}</span>
              {" · "}
              <span>{service}</span>
              {fromDate && <span> · FROM {new Date(fromDate).toLocaleDateString()}</span>}
              {toDate && <span> · TO {new Date(toDate).toLocaleDateString()}</span>}
            </div>

            <button
              onClick={handleDownload}
              disabled={isDownloading}
              style={{
                width: "100%",
                padding: "12px 0",
                borderRadius: 6,
                border: "1px solid var(--neon-cyan)",
                background: isDownloading ? "rgba(0,245,255,0.05)" : "rgba(0,245,255,0.08)",
                color: "var(--neon-cyan)",
                fontSize: 13,
                fontFamily: "'Share Tech Mono', monospace",
                letterSpacing: "0.1em",
                cursor: isDownloading ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                transition: "all 0.15s",
                boxShadow: isDownloading ? "none" : "0 0 16px rgba(0,245,255,0.15)",
              }}
            >
              <Download size={14} style={{ animation: isDownloading ? "bounce 1s infinite" : "none" }} />
              {isDownloading ? "PREPARING..." : "DOWNLOAD EXPORT"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
