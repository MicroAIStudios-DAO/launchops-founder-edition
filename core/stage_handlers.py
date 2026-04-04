"""
LaunchOps Stage Handlers — Wires real agents to Atlas pipeline stages.

This is the critical integration layer. Each pipeline stage gets a handler
that calls the actual agent(s) responsible for that domain. The orchestrator
calls run_stage(name) → handler(context) → agent.method(**args) → results
stored in SharedContext and written to disk as artifacts.

Stage → Agent Mapping:
  init           → founder_os (morning_agenda), metrics_agent (weekly_snapshot)
  intake         → business_builder (analyze spec), dynexecutiv (generate_daily_agenda)
  formation      → paperwork_agent (formation docs), paralegal_bot (compliance)
  infrastructure → wordpress_agent (site setup), security_agent (audit)
  legal          → paperwork_agent (legal package), paralegal_bot (ip audit)
  payments       → stripe_agent (setup products/pricing)
  funding        → funding_intelligence (readiness report)
  coaching       → execai_coach (strategy session), founder_os (weekly_sprint_plan),
                   dynexecutiv (generate_weekly_brief)
  growth         → growth_agent (strategy), content_engine (generate_30_day_calendar),
                   mautic_agent (email setup)
  done           → metrics_agent (weekly_snapshot + evaluate_and_cut),
                   documentary_tracker (narrative), founder_os (evening_review)

Artifact Output:
  All outputs are written to ~/.launchops/documents/{stage}/ as .json and .md files
  so they appear in the /artifacts API endpoint and the dashboard.
"""

import json
import os
from datetime import datetime, date
from pathlib import Path
from typing import Dict, Any, Callable, Optional

from core.context import SharedContext
from core import audit_log


# ── Artifact helpers ─────────────────────────────────────────────────────────

ARTIFACTS_BASE = Path(os.environ.get("ARTIFACTS_PATH", os.path.expanduser("~/.launchops/documents")))


def _save_artifact(stage: str, filename: str, content: Any, fmt: str = "json") -> Path:
    """
    Write an artifact to disk so it appears in /artifacts endpoint.
    Returns the path written.
    """
    stage_dir = ARTIFACTS_BASE / stage
    stage_dir.mkdir(parents=True, exist_ok=True)
    filepath = stage_dir / filename

    if fmt == "json":
        with open(filepath, "w") as f:
            json.dump(content, f, indent=2, default=str)
    elif fmt == "md":
        with open(filepath, "w") as f:
            f.write(content if isinstance(content, str) else json.dumps(content, indent=2, default=str))
    elif fmt == "html":
        with open(filepath, "w") as f:
            f.write(content)
    else:
        with open(filepath, "w") as f:
            f.write(str(content))

    return filepath


def _ts() -> str:
    """Compact timestamp for filenames."""
    return datetime.now().strftime("%Y%m%d_%H%M%S")


# ── Safe execution wrapper ────────────────────────────────────────────────────

def _safe_execute(agent, task: Dict, context: SharedContext, stage: str) -> Dict:
    """
    Execute an agent safely, catching errors and logging to context.
    Supports both BaseAgent subclasses (.execute(task)) and standalone agents
    (direct method calls via task['_method']).
    """
    agent_name = getattr(agent, "name", agent.__class__.__name__)
    audit_log.record(
        agent=agent_name,
        action=f"stage_{stage}_execute",
        status="success",
        details={"message": f"Executing {agent_name} for stage '{stage}'"},
    )
    try:
        # If a specific method is requested, call it directly
        method_name = task.pop("_method", None)
        if method_name and hasattr(agent, method_name):
            method = getattr(agent, method_name)
            import inspect
            sig = inspect.signature(method)
            params = list(sig.parameters.keys())
            # Remove 'self' from params
            if params and params[0] == "self":
                params = params[1:]
            if len(params) == 0:
                result = method()
            else:
                # Pass only the kwargs that the method accepts
                valid_kwargs = {k: v for k, v in task.items() if k in params}
                result = method(**valid_kwargs)
        elif hasattr(agent, "execute"):
            result = agent.execute(task)
        else:
            result = {"status": "skipped", "reason": f"{agent_name} has no execute() method"}

        # Normalize result
        if result is None:
            result = {"status": "completed", "output": None}
        elif isinstance(result, str):
            result = {"status": "completed", "output": result}

        # Store result in context
        context.set(f"agent_outputs.{stage}.{agent_name}", {
            "status": "completed",
            "timestamp": datetime.now().isoformat(),
            "result": result,
        })
        audit_log.record(
            agent=agent_name,
            action=f"stage_{stage}_complete",
            status="success",
            details={"message": f"{agent_name} completed stage '{stage}' successfully"},
        )
        return result
    except Exception as e:
        error_data = {
            "status": "error",
            "timestamp": datetime.now().isoformat(),
            "error": str(e),
            "agent": agent_name,
            "stage": stage,
        }
        context.set(f"agent_outputs.{stage}.{agent_name}", error_data)
        context._data.setdefault("errors", []).append(error_data)
        audit_log.record(
            agent=agent_name,
            action=f"stage_{stage}_error",
            status="failure",
            error=str(e),
        )
        return error_data


