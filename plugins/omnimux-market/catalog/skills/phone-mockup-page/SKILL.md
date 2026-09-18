# Screenshot to Phone Product Page

A playbook for converting product/dashboard screenshots into pixel-clean,
phone-ready images for paid-social ads. There are **two core techniques** —
pick by what the request needs:

- **Technique A — Surgical text edit:** the layout is already fine, you only
  need to change text/numbers (rebrand a wordmark, swap a name, randomize a
  bio, change figures). Preserve the real UI pixels.
- **Technique B — Mobile reflow:** a **wide desktop** dashboard must fit a
  **portrait phone** with zero horizontal runoff. Do **not** crop a landscape
  layout to portrait — that always cuts content. Rebuild the content as stacked
  mobile cards in the app's design language.

Then optionally **composite** the portrait screen onto a "hand holding a phone"
template via perspective warp, and **mass-produce** data variants.

The subject (which app, which brand, which person, which numbers) is always
swappable. The techniques, helpers, and gotchas below are the part that stays
locked.

---

## 1. Environment setup & re-fetch (do this every turn)

The sandbox is a restricted Python environment. Internalize these constraints —
they dictate how you must write everything:

- **Only PIL (Pillow) + numpy are available.** There is **no HTML renderer** —
  no playwright, weasyprint, selenium, cairosvg, or node. You build every image
  pixel-by-pixel in PIL.
- **bash is locked down.** Allowed prefixes are roughly `python3`, `ffmpeg`,
  `ffprobe`, `ls`, `cat`, `head`, `tail`, `cp`, `find`, `grep`. **No pipes, no
  semicolons, no output redirection (`>` / `2>&1`), no `export`, no env-var
  assignment, and dynamic `__import__` is disallowed.** Therefore: **write `.py`
  files with the `write` tool and run them with** `python3 a.py && python3 b.py`.
  Chain only with `&&`.
- **Working dir is `/tmp/outputs`. Files do NOT persist between assistant
  turns.** At the **start of every turn** re-fetch the source screenshots and
  re-download the font before doing anything else.
- **Fonts:** match the app's UI font; a clean modern sans like **Inter** is a
  safe default when the original is unknown. Download the variable font once per
  turn from
  `https://github.com/google/fonts/raw/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf`
  and select weight with
  `ImageFont.truetype(path, size).set_variation_by_axes([weight])` for weights
  **400 / 500 / 600 / 700 / 800**. Local DejaVu fonts exist but use them only
  for debug-grid labels, never for the product UI.
- **Fetching images requires a desktop User-Agent.** The screenshot CDNs return
  **HTTP 403** to bare urllib. Send a Chrome UA:

```python
import urllib.request
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
def fetch(url, dest):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req) as r, open(dest, "wb") as f:
        f.write(r.read())
```

See `references/helpers.md` for the full reusable helper module (font loader,
`dtl`, `span`, `card`, `pill`, `wrap`, gradient, `find_coeffs`).

---

## 2. Locating elements: the coordinate-grid method

You cannot eyeball pixel coordinates from a thumbnail. For **every** screenshot
(positions and resolution differ per screenshot — always re-detect):

1. Download the screenshot at **full resolution**.
2. Render a **coordinate-grid overlay**: a downscaled copy with red/blue
   gridlines, every line **labeled in ORIGINAL pixel coordinates** (multiply
   back up by the downscale factor). Save it and inspect it with the `read`
   tool.
3. Crop **tight full-res regions** around each element you'll edit and `read`
   those to refine exact x/baseline/height.
4. Keep a small dict of element coordinates per screenshot. Re-derive it for
   each new screenshot — never reuse another file's numbers.

---

## 3. Technique A — Surgical text edit (preserve real UI)

Goal: change text without disturbing surrounding pixels.

For each text element:

1. **Detect the tight bbox + background.** Use `span(box)` which thresholds
   pixels against a sampled background color and returns the inked bbox plus the
   sampled bg color.
2. **Clear the old text** — choose by background type:
   - **Flat background:** fill a rect with the sampled bg color.
   - **Vertical gradient / dark header:** use the **ROW-INPAINT trick** — for
     each scanline `y` in the clear region, copy pixels from a **clean probe
     column** at the same `y` (a column elsewhere on the same row with no text).
     This reconstructs gradients perfectly; a flat fill would leave a visible
     band.
   - **Pill / badge:** redraw the rounded-rect in its fill color, then re-add
     its label.
3. **Redraw the new text** with the chosen UI font:
   - **Match size** by binary-searching the font size until the rendered glyph
     height ≈ the detected height.
   - **Match weight** (400/500/600/700/800 via the variation axis) and **color**
     (sample an original glyph pixel).
   - **Left-align to the original left x and baseline.** Use
     `dtl(draw, (x, y), text, font, fill)` which offsets by `font.getbbox` so
     the **inked** top-left lands exactly on `(x, y)`.
4. **Re-render, `read`, nudge 1–2 iterations.**

### Technique A gotchas (hard-won — do not regress)

- **Name-clear rect bleeding into an adjacent pill** (e.g. a status badge after
  a name): keep `clear_right < pill_left` or you erase the badge.
- **Greetings like "Alex, here's"**: the first name and the next word are
  separated by a **real space**. Before choosing clear width, **measure the
  inter-word gap** (scan columns for blank runs) — otherwise a too-wide clear
  erases the "he" of "here's".
