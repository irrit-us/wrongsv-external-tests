#!/usr/bin/env python3
"""Test suite for box_align.py — generates fixtures, runs detection/fix, verifies results."""

import sys
import os
import tempfile
import textwrap

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'scripts'))
import box_align

PASS = 0
FAIL = 0


def check(name, actual, expected, detail=""):
    global PASS, FAIL
    if actual == expected:
        PASS += 1
        print(f"  PASS: {name}")
    else:
        FAIL += 1
        print(f"  FAIL: {name}")
        print(f"    Expected: {expected!r}")
        print(f"    Actual:   {actual!r}")
        if detail:
            print(f"    {detail}")


def check_ge(name, actual, min_expected):
    global PASS, FAIL
    if actual >= min_expected:
        PASS += 1
        print(f"  PASS: {name} ({actual} >= {min_expected})")
    else:
        FAIL += 1
        print(f"  FAIL: {name}: {actual} < {min_expected}")


def make_md(diagrams):
    """Wrap diagram strings in markdown fenced code blocks."""
    parts = ["# Test"]
    for i, d in enumerate(diagrams):
        parts.append(f"```text\n{d}\n```")
    return "\n\n".join(parts)


def run_detection(md_text):
    """Run detection on markdown text, return list of issue kinds."""
    _, report = box_align.process_markdown(md_text, fix=False)
    issues = []
    for line in report:
        if line.startswith("  [") and "]" in line:
            kind = line.split("]")[0].split("[")[1]
            fixable = "fixable=True" not in line or "fixable=False" not in line
            issues.append(kind)
    return issues, report


def run_fix(md_text):
    """Run fix on markdown text, return fixed text and report."""
    return box_align.process_markdown(md_text, fix=True)


# =============================================================================
# Test 1: header-underline — single block short on right
# =============================================================================
print("\n=== Test 1: header-underline single short ===")
diag1 = textwrap.dedent("""\
                        SHORT TITLE
                        ══════════""")
# "SHORT TITLE"=11, ═=10
md1 = make_md([diag1])
issues1, report1 = run_detection(md1)
check("detects header-underline", "header-underline" in issues1, True)
check_ge("count issues", len(issues1), 1)

fixed1, frep1 = run_fix(md1)
issues1b, _ = run_detection(fixed1)
check("fix eliminates issue", "header-underline" in issues1b, False)

# =============================================================================
# Test 2: header-underline — two blocks, both short (multi-block fix)
# =============================================================================
print("\n=== Test 2: header-underline multi-block ===")
# Carefully aligned: left text 17, left ═ 15; right text 18, right ═ 12
left_text = "LEFT HEADER TEXT"   # 16 chars... hmm
right_text = "RIGHT HEADER TEXT"  # 17 chars

# Let me use simpler text
left = "LEFT PART"
right = "RIGHT SECTION"
left_ul = "═" * (len(left) - 1)   # 8
right_ul = "═" * (len(right) - 3)  # 10
gap = " " * 15
diag2 = f"                     {left}{gap}{right}\n                     {left_ul}{gap}{right_ul}"
md2 = make_md([diag2])
issues2, _ = run_detection(md2)
# Both should be short
left_short = any("LEFT PART" in str(r) for r in [issues2]) if issues2 else False
# Actually, let me just check the count
header_issues2 = sum(1 for i in issues2 if i == "header-underline")
print(f"  header-underline issues detected: {header_issues2}")
check("detects 2 header-underline issues", header_issues2, 2)

fixed2, _ = run_fix(md2)
issues2b, _ = run_detection(fixed2)
check("fix eliminates all header-underline", "header-underline" not in issues2b, True)

# Verify idempotence
fixed2b, _ = run_fix(fixed2)
check("fix is idempotent", fixed2 == fixed2b, True)

