# Semantics Tree Reference

## Overview

Flutter's semantics system provides a structured, traversable representation of the widget tree designed for accessibility. It is the foundation that `flutter_test` finders and the `integration_test` package use to locate and interact with widgets.

**Key insight**: Every `Finder` in Flutter's testing framework ultimately operates on semantics nodes. Understanding the semantics tree gives you the ability to build custom finders when `ByKey`, `ByText`, and `ByType` are insufficient.

## Architecture

```
Widget Tree
    ↓ (ownership)
Element Tree
    ↓ (semantics generation)
SemanticsNode Tree
    ↓ (serialization)
Accessibility Bridge (OS-level)
```

For testing purposes, you interact with the SemanticsNode tree directly via `SemanticsController` and related APIs — skipping the OS accessibility bridge.

## Core API

### Accessing the Semantics Tree

```dart
import 'package:flutter/semantics.dart';

// In a test (requires semantics to be enabled):
void dumpSemantics() {
  final owner = WidgetsBinding.instance.pipelineOwner.semanticsOwner;
  if (owner != null) {
    debugPrint(owner.rootSemanticsNode.toStringDeep());
  }
}
```

### Enabling Semantics in Tests

Semantics are automatically enabled when using `WidgetTester`. If you're working outside the test framework:

```dart
import 'package:flutter/rendering.dart';

// Enable semantics manually
final binding = TestWidgetsFlutterBinding.ensureInitialized();
binding.pipelineOwner.ensureSemantics();
```

### SemanticsNode Key Properties

| Property | Type | Purpose |
|----------|------|---------|
| `id` | `int` | Unique identifier within the tree |
| `rect` | `Rect` | Bounding rectangle in global coordinates |
| `transform` | `Matrix4` | Cumulative transform from root |
| `label` | `String` | Accessibility label |
| `value` | `String` | Current value (for sliders, toggles, etc.) |
| `hint` | `String` | Accessibility hint |
| `textDirection` | `TextDirection` | Text direction |
| `actions` | `Set<SemanticsAction>` | Available actions (tap, longPress, scroll, etc.) |
| `flags` | `SemanticsFlags` | Boolean flags (isChecked, isSelected, isFocused, etc.) |
| `tags` | `Set<SemanticsTag>` | Custom tags |
| `children` | `List<SemanticsNode>` | Child nodes |
| `parent` | `SemanticsNode?` | Parent node |

### SemanticsFlags

```dart
class SemanticsFlags {
  final bool hasCheckedState;
  final bool isChecked;
  final bool isSelected;
  final bool isButton;
  final bool isTextField;
  final bool isFocused;
  final bool isSlider;
  final bool hasEnabledState;
  final bool isEnabled;
  final bool isHeader;
  final bool isImage;
  final bool isLink;
  final bool isReadOnly;
}
```

### SemanticsAction

```dart
enum SemanticsAction {
  tap, longPress, scrollLeft, scrollRight, scrollUp, scrollDown,
  increase, decrease, showOnScreen, moveCursorForwardByCharacter,
  moveCursorBackwardByCharacter, setSelection, copy, cut, paste,
  didGainAccessibilityFocus, didLoseAccessibilityFocus,
  customAction, dismiss, moveCursorForwardByWord, moveCursorBackwardByWord,
  setText,
}
```

## Traversal Patterns

### Depth-First Traversal

```dart
void traverseSemanticsTree(SemanticsNode node, void Function(SemanticsNode) visitor) {
  visitor(node);
  node.visitChildren((child) {
    traverseSemanticsTree(child, visitor);
    return true;
  });
}
```

### Finding by Property

```dart
SemanticsNode? findByLabel(SemanticsNode root, String label) {
  SemanticsNode? result;
  traverseSemanticsTree(root, (node) {
    if (node.label == label) result = node;
  });
  return result;
}

List<SemanticsNode> findAllWithAction(SemanticsNode root, SemanticsAction action) {
  final results = <SemanticsNode>[];
  traverseSemanticsTree(root, (node) {
    if (node.hasAction(action)) results.add(node);
  });
  return results;
}
```

### Finding by Structural Position

When widgets lack semantic labels:

```dart
/// Find the nth SemanticsNode of a given type at a specific depth
SemanticsNode? findByStructuralPosition(
  SemanticsNode root, {
  int? depth,
  int? childIndex,
  String? tag,
}) {
  // Implementation uses breadth-first or depth-first search
  // with structural constraints
}
```

## Serialization to JSON

For external tools that consume semantics data:

```dart
Map<String, dynamic> serializeSemanticsNode(SemanticsNode node) {
  return {
    'id': node.id,
    'rect': {
      'left': node.rect.left,
      'top': node.rect.top,
      'width': node.rect.width,
      'height': node.rect.height,
    },
    'label': node.label,
    'value': node.value,
    'hint': node.hint,
    'textDirection': node.textDirection?.name,
    'actions': node.actions.keys.map((a) => a.name).toList(),
    'flags': _serializeFlags(node),
    'tags': node.tags?.map((t) => t.type?.name).toList(),
    'children': node.children?.map(serializeSemanticsNode).toList(),
  };
}
```

See `scripts/semantics_tree_dump.dart` for a complete serialization utility.

## Custom Finder Strategy

When standard finders fail, build custom semantics-based finders:

```dart
import 'package:flutter_test/flutter_test.dart';

/// Finds widgets by semantics label prefix
class ByLabelPrefix extends MatchFinder {
  final String prefix;

  ByLabelPrefix(this.prefix);

  @override
  String get description => 'label starts with "$prefix"';

  @override
  bool matches(Element candidate) {
    final renderObject = candidate.renderObject;
    if (renderObject == null) return false;
    final node = renderObject.debugSemantics;
    return node?.label?.startsWith(prefix) ?? false;
  }
}
```

## Common Pitfalls

- **Semantics not enabled**: Many widgets don't generate semantics nodes until semantics is enabled. In tests, use `tester.ensureSemantics()`.
- **Merge boundaries**: `MergeSemantics` widgets collapse multiple semantics nodes into one. Use `ExcludeSemantics` if you need individual nodes.
- **Off-screen nodes**: Semantics nodes exist for off-screen widgets. Filter by `rect` intersection with the visible viewport.
- **Custom painters don't generate semantics**: Use `Semantics` widget to annotate custom-painted areas.
- **Semantics tree is a filtered view**: Not every widget produces a semantics node; the framework merges and skips based on heuristics. Use the render tree (`DebugDumpRenderTree`) for pixel-level debugging.
