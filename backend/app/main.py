"""
LaunchOps Founder Edition — FastAPI Backend
Unified execution surface: CLI and UI share the same Atlas orchestrator.

Endpoints:
  GET  /                     → System info
  GET  /health               → Health check
  GET  /atlas/status         → Current orchestrator status + context summary
  GET  /atlas/stages         → List all pipeline stages with status
  POST /atlas/execute        → Execute full pipeline or single stage (SSE stream)
  POST /atlas/execute/stage  → Execute a single named stage (SSE stream)
  GET  /atlas/context        → Full shared context dump
  GET  /atlas/logs           → Audit log from shared context
  GET  /prompts              → List prompt IDs
  GET  /prompts/{id}         → Get a single prompt
  GET  /permissions          → Permission matrix
"""

import asyncio
import json
import sys
import os
import traceback
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

# ── Resolve imports: add repo root to sys.path so core/ is importable ────
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from core.config import get_config, LaunchOpsConfig
from core.context import SharedContext
from core.orchestrator import AtlasOrchestrator, STAGES
from core.permissions import permission_manager, ENABLE_HUMAN_APPROVAL

# ── App Setup ────────────────────────────────────────────────────────────

app = FastAPI(
    title="LaunchOps Founder Edition",
    version="2.1.0",
    description="Unified Atlas orchestration API — same engine as the CLI.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tier 3 personal edition — no restriction
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Shared State ─────────────────────────────────────────────────────────
# The Atlas orchestrator and SharedContext are singletons.
# Whether the founder runs `python launchops.py launch` or hits this API,
# they read/write the same context file on disk.

_atlas: Optional[AtlasOrchestrator] = None
_context: Optional[SharedContext] = None


def get_atlas() -> AtlasOrchestrator:
    """Get or create the global Atlas orchestrator."""
    global _atlas, _context
    if _atlas is None:
        _atlas = AtlasOrchestrator()
        _context = _atlas.context
    return _atlas


def get_context() -> SharedContext:
    """Get the shared context (creates Atlas if needed)."""
    get_atlas()
    return _context


# ── Request / Response Models ────────────────────────────────────────────

class ExecuteRequest(BaseModel):
    """Request body for /atlas/execute."""
    start_stage: Optional[str] = None
    end_stage: Optional[str] = None


class ExecuteStageRequest(BaseModel):
    """Request body for /atlas/execute/stage."""
    stage: str


# ── SSE Helpers ──────────────────────────────────────────────────────────

def sse_event(event: str, data: Any) -> str:
    """Format a Server-Sent Event."""
    payload = json.dumps(data, default=str)
    return f"event: {event}\ndata: {payload}\n\n"


# ── Endpoints ────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    """System info."""
    return {
        "name": "LaunchOps Founder Edition",
        "version": "2.1.0",
        "engine": "Atlas Orchestrator",
        "mode": "Tier 3 — No Guardrails",
        "human_approval": ENABLE_HUMAN_APPROVAL,
        "status": "online",
    }


@app.get("/health")
async def health():
    """Health check."""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "atlas_initialized": _atlas is not None,
        "stages": len(STAGES),
    }


# ── Atlas Pipeline Endpoints ─────────────────────────────────────────────

@app.get("/atlas/status")
async def atlas_status():
    """Current orchestrator status and context summary."""
    atlas = get_atlas()
    ctx = get_context()
    return {
        "orchestrator": atlas.status(),
        "context_summary": ctx.summary(),
        "current_stage": ctx.stage,
        "stages": STAGES,
        "human_approval_enabled": ENABLE_HUMAN_APPROVAL,
    }


@app.get("/atlas/stages")
async def atlas_stages():
    """List all pipeline stages with their current status."""
    ctx = get_context()
    current = ctx.stage
    current_idx = STAGES.index(current) if current in STAGES else -1

    stages_list = []
    for i, stage in enumerate(STAGES):
        if i < current_idx:
            status = "completed"
        elif i == current_idx:
            status = "current"
        else:
            status = "pending"

        # Check if there's output stored for this stage
        has_output = ctx.get_agent_output(f"stage_{stage}") is not None
        stages_list.append({
            "index": i,
            "name": stage,
            "status": status,
            "has_output": has_output,
        })

    return {"stages": stages_list, "total": len(STAGES)}


