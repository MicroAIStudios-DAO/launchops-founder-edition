#!/bin/bash
# LaunchOps Stack - 1-Click Deploy Script
# Deploys a revenue-ready business in <2 hours.

set -e

echo "🚀 Initializing LaunchOps Stack Deployment..."

# Check dependencies
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install it first."
    exit 1
fi

# Setup directories
echo "📁 Creating data directories..."
mkdir -p data/{wordpress,mysql,suitecrm,mautic,matomo,vaultwarden}

# Generate secure passwords if not set
if [ ! -f .env ]; then
    echo "🔐 Generating secure credentials..."
    DB_PASSWORD=$(openssl rand -hex 24)
    DB_ROOT_PASSWORD=$(openssl rand -hex 24)
    VAULT_ADMIN_TOKEN=$(openssl rand -hex 32)
    
    cat > .env << EOF
DB_PASSWORD=${DB_PASSWORD}
DB_ROOT_PASSWORD=${DB_ROOT_PASSWORD}
VAULT_ADMIN_TOKEN=${VAULT_ADMIN_TOKEN}
EOF
    echo "✅ Credentials saved to .env file."
fi

# Deploy
echo "🐳 Starting Docker Compose stack..."
if docker compose version &> /dev/null; then
    docker compose up -d
else
    docker-compose up -d
fi

echo ""
echo "✅ Deployment Complete! The stack is now spinning up."
echo ""
echo "🌐 Service Endpoints:"
echo "  - WordPress (Site/Course): http://localhost:8080"
echo "  - SuiteCRM (Pipeline):     http://localhost:8081"
echo "  - Mautic (Email):          http://localhost:8082"
echo "  - Matomo (Analytics):      http://localhost:8083"
echo "  - Vaultwarden (Secrets):   http://localhost:8000"
echo ""
echo "📋 Next Step: Open checklist.md and verify endpoints."
