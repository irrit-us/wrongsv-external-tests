---
name: flutter-testing-framework
description: "Select and apply Flutter testing approaches across a four-layer architecture: flutter_test (headless widgets), integration_test (on-device), vm_service (Dart VM debug introspection), and SemanticsTree (accessibility widget location) — plus golden file visual regression (matchesGoldenFile) and WCAG 2.2 accessibility compliance (meetsGuideline). Use this skill when you need to: add or refactor Flutter test infrastructure, migrate from FlutterDriver, integrate Flutter test/debug output into external test harnesses (Python, JS, CI), set up golden file baselines, audit accessibility, build custom test runners, or orchestrate multi-device Flutter test scenarios. TRIGGER on any Flutter testing task beyond a trivial single-file widget test."
---
# Flutter Testing Framework — Four-Layer Architecture

Use four test layers — from headless widget tests to visual regression to VM-level introspection — grounded in Flutter's own conventions, the Dart VM Service Protocol (v4.16), WCAG 2.2, and production patterns from Encointer and the Flutter SDK.

## Quick Start

**Most common path**: Setting up or modifying tests for a real Flutter project.

1. Identify the layer from the decision tree below
2. Read the referenced file for detailed patterns, APIs, and pitfalls
3. Use the templates in `assets/test_templates/` as starting points
4. Wire into CI with `scripts/test_runner.sh` or `scripts/convert_to_junit.py`

For a **new project with standard test coverage**:

```bash
# 1. Create test directory structure (see Standard Project Structure below)
# 2. Copy flutter_test_config.dart from assets/test_templates/ into test/
# 3. Write widget tests (L0) → copy widget_unit_test_template from references/
# 4. Add integration tests (L1) if you need on-device execution
# 5. Add golden tests (L4) if you need visual regression
# 6. Add accessibility tests (L4) if WCAG 2.2 compliance matters
# 7. Wire into CI: ./scripts/test_runner.sh --all
```

## Requirements

| Dependency | Version | Purpose |
|-----------|---------|---------|
| Flutter SDK | ≥3.x (stable) | `flutter_test`, `integration_test`, goldens, accessibility |
| Dart SDK | ≥3.x | `package:vm_service`, semantic tree, debugging |
| `websockets` (Python) | ≥10.0 | `flutter_debug_bridge.py` — VM service WebSocket connection |
| `package:vm_service` | latest | Dart-side VM service client |
| `package:integration_test` | SDK | On-device integration testing |
| Device/emulator | — | Required for L1 integration tests and L4 accessibility audits |

## Decision Tree

When you encounter a Flutter testing task, use this tree. **For simple tasks** (e.g., "what's the golden file naming convention?"), the line item below IS the answer — don't read the full reference. **Read the full reference file only when you need APIs, complete patterns, or troubleshooting.**

```
TASK: Adding or modifying Flutter tests
  → Does the test require on-device execution (gestures, platform channels)?
    YES → Read references/integration-test.md
    NO  → Read references/widget-unit-testing.md

TASK: Inspecting Flutter app internals at runtime (state, isolates, memory)
  → Read references/vm-service-protocol.md

TASK: Locating widgets without keys or semantic labels
  → Read references/semantics-tree.md

TASK: Integrating Flutter test output into an external (non-Dart) test harness
  → Read references/external-integration.md

TASK: Profiling / performance regression testing
  → Read references/vm-service-protocol.md (Timeline API + traceAction sections)

TASK: Choosing between integration_test and a custom vm_service approach
  → Read references/flutter-testing-architecture.md (comparison matrix)

TASK: Debugging a Flutter test that hangs or times out
  → Read references/vm-service-protocol.md (isolate debugging section)
  → Then Read references/flutter-testing-architecture.md (troubleshooting section)

TASK: Migrating from FlutterDriver to integration_test
  → Read references/flutter-driver-migration.md

TASK: Setting up golden file (visual regression) testing
  → Read references/golden-testing.md

TASK: Auditing or implementing accessibility compliance (WCAG 2.2)
  → Read references/accessibility-testing.md

TASK: Setting up multi-device or orchestrated integration tests
  → Read references/integration-test.md (multi-device patterns section)
  → Then Read references/external-integration.md (orchestration section)

TASK: Writing reusable test helpers for a Flutter project
  → Read references/test-helpers.md
```

## Four-Layer Architecture

```
Layer 4: Golden & Accessibility  ←  visual regression + WCAG 2.2 compliance
Layer 3: SemanticsTree           ←  accessibility-backed widget location
Layer 2: vm_service               ←  Dart VM introspection, Timeline, isolate control
Layer 1: integration_test         ←  on-device lifecycle, native gestures, channels
Layer 0: flutter_test             ←  headless widget + unit testing (foundation)
```

