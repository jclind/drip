#!/usr/bin/env python3
"""Exits 0 when a v2 screenshot has note text in its left column, 1 when it doesn't.

frames-v2.html draws its notes only after the page in the strip is ready, so a frame captured before the page drew
(the welcome tour at 2x, now and then) has none. capture.sh retries those. Usage: has-notes.py shot.png
"""
import struct
import sys
import zlib


def rows(path):
    data = open(path, 'rb').read()
    i, idat = 8, b''
    while i < len(data):
        n = struct.unpack('>I', data[i:i + 4])[0]
        kind, body = data[i + 4:i + 8], data[i + 8:i + 8 + n]
        i += 12 + n
        if kind == b'IHDR':
            width, height, _, color = struct.unpack('>IIBB', body[:10])
        elif kind == b'IDAT':
            idat += body
    raw, bpp = zlib.decompress(idat), {2: 3, 6: 4}[color]
    stride, prev, k = width * bpp, bytearray(width * bpp), 0
    for _ in range(height):
        f, line = raw[k], bytearray(raw[k + 1:k + 1 + stride])
        k += 1 + stride
        for x in range(stride):
            a = line[x - bpp] if x >= bpp else 0
            b, c = prev[x], (prev[x - bpp] if x >= bpp else 0)
            if f == 1: line[x] = (line[x] + a) & 255
            elif f == 2: line[x] = (line[x] + b) & 255
            elif f == 3: line[x] = (line[x] + (a + b) // 2) & 255
            elif f == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[x] = (line[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        yield line, bpp
        prev = line


# Ink in the notes' area: x 72 to 400, y 320 to 780, where the caption never reaches.
dark = 0
for y, (line, bpp) in enumerate(rows(sys.argv[1])):
    if 320 <= y <= 780:
        dark += sum(1 for x in range(72, 400) if line[x * bpp] < 140)
sys.exit(0 if dark > 40 else 1)
