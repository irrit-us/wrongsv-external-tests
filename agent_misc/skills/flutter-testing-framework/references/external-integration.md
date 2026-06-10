# External Test Harness Integration

## Overview

This reference covers patterns for integrating Flutter test output and debug capabilities into external (non-Dart) test harnesses — Python, JavaScript, shell scripts, CI/CD pipelines.

## Integration Patterns

### Pattern 1: JSON-Lines Output Bridge

The simplest integration: Flutter test emits JSON-Lines, external harness consumes.

**Dart side (test output adapter):**
```dart
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';

/// Call this from tearDown or a custom test runner
void emitJsonTestResult(String testName, bool passed, String? failure) {
  final result = jsonEncode({
    'testName': testName,
    'passed': passed,
    'failure': failure,
    'timestamp': DateTime.now().toIso8601String(),
  });
  print('TEST_RESULT: $result');  // stdout line
}
```

**Python side (consumer):**
```python
import subprocess
import json

def run_flutter_tests(test_dir: str) -> list[dict]:
    results = []
    proc = subprocess.Popen(
        ['flutter', 'test', '--machine', test_dir],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    for line in proc.stdout:
        if line.startswith('TEST_RESULT: '):
            result = json.loads(line[len('TEST_RESULT: '):])
            results.append(result)
    proc.wait()
    return results
```

### Pattern 2: VM Service WebSocket Bridge

Full remote control via the Dart VM service protocol.

**Python bridge** (see `scripts/flutter_debug_bridge.py` for full implementation):

```python
# Pseudocode for external harness VM service interaction
import asyncio
import json
import websockets

class FlutterVmBridge:
    def __init__(self, vm_service_uri: str):
        self.uri = vm_service_uri
        self.ws = None
        self.request_id = 0

    async def connect(self):
        ws_uri = self.uri.replace('http://', 'ws://') + 'ws'
        self.ws = await websockets.connect(ws_uri)

    async def call_method(self, method: str, params: dict = None):
        self.request_id += 1
        request = json.dumps({
            'jsonrpc': '2.0',
            'id': self.request_id,
            'method': method,
            'params': params or {},
        })
        await self.ws.send(request)
        response = await self.ws.recv()
        return json.loads(response)

    async def dump_semantics_tree(self, isolate_id: str):
        # Call Flutter's service extension
        result = await self.call_method('ext.flutter.debugDumpSemanticsTreeInTraversalOrder', {
            'isolateId': isolate_id,
        })
        return result

    async def evaluate_expression(self, isolate_id: str, expression: str):
        result = await self.call_method('evaluate', {
            'isolateId': isolate_id,
            'expression': expression,
        })
        return result
```

### Pattern 3: Semantics Tree JSON Relay

Export the complete semantics tree for external analysis tools.

**Dart side:**
```dart
import 'dart:convert';
import 'package:flutter/rendering.dart';

String dumpSemanticsAsJson() {
  final owner = WidgetsBinding.instance.pipelineOwner.semanticsOwner;
  if (owner == null) return jsonEncode({'error': 'Semantics not enabled'});

  final result = _serializeNode(owner.rootSemanticsNode!);
  return jsonEncode(result);
}
```

**External side:** Call this via VM service `evaluate` and parse the JSON.

### Pattern 4: Flutter Test → JUnit XML for CI

Transform Flutter's `--machine` output into JUnit XML:

```python
# scripts/convert_to_junit.py (referenced concept)
import json
import xml.etree.ElementTree as ET

def flutter_machine_to_junit(machine_output: str) -> str:
    suite = ET.Element('testsuite', name='flutter_tests')
    for line in machine_output.strip().split('\n'):
        event = json.loads(line)
        if event.get('type') == 'testDone':
            test_case = ET.SubElement(suite, 'testcase', {
                'name': event['testName'],
                'time': str(event.get('time', 0) / 1000),
            })
            if not event['result'] == 'success':
                failure = ET.SubElement(test_case, 'failure', {
                    'message': event.get('failure', ''),
                })
    return ET.tostring(suite, encoding='unicode')
```

## CI/CD Integration

### GitHub Actions

```yaml
- name: Run Flutter integration tests
  run: |
    bash scripts/test_runner.sh --mode ci --output results/

- name: Publish test results
  uses: dorny/test-reporter@v1
  with:
    name: Flutter Tests
    path: results/junit.xml
    reporter: java-junit
```

### Custom Harness Invocation

```bash
# Full pipeline: launch app → run tests → collect semantics → aggregate
python scripts/flutter_debug_bridge.py \
  --device emulator-5554 \
  --app-bundle build/app.apk \
  --vm-service-port 0 \
  --run-tests integration_test/ \
  --dump-semantics \
  --output results/ \
  --format junit
```

## Result Schema (JSON)

The bridge scripts use a common result schema:

```json
{
  "runId": "uuid",
  "startTime": "ISO 8601",
  "endTime": "ISO 8601",
  "testResults": [
    {
      "testName": "string",
      "suiteName": "string",
      "passed": "boolean",
      "durationMs": "number",
      "failureMessage": "string|null",
      "semanticsSnapshot": "object|null"
    }
  ],
  "summary": {
    "total": "number",
    "passed": "number",
    "failed": "number",
    "skipped": "number"
  },
  "semanticsTree": "object|null"
}
```

## Error Handling Contracts

External harnesses must handle these failure modes:

1. **VM Service unavailable**: App not launched in debug mode, port blocked, device disconnected
2. **Semantics tree empty**: Semantics not enabled, no widgets rendered
3. **Isolate terminated**: App crashed, out-of-memory, platform exception
4. **WebSocket timeout**: Network latency, device under load
5. **Service extension missing**: Flutter version mismatch, release mode app

All bridge scripts use JSON error envelopes:
```json
{
  "error": true,
  "code": "VM_SERVICE_UNAVAILABLE",
  "message": "Could not connect to VM service at ws://127.0.0.1:8181/.../ws",
  "retryable": true
}
```
