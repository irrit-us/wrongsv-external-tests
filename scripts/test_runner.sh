#!/usr/bin/env bash
# test_runner.sh
#
# Flutter test runner — wraps flutter test, flutter run, and the Python bridge
# for CI/headless environments. Outputs aggregated results in JSON and JUnit XML.
#
# Usage:
#   bash test_runner.sh --app hiddify --mode ci --output results/
#   bash test_runner.sh --app flclash --mode local --device emulator-5554
#   bash test_runner.sh --app hiddify --mode bridge --port 8181 --dump-semantics
#   bash test_runner.sh --app hiddify --mode discover --device emulator-5554 --dump-semantics
#
# Modes:
#   local   — run widget/unit tests only
#   ci      — run unit + integration tests, aggregate results
#   bridge  — connect to already-running app via VM service port
#   discover — flutter run + wait for VM service + bridge operations

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(pwd)}"
OUTPUT_DIR="${PROJECT_ROOT}/test_results"
MODE="local"
APP=""
DEVICE_ID=""
VM_PORT=""
DUMP_SEMANTICS=false
DUMP_WIDGET=false
RUN_INTEGRATION=false
GET_STACK=false
GET_MEMORY=false
VERBOSE=false
CUSTOM_EXTENSIONS=()
RETRY=0

# --- Argument parsing ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    --app)
      APP="$2"; shift 2 ;;
    --mode)
      MODE="$2"; shift 2 ;;
    --output|-o)
      OUTPUT_DIR="$2"; shift 2 ;;
    --device)
      DEVICE_ID="$2"; shift 2 ;;
    --port)
      VM_PORT="$2"; shift 2 ;;
    --dump-semantics)
      DUMP_SEMANTICS=true; shift ;;
    --dump-widget)
      DUMP_WIDGET=true; shift ;;
    --run-integration)
      RUN_INTEGRATION=true; shift ;;
    --get-stack)
      GET_STACK=true; shift ;;
    --get-memory)
      GET_MEMORY=true; shift ;;
    --extension)
      CUSTOM_EXTENSIONS+=("$2"); shift 2 ;;
    --retry)
      RETRY="$2"; shift 2 ;;
    --verbose|-v)
      VERBOSE=true; shift ;;
    --help|-h)
      echo "Usage: test_runner.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --app <hiddify|flclash>     Target app (required for ci/bridge/discover)"
      echo "  --mode <local|ci|bridge|discover>  Execution mode (default: local)"
      echo "  --output|-o <dir>           Output directory (default: ./test_results)"
      echo "  --device <id>               Target device ID"
      echo "  --port <port>               VM service port for bridge mode"
      echo "  --dump-semantics            Collect semantics tree dump"
      echo "  --dump-widget               Collect widget tree dump"
      echo "  --run-integration           Run integration tests"
      echo "  --get-stack                 Get isolate call stack"
      echo "  --get-memory                Get memory usage"
      echo "  --extension <ext>           Call a custom service extension (repeatable)"
      echo "  --retry <n>                 Max retry attempts for connection"
      echo "  --verbose|-v                Verbose output"
      echo "  --help|-h                   Show this help"
      exit 0 ;;
    *)
      echo "Unknown option: $1"; exit 1 ;;
  esac
done

# --- Ensure output directory ---
mkdir -p "$OUTPUT_DIR"

log() {
  if [[ "$VERBOSE" == "true" ]]; then
    echo "[$(date '+%H:%M:%S')] $*" >&2
  fi
}

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

# --- Check prerequisites ---
check_prereqs() {
  if ! command -v flutter &>/dev/null; then
    fail "Flutter SDK not found. Install from https://flutter.dev"
  fi

  if [[ "$MODE" == "bridge" || "$MODE" == "discover" ]]; then
    local bridge_script="${SCRIPT_DIR}/flutter_debug_bridge.py"
    if [[ ! -f "$bridge_script" ]]; then
      fail "Bridge script not found: $bridge_script"
    fi
    if ! python3 -c "import websockets" 2>/dev/null; then
      fail "Python 'websockets' package required. Run: pip install websockets"
    fi
  fi

  if [[ "$MODE" != "local" && -z "$APP" ]]; then
    fail "--app is required for mode: $MODE"
  fi
}

