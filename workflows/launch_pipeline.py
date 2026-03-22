"""
Launch Pipeline — LaunchOps Founder Edition
The master workflow: from Build Spec intake to revenue.
Orchestrates all agents in the correct sequence.
No guardrails. Pure execution.

Pipeline Stages:
  1. BUILD SPEC INTAKE — Define what you're building
  2. FORMATION — Entity structure, state selection, filing
  3. IP PROTECTION — Assignment, NDAs, trade secrets, patents
  4. INFRASTRUCTURE — Domain, hosting, WordPress, email, payments
  5. SECURITY — Hardening, passwords, SSL, 2FA
  6. FUNDING READINESS — Eligibility analysis, roadmap, grant search
  7. GO-TO-MARKET — Landing page, SEO, pricing, channels
  8. COACHING — ExecAI strategic review of entire setup
  9. DOCUMENTARY — Generate narrative from all milestones

Each stage logs milestones to the Documentary Tracker.
"""

from typing import Dict, List, Optional
from datetime import datetime
import json
import os


class LaunchPipeline:
    """
    Master launch pipeline. Runs all stages in sequence.
    Each stage uses the appropriate agent(s).
    """

    STAGES = [
        {
            "id": "build_spec",
            "name": "Build Spec Intake",
            "agent": "business_builder",
            "task_type": "build_spec_intake",
            "description": "Define your business — problem, solution, customer, revenue model.",
            "required": True,
        },
        {
            "id": "business_model",
            "name": "Business Model Canvas",
            "agent": "business_builder",
            "task_type": "business_model_canvas",
            "description": "Generate full Business Model Canvas from Build Spec.",
            "required": True,
        },
        {
            "id": "formation_analysis",
            "name": "Formation Structure Analysis",
            "agent": "funding_intelligence",
            "task_type": "formation_optimizer",
            "description": "Determine optimal entity type and state for maximum funding eligibility.",
            "required": True,
        },
        {
            "id": "funding_readiness",
            "name": "Funding Readiness Report",
            "agent": "funding_intelligence",
            "task_type": "funding_readiness_report",
            "description": "Analyze eligibility across all funding avenues.",
            "required": True,
        },
        {
            "id": "ip_audit",
            "name": "IP Audit",
            "agent": "paperwork_agent",
            "task_type": "ip_audit",
            "description": "Identify all IP assets and recommend protection strategies.",
            "required": True,
        },
        {
            "id": "ip_assignment",
            "name": "IP Assignment Agreement",
            "agent": "paperwork_agent",
            "task_type": "generate_ip_assignment",
            "description": "Generate IP Assignment Agreement (Founder → Entity).",
            "required": True,
        },
        {
            "id": "nda",
            "name": "NDA Generation",
            "agent": "paperwork_agent",
            "task_type": "generate_nda",
            "description": "Generate Mutual NDA for partner/vendor conversations.",
            "required": True,
        },
        {
            "id": "trade_secrets",
            "name": "Trade Secret Protocol",
            "agent": "paperwork_agent",
            "task_type": "generate_trade_secret_protocol",
            "description": "Document trade secrets and protection measures.",
            "required": True,
        },
        {
            "id": "ciia",
            "name": "CIIA Agreement",
            "agent": "paperwork_agent",
            "task_type": "generate_ciia",
            "description": "Generate CIIA for any future employees/contractors.",
            "required": True,
        },
        {
            "id": "privacy_policy",
            "name": "Privacy Policy",
            "agent": "paperwork_agent",
            "task_type": "generate_privacy_policy",
            "description": "Generate GDPR/CCPA compliant privacy policy.",
            "required": True,
        },
        {
            "id": "terms_of_service",
            "name": "Terms of Service",
            "agent": "paperwork_agent",
            "task_type": "generate_terms_of_service",
            "description": "Generate Terms of Service for the product.",
            "required": True,
        },
        {
            "id": "security_audit",
            "name": "Security Audit",
            "agent": "security_agent",
            "task_type": "audit",
            "description": "Audit server security and generate recommendations.",
            "required": False,
        },
        {
            "id": "wordpress_deploy",
            "name": "WordPress Deployment",
            "agent": "wordpress_agent",
            "task_type": "deploy_wordpress",
            "description": "Deploy WordPress site with Docker.",
            "required": False,
        },
        {
            "id": "stripe_setup",
            "name": "Stripe Payment Setup",
            "agent": "stripe_agent",
            "task_type": "setup_stripe",
            "description": "Configure Stripe for payment processing.",
            "required": False,
        },
        {
            "id": "go_to_market",
            "name": "Go-to-Market Strategy",
            "agent": "business_builder",
            "task_type": "go_to_market",
            "description": "Generate go-to-market strategy with first 100 customers plan.",
            "required": True,
        },
        {
            "id": "pricing",
            "name": "Pricing Strategy",
            "agent": "business_builder",
            "task_type": "pricing_strategy",
            "description": "Design pricing model and tier structure.",
            "required": True,
        },
        {
            "id": "competitive_analysis",
            "name": "Competitive Analysis",
            "agent": "business_builder",
            "task_type": "competitive_analysis",
            "description": "Analyze competitive landscape and positioning.",
            "required": True,
        },
        {
            "id": "operational_plan",
            "name": "90-Day Operational Plan",
            "agent": "business_builder",
            "task_type": "operational_plan",
            "description": "Week-by-week operational plan for first 90 days.",
            "required": True,
        },
        {
            "id": "coaching_review",
            "name": "ExecAI Strategic Review",
            "agent": "execai_coach",
            "task_type": "coaching_session",
            "description": "Harvard-style strategic review of entire setup.",
            "required": True,
        },
        {
            "id": "documentary",
            "name": "Documentary Narrative",
            "agent": "documentary_tracker",
            "task_type": "generate_narrative",
            "description": "Generate the documentary narrative from all milestones.",
            "required": True,
        },
    ]

    def __init__(self, orchestrator):
        self.orchestrator = orchestrator
        self.state_file = os.path.expanduser("~/.launchops/pipeline_state.json")
        self.state = self._load_state()

    def run(self, business_config: Dict, skip_infra: bool = False) -> Dict:
        """Run the full launch pipeline."""
        print(f"\n{'='*70}")
        print("  LAUNCHOPS FOUNDER EDITION — FULL LAUNCH PIPELINE")
        print(f"  {datetime.now().strftime('%B %d, %Y %I:%M %p')}")
        print(f"{'='*70}\n")

        results = {}
        stages = [s for s in self.STAGES if s["required"] or not skip_infra]

        for i, stage in enumerate(stages, 1):
            stage_id = stage["id"]

            # Skip completed stages
            if self.state.get(stage_id, {}).get("status") == "completed":
                print(f"  [{i}/{len(stages)}] {stage['name']} — ALREADY COMPLETED ✓")
                results[stage_id] = self.state[stage_id].get("result", {})
                continue

            print(f"\n  [{i}/{len(stages)}] {stage['name']}")
            print(f"  {stage['description']}")
            print(f"  {'─'*50}")

            try:
                # Build the task
                task = {
                    "type": stage["task_type"],
                    "business": business_config,
                    "business_config": business_config,
                    **business_config,
                }

                # Execute via orchestrator's registered agents
                agent = self.orchestrator.agents.get(stage["agent"])
                if not agent:
                    raise RuntimeError(f"Agent '{stage['agent']}' not registered")
                result = agent.execute(task)

                results[stage_id] = result

                # Log milestone
                self._log_milestone(stage, result)

                # Update state
                self.state[stage_id] = {
                    "status": "completed",
                    "completed_at": datetime.now().isoformat(),
                    "result": result,
                }
                self._save_state()

                status = "✓" if result.get("success", True) else "⚠"
                print(f"  → {status} {stage['name']} complete")

            except Exception as e:
                print(f"  → ✗ {stage['name']} FAILED: {e}")
                results[stage_id] = {"success": False, "error": str(e)}
                self.state[stage_id] = {
                    "status": "failed",
                    "failed_at": datetime.now().isoformat(),
                    "error": str(e),
                }
                self._save_state()

        # Summary
        completed = sum(1 for v in results.values() if v.get("success", True))
        print(f"\n{'='*70}")
        print(f"  PIPELINE COMPLETE: {completed}/{len(stages)} stages successful")
        print(f"{'='*70}\n")

        return {
            "success": completed == len(stages),
            "stages_completed": completed,
            "stages_total": len(stages),
            "results": results,
        }

    def run_stage(self, stage_id: str, business_config: Dict) -> Dict:
        """Run a single pipeline stage."""
        stage = next((s for s in self.STAGES if s["id"] == stage_id), None)
        if not stage:
            return {"success": False, "error": f"Unknown stage: {stage_id}"}

        task = {
            "type": stage["task_type"],
            "business": business_config,
            "business_config": business_config,
            **business_config,
        }

        agent = self.orchestrator.agents.get(stage["agent"])
        if not agent:
            return {"success": False, "error": f"Agent '{stage['agent']}' not registered"}
        result = agent.execute(task)

        self.state[stage_id] = {
            "status": "completed",
            "completed_at": datetime.now().isoformat(),
            "result": result,
        }
        self._save_state()

        return result

    def get_status(self) -> Dict:
        """Get pipeline status."""
        status = {}
        for stage in self.STAGES:
            sid = stage["id"]
            state = self.state.get(sid, {})
            status[sid] = {
                "name": stage["name"],
                "status": state.get("status", "pending"),
                "completed_at": state.get("completed_at"),
            }
        completed = sum(1 for s in status.values() if s["status"] == "completed")
        return {
            "stages": status,
            "completed": completed,
            "total": len(self.STAGES),
            "progress_pct": int(completed / len(self.STAGES) * 100),
        }

    def reset(self):
        """Reset pipeline state."""
        self.state = {}
        self._save_state()

    def _log_milestone(self, stage: Dict, result: Dict):
        """Log a pipeline milestone to the documentary tracker."""
        try:
            tracker = self.orchestrator.agents.get("documentary_tracker")
            if tracker:
                tracker.execute({
                    "type": "log_milestone",
                    "milestone_type": self._stage_to_milestone_type(stage["id"]),
                    "title": f"Pipeline: {stage['name']}",
                    "description": stage["description"],
                    "agent": stage["agent"],
                    "data": {"stage_id": stage["id"], "success": result.get("success", True)},
                })
        except Exception:
            pass

    def _stage_to_milestone_type(self, stage_id: str) -> str:
        mapping = {
            "build_spec": "decision",
            "business_model": "product",
            "formation_analysis": "formation",
            "funding_readiness": "funding",
            "ip_audit": "ip_protection",
            "ip_assignment": "ip_protection",
            "nda": "ip_protection",
            "trade_secrets": "ip_protection",
            "ciia": "ip_protection",
            "privacy_policy": "ip_protection",
            "terms_of_service": "ip_protection",
            "security_audit": "infrastructure",
            "wordpress_deploy": "infrastructure",
            "stripe_setup": "infrastructure",
            "go_to_market": "marketing",
            "pricing": "decision",
            "competitive_analysis": "decision",
            "operational_plan": "decision",
            "coaching_review": "coaching",
            "documentary": "ai_moment",
        }
        return mapping.get(stage_id, "decision")

    def _load_state(self) -> Dict:
        if os.path.exists(self.state_file):
            with open(self.state_file, "r") as f:
                return json.load(f)
        return {}

    def _save_state(self):
        os.makedirs(os.path.dirname(self.state_file), exist_ok=True)
        with open(self.state_file, "w") as f:
            json.dump(self.state, f, indent=2)
