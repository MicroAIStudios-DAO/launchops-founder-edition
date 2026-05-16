import { useLocation } from "wouter";
import {
  Activity,
  BarChart3,
  Download,
  FileText,
  Gauge,
  ScrollText,
  Shield,
  Terminal,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";

const NAV_ITEMS = [
  { label: "Overview", path: "/", icon: Gauge },
  { label: "Logs", path: "/logs", icon: Terminal },
  { label: "Stats", path: "/stats", icon: BarChart3 },
  { label: "Controls", path: "/controls", icon: Zap },
  { label: "Exports", path: "/exports", icon: Download },
  { label: "Audit Log", path: "/audit", icon: ScrollText },
];

const SERVICE_LINKS = [
  { label: "WordPress", url: "http://137.220.36.18:8080/wp-admin", color: "var(--neon-blue)" },
  { label: "SuiteCRM", url: "http://137.220.36.18:8081", color: "var(--neon-cyan)" },
  { label: "Mautic", url: "http://137.220.36.18:8082", color: "var(--neon-purple)" },
  { label: "Matomo", url: "http://137.220.36.18:8083", color: "var(--neon-green)" },
  { label: "Vaultwarden", url: "http://137.220.36.18:8000/admin", color: "var(--neon-yellow)" },
];

export default function ControlTowerLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: "var(--bg-void)",
        overflow: "hidden",
      }}
    >
      {/* ── Sidebar ── */}
      <aside
        style={{
          width: 220,
          flexShrink: 0,
          background: "var(--bg-base)",
          borderRight: "1px solid var(--border-dim)",
          display: "flex",
          flexDirection: "column",
          padding: "0",
          overflow: "hidden",
        }}
      >
        {/* Logo */}
        <div
          style={{
            padding: "20px 16px 16px",
            borderBottom: "1px solid var(--border-dim)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Shield size={18} style={{ color: "var(--neon-cyan)" }} />
            <div>
              <div
                className="font-display"
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--neon-cyan)",
                  letterSpacing: "0.1em",
                  textShadow: "0 0 10px rgba(0,245,255,0.5)",
                }}
              >
                LAUNCHOPS
              </div>
              <div
                style={{
                  fontSize: 9,
                  color: "var(--text-muted)",
                  letterSpacing: "0.15em",
                  fontFamily: "'Share Tech Mono', monospace",
                }}
              >
                CONTROL TOWER
              </div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ padding: "12px 10px", flex: 1, overflowY: "auto" }}>
          <div
            style={{
              fontSize: 9,
              color: "var(--text-muted)",
              letterSpacing: "0.15em",
              padding: "0 4px 8px",
              fontFamily: "'Share Tech Mono', monospace",
            }}
          >
            NAVIGATION
          </div>
          {NAV_ITEMS.map(({ label, path, icon: Icon }) => {
            const isActive = location === path;
            return (
              <a
                key={path}
                href={path}
                className={`nav-item ${isActive ? "active" : ""}`}
                onClick={(e) => {
                  e.preventDefault();
                  window.history.pushState({}, "", path);
                  window.dispatchEvent(new PopStateEvent("popstate"));
                }}
              >
                <Icon size={15} />
                <span>{label}</span>
              </a>
            );
          })}

          {/* Quick Links */}
          <div
            style={{
              fontSize: 9,
              color: "var(--text-muted)",
              letterSpacing: "0.15em",
              padding: "16px 4px 8px",
              fontFamily: "'Share Tech Mono', monospace",
            }}
          >
            QUICK LINKS
          </div>
          {SERVICE_LINKS.map(({ label, url, color }) => (
            <a
              key={label}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 14px",
                borderRadius: 6,
                fontSize: 12,
                color: "var(--text-secondary)",
                textDecoration: "none",
                transition: "all 0.15s",
                border: "1px solid transparent",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget;
                el.style.color = color;
                el.style.background = "var(--bg-elevated)";
                el.style.borderColor = "var(--border-dim)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget;
                el.style.color = "var(--text-secondary)";
                el.style.background = "transparent";
                el.style.borderColor = "transparent";
              }}
            >
              <Activity size={12} style={{ color }} />
              <span>{label}</span>
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: 9,
                  color: "var(--text-muted)",
                  fontFamily: "'Share Tech Mono', monospace",
                }}
              >
                ↗
              </span>
            </a>
          ))}
        </nav>

        {/* Footer */}
        <div
          style={{
            padding: "12px 16px",
            borderTop: "1px solid var(--border-dim)",
            fontSize: 10,
            color: "var(--text-muted)",
            fontFamily: "'Share Tech Mono', monospace",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--neon-green)",
                boxShadow: "0 0 6px var(--neon-green)",
                display: "inline-block",
              }}
            />
            SYSTEM ONLINE
          </div>
          <div style={{ marginTop: 4, opacity: 0.5 }}>v1.0 · 137.220.36.18</div>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main
        style={{
          flex: 1,
          overflow: "auto",
          background: "var(--bg-void)",
        }}
      >
        {children}
      </main>
    </div>
  );
}