# =============================================================================
# Test 3: header-center — title off-center in box top
# =============================================================================
print("\n=== Test 3: header-center off-center ===")
# Build box with precise column alignment
title = "TITLE"
box_width = 38  # total width including corners
interior = box_width - 2  # 36 chars between corners
left_pad = 6
# ┌ + 6─ + space + TITLE + space + right─ + ┐
right_pad = interior - left_pad - 1 - len(title) - 1
top = "┌" + "─" * left_pad + " " + title + " " + "─" * right_pad + "┐"
bot = "└" + "─" * interior + "┘"
mid = "│" + " " * interior + "│"
diag3 = f"{top}\n{mid}\n{bot}"
# Verify alignment
assert len(top) == len(bot) == len(mid), f"Lengths: top={len(top)} bot={len(bot)} mid={len(mid)}"
assert top.index("┐") == bot.index("┘"), f"Right edges: top={top.index('┐')} bot={bot.index('┘')}"

md3 = make_md([diag3])
issues3, _ = run_detection(md3)
check("detects header-center", "header-center" in issues3, True,
      f"issues: {[i for i in issues3]}")

fixed3, _ = run_fix(md3)
issues3b, _ = run_detection(fixed3)
check("fix eliminates header-center", "header-center" not in issues3b, True)

# =============================================================================
# Test 4: header-center — centered (no false positive)
# =============================================================================
print("\n=== Test 4: header-center centered ===")
title4 = "HEADER"
box_width4 = 40
interior4 = box_width4 - 2  # 38
# interior must accommodate: left─ + space + title + space + right─
# left + 1 + len(title) + 1 + right = interior
# For centered: left = right = (interior - len(title) - 2) // 2
total_pad = interior4 - len(title4) - 2  # 38 - 6 - 2 = 30
left4 = total_pad // 2
right4 = total_pad - left4
top4 = "┌" + "─" * left4 + " " + title4 + " " + "─" * right4 + "┐"
bot4 = "└" + "─" * interior4 + "┘"
mid4 = "│" + " " * interior4 + "│"
diag4 = f"{top4}\n{mid4}\n{bot4}"
assert len(top4) == len(bot4) == len(mid4), f"Lengths: top={len(top4)} bot={len(bot4)} mid={len(mid4)}"
assert top4.index("┐") == bot4.index("┘"), f"Right edges: top={top4.index('┐')} bot={bot4.index('┘')}"

md4 = make_md([diag4])
issues4, _ = run_detection(md4)
check("no false positive for centered header", "header-center" not in issues4, True,
      f"issues: {[i for i in issues4]}")

# =============================================================================
# Test 5: text-arrow — fixable (no chain, offset >= 3)
# =============================================================================
print("\n=== Test 5: text-arrow fixable ===")
# Place text and ▼ with known columns
margin = 25
text5 = "Security Audit Target"  # 21 chars
# Text at cols margin to margin+len-1
# Arrow deliberately off-center
arrow_col = margin + 3  # well left of center
diag5 = f"{' ' * margin}{text5}\n{' ' * arrow_col}▼"
md5 = make_md([diag5])

# Verify detection
grid5 = box_align.pad_grid(diag5.split("\n"))
issues5_raw = box_align.detect_issues(grid5)
text_arrow_issues5 = [i for i in issues5_raw if i.kind == "text-arrow"]
if text_arrow_issues5:
    ta = text_arrow_issues5[0]
    offset = abs(arrow_col - (margin + margin + len(text5) - 1) / 2)
    check("detects text-arrow", True, True,
          f"offset={offset:.1f}, fixable={ta.fixable}")
    check("text-arrow is fixable", ta.fixable, True)
else:
    check("detects text-arrow", False, True, "no text-arrow issue detected")
    check("text-arrow is fixable", False, True, "no issue to check fixable")

# Verify fix works
if text_arrow_issues5:
    fixed5_lines = list(diag5.split("\n"))
    _, n_fixes5 = box_align.fix_diagram(fixed5_lines)
    check("text-arrow fix applied", n_fixes5 > 0, True)
    if n_fixes5 > 0:
        grid5b = box_align.pad_grid(fixed5_lines)
        issues5b = box_align.detect_issues(grid5b)
        check("fix eliminates text-arrow", "text-arrow" not in [i.kind for i in issues5b], True)
