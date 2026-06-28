/**
 * Business Builder OS Engine
 * ──────────────────────────
 * Executes all 30 Business Builder prompts sequentially using the founder's
 * Build Spec as context. Each prompt output is stored in generated_assets.
 * Deployment hooks auto-push relevant outputs to Mautic, WordPress, SuiteCRM.
 */

import { getDb } from "./db";
import { generatedAssets, businessBuilderRuns } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";
import * as proofguard from "./proofguard-client";

// ─── Prompt Pack (all 30 prompts) ────────────────────────────────────────────

export interface PromptDef {
  id: string;
  title: string;
  category: string;
  prompt: string;
  deployTo?: "mautic" | "wordpress" | "suitecrm" | "none";
  autoDeployable: boolean;
}

export const PROMPT_PACK: PromptDef[] = [
  {
    id: "prompt_0_setup",
    title: "Build Spec — Founder Interview Summary",
    category: "setup",
    autoDeployable: false,
    deployTo: "none",
    prompt: `You are the Business Builder OS for LaunchOps. Using the founder's interview answers and profile below, generate a structured "Build Spec" with:
- Ideal Customer Profile (ICP) hypothesis
- Product type recommendation (ONE primary)
- Pricing range
- Go-to-market (ONE primary channel + ONE backup)
- Fulfillment + support strategy
- Success metrics (conversion rate, CAC, LTV, churn targets)
- Unique competitive advantage

Output as clean structured Markdown with clear section headers.`,
  },
  {
    id: "prompt_1_concepts",
    title: "3 Business Concepts (Semi-Passive Optimized)",
    category: "model",
    autoDeployable: false,
    deployTo: "none",
    prompt: `Given the Build Spec, propose 3 online business concepts optimized for:
- Digital delivery and low customer support burden
- Subscription or repeatable revenue
- Clear ROI for customers (especially B2B)
- Minimal ongoing "new content treadmill"

For each concept include:
1. What it is (1 sentence)
2. Who buys it (ICP)
3. Pain it solves + measurable outcome
4. Why it can be low-touch (automation + boundaries)
5. Competitive moat
6. Pricing ladder (entry / core / premium)
7. 2 acquisition channels that fit it
8. MVP scope (can ship in 14 days)
9. Biggest risks + how to mitigate

End with a recommendation of ONE concept to pursue and why.`,
  },
  {
    id: "prompt_2_validation",
    title: "7-Day Validation Plan",
    category: "validation",
    autoDeployable: false,
    deployTo: "none",
    prompt: `Take the chosen concept and create a validation plan executable in 7 days.

Include:
- 3 testable hypotheses
- A landing page promise (headline + subheadline)
- 2 offers to test (one "cheap and easy," one "serious buyer")
- A simple pre-sale strategy (no audience vs with audience)
- 10 cold outreach message variations (email + LinkedIn)
- What success looks like (numbers)
- A "kill criteria" list (when we stop and pivot)

Output as a day-by-day checklist.`,
  },
  {
    id: "prompt_3_positioning",
    title: "Competitive Map + Positioning Wedge",
    category: "research",
    autoDeployable: false,
    deployTo: "none",
    prompt: `Build a competitor + alternatives map.

Deliver:
- 10 competitor/alternative categories (direct, indirect, DIY, agency, spreadsheet, etc.)
- What they promise
- Where they fail (gaps)
- A positioning wedge: "Only [my product] does X for Y without Z"
- 5 unique mechanisms
- 10 tagline options + 10 domain name ideas`,
  },
  {
    id: "prompt_4_offer",
    title: "Irresistible Offer Design",
    category: "offer",
    autoDeployable: false,
    deployTo: "none",
    prompt: `Design the core offer.

Must include:
- Outcome promise (specific + measurable)
- What's included
- What's NOT included (support boundaries)
- Onboarding flow (10 minutes max)
- Time-to-value (first win in <30 minutes)
- "Proof without proof" strategy
- Risk reversal (guarantee that won't get abused)
- Pricing recommendation (3 tiers)
- FAQ that prevents support tickets

Write it like a product page outline.`,
  },
  {
    id: "prompt_5_brand",
    title: "Brand Identity Kit",
    category: "brand",
    autoDeployable: false,
    deployTo: "none",
    prompt: `Create a complete brand kit:
- 20 brand name options
- 20 tagline options
- Voice/tone rules (5 bullet points)
- Brand values (5)
- Visual direction words (10)
- Logo brief
- Color + font suggestions
- 1-paragraph origin story`,
  },
  {
    id: "prompt_6_site_ia",
    title: "Website Information Architecture",
    category: "site",
    autoDeployable: false,
    deployTo: "wordpress",
    prompt: `Create the website structure (information architecture) for a conversion-focused site.

Include:
- Page list
- Goal of each page
- Key sections per page
- Primary CTA per page
- Navigation and footer links
- Minimum viable website version (1-page site)`,
  },
  {
    id: "prompt_7_home_copy",
    title: "Home Page Copy (High-Converting)",
    category: "copy",
    autoDeployable: true,
    deployTo: "wordpress",
    prompt: `Write the full Home page copy.

Constraints:
- Clear, punchy, no fluff
- Speaks to one ICP
- Focus on outcome, speed, ROI
- Include: hero, problem agitation, solution, how it works, features-to-benefits, social proof placeholders, pricing teaser, FAQ, final CTA

Deliver in clean Markdown with section headers.`,
  },
  {
    id: "prompt_8_pricing_copy",
    title: "Pricing Page Copy + Tier Strategy",
    category: "copy",
    autoDeployable: true,
    deployTo: "wordpress",
    prompt: `Create a pricing page that sells.

Include:
- Tier names + who each tier is for
- Feature comparison list
- "Choose this if…" bullets
- Add-ons (if any)
- Guarantee copy
- Objection handling
- FAQ
- Annual plan discount strategy and why`,
  },
  {
    id: "prompt_9_lead_magnet",
    title: "Lead Magnet + Opt-In + 5-Email Sequence",
    category: "funnel",
    autoDeployable: true,
    deployTo: "mautic",
    prompt: `Design a lead magnet that is insanely useful, fast to consume (<15 minutes), and naturally leads into the paid product.

Deliver:
- Lead magnet concept (title + promise)
- Full outline/content
- Opt-in page copy
- Thank-you page copy with next steps
- 5-email mini-sequence that delivers it and transitions into the offer

Format each email clearly with: Subject Line, Preview Text, Body, CTA.`,
  },
  {
    id: "prompt_10_product_blueprint",
    title: "Product Blueprint (MVP → V1 → V2)",
    category: "product",
    autoDeployable: false,
    deployTo: "none",
    prompt: `Create a product build plan:
- MVP (ship in 14 days): exact scope
- V1 (30 days): improvements
- V2 (90 days): moat features

For each: user stories, deliverables, and "definition of done."
Also include how we minimize support load.`,
  },
  {
    id: "prompt_11_toolkit_assets",
    title: "Template/Toolkit Assets",
    category: "product",
    autoDeployable: false,
    deployTo: "none",
    prompt: `Assume the product includes a template/toolkit component.

Generate:
- A table of contents
- The actual templates (in Markdown) with instructions
- 10 common user scenarios and "how to use the toolkit"
- A quickstart guide
- A troubleshooting guide
- A versioning plan`,
  },
  {
    id: "prompt_12_micro_saas_spec",
    title: "Micro-SaaS Technical Spec",
    category: "product",
    autoDeployable: false,
    deployTo: "none",
    prompt: `Create a micro-SaaS technical specification.

Include:
- Core workflow
- Data model (tables + fields)
- Key endpoints (API spec)
- Screen list
- Permissions/roles
- Error states + empty states
- Logging/analytics events

Keep it minimal: only what's required for paid value.`,
  },
  {
    id: "prompt_13_onboarding",
    title: "Onboarding That Kills Churn",
    category: "retention",
    autoDeployable: true,
    deployTo: "mautic",
    prompt: `Design onboarding that gets the user to "first win" in under 30 minutes.

Deliver:
- Welcome screen copy
- 5-step onboarding checklist
- First-run tutorial script
- Activation email (1) — include Subject, Preview, Body, CTA
- In-app tooltip copy (10)
- A "success plan" the user can follow for 7 days`,
  },
  {
    id: "prompt_14_automation_nocode",
    title: "Automation Architecture (No-Code Stack)",
    category: "automation",
    autoDeployable: false,
    deployTo: "none",
    prompt: `Create an automation plan using Stripe + Mautic + SuiteCRM.

Include:
- Payment → account provisioning flow
- Purchase → email onboarding sequence
- Failed payment → dunning sequence
- Support intake → categorization → auto responses
- Review/testimonial capture automation
- Cancellation survey automation

Deliver as:
1. A diagram described in text
2. Step-by-step setup checklist
3. Failure modes + how to monitor them`,
  },
  {
    id: "prompt_15_automation_dev",
    title: "Automation Architecture (Developer Stack)",
    category: "automation",
    autoDeployable: false,
    deployTo: "none",
    prompt: `Create an automation plan for the LaunchOps self-hosted stack (WordPress + SuiteCRM + Mautic + Matomo + Stripe).

Include:
- Auth flow
- Subscription entitlements
- Webhooks (Stripe events list)
- Database schema for subscriptions
- Email triggers
- Deployment steps
- Security basics
- Monitoring

Output as a technical checklist + webhook event table.`,
  },
  {
    id: "prompt_16_support",
    title: "Customer Support System",
    category: "ops",
    autoDeployable: true,
    deployTo: "suitecrm",
    prompt: `Build a low-touch support system.

Include:
- Support policy
- Help center structure (10 articles)
- 12 canned responses (formatted for SuiteCRM)
- Escalation rules
- When to offer a refund vs fix
- How to reduce tickets by 80%`,
  },
  {
    id: "prompt_17_legal",
    title: "Legal Starter Pack",
    category: "ops",
    autoDeployable: true,
    deployTo: "wordpress",
    prompt: `Draft plain-language versions of:
- Terms of Service outline
- Privacy policy outline
- Refund policy
- Disclaimer language
- Cookie notice basics

Keep it practical and clearly mark where a real lawyer should review.
Format each document as a complete WordPress page in Markdown.`,
  },
  {
    id: "prompt_18_channel_focus",
    title: "60-Day Channel Focus Plan",
    category: "marketing",
    autoDeployable: false,
    deployTo: "none",
    prompt: `Choose ONE primary acquisition channel for the first 60 days.
Justify with speed to revenue, cost, compounding, fit.
Then give a 60-day execution plan with weekly deliverables and specific daily actions.`,
  },
  {
    id: "prompt_19_seo",
    title: "SEO Content Calendar (30 Posts)",
    category: "marketing",
    autoDeployable: true,
    deployTo: "wordpress",
    prompt: `Create a complete SEO plan and content calendar:
- 6 pillar pages (full outlines)
- 30 supporting posts (titles + outlines + target keywords)
- Internal linking map
- CTA placement strategy
- 10 lead magnet placements
- "Money pages" and how content funnels into them
- 5 full example post outlines for highest-intent keywords

Format the 30-post calendar as a table with: Title | Keyword | Intent | Pillar | Word Count | CTA`,
  },
  {
    id: "prompt_20_ads",
    title: "Paid Ads Plan (Google + Meta)",
    category: "marketing",
    autoDeployable: false,
    deployTo: "none",
    prompt: `Create a paid ads plan covering both Google Search and Meta.

Include:
- Campaign structure for each platform
- Targeting strategy
- 15 headlines
- 10 descriptions
- 10 creative angles
- Tracking plan (events + conversions)
- Budget allocation recommendation
- Weekly optimization loop
- A/B test priority list`,
  },
  {
    id: "prompt_21_outbound",
    title: "Cold Outbound System",
    category: "marketing",
    autoDeployable: true,
    deployTo: "mautic",
    prompt: `Build a complete cold outbound system.

Include:
- Lead criteria (ICP scoring rubric)
- Lead sources (3 specific sources)
- 4-step email sequence (Subject, Preview, Body, CTA for each)
- 3-step LinkedIn sequence
- Personalization tokens
- Objection reply scripts (8 common objections)
- CRM workflow in SuiteCRM
- Call vs direct-to-checkout decision tree

Format the email sequences ready to import into Mautic.`,
  },
  {
    id: "prompt_22_partnerships",
    title: "Partnership + Affiliate Program",
    category: "marketing",
    autoDeployable: false,
    deployTo: "none",
    prompt: `Design a partnership program:
- Who we partner with (3 partner profiles)
- Offer to partners
- Outreach templates (email + LinkedIn)
- Affiliate terms
- Partner onboarding kit outline
- Co-webinar outline
- Commission structure recommendation`,
  },
  {
    id: "prompt_23_unit_econ",
    title: "Unit Economics Model ($10k → $30k/mo)",
    category: "scaling",
    autoDeployable: false,
    deployTo: "none",
    prompt: `Model the numbers needed to reach $10k/month and $30k/month.

Show scenarios: pricing mix, conversion rates, churn, CAC, LTV.

Deliver:
- Scenario table (3 scenarios per milestone)
- One metric that matters most
- Fastest lever to pull
- Break-even analysis
- 12-month revenue projection table`,
  },
  {
    id: "prompt_24_analytics",
    title: "Analytics + KPI Dashboard Spec",
    category: "scaling",
    autoDeployable: true,
    deployTo: "none",
    prompt: `Create a complete analytics spec for Matomo:
- Events to track (list with event names + properties)
- KPI definitions (10 core KPIs)
- Weekly review checklist
- "If X drops, do Y" playbook (10 scenarios)
- Matomo dashboard layout recommendation
- Funnel configuration spec`,
  },
  {
    id: "prompt_25_scaling",
    title: "90-Day Scaling Roadmap",
    category: "scaling",
    autoDeployable: false,
    deployTo: "none",
    prompt: `Create a scaling plan that preserves semi-passive operation.

Include:
- Next automation priorities
- First delegation hire (role + job description)
- Pricing increase strategy
- Expansion offers
- International considerations
- Community yes/no decision framework

Deliver as a week-by-week 90-day roadmap.`,
  },
  {
    id: "prompt_26_teardown",
    title: "Brutal Offer Teardown + Rewrite",
    category: "quality",
    autoDeployable: false,
    deployTo: "none",
    prompt: `Act as a skeptical buyer and top direct-response strategist.

First, tear down the offer — identify every weakness, objection, and credibility gap.
Then rewrite:
- Headline
- Core promise
- Pricing tiers
- Guarantee
- Top 10 FAQs

Be brutally honest. The goal is a bulletproof offer.`,
  },
  {
    id: "prompt_27_copy_polish",
    title: "Copy Polish — Sounds Like a Real Company",
    category: "quality",
    autoDeployable: false,
    deployTo: "none",
    prompt: `Polish the Home page copy and Pricing page copy to sound trustworthy, modern, and not hypey.

Improve:
- Scannability
- Trust signals
- Specificity (replace vague claims with numbers)
- CTA clarity

Return the revised copy + a list of every change made and why.`,
  },
  {
    id: "prompt_28_risk_audit",
    title: "Risk Audit",
    category: "quality",
    autoDeployable: false,
    deployTo: "none",
    prompt: `Run a comprehensive risk audit across:
- Legal risks
- Refund/chargeback exposure
- Platform dependency risks
- Privacy/data risks
- Claim substantiation risks
- Reputational risks
- Technical/security risks

For each risk: severity (1-10), likelihood (1-10), risk score, and specific mitigation steps.`,
  },
  {
    id: "prompt_29_one_shot_business_kit",
    title: "Full Business Kit (One-Shot Export)",
    category: "one-shot",
    autoDeployable: false,
    deployTo: "none",
    prompt: `Using everything generated in this Business Builder session, compile a complete "Ready-to-Deploy Business Kit":

1. Concept + positioning wedge
2. ICP + personas
3. Offer + tiers + pricing
4. Website IA + Home page copy + Pricing page copy
5. Lead magnet + opt-in copy + 5-email sequence
6. Product outline (MVP scope) and onboarding flow
7. Automation plan (Stripe + Mautic + SuiteCRM)
8. Support system (help center outline + 12 canned replies)
9. Go-to-market plan for 60 days (one channel focus)
10. Unit economics model to hit $10k/mo and $30k/mo
11. SEO content calendar (30 posts)
12. Cold outbound sequences
13. Risks + mitigations

Make it practical and immediately implementable. Format with clear headers and checklists.`,
  },
];

