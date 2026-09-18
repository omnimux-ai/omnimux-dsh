# What's in the Box Prompt Template

Secondary image type showing everything the customer receives in the package. Dramatically reduces returns caused by "missing items" confusion and sets correct expectations before purchase.

## Placeholders

- `[PRODUCT_DESCRIPTION]` — base product description
- `[CONTENTS_LIST]` — all items included, with quantities. Examples:
  - Electronics: "1× wireless earbuds, 1× charging case, 3× ear tip sizes (S/M/L), 1× USB-C cable, 1× user manual"
  - Skincare set: "1× cleanser 100ml, 1× toner 150ml, 1× moisturizer 50ml, 1× travel pouch"
  - Beverage multipack: "6× 330ml cans of peach-verbena lemonade"
  - Home goods: "1× cast iron pan, 1× silicone handle cover, 1× care instructions card"

## Template

```
Amazon secondary image — "What's in the Box" for [PRODUCT_DESCRIPTION].

Layout:
- 1:1 square composition
- Top-down flat lay view (camera directly above)
- All items spread out and visible — nothing overlapping or hidden
- Uniform spacing between items
- Organized composition — items arranged in rows, clusters, or a neat arrangement
- Main product (largest item) visually prominent, accessories arranged around it

Contents to show:
[CONTENTS_LIST]

Item presentation:
- Every item clearly visible and identifiable
- Quantities accurate — if "3x ear tips" then show 3 tips
- All items the same lighting and angle (top-down)
- Small label near each item naming it (optional but helpful for complex sets)

Typography for labels (optional — write EACH item label in this exact format):
- Item 1 Label: "[ITEM_1_NAME]" (30pt, sans-serif) — e.g. "Charging Case", "USB-C Cable"
- Item 2 Label: "[ITEM_2_NAME]" (30pt, sans-serif)
- (one label per item)

Typography rules:
- **CRITICAL TEXT FORMAT RULE:** Every text element written as `Label: "exact text" (Xpt)`.
- Small sans-serif text next to each item
- Same font, same 30pt size, same color for all labels
- Short names only — no descriptions

Background:
- Neutral surface — soft off-white, light wood texture, or pale gray
- Smooth and clean, not distracting
- Subtle natural shadow under each item

Quality:
- Hyperrealistic product photography
- Sharp focus on all items
- Accurate color rendering

Consistency with main image:
- Main product appearance matches the reference exactly
- Accessories look like they belong with the main product (matching brand aesthetic)

Strict exclusions:
- NO items that are NOT actually in the box (Amazon rule — only show what's included)
- NO badges, NO "what's included" marketing text
- NO price tags
- NO promotional language
- NO hands, NO people
- NO items at different angles — all top-down
```

## Example (filled) — for the peach-verbena lemonade 6-pack

```
Amazon secondary image — "What's in the Box" for the 'lapochka' peach-verbena lemonade 6-pack.

Layout:
- 1:1 square composition
- Top-down flat lay view
- 6 cans arranged in a neat 2x3 grid
- Uniform spacing, cans not touching
- Small '6-pack' designation label if natural

Contents to show:
6× 330ml aluminum cans of lapochka peach-verbena natural lemonade

Item presentation:
- All 6 cans identical — same flavor variant
- All cans at the same top-down angle
- Labels facing up, visible and crisp
- Natural even lighting across all cans

Typography for labels:
- None required (identical items)

Background:
- Soft off-white textured surface
- Subtle natural shadow under each can

Quality:
- Hyperrealistic photography
- Sharp focus on every can

Consistency with main image:
- Each can's design, label, and typography matches the reference exactly

Strict exclusions:
- NO extra items not in the pack
- NO promotional badges
- NO price tags
- NO hands or people
```

## Tool call

This item is normally generated alongside the rest of the SKILL.md secondary set — one `generate_image` call per secondary image, each referencing the main image. What's-in-the-box is photoreal flat lay, so use `model="nano-banana-2"`. The standalone shape:

```
generate_image(
  prompt="[FILLED_PROMPT]",
  output_asset_id="secondary:whats-in-box",
  aspect_ratio="1:1",
  resolution="2K",
  model="nano-banana-2",
  image_urls=["main:final"]
)
# → returns the result directly with output_asset_id "secondary:whats-in-box"
```

The result lands at the `output_asset_id` you set. Use `get_asset` / `list_assets` only if you need to inspect the result asset inline.

## Key reminders

- **Only show what's actually in the box** — Amazon removes listings that show included accessories which aren't really included
- Flat lay top-down is the convention — easy for customers to count and identify each item
- Labels help for complex sets (electronics with many small parts) but hurt for simple sets (6 identical cans)
- If the user doesn't list contents, ask them to provide the exact package contents before generating
