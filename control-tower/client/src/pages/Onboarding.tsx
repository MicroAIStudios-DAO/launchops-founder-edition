import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowRight,
  Bot,
  Check,
  ChevronRight,
  Cpu,
  Globe,
  Key,
  Layers,
  Rocket,
  Shield,
  Sparkles,
  Terminal,
  User,
  Zap,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

// ── Step definitions ──────────────────────────────────────────────────────────
const STEPS = [
  {
    id: "welcome",
    title: "Welcome to LaunchOps",
    subtitle: "Your AI-powered business operating system",
    icon: Rocket,
    color: "var(--neon-cyan)",
  },
  {
    id: "founder",
    title: "Tell Atlas About You",
    subtitle: "5 questions — Atlas personalizes everything to your vision",
    icon: User,
    color: "var(--neon-blue)",
  },
  {
    id: "infrastructure",
    title: "Your Stack Is Running",
    subtitle: "6 services deployed and ready for configuration",
    icon: Layers,
    color: "var(--neon-purple)",
  },
  {
    id: "kong",
    title: "Activate KONG Team",
    subtitle: "Auto-provision all service accounts — hands-free",
    icon: Key,
    color: "var(--neon-yellow)",
  },
  {
    id: "launch",
    title: "Launch the Pipeline",
    subtitle: "Atlas orchestrates all 19 agents to build your business",
    icon: Zap,
    color: "var(--neon-green)",
  },
];

const ATLAS_MESSAGES: Record<string, string[]> = {
  welcome: [
    "I'm Atlas — your AI orchestrator. I coordinate 19 specialized agents that handle every aspect of launching and running your business.",
    "From legal formation to payment processing, from email automation to investor readiness — I run the full stack so you can focus on the vision.",
    "This setup takes about 10 minutes. After that, your entire business infrastructure runs on autopilot.",
  ],
  founder: [
    "I need to understand your vision before I can optimize the pipeline for you.",
    "These answers train every agent in the fleet — your business name, structure, goals, and preferences become the operating context for the entire system.",
    "The more specific you are, the more precisely I can execute. Every agent will use this profile.",
  ],
  infrastructure: [
    "Your Docker stack is live. WordPress, SuiteCRM, Mautic, Matomo, Vaultwarden, and MariaDB are all running on your Vultr server.",
    "Each service needs to be configured with your credentials. The KONG team handles this automatically in the next step.",
    "You can monitor all services in real time from the Overview panel. Status updates every 8 seconds.",
  ],
  kong: [
    "KONG stands for Keep ON Guard. It's a two-agent team: CredentialForge creates all your usernames and passwords, KeyKeeper handles every email verification and OTP automatically.",
    "You never touch a signup form. KONG navigates to each service, fills in the forms, retrieves the verification codes from a temporary inbox, and stores everything encrypted in your vault.",
    "At the end, all credentials are delivered to your email. The temp inbox is discarded. You retain full control.",
  ],
  launch: [
    "The pipeline runs 9 stages in sequence: intake → auth → formation → infrastructure → legal → payments → funding → coaching → growth.",
    "Each stage activates the relevant agents. You can run the full pipeline or trigger individual stages from the Controls panel.",
    "You can monitor every agent's status, last run time, and output from the Agent Fleet panel at any time.",
  ],
};

const INFRA_SERVICES = [
  { name: "WordPress", port: 8080, color: "var(--neon-blue)", desc: "CMS & website" },
  { name: "SuiteCRM", port: 8081, color: "var(--neon-cyan)", desc: "Customer relationships" },
  { name: "Mautic", port: 8082, color: "var(--neon-purple)", desc: "Email marketing" },
  { name: "Matomo", port: 8083, color: "var(--neon-green)", desc: "Analytics" },
  { name: "Vaultwarden", port: 8000, color: "var(--neon-yellow)", desc: "Password vault" },
  { name: "MariaDB", port: 3306, color: "var(--neon-red)", desc: "Database" },
];

const KONG_SERVICES = [
  "WordPress", "SuiteCRM", "Mautic", "Matomo", "Vaultwarden",
  "GitHub", "Stripe", "Mailgun", "Cloudflare", "OpenAI",
];

