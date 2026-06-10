// integration_driver_template.dart
//
// Template for the integration test driver entry point.
// Place this in test_driver/integration_driver.dart

import 'package:integration_test/integration_test_driver.dart';

Future<void> main() async {
  await integrationDriver(
    // Optional: customize the timeout for individual tests
    timeout: const Duration(seconds: 60),
    // Optional: callback invoked when a test completes
    onScreenshot: (String name, List<int> bytes) async {
      // Save screenshots to disk for CI artifact collection
      // final file = File('screenshots/$name.png');
      // await file.writeAsBytes(bytes);
      return true; // return false to disable automatic screenshot saving
    },
  );
}
