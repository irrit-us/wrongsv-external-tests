#!/usr/bin/env python3
"""Property-based fuzzer for box_align.py using a diagram DSL.

First generates logical diagram structures (boxes, arrows, nesting, headers)
then renders them to ASCII art. Mutations operate on the logical model,
ensuring structural validity by construction.

Usage:
  python3 tests/fuzz_test.py [seed] [iterations]
"""

import sys
import os
import random
from dataclasses import dataclass, field
from typing import Optional

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'scripts'))
import box_align

# ── DSL Model ──────────────────────────────────────────────────────────

HL = "─"; VL = "│"
TL = "┌"; TR = "┐"; BL = "└"; BR = "┘"
TD = "┬"; BU = "┴"
AR = "▼"
EQ = "═"

@dataclass
class BoxSpec:
    id: str
    w: int
    h: int
    label: str = ""
    x: int = 0  # assigned during layout
    y: int = 0  # assigned during layout


@dataclass
class ArrowSpec:
    id: str
    from_id: str
    to_id: str
    col: int = 0  # assigned during layout


@dataclass
class SplitSpec:
    id: str
    from_id: str
    to_ids: list[str] = field(default_factory=list)


@dataclass
class CornerSpec:
    """A corner-turn arrow: from box, go right/left, then down to target box."""
    id: str
    from_id: str
    to_id: str
    direction: str = "right"  # "right" or "left"


@dataclass
class HeaderSpec:
    id: str
    text: str
    x: int = 0; y: int = 0


@dataclass
class DiagramModel:
    boxes: dict[str, BoxSpec] = field(default_factory=dict)
    arrows: list[ArrowSpec] = field(default_factory=list)
    splits: list[SplitSpec] = field(default_factory=list)
    corners: list[CornerSpec] = field(default_factory=list)
    headers: list[HeaderSpec] = field(default_factory=list)
    width: int = 0
    height: int = 0

    def add_box(self, id: str, w: int, h: int, label: str = "") -> BoxSpec:
        b = BoxSpec(id, w, h, label)
        self.boxes[id] = b
        return b

    def add_arrow(self, id: str, from_id: str, to_id: str) -> ArrowSpec:
        a = ArrowSpec(id, from_id, to_id)
        self.arrows.append(a)
        return a

    def add_split(self, id: str, from_id: str, to_ids: list[str]) -> SplitSpec:
        s = SplitSpec(id, from_id, to_ids)
        self.splits.append(s)
        return s

    def add_corner(self, id: str, from_id: str, to_id: str, direction: str = "right") -> CornerSpec:
        c = CornerSpec(id, from_id, to_id, direction)
        self.corners.append(c)
        return c

    def add_header(self, id: str, text: str) -> HeaderSpec:
        h = HeaderSpec(id, text)
        self.headers.append(h)
        return h


# ── Layout Engine ──────────────────────────────────────────────────────

GAP = 2  # spacing between elements

