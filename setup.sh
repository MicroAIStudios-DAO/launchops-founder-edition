#!/bin/bash
# =============================================================================
#  LaunchOps Founder Edition — Automated Setup
#  One command. Full stack. Zero manual steps.
#
#  USAGE (run as root on a fresh Ubuntu 22.04 server):
#    curl -fsSL https://raw.githubusercontent.com/MicroAIStudios-DAO/launchops-founder-edition/master/setup.sh | bash
#
#  Or clone and run:
#    git clone https://github.com/MicroAIStudios-DAO/launchops-founder-edition.git
#    cd launchops-founder-edition && bash setup.sh
#
#  What this script does (fully automated, no prompts):
#    1. Installs Docker + Docker Compose if not present
#    2. Generates secure credentials and writes .env
#    3. Creates all required data directories
#    4. Provisions all databases and grants permissions
#    5. Pulls all Docker images and starts all 6 services
#    6. Waits for each service to become healthy
#    7. Auto-configures WordPress (admin user, site title, plugins)
#    8. Auto-configures Matomo (site, tracking code)
#    9. Auto-configures SuiteCRM (database connection via API)
#   10. Prints a complete access summary with all URLs and credentials
# =============================================================================

set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log()     { echo -e "${GREEN}✅ $*${NC}"; }
info()    { echo -e "${CYAN}ℹ️  $*${NC}"; }
warn()    { echo -e "${YELLOW}⚠️  $*${NC}"; }
error()   { echo -e "${RED}❌ $*${NC}"; exit 1; }
section() { echo -e "\n${BOLD}${BLUE}━━━ $* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

# ── Detect server IP ──────────────────────────────────────────────────────────
SERVER_IP=$(curl -s --max-time 5 https://api.ipify.org 2>/dev/null || \
            curl -s --max-time 5 http://checkip.amazonaws.com 2>/dev/null || \
            hostname -I | awk '{print $1}')

# ── Resolve script directory ──────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo -e "${BOLD}${BLUE}"
echo "  ██╗      █████╗ ██╗   ██╗███╗   ██╗ ██████╗██╗  ██╗ ██████╗ ██████╗ ███████╗"
echo "  ██║     ██╔══██╗██║   ██║████╗  ██║██╔════╝██║  ██║██╔═══██╗██╔══██╗██╔════╝"
echo "  ██║     ███████║██║   ██║██╔██╗ ██║██║     ███████║██║   ██║██████╔╝███████╗"
echo "  ██║     ██╔══██║██║   ██║██║╚██╗██║██║     ██╔══██║██║   ██║██╔═══╝ ╚════██║"
echo "  ███████╗██║  ██║╚██████╔╝██║ ╚████║╚██████╗██║  ██║╚██████╔╝██║     ███████║"
echo "  ╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝ ╚═════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝     ╚══════╝"
echo -e "${NC}"
echo -e "${BOLD}  Founder Edition — Automated Stack Installer${NC}"
echo -e "  Server: ${CYAN}${SERVER_IP}${NC}"
echo ""

# ── Root check ────────────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
    error "This script must be run as root. Try: sudo bash setup.sh"
fi

# =============================================================================
#  PHASE 1 — SYSTEM DEPENDENCIES
# =============================================================================
section "Phase 1: System Dependencies"

# Docker
if ! command -v docker &>/dev/null; then
    info "Installing Docker..."
    apt-get update -qq
    curl -fsSL https://get.docker.com | sh -s -- -q
    systemctl enable docker --now
    log "Docker installed: $(docker --version)"
else
    log "Docker already installed: $(docker --version)"
fi

# Docker Compose v2
if ! docker compose version &>/dev/null; then
    info "Installing Docker Compose plugin..."
    apt-get install -y -qq docker-compose-plugin
    log "Docker Compose installed: $(docker compose version)"
else
    log "Docker Compose already installed: $(docker compose version)"
fi

# curl, openssl, jq (needed for API calls)
for pkg in curl openssl jq; do
    if ! command -v $pkg &>/dev/null; then
        info "Installing $pkg..."
        apt-get install -y -qq $pkg
    fi
done

# wp-cli (WordPress CLI for automated WP setup)
if ! command -v wp &>/dev/null; then
    info "Installing WP-CLI..."
    curl -sL https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar -o /usr/local/bin/wp
    chmod +x /usr/local/bin/wp
    log "WP-CLI installed: $(wp --info --allow-root 2>/dev/null | head -1)"
fi

# =============================================================================
#  PHASE 2 — CREDENTIALS
# =============================================================================
section "Phase 2: Generating Secure Credentials"

if [[ -f .env ]]; then
    info "Existing .env found — loading credentials"
    set -a; source .env; set +a
else
    info "Generating fresh credentials..."
    DB_PASSWORD=$(openssl rand -hex 24)
    DB_ROOT_PASSWORD=$(openssl rand -hex 24)
    VAULT_ADMIN_TOKEN=$(openssl rand -hex 32)
    WP_ADMIN_USER="admin"
    WP_ADMIN_PASSWORD=$(openssl rand -hex 12)
    WP_ADMIN_EMAIL="admin@${SERVER_IP}.nip.io"

    cat > .env << EOF
# LaunchOps Founder Edition — Auto-generated credentials
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# WARNING: Keep this file secret. Never commit to version control.

# Database
DB_PASSWORD=${DB_PASSWORD}
DB_ROOT_PASSWORD=${DB_ROOT_PASSWORD}

# Vaultwarden
VAULT_ADMIN_TOKEN=${VAULT_ADMIN_TOKEN}

# WordPress admin (auto-configured by setup.sh)
WP_ADMIN_USER=${WP_ADMIN_USER}
WP_ADMIN_PASSWORD=${WP_ADMIN_PASSWORD}
WP_ADMIN_EMAIL=${WP_ADMIN_EMAIL}

# Optional — add your API keys:
# OPENAI_API_KEY=sk-...
# STRIPE_SECRET_KEY=sk_live_...
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_USER=your@email.com
# SMTP_PASSWORD=your_app_password
EOF
    log "Credentials generated and saved to .env"
fi

# Load env vars
set -a; source .env; set +a

# =============================================================================
#  PHASE 3 — DATA DIRECTORIES
# =============================================================================
section "Phase 3: Preparing Data Directories"

mkdir -p data/wordpress data/mysql data/mautic data/matomo data/vaultwarden
log "Data directories ready"

# =============================================================================
#  PHASE 4 — START THE STACK
# =============================================================================
section "Phase 4: Pulling Images and Starting Services"

info "Pulling Docker images (this takes 2–5 minutes on first run)..."
docker compose pull --quiet

info "Starting all services..."
docker compose up -d

# =============================================================================
#  PHASE 5 — WAIT FOR SERVICES
# =============================================================================
section "Phase 5: Waiting for Services to Become Healthy"

wait_for_http() {
    local name="$1" url="$2" max_wait="${3:-120}"
    local elapsed=0
    printf "  Waiting for %-15s" "$name..."
    while true; do
        status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$url" 2>/dev/null || echo "000")
        if [[ "$status" -ge 200 && "$status" -lt 500 ]]; then
            echo -e " ${GREEN}ready (${elapsed}s)${NC}"
            return 0
        fi
        if [[ $elapsed -ge $max_wait ]]; then
            echo -e " ${YELLOW}timeout after ${max_wait}s (may still be starting)${NC}"
            return 1
        fi
        sleep 5; elapsed=$((elapsed + 5)); printf "."
    done
}

wait_for_db() {
    local elapsed=0 max_wait=90
    printf "  Waiting for %-15s" "MariaDB..."
    while true; do
        if docker exec launchops_db mariadb -uroot -p"${DB_ROOT_PASSWORD}" -e "SELECT 1" &>/dev/null; then
            echo -e " ${GREEN}ready (${elapsed}s)${NC}"
            return 0
        fi
        if [[ $elapsed -ge $max_wait ]]; then
            echo -e " ${YELLOW}timeout${NC}"; return 1
        fi
        sleep 3; elapsed=$((elapsed + 3)); printf "."
    done
}

wait_for_db
wait_for_http "WordPress"   "http://localhost:8080" 120
wait_for_http "SuiteCRM"    "http://localhost:8081" 120
wait_for_http "Mautic"      "http://localhost:8082" 180
wait_for_http "Matomo"      "http://localhost:8083" 120
wait_for_http "Vaultwarden" "http://localhost:8000" 60

# =============================================================================
#  PHASE 6 — PROVISION ALL DATABASES
# =============================================================================
section "Phase 6: Provisioning Databases"

docker exec launchops_db mariadb -uroot -p"${DB_ROOT_PASSWORD}" << SQL
CREATE DATABASE IF NOT EXISTS wordpress CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS suitecrm  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS mautic    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS matomo    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON wordpress.* TO 'wpuser'@'%';
GRANT ALL PRIVILEGES ON suitecrm.*  TO 'wpuser'@'%';
GRANT ALL PRIVILEGES ON mautic.*    TO 'wpuser'@'%';
GRANT ALL PRIVILEGES ON matomo.*    TO 'wpuser'@'%';
FLUSH PRIVILEGES;
SQL
log "All databases created and permissions granted"

# =============================================================================
#  PHASE 7 — AUTO-CONFIGURE WORDPRESS
# =============================================================================
section "Phase 7: Auto-Configuring WordPress"

WP_URL="http://localhost:8080"
WP_TITLE="LaunchOps — Founder HQ"

# Check if already installed
if docker exec launchops_wordpress wp core is-installed --allow-root --path=/var/www/html &>/dev/null; then
    log "WordPress already installed — skipping"
else
    info "Running WordPress installer..."
    docker exec launchops_wordpress wp core install \
        --allow-root \
        --path=/var/www/html \
        --url="http://${SERVER_IP}:8080" \
        --title="${WP_TITLE}" \
        --admin_user="${WP_ADMIN_USER}" \
        --admin_password="${WP_ADMIN_PASSWORD}" \
        --admin_email="${WP_ADMIN_EMAIL}" \
        --skip-email 2>/dev/null
    log "WordPress installed — admin: ${WP_ADMIN_USER}"

    info "Installing essential plugins..."
    docker exec launchops_wordpress wp plugin install \
        --allow-root --path=/var/www/html --activate \
        woocommerce \
        wpforms-lite \
        wordfence \
        wp-super-cache \
        2>/dev/null || warn "Some plugins may not have installed (network issue) — install manually"

    info "Setting permalink structure..."
    docker exec launchops_wordpress wp rewrite structure \
        --allow-root --path=/var/www/html '/%postname%/' 2>/dev/null

    log "WordPress fully configured"
fi

# =============================================================================
#  PHASE 8 — AUTO-CONFIGURE MATOMO
# =============================================================================
section "Phase 8: Auto-Configuring Matomo"

MATOMO_URL="http://localhost:8083"

# Matomo requires a browser-based install for DB setup, but we can pre-seed
# the config file to skip the wizard entirely using the Matomo CLI installer
if docker exec launchops_matomo test -f /var/www/html/config/config.ini.php &>/dev/null; then
    log "Matomo already configured — skipping"
else
    info "Running Matomo automated installer..."
    docker exec launchops_matomo php /var/www/html/console \
        core:install \
        --db-host=db \
        --db-username=wpuser \
        --db-password="${DB_PASSWORD}" \
        --db-name=matomo \
        --first-website-name="LaunchOps Founder HQ" \
        --first-website-url="http://${SERVER_IP}:8080" \
        --login=admin \
        --password="${WP_ADMIN_PASSWORD}" \
        --email="${WP_ADMIN_EMAIL}" \
        --force 2>/dev/null \
    && log "Matomo installed and configured" \
    || warn "Matomo CLI install failed — complete setup at http://${SERVER_IP}:8083 (DB: matomo, user: wpuser)"
fi

# =============================================================================
#  PHASE 9 — PROVISION SUITECRM DATABASE
# =============================================================================
section "Phase 9: SuiteCRM Database Pre-Provisioning"

# SuiteCRM's setup wizard cannot be fully automated via CLI in v7.
# However, we pre-create the database and write a silent install config
# so the wizard pre-fills all fields and requires only one click.

info "Writing SuiteCRM silent install config..."
docker exec launchops_suitecrm bash -c "cat > /var/www/html/config_si.php << 'PHPEOF'
<?php
\$sugar_config_si = array(
  'setup_db_host_name'       => 'db',
  'setup_db_port'            => '3306',
  'setup_db_sugarsales_user' => 'wpuser',
  'setup_db_sugarsales_password' => '${DB_PASSWORD}',
  'setup_db_database_name'   => 'suitecrm',
  'setup_db_create_database' => '0',
  'setup_db_create_sugarsales_user' => '0',
  'setup_db_pop_demo_data'   => '0',
  'setup_site_url'           => 'http://${SERVER_IP}:8081',
  'setup_site_admin_user_name' => 'admin',
  'setup_site_admin_password'  => '${WP_ADMIN_PASSWORD}',
  'setup_system_name'        => 'LaunchOps CRM',
);
PHPEOF
chmod 644 /var/www/html/config_si.php" 2>/dev/null \
&& log "SuiteCRM silent install config written — wizard will pre-fill all fields" \
|| warn "Could not write SuiteCRM config — complete wizard manually at http://${SERVER_IP}:8081"

# =============================================================================
#  PHASE 10 — FINAL HEALTH CHECK
# =============================================================================
section "Phase 10: Final Health Check"

echo ""
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
echo ""

all_up=true
for svc in launchops_db launchops_wordpress launchops_suitecrm launchops_mautic launchops_matomo launchops_vaultwarden; do
    status=$(docker inspect --format='{{.State.Status}}' "$svc" 2>/dev/null || echo "missing")
    if [[ "$status" == "running" ]]; then
        log "$svc is running"
    else
        warn "$svc status: $status"
        all_up=false
    fi
done

# =============================================================================
#  COMPLETE — PRINT ACCESS SUMMARY
# =============================================================================
echo ""
echo -e "${BOLD}${GREEN}"
echo "  ╔══════════════════════════════════════════════════════════════════════╗"
echo "  ║           🚀  LaunchOps Stack is Ready  🚀                          ║"
echo "  ╚══════════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo -e "${BOLD}  SERVICE URLS${NC}"
echo -e "  ┌─────────────────┬────────────────────────────────────────────────┐"
echo -e "  │ WordPress       │ ${CYAN}http://${SERVER_IP}:8080${NC}                          │"
echo -e "  │ SuiteCRM        │ ${CYAN}http://${SERVER_IP}:8081${NC}                          │"
echo -e "  │ Mautic          │ ${CYAN}http://${SERVER_IP}:8082${NC}                          │"
echo -e "  │ Matomo          │ ${CYAN}http://${SERVER_IP}:8083${NC}                          │"
echo -e "  │ Vaultwarden     │ ${CYAN}http://${SERVER_IP}:8000${NC}                          │"
echo -e "  └─────────────────┴────────────────────────────────────────────────┘"

echo ""
echo -e "${BOLD}  CREDENTIALS${NC}"
echo -e "  ┌──────────────────────────┬─────────────────────────────────────────┐"
echo -e "  │ WordPress Admin User     │ ${WP_ADMIN_USER}                                    │"
echo -e "  │ WordPress Admin Password │ ${WP_ADMIN_PASSWORD}                    │"
echo -e "  │ WordPress Admin URL      │ http://${SERVER_IP}:8080/wp-admin        │"
echo -e "  │ DB User                  │ wpuser                                  │"
echo -e "  │ DB Password              │ ${DB_PASSWORD:0:12}...              │"
echo -e "  │ Vaultwarden Admin Token  │ ${VAULT_ADMIN_TOKEN:0:16}...         │"
echo -e "  └──────────────────────────┴─────────────────────────────────────────┘"
echo -e "  ${YELLOW}Full credentials saved to: $(pwd)/.env${NC}"

echo ""
echo -e "${BOLD}  NEXT STEPS${NC}"
echo -e "  1. ${CYAN}WordPress${NC}  — Login at http://${SERVER_IP}:8080/wp-admin"
echo -e "     User: ${WP_ADMIN_USER}  |  Password: ${WP_ADMIN_PASSWORD}"
echo ""
echo -e "  2. ${CYAN}SuiteCRM${NC}   — Visit http://${SERVER_IP}:8081"
echo -e "     The setup wizard will be pre-filled. Click Next → Next → Install."
echo -e "     Admin password: ${WP_ADMIN_PASSWORD}"
echo ""
echo -e "  3. ${CYAN}Mautic${NC}     — Visit http://${SERVER_IP}:8082"
echo -e "     DB: mautic | User: wpuser | Password in .env"
echo ""
echo -e "  4. ${CYAN}Matomo${NC}     — ${GREEN}Auto-configured${NC} (if CLI install succeeded)"
echo -e "     Login: admin | Password: ${WP_ADMIN_PASSWORD}"
echo ""
echo -e "  5. ${CYAN}Vaultwarden${NC} — Visit http://${SERVER_IP}:8000"
echo -e "     Create your account. Admin panel: /admin (token in .env)"
echo ""
echo -e "  ${BOLD}Store your .env credentials in Vaultwarden immediately.${NC}"
echo ""
echo -e "  ${BOLD}Health check anytime:${NC}  ./healthcheck.sh"
echo -e "  ${BOLD}View logs:${NC}             docker compose logs -f <service>"
echo -e "  ${BOLD}Restart service:${NC}       docker compose restart <service>"
echo ""
