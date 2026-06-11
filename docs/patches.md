# Source Code Modifications

This document lists all modifications made to the source projects (FlClash and Hiddify-next)
to enable automated proxy testing with the VM service bridge.

## FlClash (`FlClash/`)

### 1. `lib/common/debug_service.dart` — VM Service Extensions + API Fix

- **API fix**: Changed `node.actions` → `node.getSemanticsData().actions` (Flutter 3.44.1 API change)
- **Added**: `_semanticsActionNames()` helper to decode the int bitfield from `getSemanticsData().actions`
- **Added**: `FlClashDebugService` class with VM service extensions:
  - `ext.flclash.getAppState` — app state as JSON
  - `ext.flclash.dumpSemantics` — full semantics tree as JSON
  - `ext.flclash.dumpWidgetTree` — widget tree deep-string
  - `ext.flclash.runSelfTest` — internal consistency checks
  - `ext.flclash.performSemanticsAction` — tap/longPress on semantics nodes by ID or label
  - `ext.flclash.connectProxy` — start proxy via ProviderContainer → SetupAction.updateStatus(true)
  - `ext.flclash.disconnectProxy` — stop proxy via updateStatus(false)
  - `ext.flclash.getProxyStatus` — returns isStart + coreStatus
- **Added**: Imports for `package:fl_clash/state.dart` and `package:fl_clash/providers/providers.dart`

### 2. `lib/main.dart` — Register Debug Service

- **Added**: `import 'common/debug_service.dart';`
- **Added**: `FlClashDebugService.register();` in `main()`

### 3. `lib/views/developer.dart` — API Fixes

- **API fix**: Changed `node.actions` → `node.getSemanticsData().actions` with `_semanticsActionNames()` helper
- **API fix**: Changed `utils.copyToClipboard(value)` → `Clipboard.setData(ClipboardData(text: value))`
- **Added**: `import 'package:flutter/services.dart';`

### 4. C++ Plugin Fixes

- **`plugins/tray_manager/packages/tray_manager/linux/CMakeLists.txt`**: Added `-Wno-deprecated-declarations` for `app_indicator_new`
- **`~/.pub-cache/hosted/pub.dev/hotkey_manager_linux-0.2.0/linux/CMakeLists.txt`**: Added `-Wno-sometimes-uninitialized`

---

## Hiddify-next (`hiddify-next/`)

### 1. `lib/core/debug/debug_service.dart` — VM Service Extensions + API Fix

- **API fix**: Changed `node.actions` → `node.getSemanticsData().actions` (same as FlClash)
- **Added**: `_semanticsActionNames()` helper
- **Added**: `HiddifyDebugService` class with VM service extensions:
  - `ext.hiddify.getAppState`
  - `ext.hiddify.dumpSemantics`
  - `ext.hiddify.dumpWidgetTree`
  - `ext.hiddify.runSelfTest`
  - `ext.hiddify.importConfig` — reads a config file (DB import handled by import-hiddify-config.py)
  - `ext.hiddify.connectProxy` — direct ConnectionRepository.connect() call
  - `ext.hiddify.disconnectProxy` — direct ConnectionRepository.disconnect() call
  - `ext.hiddify.getProxyStatus` — connection status + active profile info
  - `ext.hiddify.performSemanticsAction` — tap/longPress on semantics nodes
- **Added**: `setContainer()` static method for ProviderContainer access
- **Added**: Imports for connection data providers, connection notifier, active profile notifier, preferences

### 2. `lib/bootstrap.dart` — Register Debug Service + Container

- **Already present**: `import 'package:hiddify/core/debug/debug_service.dart';`
- **Already present**: `HiddifyDebugService.register();` at line 71
- **Added**: `HiddifyDebugService.setContainer(container);` after register to enable app state access from extensions

### 3. `lib/features/settings/overview/sections/developer_page.dart` — API Fix

- **API fix**: Changed `node.actions` → `node.getSemanticsData().actions` with `_semanticsActionNames()` helper
- **Removed**: Dead code line `final ref = context as Element? == null ? null : context as Element?;`

### 4. `pubspec.yaml` — Dependency Version Bumps

- `font_awesome_flutter: ^10.7.0` → `^11.0.0` (Flutter 3.44.1 `final class IconData` compat)
- `simple_icons: ^10.1.3` → `^16.23.0` (same reason)

### 5. `lib/features/profile/details/json_editor.dart` — FaIcon Migration

- Changed `Icon(FontAwesomeIcons.caretDown, ...)` → `FaIcon(FontAwesomeIcons.caretDown, ...)`
- Changed `Icon(FontAwesomeIcons.caretRight, ...)` → `FaIcon(FontAwesomeIcons.caretRight, ...)`

### 6. `lib/features/home/widget/connection_button.dart` — FaIcon Migration

- Changed `Icon(FontAwesomeIcons.shieldHalved, ...)` → `FaIcon(FontAwesomeIcons.shieldHalved, ...)`

### 7. `lib/features/proxy/active/ip_widget.dart` — SimpleIcons Fallback

- Replaced removed icons (`microsoftazure`, `amazonaws`, `oracle`) with Material `Icons.cloud` + brand colors
- **TODO**: Restore proper SimpleIcons if brand icons are re-added in future versions

### 8. C++ Plugin Fixes

- **`~/.pub-cache/hosted/pub.dev/tray_manager-0.5.0/linux/CMakeLists.txt`**: Added `-Wno-deprecated-declarations`
- **`~/.pub-cache/hosted/pub.dev/hotkey_manager_linux-0.2.0/linux/CMakeLists.txt`**: Added `-Wno-sometimes-uninitialized`

---

## Rebuilding

To rebuild either app after source changes:

```bash
# FlClash
cd FlClash
flutter build linux --profile
cp -r build/linux/x64/profile/bundle/* ../binaries/flclash/

# Hiddify
cd hiddify-next
dart run build_runner build --delete-conflicting-outputs
flutter build linux --profile
cp -r build/linux/x64/profile/bundle/* ../binaries/hiddify/
```
