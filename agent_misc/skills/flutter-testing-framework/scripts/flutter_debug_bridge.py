#!/usr/bin/env python3
"""
Flutter Debug Bridge — connect to a running Flutter app's VM service,
collect test results, dump semantics trees, and expose CLI for external test harnesses.

Usage:
  python flutter_debug_bridge.py --port 8181 --dump-semantics
  python flutter_debug_bridge.py --port 8181 --run-integration-tests --output results/
  python flutter_debug_bridge.py --device emulator-5554 --app-bundle build/app.apk --port 0
"""

import argparse
import asyncio
import json
import os
import signal
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone
from typing import Optional

# Deferred import — checked only when bridge operations are used (not for --help)
websockets = None


def _ensure_websockets():
    global websockets
    if websockets is None:
        try:
            import websockets as _ws
            websockets = _ws
        except ImportError:
            print("Error: 'websockets' package required. Install with: pip install websockets", file=sys.stderr)
            sys.exit(1)
    return websockets


class FlutterDebugBridge:
    """Manages a VM service WebSocket connection to a Flutter app for test/debug operations."""

    def __init__(self, vm_service_uri: str, timeout: float = 30.0):
        self.uri = vm_service_uri
        self.ws_uri = vm_service_uri.replace("http://", "ws://").rstrip("/") + "/ws"
        self.timeout = timeout
        self.ws = None
        self._request_id = 0
        self._pending: dict[int, asyncio.Future] = {}
        self._isolate_id: Optional[str] = None

    async def connect(self) -> bool:
        """Establish WebSocket connection to the Dart VM service."""
        try:
            _ensure_websockets()
            self.ws = await asyncio.wait_for(
                websockets.connect(self.ws_uri, ping_interval=10),
                timeout=self.timeout,
            )
            # Start background reader
            asyncio.create_task(self._reader_loop())
            # Discover the main isolate
            vm = await self.call_method("getVM")
            isolates = vm.get("result", {}).get("isolates", [])
            if isolates:
                self._isolate_id = isolates[0]["id"]
            return True
        except Exception as e:
            print(json.dumps({"error": True, "code": "VM_SERVICE_UNAVAILABLE",
                              "message": str(e), "retryable": True}))
            return False

    async def _reader_loop(self):
        """Background coroutine that reads WebSocket messages and resolves pending futures."""
        try:
            async for message in self.ws:
                response = json.loads(message)
                rid = response.get("id")
                if rid is not None and rid in self._pending:
                    future = self._pending.pop(rid)
                    if not future.done():
                        future.set_result(response)
        except Exception:
            # WebSocket closed — cancel all pending futures
            for future in self._pending.values():
                if not future.done():
                    future.set_exception(ConnectionError("WebSocket closed"))
            self._pending.clear()

    async def call_method(self, method: str, params: dict = None) -> dict:
        """Send a JSON-RPC call and await the response."""
        self._request_id += 1
        rid = self._request_id
        request = json.dumps({
            "jsonrpc": "2.0",
            "id": rid,
            "method": method,
            "params": params or {},
        })
        future: asyncio.Future = asyncio.get_event_loop().create_future()
        self._pending[rid] = future
        await self.ws.send(request)
        try:
            return await asyncio.wait_for(future, timeout=self.timeout)
        except asyncio.TimeoutError:
            self._pending.pop(rid, None)
            return {"error": {"code": -32000, "message": "Request timed out"}}

    async def call_service_extension(self, extension: str, params: dict = None) -> dict:
        """Call a Flutter-specific service extension."""
        return await self.call_method(extension, {
            "isolateId": self._isolate_id,
            **(params or {}),
        })

    async def dump_semantics_tree(self) -> dict:
        """Dump the full semantics tree as structured JSON."""
        result = await self.call_service_extension(
            "ext.flutter.debugDumpSemanticsTreeInTraversalOrder"
        )
        return result

    async def evaluate_expression(self, expression: str) -> dict:
        """Evaluate a Dart expression in the main isolate."""
        return await self.call_method("evaluate", {
            "isolateId": self._isolate_id,
            "expression": expression,
        })

    async def get_widget_tree(self) -> dict:
        """Retrieve a JSON-serialized widget tree dump."""
        expr = (
            "import 'dart:convert';"
            "jsonEncode(WidgetsBinding.instance.renderViewElement?.toStringDeep())"
        )
        return await self.evaluate_expression(expr)

    async def get_isolate_stack(self) -> dict:
        """Get the current call stack of the main isolate."""
        return await self.call_method("getStack", {
            "isolateId": self._isolate_id,
        })

    async def enable_semantics(self) -> dict:
        """Programmatically enable semantics in the running app."""
        expr = (
            "WidgetsBinding.instance.pipelineOwner.ensureSemantics();"
            "'enabled'"
        )
        return await self.evaluate_expression(expr)

    async def disconnect(self):
        """Gracefully close the WebSocket connection."""
        if self.ws:
            await self.ws.close()
            self.ws = None


