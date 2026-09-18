# Reusable PIL helpers

Copy these into a `.py` file at the start of a run. Pillow + numpy only.
Run with `python3 file.py` (no pipes/semicolons/redirection in bash).

## Font loader (Inter variable font, weight axis)

```python
from PIL import ImageFont
FONT_PATH = "/tmp/outputs/Inter.ttf"  # downloaded via fetch() with a Chrome UA

def inter(size, weight=400):
    f = ImageFont.truetype(FONT_PATH, size)
    try:
        f.set_variation_by_axes([weight])   # 400/500/600/700/800
    except Exception:
        pass
    return f
```

## dtl — draw text by inked top-left

Aligns the *inked* top-left of the glyph run to (x, y) by subtracting the
getbbox offset, so detected-position edits land exactly.

```python
def dtl(draw, xy, text, font, fill):
    x, y = xy
    l, t, r, b = font.getbbox(text)
    draw.text((x - l, y - t), text, font=font, fill=fill)
    return (r - l, b - t)  # rendered (w, h)
```

## span — detect tight bbox + sampled background

```python
import numpy as np
def span(img, box, bg=None, thresh=40):
    # box = (x0, y0, x1, y1); returns (bbox_or_None, bg_color)
    crop = np.asarray(img.convert("RGB").crop(box)).astype(int)
    if bg is None:
        bg = tuple(crop[2, 2])  # sample a corner assumed background
    dist = np.abs(crop - np.array(bg)).sum(axis=2)
    ys, xs = np.where(dist > thresh)
    if len(xs) == 0:
        return None, bg
    x0, y0, x1, y1 = box
    return (x0 + xs.min(), y0 + ys.min(), x0 + xs.max() + 1, y0 + ys.max() + 1), bg
```

## Row-inpaint — rebuild gradient/dark backgrounds after clearing text

For each row of the clear region, copy from a clean probe column at the same y.

```python
def row_inpaint(img, box, probe_x):
    px = img.load()
    x0, y0, x1, y1 = box
    for y in range(y0, y1):
        src = px[probe_x, y]
        for x in range(x0, x1):
            px[x, y] = src
```

## card / pill / wrap / vertical gradient (Technique B building blocks)

```python
from PIL import Image, ImageDraw, ImageFilter

def card(draw, box, radius, fill, border=None, bw=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill,
                           outline=border, width=bw)

def pill(draw, center_xy, label, font, fill, text_fill, pad=(14, 6)):
    cx, cy = center_xy
    w = int(font.getlength(label)); h = font.getbbox(label)[3]
    box = (cx - w//2 - pad[0], cy - h//2 - pad[1],
           cx + w//2 + pad[0], cy + h//2 + pad[1])
    draw.rounded_rectangle(box, radius=(box[3]-box[1])//2, fill=fill)
    dtl(draw, (box[0]+pad[0], box[1]+pad[1]), label, font, text_fill)

def wrap(text, font, maxw):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if font.getlength(t) <= maxw:
            cur = t
        else:
            lines.append(cur); cur = w
    if cur:
        lines.append(cur)
    return lines

def vgrad_card(size, top, bottom, radius):
    w, h = size
    g = Image.new("RGB", (w, h))
    pg = g.load()
    for y in range(h):
        f = y / max(1, h - 1)
        pg_row = tuple(int(top[i] + (bottom[i]-top[i])*f) for i in range(3))
        for x in range(w):
            pg[x, y] = pg_row
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w-1, h-1),
                                           radius=radius, fill=255)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.paste(g, (0, 0), mask)
    return out
```

## find_coeffs — perspective warp (ORIENTATION WARNING)

PIL's PERSPECTIVE transform maps OUTPUT (X,Y) -> INPUT (x,y).
`pa` = destination quad (in the OUTPUT/template space),
`pb` = source corners (in the INPUT/screen-image space).
**Do not swap pa/pb — swapping inverts the map and the image explodes.**

```python
import numpy as np
def find_coeffs(pa, pb):
    A = []
    for (X, Y), (x, y) in zip(pa, pb):
        A.append([X, Y, 1, 0, 0, 0, -x*X, -x*Y])
        A.append([0, 0, 0, X, Y, 1, -y*X, -y*Y])
    A = np.asarray(A, dtype=float)
    B = np.asarray(pb, dtype=float).reshape(8)
    return np.linalg.solve(A, B)

def composite_screen(template, screen, quad, inset=1, blur=1.0):
    # quad = [TL, TR, BR, BL] in template coords
    W, H = template.size
    src = [(0, 0), (screen.width, 0),
           (screen.width, screen.height), (0, screen.height)]
    coeffs = find_coeffs(quad, src)            # pa=dest quad, pb=src corners
    warped = screen.convert("RGBA").transform(
        (W, H), Image.PERSPECTIVE, coeffs, Image.BICUBIC)
    # mask, inset ~1px toward centroid, soften edge
    cx = sum(p[0] for p in quad)/4; cy = sum(p[1] for p in quad)/4
    qin = [(x + (cx-x)*inset/100.0, y + (cy-y)*inset/100.0) for x, y in quad]
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).polygon(qin, fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(blur))
    out = template.convert("RGBA")
    out.paste(warped, (0, 0), mask)
    return out
```

## Coordinate-grid overlay (for locating elements with the read tool)

```python
def grid(img, step_orig=100, scale=0.5):
    from PIL import ImageFont
    small = img.convert("RGB").resize(
        (int(img.width*scale), int(img.height*scale)))
    d = ImageDraw.Draw(small)
    f = ImageFont.truetype(
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 12)  # debug only
    for X in range(0, img.width, step_orig):
        x = int(X*scale)
        d.line([(x, 0), (x, small.height)], fill=(255, 0, 0), width=1)
        d.text((x+2, 2), str(X), fill=(255, 0, 0), font=f)
    for Y in range(0, img.height, step_orig):
        y = int(Y*scale)
        d.line([(0, y), (small.width, y)], fill=(0, 0, 255), width=1)
        d.text((2, y+2), str(Y), fill=(0, 0, 255), font=f)
    return small  # labels are ORIGINAL-pixel coordinates
```
