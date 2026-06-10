#!/usr/bin/env python3
"""
Flutter Debug Bridge — connect to a running Flutter app's VM service,
collect test results, dump semantics/widget trees, call custom service extensions,
and expose a CLI for external test harnesses (e.g. ../wrongsv).

Usage:
  python flutter_debug_bridge.py --port 8181 --dump-semantics
  python flutter_debug_bridge.py --port 8181 --call-extension ext.app.runSelfTest
  python flutter_debug_bridge.py --port 8181 --evaluate "2 + 2"
  python flutter_debug_bridge.py --discover-from-file /path/to/vm_service_uri.txt --dump-semantics
  python flutter_debug_bridge.py --device emulator-5554 --app hiddify --dump-widget-tree

The --app flag sets metadata only (no behavioral change); it labels output so
that ../wrongsv test orchestrators can distinguish results from multiple apps.
"""

import argparse
import asyncio
import json
import os
import re
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
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
            print(
                "Error: 'websockets' package required. Install with: pip install websockets",
                file=sys.stderr,
            )
            sys.exit(1)
    return websockets


class FlutterDebugBridge:
    """Manages a VM service WebSocket connection to a Flutter app for test/debug operations."""

    def __init__(self, vm_service_uri: str, timeout: float = 30.0):
        self.uri = vm_service_uri.rstrip("/")
        self.ws_uri = self.uri.replace("http://", "ws://").rstrip("/") + "/ws"
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
                websockets.connect(self.ws_uri, ping_interval=10, ping_timeout=5),
                timeout=self.timeout,
            )
            asyncio.create_task(self._reader_loop())
            vm = await self.call_method("getVM")
            isolates = vm.get("result", {}).get("isolates", [])
            if isolates:
                self._isolate_id = isolates[0]["id"]
            return True
        except Exception as e:
            print(
                json.dumps(
                    {
                        "error": True,
                        "code": "VM_SERVICE_UNAVAILABLE",
                        "message": str(e),
                        "retryable": True,
                    }
                )
            )
            return False

    async def connect_with_retry(self, max_retries: int = 5, backoff: float = 1.0) -> bool:
        """Connect with exponential backoff. Useful when app is still starting."""
        for attempt in range(max_retries):
            if await self.connect():
                return True
            wait = backoff * (2 ** attempt)
            print(
                f"Retry {attempt + 1}/{max_retries} in {wait:.1f}s...",
                file=sys.stderr,
            )
            await asyncio.sleep(wait)
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
            for future in self._pending.values():
                if not future.done():
                    future.set_exception(ConnectionError("WebSocket closed"))
            self._pending.clear()

    async def call_method(self, method: str, params: dict = None) -> dict:
        """Send a JSON-RPC call and await the response."""
        self._request_id += 1
        rid = self._request_id
        request = json.dumps(
            {
                "jsonrpc": "2.0",
                "id": rid,
                "method": method,
                "params": params or {},
            }
        )
        future: asyncio.Future = asyncio.get_event_loop().create_future()
        self._pending[rid] = future
        await self.ws.send(request)
        try:
            return await asyncio.wait_for(future, timeout=self.timeout)
        except asyncio.TimeoutError:
            self._pending.pop(rid, None)
            return {"error": {"code": -32000, "message": "Request timed out"}}

    async def call_service_extension(self, extension: str, params: dict = None) -> dict:
        """Call a Flutter-specific service extension (ext.flutter.* or custom ext.*)."""
        merged = {"isolateId": self._isolate_id}
        if params:
            merged.update(params)
        return await self.call_method(extension, merged)

    async def dump_semantics_tree(self) -> dict:
        """Dump the full semantics tree as structured JSON."""
        result = await self.call_service_extension(
            "ext.flutter.debugDumpSemanticsTreeInTraversalOrder"
        )
        return result

    async def evaluate_expression(self, expression: str) -> dict:
        """Evaluate a Dart expression in the main isolate."""
        return await self.call_method(
            "evaluate",
            {"isolateId": self._isolate_id, "expression": expression},
        )

    async def get_widget_tree(self) -> dict:
        """Retrieve a widget tree dump as a string."""
        expr = (
            "import 'dart:convert';"
            "jsonEncode(WidgetsBinding.instance.renderViewElement?.toStringDeep())"
        )
        return await self.evaluate_expression(expr)

    async def get_isolate_stack(self) -> dict:
        """Get the current call stack of the main isolate."""
        return await self.call_method("getStack", {"isolateId": self._isolate_id})

    async def enable_semantics(self) -> dict:
        """Programmatically enable semantics in the running app."""
        expr = (
            "WidgetsBinding.instance.pipelineOwner.ensureSemantics();"
            "'enabled'"
        )
        return await self.evaluate_expression(expr)

    async def get_memory_usage(self) -> dict:
        """Get isolate memory usage."""
        return await self.call_method("getMemoryUsage", {"isolateId": self._isolate_id})

    async def get_vm_timeline(self) -> dict:
        """Retrieve the VM timeline (performance events)."""
        return await self.call_method("getVMTimeline", {})

    async def disconnect(self):
        """Gracefully close the WebSocket connection."""
        if self.ws:
            await self.ws.close()
            self.ws = None


