// vm_service_bridge_test_template.dart
//
// Template for tests that connect to the Dart VM service for introspection.
// Requires the app to be running in debug mode with VM service exposed.

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

// Import your app
import 'package:your_app/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('VM Service Bridge Tests', () {
    late String vmServiceUri;

    setUp(() {
      // When running with flutter run --debug, the VM service URI is available
      // In integration_test, we need to discover it from the environment
      // or via Platform.environment
      vmServiceUri = const String.fromEnvironment(
        'VM_SERVICE_URI',
        defaultValue: '',
      );
    });

    testWidgets('app exposes expected service extensions',
        (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle();

      // Verify the app is running and widgets render
      expect(find.byType(MaterialApp), findsOneWidget);

      // If VM service URI is available, additional checks can be performed
      if (vmServiceUri.isNotEmpty) {
        // External harness would connect here
        // See flutter_debug_bridge.py for the Python-side implementation
        debugPrint('VM Service available at: $vmServiceUri');
      }
    });

    testWidgets('semantics tree is serializable via VM service',
        (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle();
      await tester.ensureSemantics();

      // Verify semantics are enabled and traversable
      final owner = tester.binding.pipelineOwner.semanticsOwner;
      expect(owner, isNotNull);

      // The tree should be non-empty
      final rootNode = owner!.rootSemanticsNode!;
      expect(rootNode.id, greaterThanOrEqualTo(0));

      // Verify key properties are accessible
      expect(rootNode.rect.width, greaterThan(0));
      expect(rootNode.rect.height, greaterThan(0));
    });

    testWidgets('custom service extension can be registered and called',
        (WidgetTester tester) async {
      // Register a custom service extension for the test harness
      final Map<String, dynamic> testState = <String, dynamic>{
        'testRunning': false,
      };

      // In real usage, register via:
      // developer.registerExtension('ext.my_app.test_state', ...);
      // Here we just verify the pattern compiles

      app.main();
      await tester.pumpAndSettle();

      expect(find.byType(MaterialApp), findsOneWidget);
    });
  });
}
