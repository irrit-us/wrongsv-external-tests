#!/usr/bin/env bash
# =============================================================================
# start-proxy-app.sh — Launch a proxy app (FlClash/Hiddify) with a config file,
# wait for the proxy to become ready, then hand off control.
#
# This is the minimal-modification runtime approach:
#   - App binaries are pre-built (profile mode, VM service enabled)
#   - Config is placed in the app's expected data directory (simulates UI import)
#   - VM service extensions (ext.<app>.*) enable runtime inspection via bridge
#   - Script polls the proxy port until ready, then reports the port + VM URI
#
# Usage:
#   ./scripts/start-proxy-app.sh --app flclash --config ./config.yaml
#   ./scripts/start-proxy-app.sh --app hiddify --config ./sing-box.json
#
# Options:
#   --app <name>       App to launch: flclash, hiddify (default: flclash)
#   --config <path>    Proxy config file (required)
#   --proxy-port <n>   Override auto-detected proxy port
#   --vm-port <n>      VM service port to use (default: auto)
#   --no-headless      Show the app window (default: headless via Xvfb if available)
#   --timeout <s>      Max wait for proxy readiness (default: 30)
#   --data-dir <path>  Override app data directory
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BINARIES_DIR="$REPO_ROOT/binaries"

APP="${APP:-flclash}"
CONFIG_FILE=""
PROXY_PORT=""
VM_PORT=""
HEADLESS="${HEADLESS:-1}"
TIMEOUT="${TIMEOUT:-30}"
DATA_DIR=""

# ---- Parse args ----
while [[ $# -gt 0 ]]; do
  case "$1" in
    --app)       APP="$2"; shift 2 ;;
    --config)    CONFIG_FILE="$2"; shift 2 ;;
    --proxy-port) PROXY_PORT="$2"; shift 2 ;;
    --vm-port)   VM_PORT="$2"; shift 2 ;;
    --no-headless) HEADLESS=0; shift ;;
    --timeout)   TIMEOUT="$2"; shift 2 ;;
    --data-dir)  DATA_DIR="$2"; shift 2 ;;
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

# ---- App-specific setup ----
case "$APP" in
  flclash)
    APP_BIN="$BINARIES_DIR/flclash/FlClash"
    CORE_BIN="$BINARIES_DIR/flclash/FlClashCore"
    APP_LIB_DIR="$BINARIES_DIR/flclash/lib"
    APP_DATA_DIR_BASE="$BINARIES_DIR/flclash/data"
    if [[ -z "$DATA_DIR" ]]; then
      # path_provider on Linux uses the executable basename as the app name,
      # so "FlClash" -> $HOME/.local/share/FlClash/
      DATA_DIR="$HOME/.local/share/FlClash"
    fi
    CONFIG_DEST="$DATA_DIR/config.yaml"
    DEFAULT_PROXY_PORT=7890   # Clash default mixed-port
    APP_ID="com.follow.clash"
    ;;
  hiddify)
    APP_BIN="$BINARIES_DIR/hiddify/hiddify"
    CORE_BIN="$BINARIES_DIR/hiddify/HiddifyCli"
    APP_LIB_DIR="$BINARIES_DIR/hiddify/lib"
    APP_DATA_DIR_BASE="$BINARIES_DIR/hiddify/data"
    if [[ -z "$DATA_DIR" ]]; then
      DATA_DIR="$HOME/.local/share/hiddify"
    fi
    # Hiddify config is a sing-box JSON, not YAML
    CONFIG_DEST="$DATA_DIR/config.json"
    DEFAULT_PROXY_PORT=2334   # Default inbound mixed port
    APP_ID="app.hiddify.com"
    ;;
  *)
    echo "ERROR: Unknown app '$APP'. Choose: flclash, hiddify"
    exit 1
    ;;
esac

# ---- Validate binaries ----
if [[ ! -f "$APP_BIN" ]]; then
  echo "ERROR: App binary not found: $APP_BIN"
  echo "Build it first or place the compiled binary there."
  exit 1
fi
if [[ ! -f "$CORE_BIN" ]]; then
  echo "WARNING: Core binary not found: $CORE_BIN"
  echo "The app may fail to start the proxy engine."
fi

# ---- Install config ----
echo "=== Installing config ==="
mkdir -p "$DATA_DIR"
case "$APP" in
  flclash)
    # FlClash reads config.yaml directly from its data directory
    cp "$CONFIG_FILE" "$CONFIG_DEST"
    echo "Config installed to: $CONFIG_DEST"
    ;;
  hiddify)
    # Hiddify requires a profile entry in its SQLite database.
    # Use the import script to pre-populate the DB.
    IMPORT_SCRIPT="$SCRIPT_DIR/import-hiddify-config.py"
    if [[ -f "$IMPORT_SCRIPT" ]]; then
      python3 "$IMPORT_SCRIPT" --config "$CONFIG_FILE" --data-dir "$DATA_DIR" --profile-name "Test Profile"
      echo "Config imported into Hiddify database"
    else
      echo "WARNING: import-hiddify-config.py not found at $IMPORT_SCRIPT"
      echo "Hiddify may not auto-load the config. Manual profile import needed."
      # Fallback: just copy the config so it's at least available
      cp "$CONFIG_FILE" "$CONFIG_DEST"
    fi
    ;;
esac

