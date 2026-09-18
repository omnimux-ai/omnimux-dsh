# PIL Print Flyer — Photo Grid Pattern

A recipe for producing a pixel-precise, print-ready PNG flyer using Python PIL. The structural mold works for any trade, contractor, or product-line business. The sections, color slots, and copy slots are clearly labeled so you can swap the subject without touching the layout engine.

---

## 1. When to use this pattern

**Good fit:**
- Trades, home-services, and product-line businesses of any category
- Any client who has real photos to feature and a product/service page to scrape
- Deliverable must be a single downloadable PNG (print or social distribution)
- Client wants a photo strip, price call-out, product model grid, and contact footer on one page
- User has or can provide a QR code image

**Poor fit:**
- Pure text documents or reports (use a PDF pipeline instead)
- Designs that require interactive elements, animations, or vector export
- Brands with strict multi-page layouts or bleed/trim requirements needing InDesign-class tools

---

## 2. Research phase (run before writing any PIL code)

Before touching layout, gather all content:

1. **Scrape the product/service page** (`web_fetch`) to extract: brand name, tagline, license numbers, product model names, key feature bullets, warranties, phone, website.
2. **Scrape the homepage** for social media handles.
3. **Confirm user-uploaded images** with `get_asset` (visually verify orientation and content for each `input:image-N`).
4. **Retrieve CDN URLs** via `list_assets` — PIL needs HTTP URLs to download images; workspace asset IDs alone aren't enough.
5. **Extract product/service image URLs** from the scraped HTML with a regex pattern:
   ```python
   import re, requests
   html = requests.get(PRODUCT_PAGE_URL).text
   imgs = re.findall(r'src=["\']([^"\']*ModelKeyword[^"\']*)["\']', html)
   full_urls = [f"{BASE_URL}/{p}" if not p.startswith('http') else p for p in imgs]
   ```
   Adapt `ModelKeyword` to match the site's image naming convention.

---

## 3. Canvas & layout spec

```
Canvas width  : 1275 px  (8.5 in × 150 DPI)
Canvas height : build into 2600 px tall scratch space; crop to actual content at end
DPI tag       : 150
Color depth   : RGB
```

### Section order (top → bottom)

| # | Section | Height (px) | Notes |
|---|---------|-------------|-------|
| A | Header | ~190 | Brand name + tagline + license numbers |
| B | Photo strip | ~295 | 3 user photos, side by side, 4 px gaps |
| C | Price badge | ~62 | Accent BG, large price text + size range |
| D | What to expect | dynamic | 2-column bullet grid |
| E | Product series strip | ~230 | Product images + label boxes below each |
| F | Popular add-ons | dynamic | 2-column list |
| G | CTA strip | ~44 | Light BG, website + phone, centered |
| H | Footer | ~250 | Dark BG; left=contact+social, center=QR, right=quick-facts |
| I | Bottom bar | ~26 | Darkest shade, copyright |

Track a running `cy` (current y) cursor. Draw each section starting at `cy`, advance `cy` by the section height. At the end, crop: `canvas.crop((0, 0, W, cy))`.

---

## 4. Color scheme

Define as hex constants at the top of the script. This entire block is swappable per brand — the values below are neutral placeholders; replace every one with the target brand's palette:

```python
PRIMARY_DARK  = "#222222"   # header / footer background
PRIMARY_MID   = "#444444"   # section bars
PRIMARY_LIGHT = "#666666"   # alternating accents
ACCENT        = "#999999"   # accent stripes, price badge, footer top rule
WHITE         = "#FFFFFF"
LIGHT_BG      = "#F2F2F2"   # CTA strip background
DARK_BAR      = "#111111"   # bottom bar
```

**Swap rule:** Replace all of these hex values for a different brand; never hard-code color literals anywhere else in the script.

---

## 5. Typography

```python
from pathlib import Path
from PIL import ImageFont

FONT_DIR = Path("/usr/share/fonts/truetype/liberation")
FALLBACKS = [Path("/usr/share/fonts/truetype/dejavu"),
             Path("/usr/share/fonts/truetype/freefont")]

def load_font(size, bold=False):
    name = "LiberationSans-Bold.ttf" if bold else "LiberationSans-Regular.ttf"
    for base in [FONT_DIR] + FALLBACKS:
        p = base / name
        if p.exists():
            return ImageFont.truetype(str(p), size)
    return ImageFont.load_default()
```

