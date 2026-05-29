import { useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "../lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Activity,
  ChevronDown,
  CircleStop,
  ClipboardCopy,
  Download,
  Play,
  RotateCcw,
  Terminal,
} from "lucide-react";

// ── Command registry ──────────────────────────────────────────────────────────
const COMMANDS = [
  { id: "health",               label: "System Health Check",           group: "System",     danger: false },
  { id: "status",               label: "Full Stack Status",             group: "System",     danger: false },
  { id: "kong",                 label: "KONG — Full Account Creation",  group: "KONG",       danger: false },
  { id: "stage:auth",           label: "Stage: Auth (KONG)",            group: "Pipeline",   danger: false },
  { id: "stage:formation",      label: "Stage: Formation",              group: "Pipeline",   danger: false },
  { id: "stage:infrastructure", label: "Stage: Infrastructure",         group: "Pipeline",   danger: false },
  { id: "stage:legal",          label: "Stage: Legal",                  group: "Pipeline",   danger: false },
  { id: "stage:funding",        label: "Stage: Funding",                group: "Pipeline",   danger: false },
  { id: "stage:deploy",         label: "Stage: Deploy",                 group: "Pipeline",   danger: false },
  { id: "security",             label: "Security Audit",                group: "Agents",     danger: false },
  { id: "documentary",          label: "Documentary Tracker",           group: "Agents",     danger: false },
  { id: "launch",               label: "Full Launch Pipeline",          group: "System",     danger: true  },
] as const;

type CommandId = (typeof COMMANDS)[number]["id"];

// ── Line types & colours ──────────────────────────────────────────────────────
type LineKind = "start" | "line" | "error" | "done" | "system";

interface LogLine {
  id: number;
  kind: LineKind;
  text: string;
  ts: string;
}

function lineColor(kind: LineKind): string {
  switch (kind) {
    case "start":  return "text-cyan-400";
    case "error":  return "text-red-400";
    case "done":   return "text-emerald-400";
    case "system": return "text-yellow-400";
    default:       return "text-green-300";
  }
}

