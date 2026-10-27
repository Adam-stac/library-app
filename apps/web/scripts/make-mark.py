"""
Draws the خِزانة mark as SVG path data from Amiri Bold, a classical naskh under the SIL Open Font License
(https://github.com/aliftype/amiri). The app then shows the mark as an inline SVG: crisp at any size, coloured by
the theme, and with no 100 kB font to download for one word.

Not run by the build. To redraw the mark (for example with another font), download Amiri from
https://github.com/aliftype/amiri/releases, then from apps/web:
    pip install fonttools uharfbuzz brotli
    python3 scripts/make-mark.py path/to/Amiri-Bold.ttf > mark.txt
It prints the viewBox, then the path data for src/components/Brand.tsx, then the path for public/favicon.svg.
Files in public/ are served as they are, so they carry no comments (src/publicFiles.test.ts checks): the credit
for Amiri lives here and in ADR 0008.
"""
import io
import sys

import uharfbuzz as hb
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont


def draw(font_path, text, padding=20):
    font = TTFont(font_path)
    font.flavor = None
    data = io.BytesIO()
    font.save(data)
    shaper = hb.Font(hb.Face(data.getvalue()))
    buffer = hb.Buffer()
    buffer.add_str(text)
    buffer.guess_segment_properties()  # Arabic, right to left: joining forms and the kasra's place
    hb.shape(shaper, buffer, {})

    glyphs, order = font.getGlyphSet(), font.getGlyphOrder()
    path, bounds = SVGPathPen(glyphs), BoundsPen(glyphs)
    x = 0
    for info, position in zip(buffer.glyph_infos, buffer.glyph_positions):
        glyph = glyphs[order[info.codepoint]]
        flip = (1, 0, 0, -1, x + position.x_offset, -position.y_offset)  # font units point up, SVG's point down
        glyph.draw(TransformPen(path, flip))
        glyph.draw(TransformPen(bounds, flip))
        x += position.x_advance
    x_min, y_min, x_max, y_max = bounds.bounds
    view_box = f"{int(x_min - padding)} {int(y_min - padding)} {int(x_max - x_min + 2 * padding)} {int(y_max - y_min + 2 * padding)}"
    return view_box, path.getCommands()


if __name__ == "__main__":
    for text in ("خِزانة", "خ"):
        view_box, path = draw(sys.argv[1], text)
        print(view_box)
        print(path)