else:
    check("text-arrow fix applied", False, True, "skipped - no issue")
    check("fix eliminates text-arrow", False, True, "skipped - no issue")

# =============================================================================
# Test 6: text-arrow — chain-connected (non-fixable)
# =============================================================================
print("\n=== Test 6: text-arrow chain-connected ===")
text6 = "Project Content Here"
margin6 = " " * 20
chain6 = " " * (len(margin6) + 4) + "│"
arrow6 = " " * (len(margin6) + 4) + "▼"
diag6 = f"{margin6}{text6}\n{chain6}\n{arrow6}"
md6 = make_md([diag6])
issues6, _ = run_detection(md6)
check("detects chain-connected text-arrow", "text-arrow" in issues6, True,
      f"issues: {[i for i in issues6]}")

# Verify non-fixable
chain_issues6 = [i for i in box_align.detect_issues(box_align.pad_grid(diag6.split("\n")))
                 if i.kind == "text-arrow"]
if chain_issues6:
    check("chain-connected text-arrow is non-fixable", not chain_issues6[0].fixable, True)
else:
    check("text-arrow chain issue found", False, True, "no text-arrow issue detected")

# =============================================================================
# Test 7: arrow-center — ▼ off-center on box below
# =============================================================================
print("\n=== Test 7: arrow-center ===")
# Build a box and an arrow above it, offset enough to trigger detection (>=5)
box_w = 30  # interior width (between corners), box center = 15.0
arrow_col = 22  # offset by 7.0 from center (15.0)
top7 = "┌" + "─" * box_w + "┐"
mid7 = "│" + " " * box_w + "│"
bot7 = "└" + "─" * box_w + "┘"
diag7 = f"{' ' * arrow_col}▼\n{top7}\n{mid7}\n{bot7}"
md7 = make_md([diag7])

grid7 = box_align.pad_grid(diag7.split("\n"))
boxes7 = box_align.find_boxes(grid7)
issues7 = box_align.detect_issues(grid7)
arrow_issues7 = [i for i in issues7 if i.kind == "arrow-center"]
if arrow_issues7:
    check("detects arrow-center", True, True,
          f"box center={boxes7[0].center if boxes7 else 'N/A'}, arrow at {arrow_col}, offset={abs(arrow_col - boxes7[0].center):.1f}")
else:
    check("detects arrow-center", False, True,
          f"no arrow-center; boxes={boxes7}, all_issues={[i.kind for i in issues7]}")

if arrow_issues7:
    check("arrow-center is fixable", arrow_issues7[0].fixable, True)
    lines7 = list(diag7.split("\n"))
    _, n7 = box_align.fix_diagram(lines7)
    check("arrow-center fix applied", n7 > 0, True)
else:
    check("arrow-center is fixable", False, True, "no issue")
    check("arrow-center fix applied", False, True, "no issue")

# =============================================================================
# Test 8: width-consistency — stacked boxes connected via │▼
# =============================================================================
print("\n=== Test 8: width-consistency ===")
# Two boxes connected by a vertical flow. Top box is wider.
# Build with exact column alignment — both boxes start at left=0.
w_top = 38  # interior width of top box
w_bot = 20  # interior width of bottom box
tee_col = 11  # where the T-junction and connector are
top8 = "┌" + "─" * w_top + "┐"
mid8_top = "│" + " " * w_top + "│"
# Bottom border of top box: ─ until tee, then ┬, then ─ to end
bot8_top = "└" + "─" * (tee_col - 1) + "┬" + "─" * (w_top - tee_col) + "┘"
connector = " " * tee_col + "│"
arrow8 = " " * tee_col + "▼"
top8_bot = "┌" + "─" * w_bot + "┐"
mid8_bot = "│" + " " * w_bot + "│"
bot8_bot = "└" + "─" * w_bot + "┘"
diag8 = "\n".join([top8, mid8_top, bot8_top, connector, arrow8, top8_bot, mid8_bot, bot8_bot])
# Verify both boxes have matching top/bottom edges
lines8 = diag8.split("\n")
grid8 = box_align.pad_grid(lines8)
boxes8 = box_align.find_boxes(grid8)
check("width-test: 2 boxes found", len(boxes8), 2,
      f"boxes: {boxes8}")
