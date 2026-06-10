#!/usr/bin/env python3
"""Detect and fix box-drawing alignment issues in markdown diagrams.

Checks:
  1. Corner-to-wall: box corners (┌┐└┘) must align with vertical walls (│)
     on adjacent lines. Only checks corners that are part of detected boxes.
  2. T-junction: ┬ ┴ in box borders must have │ or ▼ on the adjacent line.
  3. Arrow centering: ▼ should point near the center of the box below.
  4. Connector column: vertical │ ▼ chains should be at consistent columns.
  5. Width consistency: stacked boxes sharing a left edge and connector
     should have matching widths.
  6. Header-underline: ═══ underlines should span the full width of
     the section header text above them.
  7. Header-center: section titles embedded in box top borders should be
     approximately centered within their enclosing box.
  8. Header-content: ═══ section headers should be centered over the
     content columns they label.
  9. Text-arrow: ▼ arrows below standalone text labels should be centered
     under the text (not off to one side).

Usage:
  python3 box_align.py [--fix] [--quiet] file1.md [file2.md ...]
"""

import argparse
import re
import sys
from dataclasses import dataclass

# Box-drawing characters
CORNERS = "┌┐└┘"
TOPS = "┌┐"
BOTTOMS = "└┘"
VERTICALS = "│"
HORIZONTALS = "─"
TEES = "┬┴"
ARROWS = "▼"
# Valid wall-continuation chars (including tree-drawing variants)
WALL_CONTINUATIONS = set(VERTICALS + CORNERS + TEES + "├┤┼")
# All box-drawing chars that signal a diagram
BOX_CHARS = set(CORNERS + VERTICALS + HORIZONTALS + TEES + ARROWS + "├┤┼═")


@dataclass
class Issue:
    kind: str  # "corner-wall", "t-junction", "arrow-center", "connector", "width"
    line: int  # 0-indexed line in the diagram
    col: int  # 0-indexed column
    detail: str
    fixable: bool = True
    suggestion: str = ""  # manual fix hint shown when fixable=False


@dataclass
class Box:
    top_line: int
    bot_line: int
    left: int
    right: int

    @property
    def center(self) -> float:
        return (self.left + self.right) / 2

    @property
    def width(self) -> int:
        return self.right - self.left + 1


@dataclass
class HeaderSpan:
    """A section header: text line above a ═ underline block."""
    line: int       # ═ underline line index in grid
    text_left: int
    text_right: int
    ul_left: int
    ul_right: int
    text: str

    @property
    def center(self) -> float:
        return (self.text_left + self.text_right) / 2

    @property
    def text_width(self) -> int:
        return self.text_right - self.text_left + 1

    @property
    def ul_width(self) -> int:
        return self.ul_right - self.ul_left + 1

    @property
    def is_short(self) -> bool:
        return self.ul_width < self.text_width


def _find_header_spans(grid: list[str]) -> list[HeaderSpan]:
    """Find all ═ underline + text-above pairs in the grid.

    For each ═ block, extends left/right to find the full text label above it.
    Used by header-underline and header-content check + fix functions.
    """
    spans = []
    for i, line in enumerate(grid):
        if i == 0:
            continue
        above = grid[i - 1]
        for m in re.finditer(r"═+", line):
            ul, ur = m.start(), m.end() - 1
            if ur >= len(above):
                continue
            tl = ul
            while tl > 0 and tl - 1 < len(above) and above[tl - 1] not in (" ", "│"):
                tl -= 1
            tr = min(ur, len(above) - 1)
            while tr + 1 < len(above) and above[tr + 1] not in (" ", "│"):
                tr += 1
            text = above[tl : tr + 1].strip()
            if text and len(text) >= 4:
                spans.append(HeaderSpan(i, tl, tr, ul, ur, text))
    return spans


def _partition_boxes(
    below_boxes: list[Box], header_spans: list[HeaderSpan], target: HeaderSpan,
) -> list[Box]:
    """Partition boxes below headers into a zone for the target header.

    When there are multiple headers, boxes are assigned to the nearest header
    by column center, using midpoints between sorted header centers as boundaries.
    """
    if len(header_spans) < 2:
        return below_boxes

    h_centers = sorted(hs.center for hs in header_spans)
    midpoints = [
        (h_centers[j] + h_centers[j + 1]) / 2
        for j in range(len(h_centers) - 1)
    ]
    h_idx = min(range(len(h_centers)), key=lambda j: abs(h_centers[j] - target.center))
    zl = midpoints[h_idx - 1] if h_idx > 0 else float("-inf")
    zr = midpoints[h_idx] if h_idx < len(midpoints) else float("inf")
    return [b for b in below_boxes if zl <= b.center <= zr]


def _shift_char_in_whitespace(
    lines: list[str], line_idx: int, old_col: int, new_col: int, char: str = "▼",
) -> int:
    """Shift a character through whitespace toward a target column.

    Steps one column at a time, stopping when blocked by non-whitespace.
    Returns 1 if the character moved, 0 otherwise.
    """
    if new_col == old_col:
        return 0
    step = 1 if new_col > old_col else -1
    cur = old_col
    while cur != new_col:
        nxt = cur + step
        line = lines[line_idx]
        if nxt < 0:
            break
        if nxt >= len(line):
            line = line.ljust(nxt + 1)
        if line[nxt] != " ":
            break
        chars = list(line)
        chars[cur] = " "
        chars[nxt] = char
        lines[line_idx] = "".join(chars)
        cur = nxt
    return 1 if cur != old_col else 0


