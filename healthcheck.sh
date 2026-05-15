#!/bin/bash
# =============================================================================
#  LaunchOps Founder Edition — Stack Health Check
#  Verifies all services are responding after deployment.
#
#  USAGE:
#    ./healthcheck.sh              # Check all services
#    ./healthcheck.sh --quiet      # Exit 0/1 only (for CI/CD)
# =============================================================================

QUIET=false
[[ "${1:-}" == "--quiet" ]] && QUIET=true

PASS=0
FAIL=0
WARN=0

print_header() {
    [[ "$QUIET" == "false" ]] && echo "$@"
}

check_service() {
    local name="$1"
    local url="$2"
    local note="${3:-}"

    status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null || echo "000")

    if [ "$status" -ge 200 ] && [ "$status" -lt 400 ]; then
        print_header "  ✅ ${name} (${url}) — HTTP ${status}${note:+ | $note}"
        PASS=$((PASS + 1))
    elif [ "$status" = "000" ]; then
        print_header "  ❌ ${name} (${url}) — No response (container may still be starting)"
        FAIL=$((FAIL + 1))
    else
        print_header "  ⚠️  ${name} (${url}) — HTTP ${status}${note:+ | $note}"
        WARN=$((WARN + 1))
    fi
}

print_header "🔍 LaunchOps Stack Health Check"
print_header "================================"
print_header ""
print_header "Checking services..."

check_service "WordPress"   "http://localhost:8080"
check_service "SuiteCRM"    "http://localhost:8081" "First visit triggers setup wizard — this is expected"
check_service "Mautic"      "http://localhost:8082"
check_service "Matomo"      "http://localhost:8083"
check_service "Vaultwarden" "http://localhost:8000"

print_header ""
print_header "================================"
print_header "Results: ${PASS} passed, ${WARN} warnings, ${FAIL} failed"

if [ "$QUIET" == "true" ]; then
    [ "$FAIL" -gt 0 ] && exit 1 || exit 0
fi

if [ "$FAIL" -gt 0 ]; then
    echo ""
    echo "⚠️  Some services are not responding."
    echo "   Check container status:  docker compose ps"
    echo "   View service logs:       docker compose logs <service>"
    echo "   Common services: wordpress | suitecrm | mautic | matomo | vaultwarden | db"
    exit 1
elif [ "$WARN" -gt 0 ]; then
    echo ""
    echo "ℹ️  Some services returned non-2xx codes (may be redirect or setup wizard)."
    echo "   This is often normal on first boot. Check the URLs in your browser."
    exit 0
else
    echo ""
    echo "🎉 All services are healthy!"
    exit 0
fi