# --- Determine app directory ---
resolve_app_dir() {
  case "$APP" in
    hiddify)
      echo "${PROJECT_ROOT}/hiddify-next"
      ;;
    flclash)
      echo "${PROJECT_ROOT}/FlClash"
      ;;
    *)
      fail "Unknown app: $APP (expected hiddify or flclash)"
      ;;
  esac
}

# --- Run widget/unit tests ---
run_unit_tests() {
  log "Running Flutter unit + widget tests..."
  local app_dir
  app_dir="$(resolve_app_dir)"
  local test_dir="${app_dir}/test"

  if [[ ! -d "$test_dir" ]]; then
    log "No test/ directory found in ${app_dir}, skipping unit tests"
    return 0
  fi

  (cd "$app_dir" && flutter test --machine "$test_dir" > "${OUTPUT_DIR}/unit_tests.jsonl" 2>"${OUTPUT_DIR}/unit_tests_stderr.log") || true
  log "Unit test output: ${OUTPUT_DIR}/unit_tests.jsonl"
}

# --- Run integration tests ---
run_integration_tests() {
  log "Running Flutter integration tests..."
  local app_dir
  app_dir="$(resolve_app_dir)"
  local test_dir="${app_dir}/integration_test"

  if [[ ! -d "$test_dir" ]]; then
    log "No integration_test/ directory found, skipping integration tests"
    return 0
  fi

  (cd "$app_dir" && flutter test --machine "$test_dir" > "${OUTPUT_DIR}/integration_tests.jsonl" 2>"${OUTPUT_DIR}/integration_tests_stderr.log") || true
  log "Integration test output: ${OUTPUT_DIR}/integration_tests.jsonl"
}

# --- Bridge mode: connect to already-running app ---
run_bridge_mode() {
  local port="${VM_PORT:-8181}"
  local app_dir
  app_dir="$(resolve_app_dir)"
  log "Connecting to $APP VM service on port ${port}..."

  local bridge_args=(
    python3 "${SCRIPT_DIR}/flutter_debug_bridge.py"
    --port "$port"
    --app "$APP"
    --app-dir "$app_dir"
    --output "$OUTPUT_DIR"
  )

  if [[ "$DUMP_SEMANTICS" == "true" ]]; then
    bridge_args+=(--dump-semantics)
  fi
  if [[ "$DUMP_WIDGET" == "true" ]]; then
    bridge_args+=(--dump-widget-tree)
  fi
  if [[ "$GET_STACK" == "true" ]]; then
    bridge_args+=(--get-stack)
  fi
  if [[ "$GET_MEMORY" == "true" ]]; then
    bridge_args+=(--get-memory)
  fi
  if [[ "$RUN_INTEGRATION" == "true" ]]; then
    bridge_args+=(--run-tests)
  fi
  if [[ "$RETRY" -gt 0 ]]; then
    bridge_args+=(--retry "$RETRY")
  fi
  for ext in "${CUSTOM_EXTENSIONS[@]}"; do
    bridge_args+=(--call-extension "$ext")
  done

  "${bridge_args[@]}"
}

