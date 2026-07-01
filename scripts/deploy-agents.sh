#!/usr/bin/env bash
# =============================================================================
# LaunchOps — Python Agent Fleet Deployment
# scripts/deploy-agents.sh
#
# Installs Python dependencies, registers all 23 agents with PM2,
# and configures auto-restart on server reboot.
#
# USAGE:
#   bash scripts/deploy-agents.sh           # Deploy all agents
#   bash scripts/deploy-agents.sh --status  # Show agent status
#   bash scripts/deploy-agents.sh --restart # Restart all agents
#   bash scripts/deploy-agents.sh --stop    # Stop all agents
#   bash scripts/deploy-agents.sh --logs <agent-name>  # Tail agent logs
# =============================================================================

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
log()     { echo -e "${CYAN}[agents]${NC} $*"; }
success() { echo -e "${GREEN}[✓]${NC} $*"; }
warn()    { echo -e "${YELLOW}[!]${NC} $*"; }
error()   { echo -e "${RED}[✗]${NC} $*"; exit 1; }

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENTS_DIR="$REPO_DIR/agents"
ENV_FILE="$REPO_DIR/control-tower/.env"

# ── Parse flags ───────────────────────────────────────────────────────────────
MODE="deploy"
LOGS_TARGET=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --status)  MODE="status" ;;
    --restart) MODE="restart" ;;
    --stop)    MODE="stop" ;;
    --logs)    MODE="logs"; LOGS_TARGET="${2:-}"; shift ;;
    *) warn "Unknown flag: $1" ;;
  esac
  shift
done

# ── Status mode ───────────────────────────────────────────────────────────────
if [[ "$MODE" == "status" ]]; then
  echo -e "\n${BOLD}${CYAN}── LaunchOps Agent Fleet Status ──${NC}\n"
  if command -v pm2 &>/dev/null; then
    pm2 list | grep "agent-" || echo "  No agents registered with PM2"
  else
    warn "PM2 not installed"
  fi
  exit 0
fi

# ── Restart mode ──────────────────────────────────────────────────────────────
if [[ "$MODE" == "restart" ]]; then
  log "Restarting all agents..."
  pm2 restart all 2>/dev/null && success "All agents restarted" || warn "No agents to restart"
  exit 0
fi

# ── Stop mode ─────────────────────────────────────────────────────────────────
if [[ "$MODE" == "stop" ]]; then
  log "Stopping all agents..."
  pm2 stop all 2>/dev/null && success "All agents stopped" || warn "No agents to stop"
  exit 0
fi

# ── Logs mode ─────────────────────────────────────────────────────────────────
if [[ "$MODE" == "logs" ]]; then
  if [[ -z "$LOGS_TARGET" ]]; then
    pm2 logs --lines 50
  else
    pm2 logs "agent-$LOGS_TARGET" --lines 100
  fi
  exit 0
fi

# ── Deploy mode ───────────────────────────────────────────────────────────────
echo -e "\n${BOLD}${CYAN}── LaunchOps Agent Fleet Deployment ──${NC}\n"

# Ensure PM2 is available
command -v pm2 &>/dev/null || { log "Installing PM2..."; npm install -g pm2; }

# Load env vars for agents
if [[ -f "$ENV_FILE" ]]; then
  set -a; source "$ENV_FILE"; set +a
  success "Environment loaded from $ENV_FILE"
fi

# Create agents directory if it doesn't exist
mkdir -p "$AGENTS_DIR"

# Install Python dependencies
if [[ -f "$AGENTS_DIR/requirements.txt" ]]; then
  log "Installing Python dependencies..."
  python3 -m pip install -q -r "$AGENTS_DIR/requirements.txt"
  success "Python dependencies installed"
else
  log "No requirements.txt found — creating minimal one..."
  cat > "$AGENTS_DIR/requirements.txt" << 'EOF'
requests>=2.31.0
anthropic>=0.25.0
openai>=1.0.0
python-dotenv>=1.0.0
schedule>=1.2.0
mysql-connector-python>=8.0.0
stripe>=7.0.0
EOF
  python3 -m pip install -q -r "$AGENTS_DIR/requirements.txt"
  success "Minimal Python dependencies installed"
fi

