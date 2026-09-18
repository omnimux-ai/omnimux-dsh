# Color Spec Sheet Skill

Produces a professional Pantone-style color specification sheet from any uploaded product or character design image. The layout is pixel-measured from a canonical reference template. All rendering is done with Python/PIL — no image generation model is ever used.

---

## 1. When to use this pattern

**Use for:** character design approvals, product colorway references, toy/figure manufacturing specs, garment/costume dossiers, illustration style guides, brand asset handoffs.

**Do not use for:** photo-realistic color grading, palette mood boards without swatches, or cases where the user explicitly asks for an AI-generated illustration.

---

## 2. Reference template

A canonical Pantone-style spec sheet (~2.445 aspect ratio, landscape) is the visual model this skill reproduces. If you have a reference template image on hand, load it at the start of the run via `requests` + PIL and use it for visual calibration only. The output canvas is always **3300 × 1350 px** (same 2.445 aspect ratio). The measured layout zones in section 3 already encode the template proportions, so a reference image is optional — the proportions below are authoritative.

---

## 3. Measured layout zones

All positions are given as percentage of canvas, then converted to pixels on a **3300 × 1350 px** canvas. Use these exact proportions — do not invent positions.

### Canvas constants

```
CANVAS_W, CANVAS_H = 3300, 1350
```

### Character views (center x as % of canvas width)

| View  | Center X % | Center X px | Center Y % | Center Y px |
|-------|-----------|-------------|-----------|-------------|
| FRONT | 24.0%     | 792         | 50.0%     | 675         |
| SIDE  | 58.6%     | 1934        | 50.0%     | 675         |
| BACK  | 88.0%     | 2904        | 50.0%     | 675         |

Max character height: 89% → 1202 px  
Max character width per view: 18.5% → 594 px  

### Metadata block

Top-left corner: x=36, y=30

### Left standalone swatches (x=40, stacked vertically)

| Swatch | Y %   | Y px |
|--------|-------|------|
| 1      | 38.6% | 521  |
| 2      | 51.2% | 691  |
| 3      | 64.5% | 871  |

### Center & side standalone swatches

| Slot         | X %   | X px | Y %   | Y px | Notes                    |
|--------------|-------|------|-------|------|--------------------------|
| Above HAIR DECO (large) | 37.8% | 1247 | 3.3%  | 45   | size=60px                |
| Mid-body 1   | 37.6% | 1241 | 48.7% | 657  | secondary body color pos |
| Mid-body 2 / OMBRE | 52.3% | 1726 | 48.2% | 651 | opacity note if needed  |
| Side accessory | 67.7% | 2234 | 13.1% | 177  | near SIDE character head |

### Deco group boxes (top-left corners)

| Box              | X %   | X px | Y %   | Y px |
|------------------|-------|------|-------|------|
| HAIR DECO        | 47.6% | 1571 | 9.6%  | 130  |
| EYESHADOW DECO   | 47.6% | 1571 | 27.9% | 377  |
| UNDERGARMENT DECO | 1.3% | 43   | 67.4% | 910  |
| TOP DECO         | 39.1% | 1290 | 64.5% | 871  |

---

## 4. Step-by-step workflow

### Step 1 — Load the uploaded image (and optional template)

1. (Optional) If a reference template PNG is available, load it with `requests` + PIL for visual reference only.
2. Call `get_asset` on the user's uploaded image to get its CDN URL.
3. Study the image: identify all color zones (hair, skin, eyes, lips, top/shirt, bottom, undergarment, accessories, shoes, decorative elements).
4. Determine which character views are present (front only, or front+side+back).

### Step 2 — Color zone analysis

For each zone, extract:
- 1–3 dominant colors
- Closest **PMS C (Coated)** code
- Hex approximation
- Finish: `GLOSSY` / `MATTE` / `OMBRE` / `SEMI-GLOSS`
- Opacity note if < 100%
- For OMBRE: two PMS endpoint codes + gradient direction

Map colors to slots:

| Slot | Typical content |
|------|----------------|
| Left standalone swatches (3) | Primary colors: base hair, eyes, skin |
| HAIR DECO box | Hair accent/highlight colors |
| EYESHADOW DECO box | Eye makeup colors |
| UNDERGARMENT DECO box | Garment/undergarment colors (2 rows of 3) |
| TOP DECO box | Top/shirt colors |
| Center large standalone | Hair clip/accessory color above HAIR DECO |
| Mid-body standalones | Body shadow, overlay, or secondary body color |
| Side standalone | Accessory near head/ear (right of SIDE view) |

Rename deco boxes to match the actual subject if needed (e.g. "GOWN DECO" instead of "TOP DECO").

### Step 3 — Build spec sheet with Python/PIL

Run the script below after replacing **ALL** placeholder values. The hex/PMS/finish values shown are generic illustrative defaults that demonstrate the data shape for each slot — overwrite every one with values extracted from the actual uploaded image.

```python
from PIL import Image, ImageDraw, ImageFont
import requests
from io import BytesIO
import os

os.makedirs("/tmp/outputs", exist_ok=True)

# ═══ CONSTANTS ════════════════════════════════════════════════
CANVAS_W, CANVAS_H = 3300, 1350
MAGENTA      = (204, 0, 102)
GREEN_BORDER = (46, 125, 50)
RED_LABEL    = (204, 34, 0)
BLACK        = (26, 26, 26)
GREY         = (160, 160, 160)
SWATCH_SM    = 48
SWATCH_BOX   = 52
SWATCH_LG    = 60
PAD          = 16

# ═══ PROPORTIONAL POSITIONS ═══════════════════════════════════
def px(frac_w): return int(frac_w * CANVAS_W)
def py(frac_h): return int(frac_h * CANVAS_H)

FRONT_CX, CHAR_CY = px(0.240), py(0.500)
SIDE_CX            = px(0.586)
BACK_CX            = px(0.880)
CHAR_MAX_H         = py(0.890)
CHAR_MAX_W         = px(0.185)

META_X, META_Y = 36, 30

LEFT_SW_X = 40
LEFT_SW_YS = [py(0.386), py(0.512), py(0.645)]

SW_LG_X,   SW_LG_Y   = px(0.378), py(0.033)
SW_MID1_X, SW_MID1_Y = px(0.376), py(0.487)
SW_MID2_X, SW_MID2_Y = px(0.523), py(0.482)
SW_SIDE_X, SW_SIDE_Y = px(0.677), py(0.131)

HAIR_BX,  HAIR_BY  = px(0.476), py(0.096)
EYE_BX,   EYE_BY   = px(0.476), py(0.279)
UG_BX,    UG_BY    = px(0.013), py(0.674)
TOP_BX,   TOP_BY   = px(0.391), py(0.645)

# ═══ CANVAS ═══════════════════════════════════════════════════
canvas = Image.new("RGB", (CANVAS_W, CANVAS_H), "white")
draw = ImageDraw.Draw(canvas)

# ═══ FONTS ════════════════════════════════════════════════════
try:
    FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    f_sm      = ImageFont.truetype(FONT_PATH, 18)
    f_sm_bold = ImageFont.truetype(FONT_BOLD, 18)
    f_sec     = ImageFont.truetype(FONT_BOLD, 24)
    f_meta    = ImageFont.truetype(FONT_PATH, 24)
    f_meta_b  = ImageFont.truetype(FONT_BOLD, 26)
    f_view    = ImageFont.truetype(FONT_BOLD, 26)
    f_note    = ImageFont.truetype(FONT_PATH, 16)
except:
    f_sm = f_sm_bold = f_sec = f_meta = f_meta_b = f_view = f_note = ImageFont.load_default()

# ═══ HELPERS ══════════════════════════════════════════════════
def h2r(hex_c):
    hex_c = hex_c.lstrip("#")
    return tuple(int(hex_c[i:i+2], 16) for i in (0, 2, 4))

def draw_swatch(x, y, hex_c, pms_label, finish="", size=SWATCH_SM, note=""):
    draw.rectangle([x, y, x+size, y+size], fill=h2r(hex_c), outline=GREY, width=1)
    mid = x + size // 2
    draw.text((mid, y+size+3),  pms_label, fill=BLACK, font=f_sm, anchor="mt")
    if finish:
        draw.text((mid, y+size+20), finish, fill=BLACK, font=f_sm, anchor="mt")
    if note:
        draw.text((mid, y+size+38), note,   fill=BLACK, font=f_note, anchor="mt")

def draw_deco_box(bx, by, section_name, swatches, two_rows=False):
    if two_rows:
        half = len(swatches) // 2
        row1, row2 = swatches[:half], swatches[half:]
        cols = max(len(row1), len(row2))
        bw = cols * (SWATCH_BOX + PAD) + PAD
        bh = 2 * SWATCH_BOX + 3 * PAD + 36
    else:
        cols = len(swatches)
        bw = cols * (SWATCH_BOX + PAD) + PAD
        bh = SWATCH_BOX + PAD * 2 + 36
    draw.text((bx, by - 28), section_name, fill=RED_LABEL, font=f_sec)
    draw.rectangle([bx, by, bx+bw, by+bh], outline=GREEN_BORDER, width=3)
    if two_rows:
        for i, (hx, pms, fin, *rest) in enumerate(row1):
            sx = bx + PAD + i*(SWATCH_BOX+PAD)
            draw_swatch(sx, by+PAD, hx, pms, fin, SWATCH_BOX, rest[0] if rest else "")
        for i, (hx, pms, fin, *rest) in enumerate(row2):
            sx = bx + PAD + i*(SWATCH_BOX+PAD)
            draw_swatch(sx, by+PAD+SWATCH_BOX+PAD+36, hx, pms, fin, SWATCH_BOX, rest[0] if rest else "")
    else:
        for i, (hx, pms, fin, *rest) in enumerate(swatches):
            sx = bx + PAD + i*(SWATCH_BOX+PAD)
            draw_swatch(sx, by+PAD, hx, pms, fin, SWATCH_BOX, rest[0] if rest else "")
    return bw, bh

def draw_leader(x1, y1, x2, y2):
    draw.line([(x1,y1),(x2,y2)], fill=MAGENTA, width=2)
    draw.ellipse([x2-3, y2-3, x2+3, y2+3], fill=MAGENTA)

# ═══ LOAD + PLACE UPLOADED IMAGE (PIXEL-PERFECT, UNCHANGED) ════
USER_IMAGE_URL = "REPLACE_WITH_REAL_URL"  # from get_asset
u_resp = requests.get(USER_IMAGE_URL, timeout=30)
user_img = Image.open(BytesIO(u_resp.content)).convert("RGBA")
ratio = min(CHAR_MAX_W / user_img.width, CHAR_MAX_H / user_img.height)
uw = int(user_img.width * ratio)
uh = int(user_img.height * ratio)
user_img_r = user_img.resize((uw, uh), Image.LANCZOS)
img_x = FRONT_CX - uw // 2
img_y = CHAR_CY  - uh // 2
bg = Image.new("RGBA", (CANVAS_W, CANVAS_H), "white")
bg.paste(user_img_r, (img_x, img_y), user_img_r)
canvas = bg.convert("RGB")
draw = ImageDraw.Draw(canvas)

draw.text((FRONT_CX, img_y + uh + 14), "FRONT", fill=BLACK, font=f_view, anchor="mt")

# ═══ METADATA BLOCK ════════════════════════════════════════════
# Plain lines. No label prefixes. First line = character/product name.
# (Illustrative placeholders — replace with the real subject's details.)
my = META_Y
meta_lines = [
    ("<Subject Name>",                          BLACK,   f_meta),
    ("*<Base Color> (MATTE) -MM/DD/YY",         MAGENTA, f_meta_b),
    ("Head:",                                    BLACK,   f_meta),
    ("Body:",                                    BLACK,   f_meta),
    ("*Feature: None",                           MAGENTA, f_meta_b),
]
for txt, col, fnt in meta_lines:
    draw.text((META_X, my), txt, fill=col, font=fnt)
    my += 34

# ═══ LEFT STANDALONE SWATCHES + LEADER LINES ══════════════════
# 3 primary colors, stacked at x=40. Leader lines point at character zones.
# Generic illustrative values — replace hex/PMS/finish per the actual image.
left_sw_data = [
    # (hex,       pms_code,      finish,   rx,   ry)   ← rx/ry = fraction of char bounding box
    ("#5C2E00", "PMS 1545 C",  "MATTE",  0.40, 0.12),  # primary zone 1 (e.g. hair)
    ("#1A1A1A", "PMS Black C", "GLOSSY", 0.50, 0.38),  # primary zone 2 (e.g. eyes)
    ("#FFFFFF", "PMS White C", "GLOSSY", 0.52, 0.41),  # primary zone 3 (e.g. highlights)
]
for i, (hx, pms, fin, rx, ry) in enumerate(left_sw_data):
    sy = LEFT_SW_YS[i]
    draw_swatch(LEFT_SW_X, sy, hx, pms, fin)
    tx = int(img_x + uw * rx)
    ty = int(img_y + uh * ry)
    draw_leader(LEFT_SW_X + SWATCH_SM, sy + SWATCH_SM//2, tx, ty)

# ═══ CENTER STANDALONE SWATCHES ═══════════════════════════════
draw_swatch(SW_LG_X, SW_LG_Y, "#A8D8EA", "PMS 628 C", "GLOSSY", size=SWATCH_LG)
draw_leader(SW_LG_X + SWATCH_LG//2, SW_LG_Y + SWATCH_LG,
            int(img_x + uw*0.43), int(img_y + uh*0.10))

draw_swatch(SW_MID1_X, SW_MID1_Y, "#3D1C02", "PMS 4625 C", "", size=SWATCH_SM)
draw_leader(SW_MID1_X + SWATCH_SM, SW_MID1_Y + SWATCH_SM//2,
            int(img_x + uw*0.55), int(img_y + uh*0.60))

draw_swatch(SW_MID2_X, SW_MID2_Y, "#8B0000", "PMS 1935 C", "OMBRE",
            size=SWATCH_SM, note="40% OPACITY")
draw_leader(SW_MID2_X, SW_MID2_Y + SWATCH_SM//2,
            int(img_x + uw*0.65), int(img_y + uh*0.55))

# Side standalone: an accessory near the SIDE view head.
# Use the `note` arg to add a short fabrication note when relevant.
draw_swatch(SW_SIDE_X, SW_SIDE_Y, "#B2D8D8", "PMS 566 C", "GLOSSY", size=SWATCH_SM,
            note="<accessory note>")

# ═══ HAIR DECO BOX ════════════════════════════════════════════
draw_deco_box(HAIR_BX, HAIR_BY, "HAIR DECO", [
    ("#3D1C02", "PMS 4625 C", "MATTE"),
    ("#B0E0E6", "PMS 310 C",  "GLOSSY"),
    ("#D4870E", "PMS 1385 C", "MATTE"),
])
draw_leader(HAIR_BX, HAIR_BY + 30, int(img_x + uw*0.50), int(img_y + uh*0.05))

# ═══ EYESHADOW DECO BOX ═══════════════════════════════════════
draw_deco_box(EYE_BX, EYE_BY, "EYESHADOW DECO", [
    ("#7B5B00", "PMS 1405 C",        "MATTE"),
    ("#BEBEBE", "PMS Cool Grey 3 C", "OMBRE"),
])
draw.text((EYE_BX + PAD + SWATCH_BOX + PAD + SWATCH_BOX + PAD + 6, EYE_BY + PAD),
          "OMBRE\n(PMS 701 in center,\nPMS 707 on outer)",
          fill=BLACK, font=f_note)

# ═══ UNDERGARMENT DECO BOX (2 rows of 3) ══════════════════════
draw_deco_box(UG_BX, UG_BY, "UNDERGARMENT DECO", [
    ("#1A1A1A", "PMS Neutral\nBlack C",  "MATTE"),
    ("#BEBEBE", "PMS Cool\nGrey 3 C",    "MATTE"),
    ("#B2D8D8", "PMS 566 C",             "MATTE"),
    ("#D8B4D8", "PMS 2635 C",            "MATTE"),
    ("#D4870E", "PMS 1385 C",            "MATTE"),
    ("#CC8C00", "PMS 714 C",             "MATTE"),
], two_rows=True)

# ═══ TOP DECO BOX ══════════════════════════════════════════════
draw_deco_box(TOP_BX, TOP_BY, "TOP DECO", [
    ("#1A1A1A", "PMS Black C",        "MATTE"),
    ("#F4A0B0", "PMS 182 C",          "MATTE"),
    ("#FFFFFF", "PMS White C",        "MATTE"),
    ("#BEBEBE", "PMS Cool Grey 3 C",  "MATTE"),
])
draw.text((TOP_BX + PAD, TOP_BY + PAD), "ARTWORK\n(enlarged for detail)",
          fill=BLACK, font=f_note)

# ═══ SAVE ══════════════════════════════════════════════════════
canvas.save("/tmp/outputs/color_spec_sheet.png", "PNG", dpi=(150,150))
print(f"Saved. Canvas={CANVAS_W}x{CANVAS_H}, char at ({img_x},{img_y}) {uw}x{uh}")
```