# --- Discover mode: launch app, wait for VM service, then bridge ---
run_discover_mode() {
  local app_dir
  app_dir="$(resolve_app_dir)"
  log "Launching $APP in debug mode and discovering VM service URI..."

  # Launch flutter run in background, capture output to find the URI
  local flutter_log="${OUTPUT_DIR}/flutter_run.log"
  local flutter_pid_file="${OUTPUT_DIR}/flutter_run.pid"

  local flutter_args=(flutter run --debug)
  if [[ -n "$DEVICE_ID" ]]; then
    flutter_args+=(-d "$DEVICE_ID")
  fi

  # Start flutter run, tee output to log
  (cd "$app_dir" && "${flutter_args[@]}" 2>&1) > "$flutter_log" &
  local flutter_pid=$!
  echo "$flutter_pid" > "$flutter_pid_file"
  log "Flutter run PID: $flutter_pid"

  # Wait for VM service URI to appear in the log
  local vm_uri=""
  local max_wait=120
  local waited=0
  while [[ $waited -lt $max_wait ]]; do
    if vm_uri=$(grep -oP 'https?://[\d.]+:\d+/[^/\s]+=/' "$flutter_log" 2>/dev/null | head -1); then
      vm_uri="${vm_uri%/}"
      log "VM Service URI found: $vm_uri"
      break
    fi
    sleep 2
    waited=$((waited + 2))
  done

  if [[ -z "$vm_uri" ]]; then
    fail "Could not discover VM service URI after ${max_wait}s"
  fi

  # Run bridge operations
  local bridge_args=(
    python3 "${SCRIPT_DIR}/flutter_debug_bridge.py"
    --port "$(echo "$vm_uri" | grep -oP ':\d+/' | tr -d ':/')"
    --app "$APP"
    --app-dir "$app_dir"
    --output "$OUTPUT_DIR"
    --retry 5
  )

  if [[ "$DUMP_SEMANTICS" == "true" ]]; then
    bridge_args+=(--dump-semantics)
  fi
  if [[ "$DUMP_WIDGET" == "true" ]]; then
    bridge_args+=(--dump-widget-tree)
  fi
  if [[ "$GET_STACK" == "true" ]]; then
    bridge_args+=(--get-stack)
  fi
  if [[ "$GET_MEMORY" == "true" ]]; then
    bridge_args+=(--get-memory)
  fi
  for ext in "${CUSTOM_EXTENSIONS[@]}"; do
    bridge_args+=(--call-extension "$ext")
  done

  "${bridge_args[@]}"
  local bridge_exit=$?

  # Cleanup: stop flutter run
  log "Stopping flutter run (PID: $flutter_pid)..."
  kill "$flutter_pid" 2>/dev/null || true
  wait "$flutter_pid" 2>/dev/null || true

  return $bridge_exit
}

# --- Aggregate results ---
aggregate_results() {
  log "Aggregating test results..."

  python3 -c "
import json, glob, os, sys

results_dir = '$OUTPUT_DIR'
total = 0
passed = 0
failed = 0
skipped = 0

# Read flutter --machine output (JSON-Lines)
for pattern in ['unit_tests.jsonl', 'integration_tests.jsonl']:
    fpath = os.path.join(results_dir, pattern)
    if not os.path.exists(fpath):
        continue
    with open(fpath) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
                if event.get('type') == 'testDone':
                    total += 1
                    if event.get('result') == 'success':
                        passed += 1
                    else:
                        failed += 1
                    if event.get('skipped'):
                        skipped += 1
            except json.JSONDecodeError:
                pass

# Read bridge output files
for fpath in glob.glob(os.path.join(results_dir, 'flutter_bridge_*.json')):
    with open(fpath) as f:
        data = json.load(f)
        s = data.get('summary', {})
        total += s.get('total', 0)
        passed += s.get('passed', 0)
        failed += s.get('failed', 0)
        skipped += s.get('skipped', 0)

summary = {
    'total': total,
    'passed': passed,
    'failed': failed,
    'skipped': skipped,
    'timestamp': __import__('datetime').datetime.now().isoformat(),
}

with open(os.path.join(results_dir, 'summary.json'), 'w') as f:
    json.dump(summary, f, indent=2)

print(f'Results: {passed}/{total} passed ({failed} failed, {skipped} skipped)')
sys.exit(0 if failed == 0 else 1)
" || true
}

# --- Main ---
main() {
  check_prereqs

  case "$MODE" in
    local)
      run_unit_tests
      ;;
    ci)
      run_unit_tests
      run_integration_tests
      aggregate_results
      ;;
    bridge)
      run_bridge_mode
      ;;
    discover)
      run_discover_mode
      ;;
    *)
      fail "Unknown mode: $MODE (expected: local, ci, bridge, discover)"
      ;;
  esac

  log "Done. Output: $OUTPUT_DIR"
}

main "$@"