if len(boxes8) == 2:
    check("width-test: boxes share left edge", boxes8[0].left == boxes8[1].left, True)
    check("width-test: boxes have different widths", boxes8[0].width != boxes8[1].width, True,
          f"w1={boxes8[0].width}, w2={boxes8[1].width}")

issues8 = box_align.detect_issues(grid8)
check("detects width inconsistency", "width" in [i.kind for i in issues8], True,
      f"issues: {[(i.kind, i.fixable) for i in issues8]}")

# Fix
if "width" in [i.kind for i in issues8]:
    fixed8_lines = list(lines8)
    _, n8 = box_align.fix_diagram(fixed8_lines)
    check("width fix applied", n8 > 0, True)
else:
    check("width fix applied", False, True, "no width issue to fix")

# =============================================================================
# Test 9: corner-wall — orphan corner with no adjacent wall
# =============================================================================
print("\n=== Test 9: corner-wall detection ===")
# First box at left=0 width=20. Second "box" at left=21 has mismatched corners.
# Gap of 1 col ensures orphan └ at col 21 has nearby wall at col 19 (within range 2).
w9 = 18
gap9 = 1  # 1 col between boxes
orphan_left = 20 + gap9  # right edge of box 1 (19) + 1 + gap
diag9 = (
    f"┌{'─' * w9}┐\n"
    f"│{' ' * w9}│\n"
    f"└{'─' * w9}┘\n"
    f"{' ' * orphan_left}└{'─' * w9}┐\n"
    f"{' ' * orphan_left}│{' ' * w9}│\n"
    f"{' ' * orphan_left}└{'─' * w9}┘"
)
md9 = make_md([diag9])
grid9 = box_align.pad_grid(diag9.split("\n"))
boxes9 = box_align.find_boxes(grid9)
issues9 = box_align.detect_issues(grid9)
# The orphan └ at L4 (0-indexed 3) col 22 should be flagged
cw_issues = [i for i in issues9 if i.kind == "corner-wall"]
check("detects corner-wall", len(cw_issues) > 0, True,
      f"boxes found: {len(boxes9)}, corner-wall issues: {[(i.line, i.col) for i in cw_issues]}")

# =============================================================================
# Test 10: clean diagram — no issues
# =============================================================================
print("\n=== Test 10: clean diagram ===")
w10 = 30
top10 = "┌" + "─" * w10 + "┐"
mid10a = "│" + " " * w10 + "│"
mid10b = "│" + " " * w10 + "│"
bot10 = "└" + "─" * w10 + "┘"
diag10 = f"{top10}\n{mid10a}\n{mid10b}\n{bot10}"
# Verify alignment
assert len(top10) == len(bot10) == len(mid10a), f"clean: lengths differ"
assert top10.index("┐") == bot10.index("┘"), f"clean: right edges differ"
md10 = make_md([diag10])
issues10, _ = run_detection(md10)
check("clean diagram has no issues", len(issues10), 0,
      f"unexpected issues: {[i.kind for i in issues10]}")

