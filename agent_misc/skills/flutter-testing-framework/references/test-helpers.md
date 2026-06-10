# Reusable Test Helpers

Source: Encointer wallet production patterns, Flutter community conventions

## Helper Library Organization

```
integration_test/
└── helpers/
    ├── wait_helpers.dart        # Polling waitForWidget, waitForAbsent
    ├── scroll_helpers.dart      # scrollUntilVisible, scrollToTop
    ├── screenshot_helpers.dart  # takeScreenshot, screenshotOnFailure
    ├── interaction_helpers.dart # safeTap, safeEnterText
    └── app_launcher.dart        # Shared app bootstrap + config
```

## wait_helpers.dart

```dart
import 'package:flutter_test/flutter_test.dart';

/// Polls until [finder] matches at least one widget or [timeout] expires.
Future<void> waitForWidget(
  WidgetTester tester,
  Finder finder, {
  Duration timeout = const Duration(seconds: 30),
  Duration pumpInterval = const Duration(milliseconds: 100),
}) async {
  final end = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(end)) {
    await tester.pump(pumpInterval);
    if (finder.evaluate().isNotEmpty) return;
  }
  expect(finder, findsOneWidget, reason: 'waitForWidget timed out after $timeout');
}

/// Polls until [finder] matches zero widgets or [timeout] expires.
Future<void> waitForAbsent(
  WidgetTester tester,
  Finder finder, {
  Duration timeout = const Duration(seconds: 30),
  Duration pumpInterval = const Duration(milliseconds: 100),
}) async {
  final end = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(end)) {
    await tester.pump(pumpInterval);
    if (finder.evaluate().isEmpty) return;
  }
  expect(finder, findsNothing, reason: 'waitForAbsent timed out after $timeout');
}

/// Pumps until no pending frames or [timeout] expires — safer than pumpAndSettle.
Future<void> pumpUntilStable(
  WidgetTester tester, {
  Duration timeout = const Duration(seconds: 10),
  int maxPumps = 200,
}) async {
  final end = DateTime.now().add(timeout);
  int pumps = 0;
  while (DateTime.now().isBefore(end) && pumps < maxPumps) {
    await tester.pump(const Duration(milliseconds: 16));
    pumps++;
    if (tester.binding.hasScheduledFrame) continue;
    if (tester.binding.framesPending) continue;
    break;
  }
}
```

## scroll_helpers.dart

```dart
import 'package:flutter_test/flutter_test.dart';

/// Drags [scrollable] by [dy] each pump until [item] is visible.
Future<void> scrollUntilVisible(
  WidgetTester tester,
  Finder scrollable,
  Finder item, {
  double dy = -150,
  Duration timeout = const Duration(seconds: 30),
  Duration pumpInterval = const Duration(milliseconds: 100),
}) async {
  final end = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(end)) {
    if (item.evaluate().isNotEmpty) return;
    await tester.drag(scrollable, Offset(0, dy));
    await tester.pump(pumpInterval);
  }
  expect(item, findsOneWidget, reason: 'scrollUntilVisible timed out after $timeout');
}

/// Scrolls to the top of a scrollable list.
Future<void> scrollToTop(
  WidgetTester tester,
  Finder scrollable, {
  int maxScrolls = 20,
}) async {
  for (int i = 0; i < maxScrolls; i++) {
    await tester.drag(scrollable, const Offset(0, 500));
    await tester.pump(const Duration(milliseconds: 100));
  }
}
```

## interaction_helpers.dart

```dart
import 'package:flutter_test/flutter_test.dart';

/// Taps [finder] after confirming it is visible and tappable.
Future<void> safeTap(
  WidgetTester tester,
  Finder finder, {
  bool warnIfAbsent = true,
}) async {
  await tester.ensureVisible(finder);
  await tester.pump(const Duration(milliseconds: 300));
  expect(finder, findsOneWidget);
  await tester.tap(finder);
  await tester.pump(const Duration(milliseconds: 100));
}

/// Enters text into [finder] after confirming it exists.
Future<void> safeEnterText(
  WidgetTester tester,
  Finder finder,
  String text,
) async {
  expect(finder, findsOneWidget);
  await tester.ensureVisible(finder);
  await tester.pump(const Duration(milliseconds: 300));
  await tester.enterText(finder, text);
  await tester.pump(const Duration(milliseconds: 100));
}
```

## screenshot_helpers.dart

```dart
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

/// Takes a screenshot and writes it to a file.
Future<void> takeScreenshot(
  WidgetTester tester,
  String name, {
  String directory = 'test_artifacts/screenshots',
}) async {
  final dir = Directory(directory);
  if (!dir.existsSync()) dir.createSync(recursive: true);

  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  final bytes = await binding.takeScreenshot(name);
  if (bytes != null) {
    await File('$directory/$name.png').writeAsBytes(bytes);
  }
}

/// Wraps a test action to screenshot on failure.
Future<void> withScreenshotOnFailure(
  WidgetTester tester,
  String screenshotName,
  Future<void> Function() action,
) async {
  try {
    await action();
  } catch (e) {
    await takeScreenshot(tester, '${screenshotName}_failure');
    rethrow;
  }
}
```

## app_launcher.dart

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

/// Call this once before any integration test.
Future<void> bootstrapApp({
  bool useMocks = false,
  String environment = 'test',
}) async {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  // Pass environment config via dart-define:
  // const isMock = bool.fromEnvironment('USE_MOCKS', defaultValue: false);

  // If using Sentry or similar in production, disable in tests
  // await Sentry.close();
}
```

## Usage Example

```dart
import '../helpers/wait_helpers.dart';
import '../helpers/scroll_helpers.dart';
import '../helpers/interaction_helpers.dart';
import '../helpers/app_launcher.dart';

void main() {
  setUp(() async {
    await bootstrapApp();
  });

  testWidgets('can scroll to and tap the last item', (tester) async {
    final listView = find.byType(ListView);
    final lastItem = find.text('Item 99');

    await scrollUntilVisible(tester, listView, lastItem);
    await safeTap(tester, lastItem);
  });
}
```
