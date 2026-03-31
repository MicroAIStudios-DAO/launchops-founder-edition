#!/bin/bash
# LaunchOps Stack Health Check
# Verifies all services are responding after deployment.

set -e

echo "🔍 LaunchOps Stack Health Check"
echo "================================"

PASS=0
FAIL=0

check_service() {
    local name="$1"
    local url="$2"
    local expected_code="${3:-200}"

    status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null || echo "000")

    if [ "$status" -ge 200 ] && [ "$status" -lt 400 ]; then
        echo "  ✅ $name ($url) — HTTP $status"
        PASS=$((PASS + 1))
    else
        echo "  ❌ $name ($url) — HTTP $status (expected 2xx/3xx)"
        FAIL=$((FAIL + 1))
    fi
}

echo ""
echo "Checking services..."
check_service "WordPress"   "http://localhost:8080"
check_service "SuiteCRM"    "http://localhost:8081"
check_service "Mautic"      "http://localhost:8082"
check_service "Matomo"      "http://localhost:8083"
check_service "Vaultwarden" "http://localhost:8000"

echo ""
echo "================================"
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
    echo ""
    echo "⚠️  Some services are not responding."
    echo "   Run 'docker ps' to check container status."
    echo "   Run 'docker logs <container_name>' for details."
    exit 1
else
    echo ""
    echo "🎉 All services are healthy!"
    exit 0
fi
