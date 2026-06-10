// flutter_test_config.dart
//
// Global test configuration for Flutter widget and integration tests.
// Place this in: test/flutter_test_config.dart
//
// Handles:
//   - Custom font loading (prevents golden file drift across platforms)
//   - Golden file comparator configuration (tolerance for cross-platform)
//   - Global setUp/tearDown (semantics, timeouts, mocks)
//
// See: references/golden-testing.md

import 'dart:async';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

Future<void> testExecutable(FutureOr<void> Function() testMain) async {
  // ── Global setup ────────────────────────────────────────────────

  setUpAll(() async {
    // Load custom fonts to prevent golden file drift across platforms.
    // Uncomment and configure for your project:
    //
    // final fontLoader = FontLoader('Roboto')
    //   ..addFont(rootBundle.load('assets/fonts/Roboto-Regular.ttf'))
    //   ..addFont(rootBundle.load('assets/fonts/Roboto-Bold.ttf'));
    // await fontLoader.load();

    // Configure golden file comparator with tolerance for cross-platform rendering.
    // goldenFileComparator = TolerantComparator(
    //   Uri.parse('goldens/'),
    //   tolerance: 0.01,  // 1% pixel difference tolerance
    // );

    // Set default test timeout.
    // testDefaultBinaryMessengerBinding.defaultTimeout = const Duration(seconds: 30);
  });

  tearDownAll(() async {
    // Global cleanup — close services, reset mocks, etc.
  });

  // ── Run tests ───────────────────────────────────────────────────
  await testMain();
}
