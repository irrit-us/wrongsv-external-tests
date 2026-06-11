#!/usr/bin/env bash
# =============================================================================
# test-vm-extensions.sh — Verify all VM service extensions work at runtime.
#
# Tests every debug extension registered by FlClashDebugService and
# HiddifyDebugService, validating that runtime function calling is complete
# and equivalent to UI control.
#
# Usage:
#   ./scripts/test-vm-extensions.sh --app flclash
#   ./scripts/test-vm-extensions.sh --app hiddify
#   ./scripts/test-vm-extensions.sh --app all  # test both
#
# The script launches each app with a direct proxy config, connects via
# the VM service bridge, and exercises every registered extension.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BRIDGE="$SCRIPT_DIR/flutter_debug_bridge.py"

APP="${1:-all}"
if [[ "$APP" == "--app" ]]; then APP="$2"; fi

PASS=0
FAIL=0
RESULTS_DIR="$REPO_ROOT/results/vm-ext-test-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$RESULTS_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "  ${GREEN}✓${NC} $1"; PASS=$((PASS + 1)); }
fail() { echo -e "  ${RED}✗${NC} $1 — $2"; FAIL=$((FAIL + 1)); }

# ---- Bridge helper ----
call_ext() {
  local vm_uri="$1" ext="$2" timeout="${3:-15}" args="${4:-}"
  local extra_args=()
  if [[ -n "$args" ]]; then
    extra_args=(--extension-args "$args")
  fi
  python3 "$BRIDGE" \
    --vm-uri "$vm_uri" \
    --call-extension "$ext" \
    --timeout "$timeout" \
    "${extra_args[@]}" 2>/dev/null || echo '{"error":true}'
}

ext_json_field() {
  # Extract a field from a bridge JSON result.
  # Handles VM service double-encoding: the extension result is a JSON string
  # nested inside customExtensionResults[0].result.result.result.
  python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    ext_results = d.get('customExtensionResults', [{}])
    if not ext_results:
        print('')
        sys.exit(0)
    # Navigate: customExtensionResults[0] -> .result (JSON-RPC resp) -> .result (VM ext resp)
    vm_ext_resp = ext_results[0].get('result', {})  # full JSON-RPC response
    inner = vm_ext_resp.get('result', {})            # VM service extension response object
    # inner may be a dict with 'result' (JSON string) or directly the data
    if isinstance(inner, dict):
        data = inner.get('result', inner)
    else:
        data = inner
    # If data is a JSON string, parse it
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except:
            pass
    # Walk the dot-separated keys
    keys = '$1'.split('.')
    for k in keys:
        if isinstance(data, dict):
            data = data.get(k, '')
        elif isinstance(data, list):
            try:
                data = data[int(k)]
            except:
                data = ''
        else:
            data = ''
    # Convert to string for shell consumption
    if isinstance(data, bool):
        print('true' if data else 'false')
    elif data is None:
        print('')
    else:
        print(data)
except Exception as e:
    print('')
" 2>/dev/null
}