// ─── Engine ───────────────────────────────────────────────────────────────────

export interface RunOptions {
  runId: string;
  buildSpec: string;
  founderProfile: {
    businessName?: string | null;
    businessType?: string | null;
    industry?: string | null;
    targetMarket?: string | null;
    monthlyRevenueGoal?: string | null;
  };
  onProgress?: (promptId: string, status: "running" | "complete" | "error", content?: string) => void;
  promptIds?: string[]; // run only specific prompts (default: all)
}

/**
 * Build the system context injected into every prompt.
 */
function buildSystemContext(opts: RunOptions): string {
  const { founderProfile: fp, buildSpec } = opts;
  return `You are the Business Builder OS for LaunchOps — an AI-powered business operating system.

FOUNDER PROFILE:
- Business Name: ${fp.businessName || "Not set"}
- Business Type: ${fp.businessType || "Not set"}
- Industry: ${fp.industry || "Not set"}
- Target Market: ${fp.targetMarket || "Not set"}
- Monthly Revenue Goal: ${fp.monthlyRevenueGoal || "Not set"}

BUILD SPEC:
${buildSpec || "Not yet generated — this is the first prompt."}

INSTRUCTIONS:
- All outputs must be specific to this founder's context, not generic
- Use the founder's business type and industry to tailor every recommendation
- Be concrete, actionable, and implementation-ready
- Format output in clean Markdown with clear section headers
- Do not add disclaimers or caveats unless specifically requested`;
}