# --- VM Service URI Discovery ---

_VM_URI_PATTERN = re.compile(r"https?://[\d.]+:\d+/[^/\s]+=/")


def discover_from_file(file_path: str) -> Optional[str]:
    """Read the VM service URI from a file written by the app."""
    p = Path(file_path)
    if not p.exists():
        print(
            json.dumps(
                {
                    "error": True,
                    "code": "URI_FILE_NOT_FOUND",
                    "message": f"VM service URI file not found: {file_path}",
                    "retryable": True,
                }
            ),
            file=sys.stderr,
        )
        return None
    content = p.read_text().strip()
    match = _VM_URI_PATTERN.search(content)
    if match:
        return match.group(0).rstrip("/")
    first_line = content.split("\n")[0].strip()
    if first_line.startswith("http://") or first_line.startswith("https://"):
        return first_line.rstrip("/")
    return None


async def discover_vm_service_uri(
    device_id: Optional[str] = None,
    app_dir: Optional[str] = None,
) -> Optional[str]:
    """Launch a Flutter app and discover its VM service URI from flutter run output."""
    cmd = ["flutter", "run", "--debug"]
    if device_id:
        cmd.extend(["--device-id", device_id])
    if app_dir:
        cmd = ["flutter", "run", "--debug"]
        if device_id:
            cmd.extend(["-d", device_id])

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=app_dir,
    )

    vm_uri = None
    try:
        async for line in proc.stdout:
            decoded = line.decode().strip()
            print(f"[flutter] {decoded}", file=sys.stderr)
            if "Observatory debugger" in decoded or "Dart VM Service" in decoded or "vm service" in decoded.lower():
                match = _VM_URI_PATTERN.search(decoded)
                if match:
                    vm_uri = match.group(0).rstrip("/")
                else:
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
        "flutter",
        "test",
        "integration_test",
        "--machine",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    async for line in proc.stdout:
        decoded = line.decode().strip()
        try:
            event = json.loads(decoded)
            if event.get("type") == "testDone":
                results.append(
                    {
                        "testName": event.get("testName", "unknown"),
                        "suiteName": event.get("suiteName", "default"),
                        "passed": event.get("result") == "success",
                        "durationMs": event.get("time", 0),
                        "failureMessage": event.get("failure", None),
                        "error": event.get("error", None),
                    }
                )
        except json.JSONDecodeError:
            pass

    await proc.wait()
    return results


# --- Main ---


