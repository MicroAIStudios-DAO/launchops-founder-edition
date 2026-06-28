/**
 * Business Builder OS — UI Page
 * ──────────────────────────────
 * Three views:
 *   1. Interview   — 12-question founder interview → generates Build Spec
 *   2. Run         — 30-prompt execution with live progress tracking
 *   3. Assets      — Generated assets library with deploy buttons
 */

import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Brain,
  Rocket,
  FileText,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Circle,
  Loader2,
  RefreshCw,
  Send,
  Upload,
  Eye,
  Zap,
  BarChart3,
  Mail,
  Globe,
  Users,
  BookOpen,
  Scale,
  Target,
  TrendingUp,
  MessageSquare,
  Search,
} from "lucide-react";

// ─── Category Icons ───────────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  foundation: Brain,
  validation: Target,
  brand: Zap,
  website: Globe,
  content: BookOpen,
  email: Mail,
  product: BarChart3,
  launch: Rocket,
  growth: TrendingUp,
  legal: Scale,
  support: Users,
  outbound: MessageSquare,
  seo: Search,
  ads: TrendingUp,
  default: FileText,
};

const CATEGORY_COLORS: Record<string, string> = {
  foundation: "text-purple-400",
  validation: "text-blue-400",
  brand: "text-yellow-400",
  website: "text-cyan-400",
  content: "text-green-400",
  email: "text-orange-400",
  product: "text-pink-400",
  launch: "text-red-400",
  growth: "text-emerald-400",
  legal: "text-gray-400",
  support: "text-indigo-400",
  outbound: "text-violet-400",
  seo: "text-teal-400",
  ads: "text-amber-400",
  default: "text-slate-400",
};

function getCategoryIcon(category: string) {
  const key = category.toLowerCase().split(" ")[0];
  return CATEGORY_ICONS[key] || CATEGORY_ICONS.default;
}

function getCategoryColor(category: string) {
  const key = category.toLowerCase().split(" ")[0];
  return CATEGORY_COLORS[key] || CATEGORY_COLORS.default;
}

// ─── Interview View ───────────────────────────────────────────────────────────

