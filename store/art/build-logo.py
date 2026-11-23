"""Draws drip's logo as SVG files with the letters as outlines, so nothing that shows it needs a font.

Usage: python3 store/art/build-logo.py <Inter variable font, .ttf or .woff2>
Needs fonttools, brotli (for .woff2) and uharfbuzz: pip install fonttools brotli uharfbuzz
The font isn't in the repo. Inter is free (SIL Open Font License), from https://github.com/rsms/inter or Google Fonts.
The files were last built from Google Fonts' Inter v20.

It writes store/logo/drip-logo.svg (the drop, "drip", and the line under them), drip-wordmark.svg (no line), a
-light copy of each for dark backgrounds, and src/welcome/wordmark.svg (the letters alone, for the welcome page).

The logo is variant G of the logo rounds of 2026-11-23, picked by Jesse: the drop beside "drip" in Inter at weight
800, and "YouTube without the feed" centered under them at weight 700, all in ink. The numbers below are the CSS of
that mockup, in em of the wordmark's font size.
"""
import os
import re
import sys
import tempfile

import uharfbuzz as hb
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

INK, LIGHT, BLUE = '#1c1b19', '#f4f0e8', '#42a5f6'
NAME, LINE = 'drip', 'YouTube without the feed'
NAME_WEIGHT, NAME_SPACING = 800, -0.05
LINE_WEIGHT, LINE_SPACING, LINE_SIZE, LINE_GAP = 700, -0.035, 0.29, 0.36
DROP_HEIGHT, DROP_GAP, DROP_W, DROP_H = 0.93, 0.15, 600, 893
UNIT = 1000  # SVG units per em of the wordmark
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')


def load(path):
    """Returns a HarfBuzz face and the font's metrics. HarfBuzz can't read .woff2, so that is unpacked first."""
    tt = TTFont(path)
    if tt.flavor:
        tt.flavor = None
        path = tempfile.mkstemp(suffix='.ttf')[1]
        tt.save(path)
    upm = tt['head'].unitsPerEm
    ascent, descent = tt['hhea'].ascent / upm, -tt['hhea'].descent / upm
    # With line-height 1, the baseline sits this far under the top of the line.
    baseline = (1 - ascent - descent) / 2 + ascent
    return hb.Face(hb.Blob.from_file_path(path)), upm, baseline


def run(face, upm, text, weight, spacing):
    """Shapes text the way Chrome does with letter-spacing set: kerning on, ligatures off.
    Returns the font at that weight, [(glyph id, x in em)], and the width in em, with the spacing after every
    letter as in CSS."""
    font = hb.Font(face)
    font.set_variations({'wght': weight})
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(font, buf, {'liga': False, 'clig': False, 'calt': False})
    x, glyphs = 0.0, []
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        glyphs.append((info.codepoint, x + pos.x_offset / upm))
        x += pos.x_advance / upm + spacing
    return font, glyphs, x


def outline(font, upm, glyphs, left, baseline, size):
    """One path for a run, and its bounds. left and baseline are in em of the wordmark; size is the run's font
    size in em."""
    pen = SVGPathPen(None, lambda v: f'{v:.1f}'.rstrip('0').rstrip('.'))
    box = BoundsPen(None)
    scale = size * UNIT / upm
    for gid, x in glyphs:
        t = (scale, 0, 0, -scale, (left + x * size) * UNIT, baseline * UNIT)
        font.draw_glyph_with_pen(gid, TransformPen(pen, t))
        font.draw_glyph_with_pen(gid, TransformPen(box, t))
    return pen.getCommands(), box.bounds


def main(font_path):
    face, upm, base = load(font_path)
    drop_d = re.search(r'<path d="([^"]+)"', open(os.path.join(ROOT, 'src/icons/drop.svg')).read()).group(1)

    name_font, name_glyphs, name_w = run(face, upm, NAME, NAME_WEIGHT, NAME_SPACING)
    line_font, line_glyphs, line_w = run(face, upm, LINE, LINE_WEIGHT, LINE_SPACING)
    line_w *= LINE_SIZE
    drop_w = DROP_HEIGHT * DROP_W / DROP_H
    row_w = drop_w + DROP_GAP + name_w

    def logo(with_line, text_fill):
        width = max(row_w, line_w) if with_line else row_w
        row_x = (width - row_w) / 2
        k = DROP_HEIGHT * UNIT / DROP_H
        drop = (row_x * UNIT, (1 - DROP_HEIGHT) / 2 * UNIT, k)
        paths = [outline(name_font, upm, name_glyphs, row_x + drop_w + DROP_GAP, base, 1)]
        if with_line:
            top = 1 + LINE_GAP * LINE_SIZE
            paths.append(outline(line_font, upm, line_glyphs, (width - line_w) / 2, top + base * LINE_SIZE, LINE_SIZE))
        # The picture is cropped to the ink, so whatever places it can center it by its own box.
        boxes = [b for _, b in paths] + [(drop[0], drop[1], drop[0] + DROP_W * k, drop[1] + DROP_H * k)]
        x0, y0 = min(b[0] for b in boxes), min(b[1] for b in boxes)
        w, h = max(b[2] for b in boxes) - x0, max(b[3] for b in boxes) - y0
        label = f'{NAME}: {LINE}' if with_line else NAME
        body = ''.join(f'<path fill="{text_fill}" d="{d}"/>' for d, _ in paths)
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0:.1f} {y0:.1f} {w:.1f} {h:.1f}" '
            f'width="{w:.0f}" height="{h:.0f}" role="img" aria-label="{label}">'
            f'<path fill="{BLUE}" transform="translate({drop[0]:.1f} {drop[1]:.1f}) scale({k:.5f})" d="{drop_d}"/>'
            f'{body}</svg>\n'
        )

    def letters():
        """The letters alone, for a CSS mask beside the page's own drop. The box starts where the text starts and is
        as tall above the middle of the line as below it, so centering the box centers the line."""
        d, (_, y0, x1, y1) = outline(name_font, upm, name_glyphs, 0, base, 1)
        half = max(UNIT / 2 - y0, y1 - UNIT / 2)
        w, h = x1, 2 * half
        print(f'src/welcome/wordmark.svg is {w / UNIT:.3f}em by {h / UNIT:.3f}em of the wordmark; welcome.css sizes it')
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 {UNIT / 2 - half:.1f} {w:.1f} {h:.1f}" '
            f'width="{w:.0f}" height="{h:.0f}"><path d="{d}"/></svg>\n'
        )

    files = {
        'store/logo/drip-logo.svg': logo(True, INK),
        'store/logo/drip-logo-light.svg': logo(True, LIGHT),
        'store/logo/drip-wordmark.svg': logo(False, INK),
        'store/logo/drip-wordmark-light.svg': logo(False, LIGHT),
        'src/welcome/wordmark.svg': letters(),
    }
    for file, text in files.items():
        with open(os.path.join(ROOT, file), 'w') as f:
            f.write(text)
        print(file, len(text), 'bytes')


if __name__ == '__main__':
    main(sys.argv[1])
