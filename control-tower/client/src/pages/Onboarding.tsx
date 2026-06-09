import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  AlertCircle,
  ArrowRight,
  Bot,
  Check,
  Cpu,
  Database,
  ExternalLink,
  Globe,
  Key,
  Layers,
  Loader2,
  Lock,
  Mail,
  Rocket,
  Shield,
  Sparkles,
  Terminal,
  User,
  Zap,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

// Brand tokens matching AscertAI design system
const B = {
  font: "'Outfit', system-ui, sans-serif",
  cyan:   "oklch(75% .15 195)",
  purple: "oklch(65% .20 290)",
  green:  "oklch(72% .18 145)",
  yellow: "oklch(80% .18 85)",
  blue:   "oklch(65% .18 240)",
  red:    "oklch(65% .22 25)",
  bg:     "oklch(10% .015 260)",
  card:   "oklch(13% .018 260)",
  border: "oklch(20% .02 260)",
  tp:     "oklch(96% .005 260)",
  ts:     "oklch(72% .01 260)",
  tm:     "oklch(48% .01 260)",
};

const STEPS = [
  { id: "welcome",        title: "Welcome to LaunchOps",      subtitle: "Your AI-powered business operating system",                icon: Rocket,   color: B.cyan   },
  { id: "founder",        title: "Tell Atlas About You",       subtitle: "5 questions - Atlas personalizes everything",              icon: User,     color: B.blue   },
  { id: "infrastructure", title: "Your Stack Is Running",      subtitle: "6 services deployed and ready for configuration",          icon: Layers,   color: B.purple },
  { id: "configure",      title: "Configure Your Services",    subtitle: "One master password - Atlas configures everything",        icon: Database, color: B.green  },
  { id: "kong",           title: "Activate KONG Team",         subtitle: "Auto-provision all service accounts - hands-free",         icon: Key,      color: B.yellow },
  { id: "launch",         title: "Launch the Pipeline",        subtitle: "23 agents fire in sequence across 9 pipeline stages",      icon: Zap,      color: B.cyan   },
];

const ATLAS: Record<string, string[]> = {
  welcome: [
    "I'm Atlas - the AI orchestrator for your LaunchOps Founder Edition stack. I coordinate 23 specialized agents across 6 teams.",
    "This wizard takes about 5 minutes. At the end, your full business operating system will be live and configured.",
  ],
  founder: [
    "I need a few details to personalize your stack. The more specific you are, the more precisely every agent executes.",
    "This profile becomes the operating context for the entire system - agents use it for content, positioning, and targeting.",
  ],
  infrastructure: [
    "Your Docker stack is live on Vultr. WordPress, SuiteCRM, Mautic, Matomo, Vaultwarden, and MariaDB are all running.",
    "Each service needs to be configured with your admin credentials. The next step handles this automatically.",
  ],
  configure: [
    "Now I configure each service automatically. Enter one master password - I'll use it to set up admin accounts for WordPress, Matomo, SuiteCRM, and Mautic.",
    "Click 'Configure All Services' and I'll run the installers inside each container. No browser wizards. No manual forms.",
    "Vaultwarden is the only service you configure manually - open it at port 8000 after this step to create your vault account.",
  ],
  kong: [
    "KONG stands for Keep ON Guard. Two agents: CredentialForge creates all your service usernames and passwords. KeyKeeper handles every email verification and OTP automatically.",
    "You never touch a signup form. KONG navigates to each service, fills in the forms, retrieves verification codes, and stores everything encrypted in your vault.",
  ],
  launch: [
    "The pipeline runs 9 stages in sequence: intake, auth, formation, infrastructure, legal, payments, funding, coaching, growth.",
    "Each stage activates the relevant agents. You can run the full pipeline or trigger individual stages from the Controls panel.",
  ],
};

const INFRA_SERVICES = [
  { name: "WordPress",   port: 8080, color: B.blue,   desc: "CMS & storefront" },
  { name: "SuiteCRM",    port: 8081, color: B.cyan,   desc: "Customer relationships" },
  { name: "Mautic",      port: 8082, color: B.purple, desc: "Email marketing" },
  { name: "Matomo",      port: 8083, color: B.green,  desc: "Analytics" },
  { name: "Vaultwarden", port: 8000, color: B.yellow, desc: "Password vault" },
  { name: "MariaDB",     port: 3306, color: B.red,    desc: "Database" },
];