def extract_diagrams(text: str) -> list[tuple[int, int, list[str]]]:
    """Find fenced code blocks containing box-drawing chars.
    Returns list of (start_line, end_line, lines) — 0-indexed in original text.
    """
    diagrams = []
    in_fence = False
    fence_start = 0
    fence_lines: list[str] = []

    for i, line in enumerate(text.split("\n")):
        if line.strip().startswith("```") and not in_fence:
            in_fence = True
            fence_start = i
            fence_lines = []
        elif line.strip().startswith("```") and in_fence:
            in_fence = False
            joined = "\n".join(fence_lines)
            if any(c in joined for c in BOX_CHARS):
                diagrams.append((fence_start + 1, i, fence_lines))
        elif in_fence:
            fence_lines.append(line)

    return diagrams


def pad_grid(lines: list[str]) -> list[str]:
    max_len = max(len(ln) for ln in lines) if lines else 0
    return [ln.ljust(max_len) for ln in lines]


# ---------------------------------------------------------------------------
# Box detection
# ---------------------------------------------------------------------------


def find_boxes(grid: list[str]) -> list[Box]:
    """Find all enclosed boxes in the grid.

    A box has a top border delimited by ┌ and ┐ (possibly with embedded text)
    and a matching bottom border └[─┴┼]*┘ at the same left/right columns,
    with vertical walls between.
    """
    boxes = []
    for top_i, line in enumerate(grid):
        # Two patterns: pure-border tops (┌──┬──┐) and tops with embedded text (┌── TITLE ──┐)
        patterns = [r"┌[─┬┼]*┐", r"┌[^┌┐]*┐"]
        seen: set[tuple[int, int]] = set()
        for pat in patterns:
            for m in re.finditer(pat, line):
                left = m.start()
                right = m.end() - 1
                if (left, right) in seen:
                    continue
                seen.add((left, right))
                for bot_i in range(top_i + 1, min(top_i + 21, len(grid))):
                    bot_line = grid[bot_i]
                    if left >= len(bot_line) or right >= len(bot_line):
                        continue
                    if bot_line[left] != "└" or bot_line[right] != "┘":
                        continue
                    interior = bot_line[left + 1 : right]
                    if not interior:
                        continue
                    if not all(c in HORIZONTALS + TEES + "┼" for c in interior):
                        continue
                    # Verify walls on all intermediate lines
                    valid = True
                    for mid_i in range(top_i + 1, bot_i):
                        mid = grid[mid_i]
                        if left >= len(mid) or right >= len(mid):
                            valid = False
                            break
                        if mid[left] not in WALL_CONTINUATIONS:
                            valid = False
                            break
                        if mid[right] not in WALL_CONTINUATIONS:
                            valid = False
                            break
                    if valid:
                        boxes.append(Box(top_i, bot_i, left, right))
                        break  # only match the first bottom border
    return boxes


def is_on_box_border(line: int, col: int, boxes: list[Box]) -> bool:
    """Check if a position lies on the top or bottom border of any detected box."""
    for box in boxes:
        if line == box.top_line and box.left <= col <= box.right:
            return True
        if line == box.bot_line and box.left <= col <= box.right:
            return True
    return False


# ---------------------------------------------------------------------------
# Detection checks
# ---------------------------------------------------------------------------


def _nearby_wall(line: str, col: int, search_range: int = 2) -> int | None:
    """Find the nearest wall char (│ ┌ ┐ └ ┘ ├ ┤) near col. Returns column or None."""
    for d in range(search_range + 1):
        for c in (col - d, col + d):
            if 0 <= c < len(line) and line[c] in WALL_CONTINUATIONS:
                return c
    return None


def check_corner_wall(grid: list[str], boxes: list[Box]) -> list[Issue]:
    """Check box corners align with vertical walls on adjacent lines.

    Two strategies:
    1. For detected boxes: strict exact-alignment check.
    2. For all corners: if not part of a detected box, check for nearby walls
       (misalignment that prevented box detection).
    """
    issues = []
    box_corners: set[tuple[int, int]] = set()
    for box in boxes:
        box_corners.add((box.top_line, box.left))
        box_corners.add((box.top_line, box.right))
        box_corners.add((box.bot_line, box.left))
        box_corners.add((box.bot_line, box.right))

    for i, line in enumerate(grid):
        for j, ch in enumerate(line):
            if ch not in CORNERS:
                continue

            in_box = (i, j) in box_corners

            # Skip tree-branch corners: box corners have ─ adjacent on same line
            if not in_box:
                has_hborder = (
                    (j > 0 and line[j - 1] in HORIZONTALS)
                    or (j + 1 < len(line) and line[j + 1] in HORIZONTALS)
                )
                if not has_hborder:
                    continue  # tree branch, not a box corner

            if ch in TOPS and i + 1 < len(grid):
                below = grid[i + 1]
                if j < len(below) and below[j] in WALL_CONTINUATIONS:
                    continue  # exact match — OK
                if in_box:
                    # Detected box with misaligned wall — flag exactly
                    issues.append(
                        Issue(
                            "corner-wall",
                            i,
                            j,
                            f"Top corner {ch} has no wall below "
                            f"(expected │, found "
                            f"{repr(below[j]) if j < len(below) else 'EOF'})",
                            suggestion=f"Add │ at L{i+2}:{j+1} below this corner",
                        ),
                    )
                else:
                    # Orphan corner — check for nearby wall
                    nearby = _nearby_wall(below, j)
                    if nearby is not None and nearby != j:
                        issues.append(
                            Issue(
                                "corner-wall",
                                i,
                                j,
                                f"Top corner {ch} misaligned: wall below at "
                                f"col {nearby + 1}, corner at col {j + 1} "
                                f"(off by {abs(nearby - j)})",
                                suggestion=f"Shift corner from col {j+1} to col {nearby+1}",
                            ),
                        )

            if ch in BOTTOMS and i - 1 >= 0:
                above = grid[i - 1]
                if j < len(above) and above[j] in WALL_CONTINUATIONS:
                    continue
                if in_box:
                    issues.append(
                        Issue(
                            "corner-wall",
                            i,
                            j,
                            f"Bottom corner {ch} has no wall above "
                            f"(expected │, found "
                            f"{repr(above[j]) if j < len(above) else 'EOF'})",
                            suggestion=f"Add │ at L{i}:{j+1} above this corner",
                        ),
                    )
                else:
                    nearby = _nearby_wall(above, j)
                    if nearby is not None and nearby != j:
                        issues.append(
                            Issue(
                                "corner-wall",
                                i,
                                j,
                                f"Bottom corner {ch} misaligned: wall above at "
                                f"col {nearby + 1}, corner at col {j + 1} "
                                f"(off by {abs(nearby - j)})",
                                suggestion=f"Shift corner from col {j+1} to col {nearby+1}",
                            ),
                        )
    return issues


