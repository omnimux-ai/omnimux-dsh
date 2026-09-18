# Detail Shot Prompt Template

Secondary image type focused on a single feature shown up close — material quality, craftsmanship, texture, unique design detail. Builds trust in product quality that's hard to convey in wide shots.

## Placeholders

- `[PRODUCT_DESCRIPTION]` — brief product description
- `[FEATURE_TO_HIGHLIGHT]` — the specific thing to zoom in on. Examples: "the embossed brand logo on the can surface", "the silicone grip pattern", "the stitching on the collar", "the ingredient texture and consistency", "the brushed aluminum finish"
- `[OPTIONAL_SHORT_TEXT]` — optional 1–3 word caption, or leave blank

## Template

```
Amazon secondary image — extreme close-up detail shot of [FEATURE_TO_HIGHLIGHT] on [PRODUCT_DESCRIPTION].

Composition:
- 1:1 square composition
- Macro / extreme close-up photography
- The featured detail fills most of the frame
- Shallow depth of field — sharp focus on the detail, soft background blur
- The rest of the product visible but softly out of focus behind the detail

Lighting:
- Soft directional light that emphasizes texture and surface qualities
- Highlights show material character (matte finish, metallic shimmer, fabric weave, glossy surface)
- No harsh shadows

Background:
- Very soft, subtle, out of focus
- Neutral color that complements the product, NOT pure white
- No distracting elements

Quality:
- Hyperrealistic macro photography
- Tack sharp on the featured detail
- Studio-quality commercial photography

Optional text (only if [OPTIONAL_SHORT_TEXT] is provided — write in this exact format):
- Caption: "[OPTIONAL_SHORT_TEXT]" (30pt, sans-serif)
- Positioned in a corner or along the edge, not over the detail
- **CRITICAL TEXT FORMAT RULE:** Every text element written as `Label: "exact text" (Xpt)`.

Consistency with main image:
- Product appearance matches the reference exactly
- Same materials, colors, and finish

Strict exclusions:
- NO long text, NO paragraphs
- NO icons, NO annotation lines, NO arrows
- NO watermarks, NO badges
- NO props, NO hands (unless the hand IS the reference for scale, then minimal skin showing)
- NO other products in the frame
- NO cartoon style — photorealistic macro only
```

## Example (filled) — for the peach-verbena lemonade

```
Amazon secondary image — extreme close-up detail shot of the embossed 'lapochka' brand logo and the natural watercolor peach-verbena artwork on the aluminum can surface.

Composition:
- 1:1 square composition
- Macro close-up showing the label artwork in high detail
- The detail fills 70% of the frame
- Shallow depth of field — sharp focus on the artwork, subtle curvature of the can visible

Lighting:
- Soft directional light from the upper left
- Highlights reveal the smooth aluminum texture of the can
- Subtle reflections on the glossy label surface

Background:
- Very soft, blurred, neutral cream tone
- Minimal distracting elements

Quality:
- Hyperrealistic macro photography
- Tack sharp on the label artwork and brand name
- Commercial product photography quality

Optional text:
- None

Consistency with main image:
- Label design, artwork, and typography identical to the reference
- Same aluminum can material

Strict exclusions:
- NO text overlays
- NO icons or annotation lines
- NO watermarks, NO badges
- NO other objects
- NO cartoon style
```

## Tool call

This item is normally generated alongside the rest of the SKILL.md secondary set — one `generate_image` call per secondary image, each referencing the main image. Detail shots are photoreal macro, so use `model="nano-banana-2"`. The standalone shape:

```
generate_image(
  prompt="[FILLED_PROMPT]",
  output_asset_id="secondary:detail",
  aspect_ratio="1:1",
  resolution="2K",
  model="nano-banana-2",
  image_urls=["main:final"]
)
# → returns the result directly with output_asset_id "secondary:detail"
```

The result lands at the `output_asset_id` you set. Use `get_asset` / `list_assets` only if you need to inspect the result asset inline.

## Key reminders

- Choose a feature that signals QUALITY (texture, finish, craftsmanship) — not just any random detail
- Macro photography feel — shallow DoF is the signature of a good detail shot
- Text should be minimal or absent — the visual itself is the message
- Match the main image for material appearance exactly (product reference is mandatory)