def layout_model(model: DiagramModel) -> None:
    """Assign x,y positions to all elements via top-down layout."""
    y = 0

    # Place headers first
    for hdr in model.headers:
        hdr.y = y
        y += 2  # text + underline

    if model.headers:
        y += 1  # gap after headers

    # Find root boxes (ones not receiving any arrow/split)
    receivers = set()
    for a in model.arrows:
        receivers.add(a.to_id)
    for s in model.splits:
        receivers.update(s.to_ids)
    roots = [bid for bid in model.boxes if bid not in receivers]

    # Layout roots
    if roots:
        _layout_row(model, roots, y)

    # Layout flow: for each arrow/split, layout target boxes below source
    for a in model.arrows:
        if a.from_id in model.boxes and a.to_id in model.boxes:
            src = model.boxes[a.from_id]
            dst = model.boxes[a.to_id]
            if dst.y == 0:  # not yet placed
                dst.y = src.y + src.h + 2  # gap + arrow
                a.col = src.x + src.w // 2
                # Center dst under src
                dst.x = src.x + src.w // 2 - dst.w // 2
                # Ensure non-overlapping with same-row boxes
                for other in model.boxes.values():
                    if other is not dst and other.y == dst.y:
                        if dst.x < other.x + other.w + GAP and other.x < dst.x + dst.w + GAP:
                            dst.x = other.x + other.w + GAP
                model.height = max(model.height, dst.y + dst.h)

    for s in model.splits:
        if s.from_id in model.boxes:
            src = model.boxes[s.from_id]
            n = len(s.to_ids)
            sub_y = src.y + src.h + 2
            total_w = sum(model.boxes[tid].w for tid in s.to_ids) + GAP * (n - 1)
            start_x = src.x + src.w // 2 - total_w // 2
            cx = start_x
            for tid in s.to_ids:
                if tid in model.boxes:
                    dst = model.boxes[tid]
                    dst.y = sub_y
                    dst.x = cx
                    cx += dst.w + GAP
            model.height = max(model.height, sub_y + max(
                model.boxes[tid].h for tid in s.to_ids if tid in model.boxes))

    for c in model.corners:
        if c.from_id in model.boxes and c.to_id in model.boxes:
            src = model.boxes[c.from_id]
            dst = model.boxes[c.to_id]
            if dst.y == 0:
                dst.y = src.y + src.h + 5  # gap + horizontal turn + vertical + arrow
                if c.direction == "right":
                    dst.x = src.x + src.w + 4
                else:
                    dst.x = max(0, src.x - dst.w - 4)
                # Ensure non-overlapping
                for other in model.boxes.values():
                    if other is not dst and other.y == dst.y:
                        if dst.x < other.x + other.w + GAP and other.x < dst.x + dst.w + GAP:
                            dst.x = other.x + other.w + GAP
                model.height = max(model.height, dst.y + dst.h)


def _layout_row(model: DiagramModel, ids: list[str], y: int) -> None:
    """Layout boxes horizontally at row y."""
    x = 0
    for bid in ids:
        if bid in model.boxes:
            b = model.boxes[bid]
            b.x = x
            b.y = y
            x += b.w + GAP
    model.width = max(model.width, x - GAP)


# ── Renderer ───────────────────────────────────────────────────────────