// ── Atlas typing animation ────────────────────────────────────────────────────
function AtlasMessage({ text, delay = 0 }: { text: string; delay?: number }) {
  const [displayed, setDisplayed] = useState("");
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  useEffect(() => {
    if (!started) return;
    let i = 0;
    setDisplayed("");
    const interval = setInterval(() => {
      if (i < text.length) {
        setDisplayed(text.slice(0, i + 1));
        i++;
      } else {
        clearInterval(interval);
      }
    }, 12);
    return () => clearInterval(interval);
  }, [started, text]);

  if (!started) return null;

  return (
    <div
      style={{
        background: "rgba(0,245,255,0.04)",
        border: "1px solid rgba(0,245,255,0.12)",
        borderRadius: 10,
        padding: "14px 18px",
        marginBottom: 12,
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: 13,
        color: "var(--text-secondary)",
        lineHeight: 1.7,
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -1,
          left: 16,
          background: "var(--bg-void)",
          padding: "0 6px",
          fontSize: 10,
          color: "var(--neon-cyan)",
          letterSpacing: "0.1em",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <Bot size={9} />
        ATLAS
      </div>
      {displayed}
      {displayed.length < text.length && (
        <span
          style={{
            display: "inline-block",
            width: 8,
            height: 14,
            background: "var(--neon-cyan)",
            marginLeft: 2,
            animation: "blink 0.7s infinite",
          }}
        />
      )}
    </div>
  );
}

// ── Step: Welcome ─────────────────────────────────────────────────────────────
function StepWelcome({ onNext }: { onNext: () => void }) {
  const msgs = ATLAS_MESSAGES.welcome;
  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        {msgs.map((m, i) => (
          <AtlasMessage key={i} text={m} delay={i * 1800} />
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
          marginBottom: 28,
        }}
      >
        {[
          { icon: Bot, label: "19 AI Agents", sub: "Specialized for every task", color: "var(--neon-cyan)" },
          { icon: Layers, label: "6 Services", sub: "Running on your server", color: "var(--neon-blue)" },
          { icon: Shield, label: "Full Control", sub: "Your data, your server", color: "var(--neon-green)" },
        ].map(({ icon: Icon, label, sub, color }) => (
          <div
            key={label}
            style={{
              background: "rgba(255,255,255,0.02)",
              border: `1px solid ${color}30`,
              borderRadius: 10,
              padding: "16px 14px",
              textAlign: "center",
            }}
          >
            <Icon size={22} style={{ color, marginBottom: 8 }} />
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", fontFamily: "'Orbitron', sans-serif" }}>
              {label}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, fontFamily: "'Share Tech Mono', monospace" }}>
              {sub}
            </div>
          </div>
        ))}
      </div>

      <button className="btn-cyber" onClick={onNext} style={{ width: "100%", justifyContent: "center", gap: 8, padding: "14px 20px", fontSize: 13 }}>
        BEGIN SETUP <ArrowRight size={14} />
      </button>
    </div>
  );
}

