"""Founder OS agent — daily operating system for zero-drift execution.

Rules:
  1. No new tools unless MRR > $20k/mo.
  2. Every day includes 1 revenue action + 1 proof artifact.
  3. No busywork. If it doesn't move revenue, it doesn't go on the list.
"""

from typing import Dict, Any, Optional, List
from datetime import datetime, date
from openai import OpenAI
from app.settings import settings
import json


class FounderOSAgent:
    """The daily operating system. Produces morning agenda, midday check,
    evening review, and weekly sprint plans."""

    REVENUE_RULE = (
        "Every day MUST include exactly 1 revenue action (close a deal, "
        "send an invoice, publish a paid offering, run a sales call) and "
        "1 proof artifact (screenshot, receipt, analytics snapshot, or "
        "customer testimonial) that proves the action happened."
    )

    TOOL_GATE = (
        "No new tools, subscriptions, or platforms may be adopted unless "
        "current MRR exceeds $20,000/month. Work with what you have."
    )

    def __init__(self):
        self.client = OpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.openai_api_base,
        )
        self.model = settings.openai_model

    # ------------------------------------------------------------------
    # Morning Agenda
    # ------------------------------------------------------------------
    def morning_agenda(
        self,
        current_mrr: float,
        pipeline_deals: List[Dict[str, Any]],
        carryover_tasks: List[str],
        content_metrics: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Generate the morning 'Top 3 Revenue Moves' agenda."""

        system_msg = f"""You are Founder OS — a ruthless daily operating system.
{self.REVENUE_RULE}
{self.TOOL_GATE}
Current MRR: ${current_mrr:,.2f}

Output a JSON object with these exact keys:
  revenue_action: string — the ONE revenue action for today
  growth_action: string — one growth/pipeline action
  ops_action: string — one operational action (only if critical)
  proof_artifact: string — what artifact proves the revenue action happened
  risk_flags: list of strings — anything that could derail today
  tool_gate_status: string — "LOCKED" if MRR < $20k, else "OPEN"
"""

        user_msg = f"""Pipeline deals: {json.dumps(pipeline_deals)}
Carryover from yesterday: {json.dumps(carryover_tasks)}
Content metrics: {json.dumps(content_metrics or {})}

Generate today's morning agenda. Be specific. Name the deal, the dollar amount, the exact next step."""

        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.3,
            max_tokens=1024,
        )

        return {
            "type": "morning_agenda",
            "date": date.today().isoformat(),
            "response": response.choices[0].message.content,
        }

    # ------------------------------------------------------------------
    # Midday Check
    # ------------------------------------------------------------------
    def midday_check(
        self,
        morning_agenda: Dict[str, Any],
        completed_so_far: List[str],
        current_blockers: List[str],
    ) -> Dict[str, Any]:
        """Midday checkpoint: blockers + next immediate step."""

        system_msg = f"""You are Founder OS performing a midday check.
{self.REVENUE_RULE}
If the revenue action has NOT been completed yet, it becomes the ONLY priority.

Output a JSON object:
  revenue_action_status: "DONE" or "BLOCKED" or "IN_PROGRESS"
  current_blocker: string or null
  unblock_step: string — the single next action to unblock or advance
  afternoon_priority: string — what to focus on for the rest of the day
"""

        user_msg = f"""Morning agenda: {json.dumps(morning_agenda)}
Completed so far: {json.dumps(completed_so_far)}
Current blockers: {json.dumps(current_blockers)}"""

        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.3,
            max_tokens=512,
        )

        return {
            "type": "midday_check",
            "date": date.today().isoformat(),
            "response": response.choices[0].message.content,
        }

    # ------------------------------------------------------------------
    # Evening Review
    # ------------------------------------------------------------------
    def evening_review(
        self,
        morning_agenda: Dict[str, Any],
        completed_tasks: List[str],
        proof_artifact_url: Optional[str],
        revenue_collected: float = 0.0,
    ) -> Dict[str, Any]:
        """Evening review: wins, misses, carryover."""

        system_msg = f"""You are Founder OS performing an evening review.
{self.REVENUE_RULE}
Be honest. If the revenue action didn't happen, say so and explain why.
If no proof artifact was produced, flag it as a MISS.

Output a JSON object:
  wins: list of strings
  misses: list of strings
  proof_artifact_submitted: boolean
  revenue_action_completed: boolean
  revenue_collected_today: number
  carryover_tasks: list of strings — what carries to tomorrow
  streak_status: string — "MAINTAINED" or "BROKEN" with reason
"""

        user_msg = f"""Morning agenda: {json.dumps(morning_agenda)}
Completed tasks: {json.dumps(completed_tasks)}
Proof artifact URL: {proof_artifact_url or "NONE SUBMITTED"}
Revenue collected today: ${revenue_collected:,.2f}"""

        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.3,
            max_tokens=1024,
        )

        return {
            "type": "evening_review",
            "date": date.today().isoformat(),
            "response": response.choices[0].message.content,
        }

    # ------------------------------------------------------------------
    # Weekly Sprint Plan
    # ------------------------------------------------------------------
    def weekly_sprint_plan(
        self,
        current_mrr: float,
        last_week_reviews: List[Dict[str, Any]],
        pipeline_deals: List[Dict[str, Any]],
        content_performance: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Generate the weekly sprint plan for the upcoming week."""

        system_msg = f"""You are Founder OS generating a weekly sprint plan.
{self.REVENUE_RULE}
{self.TOOL_GATE}
Current MRR: ${current_mrr:,.2f}

Analyze last week's daily reviews. Identify patterns.
Output a JSON object:
  week_theme: string — one sentence describing the week's focus
  revenue_target: number — dollar target for the week
  daily_revenue_actions: list of 5 objects, each with "day" and "action"
  content_plan: list of 5 objects, each with "day" and "content_piece"
  kill_list: list of strings — things to stop doing this week
  sprint_success_criteria: string — how we know the week was a win
"""

        user_msg = f"""Last week's daily reviews: {json.dumps(last_week_reviews[-7:] if last_week_reviews else [])}
Pipeline deals: {json.dumps(pipeline_deals)}
Content performance: {json.dumps(content_performance)}"""

        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.4,
            max_tokens=2048,
        )

        return {
            "type": "weekly_sprint_plan",
            "week_starting": date.today().isoformat(),
            "response": response.choices[0].message.content,
        }
