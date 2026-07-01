import { useEffect, useRef, useState } from "react";
import { Bot, ChevronDown, Minimize2, Send, Sparkles, X } from "lucide-react";

// ── Atlas system context ───────────────────────────────────────────────────────
const ATLAS_SYSTEM_PROMPT = `You are Atlas, the AI orchestrator for LaunchOps Founder Edition — a no-guardrails AI-powered business operating system.

You coordinate 23 specialized agents organized into 6 teams:
- KONG (A.P.E.SSH.I.T.T.): CredentialForge, KeyKeeper — automated account creation & 2FA handling
- Core Pipeline: FounderOS, BusinessBuilder, DynExecutiv, MetricsAgent, ContentEngine
- Infrastructure: SecurityAgent, WordPressAgent, MauticAgent, StripeAgent, FilesAgent (Nextcloud), RepoAgent (GitHub CI/CD)
- Legal & Formation: PaperworkAgent, ParalegalBot
- Intelligence: FundingIntelligence, ExecAICoach
- Operations: AnalyticsAgent, EmailAgent, GrowthAgent, ProjectAgent, SupportAgent (Chatwoot), DocumentaryTracker

The pipeline runs 9 stages in order: intake → auth → formation → infrastructure → legal → payments → funding → coaching → growth

The stack runs on Vultr: WordPress (:8080), SuiteCRM (:8081), Mautic (:8082), Matomo (:8083), Vaultwarden (:8000), MariaDB (:3306)

CLI commands use the venv: venv/bin/python3 launchops.py [command]
Key commands: kong, stage [name], task [agent] [task], health, status, launch

Your role: Guide the founder through setup, explain what each agent does, recommend next steps, troubleshoot issues, and help them understand the full system. Be direct, specific, and action-oriented. No corporate speak. Speak like a brilliant co-founder who built this system.`;

const QUICK_PROMPTS = [
  "What should I do first?",
  "How does KONG work?",
  "Run the full pipeline",
  "What agents are active?",
  "Explain the pipeline stages",
  "How do I check service status?",
];

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