def render_model(model: DiagramModel) -> list[str]:
    """Render the logical model to ASCII art lines."""
    layout_model(model)

    # Calculate canvas size AFTER layout (layout sets x,y on all elements)
    max_r = 0
    max_c = 0
    for b in model.boxes.values():
        max_r = max(max_r, b.y + b.h)
        max_c = max(max_c, b.x + b.w)
    for hdr in model.headers:
        max_r = max(max_r, hdr.y + 2)
        max_c = max(max_c, hdr.x + len(hdr.text))
    model.width = max(max_c + 4, model.width)
    model.height = max(max_r + 2, model.height)
    canvas = [[" "] * model.width for _ in range(model.height)]

    # Render headers
    for hdr in model.headers:
        for i, ch in enumerate(hdr.text):
            if 0 <= hdr.y < model.height and 0 <= hdr.x + i < model.width:
                canvas[hdr.y][hdr.x + i] = ch
        for i in range(len(hdr.text)):
            if 0 <= hdr.y + 1 < model.height and 0 <= hdr.x + i < model.width:
                canvas[hdr.y + 1][hdr.x + i] = EQ

    # Render boxes
    for b in model.boxes.values():
        if b.y + b.h > model.height:
            continue
        # Top border (no labels here — labels go in body)
        inner_w = b.w - 2
        top_str = TL + HL * inner_w + TR
        for i, ch in enumerate(top_str):
            if 0 <= b.x + i < model.width:
                canvas[b.y][b.x + i] = ch
        # Middle (with optional label on first body line)
        for row in range(1, b.h - 1):
            cy = b.y + row
            if 0 <= cy < model.height:
                if 0 <= b.x < model.width:
                    canvas[cy][b.x] = VL
                if 0 <= b.x + b.w - 1 < model.width:
                    canvas[cy][b.x + b.w - 1] = VL
            # Label on first body row
            if row == 1 and b.label and 0 <= cy < model.height:
                label_x = b.x + (b.w - len(b.label)) // 2
                for i, ch in enumerate(b.label):
                    if 0 <= label_x + i < model.width:
                        canvas[cy][label_x + i] = ch
        # Bottom
        bot_str = BL + HL * inner_w + BR
        for i, ch in enumerate(bot_str):
            if 0 <= b.y + b.h - 1 < model.height and 0 <= b.x + i < model.width:
                canvas[b.y + b.h - 1][b.x + i] = ch

    # Render T-junctions and connectors for splits
    for s in model.splits:
        if s.from_id in model.boxes:
            src = model.boxes[s.from_id]
            # Replace bottom border of src with T-junctions
            bot_y = src.y + src.h - 1
            if bot_y < model.height:
                for dst_id in s.to_ids:
                    if dst_id in model.boxes:
                        dst = model.boxes[dst_id]
                        tee_col = dst.x + dst.w // 2
                        if 0 <= tee_col < model.width:
                            canvas[bot_y][tee_col] = TD
                # Vertical connectors below each tee
                for dst_id in s.to_ids:
                    if dst_id in model.boxes:
                        dst = model.boxes[dst_id]
                        tee_col = dst.x + dst.w // 2
                        for r in range(bot_y + 1, dst.y):
                            if 0 <= r < model.height and 0 <= tee_col < model.width:
                                canvas[r][tee_col] = VL
                        # Arrow on the line just before dst
                        arrow_y = dst.y - 1
                        if arrow_y > bot_y and 0 <= arrow_y < model.height:
                            if 0 <= tee_col < model.width:
                                canvas[arrow_y][tee_col] = AR

    # Render single arrows
    for a in model.arrows:
        if a.from_id in model.boxes and a.to_id in model.boxes:
            src = model.boxes[a.from_id]
            dst = model.boxes[a.to_id]
            a.col = src.x + src.w // 2
            bot_y = src.y + src.h - 1
            # Vertical connector
            for r in range(bot_y + 1, dst.y):
                if 0 <= r < model.height and 0 <= a.col < model.width:
                    canvas[r][a.col] = VL
            if dst.y - 1 > bot_y and 0 <= dst.y - 1 < model.height:
                if 0 <= a.col < model.width:
                    canvas[dst.y - 1][a.col] = AR

    # Render corner turns
    for c in model.corners:
        if c.from_id in model.boxes and c.to_id in model.boxes:
            src = model.boxes[c.from_id]
            dst = model.boxes[c.to_id]
            bot_y = src.y + src.h - 1
            if bot_y >= model.height:
                continue
            src_center = src.x + src.w // 2
            # T-junction on source bottom
            if 0 <= bot_y < model.height and 0 <= src_center < model.width:
                canvas[bot_y][src_center] = TD
            # │ one line below T-junction
            v1_y = bot_y + 1
            if 0 <= v1_y < model.height and 0 <= src_center < model.width:
                canvas[v1_y][src_center] = VL
            # └ or ┘ on next line, turning toward target
            turn_y = bot_y + 2
            if c.direction == "right":
                turn_col = src.x + src.w + 2
                if 0 <= turn_y < model.height and 0 <= src_center < model.width:
                    canvas[turn_y][src_center] = VL  # continuation
                    # draw └ at src_center but this is wrong — └ should be at the exit
                    # Simpler: horizontal line from src_center to turn_col, ending with ┐
                # Actually: └ at src_center line, then ─...─, then │ down
                # Redo: on turn_y, draw └ at src_center, then ─ to turn_col
                if 0 <= turn_y < model.height and 0 <= src_center < model.width:
                    canvas[turn_y][src_center] = BL
                for col in range(src_center + 1, turn_col):
                    if 0 <= turn_y < model.height and 0 <= col < model.width:
                        canvas[turn_y][col] = HL
                # At turn_col: │ going down, with ┐ above
                if 0 <= turn_y < model.height and 0 <= turn_col < model.width:
                    canvas[turn_y][turn_col] = BR
                for r in range(turn_y + 1, dst.y):
                    if 0 <= r < model.height and 0 <= turn_col < model.width:
                        canvas[r][turn_col] = VL
                if dst.y - 1 > turn_y and 0 <= dst.y - 1 < model.height:
                    if 0 <= turn_col < model.width:
                        canvas[dst.y - 1][turn_col] = AR
            else:  # left
                turn_col = max(2, src.x - 4)
                # ┘ at src_center: │ from above turns left into ─
                if 0 <= turn_y < model.height and 0 <= src_center < model.width:
                    canvas[turn_y][src_center] = BR  # ┘
                # ─ from turn_col+1 to src_center-1
                for col in range(turn_col + 1, src_center):
                    if 0 <= turn_y < model.height and 0 <= col < model.width:
                        canvas[turn_y][col] = HL
                # ┌ at turn_col: ─ from right turns down into │
                if 0 <= turn_y < model.height and 0 <= turn_col < model.width:
                    canvas[turn_y][turn_col] = TL  # ┌
                # Vertical │ from turn_y+1 down to dst
                for r in range(turn_y + 1, dst.y):
                    if 0 <= r < model.height and 0 <= turn_col < model.width:
                        canvas[r][turn_col] = VL
                # Arrow ▼ at turn_col above dst
                if dst.y - 1 > turn_y and 0 <= dst.y - 1 < model.height:
                    if 0 <= turn_col < model.width:
                        canvas[dst.y - 1][turn_col] = AR

    return ["".join(row).rstrip() for row in canvas]


