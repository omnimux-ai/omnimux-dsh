# Lifestyle Image Prompt Template

Secondary image type showing the product being used by the target customer in a realistic scene. Highest-converting secondary type (+18%). The goal is emotional connection — the customer should see themselves in the scene.

## Placeholders

- `[PRODUCT_DESCRIPTION]` — brief product description
- `[TARGET_USER]` — description of the customer. Examples: "a woman in her mid-20s with natural light makeup", "a man in his early 30s in casual athletic wear", "a parent in their 30s preparing breakfast"
- `[SCENE_CONTEXT]` — where and when. Use category conventions:
  - Beverages / food → kitchen, outdoor café, picnic
  - Skincare → bright modern bathroom, vanity
  - Apparel → bedroom, urban walk, social scene
  - Fitness → home gym, outdoor run, yoga space
  - Electronics → home office, desk, commute
  - Home goods → in-use kitchen, dining scene
  - Pet products → home with pet, outdoor walk
- `[ACTION]` — what the person is doing with the product. Examples: "about to take a sip from the can", "applying the serum to the cheek", "adjusting the watch strap on the wrist"

## Template

```
Amazon lifestyle secondary image — [TARGET_USER] using [PRODUCT_DESCRIPTION] in [SCENE_CONTEXT].

Scene:
- [TARGET_USER] is [ACTION]
- Realistic, candid, natural moment — not overly posed
- The person is engaged with the product, showing satisfaction or calm focus
- Natural facial expression, gentle smile if appropriate

Setting:
- [SCENE_CONTEXT] with specific architectural details: [describe furniture, materials, colors]
- Clean and uncluttered but feels lived-in and real
- Color palette of the scene complements the product colors, does not compete with them

Lighting:
- Soft natural daylight streaming from a window (direction depends on scene)
- Bright, clean, neutral daylight — NOT golden hour, NOT warm orange sunset (unless specifically requested)
- Gentle highlights on the product and the person's face
- Natural soft shadows

Composition:
- 1:1 square composition
- Product is clearly visible and a focal point
- Person is the second focal point — together they tell the story
- Eye-level or slightly elevated camera angle
- Shallow-to-medium depth of field — subject sharp, background subtly blurred

Person rendering:
- Natural, lifestyle aesthetic — NOT editorial, NOT heavily stylized
- Natural makeup, realistic skin texture
- Approachable, authentic, UGC-like feel
- Age-appropriate clothing matching the scene
- Minimum age 20+

Product consistency:
- Product design, colors, and label match the reference exactly
- Product positioned so its label or key identifier is clearly visible
- Product not swallowed by the scene — it remains a clear focal point

Style:
- Captured in natural lifestyle photography style, high-resolution
- Looks like an authentic moment, not a staged commercial shoot
- Warm, aspirational, relatable atmosphere

Strict exclusions:
- NO text overlays, NO captions, NO copy on the image
- NO logos other than those physically on the product
- NO badges, NO price tags, NO promotional language
- NO watermarks, NO borders
- NO other branded products visible in the scene
- NO children unless the product is specifically for children (and never children under 20-adult-looking for non-kids products)
- NO nudity, suggestive clothing, or inappropriate poses
- NO golden hour / warm orange tones (use neutral daylight)
- NO harsh studio lighting — keep it natural and soft
```

## Example (filled) — for the peach-verbena lemonade

```
Amazon lifestyle secondary image — a woman in her mid-20s with natural light makeup using aluminum can of natural lemonade with peach and verbena flavor, brand 'lapochka', in a modern bright kitchen.

Scene:
- The woman is holding the can, about to take a sip, looking at the can with a soft relaxed smile
- Realistic candid morning moment
- Natural expression, warm but not overly posed

Setting:
- Modern bright kitchen with white cabinetry, stainless steel fixtures, a small indoor plant on the counter
- Clean, uncluttered, feels lived-in
- Color palette: whites, soft beiges, touches of soft green that echo the verbena theme

Lighting:
- Soft natural daylight from a window on the left
- Bright, clean, neutral daylight — no golden or warm orange cast
- Gentle highlights on the can and on her cheek

Composition:
- 1:1 square composition
- The can is clearly visible in her hand, label facing the camera
- Eye-level camera angle, mid-length framing
- Shallow depth of field — her and the can sharp, kitchen softly blurred

Person rendering:
- Natural lifestyle aesthetic, NOT editorial
- Natural makeup, realistic skin texture, authentic warm smile
- Casual chic outfit — fitted long-sleeve cotton top in soft cream
- Age 20+

Product consistency:
- Can design, label artwork, and typography identical to the reference
- Label clearly visible in her hand

Style:
- Authentic UGC-style lifestyle photography
- Warm aspirational morning-routine atmosphere

Strict exclusions:
- NO text overlays
- NO other branded products
- NO badges or promotional elements
- NO golden hour lighting
- NO harsh flash or studio lighting
```

## Tool call

This item is normally generated alongside the rest of the SKILL.md secondary set — one `generate_image` call per secondary image, each referencing the main image. Lifestyle shots are photoreal (person + product), so use `model="nano-banana-2"`. The standalone shape:

```
generate_image(
  prompt="[FILLED_PROMPT]",
  output_asset_id="secondary:lifestyle",
  aspect_ratio="1:1",
  resolution="2K",
  model="nano-banana-2",
  image_urls=["main:final"]
)
# → returns the result directly with output_asset_id "secondary:lifestyle"
```

The result lands at the `output_asset_id` you set. Use `get_asset` / `list_assets` only if you need to inspect the result asset inline.

## Key reminders

- **Age safety:** Subjects must be 20+ years old. If the product's target user is younger, silently age up to "young adult, early 20s".
- **Clothing safety:** Ensure subjects are modestly dressed for the scene (no intimate/revealing clothing unless the product category requires it).
- **Neutral daylight, not golden hour:** Default lighting is soft neutral daylight. Golden hour only if the user explicitly requests it.
- **Product stays the hero:** The person serves the product story. Frame and light the product clearly.
- **Match the scene to product category:** Kitchen for beverages/food, bathroom for skincare, bedroom for apparel, home gym for fitness, etc.
