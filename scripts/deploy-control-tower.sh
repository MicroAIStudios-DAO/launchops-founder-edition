#!/usr/bin/env bash
# =============================================================================
# LaunchOps — Control Tower & Agent Fleet Deployment Script
# scripts/deploy-control-tower.sh
#
# Deploys the LaunchOps Control Tower dashboard and all 23 AI agents on top
# of an already-running Docker stack (install.sh must have been run first).
#
# USAGE:
#   bash scripts/deploy-control-tower.sh              # Full deploy
#   bash scripts/deploy-control-tower.sh --update     # Pull latest + redeploy
#   bash scripts/deploy-control-tower.sh --agents-only # Redeploy agents only
#   bash scripts/deploy-control-tower.sh --tower-only  # Redeploy Control Tower only
#
# PREREQUISITES:
#   - Docker + Docker Compose installed
#   - install.sh has been run (base stack running)
#   - Node.js 20+ and pnpm installed
#   - control-tower/.env configured
# =============================================================================

set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log()     { echo -e "${CYAN}[LaunchOps]${NC} $*"; }
success() { echo -e "${GREEN}[✓]${NC} $*"; }
warn()    { echo -e "${YELLOW}[!]${NC} $*"; }
error()   { echo -e "${RED}[✗]${NC} $*"; exit 1; }
header()  { echo -e "\n${BOLD}${CYAN}── $* ──${NC}\n"; }

# ── Paths ─────────────────────────────────────────────────────────────────────
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOWER_DIR="$REPO_DIR/control-tower"
AGENTS_DIR="$REPO_DIR/agents"
ENV_FILE="$TOWER_DIR/.env"

# ── Flags ─────────────────────────────────────────────────────────────────────
UPDATE_MODE=false
AGENTS_ONLY=false
TOWER_ONLY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --update)       UPDATE_MODE=true ;;
    --agents-only)  AGENTS_ONLY=true ;;
    --tower-only)   TOWER_ONLY=true ;;
    *) warn "Unknown flag: $1" ;;
  esac
  shift
done

# ── Banner ────────────────────────────────────────────────────────────────────
echo -e "${CYAN}"
echo "  ┌─────────────────────────────────────────────────┐"
echo "  │  LaunchOps Control Tower + Agent Fleet Deploy   │"
echo "  │  launchopspro.com                               │"
echo "  └─────────────────────────────────────────────────┘"
echo -e "${NC}"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 1 — Validate prerequisites
# ─────────────────────────────────────────────────────────────────────────────
header "Step 1 — Validating Prerequisites"

command -v docker   &>/dev/null || error "Docker not found. Run install.sh first."
command -v node     &>/dev/null || error "Node.js not found. Install: curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs"
command -v pnpm     &>/dev/null || { log "Installing pnpm..."; npm install -g pnpm; }
command -v pm2      &>/dev/null || { log "Installing PM2..."; npm install -g pm2; }

# Verify base stack is running
if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "wordpress\|launchops"; then
  warn "Base stack does not appear to be running."
  warn "Run: bash install.sh first, then re-run this script."
  read -rp "  Continue anyway? (y/N): " CONT
  [[ "$CONT" != "y" && "$CONT" != "Y" ]] && exit 1
fi
success "Prerequisites validated"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 2 — Pull latest code (update mode)
# ─────────────────────────────────────────────────────────────────────────────
if [[ "$UPDATE_MODE" == "true" ]]; then
  header "Step 2 — Pulling Latest Code"
  cd "$REPO_DIR"
  git fetch origin
  git pull origin master
  success "Repository updated to $(git rev-parse --short HEAD)"
fi

# ─────────────────────────────────────────────────────────────────────────────
# STEP 3 — Configure Control Tower environment
# ─────────────────────────────────────────────────────────────────────────────
header "Step 3 — Environment Configuration"