def _get_business_config() -> Dict:
    """Load the business config from disk."""
    config_path = os.path.expanduser("~/.launchops/business.json")
    if os.path.exists(config_path):
        with open(config_path) as f:
            return json.load(f)
    return {
        "name": "Dynexis Systems",
        "type": "AI SaaS",
        "entity_type": "S-Corporation",
        "state": "California",
        "industry": "Technology",
        "revenue_model": "subscription",
        "domain": "dynexissystems.com",
        "current_mrr": 0.0,
    }


# ── Main registration function ────────────────────────────────────────────────

def register_all_handlers(orchestrator, agents: Dict[str, Any]):
    """
    Register stage handlers that call real agents with real arguments.
    This is the single integration point between Atlas and the agent swarm.

    Args:
        orchestrator: AtlasOrchestrator instance
        agents: Dict of agent_name → agent_instance (from build_system)
    """

    # ── STAGE: init ──────────────────────────────────────────────────────
    def handle_init(context: SharedContext, agents: Dict = None, config=None):
        """Initialize the pipeline: load config, set baseline metrics, morning agenda."""
        if agents is None:
            agents = {}
        business = _get_business_config()
        context.set("business", business)
        context.set("pipeline_started_at", datetime.now().isoformat())
        context.set("run_date", date.today().isoformat())

        results = {}

        # FounderOS: generate morning agenda with real context data
        if "founder_os" in agents:
            current_mrr = business.get("current_mrr", 0.0)
            agenda_result = _safe_execute(
                agents["founder_os"],
                {
                    "_method": "morning_agenda",
                    "current_mrr": current_mrr,
                    "pipeline_deals": context.get("crm.deals", []),
                    "carryover_tasks": context.get("carryover_tasks", []),
                    "content_metrics": context.get("content_metrics", {}),
                },
                context, "init",
            )
            results["founder_os_morning_agenda"] = agenda_result

            # Save artifact
            artifact_path = _save_artifact(
                "init",
                f"morning_agenda_{_ts()}.json",
                {"agent": "founder_os", "type": "morning_agenda", "output": agenda_result},
            )
            context.set("artifacts.init.morning_agenda", str(artifact_path))

        # MetricsAgent: establish baseline snapshot
        if "metrics_agent" in agents:
            snapshot = _safe_execute(
                agents["metrics_agent"],
                {"_method": "weekly_snapshot"},
                context, "init",
            )
            results["metrics_baseline"] = snapshot

            # Save artifact
            artifact_path = _save_artifact(
                "init",
                f"metrics_baseline_{_ts()}.json",
                {"agent": "metrics_agent", "type": "weekly_snapshot", "output": snapshot},
            )
            context.set("artifacts.init.metrics_baseline", str(artifact_path))
            # Store MRR in context for downstream agents
            if isinstance(snapshot, dict) and "mrr" in snapshot:
                context.set("metrics.current_mrr", snapshot["mrr"])

        # Documentary: log pipeline start
        if "documentary_tracker" in agents:
            _safe_execute(
                agents["documentary_tracker"],
                {
                    "type": "log_milestone",
                    "milestone_type": "infrastructure",
                    "title": "Pipeline Initiated",
                    "description": f"LaunchOps pipeline started for {business.get('name', 'Unknown')}",
                },
                context, "init",
            )

        return results

    orchestrator.register_stage_handler("init", handle_init)

    # ── STAGE: intake ────────────────────────────────────────────────────
    def handle_intake(context: SharedContext, agents: Dict = None, config=None):
        """Analyze the business spec and set revenue-first priorities via DynExecutiv."""
        if agents is None:
            agents = {}
        business = context.get("business") or _get_business_config()
        results = {}

        # Business Builder: analyze the spec
        if "business_builder" in agents:
            results["business_builder"] = _safe_execute(
                agents["business_builder"],
                {
                    "type": "analyze",
                    "business_name": business.get("name"),
                    "industry": business.get("industry"),
                    "revenue_model": business.get("revenue_model"),
                },
                context, "intake",
            )

        # DynExecutiv: generate "What Matters Now" daily agenda
        # Pulls live Stripe + CRM data if credentials are configured
        if "dynexecutiv" in agents:
            agent = agents["dynexecutiv"]
            stripe_data = agent.pull_stripe_data()
            crm_url = os.environ.get("SUITECRM_URL", "http://localhost:8081")
            crm_token = os.environ.get("SUITECRM_TOKEN", "")
            crm_data = agent.pull_crm_data(crm_url=crm_url, api_token=crm_token)

            # Store live data in context for downstream agents
            context.set("stripe_data", stripe_data)
            context.set("crm_data", crm_data)

            if agent.client:
                daily_agenda = agent.generate_daily_agenda(
                    crm_data=crm_data,
                    stripe_data=stripe_data,
                    content_data=context.get("content_metrics", {}),
                )
            else:
                daily_agenda = {
                    "type": "daily_agenda",
                    "date": date.today().isoformat(),
                    "status": "skipped",
                    "reason": "No LLM client — set OPENAI_API_KEY to enable",
                    "data_sources": {
                        "stripe": "live" if "error" not in stripe_data else "fallback",
                        "crm": "live" if "error" not in crm_data else "fallback",
                    },
                }

            results["dynexecutiv_daily_agenda"] = daily_agenda
            context.set("agent_outputs.intake.dynexecutiv", {
                "status": "completed",
                "timestamp": datetime.now().isoformat(),
                "result": daily_agenda,
            })

            # Save artifact
            artifact_path = _save_artifact(
                "intake",
                f"daily_agenda_{_ts()}.json",
                {"agent": "dynexecutiv", "type": "daily_agenda", "output": daily_agenda},
            )
            context.set("artifacts.intake.daily_agenda", str(artifact_path))

        return results

    orchestrator.register_stage_handler("intake", handle_intake)

    # ── STAGE: formation ─────────────────────────────────────────────────
    def handle_formation(context: SharedContext, agents: Dict = None, config=None):
        """Generate formation documents and compliance checks."""
        if agents is None:
            agents = {}
        business = context.get("business") or _get_business_config()
        results = {}

        if "paperwork_agent" in agents:
            results["paperwork_agent"] = _safe_execute(
                agents["paperwork_agent"],
                {
                    "type": "formation_package",
                    "business_name": business.get("name"),
                    "entity_type": business.get("entity_type", "S-Corporation"),
                    "state": business.get("state", "California"),
                },
                context, "formation",
            )

        if "paralegal_bot" in agents:
            results["paralegal_bot"] = _safe_execute(
                agents["paralegal_bot"],
                {
                    "type": "compliance_check",
                    "entity_type": business.get("entity_type"),
                    "state": business.get("state"),
                },
                context, "formation",
            )

        if "documentary_tracker" in agents:
            _safe_execute(
                agents["documentary_tracker"],
                {
                    "type": "log_milestone",
                    "milestone_type": "formation",
                    "title": "Business Formation Initiated",
                    "description": f"Formation documents generated for {business.get('name')}",
                },
                context, "formation",
            )

        return results

    orchestrator.register_stage_handler("formation", handle_formation)

    # ── STAGE: infrastructure ────────────────────────────────────────────
    def handle_infrastructure(context: SharedContext, agents: Dict = None, config=None):
        """Set up WordPress site and run security audit."""
        if agents is None:
            agents = {}
        business = context.get("business") or _get_business_config()
        results = {}

        if "wordpress_agent" in agents:
            results["wordpress_agent"] = _safe_execute(
                agents["wordpress_agent"],
                {
                    "type": "full_setup",
                    "business_name": business.get("name"),
                    "domain": business.get("domain", "dynexissystems.com"),
                },
                context, "infrastructure",
            )

        if "security_agent" in agents:
            results["security_agent"] = _safe_execute(
                agents["security_agent"],
                {"type": "audit"},
                context, "infrastructure",
            )

        if "analytics_agent" in agents:
            results["analytics_agent"] = _safe_execute(
                agents["analytics_agent"],
                {"type": "setup", "platform": "matomo"},
                context, "infrastructure",
            )

        return results

    orchestrator.register_stage_handler("infrastructure", handle_infrastructure)

    # ── STAGE: legal ─────────────────────────────────────────────────────
    def handle_legal(context: SharedContext, agents: Dict = None, config=None):
        """Generate legal documents and IP audit."""
        if agents is None:
            agents = {}
        business = context.get("business") or _get_business_config()
        results = {}

        if "paperwork_agent" in agents:
            results["paperwork_agent"] = _safe_execute(
                agents["paperwork_agent"],
                {
                    "type": "legal_package",
                    "business_name": business.get("name"),
                    "state": business.get("state", "California"),
                },
                context, "legal",
            )

        if "paralegal_bot" in agents:
            results["paralegal_bot"] = _safe_execute(
                agents["paralegal_bot"],
                {
                    "type": "ip_audit",
                    "business_name": business.get("name"),
                },
                context, "legal",
            )

        return results

    orchestrator.register_stage_handler("legal", handle_legal)

    # ── STAGE: payments ──────────────────────────────────────────────────
    def handle_payments(context: SharedContext, agents: Dict = None, config=None):
        """Set up Stripe products and pricing."""
        if agents is None:
            agents = {}
        business = context.get("business") or _get_business_config()
        results = {}

        if "stripe_agent" in agents:
            results["stripe_agent"] = _safe_execute(
                agents["stripe_agent"],
                {
                    "type": "setup_products",
                    "business_name": business.get("name"),
                    "revenue_model": business.get("revenue_model", "subscription"),
                },
                context, "payments",
            )

        return results

    orchestrator.register_stage_handler("payments", handle_payments)

    # ── STAGE: funding ───────────────────────────────────────────────────
    def handle_funding(context: SharedContext, agents: Dict = None, config=None):
        """Run funding readiness report."""
        if agents is None:
            agents = {}
        business = context.get("business") or _get_business_config()
        results = {}

        if "funding_intelligence" in agents:
            results["funding_intelligence"] = _safe_execute(
                agents["funding_intelligence"],
                {
                    "type": "readiness_report",
                    "entity_type": business.get("entity_type"),
                    "revenue_model": business.get("revenue_model"),
                },
                context, "funding",
            )

        return results

    orchestrator.register_stage_handler("funding", handle_funding)

    # ── STAGE: coaching ──────────────────────────────────────────────────
    def handle_coaching(context: SharedContext, agents: Dict = None, config=None):
        """ExecAI coaching + FounderOS weekly sprint plan + DynExecutiv weekly brief."""
        if agents is None:
            agents = {}
        business = context.get("business") or _get_business_config()
        results = {}

        # ExecAI Coach: strategy session
        if "execai_coach" in agents:
            results["execai_coach"] = _safe_execute(
                agents["execai_coach"],
                {"type": "strategy_session", "topic": "launch_readiness"},
                context, "coaching",
            )

        # FounderOS: weekly sprint plan with real context data
        if "founder_os" in agents:
            current_mrr = context.get("metrics.current_mrr") or business.get("current_mrr", 0.0)
            pipeline_deals = context.get("crm_data.deals", [])

            sprint_result = _safe_execute(
                agents["founder_os"],
                {
                    "_method": "weekly_sprint_plan",
                    "current_mrr": current_mrr,
                    "pipeline_deals": pipeline_deals,
                    "last_week_reviews": context.get("founder_os.evening_reviews", []),
                    "content_performance": context.get("content_metrics", {}),
                },
                context, "coaching",
            )
            results["founder_os_sprint_plan"] = sprint_result

            # Save artifact as markdown
            sprint_md = _format_sprint_plan_md(sprint_result, business)
            artifact_path = _save_artifact(
                "coaching",
                f"weekly_sprint_plan_{_ts()}.md",
                sprint_md,
                fmt="md",
            )
            context.set("artifacts.coaching.weekly_sprint_plan", str(artifact_path))

        # DynExecutiv: generate weekly executive brief
        if "dynexecutiv" in agents:
            agent = agents["dynexecutiv"]
            stripe_data = context.get("stripe_data") or agent.pull_stripe_data()
            crm_data = context.get("crm_data") or agent.pull_crm_data()

            if agent.client:
                weekly_brief = agent.generate_weekly_brief(
                    crm_data=crm_data,
                    stripe_data=stripe_data,
                    content_data=context.get("content_metrics", {}),
                    daily_reviews=context.get("founder_os.evening_reviews", []),
                )
            else:
                weekly_brief = {
                    "type": "weekly_brief",
                    "week_ending": date.today().isoformat(),
                    "status": "skipped",
                    "reason": "No LLM client — set OPENAI_API_KEY to enable",
                    "data_sources": {
                        "stripe": "live" if "error" not in stripe_data else "fallback",
                        "crm": "live" if "error" not in crm_data else "fallback",
                    },
                }

            results["dynexecutiv_weekly_brief"] = weekly_brief
            context.set("agent_outputs.coaching.dynexecutiv_weekly_brief", {
                "status": "completed",
                "timestamp": datetime.now().isoformat(),
                "result": weekly_brief,
            })

            # Save as JSON and HTML
            artifact_path = _save_artifact(
                "coaching",
                f"weekly_brief_{_ts()}.json",
                {"agent": "dynexecutiv", "type": "weekly_brief", "output": weekly_brief},
            )
            context.set("artifacts.coaching.weekly_brief_json", str(artifact_path))

            # Render HTML brief
            html_brief = agent.render_brief_html(weekly_brief)
            html_path = _save_artifact(
                "coaching",
                f"weekly_brief_{_ts()}.html",
                html_brief,
                fmt="html",
            )
            context.set("artifacts.coaching.weekly_brief_html", str(html_path))

        return results

    orchestrator.register_stage_handler("coaching", handle_coaching)

    # ── STAGE: growth ────────────────────────────────────────────────────
    def handle_growth(context: SharedContext, agents: Dict = None, config=None):
        """Growth strategy, 30-day content calendar, and email campaigns."""
        if agents is None:
            agents = {}
        business = context.get("business") or _get_business_config()
        results = {}

        # Growth Agent: strategy
        if "growth_agent" in agents:
            results["growth_agent"] = _safe_execute(
                agents["growth_agent"],
                {
                    "type": "growth_strategy",
                    "business_name": business.get("name"),
                    "industry": business.get("industry"),
                },
                context, "growth",
            )

        # ContentEngine: generate 30-day content calendar with real args
        if "content_engine" in agents:
            agent = agents["content_engine"]
            current_mrr = context.get("metrics.current_mrr") or business.get("current_mrr", 0.0)

            # Build key milestones from context
            key_milestones = []
            if context.get("artifacts.formation"):
                key_milestones.append("Business formation documents generated")
            if context.get("artifacts.infrastructure"):
                key_milestones.append("WordPress site deployed")
            if context.get("artifacts.payments"):
                key_milestones.append("Stripe payments configured")
            if not key_milestones:
                key_milestones = [
                    "LaunchOps pipeline initiated",
                    "Building AI-powered business OS in public",
                    "First revenue target: $1k MRR",
                ]

            if agent.client:
                calendar_result = agent.generate_30_day_calendar(
                    product_name=business.get("name", "Dynexis Systems"),
                    current_mrr=current_mrr,
                    key_milestones=key_milestones,
                    base_url=f"https://{business.get('domain', 'aiintegrationcourse.com')}",
                )
            else:
                calendar_result = {
                    "type": "content_calendar",
                    "start_date": date.today().isoformat(),
                    "status": "skipped",
                    "reason": "No LLM client — set OPENAI_API_KEY to enable",
                    "templates_available": list(
                        __import__("agents.content_engine", fromlist=["POST_TEMPLATES"]).POST_TEMPLATES.keys()
                    ),
                }

            results["content_engine_calendar"] = calendar_result
            context.set("agent_outputs.growth.content_engine", {
                "status": "completed",
                "timestamp": datetime.now().isoformat(),
                "result": calendar_result,
            })

            # Save calendar artifact
            artifact_path = _save_artifact(
                "growth",
                f"content_calendar_30day_{_ts()}.json",
                {"agent": "content_engine", "type": "content_calendar", "output": calendar_result},
            )
            context.set("artifacts.growth.content_calendar", str(artifact_path))

            # Also save post templates as a reference artifact
            try:
                from agents.content_engine import POST_TEMPLATES
                templates_path = _save_artifact(
                    "growth",
                    "post_templates.json",
                    {"agent": "content_engine", "type": "post_templates", "templates": POST_TEMPLATES},
                )
                context.set("artifacts.growth.post_templates", str(templates_path))
                results["post_templates"] = {"status": "saved", "path": str(templates_path)}
            except ImportError:
                pass

        # Mautic Agent: email setup
        if "mautic_agent" in agents:
            results["mautic_agent"] = _safe_execute(
                agents["mautic_agent"],
                {
                    "type": "setup_campaigns",
                    "business_name": business.get("name"),
                },
                context, "growth",
            )

        # Email Agent: welcome sequence
        if "email_agent" in agents:
            results["email_agent"] = _safe_execute(
                agents["email_agent"],
                {"type": "welcome_sequence"},
                context, "growth",
            )

        return results

    orchestrator.register_stage_handler("growth", handle_growth)

    # ── STAGE: done ──────────────────────────────────────────────────────
    def handle_done(context: SharedContext, agents: Dict = None, config=None):
        """Final stage: metrics snapshot + cut evaluation + documentary + evening review."""
        if agents is None:
            agents = {}
        results = {}

        # MetricsAgent: final weekly snapshot
        if "metrics_agent" in agents:
            agent = agents["metrics_agent"]

            # Weekly snapshot
            snapshot = _safe_execute(
                agent,
                {"_method": "weekly_snapshot"},
                context, "done",
            )
            results["metrics_snapshot"] = snapshot

            artifact_path = _save_artifact(
                "done",
                f"metrics_final_snapshot_{_ts()}.json",
                {"agent": "metrics_agent", "type": "weekly_snapshot", "output": snapshot},
            )
            context.set("artifacts.done.metrics_snapshot", str(artifact_path))

            # Cut evaluation — the ruthless financial audit
            cut_eval = _safe_execute(
                agent,
                {"_method": "evaluate_and_cut"},
                context, "done",
            )
            results["metrics_cut_evaluation"] = cut_eval

            cut_path = _save_artifact(
                "done",
                f"cut_evaluation_{_ts()}.json",
                {"agent": "metrics_agent", "type": "cut_evaluation", "output": cut_eval},
            )
            context.set("artifacts.done.cut_evaluation", str(cut_path))

            # Conversion funnel (using whatever data is in context)
            stripe_data = context.get("stripe_data", {})
            crm_data = context.get("crm_data", {})
            funnel = agent.calculate_conversion_funnel(
                visitors=context.get("metrics.visitors_7d", 0),
                course_signups=context.get("metrics.course_signups_7d", 0),
                launch_conversions=context.get("metrics.launch_conversions_7d", 0),
                executiv_conversions=context.get("metrics.executiv_conversions_7d", 0),
            )
            results["conversion_funnel"] = funnel
            context.set("metrics.conversion_funnel", funnel)

            funnel_path = _save_artifact(
                "done",
                f"conversion_funnel_{_ts()}.json",
                {"agent": "metrics_agent", "type": "conversion_funnel", "output": funnel},
            )
            context.set("artifacts.done.conversion_funnel", str(funnel_path))

        # FounderOS: evening review
        if "founder_os" in agents:
            morning_agenda = context.get("agent_outputs.init.founder_os.result", {})
            evening = _safe_execute(
                agents["founder_os"],
                {
                    "_method": "evening_review",
                    "morning_agenda": morning_agenda,
                    "completed_tasks": context.get("completed_tasks", []),
                    "proof_artifact_url": context.get("proof_artifact_url"),
                    "revenue_collected": context.get("metrics.revenue_today", 0.0),
                },
                context, "done",
            )
            results["founder_os_evening_review"] = evening

            # Append to evening reviews history
            context.append_to("founder_os.evening_reviews", evening)

            evening_path = _save_artifact(
                "done",
                f"evening_review_{_ts()}.json",
                {"agent": "founder_os", "type": "evening_review", "output": evening},
            )
            context.set("artifacts.done.evening_review", str(evening_path))

        # Documentary: generate full narrative
        if "documentary_tracker" in agents:
            results["documentary_tracker"] = _safe_execute(
                agents["documentary_tracker"],
                {"type": "generate_narrative"},
                context, "done",
            )

        context.set("pipeline_completed_at", datetime.now().isoformat())

        # Log completion milestone
        if "documentary_tracker" in agents:
            _safe_execute(
                agents["documentary_tracker"],
                {
                    "type": "log_milestone",
                    "milestone_type": "breakthrough",
                    "title": "Pipeline Complete",
                    "description": "Full LaunchOps pipeline executed successfully.",
                },
                context, "done",
            )

        return results

    orchestrator.register_stage_handler("done", handle_done)

    # Log the registration
    audit_log.record(
        agent="stage_handlers",
        action="register_all",
        status="success",
        details={"handler_count": len(orchestrator._stage_handlers)},
    )

    return orchestrator