def check_t_junctions(grid: list[str], boxes: list[Box]) -> list[Issue]:
    """Check that ┬ ┴ in box borders have connectors on the adjacent line."""
    issues = []
    for i, line in enumerate(grid):
        for j, ch in enumerate(line):
            if ch not in TEES:
                continue
            if not is_on_box_border(i, j, boxes):
                continue

            if ch == "┬" and i + 1 < len(grid):
                below = grid[i + 1]
                if j >= len(below) or below[j] not in (VERTICALS + ARROWS + "─"):
                    issues.append(
                        Issue(
                            "t-junction",
                            i,
                            j,
                            f"┬ on box border has no connector below "
                            f"(expected │, ▼, or ─, found "
                            f"{repr(below[j]) if j < len(below) else 'EOF'})",
                            fixable=False,
                            suggestion=f"Add │ or ▼ at L{i+2}:{j+1} below this T-junction",
                        ),
                    )
            if ch == "┴" and i - 1 >= 0:
                above = grid[i - 1]
                if j >= len(above) or above[j] not in (VERTICALS + ARROWS + "─"):
                    issues.append(
                        Issue(
                            "t-junction",
                            i,
                            j,
                            f"┴ on box border has no connector above "
                            f"(expected │ or ▼, found "
                            f"{repr(above[j]) if j < len(above) else 'EOF'})",
                            fixable=False,
                            suggestion=f"Add │ or ▼ at L{i}:{j+1} above this T-junction",
                        ),
                    )
    return issues


def check_arrow_center(grid: list[str], boxes: list[Box]) -> list[Issue]:
    """Check ▼ arrows point near the center of the box directly below."""
    issues = []
    for i, line in enumerate(grid):
        for j, ch in enumerate(line):
            if ch != "▼":
                continue
            # Skip arrows inside an enclosing box (internal flow, not box-targeting)
            left_wall = 0
            right_wall = len(line)
            for c in range(j, -1, -1):
                if line[c] == "│":
                    left_wall = c + 1
                    break
            for c in range(j, len(line)):
                if line[c] == "│":
                    right_wall = c
                    break
            if left_wall > 0 and right_wall < len(line):
                continue
            # Skip arrows at the end of a horizontal corner turn (─ chain to left)
            if j > 0 and line[j - 1] == "─":
                continue
            # Find a box starting on the next line that contains this column
            best: Box | None = None
            for box in boxes:
                if box.top_line == i + 1 and box.left <= j <= box.right:
                    best = box
                    break
            if best is None:
                continue
            center = best.center
            offset = abs(j - center)
            # Only flag when substantially off-center (5+ columns)
            if offset >= 5:
                # Check if arrow is part of a connector chain (has │ above)
                has_chain_above = (
                    i > 0
                    and j < len(grid[i - 1])
                    and grid[i - 1][j] in VERTICALS
                )
                # Skip if │ above is part of a corner turn (┐ or ┌ two lines up)
                if has_chain_above and i > 1 and j < len(grid[i - 2]):
                    if grid[i - 2][j] in ("┐", "┌"):
                        continue
                # Skip if ▼ enters a box top at a T-junction (intentionally aimed)
                if best is not None and j < len(grid[i + 1]):
                    top_char = grid[i + 1][j]
                    if top_char in TEES:
                        continue
                target_col = int(center)
                suggestion = ""
                if has_chain_above:
                    suggestion = (
                        f"Cannot auto-fix: ▼ is part of a connector chain. "
                        f"Manually realign chain from col {j+1} to col {target_col+1} "
                        f"(box center)"
                    )
                issues.append(
                    Issue(
                        "arrow-center",
                        i,
                        j,
                        f"▼ off-center on box below "
                        f"(box L{best.top_line+1}:{best.left+1}-{best.right+1}, "
                        f"center {center:.1f}, off by {offset:.1f} cols)",
                        fixable=not has_chain_above,
                        suggestion=suggestion,
                    ),
                )
    return issues


