# Flutter Testing Architecture — Full Reference

## Architecture Comparison Matrix

| Dimension | flutter_test (Widget) | integration_test | Custom vm_service Bridge |
|-----------|----------------------|------------------|--------------------------|
| **Execution location** | Host (headless) | Device/emulator | Hybrid (host harness + device) |
| **Access to platform channels** | Mock only | Real | Real |
| **Widget tree access** | Full | Full | Partial (via evaluate) |
| **Semantics tree access** | Full | Full | Via service extension dump |
| **Performance profiling** | Limited | Yes (frame timing) | Full (Timeline API) |
| **Isolate introspection** | No | No | Full |
| **Setup complexity** | Low | Medium | High |
| **CI compatibility** | Excellent | Good (needs device) | Moderate (needs device + port management) |
| **External harness integration** | JSON output | Platform channel | Native WebSocket |

## When to Use Each Approach

### Standard Widget Tests (flutter_test)

**Use when:**
- Testing widget behavior, layout, and appearance
- Fast iteration in local development
- Tests don't need real platform channels
- No device required

**Limitations:**
- Cannot exercise real platform plugins (camera, GPS, biometrics)
- Headless rendering differences from real device
- No performance profiling

### On-Device Integration Tests (integration_test)

**Use when:**
- Testing real platform channel integration
- Verifying gesture behavior on real devices
- Performance regression testing with frame timing
- Need genuine rendering behavior

**Limitations:**
- Requires connected device/emulator
- Slower startup per test file
- Isolate is shared with the app (harder to debug hangs)
- Deprecated FlutterDriver's remote-control pattern not available

### Custom vm_service Bridge

**Use when:**
- External (non-Dart) test harness needs to drive Flutter
- Need isolate-level debugging during test execution
- Building custom tooling for Flutter app introspection
- Integrating Flutter tests into a polyglot CI/CD pipeline
- Need to interact with the semantics tree from outside the app

**Limitations:**
- Complex setup and teardown
- WebSocket connection fragility
- Requires debug/profile mode (not release)
- Service extension API is not stable (may change between Flutter versions)

## Hybrid Architecture: When to Combine

For comprehensive testing of complex Flutter applications, combine approaches:

```
┌─────────────────────────────────────────────┐
│              CI/CD Pipeline                  │
│                                              │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐ │
│  │ Widget   │  │ integration│  │ vm_service│ │
│  │ Tests    │  │ _test     │  │ Bridge    │ │
│  │ (off-dev)│  │ (on-device)│  │ (hybrid)  │ │
│  └────┬─────┘  └─────┬─────┘  └─────┬─────┘ │
│       │              │               │       │
│       ▼              ▼               ▼       │
│  ┌───────────────────────────────────────┐   │
│  │         Test Results Aggregator       │   │
│  │         (JSON / JUnit XML / SARIF)    │   │
│  └───────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

## Troubleshooting

### Test Hangs (integration_test)

1. Check for infinite animations — use `tester.pump(Duration(...))` instead of `pumpAndSettle`
2. Verify platform channels don't call back into test code (use `addTearDown` for cleanup)
3. Enable timeline tracing to identify the stuck operation

### Widget Not Found

1. Dump the widget tree: `debugPrint(tester.binding.renderViewElement.toStringDeep())`
2. Dump the semantics tree: see `references/semantics-tree.md`
3. Check widget is actually in the tree — `pump` may not have built it yet
4. Verify finder criteria — `find.text('hello')` is case-sensitive

### VM Service Connection Refused

1. Ensure app was launched with `--debug` flag
2. Check port availability: `lsof -i :<port>`
3. Verify firewall rules allow WebSocket connections
4. On Android emulator, use port forwarding: `adb forward tcp:8181 tcp:8181`

### Semantics Tree Empty

1. Call `tester.ensureSemantics()` or `WidgetTester.ensureSemantics()`
2. Some widgets (like `CustomPaint`) don't generate semantics nodes by default
3. `ExcludeSemantics` widget wraps the target — remove it
