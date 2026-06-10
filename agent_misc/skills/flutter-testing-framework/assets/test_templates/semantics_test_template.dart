// semantics_test_template.dart
//
// Template for widget tests that leverage the semantics tree for element location.
// Use this when widgets lack keys or semantic labels.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/semantics.dart';

// Import the semantics tree dump utility
// import '../../debug_bridge/semantics_tree_dump.dart';

void main() {
  group('Semantics-based Widget Tests', () {
    // Ensure semantics are enabled before each test
    setUp(() {
      // Semantics are automatically enabled when using WidgetTester
    });

    testWidgets('should find widgets by semantics label prefix',
        (WidgetTester tester) async {
      await tester.pumpWidget(const MaterialApp(
        home: Scaffold(
          body: Column(
            children: [
              Semantics(label: 'Login Email Field', child: TextField()),
              Semantics(label: 'Login Password Field', child: TextField()),
              ElevatedButton(
                onPressed: null,
                child: Text('Submit'),
              ),
            ],
          ),
        ),
      ));

      // Enable semantics explicitly
      await tester.ensureSemantics();

      // Find by semantics label
      final emailField = find.bySemanticsLabel('Login Email Field');
      expect(emailField, findsOneWidget);

      final passwordField = find.bySemanticsLabel('Login Password Field');
      expect(passwordField, findsOneWidget);

      // Find by label prefix (requires custom finder)
      final loginFields = find.bySemanticsLabel(RegExp(r'Login .*'));
      expect(loginFields, findsNWidgets(2));
    });

    testWidgets('should find widgets by structural semantics position',
        (WidgetTester tester) async {
      await tester.pumpWidget(const MaterialApp(
        home: Scaffold(
          body: ListView(
            children: [
              ListTile(title: Text('Item 0')),
              ListTile(title: Text('Item 1')),
              ListTile(title: Text('Item 2')),
            ],
          ),
        ),
      ));

      await tester.ensureSemantics();

      // Dump the semantics tree for debugging
      final owner = tester.binding.pipelineOwner.semanticsOwner;
      expect(owner, isNotNull);

      // Traverse to find the second ListTile by index
      final rootNode = owner!.rootSemanticsNode!;
      int tileCount = 0;

      void countTiles(SemanticsNode node) {
        if (node.hasFlag(SemanticsFlag.isHeader) == false &&
            node.label.contains('Item')) {
          tileCount++;
        }
        node.visitChildren((child) {
          countTiles(child);
          return true;
        });
      }

      countTiles(rootNode);
      expect(tileCount, 3);
    });

    testWidgets('should handle MergeSemantics boundaries',
        (WidgetTester tester) async {
      await tester.pumpWidget(const MaterialApp(
        home: Scaffold(
          body: MergeSemantics(
            child: Column(
              children: [
                Text('Merged Child A'),
                Text('Merged Child B'),
              ],
            ),
          ),
        ),
      ));

      await tester.ensureSemantics();

      final owner = tester.binding.pipelineOwner.semanticsOwner;
      final rootNode = owner!.rootSemanticsNode!;

      // Under MergeSemantics, children are merged into one node
      expect(rootNode.hasChildren, isTrue);
      // The merged label contains both child texts
      expect(rootNode.label, contains('Merged Child A'));
      expect(rootNode.label, contains('Merged Child B'));
    });
  });
}