# ---- Determine proxy port ----
if [[ -z "$PROXY_PORT" ]]; then
  # Try to extract from YAML (Clash) or JSON (Hiddify)
  if command -v python3 &>/dev/null; then
    PROXY_PORT=$(python3 -c "
import sys, json
try:
    import yaml
except ImportError:
    yaml = None
with open('$CONFIG_FILE') as f:
    content = f.read()
# Try YAML first
if '$APP' == 'flclash':
    if yaml:
        cfg = yaml.safe_load(content)
    else:
        cfg = None
    port = cfg.get('mixed-port') or cfg.get('port') or cfg.get('socks-port') if cfg else None
    print(port or $DEFAULT_PROXY_PORT)
elif '$APP' == 'hiddify':
    cfg = json.loads(content)
    # Sing-box inbounds
    for inbound in cfg.get('inbounds', []):
        if 'listen_port' in inbound:
            print(inbound['listen_port'])
            sys.exit(0)
    print($DEFAULT_PROXY_PORT)
" 2>/dev/null)
  fi
fi
echo "Proxy port: $PROXY_PORT"

# ---- Launch app ----
echo "=== Launching $APP ==="

# Ensure LD_LIBRARY_PATH includes our bundled libs
export LD_LIBRARY_PATH="$APP_LIB_DIR:${LD_LIBRARY_PATH:-}"

# Kill any existing instance
pkill -f "$(basename "$APP_BIN")" 2>/dev/null || true
pkill -f "$(basename "$CORE_BIN")" 2>/dev/null || true
sleep 0.5

if [[ "$HEADLESS" == "1" ]] && command -v Xvfb &>/dev/null; then
  # Start virtual display for headless mode
  XVFB_DISPLAY=$(( (RANDOM % 100) + 99 ))
  Xvfb ":$XVFB_DISPLAY" -screen 0 1024x768x24 &
  XVFB_PID=$!
  export DISPLAY=":$XVFB_DISPLAY"
  echo "Headless mode: DISPLAY=$DISPLAY (Xvfb PID=$XVFB_PID)"
  trap "kill $XVFB_PID 2>/dev/null; pkill -f '$(basename "$APP_BIN")' 2>/dev/null; pkill -f '$(basename "$CORE_BIN")' 2>/dev/null" EXIT
else
  trap "pkill -f '$(basename "$APP_BIN")' 2>/dev/null; pkill -f '$(basename "$CORE_BIN")' 2>/dev/null" EXIT
fi

# The Flutter binary (FlClash) spawns FlClashCore internally.
# Run from the bundle dir so relative paths work.
BUNDLE_DIR="$(dirname "$APP_BIN")"
cd "$BUNDLE_DIR"

# Launch the app.  Flutter in profile mode enables the VM service on a random
# port by default.  We capture stdout/stderr to find the VM service URI.
APP_LOG="/tmp/${APP}_startup.log"
"./$APP_BIN" > "$APP_LOG" 2>&1 &
APP_PID=$!
echo "$APP started (PID=$APP_PID), log: $APP_LOG"

# ---- Wait for proxy readiness ----
echo "=== Waiting for proxy (port $PROXY_PORT) ==="
ELAPSED=0
INTERVAL=1
while [[ $ELAPSED -lt $TIMEOUT ]]; do
  if curl -s --max-time 2 --noproxy '*' "http://127.0.0.1:$PROXY_PORT" >/dev/null 2>&1; then
    echo "Proxy ready on 127.0.0.1:$PROXY_PORT (after ${ELAPSED}s)"
    break
  fi
  # Also check if the VM service is up
  if [[ -f "$APP_LOG" ]]; then
    VM_URI=$(grep -oP 'Observatory listening on \K.*' "$APP_LOG" 2>/dev/null ||
             grep -oP 'The Dart VM service is listening on \K.*' "$APP_LOG" 2>/dev/null || true)
    if [[ -n "$VM_URI" ]]; then
      echo "VM Service: $VM_URI"
      VM_PORT=$(echo "$VM_URI" | grep -oP ':\K\d+$' || true)
    fi
  fi
  sleep "$INTERVAL"
  ELAPSED=$((ELAPSED + INTERVAL))
done

if [[ $ELAPSED -ge $TIMEOUT ]]; then
  echo "WARNING: Proxy not ready after ${TIMEOUT}s"
  echo "App log:"
  cat "$APP_LOG"
fi

# ---- Emit status for downstream scripts ----
echo ""
echo "=== Status ==="
echo "APP=$APP"
echo "APP_PID=$APP_PID"
echo "PROXY_PORT=$PROXY_PORT"
echo "VM_SERVICE_URI=$VM_URI"
echo "CONFIG_DEST=$CONFIG_DEST"
echo "DATA_DIR=$DATA_DIR"
echo "APP_LOG=$APP_LOG"

# Write a status file for downstream consumption
STATUS_FILE="/tmp/${APP}_status.env"
cat > "$STATUS_FILE" <<EOF
APP=$APP
APP_PID=$APP_PID
PROXY_PORT=$PROXY_PORT
VM_SERVICE_URI=$VM_URI
CONFIG_DEST=$CONFIG_DEST
DATA_DIR=$DATA_DIR
APP_LOG=$APP_LOG
SOCKS5_PROXY=socks5://127.0.0.1:$PROXY_PORT
HTTP_PROXY=http://127.0.0.1:$PROXY_PORT
EOF
echo "Status file: $STATUS_FILE"

# If called with --daemon, keep running
if [[ "${1:-}" == "--daemon" ]]; then
  echo "Running in daemon mode. Press Ctrl+C to stop."
  wait "$APP_PID"
fi
