# FlutterDriver → integration_test Migration Guide

Source: [Encointer migration blueprint](https://github.com/encointer/encointer-wallet-flutter/issues/1946) + Flutter SDK deprecation timeline

## Why Migrate

FlutterDriver is **deprecated and unmaintained**. It communicates via JSON-RPC over WebSocket, keeping test and app code in separate isolates — a model that is fragile, slow, and incompatible with modern Flutter tooling. `integration_test` runs tests **in the same isolate** as the app, giving direct access to widget state, services, and settings.

## Conceptual Shift

| Concept | FlutterDriver | integration_test |
|---------|---------------|-----------------|
| **Process model** | Test ↔ App (separate, WebSocket) | Test + App (same isolate) |
| **Widget access** | JSON-RPC (serialized commands) | Direct `WidgetTester` API |
| **App state** | Only via `requestData` | Direct property/method access |
| **Service calls** | `ext.flutter.driver` extension | Direct Dart function calls |
| **Performance** | Slower (serialization overhead) | Faster (in-process) |
| **Setup** | `enableFlutterDriverExtension()` | Remove it entirely |
| **Entry point** | `test_driver/app.dart` | `test_driver/integration_driver.dart` (3 lines) |

## Step-by-Step Migration

### Step 1: Update pubspec.yaml

```yaml
dev_dependencies:
  # Remove:
  # flutter_driver:
  #   sdk: flutter

  # Add:
  integration_test:
    sdk: flutter
  flutter_test:
    sdk: flutter
```

### Step 2: Remove FlutterDriver Extension

**Remove** from your app's main (or wherever it's called):
```dart
// DELETE: enableFlutterDriverExtension();
```

### Step 3: Create Integration Driver

```dart
// test_driver/integration_driver.dart
import 'package:integration_test/integration_test_driver.dart';

Future<void> main() async {
  await integrationDriver(
    timeout: const Duration(seconds: 60),
  );
}
```

### Step 4: Translate Finders

| FlutterDriver | integration_test |
|---------------|-----------------|
| `find.byValueKey('key')` | `find.byKey(const ValueKey('key'))` |
| `find.byTooltip('tip')` | `find.byTooltip('tip')` |
| `find.text('text')` | `find.text('text')` |
| `find.byType('Foo')` | `find.byType(Foo)` |
| `find.pageBack()` | No direct equivalent — use `BackButton` finder |
| `find.bySemanticsLabel('label')` | `find.bySemanticsLabel('label')` (same) |
| `find.ancestor(of: a, matching: b)` | `find.ancestor(of: a, matching: b)` (same) |
| `find.descendant(of: a, matching: b)` | `find.descendant(of: a, matching: b)` (same) |

### Step 5: Translate Actions

| FlutterDriver | integration_test |
|---------------|-----------------|
| `driver.tap(finder)` | `await tester.tap(finder)` + `await tester.pumpAndSettle()` |
| `driver.tap(finder, timeout: t)` | `await tester.tap(finder)` + `await tester.pump()` |
| `driver.waitFor(finder)` | `await waitForWidget(tester, finder)` (custom helper) |
| `driver.waitForAbsent(finder)` | `await waitForWidgetAbsent(tester, finder)` (custom helper) |
| `driver.scrollUntilVisible(scrollable, item)` | `await scrollUntilVisible(tester, scrollable, item)` (custom helper) |
| `driver.enterText('text')` | `await tester.enterText(finder, 'text')` |
| `driver.getText(finder)` | `tester.widget<Text>(finder).data` |
| `driver.screenshot()` | `await tester.binding.takeScreenshot('name')` |
| `driver.requestData(cmd)` | Direct call on service/state object |
| `driver.traceAction(fn, ...)` | `await tester.binding.traceAction(fn, ...)` |

### Step 6: Translate Service Calls

FlutterDriver's `requestData` disappears — call app services directly:

```dart
// BEFORE (FlutterDriver):
final response = await driver.requestData(TestCommand.devModeOn);

// AFTER (integration_test):
appSettings.toggleDeveloperMode();
```

## Essential Helpers

These helpers replace FlutterDriver convenience methods:

### waitForWidget

```dart
Future<void> waitForWidget(
  WidgetTester tester,
  Finder finder, {
  Duration timeout = const Duration(seconds: 30),
}) async {
  final end = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(end)) {
    await tester.pump(const Duration(milliseconds: 100));
    if (finder.evaluate().isNotEmpty) return;
  }
  expect(finder, findsOneWidget, reason: 'Timed out waiting for widget');
}
```

### scrollUntilVisible

```dart
Future<void> scrollUntilVisible(
  WidgetTester tester,
  Finder scrollable,
  Finder item, {
  double dy = -150,
  Duration timeout = const Duration(seconds: 30),
}) async {
  final end = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(end)) {
    if (item.evaluate().isNotEmpty) return;
    await tester.drag(scrollable, Offset(0, dy));
    await tester.pump(const Duration(milliseconds: 100));
  }
  expect(item, findsOneWidget, reason: 'Timed out scrolling to item');
}
```

## Multi-device Migration

FlutterDriver multi-device tests used parallel WebSocket connections. In `integration_test`:

1. Run Device A's test, collect data via `binding.reportData`:
   ```dart
   binding.reportData = {'qrPayload': qrImageBytes};
   ```

2. Custom driver reads `reportData` and writes to file:
   ```dart
   // test_driver/alice_qr_driver.dart
   Future<void> main() async {
     final response = await integrationDriver(
       onScreenshot: (name, bytes) async {
         // Extract QR payload from screenshot/reportData
         return true;
       },
     );
   }
   ```

3. Orchestrator feeds payload to Device B via `--dart-define`:
   ```bash
   QR_PAYLOAD=$(cat build/payload.b64) flutter drive \
     --target=integration_test/stories/bob_test.dart \
     --dart-define=QR_PAYLOAD=$QR_PAYLOAD
   ```

## Verification Checklist

- [ ] `enableFlutterDriverExtension()` removed from app
- [ ] `flutter_driver` removed from pubspec.yaml
- [ ] `integration_test` and `flutter_test` added to dev_dependencies
- [ ] All `find.byValueKey('x')` → `find.byKey(const ValueKey('x'))`
- [ ] All `driver.tap(...)` → `await tester.tap(...)` + `pumpAndSettle()`
- [ ] All `driver.requestData(...)` → direct service calls
- [ ] `waitForWidget` helper added for non-deterministic widgets
- [ ] `scrollUntilVisible` helper added for scroll-to-find patterns
- [ ] `test_driver/integration_driver.dart` created (3-line boilerplate)
- [ ] Tests pass with `flutter drive --driver=test_driver/integration_driver.dart --target=integration_test/...`
