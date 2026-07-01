#!/usr/bin/env bash
# =============================================================================
# LaunchOps — Full Stack Health Check
# scripts/health-check.sh
#
# Verifies every service in the LaunchOps stack is running and responding.
# Exits 0 if all critical services pass, 1 if any critical service fails.
#
# USAGE:
#   bash scripts/health-check.sh           # Full check with output
#   bash scripts/health-check.sh --quiet   # Exit code only (for CI/CD)
#   bash scripts/health-check.sh --json    # JSON output
# =============================================================================

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

QUIET=false
JSON_MODE=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --quiet) QUIET=true ;;
    --json)  JSON_MODE=true ;;
    *) ;;
  esac
  shift
done

PASS=0; FAIL=0; WARN=0
declare -A RESULTS

check() {
  local name="$1" url="$2" critical="${3:-true}" expected="${4:-200}"
  local status
  status=$(curl -sf -o /dev/null -w "%{http_code}" --max-time 5 "$url" 2>/dev/null || echo "000")

  if [[ "$status" == "$expected" ]] || [[ "$status" =~ ^[23] ]]; then
    PASS=$((PASS + 1))
    RESULTS["$name"]="PASS:$status"
    [[ "$QUIET" == "false" && "$JSON_MODE" == "false" ]] && \
      echo -e "  ${GREEN}[✓]${NC} ${BOLD}$name${NC} — HTTP $status"
  elif [[ "$critical" == "false" ]]; then
    WARN=$((WARN + 1))
    RESULTS["$name"]="WARN:$status"
    [[ "$QUIET" == "false" && "$JSON_MODE" == "false" ]] && \
      echo -e "  ${YELLOW}[!]${NC} ${BOLD}$name${NC} — HTTP $status (non-critical)"
  else
    FAIL=$((FAIL + 1))
    RESULTS["$name"]="FAIL:$status"
    [[ "$QUIET" == "false" && "$JSON_MODE" == "false" ]] && \
      echo -e "  ${RED}[✗]${NC} ${BOLD}$name${NC} — HTTP $status (CRITICAL)"
  fi
}

check_docker() {
  local name="$1" container="$2" critical="${3:-true}"
  local running
  running=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -c "^${container}$" || echo "0")

  if [[ "$running" -gt 0 ]]; then
    PASS=$((PASS + 1))
    RESULTS["$name"]="PASS:running"
    [[ "$QUIET" == "false" && "$JSON_MODE" == "false" ]] && \
      echo -e "  ${GREEN}[✓]${NC} ${BOLD}$name${NC} — container running"
  elif [[ "$critical" == "false" ]]; then
    WARN=$((WARN + 1))
    RESULTS["$name"]="WARN:stopped"
    [[ "$QUIET" == "false" && "$JSON_MODE" == "false" ]] && \
      echo -e "  ${YELLOW}[!]${NC} ${BOLD}$name${NC} — container stopped (non-critical)"
  else
    FAIL=$((FAIL + 1))
    RESULTS["$name"]="FAIL:stopped"
    [[ "$QUIET" == "false" && "$JSON_MODE" == "false" ]] && \
      echo -e "  ${RED}[✗]${NC} ${BOLD}$name${NC} — container stopped (CRITICAL)"
  fi
}