/**
 * Run a single prompt and store the result.
 */
export async function runSinglePrompt(
  promptDef: PromptDef,
  opts: RunOptions
): Promise<{ success: boolean; content: string; error?: string }> {
  const systemContext = buildSystemContext(opts);

  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    // Mark as running
    await db
      .update(generatedAssets)
      .set({ status: "running", updatedAt: new Date() })
      .where(and(eq(generatedAssets.runId, opts.runId), eq(generatedAssets.promptId, promptDef.id)));

    opts.onProgress?.(promptDef.id, "running");

    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemContext },
        { role: "user", content: promptDef.prompt },
      ],
    });

    const rawContent = response?.choices?.[0]?.message?.content;
    const content = typeof rawContent === "string" ? rawContent : "";

    // Store result
    await db
      .update(generatedAssets)
      .set({ status: "complete", content, updatedAt: new Date() })
      .where(and(eq(generatedAssets.runId, opts.runId), eq(generatedAssets.promptId, promptDef.id)));

    opts.onProgress?.(promptDef.id, "complete", content);

    // ProofGuard attestation (non-blocking)
    proofguard.submitAttestation({
      agent_id: "business_builder",
      action: `prompt_${promptDef.id}`,
      action_json: { promptTitle: promptDef.title, category: promptDef.category, runId: opts.runId },
      risk_tier: "low",
      imda_pillar: "Technical Robustness",
    }).catch(() => {});

    return { success: true, content };
  } catch (err: any) {
    const errorMessage = err?.message || "LLM call failed";

    await (await getDb())!
      .update(generatedAssets)
      .set({ status: "error", errorMessage, updatedAt: new Date() })
      .where(and(eq(generatedAssets.runId, opts.runId), eq(generatedAssets.promptId, promptDef.id)));

    opts.onProgress?.(promptDef.id, "error");
    return { success: false, content: "", error: errorMessage };
  }
}

