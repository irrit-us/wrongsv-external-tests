# Widget and Unit Testing Reference

## Overview

Flutter's `flutter_test` package provides `WidgetTester` and associated `Finder`/`Matcher` APIs for headless widget and unit testing. This is the fastest, most stable layer — no device required, no VM service connection needed.

## Quick Setup

```dart
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('counter increments on tap', (WidgetTester tester) async {
    await tester.pumpWidget(const MyApp());
    expect(find.text('0'), findsOneWidget);
    await tester.tap(find.byIcon(Icons.add));
    await tester.pump();
    expect(find.text('1'), findsOneWidget);
  });
}
```

## Key APIs

### WidgetTester

| Method | Purpose |
|--------|---------|
| `pumpWidget(widget)` | Mount a widget tree for testing |
| `pump([duration])` | Advance the clock and rebuild |
| `pumpAndSettle()` | Pump repeatedly until no pending frames |
| `tap(finder)` | Simulate a tap on the found widget |
| `longPress(finder)` | Simulate a long press |
| `fling(finder, offset, speed)` | Simulate a scroll/drag |
| `enterText(finder, text)` | Enter text into a TextField |
| `drag(finder, offset)` | Drag a widget by an offset |
| `ensureSemantics()` | Enable the semantics tree |

### Finders

| Finder | Purpose |
|--------|---------|
| `find.text('text')` | Find Text widget with matching string |
| `find.byKey(const ValueKey('key'))` | Find widget by key |
| `find.byType(WidgetType)` | Find widget by runtime type |
| `find.byIcon(Icons.add)` | Find Icon with matching icon data |
| `find.byTooltip('tooltip')` | Find widget with matching tooltip |
| `find.bySemanticsLabel('label')` | Find by accessibility label |
| `find.bySemanticsLabel(RegExp(...))` | Find by accessibility label pattern |
| `find.ancestor(of: finder, matching: finder2)` | Find ancestor matching criteria |
| `find.descendant(of: finder, matching: finder2)` | Find descendant matching criteria |
| `find.widgetWithText(WidgetType, 'text')` | Find widget of type containing text |

### Matchers

| Matcher | Purpose |
|---------|---------|
| `findsOneWidget` | Exactly one widget found |
| `findsNothing` | No widgets found |
| `findsNWidgets(n)` | Exactly n widgets found |
| `findsAtLeastNWidgets(n)` | At least n widgets found |
| `findsWidgets` | Any number > 0 found |

## Testing Patterns

### Testing Async Operations

```dart
testWidgets('loads data on button press', (WidgetTester tester) async {
  await tester.pumpWidget(MyApp());

  await tester.tap(find.text('Load'));
  // Don't pumpAndSettle if you have a FutureBuilder
  await tester.pump();
  // Let the future complete
  await tester.pump(const Duration(seconds: 1));

  expect(find.text('Loaded!'), findsOneWidget);
});
```

### Testing Navigation

```dart
testWidgets('navigates to detail page', (WidgetTester tester) async {
  await tester.pumpWidget(MaterialApp(
    home: HomePage(),
    routes: {'/detail': (_) => DetailPage()},
  ));

  await tester.tap(find.text('View Details'));
  await tester.pumpAndSettle();

  expect(find.text('Detail Page'), findsOneWidget);
});
```

### Testing Platform Channel Calls

```dart
testWidgets('handles platform channel data', (WidgetTester tester) async {
  // Set up a mock platform channel
  const channel = MethodChannel('com.example/data');
  channel.setMockMethodCallHandler((call) async {
    if (call.method == 'getData') return {'key': 'value'};
    return null;
  });

  await tester.pumpWidget(MyApp());
  await tester.pumpAndSettle();

  expect(find.text('value'), findsOneWidget);
});
```

### Testing with Mock Data

```dart
testWidgets('displays user list', (WidgetTester tester) async {
  // Provide mock data via a testable service
  final mockService = MockUserService();
  when(mockService.getUsers()).thenAnswer((_) async => [
    const User(id: 1, name: 'Alice'),
    const User(id: 2, name: 'Bob'),
  ]);

  await tester.pumpWidget(
    MaterialApp(home: UserListPage(userService: mockService)),
  );
  await tester.pumpAndSettle();

  expect(find.text('Alice'), findsOneWidget);
  expect(find.text('Bob'), findsOneWidget);
});
```

## Performance Notes

- **pumpAndSettle is expensive**: It pumps every animation frame. For tests after an action, use `pump()` or `pump(Duration(milliseconds: 500))` if you know the exact frame count.
- **Batch widget construction**: `pumpWidget` is slow; group related tests that use the same widget tree into a shared setup.
- **Renderer reuse**: The test binding reuses the renderer; ensure cleanup in `tearDown`.

## Common Pitfalls

- **pumpAndSettle never settles**: Check for infinite animations (e.g., CircularProgressIndicator). Use `pump(Duration(seconds: 1))` instead.
- **TextField not found after enterText**: You may need an extra `pump()` after `enterText` for the state to update.
- **Widget tree not rebuilt**: If state changes in a callback, ensure the widget tree is invalidated (setState, ValueNotifier, etc.).
- **Navigation stack inconsistency**: Use `MaterialApp` with named routes or a Navigator in the test tree.