async def discover_vm_service_uri(device_id: Optional[str] = None) -> Optional[str]:
    """Launch a Flutter app and discover its VM service URI from logs."""
    cmd = ["flutter", "run", "--debug"]
    if device_id:
        cmd.extend(["--device-id", device_id])

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    vm_uri = None
    try:
        async for line in proc.stdout:
            decoded = line.decode().strip()
            print(f"[flutter] {decoded}", file=sys.stderr)
            if "Observatory debugger" in decoded or "Dart VM Service" in decoded:
                # Extract URI from line like:
                # "An Observatory debugger and profiler is available at: http://127.0.0.1:8181/xxx=/"
                parts = decoded.split()
                for part in parts:
                    if part.startswith("http://"):
                        vm_uri = part.rstrip("/")
                        break
                if vm_uri:
                    break
    except asyncio.CancelledError:
        proc.terminate()
        raise

    if vm_uri is None:
        proc.terminate()
        await proc.wait()

    return vm_uri


async def run_integration_tests(test_dir: str) -> list[dict]:
    """Run Flutter integration tests in the given directory."""
    results = []
    proc = await asyncio.create_subprocess_exec(
        "flutter", "test", "integration_test", "--machine",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    async for line in proc.stdout:
        decoded = line.decode().strip()
        try:
            event = json.loads(decoded)
            if event.get("type") == "testDone":
                results.append({
                    "testName": event.get("testName", "unknown"),
                    "passed": event.get("result") == "success",
                    "durationMs": event.get("time", 0),
                    "failureMessage": event.get("failure", None),
                })
        except json.JSONDecodeError:
            pass

    await proc.wait()
    return results


async def run_bridge(args: argparse.Namespace) -> int:
    """Main bridge execution."""
    run_id = str(uuid.uuid4())
    output = {
        "runId": run_id,
        "startTime": datetime.now(timezone.utc).isoformat(),
        "testResults": [],
        "summary": {"total": 0, "passed": 0, "failed": 0, "skipped": 0},
        "semanticsTree": None,
    }

    # Connect to VM service
    bridge: Optional[FlutterDebugBridge] = None

    if args.port:
        vm_uri = f"http://127.0.0.1:{args.port}"
        bridge = FlutterDebugBridge(vm_uri, timeout=args.timeout)
        if not await bridge.connect():
            return 1
    elif args.device and args.app_bundle:
        vm_uri = await discover_vm_service_uri(args.device)
        if vm_uri is None:
            print(json.dumps({"error": True, "code": "VM_SERVICE_DISCOVERY_FAILED",
                              "message": "Could not discover VM service URI", "retryable": True}))
            return 1
        bridge = FlutterDebugBridge(vm_uri, timeout=args.timeout)
        if not await bridge.connect():
            return 1

    if bridge:
        # Dump semantics tree
        if args.dump_semantics:
            await bridge.enable_semantics()
            semantics_result = await bridge.dump_semantics_tree()
            output["semanticsTree"] = semantics_result

        # Collect widget tree
        if args.dump_widget_tree:
            widget_tree = await bridge.get_widget_tree()
            output["widgetTree"] = widget_tree

        await bridge.disconnect()

    # Run integration tests
    if args.run_tests:
        results = await run_integration_tests(args.test_dir or "integration_test/")
        output["testResults"] = results
        output["summary"] = {
            "total": len(results),
            "passed": sum(1 for r in results if r["passed"]),
            "failed": sum(1 for r in results if not r["passed"]),
            "skipped": 0,
        }

    output["endTime"] = datetime.now(timezone.utc).isoformat()

    # Write output
    if args.output:
        os.makedirs(args.output, exist_ok=True)
        output_path = os.path.join(args.output, f"flutter_bridge_{run_id}.json")
        with open(output_path, "w") as f:
            json.dump(output, f, indent=2)
        print(f"Results written to {output_path}")
    else:
        print(json.dumps(output, indent=2))

    # Return non-zero if any tests failed
    if output["summary"]["failed"] > 0:
        return 1
    return 0


def main():
    parser = argparse.ArgumentParser(
        description="Flutter Debug Bridge — VM service bridge for external test harnesses",
    )
    # Connection
    parser.add_argument("--port", type=int, help="VM service port to connect to")
    parser.add_argument("--device", help="Device ID for launching Flutter app")
    parser.add_argument("--app-bundle", help="Path to app bundle (APK/IPA)")
    parser.add_argument("--timeout", type=float, default=30.0, help="Connection timeout in seconds")
    # Operations
    parser.add_argument("--dump-semantics", action="store_true", help="Dump semantics tree as JSON")
    parser.add_argument("--dump-widget-tree", action="store_true", help="Dump widget tree")
    parser.add_argument("--run-tests", action="store_true", help="Run integration tests")
    parser.add_argument("--test-dir", default="integration_test/", help="Test directory path")
    # Output
    parser.add_argument("--output", "-o", help="Output directory for results")
    parser.add_argument("--format", choices=["json", "junit"], default="json", help="Output format")

    args = parser.parse_args()

    if not args.port and not (args.device and args.app_bundle):
        parser.error("Either --port or both --device and --app-bundle are required")

    exit_code = asyncio.run(run_bridge(args))
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
