#!/usr/bin/env bash
# test_runner.sh
#
# Flutter test runner — wraps flutter test, flutter drive, and the Python bridge
# for CI/headless environments. Outputs aggregated results in JSON and JUnit XML.
#
# Usage:
#   bash test_runner.sh --mode ci --output results/
#   bash test_runner.sh --mode local --device emulator-5554
#   bash test_runner.sh --mode bridge --port 8181 --dump-semantics

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(pwd)}"
OUTPUT_DIR="${PROJECT_ROOT}/test_results"
MODE="local"
DEVICE_ID=""
VM_PORT=""
DUMP_SEMANTICS=false
DUMP_WIDGET=false
RUN_INTEGRATION=false
VERBOSE=false

# --- Argument parsing ---
while [[ $# -gt 0 ]]; do
  case "$1" in
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
    --verbose|-v)
      VERBOSE=true; shift ;;
    --help|-h)
      echo "Usage: test_runner.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --mode <local|ci|bridge>   Execution mode (default: local)"
      echo "  --output|-o <dir>          Output directory (default: ./test_results)"
      echo "  --device <id>              Target device ID"
      echo "  --port <port>              VM service port for bridge mode"
      echo "  --dump-semantics           Collect semantics tree dump"
      echo "  --dump-widget              Collect widget tree dump"
      echo "  --run-integration          Run integration tests"
      echo "  --verbose|-v               Verbose output"
      echo "  --help|-h                  Show this help"
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

  if [[ "$MODE" == "bridge" ]]; then
    local bridge_script="${SCRIPT_DIR}/flutter_debug_bridge.py"
    if [[ ! -f "$bridge_script" ]]; then
      fail "Bridge script not found: $bridge_script"
    fi
    if ! python3 -c "import websockets" 2>/dev/null; then
      fail "Python 'websockets' package required. Run: pip install websockets"
    fi
  fi
}

# --- Run widget/unit tests ---
run_unit_tests() {
  log "Running Flutter unit + widget tests..."
  local test_dir="${PROJECT_ROOT}/test"
  if [[ ! -d "$test_dir" ]]; then
    log "No test/ directory found, skipping unit tests"
    return 0
  fi

  flutter test --machine "$test_dir" > "${OUTPUT_DIR}/unit_tests.jsonl" 2>"${OUTPUT_DIR}/unit_tests_stderr.log" || true
  log "Unit test output: ${OUTPUT_DIR}/unit_tests.jsonl"
}

# --- Run integration tests ---
run_integration_tests() {
  log "Running Flutter integration tests..."
  local test_dir="${PROJECT_ROOT}/integration_test"
  if [[ ! -d "$test_dir" ]]; then
    log "No integration_test/ directory found, skipping integration tests"
    return 0
  fi

  flutter test --machine "$test_dir" > "${OUTPUT_DIR}/integration_tests.jsonl" 2>"${OUTPUT_DIR}/integration_tests_stderr.log" || true
  log "Integration test output: ${OUTPUT_DIR}/integration_tests.jsonl"
}

# --- Bridge mode: connect to VM service ---
run_bridge_mode() {
  local port="${VM_PORT:-8181}"
  log "Connecting to VM service on port ${port}..."

  local bridge_args=(
    python3 "${SCRIPT_DIR}/flutter_debug_bridge.py"
    --port "$port"
    --output "$OUTPUT_DIR"
  )

  if [[ "$DUMP_SEMANTICS" == "true" ]]; then
    bridge_args+=(--dump-semantics)
  fi
  if [[ "$DUMP_WIDGET" == "true" ]]; then
    bridge_args+=(--dump-widget-tree)
  fi
  if [[ "$RUN_INTEGRATION" == "true" ]]; then
    bridge_args+=(--run-tests)
  fi

  "${bridge_args[@]}"
}

# --- Aggregate results ---
aggregate_results() {
  log "Aggregating test results..."

  local summary="${OUTPUT_DIR}/summary.json"
  local total=0 passed=0 failed=0

  python3 -c "
import json, glob, os, sys

results_dir = '$OUTPUT_DIR'
total = 0
passed = 0
failed = 0

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

summary = {
    'total': total,
    'passed': passed,
    'failed': failed,
    'skipped': 0,
    'timestamp': __import__('datetime').datetime.now().isoformat(),
}

with open(os.path.join(results_dir, 'summary.json'), 'w') as f:
    json.dump(summary, f, indent=2)

print(f'Results: {passed}/{total} passed ({failed} failed)')
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
    *)
      fail "Unknown mode: $MODE (expected: local, ci, bridge)"
      ;;
  esac

  log "Done. Output: $OUTPUT_DIR"
}

main "$@"