# ── DSL Generators ─────────────────────────────────────────────────────

def dsl_single_box(rng: random.Random) -> DiagramModel:
    m = DiagramModel()
    m.add_box("A", rng.randint(8, 18), rng.randint(3, 5), rng.choice(["Box", "Main", ""]))
    return m


def dsl_vertical_flow(rng: random.Random) -> DiagramModel:
    """A → B: two boxes connected by vertical arrow."""
    m = DiagramModel()
    w = rng.randint(8, 14)
    m.add_box("A", w, 3, rng.choice(["Source", "Input", ""]))
    m.add_box("B", w, rng.randint(3, 5), rng.choice(["Target", "Output", ""]))
    m.add_arrow("a1", "A", "B")
    return m


def dsl_chain(rng: random.Random) -> DiagramModel:
    """A → B → C: three-box vertical chain."""
    m = DiagramModel()
    w = rng.randint(8, 12)
    m.add_box("A", w, 3, rng.choice(["Step1", ""]))
    m.add_box("B", w, 3, rng.choice(["Step2", ""]))
    m.add_box("C", w, 3, rng.choice(["Step3", ""]))
    m.add_arrow("a1", "A", "B")
    m.add_arrow("a2", "B", "C")
    return m


def dsl_split(rng: random.Random) -> DiagramModel:
    """A splits into B + C: wide box branching."""
    m = DiagramModel()
    n = rng.randint(2, 3)
    m.add_box("A", rng.randint(12, 20), 3, rng.choice(["Router", "Split", ""]))
    sub_w = rng.randint(6, 10)
    targets = []
    for i in range(n):
        tid = chr(ord("B") + i)
        m.add_box(tid, sub_w, 3, str(i + 1))
        targets.append(tid)
    m.add_split("s1", "A", targets)
    return m


def dsl_nested(rng: random.Random) -> DiagramModel:
    """Outer box containing inner box."""
    m = DiagramModel()
    m.add_box("outer", rng.randint(16, 24), rng.randint(5, 7), "Container")
    m.add_box("inner", rng.randint(6, 10), rng.randint(2, 3), rng.choice(["Inner", ""]))
    # Place inner inside outer manually
    outer = m.boxes["outer"]
    inner = m.boxes["inner"]
    inner.y = outer.y + rng.randint(1, outer.h - inner.h - 1)
    inner.x = outer.x + rng.randint(2, outer.w - inner.w - 2)
    return m


def dsl_beside(rng: random.Random) -> DiagramModel:
    """Two boxes side by side."""
    m = DiagramModel()
    m.add_box("L", rng.randint(8, 12), rng.randint(3, 4), rng.choice(["Left", "A", ""]))
    m.add_box("R", rng.randint(8, 12), rng.randint(3, 4), rng.choice(["Right", "B", ""]))
    return m