async def run_bridge(args: argparse.Namespace) -> int:
    """Main bridge execution."""
    run_id = str(uuid.uuid4())
    output = {
        "runId": run_id,
        "appName": args.app or "unknown",
        "startTime": datetime.now(timezone.utc).isoformat(),
        "testResults": [],
        "summary": {"total": 0, "passed": 0, "failed": 0, "skipped": 0},
        "semanticsTree": None,
        "widgetTree": None,
        "customExtensionResults": [],
        "evaluateResults": [],
    }

    # --- Resolve VM service URI ---
    bridge: Optional[FlutterDebugBridge] = None
    vm_uri: Optional[str] = None

    if args.discover_from_file:
        vm_uri = discover_from_file(args.discover_from_file)
        if vm_uri is None:
            return 1

    elif args.port:
        vm_uri = f"http://127.0.0.1:{args.port}"

    elif args.device:
        vm_uri = await discover_vm_service_uri(args.device, args.app_dir)
        if vm_uri is None:
            print(
                json.dumps(
                    {
                        "error": True,
                        "code": "VM_SERVICE_DISCOVERY_FAILED",
                        "message": "Could not discover VM service URI from flutter run",
                        "retryable": True,
                    }
                )
            )
            return 1

    if vm_uri:
        output["vmServiceUri"] = vm_uri
        bridge = FlutterDebugBridge(vm_uri, timeout=args.timeout)
        if not await bridge.connect():
            if args.retry:
                if not await bridge.connect_with_retry(
                    max_retries=args.retry, backoff=1.0
                ):
                    return 1
            else:
                return 1

    # --- Connected: execute requested operations ---
    if bridge:
        print(f"Connected to: {vm_uri}", file=sys.stderr)

        # Dump semantics tree
        if args.dump_semantics:
            print("Collecting semantics tree...", file=sys.stderr)
            await bridge.enable_semantics()
            semantics_result = await bridge.dump_semantics_tree()
            output["semanticsTree"] = semantics_result

        # Dump widget tree
        if args.dump_widget_tree:
            print("Collecting widget tree...", file=sys.stderr)
            widget_tree = await bridge.get_widget_tree()
            output["widgetTree"] = widget_tree

        # Evaluate arbitrary Dart expression
        if args.evaluate:
            print(f"Evaluating: {args.evaluate}", file=sys.stderr)
            eval_result = await bridge.evaluate_expression(args.evaluate)
            output["evaluateResults"].append(
                {"expression": args.evaluate, "result": eval_result}
            )

        # Get isolate stack
        if args.get_stack:
            print("Getting isolate stack...", file=sys.stderr)
            stack = await bridge.get_isolate_stack()
            output["isolateStack"] = stack

        # Get memory usage
        if args.get_memory:
            print("Getting memory usage...", file=sys.stderr)
            mem = await bridge.get_memory_usage()
            output["memoryUsage"] = mem

        # Call custom service extensions
        for ext in args.call_extension or []:
            print(f"Calling extension: {ext}", file=sys.stderr)
            ext_result = await bridge.call_service_extension(ext)
            output["customExtensionResults"].append(
                {"extension": ext, "result": ext_result}
            )

        await bridge.disconnect()

    # Run integration tests (after bridge operations)
    if args.run_tests:
        results = await run_integration_tests(
            args.test_dir or "integration_test/"
        )
        output["testResults"] = results
        output["summary"] = {
            "total": len(results),
            "passed": sum(1 for r in results if r["passed"]),
            "failed": sum(1 for r in results if not r["passed"]),
            "skipped": sum(1 for r in results if r.get("skipped")),
        }

    output["endTime"] = datetime.now(timezone.utc).isoformat()

    # --- Output ---
    if args.output:
        os.makedirs(args.output, exist_ok=True)
        output_path = os.path.join(args.output, f"flutter_bridge_{run_id}.json")
        with open(output_path, "w") as f:
            json.dump(output, f, indent=2)
        print(f"Results written to {output_path}")

        # Also write latest symlink for convenience
        latest_path = os.path.join(args.output, "latest.json")
        with open(latest_path, "w") as f:
            json.dump(output, f, indent=2)

    else:
        print(json.dumps(output, indent=2))

    if output["summary"]["failed"] > 0:
        return 1
    return 0


def main():
    parser = argparse.ArgumentParser(
        description="Flutter Debug Bridge — VM service bridge for external test harnesses",
    )
    # Connection
    g_conn = parser.add_argument_group("Connection")
    g_conn.add_argument("--port", type=int, help="VM service port to connect to")
    g_conn.add_argument("--device", help="Device ID for launching Flutter app")
    g_conn.add_argument("--app-dir", help="Path to Flutter app directory (for flutter run)")
    g_conn.add_argument(
        "--discover-from-file",
        help="Read VM service URI from a file (written by the app in debug mode)",
    )
    g_conn.add_argument("--app", help="App name for result metadata (hiddify|flclash)")
    g_conn.add_argument(
        "--timeout", type=float, default=30.0, help="Connection timeout in seconds"
    )
    g_conn.add_argument(
        "--retry",
        type=int,
        default=0,
        help="Max retry attempts with exponential backoff (0 = no retry)",
    )

    # Operations
    g_ops = parser.add_argument_group("Operations")
    g_ops.add_argument(
        "--dump-semantics", action="store_true", help="Dump semantics tree as JSON"
    )
    g_ops.add_argument(
        "--dump-widget-tree", action="store_true", help="Dump widget tree"
    )
    g_ops.add_argument(
        "--evaluate", help="Evaluate a Dart expression in the main isolate"
    )
    g_ops.add_argument(
        "--get-stack", action="store_true", help="Get current isolate call stack"
    )
    g_ops.add_argument(
        "--get-memory", action="store_true", help="Get isolate memory usage"
    )
    g_ops.add_argument(
        "--call-extension",
        action="append",
        default=[],
        help="Call a custom service extension (can be repeated). "
        "Examples: ext.flclash.getAppState, ext.hiddify.runSelfTest",
    )
    g_ops.add_argument(
        "--run-tests", action="store_true", help="Run Flutter integration tests"
    )
    g_ops.add_argument(
        "--test-dir", default="integration_test/", help="Test directory path"
    )

    # Output
    g_out = parser.add_argument_group("Output")
    g_out.add_argument("--output", "-o", help="Output directory for results")
    g_out.add_argument(
        "--format",
        choices=["json", "junit"],
        default="json",
        help="Output format (default: json)",
    )

    args = parser.parse_args()

    if not args.port and not args.device and not args.discover_from_file:
        parser.error(
            "One of --port, --device, or --discover-from-file is required"
        )

    exit_code = asyncio.run(run_bridge(args))
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
