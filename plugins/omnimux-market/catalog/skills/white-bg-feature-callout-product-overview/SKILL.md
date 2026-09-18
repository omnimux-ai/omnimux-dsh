# White-Bg Feature-Callout Product Overview

A silent, 16:9, white-background product overview pattern for website embeds. Three-act structure: **Hero Reveal → Feature Parade → Branded End Card**. No voiceover. No captions. No manufacturer logos. Evergreen pricing-free.

---

## 1. When to Use This Pattern

**Use for:**
- Website product detail page (PDP) embed videos for any physical product
- Hardware, accessories, tools, equipment, packaged goods
- Horizontal (16:9) delivery — desktop-first web embed
- Products with 3–5 distinct, nameable features

**Do not use for:**
- Vertical/social TikTok or Reels (different skill)
- Products with no differentiable features (use a simpler brand spot instead)

---

## 2. Format & Output Spec (HARD)

- **Aspect ratio: 16:9 — mandatory.** `aspect_ratio: "16:9"` on every scene generation call. Final assembly `output_size: {"width": 1920, "height": 1080}`.
- All generated images and video frames must be 1920×1080.
- No vertical frames. No square frames. No letterboxing.

---

## 3. Hook & Opening (Scene 1 — Hero Reveal)

**Structural move:** Pattern-interrupt hook overlay on a beauty/hero product shot. Short punchy copy (≤5 words per line, 2 lines max). The hook names the product category or core benefit — not a tagline. Then the product fills the frame silently against white.

**Hook overlay spec:**
- Style: `pill_dark`
- Position: `position_y_ratio: 0.12` (top of frame, clear of product)
- Duration: `4.0s`
- Copy rule: 2 lines max, ≤5 words each. Swap product name/benefit, keep the structure.

**Example hook (generic — invent fresh per product):**
```
Line 1: "ALL-DAY DESK COMFORT"
Line 2: "ENGINEERED TO LAST"
```
Swap subject (product category), keep two-line punchy format.

**Start frame generation — CRITICAL:**
- Use model: **`gpt-image-2`** (NOT the default nano-banana-2 model)
- Prompt must include: `"pure white background, white seamless backdrop fills entire frame edge to edge, no black bars, no letterboxing"`
- Reason: nano-banana-2 adds black letterbox bars when converting 9:16 product reference images to 16:9. gpt-image-2 avoids this.

---

## 4. Narrative Arc

| Beat | Scene | Target Duration | Purpose |
|------|-------|----------------|---------|
| 1 | Hero Reveal | 5–6s | Product beauty shot, hook overlay top of frame |
| 2–N | Feature Parade | 4–5s each | One feature per scene, accent + dark pill callouts |
| Final | Branded End Card | 4–5s | Seller logo, tagline, product float |

**Total runtime:** 25–45s depending on feature count (3–5 features recommended).

**Pacing:** All scenes are locked-off or very slow push-in on white backgrounds. No jump cuts. No handheld movement. Calm, authoritative product demo rhythm.

---

## 5. Feature Callout Overlays (Scenes 2–N)

Each feature scene gets **two separate single-line text overlays** — never combine into one overlay with `\n`.

**Overlay 1 — Feature name:**
```
zone: "lower-center"
background: rgba(27, 58, 107, 0.88)   # deep accent pill
text_color: white
font: Montserrat Bold
font_size: ~52px
border_radius: 30px
animation: fade-in 0.4s
start: 0.5s
duration: 4.0s
```

**Overlay 2 — Spec detail:**
```
zone: "bottom-center"
background: rgba(0, 0, 0, 0.72)        # dark semi-transparent pill
text_color: white
font: Montserrat (regular)
font_size: ~38px
border_radius: 24px
animation: fade-in 0.4s
start: 0.5s
duration: 4.0s
```

**Example (generic — invent fresh per product):**
- Overlay 1: `"BREATHABLE MESH BACK"` (accent pill)
- Overlay 2: `"4-Zone Adjustable Lumbar Support"` (dark pill)

Swap feature name and spec. Keep pill styles locked.

---

## 6. Visual Style Spec

- **Aspect ratio: 16:9, 1920×1080 — ABSOLUTE HARD REQUIREMENT.** Every video scene and the end card MUST be rendered in 16:9 (1920×1080). No other aspect ratio is permitted under any circumstances — this overrides any platform default or user preference. Every director call must pass `aspect_ratio: "16:9"`. The `output_size` for `assemble_video` must be `{"width": 1920, "height": 1080}`. If a tool defaults to a different ratio, override it explicitly.
- **Background:** Pure white throughout. Every scene, every frame. White seamless backdrop fills edge to edge.
- **Camera:** Locked-off or extremely subtle slow push-in. No handheld. No rack focus.
- **Color palette:** White base, a single deep accent color for the feature pill, and a contrasting divider color on the end card. Match the seller's brand palette; do not introduce unrelated colors.
- **On-screen text:** Feature name (accent pill) + spec detail (dark pill) only. No captions. No subtitles. No price. No manufacturer logos.
- **Shot length:** 4–6s per scene. Consistent rhythm.
- **Style:** Clean product photography aesthetic. Not UGC. Not cinematic drama. Professional e-commerce.

---

## 7. Audio

- **Speech/voiceover: NONE.** `speech_status: silence` on every director scene call — no exceptions.
- **Music:** Instrumental only. No vocals. Clean, professional, upbeat-but-calm.
- **Captions:** None.

---

## 8. Branded End Card (PIL-Composited, Mandatory)

The end card is **always built via PIL** — never via the video generator's overlay system. Render a 1920×1080 PNG, then use it as the final scene's start frame.

### End Card Layout Spec

**Canvas:** 1920×1080, pure white `(255, 255, 255)`.

