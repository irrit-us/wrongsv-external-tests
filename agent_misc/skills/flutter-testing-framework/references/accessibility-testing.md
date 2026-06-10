# Accessibility Testing — WCAG 2.2 Compliance

Source: [Flutter accessibility testing docs](https://docs.flutter.dev/ui/accessibility/accessibility-testing), WCAG 2.2, EN 301 549, EU Accessibility Act 2025

## Regulatory Context

- **WCAG 2.2** is the current standard (supersedes 2.1)
- **EU Accessibility Act** requires digital services to be accessible by 2025; fines up to 4% of annual revenue
- **EN 301 549** and **VPAT** are referenced compliance frameworks
- In the US, ADA lawsuits reference WCAG; Target, Netflix, Domino's have faced million-dollar settlements

## Built-in Guideline API

Flutter's test framework provides automated accessibility checks:

```dart
import 'package:flutter_test/flutter_test.dart';

testWidgets('meets accessibility guidelines', (tester) async {
  final handle = tester.ensureSemantics();
  await tester.pumpWidget(MyAccessibleApp());

  // Android: minimum 48×48dp tap targets (WCAG 2.5.5)
  await expectLater(tester, meetsGuideline(androidTapTargetGuideline));

  // iOS: minimum 44×44pt tap targets
  await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));

  // All tappable nodes must have semantic labels (WCAG 1.1.1)
  await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));

  // Text contrast: 4.5:1 normal, 3:1 large (WCAG 1.4.3)
  await expectLater(tester, meetsGuideline(textContrastGuideline));

  handle.dispose();
});
```

## WCAG 2.2 → Flutter Mapping

| WCAG Criterion | Requirement | Flutter Implementation |
|----------------|-------------|----------------------|
| **1.1.1** Non-text Content | Icons/images need text alternatives | `Semantics(label: '...')` on icons, `Image.asset(...).semanticsLabel` |
| **1.3.1** Info and Relationships | Structure conveyed programmatically | `Semantics(header: true)`, `MergeSemantics` for groups |
| **1.4.3** Contrast (Minimum) | 4.5:1 normal text, 3:1 large text | `meetsGuideline(textContrastGuideline)` |
| **1.4.11** Non-text Contrast | UI components ≥3:1 | Manual audit or `flutter_accessibility_scanner` |
| **2.1.1** Keyboard | All functionality via keyboard | `FocusNode`, `FocusTraversalGroup`, `Shortcuts` |
| **2.4.7** Focus Visible | Visible focus indicator | `FocusManager`, `FocusTraversalGroup` |
| **2.5.3** Label in Name | Visible text matches a11y label | `Semantics(label: ...)` matches visible `Text` |
| **2.5.5** Target Size | Minimum 48×48 logical pixels | `meetsGuideline(androidTapTargetGuideline)` |
| **3.3.2** Labels or Instructions | Inputs have labels | `InputDecoration(labelText: ...)` or `Semantics(label: ...)` |

## Semantic Node Inspection

```dart
testWidgets('button has correct semantics', (tester) async {
  await tester.pumpWidget(MyButton(label: 'Submit'));
  await tester.ensureSemantics();

  final node = tester.getSemantics(find.byType(ElevatedButton));
  expect(node.label, 'Submit');
  expect(node.hasFlag(SemanticsFlag.isButton), isTrue);
  expect(node.hasAction(SemanticsAction.tap), isTrue);
});
```

## Platform Testing Tools

| Platform | Tool | How to Access |
|----------|------|--------------|
| Android | Accessibility Scanner | Settings → Accessibility → Scanner |
| Android | TalkBack | Settings → Accessibility → TalkBack |
| iOS | Accessibility Inspector | Xcode → Open Developer Tool → Accessibility Inspector |
| iOS | VoiceOver | Settings → Accessibility → VoiceOver |
| Flutter | Semantics Debugger | `MaterialApp(showSemanticsDebugger: true)` |
| Web | Chrome DevTools | Inspect `semantics host` in Elements panel |

## Third-Party: flutter_accessibility_scanner

```yaml
dev_dependencies:
  flutter_accessibility_scanner: ^1.0.0
```

Automatically scans for:
- Missing semantic labels (Critical severity)
- Poor color contrast below 4.5:1 (High severity)
- Tap targets smaller than 48×48px (Medium severity)
- Missing keyboard focus support (High severity)

Outputs JSON reports suitable for CI integration.

## Best Practices

1. **Every interactive widget gets a Semantics label** — buttons, icons, text fields, toggles
2. **Touch targets ≥48×48dp** — use `meetsGuideline(androidTapTargetGuideline)` in CI
3. **Never rely on color alone** — add icons or text alongside color indicators
4. **FocusTraversalGroup + ReadingOrderTraversalPolicy** — for logical tab order
5. **Allow text scaling** — use `MediaQuery.textScaler` not fixed font sizes
6. **Test with real screen readers** — TalkBack on Android, VoiceOver on iOS
7. **Add `meetsGuideline()` checks to CI** — gate PRs on accessibility regressions
8. **Internationalize labels** — `Semantics(label: t.loginButtonLabel)` alongside `Text(t.loginButtonText)`
9. **Provide reduced-motion toggle** — `MediaQuery.disableAnimations`
10. **Use `ExcludeSemantics`** for decorative elements that should be hidden from screen readers

## CI Integration

```yaml
- name: Accessibility audit
  run: flutter test test/ --tags a11y

- name: Fail on accessibility violations
  run: |
    flutter test test/accessibility/ || (
      echo "Accessibility violations found. See report above."
      exit 1
    )
```
