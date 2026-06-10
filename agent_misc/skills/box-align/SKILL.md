---
name: box-align
description: Detect and fix box-drawing alignment issues in markdown ASCII-art diagrams. Use when checking or fixing ASCII diagrams, box-drawing characters, or mermaid/flowchart alignment in markdown files.
---

# box-align

Detect and fix box-drawing alignment issues in markdown ASCII-art diagrams.

## What it checks

1. **Corner-to-wall**: Box corners (┌┐└┘) must align with vertical walls (│) on adjacent lines
2. **T-junction**: Tees (┬┴) must have │ or ▼ on the adjacent line at the same column
3. **Arrow centering**: ▼ should point near the center of the box below (within 5 cols)
4. **Connector consistency**: Vertical │ ▼ chains should be at consistent columns
5. **Width consistency**: Stacked boxes sharing a left edge and connector flow should have matching widths
6. **Header-underline**: ═══ underlines should span the full width of the section header text above them
7. **Header-center**: Section titles embedded in box top borders should be approximately centered within their enclosing box
8. **Header-content**: ═══ section headers should be centered over the content columns they label below
9. **Text-arrow**: ▼ arrows below standalone text labels should be centered under the text

## Usage

```bash
# Check for issues (exit code 1 if found)
python3 scripts/box_align.py file.md

# Check multiple files
python3 scripts/box_align.py *.md

# Auto-fix issues in-place
python3 scripts/box_align.py --fix file.md

# CI mode: quiet output, exit code only
python3 scripts/box_align.py --check --quiet file.md
```

## How it works

The tool finds fenced code blocks containing box-drawing characters (┌┐└┘│─┬┴▼═), detects enclosed boxes by matching ┌...┐ tops with └...┘ bottoms, then runs nine alignment checks. The `--fix` mode applies corrections iteratively (up to 5 passes) since fixes can cascade.

### Fix behavior by check type

| Check | Fixable | Method |
|---|---|---|
| corner-wall | Yes | Extend horizontal border with ─ |
| t-junction | No | Detection only |
| arrow-center | Yes (no chain) | Shift ▼ through whitespace toward box center |
| connector | No | Detection only |
| width | Yes | Extend narrower boxes to match widest in group |
| header-underline | Yes | Replace surrounding spaces with ═ in-place |
| header-center | Yes | Adjust ─ padding on shorter side |
| header-content | Yes | Shift text + underline to content zone center |
| text-arrow | Yes (no chain) | Shift ▼ through whitespace toward text center |

Fixes marked "no chain" are skipped when the ▼ has a │ directly above it (part of a vertical connector chain that shouldn't be broken).

## Limitations

- Only checks fenced code blocks (``` ```)
- Arrow-centering fixes skip arrows that are part of a connector chain (│ above)
- Width auto-fix extends narrower boxes to match the widest in the group
- Does not handle box-drawing in non-fenced content
- Tree-structure characters (├ ┤ └ in directory trees) are correctly ignored
- Header-underline only detects contiguous text (stops at spaces)

## Testing

```bash
# Run the test suite (32 tests covering all 9 check types)
python3 tests/run_tests.py

# Run property-based fuzz tests (generates random diagrams + mutations)
python3 tests/fuzz_test.py [seed] [iterations]
```
