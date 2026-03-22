"""
Documentary Tracker — LaunchOps Founder Edition
Logs every milestone, decision, pivot, and achievement in the solopreneur journey.
Generates narrative content for the documentary: "AI + Human Co-Creating GREAT Things."

This is the story engine. Every action LaunchOps takes gets logged here.
The documentary writes itself as you build.
"""

from typing import Dict, List, Optional
from datetime import datetime
import json
import os

from .base import BaseAgent


# ── Documentary Milestone Types ───────────────────────────────────────────

MILESTONE_TYPES = {
    "formation": {"icon": "🏛️", "weight": 10, "category": "Legal & Formation"},
    "ip_protection": {"icon": "🛡️", "weight": 9, "category": "IP Protection"},
    "funding": {"icon": "💰", "weight": 9, "category": "Funding & Finance"},
    "product": {"icon": "🚀", "weight": 8, "category": "Product Development"},
    "customer": {"icon": "👤", "weight": 8, "category": "Customer Acquisition"},
    "revenue": {"icon": "📈", "weight": 10, "category": "Revenue Milestone"},
    "infrastructure": {"icon": "⚙️", "weight": 6, "category": "Infrastructure"},
    "marketing": {"icon": "📣", "weight": 7, "category": "Marketing & Growth"},
    "decision": {"icon": "🎯", "weight": 7, "category": "Strategic Decision"},
    "pivot": {"icon": "🔄", "weight": 9, "category": "Pivot / Course Correction"},
    "coaching": {"icon": "🎓", "weight": 5, "category": "Coaching & Learning"},
    "ai_moment": {"icon": "🤖", "weight": 8, "category": "AI Co-Creation Moment"},
    "setback": {"icon": "⚡", "weight": 7, "category": "Setback / Challenge"},
    "breakthrough": {"icon": "💡", "weight": 10, "category": "Breakthrough"},
}