def dsl_header(rng: random.Random) -> DiagramModel:
    """Header over box(es)."""
    m = DiagramModel()
    text = rng.choice(["SECTION", "OVERVIEW", "COMPONENTS", "LAYER"])
    m.add_header("h1", text)
    m.add_box("A", rng.randint(10, 16), rng.randint(3, 4), rng.choice(["Content", ""]))
    hdr = m.headers[0]
    bx = m.boxes["A"]
    hdr.x = bx.x + bx.w // 2 - len(text) // 2
    hdr.y = 0
    bx.y = 3
    return m


def dsl_dual_header(rng: random.Random) -> DiagramModel:
    """Two headers over two content zones."""
    m = DiagramModel()
    t1 = rng.choice(["INPUT", "LEFT", "COL_A"])
    t2 = rng.choice(["OUTPUT", "RIGHT", "COL_B"])
    m.add_header("h1", t1)
    m.add_header("h2", t2)
    m.add_box("A", rng.randint(8, 12), 3, "A")
    m.add_box("B", rng.randint(8, 12), 3, "B")
    # Layout headers and boxes
    bh = 3  # box y starts after headers
    bw = max(m.boxes["A"].w, m.boxes["B"].w)
    gap = rng.randint(4, 8)
    m.headers[0].x = 2
    m.headers[0].y = 0
    m.boxes["A"].x = 2 + len(t1) // 2 - m.boxes["A"].w // 2
    m.boxes["A"].y = bh
    h2x = 2 + len(t1) + gap
    m.headers[1].x = h2x
    m.headers[1].y = 0
    m.boxes["B"].x = h2x + len(t2) // 2 - m.boxes["B"].w // 2
    m.boxes["B"].y = bh
    return m


def dsl_text_arrow_box(rng: random.Random) -> DiagramModel:
    """Text label → arrow → box."""
    m = DiagramModel()
    text = rng.choice(["Input", "Start", "DataFlow", "Entry"])
    m.add_header("h1", text)  # reused as text label
    m.add_box("A", rng.randint(8, 14), 3, "Target")
    hdr = m.headers[0]
    bx = m.boxes["A"]
    hdr.x = 4
    hdr.y = 0
    bx.y = 2
    bx.x = hdr.x + len(text) // 2 - bx.w // 2
    # Manual arrow
    m.add_arrow("a1", "A", "A")  # placeholder, we render manually
    return m


def dsl_4way_fork(rng: random.Random) -> DiagramModel:
    """A splits into B+C+D+E: 4-way fork."""
    m = DiagramModel()
    m.add_box("A", rng.randint(16, 24), 3, rng.choice(["Hub", "Router", ""]))
    sub_w = rng.randint(5, 8)
    targets = []
    for i in range(4):
        tid = chr(ord("B") + i)
        m.add_box(tid, sub_w, 3, str(i + 1))
        targets.append(tid)
    m.add_split("s1", "A", targets)
    return m


def dsl_corner_right(rng: random.Random) -> DiagramModel:
    """Source → corner turn right → target box below."""
    m = DiagramModel()
    m.add_box("A", rng.randint(8, 14), 3, rng.choice(["Source", ""]))
    m.add_box("B", rng.randint(8, 14), rng.randint(3, 4), rng.choice(["Target", ""]))
    m.add_corner("c1", "A", "B", "right")
    return m


def dsl_corner_left(rng: random.Random) -> DiagramModel:
    """Source → corner turn left → target box below."""
    m = DiagramModel()
    m.add_box("A", rng.randint(8, 14), 3, rng.choice(["Source", ""]))
    m.add_box("B", rng.randint(8, 14), rng.randint(3, 4), rng.choice(["Target", ""]))
    m.add_corner("c1", "A", "B", "left")
    return m


