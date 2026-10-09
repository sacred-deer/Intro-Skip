#!/usr/bin/env python3
"""Generate toolbar icons as PNG files without third-party deps."""

from __future__ import annotations

import struct
import zlib
from pathlib import Path


def write_png(path: Path, width: int, height: int, pixels: list[tuple[int, int, int, int]]) -> None:
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        for x in range(width):
            raw.extend(pixels[y * width + x])

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")
    path.write_bytes(png)


def rounded_rect(px: float, py: float, size: int, radius: float) -> bool:
    x = min(max(px, 0.0), size - 1.0)
    y = min(max(py, 0.0), size - 1.0)
    r = radius
    if x >= r and x <= size - 1 - r:
        return 0 <= y <= size - 1
    if y >= r and y <= size - 1 - r:
        return 0 <= x <= size - 1
    corners = (
        (r, r),
        (size - 1 - r, r),
        (r, size - 1 - r),
        (size - 1 - r, size - 1 - r),
    )
    return any((x - cx) ** 2 + (y - cy) ** 2 <= r * r for cx, cy in corners)


def point_in_triangle(px: float, py: float, a: tuple[float, float], b: tuple[float, float], c: tuple[float, float]) -> bool:
    def sign(p1, p2, p3):
        return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])

    d1 = sign((px, py), a, b)
    d2 = sign((px, py), b, c)
    d3 = sign((px, py), c, a)
    has_neg = d1 < 0 or d2 < 0 or d3 < 0
    has_pos = d1 > 0 or d2 > 0 or d3 > 0
    return not (has_neg and has_pos)


def coverage(size: int, predicate) -> list[float]:
    samples = ((-0.25, -0.25), (0.25, -0.25), (-0.25, 0.25), (0.25, 0.25))
    values = []
    for y in range(size):
        for x in range(size):
            hits = sum(1 for dx, dy in samples if predicate(x + 0.5 + dx, y + 0.5 + dy))
            values.append(hits / len(samples))
    return values


def blend(bg: tuple[int, int, int, int], fg: tuple[int, int, int, int], alpha: float) -> tuple[int, int, int, int]:
    a = max(0.0, min(1.0, alpha)) * (fg[3] / 255.0)
    out_a = a + (bg[3] / 255.0) * (1 - a)
    if out_a == 0:
        return (0, 0, 0, 0)
    return (
        round((fg[0] * a + bg[0] * (bg[3] / 255.0) * (1 - a)) / out_a),
        round((fg[1] * a + bg[1] * (bg[3] / 255.0) * (1 - a)) / out_a),
        round((fg[2] * a + bg[2] * (bg[3] / 255.0) * (1 - a)) / out_a),
        round(out_a * 255),
    )


def make_icon(size: int) -> list[tuple[int, int, int, int]]:
    radius = size * 0.22
    pad = size * 0.22
    mid = size / 2
    tri_w = size * 0.28
    tri_h = size * 0.36
    bar_w = max(2.0, size * 0.08)

    def in_bg(x: float, y: float) -> bool:
        return rounded_rect(x, y, size, radius)

    left = (pad, mid - tri_h / 2, pad + tri_w, mid + tri_h / 2)
    right_shift = pad + tri_w * 0.72
    right = (right_shift, mid - tri_h / 2, right_shift + tri_w, mid + tri_h / 2)
    bar = (size - pad - bar_w, mid - tri_h / 2, size - pad, mid + tri_h / 2)

    def in_tri(x: float, y: float, box: tuple[float, float, float, float]) -> bool:
        x0, y0, x1, y1 = box
        return point_in_triangle(x, y, (x0, y0), (x0, y1), (x1, mid))

    def in_bar(x: float, y: float) -> bool:
        x0, y0, x1, y1 = bar
        return x0 <= x <= x1 and y0 <= y <= y1

    bg = coverage(size, in_bg)
    glyph = coverage(
        size,
        lambda x, y: in_tri(x, y, left) or in_tri(x, y, right) or in_bar(x, y),
    )

    red = (229, 9, 20, 255)
    white = (255, 255, 255, 255)
    empty = (0, 0, 0, 0)
    pixels = []
    for i in range(size * size):
        pixel = blend(empty, red, bg[i])
        pixel = blend(pixel, white, glyph[i])
        pixels.append(pixel)
    return pixels


def main() -> None:
    out_dir = Path(__file__).resolve().parents[1] / "icons"
    out_dir.mkdir(parents=True, exist_ok=True)
    for size in (16, 32, 48, 128):
        write_png(out_dir / f"icon{size}.png", size, size, make_icon(size))


if __name__ == "__main__":
    main()