if [[ ! -f "$ENV_FILE" ]]; then
  log "No .env found at $ENV_FILE — creating from template..."

  # Auto-detect MariaDB password from base .env
  BASE_ENV="$REPO_DIR/.env"
  DB_PASS=""
  if [[ -f "$BASE_ENV" ]]; then
    DB_PASS=$(grep -E "^DB_PASSWORD=" "$BASE_ENV" | cut -d= -f2 | tr -d '"' || echo "")
    DB_ROOT_PASS=$(grep -E "^DB_ROOT_PASSWORD=" "$BASE_ENV" | cut -d= -f2 | tr -d '"' || echo "")
  fi

  JWT_SECRET=$(openssl rand -hex 32)

  echo ""
  echo -e "  ${YELLOW}Enter your configuration values below.${NC}"
  echo -e "  ${YELLOW}Press ENTER to skip optional fields.${NC}"
  echo ""

  read -rp "  Domain [launchopspro.com]: "                    INPUT_DOMAIN
  read -rp "  Manus OAuth App ID: "                           INPUT_APP_ID
  read -rp "  Manus Owner Open ID: "                          INPUT_OWNER_ID
  read -rp "  Manus Owner Name [B]: "                         INPUT_OWNER_NAME
  read -rp "  Stripe Secret Key (sk_live_... or skip): "      INPUT_STRIPE_SK
  read -rp "  Stripe Publishable Key (pk_live_... or skip): " INPUT_STRIPE_PK
  read -rp "  Stripe Webhook Secret (whsec_... or skip): "    INPUT_STRIPE_WH
  read -rp "  ProofGuard API URL [http://proofguard:3001]: "  INPUT_PG_URL
  read -rp "  ProofGuard API Key (or skip): "                 INPUT_PG_KEY

  DOMAIN="${INPUT_DOMAIN:-launchopspro.com}"
  OWNER_NAME="${INPUT_OWNER_NAME:-B}"
  PG_URL="${INPUT_PG_URL:-http://proofguard:3001}"

  cat > "$ENV_FILE" << EOF
# LaunchOps Control Tower — Environment
# Generated by deploy-control-tower.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ")

DATABASE_URL=mysql://root:${DB_ROOT_PASS:-${DB_PASS:-changeme}}@launchops_db:3306/control_tower
JWT_SECRET=${JWT_SECRET}
VITE_APP_ID=${INPUT_APP_ID:-}
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://manus.im
OWNER_OPEN_ID=${INPUT_OWNER_ID:-}
OWNER_NAME=${OWNER_NAME}

STRIPE_SECRET_KEY=${INPUT_STRIPE_SK:-}
VITE_STRIPE_PUBLISHABLE_KEY=${INPUT_STRIPE_PK:-}
STRIPE_WEBHOOK_SECRET=${INPUT_STRIPE_WH:-}

PROOFGUARD_API_URL=${PG_URL}
PROOFGUARD_API_KEY=${INPUT_PG_KEY:-}

LAUNCHOPS_DIR=${REPO_DIR}
NODE_ENV=production
PORT=3000

BUILT_IN_FORGE_API_URL=
BUILT_IN_FORGE_API_KEY=
VITE_FRONTEND_FORGE_API_URL=
VITE_FRONTEND_FORGE_API_KEY=
EOF
  chmod 600 "$ENV_FILE"
  success ".env written to $ENV_FILE"
else
  success "Using existing .env at $ENV_FILE"
fi

# ─────────────────────────────────────────────────────────────────────────────
# STEP 4 — Install Node.js dependencies
# ─────────────────────────────────────────────────────────────────────────────
if [[ "$AGENTS_ONLY" != "true" ]]; then
  header "Step 4 — Installing Node.js Dependencies"
  cd "$TOWER_DIR"
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install
  success "Dependencies installed"
fi