- **Re-detect positions per screenshot.** Different screenshots have different
  resolutions and element positions; coordinates never transfer.

---

## 4. Technique B — Mobile reflow (rebuild as native portrait) — fixes RUNOFF

When a wide desktop dashboard must sit on a portrait phone with **no horizontal
runoff**, rebuild it. Do not crop a landscape layout.

1. **Canvas:** `899 x 1994` (≈0.45 aspect, standard phone screen).
2. **Stack content top-down as mobile cards**, reproducing the app's design
   language with **sampled colors** and the matched UI font:
   - rounded cards (`card(box, radius, fill, border)`),
   - pill badges (`pill(...)`),
   - a **dark gradient hero card** (per-row `putpixel` gradient + rounded
     mask) for the hero block (e.g. a headline summary section),
   - **2×2 stat tiles**,
   - **horizontal progress bars with proportional fills**,
   - a **dark stat card**, and **accent-colored** callouts for emphasis lines.
3. **Wrap every body string** to the card inner width with `wrap(text, font,
   maxw)` so nothing runs off the edge.
4. **Fill the height:** distribute leftover vertical space into the inter-card
   gaps so content fills ~1960 of 1994 px (no big empty tail).
5. **Parametrize** the whole layout by `(name, numbers, ...)` so you can
   mass-produce variants (see §6).

---

## 5. Phone-screen composite (fit test)

To verify a portrait screen image sits correctly inside a "hand holding a
phone" template:

1. **Find the screen quad** corners `TL, TR, BR, BL` using a **zoomed coordinate
   grid** — the screen is a slightly tilted quad; measure the white-display
   edges **inside** the bezel, not the phone outline.
2. **Perspective-warp** the portrait screen image onto that quad with PIL's
   `Image.transform(..., Image.PERSPECTIVE, coeffs)`. The PERSPECTIVE transform
   maps **OUTPUT (X,Y) -> INPUT (x,y)**, so `find_coeffs(pa, pb)` takes
   `pa = dest_quad_in_output` and `pb = src_corners` and builds rows
   `[X, Y, 1, 0, 0, 0, -x*X, -x*Y]` and `[0, 0, 0, X, Y, 1, -y*X, -y*Y]` with
   `B` = flattened `pb`, solved 8×8 with numpy.
   **CRITICAL: do not swap `pa`/`pb`.** Swapping inverts the map and the image
   explodes off-screen.
3. **Mask & paste:** build a polygon mask of the quad, **GaussianBlur the edge
   ~1px**, inset ~1px toward the centroid so the screen sits inside the bezel,
   then paste the warped screen over the template through the mask.

See `references/helpers.md` for `find_coeffs` and the warp/paste snippet.

---

## 6. Mass-producing variants

Because Technique B (and a parametrized Technique A) is a function of
`(name, numbers)`:

- Wrap the page build in `build_page(name, ranges, ...)` and call it once per
  variant in a single `.py` file (`python3 make_variants.py`).
- Typical variant set: one persona name paired with several value ranges (e.g.
  four ascending number ranges), each rendered as a full portrait page; plus a
  randomized profile page (different name + bio + tags).
- After rendering, assemble a **contact sheet** (grid of all variants) and
  `read` it so the user can compare them side by side.
- Also produce a **fit-test composite** (§5) and show it **before finalizing** —
  the user prefers to approve the on-phone look first.

---

## 7. Deliverable conventions (user preferences)

- **Ship raw individual assets**, full-res, unlabeled. The user assembles and
  captions downstream (e.g. in their video editor) — **do NOT bake captions,
  overlays, or watermarks** into the product-page images.
- The **preferred end state for fitting a wide dashboard onto a phone is the
  mobile-reflow (Technique B)** — centered content, everything visible, no text
  runoff. When in doubt between cropping and reflowing, reflow.
- Always offer/show: a **fit-test composite** on the phone, and a **contact
  sheet** to compare variants.
- If asked for motion, a silent 9:16 clip (e.g. eased crop-pans + a zoompan
  push-in via ffmpeg) is acceptable, still with **no baked captions**.

---

## 8. Hard rules / do-not-regress checklist

- Re-fetch source images and the UI font at the **start of every turn**
  (nothing persists).
- Always send a **desktop Chrome User-Agent** when fetching from the CDNs (403
  otherwise).
- Write **`.py` files** and run with `python3 a.py && python3 b.py`. **No pipes,
  semicolons, redirection, `export`, env assignment, or `__import__`.**
- Use a **consistent UI font** for all UI text via the variable-font weight
  axis; DejaVu only for debug labels.
- **Re-detect element coordinates per screenshot** — never reuse another file's
  numbers.
- For gradient/dark backgrounds, **row-inpaint** the cleared region; never flat-
  fill a gradient.
- Keep **name-clear rects clear of adjacent pills**; **measure the inter-word
  gap** before clearing a greeting.
- For wide→portrait, **reflow (Technique B)**, never crop a landscape layout.
- In `find_coeffs`, **`pa` = destination quad, `pb` = source corners** — do not
  swap.
- Deliver **raw, uncaptioned** assets; show a **fit-test composite** and a
  **contact sheet** before finalizing.