**LEFT SIDE (primary content):**
- `LEFT_PAD = 64px`
- **Headline:** Large bold black text, two lines, ~148px DejaVu Bold. Use the seller's standard tagline split across 2 lines. Start at `(LEFT_PAD, y=68)`.
- **Divider:** `~220px wide × 5px tall`, in the seller's accent/divider color. Positioned below headline with small gap.
- **URL:** The seller's domain in ~64px DejaVu Regular, gray `(100, 100, 100)`. Below divider.
- **Product name label:** Small gray text (~28px DejaVu Regular), bottom-left area. Product name / SKU (e.g. "Model A-200").
- **Seller logo:** Directly below product name label. Use the seller's canonical logo URL — always download fresh:
  ```
  https://<seller-domain>/path/to/logo.png
  ```
  - PNG has transparent background. Composite onto white using PIL alpha paste.
  - Scale to **~320px wide**.
  - Never draw or recreate the logo from shapes or text — always use the canonical URL.

**RIGHT SIDE (product image):**
- Use the **hero start frame from Scene 1** (CloudFront URL from `generate_image` output for scene 1's start frame).
- **Auto-crop white margins** (bounding box crop) before scaling.
- Scale to fill **~60% of frame width** (~1152px), vertically centered.
- Position: flush right with ~30px right margin.
- No border, no shadow, no divider between left and right — product floats naturally over white.

### Fonts (HARD RULE)
- **Always use:** `/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf` and `/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf`
- **Never use:** LiberationSans (not available in render environment — silently falls back to a tiny unreadable default font)

### Branding (HARD RULE)
- **Only the seller's logo appears on the end card.** No manufacturer/third-party brand logos.
- The seller is the brand on the end card. Manufacturer logos are never shown.

---

## 9. Pricing — Never Include

- **No price in any scene**, overlay, or end card. Videos must be evergreen.
- If scraped product data contains a price, **ignore it entirely**.

---

## 10. Hard Rules / Do-Not-Regress

These were validated corrections during production — treat each as an absolute constraint:

1. **16:9 mandatory.** `aspect_ratio: "16:9"` on every director scene call. `output_size: {"width": 1920, "height": 1080}` on `assemble_video`. No vertical. No square. No letterboxing. No exceptions. This overrides any platform default or user preference.
2. **Seller logo only.** No manufacturer/third-party brand logos of any kind on any scene or end card.
3. **Canonical logo URL.** Always download from the seller's confirmed logo URL. Never recreate from shapes/text. Confirm the URL once at the start of the run.
4. **No price.** Ever. In any scene, overlay, or end card.
5. **`speech_status: silence`** on every director call. No exceptions.
6. **Two separate overlays per feature scene.** Never `\n` in a single overlay to fake two lines.
7. **PIL end card compositing.** The end card is a PIL-rendered PNG, not a video generator overlay.
8. **Auto-crop white margins** from product image before compositing on end card.
9. **Instrumental-only music.** No vocal tracks.
10. **DejaVu fonts only** for PIL rendering. LiberationSans will silently break.
11. **gpt-image-2 for 16:9 start frames.** Avoids black letterbox bars that nano-banana-2 produces when converting 9:16 source images.
12. **Scene 1 start frame → end card product image.** Reuse the hero shot CloudFront URL. Do not generate a separate image.
13. **Use the seller's standard tagline** on the end card unless the user specifies otherwise.
14. **Use ONLY scraped product photos as `start_image`.** For every scene (hero and feature close-ups), the `start_image` MUST be an actual photo scraped from the provided product URL. Do NOT generate product imagery from scratch or use image-to-image (I2I) to drift from the source photo. The source photo is ground truth — the video must show the same product, same finish, same surfaces.
15. **No hallucinated markings on smooth surfaces.** Before generating each scene, examine every surface in the source product photo. If a surface is smooth and unmarked (no text, no engravings, no badges, no icons), the Visual Description Lock for that scene must explicitly state: `"[surface name] is smooth and completely unmarked — no text, no engravings, no badges, no markings of any kind"`. The model must not add hallucinated text, engravings, embossed logos, or decorative elements to surfaces that are blank in the source photo.

---

## 11. Assets Required

Before starting production, collect or confirm the following:

| Asset | Source | Notes |
|-------|--------|-------|
| Product URL | User-provided | Scrape for product photos, name, and features |
| Hero product photo(s) | Scraped from product URL | Must use actual product photos — see Hard Rule #14 |
| Feature close-up photos | Scraped from product URL | One per feature scene; use actual photos as start_image |
| Seller logo PNG | Seller's canonical logo URL | Transparent-background PNG. Confirm once at start of run. |
| Background music track | Optional user-provided or library | Instrumental only; no vocals |
| Reference video | Optional user-provided | Style reference only; not used as start_image |

---

## 12. Seller Brand Assets

Confirm the seller's brand assets once at the start of the run, then use them automatically without re-asking:

### Seller Logo
```
URL:   https://<seller-domain>/path/to/logo.png
Type:  PNG with transparent background
Usage: PIL end card compositing — alpha-paste onto white canvas
Scale: ~320px wide on a 1920×1080 end card
```

**When to use:** Automatically, on every end card for that seller. Do not use an alternate URL once confirmed. Download fresh each production run (do not cache across sessions).

**How to composite:**
```python
from PIL import Image
import requests
from io import BytesIO

resp = requests.get("https://<seller-domain>/path/to/logo.png")
logo = Image.open(BytesIO(resp.content)).convert("RGBA")
# Scale to ~320px wide, preserving aspect ratio
scale = 320 / logo.width
logo = logo.resize((320, int(logo.height * scale)), Image.LANCZOS)
# Paste onto white canvas (card) at desired (x, y)
card.paste(logo, (x, y), logo)
```