const CONFIG_SERVICES = [
  { id: "MariaDB",     label: "MariaDB",     icon: Database, color: B.blue,   desc: "Verify all databases exist",           manual: false },
  { id: "WordPress",   label: "WordPress",   icon: Globe,    color: B.cyan,   desc: "Install CMS & storefront via WP-CLI",  manual: false },
  { id: "Matomo",      label: "Matomo",      icon: Sparkles, color: B.green,  desc: "Configure analytics via PHP console",  manual: false },
  { id: "SuiteCRM",    label: "SuiteCRM",    icon: User,     color: B.purple, desc: "Run silent CRM installer",             manual: false },
  { id: "Mautic",      label: "Mautic",      icon: Mail,     color: B.yellow, desc: "Write config and seed database",       manual: false },
  { id: "Vaultwarden", label: "Vaultwarden", icon: Lock,     color: B.red,    desc: "Ready - create vault account at :8000", manual: true },
];

const KONG_SERVICES = [
  "WordPress", "SuiteCRM", "Mautic", "Matomo", "Vaultwarden",
  "GitHub", "Stripe", "Mailgun", "Cloudflare", "OpenAI",
];

// Atlas typing bubble
function AtlasMsg({ text, delay = 0 }: { text: string; delay?: number }) {
  const [shown, setShown] = useState("");
  const [started, setStarted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setStarted(true), delay); return () => clearTimeout(t); }, [delay]);
  useEffect(() => {
    if (!started) return;
    let i = 0; setShown("");
    const iv = setInterval(() => { if (i < text.length) { setShown(text.slice(0, ++i)); } else clearInterval(iv); }, 11);
    return () => clearInterval(iv);
  }, [started, text]);
  if (!started) return null;
  return (
    <div style={{ background: "oklch(75% .15 195 / 0.04)", border: "1px solid oklch(75% .15 195 / 0.14)", borderRadius: 10, padding: "14px 18px", marginBottom: 10, fontSize: 13, color: B.ts, lineHeight: 1.7, position: "relative", fontFamily: B.font }}>
      <div style={{ position: "absolute", top: -1, left: 16, background: B.bg, padding: "0 6px", fontSize: 9, color: B.cyan, letterSpacing: "0.12em", display: "flex", alignItems: "center", gap: 4, fontWeight: 700, fontFamily: B.font }}>
        <Bot size={9} /> ATLAS
      </div>
      {shown}
      {shown.length < text.length && <span style={{ display: "inline-block", width: 8, height: 14, background: B.cyan, marginLeft: 2, animation: "blink 0.7s infinite" }} />}
    </div>
  );
}

// Shared text input
function FInput({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; type?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: B.cyan, letterSpacing: "0.12em", marginBottom: 5, fontFamily: B.font, fontWeight: 700 }}>{label}</div>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: "100%", boxSizing: "border-box", background: "oklch(75% .15 195 / 0.04)", border: "1px solid oklch(75% .15 195 / 0.2)", borderRadius: 8, padding: "10px 14px", color: B.tp, fontFamily: B.font, fontSize: 13, outline: "none" }} />
    </div>
  );
}

// Primary action button
function PBtn({ onClick, disabled, color, children }: { onClick: () => void; disabled?: boolean; color: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px 20px", borderRadius: 10, border: `1px solid ${disabled ? B.border : color}`, background: disabled ? "transparent" : `${color}18`, color: disabled ? B.tm : color, fontFamily: B.font, fontWeight: 700, fontSize: 14, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, transition: "all 0.18s", letterSpacing: "0.03em" }}>
      {children}
    </button>
  );
}

// Step: Welcome
function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>{ATLAS.welcome.map((m, i) => <AtlasMsg key={i} text={m} delay={i * 1400} />)}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 28 }}>
        {[{ label: "23 Agents", desc: "Coordinated fleet", color: B.cyan }, { label: "9 Stages", desc: "Full pipeline", color: B.purple }, { label: "6 Services", desc: "Self-hosted stack", color: B.green }].map(({ label, desc, color }) => (
          <div key={label} style={{ padding: "16px 14px", borderRadius: 10, textAlign: "center", background: `${color}08`, border: `1px solid ${color}25` }}>
            <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: B.font, marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 10, color: B.tm, fontFamily: B.font, fontWeight: 500 }}>{desc}</div>
          </div>
        ))}
      </div>
      <PBtn onClick={onNext} color={B.cyan}>BEGIN SETUP <ArrowRight size={15} /></PBtn>
    </div>
  );
}

