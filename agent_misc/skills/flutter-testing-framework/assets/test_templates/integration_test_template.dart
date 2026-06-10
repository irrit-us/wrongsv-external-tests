// integration_test_template.dart
//
// Template for Flutter on-device integration tests using the integration_test package.
// Copy this into integration_test/<feature>_test.dart and customize.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

// Import your app's main widget
import 'package:your_app/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Feature Name Integration Tests', () {
    testWidgets('should render the home screen', (WidgetTester tester) async {
      // Launch the app
      app.main();
      await tester.pumpAndSettle();

      // Verify expected widgets are present
      expect(find.text('Welcome'), findsOneWidget);
    });

    testWidgets('should navigate on button tap', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle();

      // Find and tap a button
      final button = find.byKey(const ValueKey('navigate_button'));
      expect(button, findsOneWidget);
      await tester.tap(button);
      await tester.pumpAndSettle();

      // Verify navigation result
      expect(find.text('Next Screen'), findsOneWidget);
    });

    testWidgets('should handle text input', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle();

      // Enter text
      final textField = find.byType(TextField);
      expect(textField, findsOneWidget);
      await tester.enterText(textField, 'Hello Flutter');
      await tester.pumpAndSettle();

      // Verify text was entered
      expect(find.text('Hello Flutter'), findsOneWidget);
    });

    testWidgets('performance: scrolling should maintain 60fps', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle();

      final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
      final frameTimes = <FrameTiming>[];
      binding.watchPerformance((timings) {
        frameTimes.addAll(timings);
      });

      // Perform scroll
      final listView = find.byType(ListView);
      await tester.fling(listView, const Offset(0, -500), 1000);
      await tester.pumpAndSettle();

      // Verify frame budget
      if (frameTimes.isNotEmpty) {
        final avgBuildUs = frameTimes
            .map((t) => t.buildDuration.inMicroseconds)
            .reduce((a, b) => a + b) / frameTimes.length;
        expect(avgBuildUs, lessThan(16000)); // < 16ms per frame
      }
    });
  });
}
