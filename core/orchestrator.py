"""
Atlas Orchestrator — LaunchOps Founder Edition
The brain. Coordinates all agents through a stage-aware pipeline.
No trust boundary. No permission checks. Full Tier 3 local execution.

Stages:
  init → intake → formation → infrastructure → funding → coaching → growth → done
"""

import traceback
from datetime import datetime
from typing import Dict, List, Optional, Any, Callable

from .config import get_config, LaunchOpsConfig
from .context import SharedContext
from .credentials import get_vault


# ── Stage Definitions ─────────────────────────────────────────────────────

STAGES = [
    "init",
    "intake",          # Build Spec intake — define YOUR business
    "formation",       # Entity formation, EIN, bank, compliance
    "infrastructure",  # Docker stack, WordPress, Vaultwarden, Mautic
    "legal",           # Paperwork agent — legal docs package
    "payments",        # Stripe setup
    "funding",         # Funding intelligence report
    "coaching",        # ExecAI strategic review
    "growth",          # Go-to-market execution
    "done",
]


class AtlasOrchestrator:
    """
    Central orchestrator that drives the entire LaunchOps pipeline.
    Manages agent lifecycle, stage transitions, and error recovery.
    """

    def __init__(self, config: Optional[LaunchOpsConfig] = None):
        self.config = config or get_config()
        self.context = SharedContext()
        self.vault = get_vault()
        self.agents: Dict[str, Any] = {}
        self._stage_handlers: Dict[str, Callable] = {}
        self._hooks: Dict[str, List[Callable]] = {"pre_stage": [], "post_stage": []}

    # ── Agent Registration ────────────────────────────────────────────────

    def register_agent(self, name: str, agent: Any):
        """Register an agent. No permission checks — Tier 3."""
        self.agents[name] = agent
        self.context.log(f"Agent registered: {name}", agent="orchestrator")

    def register_stage_handler(self, stage: str, handler: Callable):
        """Register a handler function for a specific stage."""
        self._stage_handlers[stage] = handler

    def register_hook(self, hook_type: str, fn: Callable):
        """Register pre/post stage hooks."""
        self._hooks.setdefault(hook_type, []).append(fn)

    # ── Pipeline Execution ────────────────────────────────────────────────

    def run(self, start_stage: Optional[str] = None, end_stage: Optional[str] = None):
        """
        Run the full pipeline or a subset of stages.
        No guardrails. If an agent fails, log it and continue.
        """
        start_idx = STAGES.index(start_stage) if start_stage else 0
        end_idx = STAGES.index(end_stage) + 1 if end_stage else len(STAGES)
        stages_to_run = STAGES[start_idx:end_idx]

        print(f"\n{'='*60}")
        print(f"  LAUNCHOPS FOUNDER EDITION — ATLAS ORCHESTRATOR")
        print(f"  Run ID: {self.context.run_id}")
        print(f"  Stages: {' → '.join(stages_to_run)}")
        print(f"{'='*60}\n")

        self.context.log(f"Pipeline started: {stages_to_run}", agent="orchestrator")

        for stage in stages_to_run:
            self._execute_stage(stage)

        self.context.stage = "done"
        self._print_summary()
        return self.context.to_dict()

    def run_stage(self, stage: str):
        """Run a single stage."""
        if stage not in STAGES:
            raise ValueError(f"Unknown stage: {stage}. Valid: {STAGES}")
        self._execute_stage(stage)

    def _execute_stage(self, stage: str):
        """Execute a single stage with hooks and error handling."""
        print(f"\n{'─'*50}")
        print(f"  STAGE: {stage.upper()}")
        print(f"{'─'*50}")

        self.context.stage = stage

        # Pre-stage hooks
        for hook in self._hooks.get("pre_stage", []):
            try:
                hook(stage, self.context)
            except Exception as e:
                self.context.log_error(f"Pre-hook failed: {e}", agent="orchestrator")

        # Execute the stage handler
        handler = self._stage_handlers.get(stage)
        if handler:
            try:
                result = handler(self.context, self.agents, self.config)
                if result:
                    self.context.store_agent_output(f"stage_{stage}", result)
                print(f"  ✓ {stage} complete")
            except Exception as e:
                self.context.log_error(
                    f"Stage {stage} failed: {e}\n{traceback.format_exc()}",
                    agent="orchestrator",
                )
                print(f"  ✗ {stage} failed: {e}")
                print(f"    Continuing to next stage...")
        else:
            print(f"  ⊘ No handler registered for {stage}")

        # Post-stage hooks
        for hook in self._hooks.get("post_stage", []):
            try:
                hook(stage, self.context)
            except Exception as e:
                self.context.log_error(f"Post-hook failed: {e}", agent="orchestrator")

    # ── Status ────────────────────────────────────────────────────────────

    def status(self) -> Dict[str, Any]:
        """Get current orchestrator status."""
        return {
            "run_id": self.context.run_id,
            "stage": self.context.stage,
            "agents_registered": list(self.agents.keys()),
            "stages_with_handlers": list(self._stage_handlers.keys()),
            "errors": len(self.context._data.get("errors", [])),
            "milestones": len(
                self.context._data.get("documentary", {}).get("milestones", [])
            ),
        }

    def _print_summary(self):
        """Print run summary."""
        errors = self.context._data.get("errors", [])
        milestones = self.context._data.get("documentary", {}).get("milestones", [])

        print(f"\n{'='*60}")
        print(f"  PIPELINE COMPLETE")
        print(f"{'='*60}")
        print(f"  Run ID:     {self.context.run_id}")
        print(f"  Errors:     {len(errors)}")
        print(f"  Milestones: {len(milestones)}")
        if milestones:
            print(f"\n  Milestones achieved:")
            for m in milestones:
                print(f"    ✓ {m['title']} ({m['achieved_at'][:10]})")
        if errors:
            print(f"\n  Errors encountered:")
            for e in errors[-5:]:  # Last 5
                print(f"    ✗ [{e['agent']}] {e['message'][:80]}")
        print(f"\n  Context saved: {self.context.path}")
        print(f"{'='*60}\n")