| Layer | Package | Key API |
|-------|---------|---------|
| **L0 — flutter_test** | `package:flutter_test` | `WidgetTester`, `Finder`, `matchesGoldenFile`, `meetsGuideline` |
| **L1 — integration_test** | `package:integration_test` | `IntegrationTestWidgetsFlutterBinding`, `traceAction`, `reportData` |
| **L2 — vm_service** | `package:vm_service` | `VmService`, `callServiceExtension`, `evaluate`, `getVMTimeline` |
| **L3 — SemanticsTree** | `package:flutter/semantics.dart` | `SemanticsNode`, `SemanticsOwner`, `tester.getSemantics()` |
| **L4 — Golden & A11y** | `matchesGoldenFile`, `meetsGuideline` | Visual baselines, contrast ratios, tap-target minimums |

## Approach Selection Quick Reference

| Scenario | Recommended Approach | Ref |
|----------|---------------------|-----|
| Standard widget tests | `flutter_test` with `WidgetTester` | widget-unit-testing.md |
| On-device integration tests | `integration_test` with `IntegrationTestWidgetsFlutterBinding` | integration-test.md |
| Golden file (visual regression) | `matchesGoldenFile` + `RepaintBoundary` | golden-testing.md |
| Accessibility audit (WCAG 2.2) | `meetsGuideline` + `tester.getSemantics` | accessibility-testing.md |
| Custom test runner with VM introspection | Direct `vm_service` WebSocket connection | vm-service-protocol.md |
| Widget location without semantic labels | Semantics tree traversal + `find.byElement` | semantics-tree.md |
| External (Python/JS) test harness | VM service bridge + JSON-RPC relay | external-integration.md |
| CI/CD with Flutter test result aggregation | `flutter test --machine` + post-processor | external-integration.md |
| FlutterDriver → integration_test migration | `IntegrationTestWidgetsFlutterBinding` + helpers | flutter-driver-migration.md |
| Multi-device orchestrated testing | `binding.reportData` + `--dart-define` + shell script | integration-test.md |

## Standard Project Structure

```
project/
├── test/                            # L0 — Unit + widget tests
│   ├── flutter_test_config.dart     # Global setup (fonts, comparators)
│   └── **/*_test.dart               # Split by concern (see below)
├── goldens/                         # Golden file baseline images
│   └── *.png
├── integration_test/                # L1 — On-device integration tests
│   ├── app_test.dart
│   ├── helpers/                     # Reusable helpers
│   │   ├── wait_helpers.dart
│   │   └── scroll_helpers.dart
│   └── stories/                     # User-story-based test sequences
│       └── *_test.dart
├── test_driver/                     # Integration test driver
│   └── integration_driver.dart      # 3-line entry: integrationDriver()
├── debug_bridge/                    # L2 — Custom VM service tools
│   ├── bridge.py
│   └── semantics_dump.dart
└── ci/
    ├── flutter_test_runner.sh       # CI entry point
    └── scripts/                     # Multi-device orchestrators
        └── run_multi_device_story.sh
```

## Test File Organization

Split tests by concern — the Flutter repo's own standard. Within each file, use the standard group names:

```dart
group('Accessibility Tests', () { ... });
group('Content Tests', () { ... });
group('Dimensions Tests', () { ... });
group('Styling Tests', () { ... });
group('Interaction Tests', () { ... });
group('Golden Tests', () { ... });
group('Performance Tests', () { ... });
```

```
test/
├── my_widget_test.dart              # Monolithic (legacy — avoid)
├── my_widget_layout_test.dart       # Size, constraints, positioning
├── my_widget_semantics_test.dart    # Accessibility labels, roles, states
├── my_widget_interaction_test.dart  # Tap, scroll, drag behavior
├── my_widget_golden_test.dart       # Visual regression baselines
├── my_widget_performance_test.dart  # Frame timing, animation smoothness
└── flutter_test_config.dart         # Global setup (fonts, comparators)
```

## Domain Quick References

These brief summaries cover common lookups. For full API details, patterns, and pitfalls, read the referenced file.

### VM Service Protocol

