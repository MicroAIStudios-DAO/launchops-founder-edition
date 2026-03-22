"""
Business Builder Agent — LaunchOps Founder Edition
Build Spec intake (NOT idea generation — you already know what you're building),
business model canvas, go-to-market strategy, and operational planning.
"""

from typing import Dict, List, Optional
from datetime import datetime
import json
import os

from .base import BaseAgent


class BusinessBuilderAgent(BaseAgent):
    """
    Takes YOUR business definition and runs it through the operational pipeline.
    No brainstorming, no hand-holding — just execution planning.
    """

    def __init__(self, llm_client=None, config: Dict = None):
        super().__init__(
            name="business_builder",
            role="Business Operations Architect",
            llm_client=llm_client,
            config=config or {},
        )
        self.build_spec_path = os.path.expanduser("~/.launchops/build_spec.json")
        os.makedirs(os.path.expanduser("~/.launchops"), exist_ok=True)

    def analyze(self, context: Dict) -> Dict:
        """Analyze the business for operational readiness."""
        spec = self._load_build_spec()
        if not spec:
            return {"status": "no_build_spec", "message": "Run 'build_spec_intake' first."}

        return {
            "build_spec": spec,
            "completeness": self._assess_completeness(spec),
            "operational_gaps": self._identify_gaps(spec),
        }

    def execute(self, task: Dict) -> Dict:
        task_type = task.get("type", "build_spec_intake")
        handlers = {
            "build_spec_intake": self._build_spec_intake,
            "business_model_canvas": self._business_model_canvas,
            "go_to_market": self._go_to_market,
            "competitive_analysis": self._competitive_analysis,
            "pricing_strategy": self._pricing_strategy,
            "operational_plan": self._operational_plan,
            "kpi_dashboard": self._kpi_dashboard,
        }
        handler = handlers.get(task_type, self._build_spec_intake)
        return handler(task)

    # ── Build Spec Intake ─────────────────────────────────────────────────

    def _build_spec_intake(self, task: Dict) -> Dict:
        """Create the Build Spec from founder's business definition."""
        business = task.get("business", task)

        spec = {
            "business_name": business.get("business_name", ""),
            "business_type": business.get("business_type", ""),
            "industry": business.get("industry", ""),
            "description": business.get("description", ""),
            "problem": business.get("problem", ""),
            "solution": business.get("solution", ""),
            "target_customer": business.get("target_customer", ""),
            "icp": business.get("icp", ""),  # Ideal Customer Profile
            "uvp": business.get("uvp", ""),  # Unique Value Proposition
            "revenue_model": business.get("revenue_model", ""),
            "pricing": business.get("pricing", ""),
            "primary_channel": business.get("primary_channel", ""),
            "tech_stack": business.get("tech_stack", ""),
            "founder_name": business.get("founder_name", ""),
            "state": business.get("state", ""),
            "entity_type": business.get("entity_type", "not_formed"),
            "has_rd_component": business.get("has_rd_component", False),
            "seeking_vc": business.get("seeking_vc", False),
            "monthly_revenue": business.get("monthly_revenue", 0),
            "employees": business.get("employees", 1),
            "has_code": business.get("has_code", True),
            "has_novel_methods": business.get("has_novel_methods", False),
            "has_brand": business.get("has_brand", True),
            "has_data": business.get("has_data", False),
            "ai_assisted": business.get("ai_assisted", True),
            "created_at": datetime.now().isoformat(),
        }

        # Enhance with LLM if available
        if self.llm_client and spec.get("description"):
            system = """You are a business strategist. Given a business description,
fill in any missing fields in the Build Spec with intelligent defaults.
Return ONLY a JSON object with the filled fields."""

            user = f"""Enhance this Build Spec with intelligent defaults for any empty fields:

{json.dumps({k: v for k, v in spec.items() if v in ('', None, False, 0)}, indent=2)}

Business description: {spec.get('description', '')}
Business type: {spec.get('business_type', '')}

Return a JSON object with suggested values for the empty fields only."""

            try:
                enhanced = self._call_llm(system, user)
                if enhanced:
                    # Try to parse as JSON and merge
                    import re
                    json_match = re.search(r'\{[^{}]*\}', enhanced, re.DOTALL)
                    if json_match:
                        try:
                            updates = json.loads(json_match.group())
                            for k, v in updates.items():
                                if k in spec and spec[k] in ('', None, False, 0):
                                    spec[k] = v
                        except json.JSONDecodeError:
                            pass
            except Exception:
                pass

        # Save
        with open(self.build_spec_path, "w") as f:
            json.dump(spec, f, indent=2)

        return {
            "success": True,
            "build_spec": spec,
            "completeness": self._assess_completeness(spec),
            "message": "Build Spec created. Run business_model_canvas next.",
        }

    # ── Business Model Canvas ─────────────────────────────────────────────

    def _business_model_canvas(self, task: Dict) -> Dict:
        spec = self._load_build_spec()
        if not spec:
            return {"success": False, "error": "No Build Spec found. Run build_spec_intake first."}

        if self.llm_client:
            system = """You are a business strategist creating a Business Model Canvas.
Be specific and actionable — no generic advice."""

            user = f"""Create a complete Business Model Canvas for:

{json.dumps(spec, indent=2)}

Fill in ALL 9 blocks of the Business Model Canvas:
1. Customer Segments — who exactly are we serving?
2. Value Propositions — what unique value do we deliver?
3. Channels — how do we reach customers?
4. Customer Relationships — how do we acquire, retain, grow?
5. Revenue Streams — how do we make money? Be specific about pricing.
6. Key Resources — what do we need to deliver the value proposition?
7. Key Activities — what must we do exceptionally well?
8. Key Partnerships — who do we need to work with?
9. Cost Structure — what are the major cost drivers?

For each block, provide 3-5 specific, actionable items."""

            canvas = self._call_llm(system, user)
        else:
            canvas = "Configure LLM for Business Model Canvas generation."

        return {"success": True, "type": "business_model_canvas", "canvas": canvas}

    # ── Go-to-Market Strategy ─────────────────────────────────────────────

    def _go_to_market(self, task: Dict) -> Dict:
        spec = self._load_build_spec()
        if not spec:
            return {"success": False, "error": "No Build Spec found."}

        if self.llm_client:
            system = """You are a go-to-market strategist for early-stage startups.
Focus on ONE primary channel. Solopreneurs who try to be everywhere are nowhere."""

            user = f"""Create a go-to-market strategy for:

{json.dumps(spec, indent=2)}

Provide:
1. PRIMARY channel (ONE — the one with highest ROI for a solopreneur)
2. First 100 customers acquisition plan (specific tactics, not theory)
3. Content strategy (if applicable)
4. Pricing validation approach
5. Launch sequence (week-by-week for first 30 days)
6. Key metrics to track from Day 1
7. When to add a second channel
8. Budget allocation (assume $0-$1000/month marketing budget)"""

            strategy = self._call_llm(system, user)
        else:
            strategy = "Configure LLM."

        return {"success": True, "type": "go_to_market", "strategy": strategy}

    # ── Competitive Analysis ──────────────────────────────────────────────

    def _competitive_analysis(self, task: Dict) -> Dict:
        spec = self._load_build_spec()
        if not spec:
            return {"success": False, "error": "No Build Spec found."}

        if self.llm_client:
            system = "You are a competitive intelligence analyst."
            user = f"""Perform a competitive analysis for:

Business: {spec.get('business_name', 'N/A')}
Type: {spec.get('business_type', 'N/A')}
Industry: {spec.get('industry', 'N/A')}
UVP: {spec.get('uvp', 'N/A')}

Provide:
1. Direct competitors (top 5) with strengths/weaknesses
2. Indirect competitors and substitutes
3. Competitive positioning map
4. Defensible advantages (moats)
5. Vulnerability assessment
6. Differentiation strategy"""

            analysis = self._call_llm(system, user)
        else:
            analysis = "Configure LLM."

        return {"success": True, "type": "competitive_analysis", "analysis": analysis}

    # ── Pricing Strategy ──────────────────────────────────────────────────

    def _pricing_strategy(self, task: Dict) -> Dict:
        spec = self._load_build_spec()
        if not spec:
            return {"success": False, "error": "No Build Spec found."}

        if self.llm_client:
            system = "You are a pricing strategist for SaaS and tech startups."
            user = f"""Design a pricing strategy for:

Business: {spec.get('business_name', 'N/A')}
Type: {spec.get('business_type', 'N/A')}
Target Customer: {spec.get('target_customer', 'N/A')}
Current Pricing: {spec.get('pricing', 'Not set')}

Provide:
1. Pricing model recommendation (subscription, usage, freemium, etc.)
2. Specific price points with justification
3. Tier structure (if applicable)
4. Free trial strategy
5. Pricing psychology tactics
6. Competitive pricing analysis
7. Path from launch pricing to mature pricing
8. Unit economics at each price point"""

            strategy = self._call_llm(system, user)
        else:
            strategy = "Configure LLM."

        return {"success": True, "type": "pricing_strategy", "strategy": strategy}

    # ── Operational Plan ──────────────────────────────────────────────────

    def _operational_plan(self, task: Dict) -> Dict:
        spec = self._load_build_spec()
        if not spec:
            return {"success": False, "error": "No Build Spec found."}

        if self.llm_client:
            system = "You are an operations consultant for solopreneur startups."
            user = f"""Create a 90-day operational plan for:

{json.dumps(spec, indent=2)}

Provide a week-by-week plan covering:
1. Weeks 1-2: Formation and legal setup
2. Weeks 3-4: Infrastructure and product development
3. Weeks 5-8: MVP and initial launch
4. Weeks 9-12: Growth and optimization

For each week:
- Specific deliverables
- Tools/services to set up
- Key decisions to make
- Budget needed
- Time estimate (hours)"""

            plan = self._call_llm(system, user)
        else:
            plan = "Configure LLM."

        return {"success": True, "type": "operational_plan", "plan": plan}

    # ── KPI Dashboard ─────────────────────────────────────────────────────

    def _kpi_dashboard(self, task: Dict) -> Dict:
        spec = self._load_build_spec()
        if not spec:
            return {"success": False, "error": "No Build Spec found."}

        kpis = {
            "revenue": {
                "mrr": {"current": spec.get("monthly_revenue", 0), "target_30d": 0, "target_90d": 0},
                "arr": {"current": spec.get("monthly_revenue", 0) * 12},
            },
            "customers": {
                "total": 0,
                "new_this_month": 0,
                "churn_rate": 0,
            },
            "unit_economics": {
                "cac": 0,
                "ltv": 0,
                "ltv_cac_ratio": 0,
                "payback_months": 0,
            },
            "product": {
                "dau": 0,
                "wau": 0,
                "mau": 0,
                "activation_rate": 0,
            },
            "funding": {
                "runway_months": 0,
                "burn_rate": 0,
                "funding_raised": 0,
            },
        }

        return {"success": True, "type": "kpi_dashboard", "kpis": kpis}

    # ── Internal Helpers ──────────────────────────────────────────────────

    def _load_build_spec(self) -> Optional[Dict]:
        if os.path.exists(self.build_spec_path):
            with open(self.build_spec_path, "r") as f:
                return json.load(f)
        return None

    def _assess_completeness(self, spec: Dict) -> Dict:
        required = ["business_name", "business_type", "description", "problem", "solution", "target_customer"]
        important = ["icp", "uvp", "revenue_model", "pricing", "primary_channel"]
        optional = ["tech_stack", "industry"]

        filled_required = sum(1 for f in required if spec.get(f))
        filled_important = sum(1 for f in important if spec.get(f))
        filled_optional = sum(1 for f in optional if spec.get(f))

        return {
            "required_fields": f"{filled_required}/{len(required)}",
            "important_fields": f"{filled_important}/{len(important)}",
            "optional_fields": f"{filled_optional}/{len(optional)}",
            "overall_pct": int((filled_required + filled_important) / (len(required) + len(important)) * 100),
            "missing_required": [f for f in required if not spec.get(f)],
            "missing_important": [f for f in important if not spec.get(f)],
        }

    def _identify_gaps(self, spec: Dict) -> List[str]:
        gaps = []
        if not spec.get("entity_type") or spec["entity_type"] == "not_formed":
            gaps.append("Entity not formed — run formation_optimizer")
        if not spec.get("icp"):
            gaps.append("No ICP defined — critical for go-to-market")
        if not spec.get("uvp"):
            gaps.append("No UVP defined — what makes you different?")
        if not spec.get("revenue_model"):
            gaps.append("No revenue model — how do you make money?")
        if not spec.get("primary_channel"):
            gaps.append("No primary channel — how do customers find you?")
        return gaps