// Step: Founder Profile
function StepFounder({ onNext }: { onNext: (data: Record<string, string>) => void }) {
  const [form, setForm] = useState({ business_name: "", industry: "", target_market: "", delivery_email: "", monthly_revenue_goal: "" });
  const fields = [
    { key: "business_name", label: "BUSINESS NAME", placeholder: "e.g. Apex Digital Solutions" },
    { key: "industry", label: "INDUSTRY / NICHE", placeholder: "e.g. SaaS, e-commerce, consulting" },
    { key: "target_market", label: "TARGET MARKET", placeholder: "e.g. SMBs in the US, solo founders" },
    { key: "delivery_email", label: "YOUR EMAIL", placeholder: "you@domain.com" },
    { key: "monthly_revenue_goal", label: "MONTHLY REVENUE GOAL", placeholder: "e.g. $10,000" },
  ];
  const ok = form.business_name && form.delivery_email;
  return (
    <div>
      <div style={{ marginBottom: 20 }}>{ATLAS.founder.map((m, i) => <AtlasMsg key={i} text={m} delay={i * 1400} />)}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 24 }}>
        {fields.map(f => <FInput key={f.key} label={f.label} value={form[f.key as keyof typeof form]} onChange={v => setForm(p => ({ ...p, [f.key]: v }))} placeholder={f.placeholder} type={f.key === "delivery_email" ? "email" : "text"} />)}
      </div>
      <PBtn onClick={() => onNext(form)} disabled={!ok} color={B.blue}>SAVE PROFILE <ArrowRight size={15} /></PBtn>
    </div>
  );
}

// Step: Infrastructure
function StepInfrastructure({ onNext }: { onNext: () => void }) {
  const ip = "137.220.36.18";
  return (
    <div>
      <div style={{ marginBottom: 20 }}>{ATLAS.infrastructure.map((m, i) => <AtlasMsg key={i} text={m} delay={i * 1400} />)}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
        {INFRA_SERVICES.map(svc => (
          <div key={svc.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", background: `${svc.color}06`, border: `1px solid ${svc.color}20`, borderRadius: 9 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: svc.color, boxShadow: `0 0 8px ${svc.color}`, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: B.tp, fontFamily: B.font }}>{svc.name}</span>
              <span style={{ fontSize: 11, color: B.tm, fontFamily: B.font, marginLeft: 8 }}>{svc.desc}</span>
            </div>
            <a href={`http://${ip}:${svc.port}`} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: svc.color, textDecoration: "none", fontFamily: B.font, fontWeight: 500 }}>
              :{svc.port} <ExternalLink size={9} />
            </a>
          </div>
        ))}
      </div>
      <PBtn onClick={onNext} color={B.purple}>CONFIGURE SERVICES <ArrowRight size={15} /></PBtn>
    </div>
  );
}