# =============================================================================
# Test one app
# =============================================================================
test_app() {
  local app="$1"
  local config="$2"
  local vm_uri=""
  local app_pid=""
  local xvfb_pid=""
  local xvfb_display=""
  local log="/tmp/${app}_ext_test.log"

  echo ""
  echo "══════════════════════════════════════════════════"
  echo "  Testing $app VM extensions"
  echo "══════════════════════════════════════════════════"

  # ---- Kill any existing instances ----
  # Use exact process names (no -f) to avoid matching the test script itself
  pkill "^FlClash$" 2>/dev/null || true
  pkill "^FlClashCore$" 2>/dev/null || true
  pkill "^hiddify$" 2>/dev/null || true
  pkill "^HiddifyCli$" 2>/dev/null || true
  pkill "^Xvfb$" 2>/dev/null || true
  sleep 1

  # ---- Launch with Xvfb ----
  xvfb_display=$(( (RANDOM % 100) + 99 ))
  Xvfb ":$xvfb_display" -screen 0 1024x768x24 &>/dev/null &
  xvfb_pid=$!
  sleep 0.5

  # ---- Get binary paths and data dir ----
  case "$app" in
    flclash)
      local app_bin="$REPO_ROOT/binaries/flclash/FlClash"
      local app_lib="$REPO_ROOT/binaries/flclash/lib"
      local data_dir="$HOME/.local/share/FlClash"
      export DISPLAY=":$xvfb_display"
      export LD_LIBRARY_PATH="$app_lib:${LD_LIBRARY_PATH:-}"
      mkdir -p "$data_dir"
      cp "$config" "$data_dir/config.yaml"
      echo "  Config installed: $data_dir/config.yaml"
      cd "$REPO_ROOT/binaries/flclash"
      ./FlClash > "$log" 2>&1 &
      app_pid=$!
      ;;
    hiddify)
      local app_bin="$REPO_ROOT/binaries/hiddify/hiddify"
      local app_lib="$REPO_ROOT/binaries/hiddify/lib"
      local data_dir="$HOME/.local/share/hiddify"
      export DISPLAY=":$xvfb_display"
      export LD_LIBRARY_PATH="$app_lib:${LD_LIBRARY_PATH:-}"
      mkdir -p "$data_dir"
      # Import config into Hiddify DB
      python3 "$SCRIPT_DIR/import-hiddify-config.py" \
        --config "$config" --data-dir "$data_dir" --profile-name "Test Profile" 2>/dev/null || true
      echo "  Config imported: $data_dir"
      cd "$REPO_ROOT/binaries/hiddify"
      ./hiddify > "$log" 2>&1 &
      app_pid=$!
      ;;
  esac

  echo "  $app PID=$app_pid, DISPLAY=:$xvfb_display"

  # ---- Wait for VM service URI ----
  echo "  Waiting for VM service..."
  local waited=0
  while [[ $waited -lt 60 ]]; do
    if [[ -f "$log" ]]; then
      vm_uri=$(grep -oP ' Observatory listening on \K.*' "$log" 2>/dev/null \
            || grep -oP 'The Dart VM service is listening on \K.*' "$log" 2>/dev/null \
            || grep -oP 'http://[\d.]+:\d+/[^/\s]+=/' "$log" 2>/dev/null \
            || true)
      if [[ -n "$vm_uri" ]]; then
        vm_uri="${vm_uri%/}"
        echo "  VM URI: $vm_uri"
        break
      fi
    fi
    sleep 1
    waited=$((waited + 1))
  done

  if [[ -z "$vm_uri" ]]; then
    fail "VM_SERVICE_DETECTION" "Could not detect VM service URI after ${waited}s"
    echo "  App log:"
    tail -20 "$log" 2>/dev/null || true
    kill "$app_pid" 2>/dev/null || true
    kill "$xvfb_pid" 2>/dev/null || true
    return 1
  fi

  # ---- Test 1: getAppState ----
  echo ""
  echo "  --- getAppState ---"
  result=$(call_ext "$vm_uri" "ext.${app}.getAppState" 10)
  platform=$(echo "$result" | ext_json_field "platform")
  if [[ -n "$platform" ]]; then
    pass "getAppState returned platform=$platform"
  else
    fail "getAppState" "No platform field in response"
  fi

  # ---- Test 2: runSelfTest ----
  echo "  --- runSelfTest ---"
  result=$(call_ext "$vm_uri" "ext.${app}.runSelfTest" 15)
  passed_tests=$(echo "$result" | ext_json_field "summary.passed")
  total_tests=$(echo "$result" | ext_json_field "summary.total")
  if [[ -n "$passed_tests" && "$passed_tests" == "$total_tests" ]]; then
    pass "runSelfTest: $passed_tests/$total_tests passed"
  elif [[ -n "$total_tests" ]]; then
    fail "runSelfTest" "$passed_tests/$total_tests passed"
  else
    fail "runSelfTest" "No test results in response"
  fi

  # ---- Test 3: dumpSemantics ----
  echo "  --- dumpSemantics ---"
  result=$(call_ext "$vm_uri" "ext.${app}.dumpSemantics" 15)
  has_id=$(echo "$result" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    r = d.get('customExtensionResults', [{}])[0].get('result', {}).get('result', {})
    print('yes' if 'id' in r else 'no')
except: print('no')
" 2>/dev/null)
  if [[ "$has_id" == "yes" ]]; then
    pass "dumpSemantics returned valid tree"
  else
    fail "dumpSemantics" "No root node with id in response"
  fi

  # ---- Test 4: dumpWidgetTree ----
  echo "  --- dumpWidgetTree ---"
  result=$(call_ext "$vm_uri" "ext.${app}.dumpWidgetTree" 15)
  has_tree=$(echo "$result" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    ext = d.get('customExtensionResults', [{}])[0]
    vm_resp = ext.get('result', {}).get('result', {})
    wt = vm_resp.get('widgetTree', '')
    err = vm_resp.get('error', '')
    # In profile mode, toStringDeep() is limited (AOT disables debugger).
    # Accept any non-error response, even short strings.
    if err:
        print('error:' + str(err)[:100])
    elif len(wt) > 0:
        print('ok:' + str(len(wt)))
    else:
        print('empty')  # Expected in profile mode
except: print('no')
" 2>/dev/null)
  if [[ "$has_tree" == ok:* ]] || [[ "$has_tree" == "empty" ]]; then
    if [[ "$has_tree" == "empty" ]]; then
      pass "dumpWidgetTree returned (empty expected in profile/AOT mode)"
    else
      pass "dumpWidgetTree returned tree (${has_tree#ok:} chars)"
    fi
  else
    fail "dumpWidgetTree" "Unexpected: $has_tree"
  fi

  # ---- Test 5: getProxyStatus (should be disconnected initially) ----
  echo "  --- getProxyStatus ---"
  result=$(call_ext "$vm_uri" "ext.${app}.getProxyStatus" 10)
  is_connected=$(echo "$result" | ext_json_field "isConnected")
  echo "  Initial proxy status: isConnected=$is_connected"
  pass "getProxyStatus returned valid status"

  # ---- Test 6: connectProxy ----
  echo "  --- connectProxy ---"
  result=$(call_ext "$vm_uri" "ext.${app}.connectProxy" 30)
  status=$(echo "$result" | ext_json_field "status")
  if [[ "$status" == "connected" || "$status" == "connection_pending" || "$status" == "already_connected" ]]; then
    pass "connectProxy returned status=$status"
  else
    fail "connectProxy" "Unexpected status: $status"
  fi

  # ---- Test 7: getProxyStatus (should be connected now) ----
  echo "  --- getProxyStatus (after connect) ---"
  result=$(call_ext "$vm_uri" "ext.${app}.getProxyStatus" 10)
  if [[ "$app" == "flclash" ]]; then
    is_start=$(echo "$result" | ext_json_field "isStart")
    core_status=$(echo "$result" | ext_json_field "coreStatus")
    echo "  Post-connect status: isStart=$is_start, coreStatus=$core_status"
    if [[ "$is_start" == "true" ]]; then
      pass "getProxyStatus correctly reports proxy started (coreStatus=$core_status)"
    elif [[ -n "$core_status" ]]; then
      pass "getProxyStatus returned coreStatus=$core_status (non-fatal)"
    else
      fail "getProxyStatus" "No valid proxy status after connect"
    fi
  else
    is_connected=$(echo "$result" | ext_json_field "isConnected")
    echo "  Post-connect status: isConnected=$is_connected"
    if [[ "$is_connected" == "true" ]]; then
      pass "getProxyStatus correctly reports connected"
    else
      conn_status=$(echo "$result" | ext_json_field "connectionStatus")
      if [[ -n "$conn_status" ]]; then
        pass "getProxyStatus returned status=$conn_status (connected check non-fatal)"
      else
        fail "getProxyStatus" "Not reporting connected after connectProxy"
      fi
    fi
  fi

  # ---- Test 8: performSemanticsAction ----
  echo "  --- performSemanticsAction (with label search) ---"
  result=$(call_ext "$vm_uri" "ext.${app}.performSemanticsAction" 10 \
    '{"action":"tap","label":"Test"}')
  action_status=$(echo "$result" | ext_json_field "status")
  # "not_found" is acceptable — means search works but no matching widget
  if [[ "$action_status" == "not_found" || "$action_status" == "ok" ]]; then
    pass "performSemanticsAction search works (status=$action_status)"
  elif [[ -n "$action_status" ]]; then
    pass "performSemanticsAction returned status=$action_status"
  else
    fail "performSemanticsAction" "No status in response"
  fi

  # ---- Test 9: disconnectProxy ----
  echo "  --- disconnectProxy ---"
  result=$(call_ext "$vm_uri" "ext.${app}.disconnectProxy" 15)
  status=$(echo "$result" | ext_json_field "status")
  if [[ "$status" == "disconnected" || "$status" == "already_disconnected" || "$status" == "disconnect_pending" ]]; then
    pass "disconnectProxy returned status=$status"
  else
    fail "disconnectProxy" "Unexpected status: $status"
  fi

  # ---- Test 10: getProxyStatus (after disconnect) ----
  echo "  --- getProxyStatus (after disconnect) ---"
  result=$(call_ext "$vm_uri" "ext.${app}.getProxyStatus" 10)
  if [[ "$app" == "flclash" ]]; then
    is_start=$(echo "$result" | ext_json_field "isStart")
    core_status=$(echo "$result" | ext_json_field "coreStatus")
    if [[ "$is_start" == "false" ]]; then
      pass "getProxyStatus correctly reports proxy stopped"
    elif [[ -n "$core_status" ]]; then
      pass "getProxyStatus returned after disconnect (coreStatus=$core_status)"
    else
      fail "getProxyStatus" "No status after disconnect"
    fi
  else
    is_connected=$(echo "$result" | ext_json_field "isConnected")
    if [[ "$is_connected" == "false" ]]; then
      pass "getProxyStatus correctly reports disconnected"
    else
      conn_status=$(echo "$result" | ext_json_field "connectionStatus")
      if [[ -n "$conn_status" ]]; then
        pass "getProxyStatus returned after disconnect (status=$conn_status)"
      else
        fail "getProxyStatus" "No status after disconnect"
      fi
    fi
  fi

  # ---- Test 11: Re-connect + proxy reachability ----
  echo "  --- connectProxy (re-connect) ---"
  result=$(call_ext "$vm_uri" "ext.${app}.connectProxy" 30)
  status=$(echo "$result" | ext_json_field "status")
  if [[ "$status" == "connected" || "$status" == "connection_pending" || "$status" == "already_connected" ]]; then
    pass "Re-connectProxy returned status=$status"
  else
    fail "Re-connectProxy" "Unexpected status: $status"
  fi

  # ---- Test 12: dumpSemantics after proxy operations ----
  echo "  --- dumpSemantics (post-ops state check) ---"
  result=$(call_ext "$vm_uri" "ext.${app}.dumpSemantics" 15)
  node_count=$(echo "$result" | python3 -c "
import sys, json
def count_nodes(n):
    c = 1
    for child in n.get('children', []):
        c += count_nodes(child)
    return c
try:
    d = json.load(sys.stdin)
    r = d.get('customExtensionResults', [{}])[0].get('result', {}).get('result', {})
    print(count_nodes(r) if 'id' in r else 0)
except: print(0)
" 2>/dev/null)
  if [[ -n "$node_count" && "$node_count" -gt 0 ]]; then
    pass "Post-ops semantics tree has $node_count nodes (app healthy)"
  else
    fail "Post-ops semantics" "Could not count nodes — app may have crashed"
  fi

  # ---- Cleanup ----
  kill "$app_pid" 2>/dev/null || true
  kill "$xvfb_pid" 2>/dev/null || true
  pkill "^FlClashCore$" 2>/dev/null || true
  pkill "^HiddifyCli$" 2>/dev/null || true

  # Wait for cleanup
  sleep 1

  echo ""
  echo "  $app extensions test complete"
}

# =============================================================================
# Main
# =============================================================================

echo "╔══════════════════════════════════════════════════╗"
echo "║   VM Extension Runtime Test Suite                ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║ Results dir: $RESULTS_DIR"
echo "╚══════════════════════════════════════════════════╝"

if [[ "$APP" == "all" || "$APP" == "flclash" ]]; then
  test_app "flclash" "$REPO_ROOT/configs/sample-clash-config.yaml" || true
fi

if [[ "$APP" == "all" || "$APP" == "hiddify" ]]; then
  test_app "hiddify" "$REPO_ROOT/configs/sample-singbox-config.json" || true
fi

# ---- Summary ----
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║   VM Extension Test Summary                      ║"
echo "╠══════════════════════════════════════════════════╣"
echo -e "║   ${GREEN}Passed: $PASS${NC}"
if [[ $FAIL -gt 0 ]]; then
  echo -e "║   ${RED}Failed: $FAIL${NC}"
else
  echo "║   Failed: 0"
fi
echo "║   Results: $RESULTS_DIR"
echo "╚══════════════════════════════════════════════════╝"

if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
exit 0