check_pm2() {
  local name="$1" process="$2" critical="${3:-false}"
  local status
  status=$(pm2 jlist 2>/dev/null | python3 -c "
import sys, json
try:
  procs = json.load(sys.stdin)
  match = [p for p in procs if p.get('name','').startswith('$process')]
  online = [p for p in match if p.get('pm2_env',{}).get('status') == 'online']
  print(f'{len(online)}/{len(match)}')
except: print('0/0')
" 2>/dev/null || echo "0/0")

  local online="${status%%/*}"
  local total="${status##*/}"

  if [[ "$total" -gt 0 && "$online" -gt 0 ]]; then
    PASS=$((PASS + 1))
    RESULTS["$name"]="PASS:${online}/${total} online"
    [[ "$QUIET" == "false" && "$JSON_MODE" == "false" ]] && \
      echo -e "  ${GREEN}[✓]${NC} ${BOLD}$name${NC} — ${online}/${total} agents online"
  elif [[ "$total" -eq 0 ]]; then
    WARN=$((WARN + 1))
    RESULTS["$name"]="WARN:not deployed"
    [[ "$QUIET" == "false" && "$JSON_MODE" == "false" ]] && \
      echo -e "  ${YELLOW}[!]${NC} ${BOLD}$name${NC} — not deployed yet"
  else
    FAIL=$((FAIL + 1))
    RESULTS["$name"]="FAIL:${online}/${total} online"
    [[ "$QUIET" == "false" && "$JSON_MODE" == "false" ]] && \
      echo -e "  ${RED}[✗]${NC} ${BOLD}$name${NC} — ${online}/${total} agents online"
  fi
}

# ── Header ────────────────────────────────────────────────────────────────────
if [[ "$QUIET" == "false" && "$JSON_MODE" == "false" ]]; then
  echo -e "\n${BOLD}${CYAN}── LaunchOps Full Stack Health Check ──${NC}"
  echo -e "  $(date -u +"%Y-%m-%dT%H:%M:%SZ")\n"

  echo -e "${BOLD}  Control Tower${NC}"
fi
check "Control Tower API"    "http://localhost:8090/api/health"   true
check "Control Tower UI"     "http://localhost:8090"              true

if [[ "$QUIET" == "false" && "$JSON_MODE" == "false" ]]; then
  echo -e "\n${BOLD}  Infrastructure Services${NC}"
fi
check_docker "MariaDB"       "launchops_db"                       true
check_docker "WordPress"     "launchops_wordpress"                true
check_docker "SuiteCRM"      "launchops_suitecrm"                 true
check_docker "Mautic"        "launchops_mautic"                   true
check_docker "Matomo"        "launchops_matomo"                   true
check_docker "Vaultwarden"   "launchops_vaultwarden"              false
check_docker "ProofGuard"    "launchops_proofguard"               false

if [[ "$QUIET" == "false" && "$JSON_MODE" == "false" ]]; then
  echo -e "\n${BOLD}  HTTP Endpoints${NC}"
fi
check "WordPress"            "http://localhost:8080"              true
check "SuiteCRM"             "http://localhost:8081"              true
check "Mautic"               "http://localhost:8082"              true
check "Matomo"               "http://localhost:8083"              false
check "Vaultwarden"          "http://localhost:8000"              false
check "ProofGuard API"       "http://localhost:3001/api/v1/health" false

if [[ "$QUIET" == "false" && "$JSON_MODE" == "false" ]]; then
  echo -e "\n${BOLD}  Agent Fleet (PM2)${NC}"
fi
if command -v pm2 &>/dev/null; then
  check_pm2 "Agent Fleet (all 23)" "agent-" false
else
  WARN=$((WARN + 1))
  RESULTS["Agent Fleet"]="WARN:PM2 not installed"
  [[ "$QUIET" == "false" && "$JSON_MODE" == "false" ]] && \
    echo -e "  ${YELLOW}[!]${NC} ${BOLD}Agent Fleet${NC} — PM2 not installed"
fi

if [[ "$QUIET" == "false" && "$JSON_MODE" == "false" ]]; then
  echo -e "\n${BOLD}  System Resources${NC}"
fi
# Disk
DISK_FREE=$(df -BG / 2>/dev/null | awk 'NR==2 {gsub("G",""); print $4}' || echo 0)
if [[ "$DISK_FREE" -ge 5 ]]; then
  PASS=$((PASS + 1))
  [[ "$QUIET" == "false" && "$JSON_MODE" == "false" ]] && \
    echo -e "  ${GREEN}[✓]${NC} ${BOLD}Disk Space${NC} — ${DISK_FREE}GB free"
else
  WARN=$((WARN + 1))
  [[ "$QUIET" == "false" && "$JSON_MODE" == "false" ]] && \
    echo -e "  ${YELLOW}[!]${NC} ${BOLD}Disk Space${NC} — ${DISK_FREE}GB free (low)"
fi

# RAM
RAM_FREE=$(free -m 2>/dev/null | awk '/^Mem:/ {print $7}' || echo 0)
if [[ "$RAM_FREE" -ge 256 ]]; then
  PASS=$((PASS + 1))
  [[ "$QUIET" == "false" && "$JSON_MODE" == "false" ]] && \
    echo -e "  ${GREEN}[✓]${NC} ${BOLD}Memory${NC} — ${RAM_FREE}MB available"
else
  WARN=$((WARN + 1))
  [[ "$QUIET" == "false" && "$JSON_MODE" == "false" ]] && \
    echo -e "  ${YELLOW}[!]${NC} ${BOLD}Memory${NC} — ${RAM_FREE}MB available (low)"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
TOTAL=$((PASS + FAIL + WARN))

if [[ "$JSON_MODE" == "true" ]]; then
  echo "{"
  echo "  \"timestamp\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\","
  echo "  \"summary\": { \"pass\": $PASS, \"fail\": $FAIL, \"warn\": $WARN, \"total\": $TOTAL },"
  echo "  \"services\": {"
  FIRST=true
  for key in "${!RESULTS[@]}"; do
    [[ "$FIRST" == "false" ]] && echo ","
    printf '    "%s": "%s"' "$key" "${RESULTS[$key]}"
    FIRST=false
  done
  echo ""
  echo "  }"
  echo "}"
elif [[ "$QUIET" == "false" ]]; then
  echo ""
  echo -e "${BOLD}  Summary${NC}"
  echo -e "  ─────────────────────────────────"
  echo -e "  ${GREEN}Passed:${NC}  $PASS"
  [[ $WARN -gt 0 ]] && echo -e "  ${YELLOW}Warnings:${NC} $WARN"
  [[ $FAIL -gt 0 ]] && echo -e "  ${RED}Failed:${NC}  $FAIL"
  echo -e "  Total:   $TOTAL"
  echo ""

  if [[ $FAIL -eq 0 ]]; then
    echo -e "  ${GREEN}${BOLD}All critical services are healthy.${NC}"
  else
    echo -e "  ${RED}${BOLD}$FAIL critical service(s) are down.${NC}"
    echo -e "  ${YELLOW}Run: docker compose ps && docker compose logs --tail 20${NC}"
  fi
  echo ""
fi

[[ $FAIL -eq 0 ]] && exit 0 || exit 1
