#!/usr/bin/env bash
# bridge.sh — convenience wrapper to connect to a running Flutter app's
# VM service and issue debug commands. The app must already be running in
# debug mode with debug/developer mode enabled.
#
# Usage:
#   bash bridge.sh hiddify --port 8181 --dump-semantics
#   bash bridge.sh flclash --port 8182 --call-extension ext.flclash.runSelfTest
#   bash bridge.sh hiddify --port 8181 --run-tests
#
# The app must have debug extensions registered:
#   - Hiddify: Toggle "Debug Mode" in Settings > General,
#              then visit Settings > Developer > "Register Debug Extensions"
#   - FlClash: Enable Developer Mode (tap icon 5x in About),
#              then visit Tools > Developer > "Register Debug Extensions"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRIDGE_SCRIPT="${SCRIPT_DIR}/scripts/flutter_debug_bridge.py"

if [[ $# -lt 1 ]]; then
  echo "Usage: bridge.sh <hiddify|flclash> [bridge-args...]"
  echo ""
  echo "Examples:"
  echo "  bash bridge.sh hiddify --port 8181 --dump-semantics"
  echo "  bash bridge.sh flclash --port 8182 --call-extension ext.flclash.runSelfTest"
  echo "  bash bridge.sh hiddify --port 8181 --dump-widget-tree -o results/"
  echo "  bash bridge.sh flclash --port 8182 --evaluate '2 + 2'"
  echo ""
  echo "Available extensions:"
  echo "  ext.hiddify.getAppState       ext.flclash.getAppState"
  echo "  ext.hiddify.dumpSemantics     ext.flclash.dumpSemantics"
  echo "  ext.hiddify.dumpWidgetTree    ext.flclash.dumpWidgetTree"
  echo "  ext.hiddify.runSelfTest       ext.flclash.runSelfTest"
  exit 1
fi

APP="$1"
shift

if [[ "$APP" != "hiddify" && "$APP" != "flclash" ]]; then
  echo "ERROR: app must be 'hiddify' or 'flclash', got '$APP'"
  exit 1
fi

# Set app-dir based on app name
case "$APP" in
  hiddify) APP_DIR="${SCRIPT_DIR}/hiddify-next" ;;
  flclash) APP_DIR="${SCRIPT_DIR}/FlClash" ;;
esac

exec python3 "$BRIDGE_SCRIPT" --app "$APP" --app-dir "$APP_DIR" "$@"
