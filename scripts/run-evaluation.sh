#!/usr/bin/env bash
# run-evaluation.sh — launch proxy app + run evaluation suite
#
# Usage:
#   bash run-evaluation.sh --app hiddify --proxy-port 1080 --suite latency
#   bash run-evaluation.sh --proxy socks5://127.0.0.1:1080 --suite comprehensive
#   bash run-evaluation.sh --app flclash --suite stability --duration 300000
#
# If --app is provided, this script launches the Flutter app in debug mode,
# waits for the proxy to be ready, runs the evaluation, then cleans up.
# If only --proxy is provided, it assumes the proxy is already running.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRAMEWORK_DIR="${SCRIPT_DIR}/proxy-testing-framework"
CLI="${FRAMEWORK_DIR}/evaluator/cli.js"

APP=""
PROXY=""
SUITE="latency"
OUTPUT_DIR="./results"
DURATION=""
PUPPETEER=false

# --- Parse args ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    --app) APP="$2"; shift 2 ;;
    --proxy|-p) PROXY="$2"; shift 2 ;;
    --proxy-port) PROXY_PORT="$2"; shift 2 ;;
    --suite|-s) SUITE="$2"; shift 2 ;;
    --output|-o) OUTPUT_DIR="$2"; shift 2 ;;
    --duration|-d) DURATION="$2"; shift 2 ;;
    --puppeteer) PUPPETEER=true; shift ;;
    --help|-h)
      echo "Usage: run-evaluation.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --app <hiddify|flclash>   App to launch (optional, for full automation)"
      echo "  --proxy, -p <url>          Proxy URL (required if --app not set)"
      echo "  --proxy-port <port>        SOCKS5 port exposed by app (default depends on app)"
      echo "  --suite, -s <name>         Test suite (default: latency)"
      echo "  --output, -o <dir>         Output directory (default: ./results)"
      echo "  --duration, -d <ms>        Override test duration"
      echo "  --puppeteer                Enable Puppeteer tests (requires DISPLAY)"
      echo "  --help, -h                 Show this help"
      echo ""
      echo "Available suites: latency, stability, throughput, comprehensive"
      echo ""
      echo "Examples:"
      echo "  bash run-evaluation.sh --app hiddify --suite latency"
      echo "  bash run-evaluation.sh --proxy socks5://127.0.0.1:1080 --suite comprehensive --puppeteer"
      exit 0 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# --- Resolve proxy URL ---
if [[ -z "$PROXY" ]]; then
  if [[ -z "$APP" ]]; then
    echo "ERROR: --proxy or --app is required"
    exit 1
  fi
  # Default proxy ports per app
  case "$APP" in
    hiddify) PROXY_PORT="${PROXY_PORT:-1080}" ;;
    flclash) PROXY_PORT="${PROXY_PORT:-7890}" ;;
    *) echo "ERROR: Unknown app: $APP"; exit 1 ;;
  esac
  PROXY="socks5://127.0.0.1:${PROXY_PORT}"
fi

# --- Build CLI args ---
CLI_ARGS=(
  --proxy "$PROXY"
  --suite "$SUITE"
  --output "$OUTPUT_DIR"
)
if [[ -n "$DURATION" ]]; then
  CLI_ARGS+=(--duration "$DURATION")
fi
if [[ "$PUPPETEER" == "true" ]]; then
  CLI_ARGS+=(--puppeteer)
fi

# --- Pre-flight checks ---
if ! command -v node &>/dev/null; then
  echo "ERROR: Node.js required. Install from https://nodejs.org"
  exit 1
fi

if [[ ! -f "$CLI" ]]; then
  echo "ERROR: CLI not found: $CLI"
  exit 1
fi

echo "=== Proxy Evaluation ==="
echo "Proxy:    $PROXY"
echo "Suite:    $SUITE"
echo "Output:   $OUTPUT_DIR"
echo ""

# Install deps if needed
if [[ ! -d "${FRAMEWORK_DIR}/node_modules" ]]; then
  echo "[Setup] Installing Node.js dependencies..."
  (cd "$FRAMEWORK_DIR" && npm install --no-fund --no-audit 2>&1) || {
    echo "WARNING: npm install failed. Continuing with available modules."
  }
fi

# Run evaluation
echo "[Run] Starting evaluation..."
exec node "$CLI" "${CLI_ARGS[@]}"