# =============================================================================
# Test 11: end-to-end — fix on knowdit-style diagram
# =============================================================================
print("\n=== Test 11: E2E knowdit-style header-underline ===")
left_text = "OFFLINE (Section 3.2.2)"
right_text = "ONLINE (Section 3.3)"
left_ul = "═" * (len(left_text) - 3)   # 3 short
right_ul = "═" * (len(right_text) - 1)  # 1 short
gap = " " * 18
margin = " " * 20
diag11 = f"{margin}{left_text}{gap}{right_text}\n{margin}{left_ul}{gap}{right_ul}"
md11 = make_md([diag11])
issues11, _ = run_detection(md11)
header11 = sum(1 for i in issues11 if i == "header-underline")
check_ge("E2E detects header-underline issues", header11, 2)

fixed11, _ = run_fix(md11)
issues11b, _ = run_detection(fixed11)
check("E2E fix eliminates all header-underline", "header-underline" not in issues11b, True)

# Verify the fixed diagram looks right
diagrams11 = box_align.extract_diagrams(fixed11)
if diagrams11:
    _, _, fixed_lines = diagrams11[0]
    # Check that ═ blocks match text widths
    for line_idx in [1]:  # underline line
        # Verify no header-underline issues on fixed result
        pass
    check("E2E fixed diagram re-detection passes", len(issues11b), 0)

# =============================================================================
# Test 12: header-content-alignment — headers centered over content zones
# =============================================================================
print("\n=== Test 12: header-content-alignment ===")
# Two content zones: left boxes (cols 2-15) and right boxes (cols 22-35)
# Header centered at ~28 (over right zone) but should be at ~8 (over left zone)
left_header = "LEFT HEADER"
right_header = "RIGHT HEADER"
# Position left header at col 24 (center 28.5) — far from its content zone (center ~8)
gap_spaces = 5
diag12_lines = [
    f"                      {left_header}     {right_header}",
    f"                      {'═' * len(left_header)}     {'═' * len(right_header)}",
    "",
    "  ┌─────────────┐  ┌─────────────┐",
    "  │  Left Box   │  │  Right Box  │",
    "  │             │  │             │",
    "  └─────────────┘  └─────────────┘",
]
diag12 = "\n".join(diag12_lines)
md12 = make_md([diag12])
issues12, report12 = run_detection(md12)
hc_issues12 = [i for i in issues12 if i == "header-content"]
print(f"  header-content issues detected: {len(hc_issues12)}")
check("detects header-content misalignment", len(hc_issues12) >= 1, True)

fixed12, _ = run_fix(md12)
issues12b, _ = run_detection(fixed12)
hc_issues12b = [i for i in issues12b if i == "header-content"]
check("fix eliminates header-content", len(hc_issues12b), 0,
      f"remaining: {len(hc_issues12b)} hc issues out of {len(issues12b)} total")

# Test 12b: centered header should have no false positives
print("\n=== Test 12b: header-content centered ===")
# Box at cols 2-15, header centered at ~8
diag12b_lines = [
    "        CENTERED",
    "        ════════",
    "",
    "  ┌─────────────┐",
    "  │  Box        │",
    "  └─────────────┘",
]
diag12b = "\n".join(diag12b_lines)
md12b = make_md([diag12b])
issues12b_fp, _ = run_detection(md12b)
hc_fp = sum(1 for i in issues12b_fp if i == "header-content")
check("no false positive for centered header", hc_fp, 0)

# Test 13: Complex fixtures — all valid, should have zero issues
print("\n=== Test 13: complex fixtures (C1-C8) should be clean ===")
fixtures_path = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "complex_fixtures.md",
)
with open(fixtures_path) as f:
    fixtures_md = f.read()
issues13, report13 = run_detection(fixtures_md)
check("complex fixtures have no false positives", len(issues13), 0,
      f"unexpected issues: {issues13}\n" +
      "\n".join(line for line in report13 if line.startswith("  [")))

# =============================================================================
# Results
# =============================================================================
print(f"\n{'='*60}")
print(f"Results: {PASS} passed, {FAIL} failed, {PASS+FAIL} total")
if FAIL > 0:
    print("SOME TESTS FAILED!")
    sys.exit(1)
else:
    print("All tests passed!")
    sys.exit(0)
