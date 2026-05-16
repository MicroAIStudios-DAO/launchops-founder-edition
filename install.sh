#!/bin/bash
# =============================================================================
#  LaunchOps Founder Edition — 1-Click Deploy Script
#  Deploys a revenue-ready business stack in under 2 hours.
#
#  Services:
#    WordPress    — Marketing site + WooCommerce  → http://localhost:8080
#    SuiteCRM     — CRM / Sales pipeline          → http://localhost:8081
#    Mautic       — Email marketing automation    → http://localhost:8082
#    Matomo       — Privacy-first analytics       → http://localhost:8083
#    Vaultwarden  — Credential vault              → http://localhost:8000
#
#  USAGE:
#    chmod +x install.sh && ./install.sh
# =============================================================================

set -e

echo "🚀 Initializing LaunchOps Stack Deployment..."

# ── Dependency checks ─────────────────────────────────────────────────────────
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    echo "   Quick install: curl -fsSL https://get.docker.com | sh"
    exit 1
fi

if ! docker compose version &> /dev/null && ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install it first."
    echo "   Quick install: sudo apt-get install -y docker-compose-plugin"
    exit 1
fi

# ── Data directories ──────────────────────────────────────────────────────────
echo "📁 Creating data directories..."
mkdir -p data/wordpress
mkdir -p data/mysql
# SuiteCRM uses named Docker volumes for writable dirs (upload, cache, custom,
# modules, config) — Docker manages ownership automatically. No bind-mount dirs needed.
mkdir -p data/mautic
mkdir -p data/matomo
mkdir -p data/vaultwarden

# ── Credential generation ─────────────────────────────────────────────────────
if [ ! -f .env ]; then
    echo "🔐 Generating secure credentials..."
    DB_PASSWORD=$(openssl rand -hex 24)
    DB_ROOT_PASSWORD=$(openssl rand -hex 24)
    VAULT_ADMIN_TOKEN=$(openssl rand -hex 32)

    cat > .env << EOF
# LaunchOps Stack — Auto-generated credentials
# WARNING: Keep this file secret. Never commit to version control.
DB_PASSWORD=${DB_PASSWORD}
DB_ROOT_PASSWORD=${DB_ROOT_PASSWORD}
VAULT_ADMIN_TOKEN=${VAULT_ADMIN_TOKEN}

# Optional: Add your API keys below
# OPENAI_API_KEY=
# STRIPE_SECRET_KEY=
# STRIPE_PUBLISHABLE_KEY=
# DOMAIN=yourdomain.com
EOF
    echo "✅ Credentials saved to .env file."
else
    echo "ℹ️  Existing .env file found — skipping credential generation."
fi

# ── Deploy ────────────────────────────────────────────────────────────────────
echo "🐳 Starting Docker Compose stack..."
if docker compose version &> /dev/null; then
    docker compose up -d
else
    docker-compose up -d
fi

# ── Copy healthcheck to system path for convenience ───────────────────────────
if [ -f "$(dirname "$0")/healthcheck.sh" ]; then
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
    # Make available both locally and at /usr/local/bin for system-wide use
    chmod +x "${SCRIPT_DIR}/healthcheck.sh"
    if [ -w /usr/local/bin ]; then
        cp "${SCRIPT_DIR}/healthcheck.sh" /usr/local/bin/launchops-health
        chmod +x /usr/local/bin/launchops-health
    fi
fi

echo ""
echo "✅ Deployment Complete! The stack is now spinning up."
echo "   Services may take 30–90 seconds to become fully ready."
echo ""
echo "🌐 Service Endpoints:"
echo "  - WordPress  (Site/Course):  http://localhost:8080"
echo "  - SuiteCRM   (Pipeline/CRM): http://localhost:8081  ← Setup wizard on first visit"
echo "  - Mautic     (Email):        http://localhost:8082"
echo "  - Matomo     (Analytics):    http://localhost:8083"
echo "  - Vaultwarden (Secrets):     http://localhost:8000"
echo ""
echo "⚠️  SuiteCRM First-Run Setup:"
echo "   Navigate to http://localhost:8081 and complete the setup wizard."
echo "   Use DB Host: db | DB Name: suitecrm | DB User: wpuser"
echo "   DB Password: (see DB_PASSWORD in .env)"
echo ""
echo "📋 Next Step: Run ./healthcheck.sh to verify all services are live."
echo "              Then open docs/checklist.md to complete configuration."