Authoritative spec: [Dart VM Service Protocol v4.16](https://github.com/dart-lang/sdk/blob/main/runtime/vm/service/service.md). Categories: Execution (`pause`, `resume`, `kill`), Breakpoints (`addBreakpoint*`, `removeBreakpoint`), Evaluation (`evaluate`, `evaluateInFrame`), Inspection (`getVM`, `getIsolate`, `getObject`, `getStack`), Memory (`getMemoryUsage`, `getAllocationProfile`), Timeline (`getVMTimeline`, `setVMTimelineFlags`), Streams (10 stream IDs including `Isolate`, `Debug`, `Timeline`), Extensions (`callServiceExtension` — used for Flutter's `ext.flutter.*` methods). **Full reference**: `references/vm-service-protocol.md`

### Golden File Testing

Conventions from [Flutter golden file wiki](https://github.com/flutter/flutter/wiki/Writing-a-golden-file-test-for-package:flutter): Name files `testName.subtestName.variant.png`. Wrap widgets in `RepaintBoundary` — golden images capture the render tree from the first `RepaintBoundary` upward, so without it a golden test captures the entire app shell, making it fragile to unrelated UI changes. Load fonts in `flutter_test_config.dart` to prevent cross-platform drift. Use `TolerantComparator` for rendering variance. Auto-update on main with `flutter test --update-goldens`. **Full reference**: `references/golden-testing.md`

### Accessibility (WCAG 2.2)

Use `tester.ensureSemantics()` before every accessibility check — Flutter disables the semantics tree by default because building it has a non-trivial cost. The four `meetsGuideline` matchers cover tap-target minimums (Android ≥48×48dp, iOS ≥44×44pt per WCAG 2.5.5), label requirements (WCAG 1.1.1), and contrast ratios (≥4.5:1 normal, ≥3:1 large per WCAG 1.4.3). **Full reference**: `references/accessibility-testing.md`

### FlutterDriver → integration_test Migration

FlutterDriver is deprecated. The fundamental difference: integration_test runs inside the app isolate (direct widget access, no WebSocket), while FlutterDriver ran over a remote connection. Key translations: `driver.tap(...)` → `tester.tap(...)` + `pumpAndSettle()`, `driver.waitFor(...)` → custom `waitForWidget(...)` helper (because `pumpAndSettle` does not replace FlutterDriver's explicit wait), `driver.screenshot()` → `tester.binding.takeScreenshot(...)`. **Full reference**: `references/flutter-driver-migration.md`

### Multi-Device Orchestration

The pattern: Device A writes shared state via `binding.reportData`, a custom driver persists it to disk, the orchestrator feeds it to Device B via `--dart-define`. See the shell example in `references/integration-test.md` (multi-device section).

## Scripts

- **`flutter_debug_bridge.py`** — Python VM service bridge (WebSocket JSON-RPC, semantics dump, test collection)
- **`semantics_tree_dump.dart`** — In-app Dart utility for full semantics tree JSON serialization
- **`test_runner.sh`** — Shell entry for CI/local/bridge modes
- **`convert_to_junit.py`** — Transform `flutter test --machine` JSON-Lines output to JUnit XML

## Sources of Truth

| Source | What It Provides |
|--------|-----------------|
| [Flutter testing docs](https://github.com/flutter/flutter/blob/master/docs/contributing/testing/Running-and-writing-tests.md) | Test file conventions, golden file standards, test grouping |
| [Dart VM Service Protocol spec](https://github.com/dart-lang/sdk/blob/main/runtime/vm/service/service.md) | Authoritative RPC methods, stream IDs, error codes |
| [Encointer wallet](https://github.com/encointer/encointer-wallet-flutter/issues/1946) | Production migration path, helpers, multi-device orchestration |
| [Flutter accessibility testing](https://docs.flutter.dev/ui/accessibility/accessibility-testing) | `meetsGuideline` API, WCAG 2.2 mapping |
| [Zeta Design System](https://design.zebra.com/docs/Development/Guides/writing-tests/) | Standard test group taxonomy |

## When NOT to Use This Skill

- Pure Dart/Flutter library development without testing (use standard `flutter test`)
- Non-Flutter mobile testing (use Appium, XCUITest, Espresso)
- Simple widget tests that don't require VM introspection, golden files, or accessibility auditing
- Projects that haven't adopted Flutter at all

## Common Failure Patterns

Each of these patterns causes hard-to-diagnose failures. The fix is understanding **why** they happen.

- **Recommending FlutterDriver for new projects** — FlutterDriver runs tests over a WebSocket connection external to the app isolate, which means it cannot access widget state directly and has been officially deprecated in favor of `integration_test`, which packages tests into the app binary itself.
- **Missing WebSocket reconnection logic** — VM service connections drop when the app restarts, an isolate dies, or the device changes network state. Without reconnection handling with exponential backoff, test harnesses hang indefinitely.
- **Traversing the entire semantics tree without filtering** — a full Flutter app semantics tree can contain thousands of nodes. Unfiltered traversal is O(n) per lookup; use `find.bySemanticsLabel` or `tester.getSemantics(finder)` to scope the search.
- **Hardcoding VM service ports** — in CI or multi-device setups, the VM service port is dynamically assigned. Hardcoding it causes port conflicts; instead, parse the URI from device output or use `--host-vmservice-port` with a known port.
- **Skipping platform channel test doubles** — integration_test uses real platform channels on-device, but widget tests run without platform code. Without `TestDefaultBinaryMessengerBinding`, platform channel calls throw `MissingPluginException`.
- **Committing stale golden files** — a golden file that passes CI but doesn't reflect the current UI is worse than no golden file at all. Automate updates on main branch merge with `flutter test --update-goldens`.
- **Testing accessibility without `ensureSemantics()`** — Flutter does not build the semantics tree by default because it adds measurable overhead. Without calling `tester.ensureSemantics()`, all `meetsGuideline` checks operate on an empty tree and silently pass.
- **Using monolithic test files** — a single `my_widget_test.dart` with 50+ `testWidgets` calls makes it unclear which test covers which concern. Splitting by concern (layout, semantics, interaction, golden, performance) makes test failures immediately diagnostic.