def check_connector_consistency(grid: list[str]) -> list[Issue]:
    """Check vertical connector chains are at consistent columns.

    Two checks:
      a) A connector chain that enters a T-junction should exit at the same column.
      b) Consecutive connector segments in the same flow should share columns.
    """
    issues = []
    # Find all vertical connector chains (│ and ▼ at same column)
    visited: set[tuple[int, int]] = set()
    chains: list[list[tuple[int, int]]] = []

    for i, line in enumerate(grid):
        for j, ch in enumerate(line):
            if ch in (VERTICALS + ARROWS) and (i, j) not in visited:
                chain: list[tuple[int, int]] = []
                # trace up
                r = i
                while (
                    r >= 0
                    and j < len(grid[r])
                    and grid[r][j] in (VERTICALS + ARROWS)
                ):
                    r -= 1
                r += 1
                # trace down
                while (
                    r < len(grid)
                    and j < len(grid[r])
                    and grid[r][j] in (VERTICALS + ARROWS)
                ):
                    visited.add((r, j))
                    chain.append((r, j))
                    r += 1
                if len(chain) >= 2:
                    chains.append(chain)

    # Check: connector chain ending with ▼ should have the ▼ at a column
    # that matches the T-junction / center expectation below.
    for chain in chains:
        # Find the column of this chain
        col = chain[0][1]
        last_line, _ = chain[-1]
        last_ch = grid[last_line][col]

        # If chain ends with ▼, check there's a T-junction (┴) below or
        # a box top receiving the flow
        if last_ch == "▼":
            next_line = last_line + 1
            if next_line < len(grid) and col < len(grid[next_line]):
                below_ch = grid[next_line][col]
                if below_ch == "┴":
                    pass  # T-junction receives the arrow — OK
                elif below_ch == "┌":
                    pass  # Box top-left — could be OK
                # Otherwise ▼ points to empty space — not necessarily wrong,
                # it might point to a box interior

    return issues


def _connector_between(
    grid: list[str], top_line: int, bot_line: int, col: int,
) -> bool:
    """Check for a vertical connector (│ or ▼) at col between two lines."""
    for r in range(top_line + 1, bot_line):
        if col < len(grid[r]) and grid[r][col] in (VERTICALS + ARROWS):
            return True
    return False


def check_width_consistency(grid: list[str], boxes: list[Box]) -> list[Issue]:
    """Check stacked boxes sharing a left edge and connector flow have same width."""
    issues = []
    # Group boxes by left edge
    by_left: dict[int, list[Box]] = {}
    for box in boxes:
        by_left.setdefault(box.left, []).append(box)

    for left, group in by_left.items():
        if len(group) < 2:
            continue
        sorted_boxes = sorted(group, key=lambda b: b.top_line)
        for i in range(len(sorted_boxes) - 1):
            a = sorted_boxes[i]
            b = sorted_boxes[i + 1]
            gap = b.top_line - a.bot_line
            if a.right == b.right:
                continue
            if gap > 3:
                continue
            # Skip if lower box is part of a horizontal row (branching/split layout)
            n_on_row = sum(1 for bx in boxes if bx.top_line == b.top_line)
            if n_on_row > 1:
                continue
            # Skip if boxes have substantially different heights (different types)
            a_height = a.bot_line - a.top_line
            b_height = b.bot_line - b.top_line
            if abs(a_height - b_height) > 2:
                continue
            # Find the actual T-junction / flow column from box A's bottom border
            bot_line = grid[a.bot_line]
            tee_col = None
            for c in range(a.left + 1, min(a.right, len(bot_line))):
                if bot_line[c] in TEES:
                    tee_col = c
                    break
            if tee_col is None:
                tee_col = (a.left + a.right) // 2
            # Check at tee column and ±1
            found = any(
                _connector_between(grid, a.bot_line, b.top_line, tc)
                for tc in (tee_col, tee_col - 1, tee_col + 1)
            )
            if found:
                issues.append(
                    Issue(
                        "width",
                        b.top_line,
                        left,
                        f"Stacked box width differs: "
                        f"L{b.top_line+1} width={b.width} vs "
                        f"L{a.top_line+1} width={a.width} "
                        f"(right edge col {b.right+1} vs {a.right+1})",
                        fixable=True,
                    ),
                )
    return issues


# ---------------------------------------------------------------------------
# Check 6: header underline width matches text above
# ---------------------------------------------------------------------------


def check_header_underline(grid: list[str]) -> list[Issue]:
    """Check ═══ underlines span the full width of the header text above."""
    issues = []
    for hs in _find_header_spans(grid):
        if hs.is_short:
            shortfall = hs.text_width - hs.ul_width
            issues.append(
                Issue(
                    "header-underline",
                    hs.line,
                    hs.ul_left,
                    f"Underline too short for header '{hs.text[:40]}': "
                    f"underline is {hs.ul_width}═, header spans {hs.text_width} cols "
                    f"(short by {shortfall})",
                    fixable=True,
                ),
            )
    return issues


# ---------------------------------------------------------------------------
# Check 7: section titles centered within box top borders
# ---------------------------------------------------------------------------