// Step: Configure Services
function StepConfigure({ onNext, founderEmail }: { onNext: () => void; founderEmail: string }) {
  const [pw, setPw] = useState("");
  const [email, setEmail] = useState(founderEmail || "");
  const [url, setUrl] = useState("http://137.220.36.18");
  const [states, setStates] = useState<Record<string, { status: string; message: string; configured: boolean }>>(
    Object.fromEntries(CONFIG_SERVICES.map(s => [s.id, { status: "idle", message: "", configured: false }]))
  );
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [allDone, setAllDone] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const runSetup = trpc.setup.runFullSetup.useMutation();
  const statusQ = trpc.setup.getStatus.useQuery(undefined, { enabled: running, refetchInterval: running ? 2000 : false });

  useEffect(() => {
    if (statusQ.data && running) {
      setStates(prev => { const n = { ...prev }; for (const [k, v] of Object.entries(statusQ.data)) n[k] = v as typeof n[string]; return n; });
    }
  }, [statusQ.data, running]);

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [log]);

  useEffect(() => {
    if (["MariaDB", "WordPress", "Matomo", "Mautic"].every(id => states[id]?.configured)) setAllDone(true);
  }, [states]);

  function addLog(msg: string) { setLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]); }

  async function runAll() {
    if (!pw || pw.length < 8 || !email) return;
    setRunning(true);
    addLog("Starting full automated setup...");
    setStates(prev => { const n = { ...prev }; for (const s of CONFIG_SERVICES) if (!s.manual) n[s.id] = { status: "running", message: "Queued...", configured: false }; return n; });
    try {
      const result = await runSetup.mutateAsync({ masterPassword: pw, email, founderName: "Founder", siteUrl: url });
      for (const [svc, res] of Object.entries(result.results)) {
        setStates(prev => ({ ...prev, [svc]: { status: res.success ? "done" : "error", message: res.message, configured: res.success } }));
        addLog(`${res.success ? "[OK]" : "[ERR]"} ${svc}: ${res.message}`);
      }
      if (result.allSuccess) { addLog("[OK] All services configured!"); setAllDone(true); }
      else addLog("[WARN] Some services need attention - check errors above.");
    } catch (err) {
      addLog(`[ERR] ${err instanceof Error ? err.message : String(err)}`);
    } finally { setRunning(false); }
  }

  const count = Object.values(states).filter(s => s.configured).length;
  const canRun = pw.length >= 8 && email.length > 0 && !running;

  return (
    <div>
      <div style={{ marginBottom: 20 }}>{ATLAS.configure.map((m, i) => <AtlasMsg key={i} text={m} delay={i * 1400} />)}</div>

      {/* Credentials */}
      <div style={{ background: "oklch(75% .15 195 / 0.03)", border: "1px solid oklch(75% .15 195 / 0.12)", borderRadius: 12, padding: "18px", marginBottom: 20 }}>
        <div style={{ fontSize: 10, color: B.cyan, letterSpacing: "0.14em", fontFamily: B.font, fontWeight: 700, marginBottom: 14 }}>ADMIN CREDENTIALS</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <FInput label="ADMIN EMAIL" value={email} onChange={setEmail} placeholder="you@domain.com" type="email" />
          <FInput label="MASTER PASSWORD (min 8 chars)" value={pw} onChange={setPw} placeholder="Used for all service admin accounts" type="password" />
          <FInput label="SERVER URL" value={url} onChange={setUrl} placeholder="http://137.220.36.18" />
        </div>
      </div>

      {/* Progress */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: B.tm, marginBottom: 6, fontFamily: B.font, fontWeight: 500 }}>
          <span>SERVICES CONFIGURED</span>
          <span style={{ color: B.green, fontWeight: 700 }}>{count} / {CONFIG_SERVICES.length}</span>
        </div>
        <div style={{ height: 4, background: B.border, borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${(count / CONFIG_SERVICES.length) * 100}%`, background: `linear-gradient(90deg, ${B.cyan}, ${B.green})`, borderRadius: 2, transition: "width 0.5s cubic-bezier(0.23,1,0.32,1)", boxShadow: `0 0 8px ${B.cyan}60` }} />
        </div>
      </div>

      {/* Configure All */}
      <button onClick={runAll} disabled={!canRun} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "15px 20px", borderRadius: 10, marginBottom: 16, border: `1px solid ${canRun ? B.green : B.border}`, background: canRun ? "oklch(72% .18 145 / 0.1)" : "transparent", color: canRun ? B.green : B.tm, fontFamily: B.font, fontWeight: 700, fontSize: 14, cursor: canRun ? "pointer" : "not-allowed", letterSpacing: "0.04em" }}>
        {running ? <><Cpu size={15} style={{ animation: "spin 1s linear infinite" }} /> CONFIGURING ALL SERVICES...</> : <><Zap size={15} /> CONFIGURE ALL SERVICES AUTOMATICALLY</>}
      </button>

      {/* Service cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        {CONFIG_SERVICES.map(svc => {
          const st = states[svc.id];
          const done = st.configured;
          const err = st.status === "error";
          const busy = st.status === "running";
          const Icon = svc.icon;
          return (
            <div key={svc.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: done ? "oklch(72% .18 145 / 0.05)" : err ? "oklch(65% .22 25 / 0.05)" : B.card, border: `1px solid ${done ? "oklch(72% .18 145 / 0.25)" : err ? "oklch(65% .22 25 / 0.25)" : `${svc.color}20`}`, borderRadius: 9 }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, flexShrink: 0, background: done ? "oklch(72% .18 145 / 0.1)" : `${svc.color}10`, border: `1px solid ${done ? "oklch(72% .18 145 / 0.3)" : `${svc.color}25`}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {done ? <Check size={15} color={B.green} /> : busy ? <Loader2 size={15} color={svc.color} style={{ animation: "spin 1s linear infinite" }} /> : err ? <AlertCircle size={15} color={B.red} /> : <Icon size={15} color={svc.color} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: B.tp, fontFamily: B.font }}>
                  {svc.label}
                  {svc.manual && <span style={{ marginLeft: 6, fontSize: 9, color: B.yellow, letterSpacing: "0.1em", fontWeight: 700 }}>MANUAL</span>}
                </div>
                <div style={{ fontSize: 11, color: done ? B.green : err ? B.red : B.tm, fontFamily: B.font, marginTop: 2 }}>{st.message || svc.desc}</div>
              </div>
              <div style={{ padding: "3px 8px", borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", fontFamily: B.font, background: done ? "oklch(72% .18 145 / 0.12)" : err ? "oklch(65% .22 25 / 0.12)" : busy ? `${svc.color}12` : "transparent", color: done ? B.green : err ? B.red : busy ? svc.color : B.tm, border: `1px solid ${done ? "oklch(72% .18 145 / 0.25)" : err ? "oklch(65% .22 25 / 0.25)" : busy ? `${svc.color}30` : B.border}` }}>
                {done ? "READY" : err ? "ERROR" : busy ? "RUNNING" : "PENDING"}
              </div>
            </div>
          );
        })}
      </div>

      {/* Log */}
      {log.length > 0 && (
        <div style={{ background: "oklch(8% .01 260)", border: `1px solid ${B.border}`, borderRadius: 10, padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 9, color: B.cyan, letterSpacing: "0.14em", fontFamily: B.font, fontWeight: 700, marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}><Terminal size={9} /> SETUP LOG</div>
          <div ref={logRef} style={{ maxHeight: 140, overflowY: "auto", fontSize: 11, lineHeight: 1.9, fontFamily: "monospace" }}>
            {log.map((line, i) => <div key={i} style={{ color: line.includes("[OK]") ? B.green : line.includes("[ERR]") ? B.red : line.includes("[WARN]") ? B.yellow : "oklch(55% .01 260)" }}>{line}</div>)}
          </div>
        </div>
      )}

      {/* Vaultwarden note */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", background: "oklch(80% .18 85 / 0.04)", border: "1px solid oklch(80% .18 85 / 0.2)", borderRadius: 9, marginBottom: 20 }}>
        <Lock size={14} color={B.yellow} style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: B.yellow, fontFamily: B.font, marginBottom: 3 }}>Vaultwarden - Manual Step Required</div>
          <div style={{ fontSize: 11, color: B.tm, fontFamily: B.font, lineHeight: 1.6 }}>
            Open <a href="http://137.220.36.18:8000" target="_blank" rel="noopener noreferrer" style={{ color: B.cyan, textDecoration: "none" }}>http://137.220.36.18:8000</a> and create your vault account. Store all credentials there.
          </div>
        </div>
      </div>

      {/* Nav */}
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onNext} disabled={!allDone && count < 2} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px 20px", borderRadius: 10, border: `1px solid ${allDone ? B.cyan : B.border}`, background: allDone ? "oklch(75% .15 195 / 0.08)" : "transparent", color: allDone ? B.cyan : B.tm, fontFamily: B.font, fontWeight: 700, fontSize: 14, cursor: (!allDone && count < 2) ? "not-allowed" : "pointer", opacity: (!allDone && count < 2) ? 0.4 : 1 }}>
          {allDone ? <>STACK CONFIGURED <ArrowRight size={15} /></> : <>CONTINUE ({count}/{CONFIG_SERVICES.length}) <ArrowRight size={15} /></>}
        </button>
        <button onClick={onNext} style={{ padding: "14px 20px", borderRadius: 10, border: `1px solid ${B.border}`, background: "transparent", color: B.tm, fontFamily: B.font, fontSize: 12, cursor: "pointer" }}>SKIP</button>
      </div>
    </div>
  );
}