@app.post("/atlas/execute")
async def atlas_execute(request: ExecuteRequest):
    """
    Execute the full pipeline (or a range of stages) via SSE stream.
    The frontend can consume this as an EventSource for real-time updates.
    """
    atlas = get_atlas()

    # Validate stages
    if request.start_stage and request.start_stage not in STAGES:
        raise HTTPException(400, f"Unknown start_stage: {request.start_stage}")
    if request.end_stage and request.end_stage not in STAGES:
        raise HTTPException(400, f"Unknown end_stage: {request.end_stage}")

    # Permission check
    if ENABLE_HUMAN_APPROVAL:
        if permission_manager.requires_human_approval("pipeline_execute"):
            raise HTTPException(
                403,
                "Human approval required for pipeline execution. "
                "Set ENABLE_HUMAN_APPROVAL=false or approve via CLI.",
            )

    async def event_stream():
        """Generator that yields SSE events as Atlas executes stages."""
        start_idx = STAGES.index(request.start_stage) if request.start_stage else 0
        end_idx = (STAGES.index(request.end_stage) + 1) if request.end_stage else len(STAGES)
        stages_to_run = STAGES[start_idx:end_idx]

        yield sse_event("pipeline_start", {
            "run_id": atlas.context.run_id,
            "stages": stages_to_run,
            "total": len(stages_to_run),
            "timestamp": datetime.utcnow().isoformat(),
        })

        for i, stage in enumerate(stages_to_run):
            yield sse_event("stage_start", {
                "stage": stage,
                "index": i,
                "total": len(stages_to_run),
            })

            try:
                # Execute the stage synchronously (Atlas is sync)
                # We run it in a thread to keep the event loop alive
                result = await asyncio.to_thread(atlas.run_stage, stage)

                yield sse_event("stage_complete", {
                    "stage": stage,
                    "index": i,
                    "status": "completed",
                    "context_stage": atlas.context.stage,
                })
            except Exception as e:
                yield sse_event("stage_error", {
                    "stage": stage,
                    "index": i,
                    "error": str(e),
                    "traceback": traceback.format_exc(),
                })

            # Small delay to let the frontend render
            await asyncio.sleep(0.1)

        yield sse_event("pipeline_complete", {
            "run_id": atlas.context.run_id,
            "final_stage": atlas.context.stage,
            "errors": len(atlas.context._data.get("errors", [])),
            "milestones": len(
                atlas.context._data.get("documentary", {}).get("milestones", [])
            ),
            "timestamp": datetime.utcnow().isoformat(),
        })

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/atlas/execute/stage")
async def atlas_execute_stage(request: ExecuteStageRequest):
    """Execute a single named stage and return the result."""
    atlas = get_atlas()

    if request.stage not in STAGES:
        raise HTTPException(400, f"Unknown stage: {request.stage}. Valid: {STAGES}")

    # Permission check
    if ENABLE_HUMAN_APPROVAL:
        if permission_manager.requires_human_approval(f"stage_{request.stage}"):
            raise HTTPException(
                403,
                f"Human approval required for stage '{request.stage}'.",
            )

    try:
        await asyncio.to_thread(atlas.run_stage, request.stage)
        return {
            "stage": request.stage,
            "status": "completed",
            "context_stage": atlas.context.stage,
            "run_id": atlas.context.run_id,
        }
    except Exception as e:
        raise HTTPException(500, f"Stage '{request.stage}' failed: {str(e)}")


@app.get("/atlas/context")
async def atlas_context():
    """Full shared context dump — the single source of truth."""
    ctx = get_context()
    return ctx.to_dict()


@app.get("/atlas/context/{key:path}")
async def atlas_context_key(key: str):
    """Get a specific key from the shared context using dot notation."""
    ctx = get_context()
    value = ctx.get(key)
    if value is None:
        raise HTTPException(404, f"Key not found: {key}")
    return {"key": key, "value": value}


@app.get("/atlas/logs")
async def atlas_logs(limit: int = 100, level: Optional[str] = None):
    """Audit log from shared context."""
    ctx = get_context()
    logs = ctx._data.get("audit_log", [])

    if level:
        logs = [l for l in logs if l.get("level") == level]

    # Return most recent first
    return {"logs": logs[-limit:][::-1], "total": len(logs)}


@app.get("/atlas/agents")
async def atlas_agents():
    """List registered agents."""
    atlas = get_atlas()
    return {
        "agents": list(atlas.agents.keys()),
        "count": len(atlas.agents),
    }


# ── Prompt Library Endpoints ─────────────────────────────────────────────

def load_prompts() -> Dict[str, str]:
    """Load business prompts from JSON file."""
    prompts_file = REPO_ROOT / "templates" / "business_prompts.json"
    if not prompts_file.exists():
        return {}
    try:
        with open(prompts_file) as f:
            data = json.load(f)
        prompts = {}
        for pack in data.get("packs", []):
            for prompt in pack.get("prompts", []):
                prompts[prompt["id"]] = prompt["prompt"]
        return prompts
    except Exception:
        return {}


PROMPTS = load_prompts()


@app.get("/prompts")
async def list_prompts():
    """List all available prompts."""
    return {"prompts": list(PROMPTS.keys()), "count": len(PROMPTS)}


@app.get("/prompts/{prompt_id}")
async def get_prompt(prompt_id: str):
    """Get a specific prompt."""
    if prompt_id not in PROMPTS:
        raise HTTPException(status_code=404, detail="Prompt not found")
    return {"id": prompt_id, "prompt": PROMPTS[prompt_id]}


# ── Permissions Endpoint ─────────────────────────────────────────────────

@app.get("/permissions")
async def list_permissions():
    """Permission matrix and human approval status."""
    from core.permissions import REQUIRES_HUMAN_APPROVAL
    return {
        "human_approval_enabled": ENABLE_HUMAN_APPROVAL,
        "operations_requiring_approval": list(REQUIRES_HUMAN_APPROVAL),
    }


# ── Entrypoint ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("LAUNCHOPS_API_PORT", "8001"))
    uvicorn.run(app, host="0.0.0.0", port=port)