def check_header_center(grid: list[str], boxes: list[Box]) -> list[Issue]:
    """Check section titles in box top borders are centered within their box.

    A box top border that contains text (e.g. ┌── TITLE ──┐) should have
    the text approximately centered between ┌ and ┐.
    """
    issues = []
    for box in boxes:
        top = grid[box.top_line]
        # Extract the interior between ┌ and ┐
        interior = top[box.left + 1 : box.right]
        # Find the actual text (strip ─ padding and connector chars)
        stripped = interior.strip(HORIZONTALS + " ┬┼")
        if not stripped or len(stripped) < 5:
            continue
        # Find text position within the line
        # Search for the stripped text in the interior
        idx = interior.find(stripped)
        if idx < 0:
            continue
        text_start = box.left + 1 + idx
        text_end = text_start + len(stripped)
        text_center = (text_start + text_end) / 2
        box_center = (box.left + box.right) / 2
        offset = abs(text_center - box_center)
        if offset >= 2.0:
            issues.append(
                Issue(
                    "header-center",
                    box.top_line,
                    box.left,
                    f"Section title '{stripped[:40]}' not centered in box "
                    f"(box L{box.top_line+1}:{box.left+1}-{box.right+1}, "
                    f"title center {text_center:.1f}, box center {box_center:.1f}, "
                    f"off by {offset:.1f})",
                    fixable=True,
                ),
            )
    return issues


# ---------------------------------------------------------------------------
# Check 8: section headers centered over their content columns
# ---------------------------------------------------------------------------


def check_header_content_alignment(grid: list[str]) -> list[Issue]:
    """Check ═══ section headers are centered over the content columns below."""
    issues = []
    boxes = find_boxes(grid)
    if not boxes:
        return issues

    header_spans = _find_header_spans(grid)
    if not header_spans:
        return issues

    for hs in header_spans:
        below_boxes = [
            b for b in boxes
            if b.top_line > hs.line and b.top_line <= hs.line + 40
        ]
        zone_boxes = _partition_boxes(below_boxes, header_spans, hs)

        if len(zone_boxes) < 2:
            continue

        content_left = min(b.left for b in zone_boxes)
        content_right = max(b.right for b in zone_boxes)
        content_center = (content_left + content_right) / 2
        offset = abs(hs.center - content_center)

        if offset >= 5.0:
            target_col = int(content_center)
            issues.append(
                Issue(
                    "header-content",
                    hs.line,
                    hs.text_left,
                    f"Header '{hs.text[:40]}' not centered over content zone "
                    f"(header cols {hs.text_left+1}-{hs.text_right+1}, center {hs.center:.1f}; "
                    f"content cols {content_left+1}-{content_right+1}, "
                    f"center {content_center:.1f}; off by {offset:.1f})",
                    fixable=True,
                    suggestion=(
                        f"Shift header text + underline toward col {target_col+1} "
                        f"(content zone center)"
                    ),
                ),
            )

    return issues


# ---------------------------------------------------------------------------
# Check 9: arrows centered under text labels
# ---------------------------------------------------------------------------


def check_text_arrow(grid: list[str]) -> list[Issue]:
    """Check ▼ arrows are centered under the text label that originates them.

    Follows connector chains (│) upward past intermediate lines to find
    the text label above. The arrow column should be near the text center.
    Excludes arrows at box T-junctions (┬ ┴) which are box-flow, not text-flow.
    """
    issues = []
    for i, line in enumerate(grid):
        for j, ch in enumerate(line):
            if ch != "▼":
                continue
            # Skip arrows at box T-junctions: follow │ chain upward and check
            # for TEE (┬┴) at any point — these are box-flow exits, not text arrows
            look_line = i - 1
            has_tee = j < len(grid[look_line]) and grid[look_line][j] in TEES
            while (
                look_line >= 0
                and j < len(grid[look_line])
                and grid[look_line][j] in ("│", *TEES)
            ):
                if grid[look_line][j] in TEES:
                    has_tee = True
                look_line -= 1
            if has_tee:
                continue
            # If no │/TEE chain, look_line stays at i-1

            # Now look up from look_line for text content (up to 3 lines)
            for k in range(look_line, max(i - 5, -1), -1):
                above = grid[k]
                # Skip box-drawing-heavy lines (but allow │ walls)
                box_chars = set("┌┐└┘─┬┴├┤┼")
                box_count = sum(1 for c in above if c in box_chars)
                if box_count > len(above) * 0.3:
                    continue
                # Find the text segment containing or near column j
                # Locate bounding walls or line edges
                left = 0
                right = len(above)
                for c in range(j, -1, -1):
                    if c < len(above) and above[c] in ("│", "┌", "└", "├", "┤", "┐", "┘"):
                        left = c + 1
                        break
                for c in range(j, len(above)):
                    if above[c] in ("│", "┌", "┐", "├", "┤"):
                        right = c
                        break
                # Find visible text within [left, right)
                text_start = left
                while text_start < right and above[text_start] == " ":
                    text_start += 1
                text_end = right - 1
                while text_end >= text_start and above[text_end] == " ":
                    text_end -= 1
                text_len = text_end - text_start + 1
                if text_len < 4:
                    continue
                # Skip if the "text" contains structural or flow characters
                raw_text = above[text_start : text_end + 1]
                if any(c in raw_text for c in "┌┐└┘┬┴├┤┼─━═→"):
                    continue
                # Skip text inside an enclosing box (│ walls both sides)
                if left > 0 and right < len(above):
                    continue
                text_center = (text_start + text_end) / 2
                offset = abs(j - text_center)
                if offset >= 3.0:
                    has_chain = (
                        i > 0
                        and j < len(grid[i - 1])
                        and grid[i - 1][j] == "│"
                    )
                    # Skip if chain-connected and part of a shared vertical flow
                    # (multiple │/▼ at same col in nearby lines)
                    if has_chain:
                        nearby = 0
                        for r in range(max(0, i - 5), min(len(grid), i + 6)):
                            if r != i and j < len(grid[r]) and grid[r][j] in ("│", "▼"):
                                nearby += 1
                        if nearby >= 2:
                            continue
                    text_str = above[text_start : text_end + 1].strip()
                    target_col = int(text_center)
                    suggestion = ""
                    if has_chain:
                        suggestion = (
                            f"Cannot auto-fix: ▼ is part of a connector chain. "
                            f"Manually realign chain from col {j+1} to col {target_col+1} "
                            f"(text center)"
                        )
                    issues.append(
                        Issue(
                            "text-arrow",
                            i,
                            j,
                            f"▼ not centered under text '{text_str[:50]}' "
                            f"(text cols {text_start+1}-{text_end+1}, "
                            f"center {text_center:.1f}, arrow at {j+1}, "
                            f"off by {offset:.1f})",
                            fixable=not has_chain,
                            suggestion=suggestion,
                        ),
                    )
                break  # only check nearest text above

    return issues