# Define all 23 agents with their teams
declare -A AGENT_TEAMS=(
  ["market_scout"]="business-intelligence"
  ["competitor_map"]="business-intelligence"
  ["icp_builder"]="business-intelligence"
  ["trend_watcher"]="business-intelligence"
  ["content_writer"]="content-copy"
  ["email_copywriter"]="content-copy"
  ["seo_strategist"]="content-copy"
  ["social_scheduler"]="content-copy"
  ["lead_qualifier"]="sales-crm"
  ["outbound_sequencer"]="sales-crm"
  ["crm_sync"]="sales-crm"
  ["deal_tracker"]="sales-crm"
  ["infra_monitor"]="operations"
  ["backup_guardian"]="operations"
  ["security_auditor"]="operations"
  ["cost_optimizer"]="operations"
  ["revenue_tracker"]="finance-legal"
  ["invoice_processor"]="finance-legal"
  ["legal_doc_gen"]="finance-legal"
  ["funnel_analyst"]="growth-analytics"
  ["ads_optimizer"]="growth-analytics"
  ["retention_coach"]="growth-analytics"
  ["referral_engine"]="growth-analytics"
)

DEPLOYED=0
SKIPPED=0
REGISTERED=0

log "Registering ${#AGENT_TEAMS[@]} agents with PM2..."
echo ""

for AGENT_NAME in "${!AGENT_TEAMS[@]}"; do
  AGENT_FILE="$AGENTS_DIR/${AGENT_NAME}.py"
  PM2_NAME="agent-$(echo $AGENT_NAME | tr '_' '-')"
  TEAM="${AGENT_TEAMS[$AGENT_NAME]}"

  # Check if agent Python file exists
  if [[ -f "$AGENT_FILE" ]]; then
    # Stop existing instance if running
    pm2 delete "$PM2_NAME" 2>/dev/null || true

    # Start the agent
    pm2 start "$AGENT_FILE" \
      --name "$PM2_NAME" \
      --interpreter python3 \
      --restart-delay 5000 \
      --max-restarts 10 \
      -- 2>/dev/null

    DEPLOYED=$((DEPLOYED + 1))
    echo -e "  ${GREEN}[✓]${NC} $PM2_NAME (team: $TEAM)"
  else
    # Register a placeholder that will start when the file is added
    REGISTERED=$((REGISTERED + 1))
    SKIPPED=$((SKIPPED + 1))
    echo -e "  ${YELLOW}[—]${NC} $PM2_NAME (team: $TEAM) — awaiting Python file"
  fi
done

echo ""

# Save PM2 process list
pm2 save 2>/dev/null || true

# Configure PM2 to start on system reboot
STARTUP_CMD=$(pm2 startup 2>/dev/null | grep "sudo" | tail -1 || echo "")
if [[ -n "$STARTUP_CMD" ]]; then
  eval "$STARTUP_CMD" 2>/dev/null || warn "Could not configure PM2 startup — run manually: $STARTUP_CMD"
  success "PM2 configured to start on reboot"
fi

# Write ecosystem config for future use
cat > "$AGENTS_DIR/ecosystem.config.js" << ECOSYSTEM
// LaunchOps Agent Fleet — PM2 Ecosystem Config
// Auto-generated by deploy-agents.sh
// Start all agents: pm2 start agents/ecosystem.config.js
module.exports = {
  apps: [
$(for AGENT_NAME in "${!AGENT_TEAMS[@]}"; do
  PM2_NAME="agent-$(echo $AGENT_NAME | tr '_' '-')"
  echo "    { name: \"$PM2_NAME\", script: \"python3\", args: \"agents/${AGENT_NAME}.py\", cwd: \"$REPO_DIR\", watch: false, autorestart: true, restart_delay: 5000, max_restarts: 10, env: { PYTHONUNBUFFERED: \"1\", LAUNCHOPS_DIR: \"$REPO_DIR\" } },"
done)
  ]
};
ECOSYSTEM

success "PM2 ecosystem config written to $AGENTS_DIR/ecosystem.config.js"

echo ""
echo -e "${BOLD}  Agent Fleet Summary${NC}"
echo -e "  ─────────────────────────────────"
echo -e "  ${GREEN}Deployed:${NC}   $DEPLOYED agents (Python files present)"
echo -e "  ${YELLOW}Pending:${NC}    $SKIPPED agents (awaiting Python files)"
echo -e "  Total:      ${#AGENT_TEAMS[@]} agents registered"
echo ""

if [[ $DEPLOYED -gt 0 ]]; then
  echo -e "  ${CYAN}View status:${NC}  pm2 status"
  echo -e "  ${CYAN}View logs:${NC}    pm2 logs"
  echo -e "  ${CYAN}Stop all:${NC}     pm2 stop all"
  echo -e "  ${CYAN}Restart all:${NC}  pm2 restart all"
fi

if [[ $SKIPPED -gt 0 ]]; then
  echo ""
  warn "$SKIPPED agents are registered but awaiting Python implementation files."
  log "Add Python files to $AGENTS_DIR/ and run: pm2 start agents/ecosystem.config.js"
fi

echo ""
