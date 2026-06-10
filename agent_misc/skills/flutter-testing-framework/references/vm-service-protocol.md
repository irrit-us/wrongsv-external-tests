# VM Service Protocol Reference

Source: [Dart VM Service Protocol spec v4.16](https://github.com/dart-lang/sdk/blob/main/runtime/vm/service/service.md)

## Overview

The Dart VM Service Protocol is the backbone of Flutter debugging and testing. It runs as a WebSocket server embedded in the Dart VM, exposing JSON-RPC 2.0 endpoints for isolate control, object inspection, memory profiling, and timeline collection. The official specification is maintained at `dart-lang/sdk/runtime/vm/service/service.md`.

**Protocol version**: 4.16 (current)
**Transport**: WebSocket (primary), HTTP (limited, no events)
**Package**: `package:vm_service` (Dart client) — [pub.dev/packages/vm_service](https://pub.dev/packages/vm_service)

## Connection

### Discovering the VM Service URI

The VM service URI is printed to stdout when launching a Flutter app in debug mode:

```
An Observatory debugger and profiler is available at: http://127.0.0.1:8181/xxxxxxxxx=/
```

The WebSocket URI is: `ws://127.0.0.1:8181/xxxxxxxxx=/ws`

### Programmatic Discovery

```dart
import 'dart:developer';

void main() {
  // Listen for the VM service URI event
  developer.getVMServiceUri().then((uri) {
    print('VM Service: $uri');
  });
}
```

### Connecting from Dart

```dart
import 'package:vm_service/vm_service.dart';
import 'package:vm_service/vm_service_io.dart';

Future<VmService> connectToVmService(String uri) async {
  final service = await vmServiceConnectUri(uri);
  return service;
}
```

### Connecting from Python

```python
import asyncio
import json
import websockets

async def connect_vm_service(uri):
    ws_uri = uri.replace('http://', 'ws://') + 'ws'
    async with websockets.connect(ws_uri) as ws:
        # Send a JSON-RPC request
        request = json.dumps({
            'jsonrpc': '2.0',
            'id': 1,
            'method': 'getVM',
            'params': {}
        })
        await ws.send(request)
        response = await ws.recv()
        return json.loads(response)
```

## Key API Methods

### Isolate Management

| Method | Purpose |
|--------|---------|
| `getVM` | Get VM-level information, list isolates |
| `getIsolate` | Get isolate details, including root library |
| `pause` | Pause an isolate at the next safe point |
| `resume` | Resume a paused isolate |
| `getIsolatePauseEvent` | Get the pause event (breakpoint, exception, etc.) |

### Object Inspection

| Method | Purpose |
|--------|---------|
| `getObject` | Get detailed object representation |
| `evaluate` | Evaluate a Dart expression in an isolate |
| `evaluateInFrame` | Evaluate in a specific stack frame |
| `getStack` | Get the current call stack |

### Timeline & Performance

| Method | Purpose |
|--------|---------|
| `getVMTimeline` | Retrieve timeline events |
| `getVMTimelineFlags` | Check which timeline streams are enabled |
| `setVMTimelineFlags` | Enable/disable specific timeline streams |
| `clearVMTimeline` | Clear accumulated timeline data |

### Memory

| Method | Purpose |
|--------|---------|
| `getMemoryUsage` | Get isolate memory usage |
| `getProcessMemoryUsage` | Get process-level memory |
| `getAllocationProfile` | Get allocation statistics by class |

## Flutter-Specific Extensions

Flutter registers service extensions on top of the base VM service protocol:

| Extension | Purpose |
|-----------|---------|
| `ext.flutter.debugDumpApp` | Dump the widget tree to console |
| `ext.flutter.debugDumpRenderTree` | Dump the render tree |
| `ext.flutter.debugDumpSemanticsTreeInTraversalOrder` | Dump semantics tree in traversal order |
| `ext.flutter.debugDumpSemanticsTreeInInverseHitTestOrder` | Dump semantics tree in hit-test order |
| `ext.flutter.debugPaint` | Toggle debug paint overlay |
| `ext.flutter.debugAllowBanner` | Toggle the debug banner |
| `ext.flutter.timeDilation` | Get/set time dilation factor |
| `ext.flutter.platformOverride` | Override the target platform |
| `ext.flutter.brightnessOverride` | Override platform brightness |

Call a service extension via:
```dart
final result = await service.callServiceExtension(
  'ext.flutter.debugDumpSemanticsTreeInTraversalOrder',
);
```

## Test-Specific Patterns

### Enabling Semantics in Tests

```dart
import 'package:flutter_test/flutter_test.dart';

void enableDebugFlags() {
  // Enable semantics for the test
  WidgetsBinding.instance.pipelineOwner.semanticsOwner;
  // Then use vm_service to inspect the tree
}
```

### Debugging Test Hangs

When a Flutter test hangs, connect to the VM service and:

1. `getIsolate` — verify the isolate is alive
2. `getStack` — inspect the call stack for deadlocks
3. `evaluate` — evaluate `WidgetsBinding.instance.debugIsWaitingForFrame` to check for frame callbacks
4. `getVMTimeline` — check for stalled frame pipeline

### Timeline Tracing for Tests

```dart
// In the test:
import 'dart:developer';

Timeline.startSync('my_test_operation');
// ... test operations ...
Timeline.finishSync();
```

Then retrieve via VM service:
```dart
final timeline = await service.getVMTimeline();
// Filter for 'my_test_operation' events
```

## Common Pitfalls

- **WebSocket disconnection**: Always implement reconnection logic with exponential backoff
- **Port conflicts**: Use dynamic ports in CI; read the VM service URI from device output
- **Isolate lifecycle**: Tests spawn additional isolates; track them with `streamListen('Isolate')`
- **Timeline buffer overflow**: Clear timeline periodically to avoid unbounded growth
- **Service extension not found**: Ensure the Flutter app is built in debug/profile mode; service extensions are absent in release
