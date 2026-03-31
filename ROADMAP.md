# Founder Autopilot: Implementation Roadmap

**Prepared by:** Manus AI
**Date:** March 2026

This roadmap outlines the prioritized sequence for fully integrating the four operational directives (LaunchOps Stack, DynExecutiv MVP, Founder OS, Metrics Framework) into the Founder Autopilot platform.

---

## Phase 1: The LaunchOps Stack (Days 1-3)
**Goal:** Achieve the "deploy a revenue-ready business in <2 hours" objective.
*This is the highest priority as it enables immediate revenue generation and product validation.*

| Task | Component | Description | Est. Time |
| :--- | :--- | :--- | :--- |
| 1.1 | **Infrastructure** | Test and validate the new `docker-compose.yml` (WordPress, SuiteCRM, Mautic, Matomo, Vaultwarden). | 1 Day |
| 1.2 | **Agent Update** | Modify `webdev.py` (or create `infrastructure_agent.py`) to trigger `install.sh` via the `shell_tool.py` instead of building Next.js sites. | 1 Day |
| 1.3 | **E2E Test** | Run a complete test deployment using the orchestrator and verify all 5 endpoints are live within the 2-hour window. | 1 Day |

---

## Phase 2: Founder OS Rituals (Days 4-7)
**Goal:** Implement the daily operating system to ensure zero drift and enforce the "1 revenue action per day" rule.
*Implemented second to establish the daily cadence for managing the newly launched business.*

| Task | Component | Description | Est. Time |
| :--- | :--- | :--- | :--- |
| 2.1 | **Prompts** | Add Morning Agenda, Midday Check, and Evening Review prompts to `business_prompts.json`. | 1 Day |
| 2.2 | **Guardrails** | Update `orchestrator.py` to enforce the rule: reject daily tasks not tied to revenue (unless MRR > $20k). | 1 Day |
| 2.3 | **UI Update** | Build a new "Daily OS" view in the Next.js frontend (`frontend/src/pages/DailyOS.tsx`) to display the daily brief template. | 2 Days |

---

## Phase 3: DynExecutiv MVP (Days 8-12)
**Goal:** Deploy the decision and coordination engine to generate the daily and weekly briefs.

| Task | Component | Description | Est. Time |
| :--- | :--- | :--- | :--- |
| 3.1 | **Agent Logic** | Integrate the newly created `dynexecutiv.py` agent into the `task_graph.py` as a recurring task. | 1 Day |
| 3.2 | **Data Connectors** | Build API connectors in `tools/` to pull live data from SuiteCRM (pipeline) and Stripe (revenue). | 2 Days |
| 3.3 | **Brief Generation** | Wire the data connectors to the DynExecutiv agent to populate the `daily_brief.md` and `weekly_brief.md` templates automatically. | 2 Days |

---

## Phase 4: Metrics Framework (Days 13-14)
**Goal:** Enforce the "cut it if it doesn't increase revenue or reduce cost" rule.

| Task | Component | Description | Est. Time |
| :--- | :--- | :--- | :--- |
| 4.1 | **Agent Logic** | Integrate the newly created `metrics_agent.py` into the weekly review cycle. | 1 Day |
| 4.2 | **Data Aggregation** | Connect the metrics agent to Matomo (conversion) and Mautic (CAC) data. | 1 Day |
| 4.3 | **Enforcement** | Configure the metrics agent to output hard "Cut" recommendations in the Weekly Brief when CAC > LTV. | 0.5 Days |

---

## Summary
*   **Total Estimated Time:** 14.5 Days (1 Sprint)
*   **Outcome:** Founder Autopilot transitions from a one-time "launch" tool into a continuous, daily "Operating System" that launches businesses, dictates daily revenue actions, and ruthlessly cuts unprofitable tools.
