# Render Recipes

Concrete code fragments for the compositing + animation pipeline. Adapt rect numbers per source screenshot — these are *starting points*, not constants.

## 1. Download source screenshots (CDN UA workaround)

```python
import urllib.request

req = urllib.request.Request(
    url,
    headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                           "AppleWebKit/537.36 (KHTML, like Gecko) "
                           "Chrome/123.0 Safari/537.36"},
)
with urllib.request.urlopen(req) as r, open(local_path, "wb") as f:
    f.write(r.read())
```

Default Python `urllib` UA gets 403'd by most asset CDNs.

## 2. PIL compositor — one scene PNG

```python
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import numpy as np

W, H = 1080, 1920
CANVAS = (8, 12, 20)        # #080C14
PANEL_FILL = (16, 20, 31)   # #10141F
ACCENT = (90, 140, 255)     # tweak to product accent

def make_scene(
    src_path,          # path to source screenshot
    crop_rect,         # (x, y, w, h) in source pixels
    logo_img,          # pre-extracted PIL logo, scaled to ~360w
    caption_text,
    out_path,
    panel_top_y=380,
):
    base = Image.new("RGB", (W, H), CANVAS)

    # --- panel: crop, scale, frame ---
    src = Image.open(src_path).convert("RGB")
    x, y, w, h = crop_rect
    cropped = src.crop((x, y, x + w, y + h))
    panel_w = 1020
    scale = panel_w / cropped.width
    panel_h = int(cropped.height * scale)
    cropped = cropped.resize((panel_w, panel_h), Image.LANCZOS)

    pad = 24
    frame_w, frame_h = panel_w + 2 * pad, panel_h + 2 * pad
    frame = Image.new("RGB", (frame_w, frame_h), PANEL_FILL)
    # rounded mask
    mask = Image.new("L", (frame_w, frame_h), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, frame_w, frame_h), radius=28, fill=255
    )
    frame.paste(cropped, (pad, pad))

    # drop shadow
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sx = (W - frame_w) // 2
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle(
        (sx, panel_top_y + 12, sx + frame_w, panel_top_y + 12 + frame_h),
        radius=28, fill=(0, 0, 0, 150),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(40))
    base.paste(shadow, (0, 0), shadow)

    # paste framed panel
    base.paste(frame, (sx, panel_top_y), mask)

    # 2px accent outline
    od = ImageDraw.Draw(base)
    od.rounded_rectangle(
        (sx, panel_top_y, sx + frame_w, panel_top_y + frame_h),
        radius=28, outline=ACCENT + (0,), width=2,
    )

    # --- logo overlay ---
    lx = (W - logo_img.width) // 2
    base.paste(logo_img, (lx, 130), logo_img if logo_img.mode == "RGBA" else None)

    # --- caption ---
    font = ImageFont.truetype("DMSans-Bold.ttf", 56)
    panel_bottom = panel_top_y + frame_h
    cap_y = panel_bottom + 80
    tw = od.textlength(caption_text, font=font)
    # shadow
    od.text(((W - tw) / 2 + 2, cap_y + 2), caption_text,
            font=font, fill=(0, 0, 0, 128))
    od.text(((W - tw) / 2, cap_y), caption_text, font=font, fill=(255, 255, 255))

    # --- vignette ---
    yy, xx = np.mgrid[0:H, 0:W]
    cx, cy = W / 2, H / 2
    dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    mult = 1.0 - 0.45 * (dist / dist.max())
    arr = np.array(base).astype(np.float32)
    arr *= mult[..., None]
    base = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))

    base.save(out_path, "PNG")
```

## 3. Logo extraction (run once)

```python
src = Image.open("screenshot_with_sidebar.png").convert("RGBA")
# sidebar logo coords — inspect the source first
logo = src.crop((15, 12, 15 + 195, 12 + 45))
# upscale to ~360px wide for the overlay
scale = 360 / logo.width
logo = logo.resize((360, int(logo.height * scale)), Image.LANCZOS)
logo.save("logo.png")
```

## 4. ffmpeg Ken-Burns — one scene MP4

```bash
ffmpeg -y -loop 1 -i scene.png \
  -vf "scale=2160:3840,zoompan=z='min(zoom+0.0005,1.06)':d=120:s=1080x1920:fps=30:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'" \
  -c:v libx264 -pix_fmt yuv420p -t 4 scene.mp4
```

- `0.0005 × 120 frames = 0.06` → final zoom = 1.06.
- Pre-scaling to 2x keeps the zoomed pixels crisp.

## 5. Music generation prompt

```
"Dark cinematic startup brand spot, minimal ambient pulse, low synth pad,
soft sub-bass swell, no drums for first half, subtle percussion entering at midpoint,
modern, premium, AI / SaaS feel, builds slowly, ends on a held chord. N seconds."
```

Set `music_volume: 0.35` on `assemble_video`.

## 6. assemble_video shape (per scene)

```python
{
    "video_url": scene_mp4_url,
    "duration": 4.0,
    "mute_captions": True,                  # MANDATORY — no VO
    "text_overlays": [
        {
            "text": "Scroll-stopping hooks, ready to ship.",
            "font": "DMSans-Bold",
            "size": 56,
            "color": "#FFFFFF",
            "y": 1410,                       # nudge per-scene panel-bottom
            "animation": "fade_in",
        }
    ],
}
```

Scene 1 additionally gets a top-level `hook_overlay`:

```python
{
    "text": "One prompt. Full output. 60 seconds.",
    "style": "minimal",
    "position_y_ratio": 0.18,
}
```

Final scene additionally gets a delayed wordmark overlay at y≈1620.