# ─────────────────────────────────────────────────────────────────────────────
# STEP 5 — Create control_tower database and run migrations
# ─────────────────────────────────────────────────────────────────────────────
if [[ "$AGENTS_ONLY" != "true" ]]; then
  header "Step 5 — Database Setup & Migrations"

  # Detect the MariaDB container name
  DB_CONTAINER=$(docker ps --format '{{.Names}}' | grep -E "db|mariadb|mysql" | head -1 || echo "")
  if [[ -z "$DB_CONTAINER" ]]; then
    warn "No running database container found. Attempting to start MariaDB..."
    cd "$REPO_DIR" && docker compose up -d mariadb db 2>/dev/null || true
    sleep 10
    DB_CONTAINER=$(docker ps --format '{{.Names}}' | grep -E "db|mariadb|mysql" | head -1 || echo "")
  fi

  if [[ -n "$DB_CONTAINER" ]]; then
    log "Using database container: $DB_CONTAINER"

    # Extract DB root password
    DB_ROOT_PASS=$(grep -E "^DB_ROOT_PASSWORD=" "$REPO_DIR/.env" 2>/dev/null | cut -d= -f2 | tr -d '"' || \
                   grep -E "^DB_PASSWORD=" "$REPO_DIR/.env" 2>/dev/null | cut -d= -f2 | tr -d '"' || echo "")

    # Wait for DB to be ready
    log "Waiting for database to be ready..."
    RETRIES=20
    until docker exec "$DB_CONTAINER" mysqladmin ping -h localhost --silent 2>/dev/null; do
      RETRIES=$((RETRIES - 1))
      [[ $RETRIES -eq 0 ]] && error "Database did not become ready. Check: docker logs $DB_CONTAINER"
      sleep 3
    done
    success "Database is ready"

    # Create control_tower database
    docker exec "$DB_CONTAINER" mysql -uroot -p"${DB_ROOT_PASS}" \
      -e "CREATE DATABASE IF NOT EXISTS control_tower CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" \
      2>/dev/null && success "control_tower database ready" || warn "DB creation skipped (may already exist)"

    # Run migrations
    log "Running Drizzle migrations..."
    cd "$TOWER_DIR"
    pnpm drizzle-kit migrate 2>/dev/null && success "Migrations applied" || {
      warn "drizzle-kit migrate failed — applying SQL files directly..."
      for SQL in drizzle/*.sql; do
        [[ -f "$SQL" ]] || continue
        log "  Applying $(basename $SQL)..."
        docker exec -i "$DB_CONTAINER" mysql -uroot -p"${DB_ROOT_PASS}" control_tower \
          < "$SQL" 2>/dev/null && success "  $(basename $SQL) applied" || \
          warn "  $(basename $SQL) skipped (may already be applied)"
      done
    }
  else
    warn "No database container found — skipping migrations. Run manually after DB is up."
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# STEP 6 — Build and deploy Control Tower container
# ─────────────────────────────────────────────────────────────────────────────
if [[ "$AGENTS_ONLY" != "true" ]]; then
  header "Step 6 — Building & Starting Control Tower"

  cd "$REPO_DIR"

  # Add control-tower service to docker-compose if not already present
  if ! grep -q "control-tower\|control_tower" docker-compose.yml 2>/dev/null; then
    log "Adding control-tower service to docker-compose.yml..."
    # Append service definition before the final networks block
    python3 - "$REPO_DIR/docker-compose.yml" << 'PYEOF'
import sys, re

path = sys.argv[1]
with open(path) as f:
    content = f.read()

service_block = """
  control-tower:
    build:
      context: ./control-tower
      dockerfile: Dockerfile
    container_name: control_tower
    restart: unless-stopped
    ports:
      - "8090:3000"
    environment:
      - NODE_ENV=production
    env_file:
      - ./control-tower/.env
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    networks:
      - launchops_net
    depends_on:
      - db
"""

# Insert before the networks: section
if "control-tower" not in content:
    content = re.sub(r'\nnetworks:', service_block + '\nnetworks:', content, count=1)
    with open(path, 'w') as f:
        f.write(content)
    print("Service added to docker-compose.yml")
else:
    print("control-tower already in docker-compose.yml")
PYEOF
  fi

  # Write Dockerfile if missing
  if [[ ! -f "$TOWER_DIR/Dockerfile" ]]; then
    log "Writing Dockerfile for Control Tower..."
    cat > "$TOWER_DIR/Dockerfile" << 'DOCKERFILE'
FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:20-alpine AS runner
WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/drizzle ./drizzle
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "dist/server/_core/index.js"]
DOCKERFILE
    success "Dockerfile written"
  fi

  log "Building Control Tower Docker image..."
  docker compose build control-tower

  log "Starting Control Tower..."
  docker compose up -d control-tower

  # Wait for it to be healthy
  log "Waiting for Control Tower to start (up to 60s)..."
  RETRIES=20
  until curl -sf http://localhost:8090/api/health &>/dev/null; do
    RETRIES=$((RETRIES - 1))
    if [[ $RETRIES -eq 0 ]]; then
      warn "Control Tower health check timed out. Check: docker logs control_tower --tail 30"
      break
    fi
    sleep 3
  done
  [[ $RETRIES -gt 0 ]] && success "Control Tower is live at http://localhost:8090"
fi

# ─────────────────────────────────────────────────────────────────────────────
# STEP 7 — Deploy Python Agent Fleet
# ─────────────────────────────────────────────────────────────────────────────
if [[ "$TOWER_ONLY" != "true" ]]; then
  header "Step 7 — Deploying Python Agent Fleet (23 Agents)"

  if [[ -d "$AGENTS_DIR" ]]; then
    cd "$AGENTS_DIR"

    # Install Python dependencies
    if [[ -f "requirements.txt" ]]; then
      log "Installing Python agent dependencies..."
      python3 -m pip install -q -r requirements.txt && success "Python deps installed"
    fi

    # Create PM2 ecosystem config for all agents
    log "Writing PM2 ecosystem config for agent fleet..."
    cat > "$AGENTS_DIR/ecosystem.config.js" << 'ECOSYSTEM'
// LaunchOps Agent Fleet — PM2 Ecosystem Config
// 23 agents across 6 teams, managed by PM2
module.exports = {
  apps: [
    // ── TEAM 1: Business Intelligence ──────────────────────────────────────
    { name: "agent-market-scout",      script: "python3", args: "agents/market_scout.py",      cwd: process.env.LAUNCHOPS_DIR || "/root/launchops-founder-edition", watch: false, autorestart: true, env: { PYTHONUNBUFFERED: "1" } },
    { name: "agent-competitor-map",    script: "python3", args: "agents/competitor_map.py",    cwd: process.env.LAUNCHOPS_DIR || "/root/launchops-founder-edition", watch: false, autorestart: true, env: { PYTHONUNBUFFERED: "1" } },
    { name: "agent-icp-builder",       script: "python3", args: "agents/icp_builder.py",       cwd: process.env.LAUNCHOPS_DIR || "/root/launchops-founder-edition", watch: false, autorestart: true, env: { PYTHONUNBUFFERED: "1" } },
    { name: "agent-trend-watcher",     script: "python3", args: "agents/trend_watcher.py",     cwd: process.env.LAUNCHOPS_DIR || "/root/launchops-founder-edition", watch: false, autorestart: true, env: { PYTHONUNBUFFERED: "1" } },

    // ── TEAM 2: Content & Copy ─────────────────────────────────────────────
    { name: "agent-content-writer",    script: "python3", args: "agents/content_writer.py",    cwd: process.env.LAUNCHOPS_DIR || "/root/launchops-founder-edition", watch: false, autorestart: true, env: { PYTHONUNBUFFERED: "1" } },
    { name: "agent-email-copywriter",  script: "python3", args: "agents/email_copywriter.py",  cwd: process.env.LAUNCHOPS_DIR || "/root/launchops-founder-edition", watch: false, autorestart: true, env: { PYTHONUNBUFFERED: "1" } },
    { name: "agent-seo-strategist",    script: "python3", args: "agents/seo_strategist.py",    cwd: process.env.LAUNCHOPS_DIR || "/root/launchops-founder-edition", watch: false, autorestart: true, env: { PYTHONUNBUFFERED: "1" } },
    { name: "agent-social-scheduler",  script: "python3", args: "agents/social_scheduler.py",  cwd: process.env.LAUNCHOPS_DIR || "/root/launchops-founder-edition", watch: false, autorestart: true, env: { PYTHONUNBUFFERED: "1" } },

    // ── TEAM 3: Sales & CRM ────────────────────────────────────────────────
    { name: "agent-lead-qualifier",    script: "python3", args: "agents/lead_qualifier.py",    cwd: process.env.LAUNCHOPS_DIR || "/root/launchops-founder-edition", watch: false, autorestart: true, env: { PYTHONUNBUFFERED: "1" } },
    { name: "agent-outbound-sequencer",script: "python3", args: "agents/outbound_sequencer.py",cwd: process.env.LAUNCHOPS_DIR || "/root/launchops-founder-edition", watch: false, autorestart: true, env: { PYTHONUNBUFFERED: "1" } },
    { name: "agent-crm-sync",          script: "python3", args: "agents/crm_sync.py",          cwd: process.env.LAUNCHOPS_DIR || "/root/launchops-founder-edition", watch: false, autorestart: true, env: { PYTHONUNBUFFERED: "1" } },
    { name: "agent-deal-tracker",      script: "python3", args: "agents/deal_tracker.py",      cwd: process.env.LAUNCHOPS_DIR || "/root/launchops-founder-edition", watch: false, autorestart: true, env: { PYTHONUNBUFFERED: "1" } },

    // ── TEAM 4: Operations & Infrastructure ───────────────────────────────
    { name: "agent-infra-monitor",     script: "python3", args: "agents/infra_monitor.py",     cwd: process.env.LAUNCHOPS_DIR || "/root/launchops-founder-edition", watch: false, autorestart: true, env: { PYTHONUNBUFFERED: "1" } },
    { name: "agent-backup-guardian",   script: "python3", args: "agents/backup_guardian.py",   cwd: process.env.LAUNCHOPS_DIR || "/root/launchops-founder-edition", watch: false, autorestart: true, env: { PYTHONUNBUFFERED: "1" } },
    { name: "agent-security-auditor",  script: "python3", args: "agents/security_auditor.py",  cwd: process.env.LAUNCHOPS_DIR || "/root/launchops-founder-edition", watch: false, autorestart: true, env: { PYTHONUNBUFFERED: "1" } },
    { name: "agent-cost-optimizer",    script: "python3", args: "agents/cost_optimizer.py",    cwd: process.env.LAUNCHOPS_DIR || "/root/launchops-founder-edition", watch: false, autorestart: true, env: { PYTHONUNBUFFERED: "1" } },

    // ── TEAM 5: Finance & Legal ────────────────────────────────────────────
    { name: "agent-revenue-tracker",   script: "python3", args: "agents/revenue_tracker.py",   cwd: process.env.LAUNCHOPS_DIR || "/root/launchops-founder-edition", watch: false, autorestart: true, env: { PYTHONUNBUFFERED: "1" } },
    { name: "agent-invoice-processor", script: "python3", args: "agents/invoice_processor.py", cwd: process.env.LAUNCHOPS_DIR || "/root/launchops-founder-edition", watch: false, autorestart: true, env: { PYTHONUNBUFFERED: "1" } },
    { name: "agent-legal-doc-gen",     script: "python3", args: "agents/legal_doc_gen.py",     cwd: process.env.LAUNCHOPS_DIR || "/root/launchops-founder-edition", watch: false, autorestart: true, env: { PYTHONUNBUFFERED: "1" } },

    // ── TEAM 6: Growth & Analytics ─────────────────────────────────────────
    { name: "agent-funnel-analyst",    script: "python3", args: "agents/funnel_analyst.py",    cwd: process.env.LAUNCHOPS_DIR || "/root/launchops-founder-edition", watch: false, autorestart: true, env: { PYTHONUNBUFFERED: "1" } },
    { name: "agent-ads-optimizer",     script: "python3", args: "agents/ads_optimizer.py",     cwd: process.env.LAUNCHOPS_DIR || "/root/launchops-founder-edition", watch: false, autorestart: true, env: { PYTHONUNBUFFERED: "1" } },
    { name: "agent-retention-coach",   script: "python3", args: "agents/retention_coach.py",   cwd: process.env.LAUNCHOPS_DIR || "/root/launchops-founder-edition", watch: false, autorestart: true, env: { PYTHONUNBUFFERED: "1" } },
    { name: "agent-referral-engine",   script: "python3", args: "agents/referral_engine.py",   cwd: process.env.LAUNCHOPS_DIR || "/root/launchops-founder-edition", watch: false, autorestart: true, env: { PYTHONUNBUFFERED: "1" } },
    { name: "agent-atlas-orchestrator",script: "python3", args: "agents/atlas_orchestrator.py",cwd: process.env.LAUNCHOPS_DIR || "/root/launchops-founder-edition", watch: false, autorestart: true, env: { PYTHONUNBUFFERED: "1" } },
  ]
};
ECOSYSTEM

    # Start agents that have their Python files present
    STARTED=0
    SKIPPED=0
    for AGENT_FILE in "$AGENTS_DIR"/*.py; do
      [[ -f "$AGENT_FILE" ]] || continue
      AGENT_NAME="agent-$(basename "$AGENT_FILE" .py | tr '_' '-')"
      pm2 start "$AGENT_FILE" \
        --name "$AGENT_NAME" \
        --interpreter python3 \
        --no-autorestart \
        -- 2>/dev/null && STARTED=$((STARTED + 1)) || SKIPPED=$((SKIPPED + 1))
    done

    if [[ $STARTED -gt 0 ]]; then
      pm2 save
      success "$STARTED agents started via PM2 ($SKIPPED skipped — Python files not yet present)"
    else
      warn "No Python agent files found in $AGENTS_DIR"
      warn "Agents will be available once Python agent files are added to the agents/ directory"
      log "PM2 ecosystem config written to $AGENTS_DIR/ecosystem.config.js"
      log "When agent files are added, run: pm2 start $AGENTS_DIR/ecosystem.config.js"
    fi

    # Save PM2 startup config
    pm2 startup 2>/dev/null | tail -1 | bash 2>/dev/null || true
    pm2 save 2>/dev/null || true

  else
    warn "agents/ directory not found at $AGENTS_DIR"
    warn "Create the directory and add Python agent files, then re-run with --agents-only"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# STEP 8 — Configure Nginx
# ─────────────────────────────────────────────────────────────────────────────
if [[ "$AGENTS_ONLY" != "true" ]]; then
  header "Step 8 — Nginx Configuration"

  # Read domain from .env
  DOMAIN=$(grep -E "^DOMAIN=" "$ENV_FILE" 2>/dev/null | cut -d= -f2 | tr -d '"' || echo "launchopspro.com")
  [[ -z "$DOMAIN" || "$DOMAIN" == "launchopspro.com" ]] && DOMAIN="launchopspro.com"

  if command -v nginx &>/dev/null; then
    cat > /etc/nginx/sites-available/launchopspro << NGINX_CONF
# LaunchOps Control Tower — Nginx
# Generated by deploy-control-tower.sh

server {
    listen 80;
    server_name ${DOMAIN} www.${DOMAIN};

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Main app
    location / {
        proxy_pass http://localhost:8090;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 180s;
        client_max_body_size 50M;
    }

    # SSE streaming (Pipeline Monitor)
    location ~ ^/api/trpc/(pipeline|agents) {
        proxy_pass http://localhost:8090;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
        chunked_transfer_encoding on;
    }
}
NGINX_CONF

    ln -sf /etc/nginx/sites-available/launchopspro /etc/nginx/sites-enabled/launchopspro
    nginx -t && systemctl reload nginx
    success "Nginx configured for $DOMAIN"

    # SSL
    if command -v certbot &>/dev/null; then
      read -rp "  Provision SSL for $DOMAIN now? (Y/n): " DO_SSL
      if [[ "$DO_SSL" != "n" && "$DO_SSL" != "N" ]]; then
        read -rp "  Email for SSL certificate: " SSL_EMAIL
        certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" \
          --email "$SSL_EMAIL" --agree-tos --non-interactive --redirect \
          && success "SSL certificate provisioned" \
          || warn "SSL failed — ensure DNS A record points to this server IP"
      fi
    fi
  else
    warn "Nginx not installed — skipping reverse proxy setup"
    warn "Install: apt-get install -y nginx certbot python3-certbot-nginx"
    log "Control Tower accessible directly at: http://YOUR_SERVER_IP:8090"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# DONE
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}"
echo "  ╔══════════════════════════════════════════════════════╗"
echo "  ║   LaunchOps Control Tower is DEPLOYED               ║"
echo "  ╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""
echo -e "  ${CYAN}Dashboard:${NC}     https://launchopspro.com"
echo -e "  ${CYAN}Direct:${NC}        http://localhost:8090"
echo -e "  ${CYAN}Logs:${NC}          docker logs control_tower -f"
echo -e "  ${CYAN}Agent status:${NC}  pm2 status"
echo -e "  ${CYAN}Update:${NC}        bash scripts/deploy-control-tower.sh --update"
echo -e "  ${CYAN}Health:${NC}        bash scripts/health-check.sh"
echo ""