function linePrefix(kind: LineKind): string {
  switch (kind) {
    case "start":  return "▶ ";
    case "error":  return "✖ ";
    case "done":   return "✔ ";
    case "system": return "⚙ ";
    default:       return "  ";
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function PipelineMonitor() {
  const [selectedCmd, setSelectedCmd] = useState<CommandId>("health");
  const [lines, setLines] = useState<LogLine[]>([]);
  const [running, setRunning] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [runCount, setRunCount] = useState(0);

  const esRef = useRef<EventSource | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lineIdRef = useRef(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const rawOutputRef = useRef<string[]>([]);

  // Vault ingestion — fires automatically when a KONG run completes
  const vaultIngest = trpc.vault.ingest.useMutation();

  // ── Auto-scroll ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [lines, autoScroll]);

  // ── Detect manual scroll up → disable auto-scroll ───────────────────────
  const handleScroll = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  }, []);

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      esRef.current?.close();
    };
  }, []);

  // ── Add a log line ───────────────────────────────────────────────────────
  const addLine = useCallback((kind: LineKind, text: string) => {
    const ts = new Date().toLocaleTimeString("en-US", { hour12: false });
    setLines((prev) => [
      ...prev,
      { id: lineIdRef.current++, kind, text, ts },
    ]);
  }, []);

  // ── Start run ────────────────────────────────────────────────────────────
  const startRun = useCallback(() => {
    if (running) return;

    // Close any previous connection
    esRef.current?.close();

    setLines([]);
    setRunning(true);
    setRunCount((c) => c + 1);
    setAutoScroll(true);

    addLine("system", `Connecting to pipeline server…`);

    const url = `/api/pipeline/run?cmd=${encodeURIComponent(selectedCmd)}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener("start", (e) => {
      addLine("start", JSON.parse(e.data));
    });

    es.addEventListener("line", (e) => {
      const text = JSON.parse(e.data) as string;
      addLine("line", text);
      rawOutputRef.current.push(text);
    });

    es.addEventListener("error_msg", (e) => {
      addLine("error", JSON.parse(e.data));
    });

    es.addEventListener("done", (e) => {
      const msg = JSON.parse(e.data) as string;
      addLine("done", msg);
      setRunning(false);
      es.close();

      // Auto-ingest vault delivery when a KONG run completes
      const isKong = selectedCmd === "kong" || selectedCmd === "stage:auth";
      if (isKong && rawOutputRef.current.length > 0) {
        const runId = `kong-${Date.now()}`;
        const rawOutput = rawOutputRef.current.join("\n");
        vaultIngest.mutate(
          { runId, rawOutput },
          {
            onSuccess: (result) => {
              addLine("system", `[Vault] Credentials stored. Download token ready in Controls panel.`);
            },
            onError: () => {
              addLine("system", "[Vault] Could not save to vault — check Controls panel manually.");
            },
          }
        );
      }
      rawOutputRef.current = [];
    });

    // SSE onerror fires on connection close too — only show if still running
    es.onerror = () => {
      setRunning((r) => {
        if (r) {
          addLine("error", "[Monitor] Connection lost or process ended unexpectedly.");
        }
        return false;
      });
      es.close();
    };
  }, [running, selectedCmd, addLine]);

  // ── Stop run ─────────────────────────────────────────────────────────────
  const stopRun = useCallback(() => {
    esRef.current?.close();
    addLine("system", "[Monitor] Run cancelled by user.");
    setRunning(false);
  }, [addLine]);

  // ── Clear terminal ───────────────────────────────────────────────────────
  const clearTerminal = useCallback(() => {
    setLines([]);
  }, []);

  // ── Copy output ──────────────────────────────────────────────────────────
  const copyOutput = useCallback(() => {
    const text = lines.map((l) => `[${l.ts}] ${l.text}`).join("\n");
    navigator.clipboard.writeText(text).catch(() => {});
  }, [lines]);

  // ── Download log ─────────────────────────────────────────────────────────
  const downloadLog = useCallback(() => {
    const text = lines.map((l) => `[${l.ts}] ${l.text}`).join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `launchops-run-${selectedCmd}-${Date.now()}.log`;
    a.click();
    URL.revokeObjectURL(url);
  }, [lines, selectedCmd]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const cmdMeta = COMMANDS.find((c) => c.id === selectedCmd)!;
  const groups = Array.from(new Set(COMMANDS.map((c) => c.group)));

  return (
    <div className="flex flex-col h-full gap-4 p-6" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <Terminal className="w-6 h-6" style={{ color: "var(--neon-cyan)" }} />
        <h1 className="text-xl font-bold tracking-widest uppercase" style={{ color: "var(--neon-cyan)" }}>
          Pipeline Run Monitor
        </h1>
        {running && (
          <Badge
            className="animate-pulse ml-2"
            style={{ background: "var(--neon-green)", color: "#000", fontFamily: "inherit" }}
          >
            ● LIVE
          </Badge>
        )}
        {!running && runCount > 0 && (
          <Badge style={{ background: "transparent", border: "1px solid var(--neon-cyan)", color: "var(--neon-cyan)", fontFamily: "inherit" }}>
            IDLE
          </Badge>
        )}
      </div>

      {/* ── Controls bar ── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Command selector */}
        <Select value={selectedCmd} onValueChange={(v) => setSelectedCmd(v as CommandId)} disabled={running}>
          <SelectTrigger
            className="w-72 border"
            style={{
              background: "rgba(0,0,0,0.6)",
              borderColor: "var(--neon-cyan)",
              color: "var(--neon-cyan)",
              fontFamily: "inherit",
            }}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent style={{ background: "#0a0a0a", border: "1px solid var(--neon-cyan)", fontFamily: "inherit" }}>
            {groups.map((group) => (
              <div key={group}>
                <div className="px-2 py-1 text-xs uppercase tracking-widest opacity-50" style={{ color: "var(--neon-cyan)" }}>
                  {group}
                </div>
                {COMMANDS.filter((c) => c.group === group).map((c) => (
                  <SelectItem
                    key={c.id}
                    value={c.id}
                    style={{ color: c.danger ? "var(--neon-red, #ff4444)" : "var(--neon-green)", fontFamily: "inherit" }}
                  >
                    {c.label}
                  </SelectItem>
                ))}
              </div>
            ))}
          </SelectContent>
        </Select>

        {/* Run / Stop */}
        {!running ? (
          <Button
            onClick={startRun}
            className="gap-2 font-bold tracking-widest uppercase"
            style={{
              background: cmdMeta.danger ? "rgba(255,68,68,0.15)" : "rgba(0,255,136,0.12)",
              border: `1px solid ${cmdMeta.danger ? "var(--neon-red, #ff4444)" : "var(--neon-green)"}`,
              color: cmdMeta.danger ? "var(--neon-red, #ff4444)" : "var(--neon-green)",
              fontFamily: "inherit",
            }}
          >
            <Play className="w-4 h-4" />
            Run
          </Button>
        ) : (
          <Button
            onClick={stopRun}
            className="gap-2 font-bold tracking-widest uppercase"
            style={{
              background: "rgba(255,68,68,0.15)",
              border: "1px solid var(--neon-red, #ff4444)",
              color: "var(--neon-red, #ff4444)",
              fontFamily: "inherit",
            }}
          >
            <CircleStop className="w-4 h-4" />
            Stop
          </Button>
        )}

        {/* Utility buttons */}
        <div className="flex items-center gap-2 ml-auto">
          <Button
            variant="ghost"
            size="icon"
            onClick={clearTerminal}
            title="Clear terminal"
            disabled={running}
            style={{ color: "var(--neon-cyan)", opacity: 0.7 }}
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={copyOutput}
            title="Copy output"
            disabled={lines.length === 0}
            style={{ color: "var(--neon-cyan)", opacity: 0.7 }}
          >
            <ClipboardCopy className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={downloadLog}
            title="Download log"
            disabled={lines.length === 0}
            style={{ color: "var(--neon-cyan)", opacity: 0.7 }}
          >
            <Download className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => { setAutoScroll(true); bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }}
            title="Scroll to bottom"
            style={{ color: autoScroll ? "var(--neon-green)" : "var(--neon-cyan)", opacity: 0.7 }}
          >
            <ChevronDown className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* ── Command description ── */}
      <div
        className="text-xs tracking-wide px-3 py-2 rounded"
        style={{
          background: "rgba(0,255,255,0.04)",
          border: "1px solid rgba(0,255,255,0.12)",
          color: "rgba(0,255,255,0.6)",
          fontFamily: "inherit",
        }}
      >
        <Activity className="inline w-3 h-3 mr-1 mb-0.5" />
        {cmdMeta.label} — {cmdMeta.group}
        {cmdMeta.danger && (
          <span className="ml-3 font-bold" style={{ color: "var(--neon-red, #ff4444)" }}>
            ⚠ This runs the full launch pipeline. Ensure all stages are ready.
          </span>
        )}
      </div>

      {/* ── Terminal window ── */}
      <div
        className="flex-1 rounded-lg overflow-hidden flex flex-col"
        style={{
          background: "#050505",
          border: "1px solid rgba(0,255,136,0.25)",
          boxShadow: "0 0 30px rgba(0,255,136,0.06), inset 0 0 60px rgba(0,0,0,0.4)",
          minHeight: "300px",
        }}
      >
        {/* Terminal title bar */}
        <div
          className="flex items-center gap-2 px-4 py-2 border-b"
          style={{ borderColor: "rgba(0,255,136,0.15)", background: "rgba(0,255,136,0.04)" }}
        >
          <span className="w-3 h-3 rounded-full" style={{ background: "#ff5f57" }} />
          <span className="w-3 h-3 rounded-full" style={{ background: "#febc2e" }} />
          <span className="w-3 h-3 rounded-full" style={{ background: "#28c840" }} />
          <span className="ml-3 text-xs tracking-widest opacity-40" style={{ color: "var(--neon-green)" }}>
            launchops@atlas ~ {selectedCmd}
          </span>
          <span className="ml-auto text-xs opacity-30" style={{ color: "var(--neon-cyan)" }}>
            {lines.length} lines
          </span>
        </div>

        {/* Output area */}
        <ScrollArea className="flex-1" ref={viewportRef as any} onScrollCapture={handleScroll}>
          <div className="p-4 space-y-0.5 text-sm leading-relaxed">
            {lines.length === 0 && !running && (
              <div className="text-center py-16 opacity-30" style={{ color: "var(--neon-green)" }}>
                <Terminal className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-xs tracking-widest uppercase">Select a command and press Run</p>
              </div>
            )}
            {lines.map((l) => (
              <div key={l.id} className={`flex gap-3 ${lineColor(l.kind)}`}>
                <span className="opacity-30 text-xs shrink-0 pt-px w-20 text-right">{l.ts}</span>
                <span className="opacity-50 shrink-0">{linePrefix(l.kind)}</span>
                <span className="break-all whitespace-pre-wrap">{l.text}</span>
              </div>
            ))}
            {running && (
              <div className="flex gap-3 mt-1" style={{ color: "var(--neon-green)" }}>
                <span className="opacity-30 text-xs shrink-0 pt-px w-20 text-right" />
                <span className="animate-pulse">█</span>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>
      </div>

      {/* ── Footer stats ── */}
      <div className="flex items-center gap-6 text-xs opacity-40" style={{ color: "var(--neon-cyan)", fontFamily: "inherit" }}>
        <span>Runs this session: {runCount}</span>
        <span>Lines: {lines.length}</span>
        <span>Auto-scroll: {autoScroll ? "ON" : "OFF"}</span>
        {!autoScroll && (
          <button
            className="underline"
            onClick={() => { setAutoScroll(true); bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }}
          >
            re-enable
          </button>
        )}
      </div>
    </div>
  );
}