class DocumentaryTracker(BaseAgent):
    """
    The story engine. Logs everything. Generates narrative.
    Every LaunchOps action creates a documentary entry.
    """

    def __init__(self, llm_client=None, config: Dict = None):
        super().__init__(
            name="documentary_tracker",
            role="Solopreneur Documentary & Milestone Logger",
            llm_client=llm_client,
            config=config or {},
        )
        self.timeline_dir = os.path.expanduser("~/.launchops/documentary")
        self.timeline_file = os.path.join(self.timeline_dir, "timeline.json")
        self.narrative_file = os.path.join(self.timeline_dir, "narrative.md")
        os.makedirs(self.timeline_dir, exist_ok=True)

        if not os.path.exists(self.timeline_file):
            self._save_timeline([])

    def analyze(self, context: Dict) -> Dict:
        timeline = self._load_timeline()
        return {
            "total_milestones": len(timeline),
            "milestones_by_type": self._count_by_type(timeline),
            "journey_duration": self._calculate_duration(timeline),
            "latest_milestones": timeline[-5:] if timeline else [],
            "narrative_generated": os.path.exists(self.narrative_file),
        }

    def execute(self, task: Dict) -> Dict:
        task_type = task.get("type", "log_milestone")
        handlers = {
            "log_milestone": self._log_milestone,
            "generate_narrative": self._generate_narrative,
            "generate_chapter": self._generate_chapter,
            "timeline_report": self._timeline_report,
            "export_documentary": self._export_documentary,
            "log_ai_moment": self._log_ai_moment,
        }
        handler = handlers.get(task_type, self._log_milestone)
        return handler(task)

    # ── Milestone Logging ─────────────────────────────────────────────────

    def _log_milestone(self, task: Dict) -> Dict:
        milestone_type = task.get("milestone_type", "decision")
        title = task.get("title", "")
        description = task.get("description", "")
        data = task.get("data", {})
        agent = task.get("agent", "manual")

        if not title:
            return {"success": False, "error": "Milestone needs a title."}

        type_info = MILESTONE_TYPES.get(milestone_type, {"icon": "📌", "weight": 5, "category": "Other"})

        milestone = {
            "id": len(self._load_timeline()) + 1,
            "timestamp": datetime.now().isoformat(),
            "type": milestone_type,
            "category": type_info["category"],
            "icon": type_info["icon"],
            "weight": type_info["weight"],
            "title": title,
            "description": description,
            "agent": agent,
            "data": data,
        }

        timeline = self._load_timeline()
        timeline.append(milestone)
        self._save_timeline(timeline)

        print(f"\n{type_info['icon']} MILESTONE #{milestone['id']}: {title}")
        print(f"   {description}")
        print(f"   [{type_info['category']}] — {milestone['timestamp']}\n")

        return {"success": True, "milestone": milestone}

    def _log_ai_moment(self, task: Dict) -> Dict:
        """Special logger for AI co-creation moments — the documentary highlight reel."""
        return self._log_milestone({
            "milestone_type": "ai_moment",
            "title": task.get("title", "AI Co-Creation Moment"),
            "description": task.get("description", ""),
            "agent": task.get("agent", "launchops"),
            "data": {
                "ai_action": task.get("ai_action", ""),
                "human_decision": task.get("human_decision", ""),
                "outcome": task.get("outcome", ""),
                "documentary_note": task.get("documentary_note", ""),
            },
        })

    # ── Narrative Generation ──────────────────────────────────────────────

    def _generate_narrative(self, task: Dict) -> Dict:
        """Generate the full documentary narrative from the timeline."""
        timeline = self._load_timeline()
        if not timeline:
            return {"success": False, "error": "No milestones logged yet."}

        if self.llm_client:
            system = """You are a documentary writer telling the story of a solopreneur
building a company with AI as a co-founder. This is the story of
"AI + Human Co-Creating GREAT Things."

Write in a compelling, cinematic narrative style. This is a documentary
that will show the world what's possible when one person and AI work together.

Structure:
- Opening: The vision and the beginning
- Each major milestone becomes a scene
- AI moments are highlighted as co-creation breakthroughs
- Setbacks are honest and real
- The narrative arc builds toward the business launch

Tone: Inspiring, honest, technically grounded, human."""

            user = f"""Generate the documentary narrative from this timeline:

{json.dumps(timeline, indent=2)}

Write a compelling narrative that covers the entire journey so far.
Include specific details from each milestone.
Highlight the AI co-creation moments.
Make it feel like a real documentary script."""

            narrative = self._call_llm(system, user)
        else:
            # Generate basic narrative without LLM
            narrative = self._generate_basic_narrative(timeline)

        # Save narrative
        with open(self.narrative_file, "w") as f:
            f.write("# The LaunchOps Documentary\n")
            f.write("## AI + Human Co-Creating GREAT Things\n\n")
            f.write(f"*Generated: {datetime.now().strftime('%B %d, %Y')}*\n\n")
            f.write("---\n\n")
            f.write(narrative or "")

        return {
            "success": True,
            "file_path": self.narrative_file,
            "milestone_count": len(timeline),
            "message": "Documentary narrative generated.",
        }

    def _generate_chapter(self, task: Dict) -> Dict:
        """Generate a single chapter of the documentary."""
        chapter_type = task.get("chapter_type", "formation")
        timeline = self._load_timeline()
        chapter_milestones = [m for m in timeline if m["type"] == chapter_type]

        if not chapter_milestones:
            return {"success": False, "error": f"No milestones of type '{chapter_type}' found."}

        if self.llm_client:
            system = "You are a documentary writer. Write a single chapter about this phase of the journey."
            user = f"""Write a documentary chapter about the '{chapter_type}' phase:

Milestones:
{json.dumps(chapter_milestones, indent=2)}

Write it as a compelling narrative chapter."""

            chapter = self._call_llm(system, user)
        else:
            chapter = "\n".join(f"- {m['title']}: {m['description']}" for m in chapter_milestones)

        chapter_file = os.path.join(self.timeline_dir, f"chapter_{chapter_type}.md")
        with open(chapter_file, "w") as f:
            f.write(f"# Chapter: {MILESTONE_TYPES.get(chapter_type, {}).get('category', chapter_type)}\n\n")
            f.write(chapter or "")

        return {"success": True, "file_path": chapter_file, "milestones": len(chapter_milestones)}

    # ── Reports ───────────────────────────────────────────────────────────

    def _timeline_report(self, task: Dict) -> Dict:
        timeline = self._load_timeline()
        if not timeline:
            return {"success": True, "message": "No milestones yet.", "timeline": []}

        report = {
            "success": True,
            "total_milestones": len(timeline),
            "journey_started": timeline[0]["timestamp"] if timeline else None,
            "latest_milestone": timeline[-1] if timeline else None,
            "by_category": self._count_by_type(timeline),
            "top_milestones": sorted(timeline, key=lambda m: m.get("weight", 0), reverse=True)[:10],
            "ai_moments": [m for m in timeline if m["type"] == "ai_moment"],
            "timeline": timeline,
        }

        # Print summary
        print(f"\n{'='*60}")
        print("📽️  Documentary Timeline Report")
        print(f"{'='*60}")
        print(f"Total milestones: {report['total_milestones']}")
        print(f"AI co-creation moments: {len(report['ai_moments'])}")
        print(f"\nBy category:")
        for cat, count in report["by_category"].items():
            print(f"  {cat}: {count}")
        print(f"\nLatest: {report['latest_milestone']['title'] if report['latest_milestone'] else 'None'}")
        print(f"{'='*60}\n")

        return report

    def _export_documentary(self, task: Dict) -> Dict:
        """Export the full documentary package."""
        timeline = self._load_timeline()
        export_dir = os.path.join(self.timeline_dir, "export")
        os.makedirs(export_dir, exist_ok=True)

        # Export timeline JSON
        with open(os.path.join(export_dir, "timeline.json"), "w") as f:
            json.dump(timeline, f, indent=2)

        # Export narrative if it exists
        if os.path.exists(self.narrative_file):
            import shutil
            shutil.copy(self.narrative_file, os.path.join(export_dir, "narrative.md"))

        # Generate summary
        summary = {
            "title": "The LaunchOps Documentary: AI + Human Co-Creating GREAT Things",
            "total_milestones": len(timeline),
            "journey_duration": self._calculate_duration(timeline),
            "ai_moments": len([m for m in timeline if m["type"] == "ai_moment"]),
            "categories_covered": list(self._count_by_type(timeline).keys()),
            "exported_at": datetime.now().isoformat(),
        }

        with open(os.path.join(export_dir, "summary.json"), "w") as f:
            json.dump(summary, f, indent=2)

        return {"success": True, "export_dir": export_dir, "summary": summary}

    # ── Helpers ───────────────────────────────────────────────────────────

    def _load_timeline(self) -> List[Dict]:
        if os.path.exists(self.timeline_file):
            with open(self.timeline_file, "r") as f:
                return json.load(f)
        return []

    def _save_timeline(self, timeline: List[Dict]):
        with open(self.timeline_file, "w") as f:
            json.dump(timeline, f, indent=2)

    def _count_by_type(self, timeline: List[Dict]) -> Dict:
        counts = {}
        for m in timeline:
            cat = m.get("category", "Other")
            counts[cat] = counts.get(cat, 0) + 1
        return counts

    def _calculate_duration(self, timeline: List[Dict]) -> str:
        if len(timeline) < 2:
            return "Just started"
        first = datetime.fromisoformat(timeline[0]["timestamp"])
        last = datetime.fromisoformat(timeline[-1]["timestamp"])
        delta = last - first
        if delta.days > 0:
            return f"{delta.days} days"
        hours = delta.seconds // 3600
        return f"{hours} hours" if hours > 0 else f"{delta.seconds // 60} minutes"

    def _generate_basic_narrative(self, timeline: List[Dict]) -> str:
        lines = ["## The Journey So Far\n"]
        for m in timeline:
            lines.append(f"### {m['icon']} {m['title']}")
            lines.append(f"*{m['timestamp'][:10]} — {m['category']}*\n")
            lines.append(f"{m['description']}\n")
        return "\n".join(lines)
