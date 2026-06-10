# integration_test Package Reference

## Overview

`package:integration_test` is the official successor to the deprecated `FlutterDriver`. It packages tests into the app binary and runs them on-device, providing access to real platform channels, gestures, and performance characteristics.

**Key difference from FlutterDriver**: Tests run *inside* the Flutter app isolate, not over a WebSocket connection. This gives direct access to widget state but loses the ability to remotely observe/corrupt test execution.

## Setup

### pubspec.yaml

```yaml
dev_dependencies:
  integration_test:
    sdk: flutter
  flutter_test:
    sdk: flutter
```

### Test File Structure

```
integration_test/
├── app_test.dart           # Tests to run on-device
└── foo_feature_test.dart

test_driver/
└── integration_driver.dart # Entry point that launches the test app
```

### Driver Entry Point

```dart
// test_driver/integration_driver.dart
import 'package:integration_test/integration_test_driver.dart';

Future<void> main() async {
  await integrationDriver();
}
```

### Test Example

```dart
// integration_test/app_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('can tap button and see result', (WidgetTester tester) async {
    await tester.pumpWidget(MyApp());

    // Find the button
    final button = find.text('Tap me');
    expect(button, findsOneWidget);

    // Tap it
    await tester.tap(button);
    await tester.pumpAndSettle();

    // Verify result
    expect(find.text('Tapped!'), findsOneWidget);
  });
}
```

## Bindings

There are three bindings for different environments:

| Binding | Environment | Purpose |
|---------|-------------|---------|
| `IntegrationTestWidgetsFlutterBinding` | Real device/emulator | On-device tests with real gestures |
| `TestWidgetsFlutterBinding` | Desktop (headless) | Fast, headless widget tests |
| `LiveTestWidgetsFlutterBinding` | Desktop (with window) | Interactive debugging with visible window |

```dart
// Choose binding based on environment:
void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  // binding is now available for custom configuration
}
```

## Reporting

### Native Test Result Reporting

The `integration_test` package can report results back to the native test runner:

```dart
// Enable native reporting for CI integration
Future<void> main() async {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  // Results are sent back via platform channel
}
```

Running with native integration:
```bash
# Android
flutter test integration_test --device-id=<device>

# iOS
flutter test integration_test --device-id=<device>
```

### Custom Result Collection

For external test harness integration, override the default reporting:

```dart
import 'package:integration_test/integration_test.dart';

class JsonReportingTestBinding extends IntegrationTestWidgetsFlutterBinding {
  final List<Map<String, dynamic>> results = [];

  @override
  void reportTestResult(TestResult result) {
    results.add({
      'testName': result.testName,
      'passed': result.passed,
      'duration': result.duration.inMilliseconds,
      'failureDetails': result.failureDetails,
    });
    super.reportTestResult(result);
  }
}
```

## Performance Response Measurement

```dart
testWidgets('scrolling is smooth', (WidgetTester tester) async {
  await tester.pumpWidget(MyApp());

  // Bind frame timing callback
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  final frameTimes = <FrameTiming>[];
  binding.watchPerformance((timings) {
    frameTimes.addAll(timings);
  });

  // Perform the scroll action
  await tester.fling(
    find.byType(ListView),
    const Offset(0, -500),
    1000,
  );
  await tester.pumpAndSettle();

  // Analyze frame timings
  final avgBuildTime = frameTimes
      .map((t) => t.buildDuration.inMicroseconds)
      .reduce((a, b) => a + b) / frameTimes.length;

  expect(avgBuildTime, lessThan(16000)); // <16ms per frame
});
```

## Migration from FlutterDriver

| FlutterDriver | integration_test |
|---------------|-----------------|
| `FlutterDriver.connect()` | `IntegrationTestWidgetsFlutterBinding.ensureInitialized()` |
| `driver.tap(find.byValueKey('key'))` | `await tester.tap(find.byKey(const ValueKey('key')))` |
| `driver.getText(find.byValueKey('key'))` | `tester.widget<Text>(find.byKey(...)).data` |
| `driver.waitFor(find.byType('Foo'))` | `expect(find.byType(Foo), findsOneWidget)` |
| `driver.screenshot()` | `await tester.binding.takeScreenshot('name')` |

## Performance Tracing with traceAction

Source: `IntegrationTestWidgetsFlutterBinding` API

```dart
testWidgets('operation meets frame budget', (tester) async {
  final timeline = await tester.binding.traceAction(() async {
    await tester.tap(find.byKey(const ValueKey('heavy_button')));
    await tester.pumpAndSettle();
  });

  // timeline contains FrameTiming summaries
  final summary = timeline.summary;
  expect(summary.averageFrameBuildTimeMs, lessThan(8));
  expect(summary.averageFrameRasterizerTimeMs, lessThan(8));
  expect(summary.missedFrameBuildBudgetCount, equals(0));
  expect(summary.missedFrameRasterizerBudgetCount, equals(0));
});
```

## Multi-Device Testing (Orchestrated)

Source: [Encointer production pattern](https://github.com/encointer/encointer-wallet-flutter/issues/1946)

When two devices must interact (e.g., QR payment, NFC, BLE):

1. **Device A** writes shared state via `binding.reportData`:
   ```dart
   binding.reportData = {'qrPayload': base64Encode(qrImageBytes)};
   ```

2. **Custom driver** reads `reportData` and persists to disk:
   ```dart
   // In test_driver/multi_device_driver.dart
   Future<void> main() async {
     final response = await integrationDriver(
       onScreenshot: (name, bytes) async {
         // Write received payload to shared file
         return true;
       },
     );
   }
   ```

3. **Orchestrator** feeds data to Device B:
   ```bash
   PAYLOAD=$(cat build/payload.b64) flutter drive \
     --target=integration_test/stories/device_b_test.dart \
     --dart-define=PAYLOAD=$PAYLOAD
   ```

## Common Pitfalls

- **`pumpAndSettle` timeouts**: Use specific `pump()` with duration or wrap in timeouts for animations
- **Binding initialization order**: `IntegrationTestWidgetsFlutterBinding.ensureInitialized()` must be called before `testWidgets`
- **Platform channel stubs**: On-device tests use real platform channels; mock them with `TestDefaultBinaryMessengerBinding` if needed
- **Font/asset loading**: On-device integration tests load real assets; ensure they're declared in pubspec.yaml
- **Multiple test files**: Each integration test file is a separate app launch; group related tests
- **`reportData` race**: On Android, call `convertFlutterSurfaceToImage()` before `takeScreenshot`
- **`traceAction` requires on-device**: Performance tracing only works on physical devices/emulators, not headless
