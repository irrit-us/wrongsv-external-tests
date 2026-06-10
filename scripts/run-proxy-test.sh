#!/usr/bin/env bash
# =============================================================================
# run-proxy-test.sh — Complete end-to-end proxy test with a single config file.
#
# This is the "no other preparing" script:
#   1. Takes a proxy config file
#   2. Launches the proxy app with that config
#   3. Waits for the proxy to become ready
#   4. Runs the proxy testing framework evaluation
#   5. Stops the app
#   6. Outputs results
#
# Usage:
#   ./scripts/run-proxy-test.sh --config ./my-clash-config.yaml
#   ./scripts/run-proxy-test.sh --config ./my-config.yaml --app flclash --suite comprehensive
#   ./scripts/run-proxy-test.sh --config ./my-config.json --app hiddify --duration 30s
#
# Options:
#   --config <path>      Proxy config file (required)
#   --app <name>         App to test: flclash, hiddify (default: flclash)
#   --suite <name>       Test suite to run (default: comprehensive)
#   --duration <ms|s>    Override test duration (e.g. 30s, 60000)
#   --output <dir>       Output directory (default: ./results/<app>-<timestamp>)
#   --no-headless        Show app window during test
#   --keep-running       Don't stop app after test
#   --verbose, -v        Verbose output
#   --proxy-port <n>     Known proxy port (skip auto-detect)
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
EVAL_DIR="$REPO_ROOT/evaluator"

CONFIG_FILE=""
APP="${APP:-flclash}"
SUITE="${SUITE:-comprehensive}"
DURATION=""
OUTPUT_DIR=""
HEADLESS=1
KEEP_RUNNING=0
VERBOSE=0
PROXY_PORT=""

# ---- Parse args ----
while [[ $# -gt 0 ]]; do
  case "$1" in
    --config)    CONFIG_FILE="$2"; shift 2 ;;
    --app)       APP="$2"; shift 2 ;;
    --suite)     SUITE="$2"; shift 2 ;;
    --duration)  DURATION="$2"; shift 2 ;;
    --output)    OUTPUT_DIR="$2"; shift 2 ;;
    --no-headless) HEADLESS=0; shift ;;
    --keep-running) KEEP_RUNNING=1; shift ;;
    --proxy-port) PROXY_PORT="$2"; shift 2 ;;
    -v|--verbose) VERBOSE=1; shift ;;
    -h|--help)
      sed -n '2,/^$/p' "$0" | tail -n +2
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ -z "$CONFIG_FILE" ]]; then
  echo "ERROR: --config is required"
  exit 1
fi
if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "ERROR: Config file not found: $CONFIG_FILE"
  exit 1
fi

CONFIG_FILE="$(realpath "$CONFIG_FILE")"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
if [[ -z "$OUTPUT_DIR" ]]; then
  OUTPUT_DIR="$REPO_ROOT/results/${APP}-${TIMESTAMP}"
fi
mkdir -p "$OUTPUT_DIR"

echo "╔══════════════════════════════════════════════════╗"
echo "║     Proxy Testing Framework — E2E Test Run       ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║ App:      $APP"
echo "║ Config:   $CONFIG_FILE"
echo "║ Suite:    $SUITE"
echo "║ Output:   $OUTPUT_DIR"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ---- Phase 1: Launch proxy app ----
echo "── Phase 1: Launch proxy app ──"

START_ARGS=(
  --app "$APP"
  --config "$CONFIG_FILE"
  --timeout 30
)
if [[ -n "$PROXY_PORT" ]]; then
  START_ARGS+=(--proxy-port "$PROXY_PORT")
fi
if [[ "$HEADLESS" == "0" ]]; then
  START_ARGS+=(--no-headless)
fi

bash "$SCRIPT_DIR/start-proxy-app.sh" "${START_ARGS[@]}" &
START_PID=$!

# Wait for the status file
STATUS_FILE="/tmp/${APP}_status.env"
WAITED=0
while [[ ! -f "$STATUS_FILE" ]] && [[ $WAITED -lt 35 ]]; do
  sleep 0.5
  WAITED=$((WAITED + 1))
done

if [[ ! -f "$STATUS_FILE" ]]; then
  echo "FATAL: App failed to start within timeout"
  kill "$START_PID" 2>/dev/null || true
  exit 1
fi

# Load status
source "$STATUS_FILE"
echo "  Proxy:       socks5://127.0.0.1:${PROXY_PORT}"
echo "  VM Service:  ${VM_SERVICE_URI:-not detected}"
echo "  Config:      $CONFIG_DEST"
echo ""

# ---- Phase 2: Run VM service self-test (optional, if bridge available) ----
echo "── Phase 2: App self-test (VM bridge) ──"
BRIDGE_SCRIPT="$SCRIPT_DIR/flutter_debug_bridge.py"
if [[ -n "${VM_SERVICE_URI:-}" ]] && [[ -f "$BRIDGE_SCRIPT" ]]; then
  python3 "$BRIDGE_SCRIPT" \
    --port "${VM_SERVICE_URI##*:}" \
    --call-extension "ext.${APP}.runSelfTest" \
    --timeout 10 2>&1 || echo "  (bridge self-test skipped — app may not be fully loaded)"
else
  echo "  (VM bridge not available — skipping self-test)"
fi
echo ""

# ---- Phase 3: Run evaluation ----
echo "── Phase 3: Proxy evaluation ──"

EVAL_ARGS=(
  --proxy "socks5://127.0.0.1:${PROXY_PORT}"
  --suite "$SUITE"
  --output "$OUTPUT_DIR"
)
if [[ -n "$DURATION" ]]; then
  EVAL_ARGS+=(--duration "$DURATION")
fi
if [[ "$VERBOSE" == "1" ]]; then
  EVAL_ARGS+=(--verbose)
fi

EVAL_EXIT=0
node "$EVAL_DIR/cli.js" "${EVAL_ARGS[@]}" 2>&1 | tee "$OUTPUT_DIR/run.log" || EVAL_EXIT=$?

echo ""

# ---- Phase 4: Stop app ----
if [[ "$KEEP_RUNNING" == "0" ]]; then
  echo "── Phase 4: Stopping app ──"
  kill "$START_PID" 2>/dev/null || true
  pkill -f "FlClash" 2>/dev/null || true
  pkill -f "FlClashCore" 2>/dev/null || true
  pkill -f "hiddify" 2>/dev/null || true
  pkill -f "HiddifyCli" 2>/dev/null || true
  pkill -f "Xvfb" 2>/dev/null || true
  echo "  App stopped"
else
  echo "── App left running (--keep-running) ──"
  echo "  Stop with: kill $APP_PID"
fi

# ---- Summary ----
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║                 Test Complete                     ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║ App:      $APP"
echo "║ Config:   $CONFIG_FILE"
echo "║ Suite:    $SUITE"
echo "║ Results:  $OUTPUT_DIR"
if [[ -f "$OUTPUT_DIR/report.json" ]]; then
  SCORE=$(python3 -c "import json; d=json.load(open('$OUTPUT_DIR/report.json')); print(d['scores']['overall'])" 2>/dev/null || echo "?")
  echo "║ Score:    $SCORE/100"
fi
echo "╚══════════════════════════════════════════════════╝"

exit $EVAL_EXIT
