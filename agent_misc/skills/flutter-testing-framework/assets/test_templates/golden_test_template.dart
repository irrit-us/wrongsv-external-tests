// golden_test_template.dart
//
// Template for Flutter golden file (visual regression) tests.
// Follows Flutter SDK conventions:
//   - Wrap widget in RepaintBoundary to control image dimensions
//   - Use standard naming: testFileName.subtestName.variant.png
//   - Load fonts in flutter_test_config.dart
//
// See: references/golden-testing.md

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('Golden Tests', () {
    testWidgets('default state renders correctly', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: RepaintBoundary(
            child: SizedBox(
              width: 200,
              height: 100,
              child: MyWidget(), // ← Replace with your widget
            ),
          ),
        ),
      );

      await expectLater(
        find.byType(RepaintBoundary),
        matchesGoldenFile('golden_test_template.default.light.png'),
      );
    });

    testWidgets('pressed state renders correctly', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: RepaintBoundary(
            child: SizedBox(
              width: 200,
              height: 100,
              child: MyWidget(isPressed: true), // ← Replace
            ),
          ),
        ),
      );

      await expectLater(
        find.byType(RepaintBoundary),
        matchesGoldenFile('golden_test_template.pressed.light.png'),
      );
    });

    testWidgets('dark theme renders correctly', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          themeMode: ThemeMode.dark,
          theme: ThemeData.dark(),
          home: const RepaintBoundary(
            child: SizedBox(
              width: 200,
              height: 100,
              child: MyWidget(), // ← Replace
            ),
          ),
        ),
      );

      await expectLater(
        find.byType(RepaintBoundary),
        matchesGoldenFile('golden_test_template.default.dark.png'),
      );
    });
  });
}

// Replace with your actual widget under test
class MyWidget extends StatelessWidget {
  final bool isPressed;
  const MyWidget({super.key, this.isPressed = false});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: isPressed ? Colors.blue.shade700 : Colors.blue,
        borderRadius: BorderRadius.circular(8),
      ),
      child: const Center(child: Text('Hello', style: TextStyle(color: Colors.white))),
    );
  }
}