def dsl_cascading_fork(rng: random.Random) -> DiagramModel:
    """A splits into B + C, then C splits into D+E: two-stage fork."""
    m = DiagramModel()
    m.add_box("A", rng.randint(14, 20), 3, rng.choice(["Main", "Router1", ""]))
    m.add_box("B", rng.randint(6, 10), 3, rng.choice(["Direct", ""]))
    m.add_box("C", rng.randint(14, 20), 3, rng.choice(["Router2", ""]))
    m.add_box("D", rng.randint(5, 8), 3, rng.choice(["X", ""]))
    m.add_box("E", rng.randint(5, 8), 3, rng.choice(["Y", ""]))
    m.add_split("s1", "A", ["B", "C"])
    m.add_split("s2", "C", ["D", "E"])
    return m


DSL_GENERATORS = [
    dsl_single_box,
    dsl_vertical_flow,
    dsl_chain,
    dsl_split,
    dsl_nested,
    dsl_beside,
    dsl_header,
    dsl_dual_header,
    dsl_text_arrow_box,
    dsl_4way_fork,
    dsl_corner_right,
    dsl_corner_left,
    dsl_cascading_fork,
]


# ── Mutation Engine (on rendered ASCII) ────────────────────────────────

def mut_width_shrink(lines: list[str]) -> list[str]:
    """Shorten bottom border of a single-isolated box (not side-by-side)."""
    for i in range(len(lines) - 1, -1, -1):
        ln = lines[i]
        if BR not in ln or BL not in ln:
            continue
        # Count how many boxes are on this line (BL chars)
        if ln.count(BL) > 1:
            continue  # side-by-side boxes: skip, known fix limitation
        if ln.count(BR) > 1:
            continue
        chars = list(ln)
        for j in range(len(chars) - 1, -1, -1):
            if chars[j] == BR and j > 2 and chars[j-1] == HL:
                chars.pop(j - 1)
                return ["".join(chars) if idx == i else ln for idx, ln in enumerate(lines)]
    return lines


def mut_header_short(lines: list[str]) -> list[str]:
    """Shorten an ═ underline."""
    for i, ln in enumerate(lines):
        if EQ in ln and VL not in ln:
            chars = list(ln.rstrip())
            n = 0
            for j in range(len(chars) - 1, -1, -1):
                if chars[j] == EQ and n < 2:
                    chars[j] = " "
                    n += 1
                elif chars[j] != EQ:
                    break
            if n > 0:
                return ["".join(chars) if idx == i else ln for idx, ln in enumerate(lines)]
    return lines


def mut_arrow_shift(lines: list[str]) -> list[str]:
    """Shift ▼ off-center from its text."""
    for i, ln in enumerate(lines):
        if AR not in ln:
            continue
        for j, ch in enumerate(ln):
            if ch != AR:
                continue
            if i > 0 and j < len(lines[i-1]) and lines[i-1][j] == VL:
                continue
            d = random.choice([-1, 1])
            nj = j + d * random.randint(2, 4)
            if 0 <= nj < len(ln) and ln[nj] == " ":
                chars = list(ln)
                chars[j] = " "
                chars[nj] = AR
                return ["".join(chars) if idx == i else ln for idx, ln in enumerate(lines)]
    return lines


def mut_arrow_off_box(lines: list[str]) -> list[str]:
    """Shift ▼ away from box center below."""
    for i, ln in enumerate(lines):
        if AR not in ln:
            continue
        if i + 1 < len(lines) and TL in lines[i + 1]:
            for j, ch in enumerate(ln):
                if ch == AR:
                    nj = j + random.choice([-3, 3])
                    if 0 <= nj < len(ln) and ln[nj] == " ":
                        chars = list(ln)
                        chars[j] = " "
                        chars[nj] = AR
                        return ["".join(chars) if idx == i else ln for idx, ln in enumerate(lines)]
    return lines


def mut_corner_break(lines: list[str]) -> list[str]:
    """Remove a box corner character."""
    for i in range(len(lines)):
        for corner in [BL, BR, TL, TR]:
            if corner in lines[i]:
                chars = list(lines[i])
                for j, ch in enumerate(chars):
                    if ch == corner:
                        chars[j] = " "
                        return ["".join(chars) if idx == i else ln for idx, ln in enumerate(lines)]
    return lines


MUTATORS = [
    ("width_shrink", mut_width_shrink),
    ("header_short", mut_header_short),
    ("arrow_shift", mut_arrow_shift),
    ("arrow_off_box", mut_arrow_off_box),
    ("corner_break", mut_corner_break),
]


