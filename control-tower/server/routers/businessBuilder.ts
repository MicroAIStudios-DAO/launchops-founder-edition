/**
 * Business Builder OS — tRPC Router
 * ───────────────────────────────────
 * Procedures:
 *   businessBuilder.startInterview    — save 12-question answers + generate Build Spec
 *   businessBuilder.getLatestInterview — fetch latest interview + build spec
 *   businessBuilder.startRun          — kick off a full 30-prompt run (async)
 *   businessBuilder.getRun            — poll run status + progress
 *   businessBuilder.getAssets         — list all generated assets for a run
 *   businessBuilder.getAsset          — get a single asset's full content
 *   businessBuilder.rerunPrompt       — re-run a single prompt
 *   businessBuilder.listRuns          — list all historical runs
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  businessInterviewAnswers,
  businessBuilderRuns,
  generatedAssets,
  founderProfile,
} from "../../drizzle/schema";
import { desc, eq } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";
import {
  PROMPT_PACK,
  runFullPromptPack,
  runSinglePrompt,
  initializeRun,
} from "../business-builder-engine";
import { deployAsset } from "../automation-deployer";
import { randomUUID } from "crypto";

// ─── 12 Interview Questions ───────────────────────────────────────────────────

export const INTERVIEW_QUESTIONS = [
  { id: "q1", text: "What are your primary skills — technical, creative, or domain expertise?" },
  { id: "q2", text: "How many hours per week can you realistically dedicate to this business?" },
  { id: "q3", text: "What is your available starting budget (rough range is fine)?" },
  { id: "q4", text: "How would you describe your risk tolerance — conservative, moderate, or aggressive?" },
  { id: "q5", text: "What business model appeals to you most — subscription, one-time purchase, or hybrid?" },
  { id: "q6", text: "What topics could you talk about, teach, or create content around for 12 months without losing interest?" },
  { id: "q7", text: "Do you have an existing audience — email list, social following, or professional network?" },
  { id: "q8", text: "What unfair advantages do you have — industry experience, proprietary data, key relationships?" },
  { id: "q9", text: "Are there any business types or tactics you will not pursue (hard ethical limits)?" },
  { id: "q10", text: "What is your target monthly income goal from this business?" },
  { id: "q11", text: "What is your timeline to reach that income goal?" },
  { id: "q12", text: "Is there anything else about your situation, constraints, or goals that would help shape the right business for you?" },
];

// ─── Build Spec Generator ─────────────────────────────────────────────────────

async function generateBuildSpec(
  answers: Record<string, string>,
  profile: { businessName?: string | null; businessType?: string | null; industry?: string | null; targetMarket?: string | null; monthlyRevenueGoal?: string | null }
): Promise<string> {
  const answersText = INTERVIEW_QUESTIONS
    .map((q) => `Q: ${q.text}\nA: ${answers[q.id] || "Not answered"}`)
    .join("\n\n");

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are the Business Builder OS for LaunchOps. Generate a structured Build Spec from the founder's interview answers.

Founder Profile:
- Business Name: ${profile.businessName || "Not set"}
- Business Type: ${profile.businessType || "Not set"}
- Industry: ${profile.industry || "Not set"}
- Target Market: ${profile.targetMarket || "Not set"}
- Revenue Goal: ${profile.monthlyRevenueGoal || "Not set"}`,
      },
      {
        role: "user",
        content: `Here are my answers to the 12 interview questions:\n\n${answersText}\n\nGenerate a comprehensive Build Spec with:
1. **Ideal Customer Profile (ICP)** — specific, named persona with demographics, psychographics, and pain points
2. **Recommended Product Type** — ONE primary product type with clear justification
3. **Pricing Strategy** — specific price points for 3 tiers
4. **Go-to-Market** — ONE primary channel + ONE backup, with specific tactics
5. **Fulfillment & Support Strategy** — how to keep this semi-passive
6. **Success Metrics** — specific targets for conversion rate, CAC, LTV, churn
7. **Competitive Advantage** — what makes this uniquely positioned to win
8. **30-Day Launch Plan** — week-by-week milestones

Be specific, actionable, and tailored to this exact founder's situation. No generic advice.`,
      },
    ],
  });

  const rawContent = response?.choices?.[0]?.message?.content;
  return typeof rawContent === "string" ? rawContent : "Build Spec generation failed.";
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const businessBuilderRouter = router({
  // Get the 12 interview questions
  getQuestions: protectedProcedure.query(() => {
    return INTERVIEW_QUESTIONS;
  }),

  // Save interview answers and generate Build Spec
  startInterview: protectedProcedure
    .input(
      z.object({
        answers: z.record(z.string(), z.string()),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get founder profile for context
      const profiles = await db.select().from(founderProfile).limit(1);
      const profile = profiles[0] || {};

      // Generate Build Spec via LLM
      const buildSpec = await generateBuildSpec(input.answers, profile);

      // Save interview + build spec
      const [result] = await db.insert(businessInterviewAnswers).values({
        answers: JSON.stringify(input.answers),
        buildSpec,
        status: "complete",
      });

      return {
        id: (result as any).insertId,
        buildSpec,
        message: "Interview complete. Build Spec generated.",
      };
    }),

  // Get the latest interview and build spec
  getLatestInterview: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;

    const rows = await db
      .select()
      .from(businessInterviewAnswers)
      .orderBy(desc(businessInterviewAnswers.createdAt))
      .limit(1);

    if (rows.length === 0) return null;

    const row = rows[0];
    return {
      ...row,
      answers: JSON.parse(row.answers || "{}") as Record<string, string>,
    };
  }),

  // Start a full 30-prompt run (fires async, returns runId immediately)
  startRun: protectedProcedure
    .input(
      z.object({
        interviewId: z.number().optional(),
        promptIds: z.array(z.string()).optional(), // run subset of prompts
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get build spec from latest interview
      const interviews = await db
        .select()
        .from(businessInterviewAnswers)
        .orderBy(desc(businessInterviewAnswers.createdAt))
        .limit(1);

      const interview = interviews[0];
      const buildSpec = interview?.buildSpec || "";

      // Get founder profile
      const profiles = await db.select().from(founderProfile).limit(1);
      const profile = profiles[0] || {};

      const runId = randomUUID();

      // Create run record
      await db.insert(businessBuilderRuns).values({
        runId,
        interviewId: input.interviewId || interview?.id,
        status: "pending",
        promptsTotal: input.promptIds ? input.promptIds.length : 30,
        promptsComplete: 0,
      });

      // Fire async — don't await so we return immediately
      runFullPromptPack({
        runId,
        buildSpec,
        founderProfile: profile,
        promptIds: input.promptIds,
      }).catch((err) => {
        console.error("[BusinessBuilder] Run failed:", err);
      });

      return { runId, message: "Business Builder run started. Check progress with getRun." };
    }),

  // Poll run status
  getRun: protectedProcedure
    .input(z.object({ runId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const rows = await db
        .select()
        .from(businessBuilderRuns)
        .where(eq(businessBuilderRuns.runId, input.runId))
        .limit(1);

      return rows[0] || null;
    }),

  // List all runs
  listRuns: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];

    return db
      .select()
      .from(businessBuilderRuns)
      .orderBy(desc(businessBuilderRuns.createdAt))
      .limit(20);
  }),

  // Get all assets for a run
  getAssets: protectedProcedure
    .input(z.object({ runId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const assets = await db
        .select()
        .from(generatedAssets)
        .where(eq(generatedAssets.runId, input.runId))
        .orderBy(generatedAssets.id);

      // Enrich with prompt metadata
      return assets.map((asset) => {
        const promptDef = PROMPT_PACK.find((p) => p.id === asset.promptId);
        return {
          ...asset,
          autoDeployable: promptDef?.autoDeployable ?? false,
          deployTo: promptDef?.deployTo ?? "none",
        };
      });
    }),

  // Get a single asset's full content
  getAsset: protectedProcedure
    .input(z.object({ runId: z.string(), promptId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const rows = await db
        .select()
        .from(generatedAssets)
        .where(
          eq(generatedAssets.runId, input.runId)
        )
        .limit(50);

      return rows.find((r) => r.promptId === input.promptId) || null;
    }),

  // Re-run a single prompt
  rerunPrompt: protectedProcedure
    .input(z.object({ runId: z.string(), promptId: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const promptDef = PROMPT_PACK.find((p) => p.id === input.promptId);
      if (!promptDef) throw new Error(`Unknown prompt: ${input.promptId}`);

      // Get build spec
      const interviews = await db
        .select()
        .from(businessInterviewAnswers)
        .orderBy(desc(businessInterviewAnswers.createdAt))
        .limit(1);
      const buildSpec = interviews[0]?.buildSpec || "";

      // Get founder profile
      const profiles = await db.select().from(founderProfile).limit(1);
      const profile = profiles[0] || {};

      // Ensure asset row exists
      await initializeRun(input.runId, [input.promptId]);

      // Run async
      runSinglePrompt(promptDef, {
        runId: input.runId,
        buildSpec,
        founderProfile: profile,
      }).catch((err) => {
        console.error("[BusinessBuilder] Rerun failed:", err);
      });

      return { message: `Re-running ${promptDef.title}` };
    }),

  // Deploy a generated asset to its target service
  deployAsset: protectedProcedure
    .input(
      z.object({
        runId: z.string(),
        promptId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const rows = await db
        .select()
        .from(generatedAssets)
        .where(eq(generatedAssets.runId, input.runId))
        .limit(50);

      const asset = rows.find((r) => r.promptId === input.promptId);
      if (!asset) throw new Error("Asset not found");
      if (asset.status !== "complete") throw new Error("Asset is not complete yet");

      const promptDef = PROMPT_PACK.find((p) => p.id === input.promptId);
      const deployTarget = promptDef?.deployTo || "none";

      if (deployTarget === "none") {
        return { success: false, detail: "This asset has no deployment target" };
      }

      return deployAsset(input.runId, input.promptId, asset.content, deployTarget as any);
    }),

  // Get prompt pack metadata (for UI rendering)
  getPromptPack: protectedProcedure.query(() => {
    return PROMPT_PACK.map(({ id, title, category, autoDeployable, deployTo }) => ({
      id,
      title,
      category,
      autoDeployable,
      deployTo,
    }));
  }),
});
