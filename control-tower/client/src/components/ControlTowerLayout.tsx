import { useLocation } from "wouter";
import {
  Activity,
  BarChart3,
  Bot,
  Brain,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  Gauge,
  PlayCircle,
  ScrollText,
  Shield,
  Terminal,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";

const NAV_ITEMS = [
  { label: "Overview",        path: "/",          icon: Gauge },
  { label: "Launch Wizard",   path: "/onboarding", icon: PlayCircle },
  { label: "Business Builder", path: "/business-builder", icon: Brain },
  { label: "Agent Fleet",     path: "/agents",     icon: Bot },
  { label: "Pipeline Monitor",path: "/pipeline",   icon: Activity },
  { label: "Controls",        path: "/controls",   icon: Zap },
  { label: "Logs",            path: "/logs",       icon: Terminal },
  { label: "Stats",           path: "/stats",      icon: BarChart3 },
  { label: "ProofGuard",      path: "/audit",      icon: Shield },
  { label: "Exports",         path: "/exports",    icon: Download },
  { label: "Payments",        path: "/payments",   icon: CreditCard },
];

const SERVICE_LINKS = [
  { label: "WordPress",   url: "http://137.220.36.18:8080/wp-admin", dot: "var(--neon-blue)" },
  { label: "SuiteCRM",    url: "http://137.220.36.18:8081",          dot: "var(--neon-cyan)" },
  { label: "Mautic",      url: "http://137.220.36.18:8082",          dot: "var(--neon-purple)" },
  { label: "Matomo",      url: "http://137.220.36.18:8083",          dot: "var(--neon-green)" },
  { label: "Vaultwarden", url: "http://137.220.36.18:8000/admin",    dot: "var(--neon-yellow)" },
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
        fontFamily: "'Outfit', system-ui, sans-serif",
      }}
    >
      {/* ── Sidebar ── */}
      <aside
        style={{
          width: 232,
          flexShrink: 0,
          background: "oklch(12% .02 260 / 0.95)",
          backdropFilter: "blur(24px)",
          borderRight: "1px solid oklch(25% .02 260 / 0.5)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* ── Brand Logo ── */}
        <div
          style={{
            padding: "20px 18px 16px",
            borderBottom: "1px solid oklch(25% .02 260 / 0.5)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Shield icon with AscertAI cyan glow */}
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "oklch(75% .15 195 / 0.12)",
                border: "1px solid oklch(75% .15 195 / 0.35)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "var(--glow-primary)",
                flexShrink: 0,
              }}
            >
              <Shield size={16} style={{ color: "var(--neon-cyan)" }} />
            </div>
            <div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  letterSpacing: "-0.01em",
                  lineHeight: 1.2,
                  fontFamily: "'Outfit', system-ui, sans-serif",
                }}
              >
                LaunchOps
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "var(--neon-cyan)",
                  letterSpacing: "0.12em",
                  fontFamily: "'Outfit', system-ui, sans-serif",
                  fontWeight: 500,
                  opacity: 0.8,
                }}
              >
                CONTROL TOWER
              </div>
            </div>
          </div>
          {/* MicroAI Studios DAO badge */}
          <div
            style={{
              marginTop: 10,
              fontSize: 9,
              color: "var(--text-muted)",
              letterSpacing: "0.08em",
              fontFamily: "'Outfit', system-ui, sans-serif",
              fontWeight: 400,
            }}
          >
            by MicroAI Studios DAO
          </div>
        </div>

        {/* ── Nav ── */}
        <nav style={{ padding: "10px 10px", flex: 1, overflowY: "auto" }}>
          <div
            style={{
              fontSize: 9,
              color: "var(--text-muted)",
              letterSpacing: "0.14em",
              padding: "4px 8px 8px",
              fontFamily: "'Outfit', system-ui, sans-serif",
              fontWeight: 600,
              textTransform: "uppercase",
            }}
          >
            Navigation
          </div>
          {NAV_ITEMS.map(({ label, path, icon: Icon }) => {
            const isActive = location === path;
            return (
              <a
                key={path}
                href={path}
                className={`nav-item ${isActive ? "active" : ""}`}
                style={{ fontFamily: "'Outfit', system-ui, sans-serif", fontWeight: 500 }}
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

          {/* ── Quick Links ── */}
          <div
            style={{
              fontSize: 9,
              color: "var(--text-muted)",
              letterSpacing: "0.14em",
              padding: "16px 8px 8px",
              fontFamily: "'Outfit', system-ui, sans-serif",
              fontWeight: 600,
              textTransform: "uppercase",
            }}
          >
            Services
          </div>
          {SERVICE_LINKS.map(({ label, url, dot }) => (
            <a
              key={label}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 12px",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 500,
                color: "var(--text-secondary)",
                textDecoration: "none",
                transition: "all 0.15s cubic-bezier(0.23, 1, 0.32, 1)",
                border: "1px solid transparent",
                fontFamily: "'Outfit', system-ui, sans-serif",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget;
                el.style.color = "var(--text-primary)";
                el.style.background = "oklch(18% .02 260)";
                el.style.borderColor = "oklch(25% .02 260 / 0.8)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget;
                el.style.color = "var(--text-secondary)";
                el.style.background = "transparent";
                el.style.borderColor = "transparent";
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: dot,
                  flexShrink: 0,
                  boxShadow: `0 0 6px ${dot}`,
                }}
              />
              <span style={{ flex: 1 }}>{label}</span>
              <ExternalLink size={10} style={{ opacity: 0.4 }} />
            </a>
          ))}
        </nav>

        {/* ── Footer ── */}
        <div
          style={{
            padding: "12px 18px",
            borderTop: "1px solid oklch(25% .02 260 / 0.5)",
          }}
        >
          {/* Ecosystem badge */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 6,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--neon-green)",
                boxShadow: "0 0 8px var(--neon-green)",
                display: "inline-block",
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: "var(--neon-green)",
                letterSpacing: "0.08em",
                fontFamily: "'Outfit', system-ui, sans-serif",
              }}
            >
              SYSTEM ONLINE
            </span>
          </div>
          <div
            style={{
              fontSize: 9,
              color: "var(--text-muted)",
              fontFamily: "'Outfit', system-ui, sans-serif",
              letterSpacing: "0.04em",
            }}
          >
            Founder Edition · v1.0
          </div>
          {/* ProofGuard attestation link */}
          <a
            href="https://ascertai.manus.space"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              marginTop: 8,
              fontSize: 9,
              color: "var(--neon-cyan)",
              textDecoration: "none",
              opacity: 0.7,
              fontFamily: "'Outfit', system-ui, sans-serif",
              transition: "opacity 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.7"; }}
          >
            <Shield size={9} />
            <span>ProofGuard Attested</span>
          </a>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main
        style={{
          flex: 1,
          overflow: "auto",
          background: "var(--bg-void)",
          fontFamily: "'Outfit', system-ui, sans-serif",
        }}
      >
        {children}
      </main>
    </div>
  );
}