**Size ladder:**
- Company name: 66pt bold
- Tagline: 22pt regular
- License / small print: 15pt regular
- Price (large): 38pt bold
- Price (sub): 17pt regular
- Section bar labels: 18pt bold
- Bullets: 16pt bold
- Body / footer text: 14–16pt regular
- Model labels: 13pt bold + 11pt regular

---

## 6. Core utility functions

Include these verbatim in every flyer script:

```python
def crop_center(img, target_w, target_h):
    """Crop any image to exact pixel dimensions, anchored to center."""
    r = max(target_w / img.width, target_h / img.height)
    nw, nh = int(img.width * r), int(img.height * r)
    img = img.resize((nw, nh), Image.LANCZOS)
    x = (nw - target_w) // 2
    y = (nh - target_h) // 2
    return img.crop((x, y, x + target_w, y + target_h))

def centered_text(draw, y, text, font, color):
    """Draw text horizontally centered on the full canvas width W."""
    bb = draw.textbbox((0, 0), text, font=font)
    x = (W - (bb[2] - bb[0])) // 2
    draw.text((x, y), text, font=font, fill=color)

def sec_bar(draw, y, label, bg_color, text_color="#FFFFFF", height=34):
    """Draw a full-width section header bar with centered label."""
    draw.rectangle([0, y, W, y + height], fill=bg_color)
    centered_text(draw, y + 6, label, load_font(18, bold=True), text_color)
    return y + height
```

---

## 7. Section-by-section implementation notes

### A — Header
```python
draw.rectangle([0, 0, W, 190], fill=PRIMARY_DARK)
draw.rectangle([0, 0, W, 8], fill=ACCENT)        # top accent stripe
draw.rectangle([0, 182, W, 190], fill=ACCENT)    # bottom accent stripe
centered_text(draw, 14,  COMPANY_NAME, load_font(66, bold=True), WHITE)
centered_text(draw, 90,  TAGLINE,      load_font(22),            WHITE)
centered_text(draw, 128, LICENSE_LINE, load_font(15),            ACCENT)
cy = 190
```

### B — Photo strip
- Use `list_assets` to get CDN URLs; download with `requests.get(...).content`.
- **Always** call `ImageOps.exif_transpose(img)` immediately after `Image.open()`.
- Lay 3 photos at equal widths: `photo_w = (W - 2*GAP) // 3` where `GAP = 4`.

### C — Price badge
```python
draw.rectangle([0, cy, W, cy+62], fill=ACCENT)
centered_text(draw, cy+4,  PRICE_TEXT, load_font(38, bold=True), PRIMARY_DARK)
centered_text(draw, cy+46, SIZE_RANGE, load_font(17),            PRIMARY_DARK)
cy += 62
```

### D — Bullet grid (2 columns)
```python
col_bullets_left  = ["• Bullet one", "• Bullet two", ...]   # ~5 items
col_bullets_right = ["• Bullet one", "• Bullet two", ...]   # ~4 items
LINE_H = 27
col_x = [60, W//2 + 20]
for i, b in enumerate(col_bullets_left):
    draw.text((col_x[0], cy + i*LINE_H), b, font=load_font(16, bold=True), fill=PRIMARY_DARK)
for i, b in enumerate(col_bullets_right):
    draw.text((col_x[1], cy + i*LINE_H), b, font=load_font(16, bold=True), fill=PRIMARY_DARK)
cy += max(len(col_bullets_left), len(col_bullets_right)) * LINE_H + 20
```

### E — Product series strip
```python
slot_w = W // N_MODELS
for i, (url, name, tag) in enumerate(models):
    img = crop_center(load_url(url), slot_w - 4, 190)
    canvas.paste(img, (i * slot_w + 2, cy))
label_y = cy + 190
for i, (_, name, tag) in enumerate(models):
    draw.rectangle([i*slot_w, label_y, (i+1)*slot_w, label_y+40], fill=PRIMARY_MID)
    draw.text((i*slot_w+6, label_y+4),  name, font=load_font(13, bold=True), fill=WHITE)
    draw.text((i*slot_w+6, label_y+22), tag,  font=load_font(11),            fill=ACCENT)
cy = label_y + 40
```

