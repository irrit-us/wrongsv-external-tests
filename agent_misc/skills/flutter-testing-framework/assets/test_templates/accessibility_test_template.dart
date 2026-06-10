// accessibility_test_template.dart
//
// Template for Flutter accessibility compliance tests.
// Uses meetsGuideline() API for automated checks:
//   - androidTapTargetGuideline       (≥48×48dp, WCAG 2.5.5)
//   - iOSTapTargetGuideline           (≥44×44pt, WCAG 2.5.5)
//   - labeledTapTargetGuideline       (all tappable nodes labeled, WCAG 1.1.1)
//   - textContrastGuideline           (4.5:1 normal, 3:1 large, WCAG 1.4.3)
//
// See: references/accessibility-testing.md
//      https://docs.flutter.dev/ui/accessibility/accessibility-testing

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('Accessibility Tests', () {
    late SemanticsHandle semanticsHandle;

    setUp(() {
      // Ensure semantics are enabled before every accessibility test
    });

    tearDown(() {
      // Clean up the semantics handle if it was created
    });

    testWidgets('all tap targets meet Android minimum size (48×48dp)',
        (tester) async {
      semanticsHandle = tester.ensureSemantics();

      await tester.pumpWidget(
        const MaterialApp(home: MyAccessiblePage()), // ← Replace
      );

      await expectLater(
        tester,
        meetsGuideline(androidTapTargetGuideline),
      );

      semanticsHandle.dispose();
    });

    testWidgets('all tap targets meet iOS minimum size (44×44pt)',
        (tester) async {
      semanticsHandle = tester.ensureSemantics();

      await tester.pumpWidget(
        const MaterialApp(home: MyAccessiblePage()), // ← Replace
      );

      await expectLater(
        tester,
        meetsGuideline(iOSTapTargetGuideline),
      );

      semanticsHandle.dispose();
    });

    testWidgets('all tappable widgets have semantic labels',
        (tester) async {
      semanticsHandle = tester.ensureSemantics();

      await tester.pumpWidget(
        const MaterialApp(home: MyAccessiblePage()), // ← Replace
      );

      await expectLater(
        tester,
        meetsGuideline(labeledTapTargetGuideline),
      );

      semanticsHandle.dispose();
    });

    testWidgets('text contrast meets WCAG minimum (4.5:1)',
        (tester) async {
      semanticsHandle = tester.ensureSemantics();

      await tester.pumpWidget(
        const MaterialApp(home: MyAccessiblePage()), // ← Replace
      );

      await expectLater(
        tester,
        meetsGuideline(textContrastGuideline),
      );

      semanticsHandle.dispose();
    });

    testWidgets('buttons have correct semantic roles and labels',
        (tester) async {
      await tester.pumpWidget(
        const MaterialApp(home: MyAccessiblePage()), // ← Replace
      );
      await tester.ensureSemantics();

      // Verify individual widget semantics
      final submitButton = find.byKey(const ValueKey('submit_button'));
      final node = tester.getSemantics(submitButton);

      expect(node.label, isNotEmpty);
      expect(node.hasFlag(SemanticsFlag.isButton), isTrue);
      expect(node.hasAction(SemanticsAction.tap), isTrue);
    });

    testWidgets('images have semantic labels for screen readers',
        (tester) async {
      await tester.pumpWidget(
        const MaterialApp(home: MyAccessiblePage()), // ← Replace
      );
      await tester.ensureSemantics();

      // Images without labels are accessibility failures
      final images = find.byType(Image);
      for (final image in images.evaluate()) {
        final renderObject = image.renderObject;
        if (renderObject != null) {
          final node = renderObject.debugSemantics;
          // Verify images that are interactive or informative have labels
          if (node != null && node.hasAction(SemanticsAction.tap)) {
            expect(node.label, isNotEmpty,
                reason: 'Image at ${image.renderObject?.paintBounds} has no label');
          }
        }
      }
    });
  });
}

// Replace with your actual page/widget
class MyAccessiblePage extends StatelessWidget {
  const MyAccessiblePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Accessible Page')),
      body: Center(
        child: Semantics(
          label: 'Submit form',
          button: true,
          child: ElevatedButton(
            key: const ValueKey('submit_button'),
            onPressed: () {},
            child: const Text('Submit'),
          ),
        ),
      ),
    );
  }
}
