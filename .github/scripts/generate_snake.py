#!/usr/bin/env python3
"""
Generate a contribution snake SVG from git log.
Snake walks every grid cell in a boustrophedon pattern.
Cells with contributions get a synchronized "eating" animation as the snake passes.
"""

import subprocess
import math
import os
from datetime import datetime, timedelta
from collections import defaultdict

WEEKS    = 52
CELL     = 12
GAP      = 3
STRIDE   = CELL + GAP
SNAKE_W  = 8
DURATION = 8   # animation loop duration in seconds

LIGHT = {
    "bg":     "#ffffff",
    "empty":  "#e2e8f0",
    "levels": ["#e2e8f0", "#c4b5fd", "#a78bfa", "#8b5cf6", "#667eea"],
    "snake":  "#764ba2",
    "head":   "#667eea",
    "eye":    "#ffffff",
}
DARK = {
    "bg":     "#0d1117",
    "empty":  "#161b22",
    "levels": ["#161b22", "#3b2577", "#5b3fa8", "#7c3aed", "#667eea"],
    "snake":  "#a78bfa",
    "head":   "#c4b5fd",
    "eye":    "#0d1117",
}


def get_commit_counts():
    result = subprocess.run(
        ["git", "log", "--all", "--format=%cd", "--date=short"],
        capture_output=True, text=True,
    )
    counts = defaultdict(int)
    for line in result.stdout.strip().splitlines():
        line = line.strip()
        if line:
            counts[line] += 1
    return counts


def build_grid(counts):
    today = datetime.today().date()
    start = today - timedelta(weeks=WEEKS)
    # Rewind to last Sunday
    start = start - timedelta(days=(start.weekday() + 1) % 7)
    grid = []
    d = start
    for w in range(WEEKS + 1):
        col = []
        for day in range(7):
            if d <= today:
                col.append(counts.get(d.strftime("%Y-%m-%d"), 0))
            else:
                col.append(-1)  # future cell
            d += timedelta(days=1)
        grid.append(col)
    return grid


def level(count):
    if count <= 0: return 0
    if count == 1: return 1
    if count <= 3: return 2
    if count <= 6: return 3
    return 4


def cell_cx(w, day):
    return w * STRIDE + CELL // 2


def cell_cy(w, day):
    return day * STRIDE + CELL // 2


def snake_path_coords(grid):
    """Boustrophedon (serpentine) walk through ALL valid (non-future) cells."""
    path = []
    for w, col in enumerate(grid):
        days = range(7) if w % 2 == 0 else range(6, -1, -1)
        for day in days:
            if col[day] >= 0:
                path.append((w, day))
    return path


def path_length(coords):
    total = 0.0
    for i in range(1, len(coords)):
        x1, y1 = cell_cx(*coords[i-1]), cell_cy(*coords[i-1])
        x2, y2 = cell_cx(*coords[i]),   cell_cy(*coords[i])
        total += math.hypot(x2 - x1, y2 - y1)
    return total


def d_attr(coords):
    pts = [f"M {cell_cx(*coords[0])},{cell_cy(*coords[0])}"]
    for c in coords[1:]:
        pts.append(f"L {cell_cx(*c)},{cell_cy(*c)}")
    return " ".join(pts)


def generate_svg(grid, theme):
    T = theme
    cols = len(grid)
    W = cols * STRIDE
    H = 7 * STRIDE + 4

    coords = snake_path_coords(grid)
    N = len(coords)
    has_snake = N >= 2
    plen = round(path_length(coords) + 20) if has_snake else 0

    # Map (w, day) -> index in path for eat-timing
    pos_index = {c: i for i, c in enumerate(coords)}

    lines = []
    a = lines.append

    a(f'<svg width="{W}" height="{H}" viewBox="0 0 {W} {H}" '
      f'xmlns="http://www.w3.org/2000/svg">')
    a(f'  <rect width="{W}" height="{H}" fill="{T["bg"]}" rx="6"/>')

    # Draw grid cells
    for w, col in enumerate(grid):
        for day, count in enumerate(col):
            if count < 0:
                continue
            x, y = w * STRIDE, day * STRIDE
            lv = level(count)
            color = T["levels"][lv]
            empty = T["empty"]

            if has_snake and lv > 0 and (w, day) in pos_index:
                idx = pos_index[(w, day)]
                tn = round(idx / N, 4)
                # Discrete animation: contribution color, then switch to empty when snake arrives.
                # keyTimes must start at 0 and end at 1 for calcMode=discrete.
                a(f'  <rect x="{x}" y="{y}" width="{CELL}" height="{CELL}" rx="2" fill="{color}">')
                a(f'    <animate attributeName="fill" values="{color};{empty};{empty}"'
                  f' keyTimes="0;{tn};1" dur="{DURATION}s"'
                  f' calcMode="discrete" repeatCount="indefinite"/>')
                a(f'  </rect>')
            else:
                a(f'  <rect x="{x}" y="{y}" width="{CELL}" height="{CELL}" rx="2" fill="{color}"/>')

    if has_snake:
        d = d_attr(coords)

        # Snake body — grows from start via stroke-dashoffset reveal
        a(f'  <path id="sp" d="{d}" fill="none" stroke="{T["snake"]}"'
          f' stroke-width="{SNAKE_W}" stroke-linecap="round" stroke-linejoin="round"'
          f' stroke-dasharray="{plen}" stroke-dashoffset="{plen}">')
        a(f'    <animate attributeName="stroke-dashoffset" from="{plen}" to="0"'
          f' dur="{DURATION}s" repeatCount="indefinite"/>')
        a(f'  </path>')

        # Snake head
        a(f'  <circle r="6" fill="{T["head"]}">')
        a(f'    <animateMotion dur="{DURATION}s" repeatCount="indefinite">'
          f'<mpath href="#sp"/></animateMotion>')
        a(f'  </circle>')

        # Eye
        a(f'  <circle r="2" fill="{T["eye"]}">')
        a(f'    <animateMotion dur="{DURATION}s" repeatCount="indefinite">'
          f'<mpath href="#sp"/></animateMotion>')
        a(f'  </circle>')

    a('</svg>')
    return "\n".join(lines)


if __name__ == "__main__":
    os.makedirs("dist", exist_ok=True)
    counts = get_commit_counts()
    grid = build_grid(counts)
    total = sum(c for col in grid for c in col if c > 0)
    print(f"Commits in last 52 weeks: {total}")

    with open("dist/github-contribution-grid-snake.svg", "w") as f:
        f.write(generate_svg(grid, LIGHT))
    print("✅ Light SVG written")

    with open("dist/github-contribution-grid-snake-dark.svg", "w") as f:
        f.write(generate_svg(grid, DARK))
    print("✅ Dark SVG written")