function InterviewView({ onComplete }: { onComplete: () => void }) {
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [buildSpec, setBuildSpec] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: questions = [] } = trpc.businessBuilder.getQuestions.useQuery();
  const { data: latestInterview } = trpc.businessBuilder.getLatestInterview.useQuery();

  const startInterview = trpc.businessBuilder.startInterview.useMutation({
    onSuccess: (data) => {
      setBuildSpec(data.buildSpec);
      toast.success("Build Spec generated! Your business blueprint is ready.");
    },
    onError: (err) => {
      toast.error(`Failed to generate Build Spec: ${err.message}`);
    },
  });

  // Pre-fill if there's an existing interview
  useEffect(() => {
    if (latestInterview?.answers) {
      setAnswers(latestInterview.answers);
      if (latestInterview.buildSpec) {
        setBuildSpec(latestInterview.buildSpec);
      }
    }
  }, [latestInterview]);

  const currentQuestion = questions[currentQ];
  const totalQuestions = questions.length;
  const progress = totalQuestions > 0 ? ((currentQ + 1) / totalQuestions) * 100 : 0;
  const answeredCount = Object.values(answers).filter(Boolean).length;
  const allAnswered = answeredCount >= totalQuestions;

  function handleNext() {
    if (currentQ < totalQuestions - 1) {
      setCurrentQ((q) => q + 1);
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }

  function handlePrev() {
    if (currentQ > 0) {
      setCurrentQ((q) => q - 1);
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && e.metaKey) {
      handleNext();
    }
  }

  function handleSubmit() {
    if (!allAnswered) {
      toast.warning("Please answer all questions before generating your Build Spec.");
      return;
    }
    startInterview.mutate({ answers });
  }

  if (buildSpec) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Build Spec Generated</h2>
            <p className="text-sm text-slate-400">Your personalized business blueprint is ready</p>
          </div>
        </div>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <Brain className="w-4 h-4 text-purple-400" />
              Your Business Build Spec
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-64">
              <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">
                {buildSpec}
              </pre>
            </ScrollArea>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button
            onClick={() => setBuildSpec(null)}
            variant="outline"
            className="border-slate-600 text-slate-300"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Redo Interview
          </Button>
          <Button
            onClick={onComplete}
            className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500"
          >
            <Rocket className="w-4 h-4 mr-2" />
            Run Business Builder (30 Prompts)
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-slate-400">
          <span>Question {currentQ + 1} of {totalQuestions}</span>
          <span>{answeredCount} answered</span>
        </div>
        <Progress value={progress} className="h-1.5 bg-slate-700" />
      </div>

      {/* Question dots */}
      <div className="flex gap-1.5 flex-wrap">
        {questions.map((q, i) => (
          <button
            key={q.id}
            onClick={() => setCurrentQ(i)}
            className={`w-6 h-6 rounded-full text-xs font-medium transition-all ${
              i === currentQ
                ? "bg-purple-500 text-white scale-110"
                : answers[q.id]
                ? "bg-green-500/30 text-green-400 border border-green-500/50"
                : "bg-slate-700 text-slate-400 hover:bg-slate-600"
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      {/* Current question */}
      {currentQuestion && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="pt-6 space-y-4">
            <p className="text-white font-medium leading-relaxed">
              {currentQuestion.text}
            </p>
            <Textarea
              ref={textareaRef}
              value={answers[currentQuestion.id] || ""}
              onChange={(e) =>
                setAnswers((prev) => ({ ...prev, [currentQuestion.id]: e.target.value }))
              }
              onKeyDown={handleKeyDown}
              placeholder="Your answer... (⌘+Enter to advance)"
              className="bg-slate-900/50 border-slate-600 text-slate-200 placeholder:text-slate-500 resize-none min-h-[100px]"
              autoFocus
            />
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex gap-3">
        <Button
          onClick={handlePrev}
          disabled={currentQ === 0}
          variant="outline"
          className="border-slate-600 text-slate-300"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>

        {currentQ < totalQuestions - 1 ? (
          <Button
            onClick={handleNext}
            className="flex-1 bg-slate-700 hover:bg-slate-600 text-white"
          >
            Next
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={!allAnswered || startInterview.isPending}
            className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500"
          >
            {startInterview.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating Build Spec...
              </>
            ) : (
              <>
                <Brain className="w-4 h-4 mr-2" />
                Generate Build Spec
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Run View ─────────────────────────────────────────────────────────────────

function RunView({ runId, onViewAssets }: { runId: string; onViewAssets: () => void }) {
  const [shouldPoll, setShouldPoll] = useState(true);
  const { data: run, refetch } = trpc.businessBuilder.getRun.useQuery(
    { runId },
    { refetchInterval: shouldPoll ? 2000 : false }
  );

  useEffect(() => {
    if (run?.status && run.status !== "running" && run.status !== "pending") {
      setShouldPoll(false);
    }
  }, [run?.status]);
  const { data: assets = [] } = trpc.businessBuilder.getAssets.useQuery({ runId });

  const isRunning = run?.status === "running";
  const isComplete = run?.status === "complete";
  const progress =
    run?.promptsTotal && run.promptsTotal > 0
      ? Math.round(((run.promptsComplete || 0) / run.promptsTotal) * 100)
      : 0;

  return (
    <div className="space-y-6">
      {/* Status header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isRunning && (
            <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
          )}
          {isComplete && (
            <div className="w-2.5 h-2.5 rounded-full bg-blue-400" />
          )}
          <div>
            <p className="text-white font-medium">
              {isRunning ? "Running Business Builder..." : isComplete ? "Run Complete" : run?.status || "Pending"}
            </p>
            <p className="text-xs text-slate-400">
              {run?.promptsComplete || 0} / {run?.promptsTotal || 30} prompts complete
            </p>
          </div>
        </div>
        {isComplete && (
          <Button
            onClick={onViewAssets}
            className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-sm"
          >
            <Eye className="w-4 h-4 mr-2" />
            View All Assets
          </Button>
        )}
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <Progress value={progress} className="h-2 bg-slate-700" />
        <p className="text-xs text-slate-500 text-right">{progress}%</p>
      </div>

      {/* Current prompt */}
      {isRunning && run?.currentPrompt && (
        <Card className="bg-slate-800/50 border-purple-500/30">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
              <p className="text-sm text-slate-300">
                Running: <span className="text-purple-300 font-medium">{run.currentPrompt.replace(/_/g, " ")}</span>
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Asset grid — live status */}
      <div className="grid grid-cols-2 gap-2">
        {assets.map((asset) => {
          const Icon = getCategoryIcon(asset.category || "");
          const colorClass = getCategoryColor(asset.category || "");
          return (
            <div
              key={asset.promptId}
              className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs ${
                asset.status === "complete"
                  ? "bg-green-500/10 border-green-500/30"
                  : asset.status === "running"
                  ? "bg-purple-500/10 border-purple-500/30 animate-pulse"
                  : asset.status === "error"
                  ? "bg-red-500/10 border-red-500/30"
                  : "bg-slate-800/50 border-slate-700"
              }`}
            >
              {asset.status === "complete" ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
              ) : asset.status === "running" ? (
                <Loader2 className="w-3.5 h-3.5 text-purple-400 animate-spin shrink-0" />
              ) : (
                <Circle className="w-3.5 h-3.5 text-slate-600 shrink-0" />
              )}
              <span className={`truncate ${asset.status === "complete" ? "text-slate-300" : "text-slate-500"}`}>
                {asset.promptTitle}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Assets View ──────────────────────────────────────────────────────────────

function AssetsView({ runId }: { runId: string }) {
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const { data: assets = [], refetch } = trpc.businessBuilder.getAssets.useQuery({ runId });
  const { data: selectedAssetData } = trpc.businessBuilder.getAsset.useQuery(
    { runId, promptId: selectedAsset! },
    { enabled: !!selectedAsset }
  );

  const rerunPrompt = trpc.businessBuilder.rerunPrompt.useMutation({
    onSuccess: () => {
      toast.success("Re-running prompt...");
      setTimeout(() => refetch(), 3000);
    },
  });

  const deployAsset = trpc.businessBuilder.deployAsset.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        const deployedTo = (data as any).deployedTo || "service";
        toast.success(`Deployed to ${deployedTo}: ${data.detail}`);
      } else {
        toast.error(data.detail);
      }
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const completedAssets = assets.filter((a) => a.status === "complete");
  const categories = Array.from(new Set(assets.map((a) => a.category).filter(Boolean)));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">
          {completedAssets.length} of {assets.length} assets generated
        </p>
        <Badge variant="outline" className="border-green-500/50 text-green-400 text-xs">
          {completedAssets.length} Complete
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {assets.map((asset) => {
          const Icon = getCategoryIcon(asset.category || "");
          const colorClass = getCategoryColor(asset.category || "");
          const isSelected = selectedAsset === asset.promptId;

          return (
            <div key={asset.promptId} className="space-y-0">
              <button
                onClick={() => setSelectedAsset(isSelected ? null : asset.promptId)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                  isSelected
                    ? "bg-slate-700/80 border-purple-500/50"
                    : asset.status === "complete"
                    ? "bg-slate-800/50 border-slate-700 hover:border-slate-600"
                    : "bg-slate-900/30 border-slate-800 opacity-60"
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${colorClass}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200 truncate">{asset.promptTitle}</p>
                  <p className="text-xs text-slate-500">{asset.category}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {(asset as any).deployedTo && (asset as any).deployedTo !== "none" && (
                    <Badge variant="outline" className="border-blue-500/50 text-blue-400 text-xs py-0">
                      {(asset as any).deployedTo}
                    </Badge>
                  )}
                  {asset.status === "complete" ? (
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                  ) : asset.status === "running" ? (
                    <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                  ) : asset.status === "error" ? (
                    <div className="w-4 h-4 rounded-full bg-red-500/30 flex items-center justify-center">
                      <span className="text-red-400 text-xs">!</span>
                    </div>
                  ) : (
                    <Circle className="w-4 h-4 text-slate-600" />
                  )}
                </div>
              </button>

              {/* Expanded content */}
              {isSelected && selectedAssetData && (
                <div className="ml-4 border-l-2 border-purple-500/30 pl-4 pb-2">
                  <ScrollArea className="h-48 mt-2">
                    <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">
                      {selectedAssetData.content || "No content yet."}
                    </pre>
                  </ScrollArea>
                  <div className="flex gap-2 mt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-slate-600 text-slate-300 text-xs h-7"
                      onClick={() => rerunPrompt.mutate({ runId, promptId: asset.promptId })}
                      disabled={rerunPrompt.isPending}
                    >
                      <RefreshCw className="w-3 h-3 mr-1" />
                      Re-run
                    </Button>
                    {asset.autoDeployable && (
                      <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-500 text-xs h-7"
                        onClick={() => deployAsset.mutate({ runId, promptId: asset.promptId })}
                        disabled={deployAsset.isPending}
                      >
                        <Upload className="w-3 h-3 mr-1" />
                        Deploy to {asset.deployTo}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BusinessBuilder() {
  const [view, setView] = useState<"interview" | "run" | "assets">("interview");
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const { data: latestInterview } = trpc.businessBuilder.getLatestInterview.useQuery();
  const { data: runs = [] } = trpc.businessBuilder.listRuns.useQuery();

  const startRun = trpc.businessBuilder.startRun.useMutation({
    onSuccess: (data) => {
      setActiveRunId(data.runId);
      setView("run");
      toast.success("Business Builder started — 30 prompts running in sequence.");
    },
    onError: (err) => toast.error(`Failed to start run: ${err.message}`),
  });

  // Restore last run on mount
  useEffect(() => {
    if (runs.length > 0 && !activeRunId) {
      const lastRun = runs[0];
      setActiveRunId(lastRun.runId);
      if (lastRun.status === "running") {
        setView("run");
      } else if (lastRun.status === "complete") {
        setView("assets");
      }
    }
  }, [runs]);

  const hasInterview = !!latestInterview?.buildSpec;

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center">
                <Brain className="w-4 h-4 text-white" />
              </div>
              <h1 className="text-xl font-bold text-white">Business Builder OS</h1>
            </div>
            <p className="text-sm text-slate-400">
              30-prompt AI system that designs and deploys your entire business
            </p>
          </div>
          {hasInterview && (
            <Button
              onClick={() => startRun.mutate({})}
              disabled={startRun.isPending}
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500"
            >
              {startRun.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Rocket className="w-4 h-4 mr-2" />
              )}
              Run All 30 Prompts
            </Button>
          )}
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Interview", value: hasInterview ? "Complete" : "Pending", color: hasInterview ? "text-green-400" : "text-slate-500", icon: Brain },
            { label: "Runs", value: runs.length, color: "text-blue-400", icon: BarChart3 },
            { label: "Assets Generated", value: runs.reduce((sum, r) => sum + (r.promptsComplete || 0), 0), color: "text-purple-400", icon: FileText },
          ].map(({ label, value, color, icon: Icon }) => (
            <Card key={label} className="bg-slate-800/50 border-slate-700">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${color}`} />
                  <div>
                    <p className={`text-lg font-bold ${color}`}>{value}</p>
                    <p className="text-xs text-slate-500">{label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Navigation tabs */}
        <Tabs value={view} onValueChange={(v) => setView(v as any)}>
          <TabsList className="bg-slate-800 border border-slate-700 w-full">
            <TabsTrigger value="interview" className="flex-1 data-[state=active]:bg-slate-700">
              <Brain className="w-3.5 h-3.5 mr-1.5" />
              Interview
            </TabsTrigger>
            <TabsTrigger value="run" className="flex-1 data-[state=active]:bg-slate-700" disabled={!activeRunId}>
              <Rocket className="w-3.5 h-3.5 mr-1.5" />
              Run Progress
            </TabsTrigger>
            <TabsTrigger value="assets" className="flex-1 data-[state=active]:bg-slate-700" disabled={!activeRunId}>
              <FileText className="w-3.5 h-3.5 mr-1.5" />
              Assets
            </TabsTrigger>
          </TabsList>

          <TabsContent value="interview" className="mt-4">
            <Card className="bg-slate-900/50 border-slate-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-slate-300">
                  Founder Interview — 12 Questions
                </CardTitle>
                <p className="text-xs text-slate-500">
                  Answer these questions to generate your personalized Build Spec. Atlas uses your answers to tailor all 30 business prompts to your exact situation.
                </p>
              </CardHeader>
              <CardContent>
                <InterviewView
                  onComplete={() => {
                    startRun.mutate({});
                  }}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="run" className="mt-4">
            <Card className="bg-slate-900/50 border-slate-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-slate-300">
                  30-Prompt Execution
                </CardTitle>
              </CardHeader>
              <CardContent>
                {activeRunId ? (
                  <RunView
                    runId={activeRunId}
                    onViewAssets={() => setView("assets")}
                  />
                ) : (
                  <p className="text-sm text-slate-500 text-center py-8">
                    No run started yet. Complete the interview first.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="assets" className="mt-4">
            <Card className="bg-slate-900/50 border-slate-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-slate-300">
                  Generated Assets Library
                </CardTitle>
                <p className="text-xs text-slate-500">
                  Click any asset to preview its content. Assets marked with a deploy target can be pushed directly to Mautic, WordPress, or SuiteCRM.
                </p>
              </CardHeader>
              <CardContent>
                {activeRunId ? (
                  <AssetsView runId={activeRunId} />
                ) : (
                  <p className="text-sm text-slate-500 text-center py-8">
                    No run started yet.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Past runs */}
        {runs.length > 1 && (
          <Card className="bg-slate-900/50 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-300">Past Runs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {runs.slice(1).map((run) => (
                  <button
                    key={run.runId}
                    onClick={() => {
                      setActiveRunId(run.runId);
                      setView(run.status === "complete" ? "assets" : "run");
                    }}
                    className="w-full flex items-center justify-between p-2.5 rounded-lg bg-slate-800/50 border border-slate-700 hover:border-slate-600 transition-colors text-left"
                  >
                    <div>
                      <p className="text-xs text-slate-300 font-mono">{run.runId.slice(0, 8)}...</p>
                      <p className="text-xs text-slate-500">
                        {new Date(run.createdAt).toLocaleDateString()} — {run.promptsComplete}/{run.promptsTotal} prompts
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        run.status === "complete"
                          ? "border-green-500/50 text-green-400"
                          : run.status === "running"
                          ? "border-purple-500/50 text-purple-400"
                          : "border-slate-600 text-slate-400"
                      }`}
                    >
                      {run.status}
                    </Badge>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