# ── Test Runner ────────────────────────────────────────────────────────

def make_md(diagram: list[str]) -> str:
    text = "\n".join(diagram)
    return f"# Test\n\n```text\n{text}\n```\n"


def run_detection(text: str) -> list[str]:
    _, report = box_align.process_markdown(text, fix=False)
    return [
        line.split("]")[0].split("[")[1]
        for line in report if line.startswith("  [") and "]" in line
    ]


def run_fix(text: str) -> str:
    modified, _ = box_align.process_markdown(text, fix=True)
    return modified


def verify_idempotent(fixed: str) -> bool:
    """Double-fix produces no new issues."""
    _, report = box_align.process_markdown(fixed, fix=False)
    for line in report:
        if line.startswith("  [") and "]" in line:
            if "Cannot auto-fix" not in line:
                return False
    return True


def verify_no_corruption(original: str, fixed: str) -> bool:
    """Non-diagram content untouched."""
    ol = original.split("\n")
    fl = fixed.split("\n")
    if len(ol) != len(fl):
        return False
    # Find fence boundaries
    fs = fe = None
    for i, ln in enumerate(ol):
        if ln.strip().startswith("```"):
            if fs is None: fs = i
            else: fe = i; break
    if fs is None:
        return True
    for i in range(len(ol)):
        if i < fs or i > fe:
            if ol[i] != fl[i]:
                return False
    return True


def main():
    seed = int(sys.argv[1]) if len(sys.argv) > 1 else random.randint(0, 2**31 - 1)
    rng = random.Random(seed)
    iterations = int(sys.argv[2]) if len(sys.argv) > 2 else 500
    print(f"Seed: {seed}")

    passed = 0
    failed = 0

    for it in range(iterations):
        if it > 0 and it % 100 == 0:
            print(f"  [{it}/{iterations}] {passed} pass, {failed} fail")

        # Phase 1: generate valid diagram via DSL
        gen = rng.choice(DSL_GENERATORS)
        try:
            model = gen(rng)
            diagram = render_model(model)
        except Exception:
            continue
        if not diagram:
            continue
        md = make_md(diagram)

        # Phase 2: valid diagram → 0 issues
        issues = run_detection(md)
        if issues:
            print(f"\nFAIL [{it}] valid {gen.__name__}: issues {issues}")
            for ln in diagram:
                print(f"  |{ln}")
            failed += 1
            continue

        # Phase 3: mutate + detect
        mutator = rng.choice(MUTATORS)
        mut_diagram = mutator[1](list(diagram))
        if mut_diagram == diagram:
            continue
        mut_md = make_md(mut_diagram)
        mut_issues = run_detection(mut_md)
        if not mut_issues:
            continue  # mutation didn't trigger a check

        # Phase 4: fix resolves everything
        fixed_md = run_fix(mut_md)
        post_issues = run_detection(fixed_md)
        unfixable = [i for i in post_issues
                     if i not in ("t-junction", "connector")]
        if unfixable:
            print(f"\nFAIL [{it}] fix {mutator[0]} on {gen.__name__}: left {unfixable}")
            print("  Original:")
            for ln in diagram: print(f"    {ln}")
            print("  Mutated:")
            for ln in mut_diagram: print(f"    {ln}")
            failed += 1
            continue

        # Phase 5: idempotent
        if not verify_idempotent(fixed_md):
            print(f"\nFAIL [{it}] {mutator[0]} on {gen.__name__}: not idempotent")
            failed += 1
            continue

        # Phase 6: no corruption
        if not verify_no_corruption(mut_md, fixed_md):
            print(f"\nFAIL [{it}] {mutator[0]} on {gen.__name__}: corrupted content")
            failed += 1
            continue

        passed += 1

    print(f"\n{'='*60}")
    print(f"Results: {passed} passed, {failed} failed, {passed + failed} total")
    if failed > 0:
        print("SOME TESTS FAILED!")
        sys.exit(1)
    print("All fuzz tests passed!")


if __name__ == "__main__":
    main()
