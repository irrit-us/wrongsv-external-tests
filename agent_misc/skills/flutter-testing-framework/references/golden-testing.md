# Golden File (Visual Regression) Testing

Source: [Flutter golden file wiki](https://github.com/flutter/flutter/wiki/Writing-a-golden-file-test-for-package:flutter) + Flutter SDK conventions

## Core API

```dart
import 'package:flutter_test/flutter_test.dart';

testWidgets('my widget renders correctly', (tester) async {
  await tester.pumpWidget(
    RepaintBoundary(
      child: SizedBox(
        width: 200, height: 100,
        child: MyWidget(),
      ),
    ),
  );
  await expectLater(
    find.byType(RepaintBoundary),
    matchesGoldenFile('my_widget_test.default.png'),
  );
});
```

## Naming Convention

Format: `testFileName.subtestName.variant.png`

- The part before the first `.` must match the test filename (minus `_test.dart`)
- `subtestName` is unique per `testWidgets` entry
- `variant` is unique per screenshot within a `testWidgets` entry

```dart
// In my_widget_golden_test.dart:
matchesGoldenFile('my_widget_golden.default.light.png')
matchesGoldenFile('my_widget_golden.default.dark.png')
matchesGoldenFile('my_widget_golden.pressed.png')
```

## RepaintBoundary is Mandatory

Without `RepaintBoundary`, captured images default to **2400×1800** (800×600 viewport × 3.0 device pixel ratio). Always wrap the widget under test:

```dart
RepaintBoundary(
  child: SizedBox(
    width: targetWidth,
    height: targetHeight,
    child: MyWidget(),
  ),
)
```

## Font Loading (flutter_test_config.dart)

Custom fonts cause cross-platform golden drift. Load them globally:

```dart
// test/flutter_test_config.dart
import 'dart:async';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

Future<void> testExecutable(FutureOr<void> Function() testMain) async {
  setUpAll(() async {
    final fontLoader = FontLoader('Roboto')
      ..addFont(rootBundle.load('path/to/Roboto-Regular.ttf'));
    await fontLoader.load();
  });
  await testMain();
}
```

## Custom Comparator for Tolerance

Cross-platform rendering differences (GPU, anti-aliasing) require tolerance:

```dart
import 'package:flutter_test/flutter_test.dart';

class TolerantComparator extends LocalFileComparator {
  TolerantComparator(Uri testUri, {double tolerance = 0.01})
      : super(testUri, path: 'goldens');

  @override
  Future<bool> compare(Uint8List imageBytes, Uri golden) async {
    // Pixel-for-pixel comparison with tolerance
    // Return true if images match within tolerance
  }
}

void main() {
  setUpAll(() {
    goldenFileComparator = TolerantComparator(
      Uri.parse('goldens/'),
      tolerance: 0.01,
    );
  });
}
```

## Updating Golden Files

```bash
# Regenerate all golden files
flutter test --update-goldens test/

# Regenerate for a specific test file
flutter test --update-goldens test/my_widget_golden_test.dart
```

## CI Auto-Update Pattern

Source: Flutter CI conventions via GitHub Actions

```yaml
- name: Update goldens on main branch
  if: github.ref == 'refs/heads/main'
  run: flutter test --update-goldens test/

- name: Commit updated goldens
  uses: stefanzweifel/git-auto-commit-action@v5
  with:
    commit_message: 'chore: update golden test snapshots [skip ci]'
```

## Golden File Directory

```
project/
├── test/
│   └── my_widget_golden_test.dart
└── goldens/
    ├── my_widget_golden.default.light.png
    ├── my_widget_golden.default.dark.png
    └── my_widget_golden.pressed.png
```

## Common Pitfalls

- **Missing RepaintBoundary** → 2400×1800 image instead of widget-sized
- **Unloaded fonts** → Different glyphs across platforms, spurious failures
- **No tolerance comparator** → 1-pixel AA differences cause failures in CI
- **Stale goldens on branches** → Use `--update-goldens` on main merge
- **System theme leakage** → Tests inherit host theme; wrap in themed MaterialApp
- **Date/time in widget** → Use `Clock.fixed()` or mock time
