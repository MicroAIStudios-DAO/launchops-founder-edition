"""
LaunchOps Shared Context
Central state store that all agents read from and write to.
Persisted to disk after every mutation so nothing is lost.
"""

import json
import os
from pathlib import Path
from datetime import datetime
from typing import Any, Dict, List, Optional

from .config import get_config


class SharedContext:
    """
    Shared mutable state for the entire LaunchOps run.
    Every agent can read and write. Persisted to ~/.launchops/data/context.json.
    """

    def __init__(self, run_id: Optional[str] = None):
        config = get_config()
        self.run_id = run_id or datetime.now().strftime("%Y%m%d_%H%M%S")
        self.path = config.data_dir / f"context_{self.run_id}.json"
        self._data: Dict[str, Any] = {
            "run_id": self.run_id,
            "created_at": datetime.now().isoformat(),
            "stage": "init",
            "business": {},
            "formation": {},
            "infrastructure": {},
            "funding": {},
            "coaching": {},
            "documentary": {"milestones": [], "chapters": []},
            "agent_outputs": {},
            "errors": [],
            "audit_log": [],
        }
        self._load()

    def _load(self):
        if self.path.exists():
            try:
                with open(self.path) as f:
                    self._data = json.load(f)
            except Exception:
                pass

    def _save(self):
        with open(self.path, "w") as f:
            json.dump(self._data, f, indent=2, default=str)

    # ── Core Access ───────────────────────────────────────────────────────

    def get(self, key: str, default: Any = None) -> Any:
        """Dot-notation key access: 'business.name' → self._data['business']['name']"""
        parts = key.split(".")
        obj = self._data
        for part in parts:
            if isinstance(obj, dict):
                obj = obj.get(part, default)
            else:
                return default
        return obj

    def set(self, key: str, value: Any):
        """Dot-notation key set: 'business.name' = 'Acme Corp'"""
        parts = key.split(".")
        obj = self._data
        for part in parts[:-1]:
            if part not in obj or not isinstance(obj[part], dict):
                obj[part] = {}
            obj = obj[part]
        obj[parts[-1]] = value
        self._save()

    def append_to(self, key: str, value: Any):
        """Append to a list at the given key path."""
        current = self.get(key, [])
        if not isinstance(current, list):
            current = [current]
        current.append(value)
        self.set(key, current)

    @property
    def stage(self) -> str:
        return self._data.get("stage", "init")

    @stage.setter
    def stage(self, value: str):
        self.set("stage", value)
        self.log(f"Stage changed to: {value}")

    # ── Agent Output Storage ──────────────────────────────────────────────

    def store_agent_output(self, agent_name: str, output: Dict[str, Any]):
        """Store the output of an agent run."""
        outputs = self._data.get("agent_outputs", {})
        if agent_name not in outputs:
            outputs[agent_name] = []
        outputs[agent_name].append({
            "timestamp": datetime.now().isoformat(),
            "output": output,
        })
        self._data["agent_outputs"] = outputs
        self._save()

    def get_agent_output(self, agent_name: str) -> Optional[Dict]:
        """Get the latest output from a specific agent."""
        outputs = self._data.get("agent_outputs", {}).get(agent_name, [])
        return outputs[-1]["output"] if outputs else None

    # ── Audit Log ─────────────────────────────────────────────────────────

    def log(self, message: str, agent: str = "system", level: str = "info"):
        """Append to the audit log."""
        entry = {
            "timestamp": datetime.now().isoformat(),
            "agent": agent,
            "level": level,
            "message": message,
        }
        self._data.setdefault("audit_log", []).append(entry)
        self._save()

    def log_error(self, message: str, agent: str = "system"):
        self.log(message, agent=agent, level="error")
        self._data.setdefault("errors", []).append({
            "timestamp": datetime.now().isoformat(),
            "agent": agent,
            "message": message,
        })
        self._save()

    # ── Documentary Milestones ────────────────────────────────────────────

    def record_milestone(self, milestone_id: str, title: str, notes: str = ""):
        """Record a documentary milestone."""
        milestone = {
            "id": milestone_id,
            "title": title,
            "notes": notes,
            "achieved_at": datetime.now().isoformat(),
        }
        self.append_to("documentary.milestones", milestone)
        self.log(f"Milestone achieved: {title}", agent="documentary")

    # ── Export ─────────────────────────────────────────────────────────────

    def to_dict(self) -> Dict[str, Any]:
        return self._data.copy()

    def to_json(self) -> str:
        return json.dumps(self._data, indent=2, default=str)

    def summary(self) -> str:
        """Human-readable summary of current state."""
        biz = self._data.get("business", {})
        lines = [
            f"Run ID:    {self.run_id}",
            f"Stage:     {self.stage}",
            f"Business:  {biz.get('name', 'Not set')}",
            f"Entity:    {self._data.get('formation', {}).get('entity_type', 'Not set')}",
            f"Revenue:   ${self._data.get('funding', {}).get('monthly_revenue', 0):,.0f}/mo",
            f"Errors:    {len(self._data.get('errors', []))}",
            f"Milestones: {len(self._data.get('documentary', {}).get('milestones', []))}",
        ]
        return "\n".join(lines)
