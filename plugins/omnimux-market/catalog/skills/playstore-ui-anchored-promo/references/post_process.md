# Post-process: 16:9 generation → exact 1024×500 feature graphic

Google Play requires the feature graphic at exactly **1024×500 px**. That aspect (~2.048:1) is not a native `generate_image` ratio. The reliable path is: generate at `16:9` `2K` (which yields ~2048×1152 or similar), then crop equal top/bottom margins and LANCZOS-resize to 1024×500.

Heredoc Python (`python3 <<'PY'`) is blocked in this shell. Always `write` the script to a file, then run it.

## The script

Write this to `/tmp/outputs/resize_feature.py`, then run with two args:

```python
from PIL import Image
import sys

src_path = sys.argv[1]      # path to the downloaded 16:9 generation
dst_path = sys.argv[2]      # where to write the 1024x500 PNG

img = Image.open(src_path).convert("RGB")
w, h = img.size

target_aspect = 1024 / 500           # ~2.048
src_aspect = w / h

if src_aspect > target_aspect:
    # source is wider than target → crop left/right
    new_w = int(h * target_aspect)
    left = (w - new_w) // 2
    img = img.crop((left, 0, left + new_w, h))
else:
    # source is taller than target → crop top/bottom (typical for 16:9 → 1024×500)
    new_h = int(w / target_aspect)
    top = (h - new_h) // 2
    img = img.crop((0, top, w, top + new_h))

img = img.resize((1024, 500), Image.LANCZOS)
img.save(dst_path, "PNG", optimize=True)
print(f"wrote {dst_path} at {img.size}")
```

## How to run it

1. Download the generation output to a local path (e.g. via the generation's `asset_id` and `get_asset` → save bytes → temp file).
2. `python3 /tmp/outputs/resize_feature.py /tmp/outputs/feature_raw.png /tmp/outputs/feature_1024x500.png`
3. `register_asset(file_path="/tmp/outputs/feature_1024x500.png", ...)` to obtain the deliverable `asset_id`.

## Why not just generate at the target size

Generating at a non-native aspect produces stretched UIs and warped phone bezels. Always generate at the closest native ratio (16:9), then crop+resize.