**Before running, replace ALL placeholders:**
- `USER_IMAGE_URL` → real URL from `get_asset`
- All hex colors → actual extracted colors from the uploaded image
- All PMS codes → nearest PMS C matches
- All finish labels → `GLOSSY` / `MATTE` / `OMBRE` / `SEMI-GLOSS` as appropriate
- Metadata lines → real character/product name, skin tone/base color, today's date `MM/DD/YY`
- Leader line `(rx, ry)` fractions → adjusted to point at the correct zones on this specific image
- Deco box swatches → actual zones present in this image (rename sections if needed)
- If multiple views present, place SIDE and BACK images at their respective center coordinates

### Step 4 — Register & deliver

```python
register_asset(asset_id="color-spec:sheet",
               file_path="/tmp/outputs/color_spec_sheet.png",
               asset_type="image")
```

Deliver: `[Color Spec Sheet](color-spec:sheet)`

Then output the companion PMS table:

```
| Zone | PMS Code | Hex Approx | Finish |
|------|----------|------------|--------|
| Hair | PMS 1545 C | #5C2E00 | MATTE |
| Eyes | PMS Black C | #1A1A1A | GLOSSY |
| ...  | ...        | ...     | ...   |
```

---

## 5. Hard rules — do not regress

1. **NEVER call `generate_image`** — permanently forbidden.
2. **No title header** of any kind ("COLOR SPECIFICATION SHEET" etc.) — the canvas has no title text.
3. **No label prefixes in metadata** ("CHARACTER:", "SKIN TONE:" etc.) — plain lines only; the first line is just the name or category.
4. **No finish key/legend footer.**
5. **No outer borders, dividers, watermarks, or extra decorations.**
6. **Canvas MUST be 3300 × 1350 px**, white background, landscape orientation.
7. **Use exact proportional positions** from the measured layout zones — never invent positions.
8. **Deco box positions are fixed:** HAIR DECO at (47.6%, 9.6%), EYESHADOW DECO at (47.6%, 27.9%), UNDERGARMENT DECO at (1.3%, 67.4%), TOP DECO at (39.1%, 64.5%).
9. **Left standalone swatches:** x=40, y positions at 38.6% / 51.2% / 64.5%.
10. **Color constants:** deco box borders = `#2E7D32` (green), leader lines = `#CC0066` (magenta), section labels = `#CC2200` (red).
11. **Replace ALL placeholder values** before running the script — never run with placeholder hex or PMS values.
12. **Always deliver the companion PMS text table** alongside the image.
13. The user's image is placed **pixel-perfect and unchanged** — only scaled proportionally to fit within the character zone bounds, using `Image.LANCZOS`.