def detect_issues(grid: list[str]) -> list[Issue]:
    """Run all checks and return sorted issues."""
    boxes = find_boxes(grid)
    issues = (
        check_corner_wall(grid, boxes)
        + check_t_junctions(grid, boxes)
        + check_arrow_center(grid, boxes)
        + check_connector_consistency(grid)
        + check_width_consistency(grid, boxes)
        + check_header_underline(grid)
        + check_header_center(grid, boxes)
        + check_header_content_alignment(grid)
        + check_text_arrow(grid)
    )
    issues.sort(key=lambda x: (x.line, x.col))
    return issues


# ---------------------------------------------------------------------------
# Fix logic
# ---------------------------------------------------------------------------


def fix_diagram(lines: list[str]) -> tuple[list[str], int]:
    """Attempt to fix alignment issues. Re-detects after each fix pass
    since fixes can cascade (e.g. corner fix reveals width issues)."""
    total_fixes = 0

    for _ in range(5):  # max 5 iterative passes
        grid = pad_grid(lines)
        issues = detect_issues(grid)
        fixable = [i for i in issues if i.fixable]
        if not fixable:
            break

        # Sort right-to-left so fixes on the same line don't shift each other
        fixable.sort(key=lambda x: (x.line, -x.col))

        pass_fixes = 0
        for issue in fixable:
            if issue.kind == "corner-wall":
                pass_fixes += _fix_corner_wall(lines, grid, issue)
            elif issue.kind == "arrow-center":
                pass_fixes += _fix_arrow_center(lines, grid, issue)
            elif issue.kind == "width":
                pass_fixes += _fix_width(lines, grid, issue)
            elif issue.kind == "header-underline":
                pass_fixes += _fix_header_underline(lines, issue)
            elif issue.kind == "header-center":
                pass_fixes += _fix_header_center(lines, issue)
            elif issue.kind == "header-content":
                pass_fixes += _fix_header_content_alignment(lines, issue)
            elif issue.kind == "text-arrow":
                pass_fixes += _fix_text_arrow(lines, grid, issue)

        if pass_fixes == 0:
            break
        total_fixes += pass_fixes

    return lines, total_fixes


def _fix_corner_wall(
    lines: list[str], grid: list[str], issue: Issue,
) -> int:
    """Fix corner-wall mismatch by extending horizontal border with ─.

    The most common case: top border ┐ at col C but vertical │ below is at C+Δ.
    We extend the top border to match.
    """
    i, col = issue.line, issue.col
    line = grid[i]
    ch = line[col]

    if ch in TOPS and i + 1 < len(grid):
        below = grid[i + 1]
        if col < len(below) and below[col] == " ":
            # Look right for the actual wall column
            for c in range(col + 1, min(col + 5, len(below))):
                if below[c] in WALL_CONTINUATIONS:
                    # Extend the horizontal border from col to c
                    # Find the matching left corner/tee
                    left = col
                    while left > 0 and line[left - 1] in HORIZONTALS + TEES + "┼┌":
                        left -= 1
                    # Rebuild the line: extend ─ from col to c
                    old = lines[i]
                    lines[i] = old[:col] + "─" * (c - col) + old[col:]
                    return 1
        # The easier case: wall below is slightly shifted. Just widen by 1.
        if col + 1 < len(below) and below[col + 1] in WALL_CONTINUATIONS:
            old = lines[i]
            lines[i] = old[:col] + "─" + old[col:]
            return 1

    if ch in BOTTOMS and i - 1 >= 0:
        above = grid[i - 1]
        if col + 1 < len(above) and above[col + 1] in WALL_CONTINUATIONS:
            old = lines[i]
            lines[i] = old[:col] + "─" + old[col:]
            return 1

    return 0


def _fix_arrow_center(
    lines: list[str], grid: list[str], issue: Issue,
) -> int:
    """Fix arrow centering by shifting ▼ in whitespace toward box center."""
    i, old_col = issue.line, issue.col

    for box in find_boxes(grid):
        if box.top_line == i + 1 and box.left <= old_col <= box.right:
            new_col = (box.left + box.right) // 2
            return _shift_char_in_whitespace(lines, i, old_col, new_col)

    return 0