/**
 * Initialize a run — create all 30 asset rows in "pending" state.
 */
export async function initializeRun(runId: string, promptIds?: string[]): Promise<void> {
  const prompts = promptIds
    ? PROMPT_PACK.filter((p) => promptIds.includes(p.id))
    : PROMPT_PACK;

  const rows = prompts.map((p) => ({
    runId,
    promptId: p.id,
    promptTitle: p.title,
    category: p.category,
    content: "",
    status: "pending" as const,
  }));

  const db = await getDb();
  if (!db) return;
  // Insert only if not already exists (idempotent)
  for (const row of rows) {
    const existing = await db
      .select()
      .from(generatedAssets)
      .where(and(eq(generatedAssets.runId, runId), eq(generatedAssets.promptId, row.promptId)))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(generatedAssets).values(row);
    }
  }
}

/**
 * Run all prompts sequentially, updating progress as each completes.
 * Returns when all prompts are done or an unrecoverable error occurs.
 */
export async function runFullPromptPack(opts: RunOptions): Promise<{
  success: boolean;
  completedCount: number;
  errorCount: number;
}> {
  const prompts = opts.promptIds
    ? PROMPT_PACK.filter((p) => opts.promptIds!.includes(p.id))
    : PROMPT_PACK;

  await initializeRun(opts.runId, opts.promptIds);
  const db = await getDb();
  if (!db) return { success: false, completedCount: 0, errorCount: prompts.length };

  // Update run status to running
  await db
    .update(businessBuilderRuns)
    .set({ status: "running", promptsTotal: prompts.length, updatedAt: new Date() })
    .where(eq(businessBuilderRuns.runId, opts.runId));

  let completedCount = 0;
  let errorCount = 0;
  let accumulatedContext = opts.buildSpec;

  for (const promptDef of prompts) {
    // Update current prompt in run tracker
    const dbInner = await getDb();
    if (!dbInner) continue;
    await dbInner
      .update(businessBuilderRuns)
      .set({ currentPrompt: promptDef.id, updatedAt: new Date() })
      .where(eq(businessBuilderRuns.runId, opts.runId));

    // For the one-shot prompt (29), inject all prior outputs as context
    const enrichedOpts = promptDef.id === "prompt_29_one_shot_business_kit"
      ? { ...opts, buildSpec: accumulatedContext }
      : opts;

    const result = await runSinglePrompt(promptDef, enrichedOpts);

    if (result.success) {
      completedCount++;
      // Accumulate context for downstream prompts
      accumulatedContext += `\n\n## ${promptDef.title}\n${result.content.slice(0, 2000)}`;

      // Update prompts_complete counter
      await (await getDb())!
        .update(businessBuilderRuns)
        .set({ promptsComplete: completedCount, updatedAt: new Date() })
        .where(eq(businessBuilderRuns.runId, opts.runId));
    } else {
      errorCount++;
      // Continue on error — don't abort the whole run for one failed prompt
    }
  }

  const finalStatus = errorCount === 0 ? "complete" : completedCount > 0 ? "complete" : "error";

  await (await getDb())!
    .update(businessBuilderRuns)
    .set({ status: finalStatus, currentPrompt: null, updatedAt: new Date() })
    .where(eq(businessBuilderRuns.runId, opts.runId));

  return { success: errorCount === 0, completedCount, errorCount };
}
