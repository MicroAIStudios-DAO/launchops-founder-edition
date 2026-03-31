# Founder Autopilot: Strategic Alignment & Gap Analysis

**Prepared by:** Manus AI
**Date:** March 2026

This document maps the four core operational directives (LaunchOps Stack, DynExecutiv MVP, Founder OS, Metrics Framework) against the current state of the Founder Autopilot repository. It identifies existing capabilities, highlights critical gaps, and outlines the required extensions to align the codebase with these objectives.

---

## 1. LAUNCHOPS STACK
**Objective:** Deploy a revenue-ready business in <2 hours using a specific stack (WordPress, Stripe, SuiteCRM, Mautic, Matomo, Bitwarden).

### Current State
*   **Existing Capabilities:** Founder Autopilot currently has a `website_launcher.py` tool, but it is hardcoded to generate Next.js/React sites, not WordPress. It has a `stripe_agent.py` and `stripe_tool.py` capable of creating products and prices. It has a `shell_tool.py` capable of executing deployment scripts.
*   **Gaps:** The current repository lacks the Docker Compose infrastructure to deploy the requested 6-service stack. It also lacks the `install.sh` script and the specific checklist document.

### Required Alignment (Codebase Extensions)
1.  **Infrastructure:** Create `launchops_stack/docker-compose.yml` containing the 6 required services.
2.  **Deployment Script:** Create `launchops_stack/install.sh` for one-click deployment.
3.  **Documentation:** Create `launchops_stack/deployment_checklist.md`.
4.  **Agent Update:** Modify the `webdev.py` or create an `infrastructure_agent.py` to trigger this specific Docker deployment rather than defaulting to Next.js.

---

## 2. DYNEXECUTIV MVP
**Objective:** Ship a decision and coordination engine that produces daily "What Matters Now" agendas and weekly executive briefs based on CRM, Stripe, and content inputs.

### Current State
*   **Existing Capabilities:** The `orchestrator.py` agent is currently designed to run a one-time sequential setup pipeline (the 31 business prompts). It is not designed for continuous, daily operational looping.
*   **Gaps:** There is no "Decision Engine" agent. There are no data connectors to pull live CRM deals or content metrics (only basic Stripe integration exists). There are no templates for daily or weekly briefs.

### Required Alignment (Codebase Extensions)
1.  **New Agent:** Create `backend/app/agents/dynexecutiv.py` to act as the decision engine.
2.  **Templates:** Create `backend/app/templates/daily_brief.md` and `backend/app/templates/weekly_brief.md`.
3.  **Task Graph Update:** Add a new recurring task type in `task_graph.py` for "Daily Executive Briefing" that triggers the DynExecutiv agent.
4.  **Prompts:** Add specific prompts to `business_prompts.json` for analyzing CRM/Stripe data and outputting revenue-prioritized actions.

---

## 3. FOUNDER OS
**Objective:** Create a daily operating system with Morning, Midday, and Evening rituals, strictly focused on revenue actions.

### Current State
*   **Existing Capabilities:** The React frontend (`LaunchRun.tsx`) provides a dashboard for executing tasks, but it is structured around the initial "Launch" phase, not daily operations.
*   **Gaps:** No concept of "time of day" check-ins. No enforcement of the "1 revenue action + 1 proof artifact" rule.

### Required Alignment (Codebase Extensions)
1.  **New Prompts:** Add Founder OS ritual prompts (Morning Agenda, Midday Blockers, Evening Review) to the prompt library.
2.  **Guardrails:** Implement a check in the orchestrator that rejects any proposed daily task that does not directly tie to revenue (unless MRR > $20k).
3.  **UI Update:** The Next.js frontend will need a new "Daily OS" view separate from the "Launch" view.

---

## 4. METRICS FRAMEWORK
**Objective:** Track MRR, Conversion rate, Deployment time, CAC, LTV. Rule: If it doesn't increase revenue or reduce cost → cut it.

### Current State
*   **Existing Capabilities:** The system tracks task completion time, but not business metrics.
*   **Gaps:** No analytics aggregator agent. No database schema for storing time-series business metrics.

### Required Alignment (Codebase Extensions)
1.  **New Agent:** Create `backend/app/agents/metrics_agent.py` to poll Stripe (MRR, LTV), Matomo (Conversion), and Mautic (CAC).
2.  **Enforcement Logic:** Add logic to the `reviewer.py` or `dynexecutiv.py` to automatically flag and recommend cutting any tool or campaign where CAC > LTV or ROI is negative.
