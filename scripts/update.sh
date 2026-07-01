#!/usr/bin/env bash
# =============================================================================
# LaunchOps — Zero-Downtime Update Script
# scripts/update.sh
#
# Pulls latest code from GitHub, rebuilds the Control Tower,
# runs any new migrations, and restarts with zero downtime.
#
# USAGE:
#   bash scripts/update.sh              # Full update
#   bash scripts/update.sh --skip-build # Pull + migrate only (no Docker rebuild)
#   bash scripts/update.sh --agents     # Update agent fleet only
# =============================================================================

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
log()     { echo -e "${CYAN}[update]${NC} $*"; }
success() { echo -e "${GREEN}[✓]${NC} $*"; }
warn()    { echo -e "${YELLOW}[!]${NC} $*"; }
error()   { echo -e "${RED}[✗]${NC} $*"; exit 1; }

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOWER_DIR="$REPO_DIR/control-tower"

SKIP_BUILD=false
AGENTS_ONLY=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build) SKIP_BUILD=true ;;
    --agents)     AGENTS_ONLY=true ;;
    *) warn "Unknown flag: $1" ;;
  esac
  shift
done

echo -e "\n${BOLD}${CYAN}── LaunchOps Update ──${NC}\n"

# ── 1. Pull latest code ───────────────────────────────────────────────────────
log "Pulling latest code from GitHub..."
cd "$REPO_DIR"
BEFORE=$(git rev-parse --short HEAD)
git fetch origin
git pull origin master
AFTER=$(git rev-parse --short HEAD)

if [[ "$BEFORE" == "$AFTER" ]]; then
  success "Already up to date ($AFTER) — no rebuild needed"
  [[ "$SKIP_BUILD" == "false" ]] && SKIP_BUILD=true
else
  success "Updated $BEFORE → $AFTER"
  # Show what changed
  echo ""
  git log --oneline "$BEFORE".."$AFTER" | head -10
  echo ""
fi

# ── 2. Install/update Node dependencies ───────────────────────────────────────
if [[ "$AGENTS_ONLY" != "true" ]]; then
  log "Updating Node.js dependencies..."
  cd "$TOWER_DIR"
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install
  success "Dependencies updated"
fi

# ── 3. Run new migrations ─────────────────────────────────────────────────────
if [[ "$AGENTS_ONLY" != "true" ]]; then
  log "Checking for new database migrations..."
  cd "$TOWER_DIR"
  DB_CONTAINER=$(docker ps --format '{{.Names}}' | grep -E "db|mariadb|mysql" | head -1 || echo "")
  if [[ -n "$DB_CONTAINER" ]]; then
    pnpm drizzle-kit migrate 2>/dev/null && success "Migrations applied" || \
      warn "Migration check failed — run manually if schema changed"
  else
    warn "No DB container running — skipping migrations"
  fi
fi

# ── 4. Rebuild and restart Control Tower ──────────────────────────────────────
if [[ "$AGENTS_ONLY" != "true" && "$SKIP_BUILD" != "true" ]]; then
  log "Rebuilding Control Tower Docker image..."
  cd "$REPO_DIR"
  docker compose build control-tower

  log "Restarting Control Tower (rolling restart)..."
  docker compose up -d --no-deps control-tower

  # Wait for health
  log "Waiting for Control Tower to be healthy..."
  RETRIES=20
  until curl -sf http://localhost:8090/api/health &>/dev/null; do
    RETRIES=$((RETRIES - 1))
    [[ $RETRIES -eq 0 ]] && { warn "Health check timed out — check: docker logs control_tower --tail 30"; break; }
    sleep 3
  done
  [[ $RETRIES -gt 0 ]] && success "Control Tower restarted and healthy"
fi

# ── 5. Update Python agents ───────────────────────────────────────────────────
AGENTS_DIR="$REPO_DIR/agents"
if [[ -d "$AGENTS_DIR" ]] && command -v pm2 &>/dev/null; then
  log "Reloading agent fleet..."
  cd "$AGENTS_DIR"
  [[ -f requirements.txt ]] && python3 -m pip install -q -r requirements.txt
  pm2 reload all 2>/dev/null && success "Agent fleet reloaded" || warn "PM2 reload failed — agents may not be running"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
success "Update complete — running commit: $(git -C "$REPO_DIR" rev-parse --short HEAD)"
echo -e "  ${CYAN}Dashboard:${NC} https://launchopspro.com"
echo -e "  ${CYAN}Logs:${NC}      docker logs control_tower -f"
echo ""
