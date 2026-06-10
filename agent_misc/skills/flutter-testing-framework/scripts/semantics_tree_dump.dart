// semantics_tree_dump.dart
//
// Dart utility to traverse the full Flutter semantics tree and serialize it as JSON.
// Run this inside a Flutter app (test or debug build) to collect the tree for
// external analysis.
//
// Usage (within a Flutter test or debug context):
//   import 'semantics_tree_dump.dart';
//   final json = dumpSemanticsTree();
//   print(json);

import 'package:flutter/rendering.dart';
import 'package:flutter/semantics.dart';

/// Serializes the entire semantics tree starting from [node] into a JSON-encodable map.
///
/// When [node] is omitted, the root semantics node from the current binding is used.
Map<String, dynamic> serializeSemanticsNode(SemanticsNode node) {
  final Map<String, dynamic> result = <String, dynamic>{
    'id': node.id,
    'rect': <String, double>{
      'left': node.rect.left,
      'top': node.rect.top,
      'width': node.rect.width,
      'height': node.rect.height,
    },
    'label': node.label,
    'value': node.value,
    'hint': node.hint,
    'increasedValue': node.increasedValue,
    'decreasedValue': node.decreasedValue,
    'textDirection': node.textDirection?.name,
    'actions': node.actions.keys.map((SemanticsAction a) => a.name).toList(),
    'flags': _serializeFlags(node),
    'tags': _serializeTags(node),
    'hasChildren': node.hasChildren,
    'isMergedIntoParent': node.isMergedIntoParent,
    'isPartOfNodeMerging': node.isPartOfNodeMerging,
  };

  if (node.hasChildren) {
    final List<Map<String, dynamic>> children = <Map<String, dynamic>>[];
    node.visitChildren((SemanticsNode child) {
      children.add(serializeSemanticsNode(child));
      return true;
    });
    result['children'] = children;
  } else {
    result['children'] = <Map<String, dynamic>>[];
  }

  return result;
}

Map<String, bool> _serializeFlags(SemanticsNode node) {
  return <String, bool>{
    'hasCheckedState': node.hasFlag(SemanticsFlag.hasCheckedState),
    'isChecked': node.hasFlag(SemanticsFlag.isChecked),
    'isSelected': node.hasFlag(SemanticsFlag.isSelected),
    'isButton': node.hasFlag(SemanticsFlag.isButton),
    'isTextField': node.hasFlag(SemanticsFlag.isTextField),
    'isFocused': node.hasFlag(SemanticsFlag.isFocused),
    'isSlider': node.hasFlag(SemanticsFlag.isSlider),
    'hasEnabledState': node.hasFlag(SemanticsFlag.hasEnabledState),
    'isEnabled': node.hasFlag(SemanticsFlag.isEnabled),
    'isHeader': node.hasFlag(SemanticsFlag.isHeader),
    'isImage': node.hasFlag(SemanticsFlag.isImage),
    'isLink': node.hasFlag(SemanticsFlag.isLink),
    'isReadOnly': node.hasFlag(SemanticsFlag.isReadOnly),
    'isFocusable': node.hasFlag(SemanticsFlag.isFocusable),
    'isObscured': node.hasFlag(SemanticsFlag.isObscured),
    'isMultiline': node.hasFlag(SemanticsFlag.isMultiline),
  };
}

List<String> _serializeTags(SemanticsNode node) {
  return node.tags?.map((SemanticsTag t) {
        if (t == SemanticsTag.renderView) return 'renderView';
        if (t == SemanticsTag.routeName) return 'routeName';
        if (t == SemanticsTag.scopesRoute) return 'scopesRoute';
        if (t == SemanticsTag.namesRoute) return 'namesRoute';
        if (t.type != null) return t.type!.name;
        return 'custom';
      }).toList() ??
      <String>[];
}

/// Dumps the full semantics tree starting from the root as a JSON string.
///
/// Returns `null` if semantics are not enabled.
String? dumpSemanticsTree() {
  final SemanticsOwner? owner =
      WidgetsBinding.instance.pipelineOwner.semanticsOwner;
  if (owner == null) return null;

  final Map<String, dynamic> tree =
      serializeSemanticsNode(owner.rootSemanticsNode!);
  // Use manual JSON construction to avoid dart:convert import constraint
  return _toJson(tree);
}

/// Enables semantics and returns the serialized tree.
String? enableAndDumpSemanticsTree() {
  WidgetsBinding.instance.pipelineOwner.ensureSemantics();
  return dumpSemanticsTree();
}

/// Simple JSON encoder that avoids dart:convert dependency.
/// In practice, use `import 'dart:convert'; jsonEncode(tree)`.
String _toJson(dynamic value) {
  if (value == null) return 'null';
  if (value is bool) return value ? 'true' : 'false';
  if (value is int) return value.toString();
  if (value is double) return value.toString();
  if (value is String) return '"${_escapeJson(value)}"';
  if (value is List) {
    return '[${value.map(_toJson).join(',')}]';
  }
  if (value is Map) {
    final entries = (value as Map<String, dynamic>).entries
        .map((e) => '"${_escapeJson(e.key)}":${_toJson(e.value)}')
        .join(',');
    return '{$entries}';
  }
  return 'null';
}

String _escapeJson(String s) {
  return s
      .replaceAll('\\', '\\\\')
      .replaceAll('"', '\\"')
      .replaceAll('\n', '\\n')
      .replaceAll('\r', '\\r')
      .replaceAll('\t', '\\t');
}

/// Finds semantics nodes matching a predicate and returns them as a list of maps.
List<Map<String, dynamic>> findSemanticsNodes(
  SemanticsNode root,
  bool Function(SemanticsNode) predicate, {
  int? maxResults,
}) {
  final List<Map<String, dynamic>> results = <Map<String, dynamic>>[];
  _traverseWithPredicate(root, predicate, results, maxResults);
  return results;
}

void _traverseWithPredicate(
  SemanticsNode node,
  bool Function(SemanticsNode) predicate,
  List<Map<String, dynamic>> results,
  int? maxResults,
) {
  if (maxResults != null && results.length >= maxResults) return;

  if (predicate(node)) {
    results.add(serializeSemanticsNode(node));
  }

  node.visitChildren((SemanticsNode child) {
    _traverseWithPredicate(child, predicate, results, maxResults);
    return maxResults == null || results.length < (maxResults ?? 0);
  });
}