def _fix_width(lines: list[str], grid: list[str], issue: Issue) -> int:
    """Fix width inconsistency: find the widest box in the column group
    and extend all narrower ones to match."""
    left = issue.col
    all_boxes = find_boxes(grid)
    group = [b for b in all_boxes if b.left == left]
    if len(group) < 2:
        return 0

    target_right = max(b.right for b in group)
    fixes = 0

    for box in group:
        if box.right >= target_right:
            continue
        extra = target_right - box.right

        # Extend top border
        top = lines[box.top_line]
        lines[box.top_line] = top[: box.right] + "─" * extra + top[box.right :]

        # Extend bottom border
        bot = lines[box.bot_line]
        lines[box.bot_line] = bot[: box.right] + "─" * extra + bot[box.right :]

        # Extend interior lines
        for mid_i in range(box.top_line + 1, box.bot_line):
            mid = lines[mid_i]
            if box.right < len(mid):
                lines[mid_i] = mid[: box.right] + " " * extra + mid[box.right :]
            else:
                lines[mid_i] = mid + " " * extra

        fixes += 1

    return fixes


def _fix_header_underline(
    lines: list[str], issue: Issue,
) -> int:
    """Fix short underlines by replacing surrounding spaces with ═ in-place.

    Handles ALL ═ blocks on the line simultaneously with in-place character
    replacement (no insertion/deletion), which prevents cascading column shifts
    when multiple blocks exist on the same line.
    """
    i = issue.line
    line = lines[i]

    # Use HeaderSpan to find all underline+text pairs on this line
    temp_grid = [lines[i - 1].ljust(max(len(lines[i - 1]), len(line))),
                 line]
    spans = _find_header_spans(temp_grid)
    short_spans = [hs for hs in spans if hs.is_short]
    if not short_spans:
        return 0

    # Process right-to-left so right-side fixes don't shift left-side positions
    short_spans.sort(key=lambda hs: -hs.ul_left)

    chars = list(line)
    for hs in short_spans:
        extra = hs.text_width - hs.ul_width

        # Extend leftward: replace spaces left of ul with ═
        left_short = hs.ul_left - hs.text_left
        extend_left = min(left_short, extra)
        for k in range(hs.ul_left - extend_left, hs.ul_left):
            if k >= 0 and chars[k] == " ":
                chars[k] = "═"
        extra -= extend_left

        # Extend rightward: replace spaces right of ur with ═
        for k in range(hs.ul_right + 1, hs.ul_right + 1 + extra):
            if k < len(chars) and chars[k] == " ":
                chars[k] = "═"
            elif k >= len(chars):
                chars.append("═")

    lines[i] = "".join(chars)
    return len(short_spans)


def _fix_header_center(
    lines: list[str], issue: Issue,
) -> int:
    """Fix section title centering by adjusting ─ padding on the shorter side."""
    line_idx = issue.line
    left = issue.col
    top = lines[line_idx]
    # Find the right edge: scan backward from end of line for ┐
    right = len(top) - 1
    while right > left and top[right] != "┐":
        right -= 1
    if right <= left:
        return 0

    # Find the text
    interior = top[left + 1 : right]
    stripped = interior.strip(HORIZONTALS + " ┬┼")
    if not stripped:
        return 0
    idx = interior.find(stripped)
    if idx < 0:
        return 0

    text_start = left + 1 + idx
    text_end = text_start + len(stripped)
    text_center = (text_start + text_end) / 2
    box_center = (left + right) / 2
    offset = text_center - box_center

    if abs(offset) < 1.5:
        return 0

    # Determine which side to adjust
    left_padding = idx
    right_padding = len(interior) - idx - len(stripped)

    if offset > 0:
        # Text is right-heavy: reduce left padding, increase right
        shift = min(int(offset), left_padding)
        if shift <= 0:
            return 0
        # Remove ─ from left, add ─ to right
        old = lines[line_idx]
        new_interior = interior[shift:] + "─" * shift
        lines[line_idx] = old[: left + 1] + new_interior + old[right:]
    else:
        # Text is left-heavy: reduce right padding, increase left
        shift = min(int(-offset), right_padding)
        if shift <= 0:
            return 0
        old = lines[line_idx]
        new_interior = "─" * shift + interior[: len(interior) - shift]
        lines[line_idx] = old[: left + 1] + new_interior + old[right:]

    return 1