function TypingDots() {
  return (
    <div style={{ display: "flex", gap: 4, padding: "4px 0" }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--neon-cyan)",
            animation: `typing-dot 1.2s infinite ${i * 0.2}s`,
          }}
        />
      ))}
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isUser ? "flex-end" : "flex-start",
        marginBottom: 12,
      }}
    >
      {!isUser && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            marginBottom: 4,
          fontSize: 9,
          color: "var(--neon-cyan)",
          fontFamily: "'Outfit', system-ui, sans-serif",
          fontWeight: 600,
          letterSpacing: "0.12em",
          }}
        >
          <Bot size={9} /> ATLAS
        </div>
      )}
      <div
        style={{
          maxWidth: "88%",
          padding: "10px 14px",
          borderRadius: isUser ? "10px 10px 2px 10px" : "2px 10px 10px 10px",
          background: isUser
            ? "rgba(0,245,255,0.10)"
            : "rgba(255,255,255,0.05)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          border: isUser
            ? "1px solid rgba(0,245,255,0.22)"
            : "1px solid rgba(255,255,255,0.08)",
          fontSize: 13,
          color: "var(--text-primary)",
          fontFamily: "'Outfit', system-ui, sans-serif",
          fontWeight: 400,
          lineHeight: 1.65,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {msg.content}
      </div>
      <div
        style={{
          fontSize: 9,
          color: "var(--text-muted)",
          fontFamily: "'Outfit', system-ui, sans-serif",
          marginTop: 3,
        }}
      >
        {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </div>
    </div>
  );
}

export default function AtlasAssistant() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Atlas online. I coordinate your 23-agent fleet and the full business pipeline.\n\nYour stack is running on Vultr. What do you need?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = async (text?: string) => {
    const content = (text || input).trim();
    if (!content || loading) return;

    const userMsg: Message = { role: "user", content, timestamp: new Date() };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/trpc/agents.atlasChat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          json: {
            messages: [
              ...messages.map((m) => ({ role: m.role, content: m.content })),
              { role: "user", content },
            ],
          },
        }),
      });

      const data = await response.json();
      const reply =
        data?.result?.data?.json?.reply ||
        data?.result?.data?.reply ||
        "I'm processing your request. Check the Controls panel to run agents directly.";

      setMessages((m) => [
        ...m,
        { role: "assistant", content: reply, timestamp: new Date() },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: "Connection issue. Use the Controls panel to run agents directly, or check the terminal on your Vultr server.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Floating trigger button
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          width: 52,
          height: 52,
          borderRadius: "50%",
          background: "rgba(8, 10, 18, 0.75)",
          backdropFilter: "blur(20px) saturate(160%)",
          WebkitBackdropFilter: "blur(20px) saturate(160%)",
          border: "1px solid rgba(0,245,255,0.3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          boxShadow: "var(--glow-primary), 0 4px 20px rgba(0,0,0,0.5)",
          transition: "all 0.2s ease",
          zIndex: 1000,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.boxShadow = "oklch(75% .15 195 / 0.35) 0 0 30px, 0 4px 20px rgba(0,0,0,0.4)";
          (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.06)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.boxShadow = "var(--glow-primary), 0 4px 20px rgba(0,0,0,0.5)";
          (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
        }}
        title="Ask Atlas"
      >
        <Bot size={22} style={{ color: "var(--neon-cyan)" }} />
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: "var(--neon-green)",
            border: "2px solid var(--bg-void)",
            boxShadow: "0 0 6px var(--neon-green)",
          }}
        />
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        width: 380,
        height: minimized ? 52 : 520,
        borderRadius: 14,
        background: "rgba(8, 10, 18, 0.82)",
        backdropFilter: "blur(28px) saturate(160%) brightness(0.85)",
        WebkitBackdropFilter: "blur(28px) saturate(160%) brightness(0.85)",
        border: "1px solid oklch(75% .15 195 / 0.2)",
        boxShadow: "oklch(75% .15 195 / 0.06) 0 0 0 1px inset, var(--glow-primary), 0 24px 80px rgba(0,0,0,0.75), 0 8px 32px rgba(0,0,0,0.6)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        transition: "height 0.25s cubic-bezier(0.23, 1, 0.32, 1)",
        zIndex: 1000,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderBottom: minimized ? "none" : "1px solid rgba(255,255,255,0.06)",
          background: "oklch(75% .15 195 / 0.04)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          cursor: minimized ? "pointer" : "default",
          flexShrink: 0,
        }}
        onClick={() => minimized && setMinimized(false)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: "oklch(75% .15 195 / 0.1)",
              border: "1px solid oklch(75% .15 195 / 0.28)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Bot size={14} style={{ color: "var(--neon-cyan)" }} />
          </div>
          <div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "var(--neon-cyan)",
                fontFamily: "'Outfit', system-ui, sans-serif",
                letterSpacing: "0.04em",
              }}
            >
              ATLAS
            </div>
            <div style={{ fontSize: 9, color: "var(--neon-green)", fontFamily: "'Outfit', system-ui, sans-serif", fontWeight: 500 }}>
              ● ONLINE · 23 AGENTS
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => setMinimized((m) => !m)}
            style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4 }}
          >
            {minimized ? <Sparkles size={13} /> : <Minimize2 size={13} />}
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4 }}
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {!minimized && (
        <>
          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "16px 16px 8px",
              scrollbarWidth: "thin",
              scrollbarColor: "rgba(0,245,255,0.2) transparent",
            }}
          >
            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} />
            ))}
            {loading && (
              <div style={{ display: "flex", alignItems: "flex-start", marginBottom: 12 }}>
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: "2px 10px 10px 10px",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <TypingDots />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick prompts */}
          {messages.length <= 2 && (
            <div
              style={{
                padding: "0 12px 8px",
                display: "flex",
                flexWrap: "wrap",
                gap: 5,
              }}
            >
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => sendMessage(prompt)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 5,
                    border: "1px solid oklch(75% .15 195 / 0.15)",
                    background: "oklch(75% .15 195 / 0.04)",
                    color: "var(--text-muted)",
                    fontFamily: "'Outfit', system-ui, sans-serif",
                    fontWeight: 500,
                    fontSize: 10,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color = "var(--neon-cyan)";
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "oklch(75% .15 195 / 0.35)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)";
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "oklch(75% .15 195 / 0.15)";
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div
            style={{
            padding: "10px 12px",
            borderTop: "1px solid rgba(255,255,255,0.07)",
            background: "rgba(0,0,0,0.25)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            display: "flex",
            gap: 8,
            alignItems: "flex-end",
            flexShrink: 0,
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Atlas anything..."
              rows={1}
              style={{
                flex: 1,
                background: "rgba(255,255,255,0.06)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                border: "1px solid oklch(75% .15 195 / 0.2)",
                borderRadius: 8,
                padding: "8px 12px",
                color: "var(--text-primary)",
                fontFamily: "'Outfit', system-ui, sans-serif",
                fontWeight: 400,
                fontSize: 13,
                outline: "none",
                resize: "none",
                lineHeight: 1.5,
                maxHeight: 80,
                overflowY: "auto",
              }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                border: "1px solid rgba(0,245,255,0.3)",
                background: input.trim() ? "rgba(0,245,255,0.1)" : "transparent",
                color: input.trim() ? "var(--neon-cyan)" : "var(--text-muted)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: input.trim() && !loading ? "pointer" : "not-allowed",
                transition: "all 0.15s",
                flexShrink: 0,
              }}
            >
              <Send size={13} />
            </button>
          </div>
        </>
      )}

      <style>{`
        @keyframes typing-dot {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