// Step: KONG
function StepKong({ onNext }: { onNext: () => void }) {
  const [activating, setActivating] = useState(false);
  const [done, setDone] = useState(false);
  const [kongLog, setKongLog] = useState<string[]>([]);

  async function activate() {
    setActivating(true);
    const steps = ["Initializing CredentialForge...", "Connecting to temp inbox provider...", "Scanning service registration endpoints...", "KONG team standing by - run from Controls panel to execute."];
    for (const s of steps) { await new Promise(r => setTimeout(r, 900)); setKongLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${s}`]); }
    setActivating(false); setDone(true);
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>{ATLAS.kong.map((m, i) => <AtlasMsg key={i} text={m} delay={i * 1400} />)}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
        {KONG_SERVICES.map(svc => (
          <div key={svc} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: B.card, border: `1px solid ${B.border}`, borderRadius: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: B.cyan, boxShadow: `0 0 6px ${B.cyan}`, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: B.ts, fontFamily: B.font, fontWeight: 500 }}>{svc}</span>
          </div>
        ))}
      </div>
      {kongLog.length > 0 && (
        <div style={{ background: "oklch(8% .01 260)", border: `1px solid ${B.border}`, borderRadius: 10, padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 9, color: B.cyan, letterSpacing: "0.14em", fontFamily: B.font, fontWeight: 700, marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}><Terminal size={9} /> KONG ACTIVATION LOG</div>
          {kongLog.map((line, i) => <div key={i} style={{ fontSize: 11, color: "oklch(55% .01 260)", fontFamily: "monospace", lineHeight: 1.9 }}>{line}</div>)}
        </div>
      )}
      <div style={{ display: "flex", gap: 10 }}>
        {!done && (
          <button onClick={activate} disabled={activating} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px 20px", borderRadius: 10, border: `1px solid ${B.yellow}`, background: "oklch(80% .18 85 / 0.08)", color: B.yellow, fontFamily: B.font, fontWeight: 700, fontSize: 14, cursor: activating ? "not-allowed" : "pointer" }}>
            {activating ? <><Cpu size={15} style={{ animation: "spin 1s linear infinite" }} /> ACTIVATING KONG...</> : <><Key size={15} /> ACTIVATE KONG TEAM</>}
          </button>
        )}
        <button onClick={onNext} style={{ flex: done ? 1 : 0, padding: "14px 20px", borderRadius: 10, border: `1px solid ${done ? B.cyan : B.border}`, background: done ? "oklch(75% .15 195 / 0.08)" : "transparent", color: done ? B.cyan : B.tm, fontFamily: B.font, fontWeight: done ? 700 : 400, fontSize: done ? 14 : 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {done ? <>CONTINUE <ArrowRight size={15} /></> : "SKIP"}
        </button>
      </div>
    </div>
  );
}

// Step: Launch
function StepLaunch({ profile, onFinish }: { profile: Record<string, string>; onFinish: () => void }) {
  const stages = ["intake", "auth", "formation", "infrastructure", "legal", "payments", "funding", "coaching", "growth"];
  return (
    <div>
      <div style={{ marginBottom: 20 }}>{ATLAS.launch.map((m, i) => <AtlasMsg key={i} text={m} delay={i * 1400} />)}</div>
      {profile.business_name && (
        <div style={{ padding: "14px 18px", borderRadius: 10, marginBottom: 20, background: "oklch(75% .15 195 / 0.04)", border: "1px solid oklch(75% .15 195 / 0.15)" }}>
          <div style={{ fontSize: 10, color: B.cyan, letterSpacing: "0.14em", fontFamily: B.font, fontWeight: 700, marginBottom: 10 }}>FOUNDER PROFILE</div>
          {Object.entries(profile).filter(([, v]) => v).map(([k, v]) => (
            <div key={k} style={{ display: "flex", gap: 10, marginBottom: 5 }}>
              <span style={{ fontSize: 10, color: B.tm, fontFamily: B.font, fontWeight: 600, minWidth: 140, textTransform: "uppercase", letterSpacing: "0.08em" }}>{k.replace(/_/g, " ")}</span>
              <span style={{ fontSize: 12, color: B.ts, fontFamily: B.font }}>{v}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, color: B.tm, letterSpacing: "0.14em", fontFamily: B.font, fontWeight: 700, marginBottom: 10 }}>PIPELINE STAGES</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {stages.map((stage, i) => (
            <div key={stage} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 6, background: "oklch(75% .15 195 / 0.06)", border: "1px solid oklch(75% .15 195 / 0.18)" }}>
              <span style={{ fontSize: 9, color: B.cyan, fontFamily: B.font, fontWeight: 700 }}>{i + 1}</span>
              <span style={{ fontSize: 11, color: B.ts, fontFamily: B.font, fontWeight: 500 }}>{stage}</span>
            </div>
          ))}
        </div>
      </div>
      <button onClick={onFinish} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "16px 20px", borderRadius: 10, border: `1px solid ${B.cyan}`, background: "oklch(75% .15 195 / 0.1)", color: B.cyan, fontFamily: B.font, fontWeight: 700, fontSize: 15, cursor: "pointer", boxShadow: "0 0 30px oklch(75% .15 195 / 0.15)", letterSpacing: "0.04em" }}>
        <Rocket size={16} /> LAUNCH LAUNCHOPS DASHBOARD
      </button>
    </div>
  );
}

// Main Onboarding page
export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<Record<string, string>>({});
  const [, navigate] = useLocation();

  const handleFinish = () => {
    localStorage.setItem("launchops_onboarding_complete", "1");
    navigate("/");
  };

  const cur = STEPS[step];
  const StepIcon = cur.icon;

  return (
    <div style={{ minHeight: "100vh", background: B.bg, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 20px", fontFamily: B.font }}>
      <div style={{ width: "100%", maxWidth: 680 }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 24 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "oklch(75% .15 195 / 0.1)", border: "1px solid oklch(75% .15 195 / 0.3)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 16px oklch(75% .15 195 / 0.2)" }}>
              <Shield size={16} color={B.cyan} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: B.tp, fontFamily: B.font, lineHeight: 1.2 }}>LaunchOps</div>
              <div style={{ fontSize: 9, color: B.cyan, letterSpacing: "0.14em", fontFamily: B.font, fontWeight: 600 }}>FOUNDER EDITION</div>
            </div>
          </div>
          <div style={{ width: 52, height: 52, borderRadius: 14, margin: "0 auto 14px", background: `${cur.color}10`, border: `1px solid ${cur.color}35`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 24px ${cur.color}20` }}>
            <StepIcon size={22} style={{ color: cur.color }} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: cur.color, letterSpacing: "-0.01em", margin: "0 0 6px", fontFamily: B.font, textShadow: `0 0 20px ${cur.color}40` }}>{cur.title}</h1>
          <p style={{ fontSize: 13, color: B.tm, margin: 0, fontFamily: B.font }}>{cur.subtitle}</p>
        </div>

        {/* Progress */}
        <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
          {STEPS.map((s, i) => <div key={s.id} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? cur.color : B.border, transition: "background 0.3s", boxShadow: i === step ? `0 0 8px ${cur.color}60` : "none" }} />)}
        </div>
        <div style={{ textAlign: "center", fontSize: 10, color: B.tm, fontFamily: B.font, fontWeight: 500, letterSpacing: "0.1em", marginBottom: 24 }}>STEP {step + 1} OF {STEPS.length}</div>

        {/* Card */}
        <div style={{ background: B.card, border: `1px solid ${B.border}`, borderRadius: 16, padding: "28px", boxShadow: "0 24px 60px rgba(0,0,0,0.4)" }}>
          {step === 0 && <StepWelcome onNext={() => setStep(1)} />}
          {step === 1 && <StepFounder onNext={(data) => { setProfile(data); setStep(2); }} />}
          {step === 2 && <StepInfrastructure onNext={() => setStep(3)} />}
          {step === 3 && <StepConfigure onNext={() => setStep(4)} founderEmail={profile.delivery_email || ""} />}
          {step === 4 && <StepKong onNext={() => setStep(5)} />}
          {step === 5 && <StepLaunch profile={profile} onFinish={handleFinish} />}
        </div>

        {/* Skip */}
        {step > 0 && step < 5 && (
          <div style={{ textAlign: "center", marginTop: 14 }}>
            <button onClick={() => setStep(s => s + 1)} style={{ background: "none", border: "none", color: B.tm, fontFamily: B.font, fontSize: 11, cursor: "pointer", letterSpacing: "0.08em" }}>SKIP THIS STEP</button>
          </div>
        )}
      </div>
      <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