# ── Formatting helpers ────────────────────────────────────────────────────────

def _format_sprint_plan_md(sprint_result: Dict, business: Dict) -> str:
    """Format a weekly sprint plan result as a readable Markdown document."""
    today = date.today().isoformat()
    name = business.get("name", "Dynexis Systems")

    lines = [
        f"# Weekly Sprint Plan — {today}",
        f"**Business:** {name}",
        f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        "",
    ]

    if isinstance(sprint_result, dict):
        response = sprint_result.get("response", "")
        if response:
            # Try to parse as JSON for structured output
            try:
                data = json.loads(response)
                if isinstance(data, dict):
                    if "week_theme" in data:
                        lines.append(f"## Theme: {data['week_theme']}")
                        lines.append("")
                    if "revenue_target" in data:
                        lines.append(f"**Revenue Target:** ${data['revenue_target']:,.2f}")
                        lines.append("")
                    if "daily_revenue_actions" in data:
                        lines.append("## Daily Revenue Actions")
                        for item in data["daily_revenue_actions"]:
                            lines.append(f"- **{item.get('day', '')}**: {item.get('action', '')}")
                        lines.append("")
                    if "content_plan" in data:
                        lines.append("## Content Plan")
                        for item in data["content_plan"]:
                            lines.append(f"- **{item.get('day', '')}**: {item.get('content_piece', '')}")
                        lines.append("")
                    if "kill_list" in data:
                        lines.append("## Kill List (Stop Doing)")
                        for item in data["kill_list"]:
                            lines.append(f"- {item}")
                        lines.append("")
                    if "sprint_success_criteria" in data:
                        lines.append(f"## Success Criteria")
                        lines.append(data["sprint_success_criteria"])
                else:
                    lines.append(response)
            except (json.JSONDecodeError, TypeError):
                lines.append(response)
        else:
            lines.append(f"```json\n{json.dumps(sprint_result, indent=2, default=str)}\n```")

    return "\n".join(lines)
