# Mode: lifestyle-scene

Product placed inside a real-world environment with rich context, atmosphere, and human signals. Goes beyond "product on a table".

## Scene Presets

| Preset | Setting | Typical products |
|---|---|---|
| `morning-kitchen` | Sunlit kitchen, breakfast moment | Beverages, food, cookware, supplements |
| `bathroom-vanity` | Marble or wood vanity, soft window light | Skincare, beauty, fragrance, candles |
| `bedroom-nightstand` | Cozy nightstand, lamp glow, book and linen | Sleep aids, candles, journals, electronics |
| `desk-workspace` | Modern desk, natural light, laptop and notebook | Tech, stationery, productivity items |
| `cafe-table` | Marble or wood cafe table, coffee shop blur | Drinks, snacks, books, accessories |
| `outdoor-natural` | Forest, beach, mountain, golden hour | Outdoor gear, beverages, sunscreen, fashion |
| `living-room-cozy` | Couch, throw blanket, side table, warm lamp | Candles, throws, books, drinks |
| `gym-active` | Gym floor, weights, water bottle, athletic context | Sportswear, supplements, recovery |
| `dinner-table-social` | Set table with people implied, food and drinks | Beverages, sauces, glassware |
| `pour-shot` | Mid-air pour, splash, motion frozen | Beverages, oils, sauces, liquids |
| `flat-lay-curated` | Top-down composition with curated objects | Beauty, food, tools, accessories |
| `hand-held-closeup` | Hands holding / applying / using product | Skincare, food, gadgets, accessories |
| `gift-unboxing` | Wrapped or partially unwrapped product | Premium gifts, beauty, jewelry |

## Prompt Template

```
[SCENE]
{{Scene preset description in 1-2 sentences. Set location and time of day.}}

[PRODUCT PLACEMENT]
{{Exact product description}} placed {{position in scene}}, {{relationship to other objects}}, {{visibility/prominence directive}}.

[HUMAN ELEMENT]
{{Hands, person partially visible, group implied, or "no people, traces of presence"}}.

[ENVIRONMENT DETAILS]
{{3-5 specific surrounding objects that ground the scene}}, {{texture details}}, {{visual storytelling cues}}.

[LIGHTING]
{{Direction, quality, color temp from photography-vocabulary.md}}. {{Window / practical / natural source}}. {{Shadow and highlight behavior}}.

[LENS & CAMERA]
Shot on {{35mm wide / 50mm natural / 85mm intimate}}, aperture {{f-stop with shallow DoF for separation}}, {{point of focus}}.

[ATMOSPHERE]
{{Mood: serene / energetic / intimate / indulgent / fresh / nostalgic / refined}}. {{Air quality}}.

[COLOR PALETTE]
{{2-3 dominant tones aligned with brand memory}}. {{Contrast level}}.

[STYLE REFERENCE]
{{Descriptors extracted from 2-3 photographer rows in photographer-references.md — never the names}}. Editorial commercial photography.

[QUALITY MARKERS]
Cinematic depth, hyper-realistic textures, natural skin and hand details if humans present.

[AVOID]
{{universal + anti-uncanny if humans + anti-stock-feel}}
```

(Pass aspect ratio via the `aspect_ratio` parameter and `resolution="2K"` on the `generate_image` call — they are not part of the prompt body.)

## Photographer references

- **morning-kitchen / cafe-table / dinner-table**: Linda Pugliese, Christopher Testani, Bobbi Lin
- **bathroom-vanity / bedroom-nightstand**: Beth Kirby, Aubrie Pick, Brittany Ambridge
- **desk-workspace / living-room-cozy**: Brittany Ambridge, James Merrell, Pia Ulin
- **outdoor-natural**: Cass Bird, Kava Gorna, Jamie Hawkesworth
- **gym-active**: Peter Yang, Cass Bird, Annie Leibovitz
- **pour-shot / flat-lay-curated**: Aaron Tilley, Carl Kleiner, Bobby Doherty
- **hand-held-closeup**: Sølve Sundsbø, Aubrie Pick, Cass Bird
- **gift-unboxing**: Beth Kirby, Brittany Ambridge, Linda Pugliese

## Aspect Ratio

| Platform | Ratio |
|---|---|
| Instagram feed | `4:5` (default) |
| Story / TikTok | `9:16` |
| Pinterest | `2:3` |
| Web hero / banner | `16:9` |
| Print editorial | `3:4` or `4:5` |

Default `4:5`.

## Composition rules

- Product is the focal anchor even when small in frame — use light, color, or DoF to draw the eye
- Surrounding objects suggest a story, not random clutter
- Negative space is intentional and feels lived-in
- Avoid perfect symmetry — natural lifestyle has asymmetry
- Hands shown? Specify finger positions and natural skin texture

## Quality gates

- [ ] Product is the visual anchor of the scene
- [ ] Lighting has clear motivated source
- [ ] Hands / people (if present) look natural, anatomy correct
- [ ] Surrounding objects support a coherent story
- [ ] Color palette aligns with brand memory
- [ ] No uncanny artifacts or warping
- [ ] Atmosphere feels intentional
- [ ] `generate_image` call set `resolution="2K"`

## Generation invocation

```
generate_image(
  prompt="<assembled prompt>",
  output_asset_id="product:lifestyle",
  aspect_ratio="4:5",
  resolution="2K",
  model="nano-banana-2"
)
```

For batch (different scenes, same product — one `generate_image` call per scene, each with its own `output_asset_id`):

```
generate_image(prompt="<morning-kitchen prompt>", output_asset_id="product:kitchen", aspect_ratio="4:5", resolution="2K", model="nano-banana-2")
generate_image(prompt="<bathroom-vanity prompt>", output_asset_id="product:vanity", aspect_ratio="4:5", resolution="2K", model="nano-banana-2")
generate_image(prompt="<outdoor-natural prompt>", output_asset_id="product:outdoor", aspect_ratio="4:5", resolution="2K", model="nano-banana-2")
```

If preserving a real uploaded product, add `image_urls=["product:reference"]` to each call.