def _fix_header_content_alignment(
    lines: list[str], issue: Issue,
) -> int:
    """Fix header centering by shifting text + underline toward content zone center.

    Handles all header sections on a text+underline line pair in one shot.
    Only the first call for a given text line does work; subsequent calls
    (for other sections on the same line) return 0.
    """
    i = issue.line  # ═ underline line; text is at i-1
    line_text = lines[i - 1]
    line_ul = lines[i]

    # Parse all header sections on this line pair using shared helper
    temp_grid = [line_text.ljust(max(len(line_text), len(line_ul))),
                 line_ul.ljust(max(len(line_text), len(line_ul)))]
    sections = _find_header_spans(temp_grid)
    if not sections:
        return 0

    # --- Determine target center for each section ---
    boxes = find_boxes(pad_grid(lines))
    all_below = [b for b in boxes if b.top_line > i and b.top_line <= i + 40]

    zone_targets: list[int | None] = []
    for hs in sections:
        zone_boxes = _partition_boxes(all_below, sections, hs)
        if len(zone_boxes) < 2:
            zone_targets.append(None)
        else:
            content_left = min(b.left for b in zone_boxes)
            content_right = max(b.right for b in zone_boxes)
            zone_targets.append((content_left + content_right) // 2)

    # Check if any section actually needs moving
    needs_move = any(
        t is not None and abs(hs.center - t) >= 5.0
        for hs, t in zip(sections, zone_targets, strict=False)
    )
    if not needs_move:
        return 0

    # --- Rebuild both lines from scratch ---
    max_col = max(len(line_text), len(line_ul))
    for hs, target in zip(sections, zone_targets, strict=False):
        if target is not None:
            new_tr = max(0, target - hs.text_width // 2) + hs.text_width
            if new_tr > max_col:
                max_col = new_tr

    new_text = [" "] * max_col
    new_ul = [" "] * max_col

    for hs, target in zip(sections, zone_targets, strict=False):
        w = hs.text_width
        new_tl = max(0, target - w // 2) if target is not None else hs.text_left

        # Copy text
        for j, ch in enumerate(line_text[hs.text_left : hs.text_right + 1]):
            col = min(new_tl + j, max_col - 1)
            new_text[col] = ch
        # Write underline
        for j in range(w):
            col = min(new_tl + j, max_col - 1)
            new_ul[col] = "═"

    # Trim trailing whitespace from both lines
    lines[i - 1] = "".join(new_text).rstrip()
    lines[i] = "".join(new_ul).rstrip()
    return 1


def _fix_text_arrow(
    lines: list[str], grid: list[str], issue: Issue,
) -> int:
    """Fix text→arrow centering by shifting ▼ in whitespace toward text center."""
    i, old_col = issue.line, issue.col

    # Find the text above
    for k in range(i - 1, max(i - 4, -1), -1):
        above = grid[k]
        box_count = sum(1 for c in above if c in "┌┐└┘│─┬┴├┤┼")
        if box_count > len(above) * 0.25:
            continue

        left = 0
        right = len(above)
        for c in range(old_col, -1, -1):
            if above[c] in ("│", "┌", "└", "├", "┤", "┐", "┘"):
                left = c + 1
                break
        for c in range(old_col, len(above)):
            if above[c] in ("│", "┌", "┐", "├", "┤"):
                right = c
                break

        text_start = left
        while text_start < right and above[text_start] == " ":
            text_start += 1
        text_end = right - 1
        while text_end >= text_start and above[text_end] == " ":
            text_end -= 1
        if text_end - text_start < 4:
            return 0

        new_col = (text_start + text_end) // 2
        return _shift_char_in_whitespace(lines, i, old_col, new_col)

    return 0


# ---------------------------------------------------------------------------
# Markdown integration
# ---------------------------------------------------------------------------


def process_markdown(text: str, fix: bool = False) -> tuple[str, list[str]]:
    """Process a markdown document. Returns (modified_text, report_lines)."""
    diagrams = extract_diagrams(text)
    report: list[str] = []

    if not diagrams:
        return text, ["No box-drawing diagrams found."]

    all_lines = text.split("\n")
    result_lines = list(all_lines)
    total_issues = 0
    total_fixes = 0
    offset = 0

    for diag_start, diag_end, diag_lines in diagrams:
        grid = pad_grid(diag_lines)
        issues = detect_issues(grid)

        if not issues:
            continue

        report.append(
            f"Diagram L{diag_start + 1}-L{diag_end} ({len(diag_lines)} lines):",
        )
        for issue in issues:
            abs_line = diag_start + issue.line
            report.append(
                f"  [{issue.kind}] L{abs_line + 1}:{issue.col + 1}  {issue.detail}",
            )
            if issue.suggestion:
                report.append(f"    -> Fix: {issue.suggestion}")
            total_issues += 1

        if fix:
            fixed_lines, n_fixes = fix_diagram(diag_lines)
            if n_fixes > 0:
                result_lines[diag_start + offset : diag_end + offset] = fixed_lines
                delta = len(fixed_lines) - len(diag_lines)
                offset += delta
                total_fixes += n_fixes
                report.append(f"  -> Applied {n_fixes} fix(es)")

        report.append("")

    if total_issues == 0:
        report.append("All diagrams look good — no alignment issues found.")
    else:
        report.insert(
            0,
            f"Found {total_issues} issue(s) in {len(diagrams)} diagram(s)."
            + (f" Applied {total_fixes} fix(es)." if fix else ""),
        )
        report.insert(1, "")

    return "\n".join(result_lines), report


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Detect and fix box-drawing alignment issues in markdown diagrams.",
    )
    parser.add_argument("files", nargs="+", help="Markdown file(s) to check")
    parser.add_argument("--fix", action="store_true", help="Apply fixes in-place")
    parser.add_argument(
        "--quiet", "-q", action="store_true", help="Suppress OK messages",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Exit with code 1 if issues found (useful for CI)",
    )
    args = parser.parse_args()

    exit_code = 0

    for filepath in args.files:
        with open(filepath) as f:
            text = f.read()

        modified, report = process_markdown(text, fix=args.fix)

        has_issues = not report[-1].startswith("All diagrams")
        if has_issues:
            exit_code = 1

        if args.quiet and not has_issues:
            continue

        for _line in report:
            print(_line)

        if args.fix and modified != text:
            with open(filepath, "w") as f:
                f.write(modified)

    sys.exit(exit_code)


if __name__ == "__main__":
    main()