// ── Step: Founder Profile ─────────────────────────────────────────────────────
function StepFounder({ onNext }: { onNext: (data: Record<string, string>) => void }) {
  const msgs = ATLAS_MESSAGES.founder;
  const [form, setForm] = useState({
    business_name: "",
    business_type: "",
    description: "",
    founder_name: "",
    delivery_email: "",
  });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (!form.business_name || !form.founder_name || !form.delivery_email) return;
    setSubmitted(true);
    setTimeout(() => onNext(form), 800);
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        {msgs.map((m, i) => (
          <AtlasMessage key={i} text={m} delay={i * 1400} />
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 24 }}>
        {[
          { key: "founder_name", label: "YOUR NAME", placeholder: "e.g. Marcus Williams" },
          { key: "business_name", label: "BUSINESS NAME", placeholder: "e.g. MicroAI Studios" },
          { key: "business_type", label: "BUSINESS TYPE", placeholder: "e.g. AI SaaS, Consulting, E-commerce" },
          { key: "description", label: "WHAT YOU'RE BUILDING", placeholder: "One sentence — what problem do you solve?" },
          { key: "delivery_email", label: "DELIVERY EMAIL", placeholder: "Where to send credentials & reports" },
        ].map(({ key, label, placeholder }) => (
          <div key={key}>
            <div style={{ fontSize: 10, color: "var(--neon-cyan)", fontFamily: "'Share Tech Mono', monospace", letterSpacing: "0.12em", marginBottom: 6 }}>
              {label}
            </div>
            <input
              type={key === "delivery_email" ? "email" : "text"}
              value={form[key as keyof typeof form]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              placeholder={placeholder}
              style={{
                width: "100%",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(0,245,255,0.2)",
                borderRadius: 8,
                padding: "10px 14px",
                color: "var(--text-primary)",
                fontFamily: "'Share Tech Mono', monospace",
                fontSize: 13,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
        ))}
      </div>

      <button
        className="btn-cyber"
        onClick={handleSubmit}
        disabled={!form.business_name || !form.founder_name || !form.delivery_email || submitted}
        style={{ width: "100%", justifyContent: "center", gap: 8, padding: "14px 20px", fontSize: 13 }}
      >
        {submitted ? <><Check size={14} /> PROFILE SAVED</> : <>SAVE PROFILE <ArrowRight size={14} /></>}
      </button>
    </div>
  );
}

// ── Step: Infrastructure ──────────────────────────────────────────────────────
function StepInfrastructure({ onNext }: { onNext: () => void }) {
  const msgs = ATLAS_MESSAGES.infrastructure;
  const { data: services } = trpc.services.latest.useQuery(undefined, { refetchInterval: 5000 });

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        {msgs.map((m, i) => (
          <AtlasMessage key={i} text={m} delay={i * 1400} />
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
        {INFRA_SERVICES.map((svc) => {
          const live = (services || []).find((s: any) => s.service === svc.name);
          const status = live?.status || "down";
          const statusColor = status === "healthy" ? "var(--neon-green)" : status === "warning" ? "var(--neon-yellow)" : "var(--neon-red)";
          const statusLabel = status === "healthy" ? "ONLINE" : status === "warning" ? "WARNING" : "OFFLINE";

          return (
            <div
              key={svc.name}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "rgba(255,255,255,0.02)",
                border: `1px solid ${svc.color}20`,
                borderRadius: 8,
                padding: "12px 16px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span className={`status-dot ${status}`} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", fontFamily: "'Share Tech Mono', monospace" }}>
                    {svc.name}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'Share Tech Mono', monospace" }}>
                    {svc.desc} · :{svc.port}
                  </div>
                </div>
              </div>
              <span style={{ fontSize: 10, color: statusColor, fontFamily: "'Share Tech Mono', monospace", letterSpacing: "0.1em" }}>
                {statusLabel}
              </span>
            </div>
          );
        })}
      </div>

      <button className="btn-cyber" onClick={onNext} style={{ width: "100%", justifyContent: "center", gap: 8, padding: "14px 20px", fontSize: 13 }}>
        INFRASTRUCTURE CONFIRMED <ArrowRight size={14} />
      </button>
    </div>
  );
}

// ── Step: KONG ────────────────────────────────────────────────────────────────
function StepKong({ onNext }: { onNext: () => void }) {
  const msgs = ATLAS_MESSAGES.kong;
  const [selected, setSelected] = useState<string[]>(KONG_SERVICES);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [results, setResults] = useState<Record<string, boolean>>({});

  const runKong = trpc.agents.runAccountCreation.useMutation({
    onSuccess: (data: any) => {
      const r: Record<string, boolean> = {};
      for (const [svc, res] of Object.entries(data?.results || {})) {
        r[svc] = (res as any)?.success ?? false;
      }
      setResults(r);
      setRunning(false);
      setDone(true);
    },
    onError: () => {
      setRunning(false);
    },
  });

  const handleRun = () => {
    setRunning(true);
    runKong.mutate({ services: selected });
  };

  const toggle = (svc: string) => {
    setSelected((s) => s.includes(svc) ? s.filter((x) => x !== svc) : [...s, svc]);
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        {msgs.map((m, i) => (
          <AtlasMessage key={i} text={m} delay={i * 1400} />
        ))}
      </div>

      {!done ? (
        <>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: "var(--neon-yellow)", fontFamily: "'Share Tech Mono', monospace", letterSpacing: "0.12em", marginBottom: 10 }}>
              SELECT SERVICES TO PROVISION
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {KONG_SERVICES.map((svc) => (
                <button
                  key={svc}
                  onClick={() => toggle(svc)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: `1px solid ${selected.includes(svc) ? "var(--neon-yellow)" : "rgba(255,255,255,0.1)"}`,
                    background: selected.includes(svc) ? "rgba(255,221,0,0.08)" : "transparent",
                    color: selected.includes(svc) ? "var(--neon-yellow)" : "var(--text-muted)",
                    fontFamily: "'Share Tech Mono', monospace",
                    fontSize: 11,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {selected.includes(svc) && <Check size={9} style={{ marginRight: 4 }} />}
                  {svc}
                </button>
              ))}
            </div>
          </div>

          <div
            style={{
              background: "rgba(255,221,0,0.04)",
              border: "1px solid rgba(255,221,0,0.15)",
              borderRadius: 8,
              padding: "12px 16px",
              marginBottom: 20,
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: 11,
              color: "var(--text-muted)",
              lineHeight: 1.6,
            }}
          >
            ⚡ KONG will open headless browsers, fill registration forms, and intercept all verification emails automatically. This runs on your Vultr server. Estimated time: 5–15 minutes depending on CAPTCHA encounters.
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              className="btn-cyber"
              onClick={handleRun}
              disabled={running || selected.length === 0}
              style={{ flex: 1, justifyContent: "center", gap: 8, padding: "14px 20px", fontSize: 13, borderColor: "var(--neon-yellow)", color: "var(--neon-yellow)" }}
            >
              {running ? (
                <><Cpu size={14} style={{ animation: "spin 1s linear infinite" }} /> KONG RUNNING...</>
              ) : (
                <><Zap size={14} /> ACTIVATE KONG</>
              )}
            </button>
            <button
              onClick={onNext}
              style={{
                padding: "14px 20px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "transparent",
                color: "var(--text-muted)",
                fontFamily: "'Share Tech Mono', monospace",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              SKIP FOR NOW
            </button>
          </div>
        </>
      ) : (
        <div>
          <div style={{ marginBottom: 16 }}>
            {Object.entries(results).map(([svc, ok]) => (
              <div
                key={svc}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 0",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  fontFamily: "'Share Tech Mono', monospace",
                  fontSize: 12,
                }}
              >
                <span style={{ color: ok ? "var(--neon-green)" : "var(--neon-red)" }}>
                  {ok ? "✓" : "✗"}
                </span>
                <span style={{ color: "var(--text-primary)" }}>{svc}</span>
                <span style={{ color: ok ? "var(--neon-green)" : "var(--neon-red)", marginLeft: "auto", fontSize: 10 }}>
                  {ok ? "PROVISIONED" : "NEEDS MANUAL SETUP"}
                </span>
              </div>
            ))}
          </div>
          <button className="btn-cyber" onClick={onNext} style={{ width: "100%", justifyContent: "center", gap: 8, padding: "14px 20px", fontSize: 13 }}>
            CONTINUE <ArrowRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Step: Launch ──────────────────────────────────────────────────────────────
function StepLaunch({ profile, onFinish }: { profile: Record<string, string>; onFinish: () => void }) {
  const msgs = ATLAS_MESSAGES.launch;
  const [, navigate] = useLocation();

  const PIPELINE_STAGES = [
    { id: "intake", label: "Intake", desc: "Business profile analysis", color: "var(--neon-cyan)" },
    { id: "auth", label: "Auth", desc: "KONG credential provisioning", color: "var(--neon-yellow)" },
    { id: "formation", label: "Formation", desc: "Entity structure optimization", color: "var(--neon-blue)" },
    { id: "infrastructure", label: "Infrastructure", desc: "Server & service configuration", color: "var(--neon-purple)" },
    { id: "legal", label: "Legal", desc: "Formation docs & compliance", color: "var(--neon-green)" },
    { id: "payments", label: "Payments", desc: "Stripe & billing setup", color: "var(--neon-cyan)" },
    { id: "funding", label: "Funding", desc: "Investor readiness report", color: "var(--neon-blue)" },
    { id: "coaching", label: "Coaching", desc: "Strategic session with ExecAI", color: "var(--neon-purple)" },
    { id: "growth", label: "Growth", desc: "GTM, content, analytics", color: "var(--neon-green)" },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        {msgs.map((m, i) => (
          <AtlasMessage key={i} text={m} delay={i * 1400} />
        ))}
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, color: "var(--neon-green)", fontFamily: "'Share Tech Mono', monospace", letterSpacing: "0.12em", marginBottom: 12 }}>
          PIPELINE STAGES
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {PIPELINE_STAGES.map((stage, i) => (
            <div
              key={stage.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 14px",
                background: "rgba(255,255,255,0.02)",
                border: `1px solid ${stage.color}15`,
                borderRadius: 8,
              }}
            >
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: `${stage.color}15`,
                  border: `1px solid ${stage.color}40`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 9,
                  color: stage.color,
                  fontFamily: "'Share Tech Mono', monospace",
                  flexShrink: 0,
                }}
              >
                {i + 1}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", fontFamily: "'Share Tech Mono', monospace" }}>
                  {stage.label}
                </div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'Share Tech Mono', monospace" }}>
                  {stage.desc}
                </div>
              </div>
              <ChevronRight size={12} style={{ color: stage.color, marginLeft: "auto" }} />
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <button
          className="btn-cyber"
          onClick={() => { onFinish(); navigate("/controls"); }}
          style={{ width: "100%", justifyContent: "center", gap: 8, padding: "14px 20px", fontSize: 13 }}
        >
          <Zap size={14} /> GO TO CONTROLS — RUN PIPELINE
        </button>
        <button
          onClick={() => { onFinish(); navigate("/"); }}
          style={{
            width: "100%",
            padding: "12px 20px",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.1)",
            background: "transparent",
            color: "var(--text-muted)",
            fontFamily: "'Share Tech Mono', monospace",
            fontSize: 12,
            cursor: "pointer",
            textAlign: "center",
          }}
        >
          GO TO DASHBOARD OVERVIEW
        </button>
      </div>
    </div>
  );
}

// ── Main Onboarding page ──────────────────────────────────────────────────────
export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<Record<string, string>>({});
  const [, navigate] = useLocation();

  // Persist onboarding completion
  const markComplete = () => {
    localStorage.setItem("launchops_onboarding_complete", "1");
  };

  const handleFinish = () => {
    markComplete();
    navigate("/");
  };

  const currentStep = STEPS[step];
  const StepIcon = currentStep.icon;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-void)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "40px 20px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 680 }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: `${currentStep.color}12`,
              border: `1px solid ${currentStep.color}40`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
              boxShadow: `0 0 30px ${currentStep.color}20`,
            }}
          >
            <StepIcon size={24} style={{ color: currentStep.color }} />
          </div>
          <h1
            className="font-display"
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: currentStep.color,
              letterSpacing: "0.06em",
              textShadow: `0 0 20px ${currentStep.color}40`,
              margin: "0 0 8px",
            }}
          >
            {currentStep.title}
          </h1>
          <p
            style={{
              fontSize: 13,
              color: "var(--text-muted)",
              fontFamily: "'Share Tech Mono', monospace",
              margin: 0,
            }}
          >
            {currentStep.subtitle}
          </p>
        </div>

        {/* Progress bar */}
        <div style={{ display: "flex", gap: 6, marginBottom: 32 }}>
          {STEPS.map((s, i) => (
            <div
              key={s.id}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 2,
                background: i <= step ? currentStep.color : "rgba(255,255,255,0.08)",
                transition: "background 0.3s ease",
                boxShadow: i === step ? `0 0 8px ${currentStep.color}60` : "none",
              }}
            />
          ))}
        </div>

        {/* Step counter */}
        <div
          style={{
            textAlign: "center",
            fontSize: 10,
            color: "var(--text-muted)",
            fontFamily: "'Share Tech Mono', monospace",
            letterSpacing: "0.12em",
            marginBottom: 24,
          }}
        >
          STEP {step + 1} OF {STEPS.length}
        </div>

        {/* Step content */}
        <div
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 14,
            padding: "28px 28px",
          }}
        >
          {step === 0 && <StepWelcome onNext={() => setStep(1)} />}
          {step === 1 && (
            <StepFounder
              onNext={(data) => {
                setProfile(data);
                setStep(2);
              }}
            />
          )}
          {step === 2 && <StepInfrastructure onNext={() => setStep(3)} />}
          {step === 3 && <StepKong onNext={() => setStep(4)} />}
          {step === 4 && <StepLaunch profile={profile} onFinish={handleFinish} />}
        </div>

        {/* Skip link */}
        {step > 0 && step < 4 && (
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <button
              onClick={() => setStep((s) => s + 1)}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                fontFamily: "'Share Tech Mono', monospace",
                fontSize: 11,
                cursor: "pointer",
                letterSpacing: "0.08em",
              }}
            >
              SKIP THIS STEP →
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
    </div>
  );
}