### F — Add-ons (2 columns)
Same 2-column pattern as bullets. List up to 6–8 items.

### G — CTA strip
```python
draw.rectangle([0, cy, W, cy+44], fill=LIGHT_BG)
centered_text(draw, cy+10, f"Visit {WEBSITE}  |  Call {PHONE}",
              load_font(18, bold=True), PRIMARY_DARK)
cy += 44
```

### H — Footer
Three zones within the footer band (`FOOTER_H = 250`):

- **LEFT** (x 30–420): Phone, website, 2×2 social handle grid
- **CENTER** (x 510–760): QR code image (170×170 px) + label below
- **RIGHT** (x 810–W-20): Quick-facts panel (warranty, build time, series count, size range)

```python
# QR code — center column
qr = crop_center(load_url(QR_CDN_URL), 170, 170)
canvas.paste(qr, (W//2 - 85, cy + 20))
qr_label = QR_LABEL          # short call-to-scan string, e.g. "Scan for details"
bb  = draw.textbbox((0, 0), qr_label, font=load_font(13))
lw  = bb[2] - bb[0]
draw.text((W//2 - lw//2, cy + 198), qr_label, font=load_font(13), fill=ACCENT)
```

---

## 8. Image loading helper

```python
import io, requests
from PIL import Image, ImageOps

def load_url(url: str) -> Image.Image:
    resp = requests.get(url, timeout=15)
    resp.raise_for_status()
    img = Image.open(io.BytesIO(resp.content)).convert("RGB")
    return ImageOps.exif_transpose(img)   # always correct orientation
```

---

## 9. Finishing and asset registration

```python
# Crop to actual content height
final = canvas.crop((0, 0, W, cy))

# Save at target DPI
final.save("business_flyer.png", dpi=(150, 150))

# Register for user download
register_asset(asset_id="final:flyer-v1", asset_type="image", file_path="business_flyer.png")
# Present to user as: [Download Flyer](final:flyer-v1)
```

For iterative edits, increment the version suffix (`final:flyer-v2`, `final:flyer-v3`, …) so previous renders remain accessible.

---

## 10. Hard rules / do-not-regress

Treat each as inviolable:

1. **Always `ImageOps.exif_transpose()` on every loaded photo.** Never manually rotate. Phone photos embed EXIF orientation flags; skipping this causes sideways or upside-down images.
2. **Dynamic canvas height with crop.** Build into a 2600 px scratch canvas, track `cy`, then crop to `cy`. Never hard-code a final height.
3. **Call `list_assets` before writing PIL code.** CDN URLs change between sessions. Always fetch fresh URLs rather than reusing URLs from a prior run.
4. **Call `get_asset` first for visual confirmation.** Before placing any user-uploaded image, verify its content and orientation visually. Do not assume from filename.
5. **Version-stamp every re-render.** Re-register under a new `asset_id` (v2, v3, …) so rollback is possible.
6. **Color constants block at script top.** All brand hex values in one named block. No hex literals inline anywhere else.
7. **QR code comes from user's input image.** Do not generate a QR code programmatically — the user controls what URL it encodes.

---

## 11. Copy slots reference (brand-swappable)

| Slot | What it holds | Notes |
|------|---------------|-------|
| `COMPANY_NAME` | Display name on header | Large; keep ≤ 30 chars for 66pt |
| `TAGLINE` | One-line brand promise | Keep ≤ 55 chars |
| `LICENSE_LINE` | License/credential numbers | Omit if not applicable |
| `PRICE_TEXT` | Starting price or range | Short; keep punchy |
| `SIZE_RANGE` | Available sizes or variants | Sub-line below price |
| `PHONE` | Primary contact number | Also in footer |
| `WEBSITE` | Domain only (no https://) | Used in CTA + footer |
| `SOCIAL_HANDLE` | Shared handle across platforms | e.g. @brandname |
| `QR_LABEL` | Short call-to-scan caption | Below QR; e.g. "Scan for details" |
| `col_bullets_left/right` | Feature/service bullets | 4–5 per column |
| `models` | List of `(img_url, name, tag)` | 4–6 product/service images |
| `addons` | Upsell / add-on items | 6–8, two columns |
| `QR_CDN_URL` | CDN URL of user's QR image | From `list_assets` |