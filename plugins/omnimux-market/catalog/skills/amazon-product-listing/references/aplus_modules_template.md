# A+ Modules Prompt Template

All 7 A+ Brand Content modules live in this file. Each section below contains the template for one module. Read the section matching the module you're generating.

**Critical reminder:** Every A+ image must use the MAIN IMAGE as reference in the `image_urls` array (`image_urls=["main:final"]`) for product consistency. All 7 A+ modules are typography- and graphic-heavy, so generate them with `model="gpt-image-2"`.

**Ratios and resolution by module:**
- Module 1 (Hero Banner): `aspect_ratio="21:9"`, `resolution="2K"`
- Modules 2–6: `aspect_ratio="3:2"`, `resolution="2K"`
- Module 7 (Brand Endorsement): `aspect_ratio="21:9"`, `resolution="2K"`

---

## Module 1 — Hero Banner (21:9)

### Placeholders

- `[PRODUCT_DESCRIPTION]` — brief product description
- `[BRAND_NAME]` — brand name
- `[BRAND_TAGLINE]` — 3–8 word brand tagline or product category line
- `[BRAND_MOOD]` — visual feel: "minimal and clean", "warm and natural", "bold and energetic", "elegant and premium"

### Template

```
Amazon A+ Hero Banner for [BRAND_NAME] featuring [PRODUCT_DESCRIPTION].

Layout:
- 21:9 wide banner composition 
- Product hero shot on one side, brand message on the other
- OR: product centered with brand messaging flowing around it
- Wide cinematic banner feel

Content (write EACH text element in this exact format):
- Headline: "[BRAND_NAME]" (60pt)
- Tagline: "[BRAND_TAGLINE]" (32pt)
- Product hero shot — clean, well-lit, beautifully presented

Mood and style:
- [BRAND_MOOD]
- Cinematic, premium feel
- Evokes the brand's personality immediately

Typography:
- **CRITICAL TEXT FORMAT RULE:** Every text element must be specified as `Label: "exact text content" (Xpt)`. Always quote the actual text, always specify point size in parentheses.
- Clean modern sans-serif
- 1 headline + optional 1 sub-line
- Headline at 40pt minimum (Amazon compresses heavily)

Background:
- Rich, textured, or gradient background supporting the brand mood
- NOT pure white (pure white is for main image only)
- Color palette reflecting the brand
- Can include subtle lifestyle elements, natural textures, or atmospheric light

Lighting on product:
- Beautiful soft lighting, slightly dramatic to give the hero a premium feel
- Clean highlights

Mobile safety:
- Critical text and product centered
- Nothing essential in the outer 5% of the frame

Strict exclusions:
- NO text-heavy body copy — banners are headline-only
- NO badges like "Amazon's Choice"
- NO price tags or promotional language
- NO competitor references
- NO seller contact info
```

---

## Module 2 — Pain Points / Scenarios (3:2)

### Placeholders

- `[PRODUCT_DESCRIPTION]` — brief product description
- `[PAIN_POINTS]` — 2 to 4 customer frustrations the product addresses. Examples: "Tired of sugary drinks with artificial aftertaste?", "Plastic bottles piling up at home?", "Hard to find a drink that's both healthy and flavorful?"

### Template

```
Amazon A+ Pain Points module for [PRODUCT_DESCRIPTION].

Layout:
- 3:2 landscape composition 
- Headline at top: empathy-focused, e.g. "Tired of [common frustration]?"
- Grid of 2 to 4 pain point callouts below the headline
- Each callout: simple icon or illustration + short pain point phrase

Text elements (write EACH in this exact format):
- Headline: "Tired of [common frustration]?" (42pt, bold)
- Pain Point 1: "[PAIN_POINT_1_TEXT]" (30pt)
- Pain Point 2: "[PAIN_POINT_2_TEXT]" (30pt)
- Pain Point 3: "[PAIN_POINT_3_TEXT]" (30pt) (if applicable)
- Pain Point 4: "[PAIN_POINT_4_TEXT]" (30pt) (if applicable)

Typography:
- **CRITICAL TEXT FORMAT RULE:** Every text element written as `Label: "exact text" (Xpt)`.
- Sans-serif, clean
- Headline at 42pt bold, body text at 30pt regular
- Dark text on light background OR light text on dark background — high contrast

Icons / illustrations:
- Simple, consistent style across all pain points
- Convey the frustration visually (crossed-out items, sad emoji style, problem illustrations)

Background:
- Muted, slightly melancholic tone to match the "problem" mood
- Soft grays, muted color palette
- Clean, uncluttered

Mobile safety:
- All text within inner 90% of the frame
- Headline centered or left-aligned

Strict exclusions:
- NO competitor brand names mentioned
- NO exaggerated or fake claims
- NO badges, NO promotional language
- NO happy imagery (that's for later modules — this is the "problem" stage)
```

---

## Module 3 — Selling Points / Feature Matrix (3:2)

### Placeholders

- `[PRODUCT_DESCRIPTION]` — brief product description
- `[FEATURES]` — 3 to 6 features, each with: name + 1-line benefit. Example: "Zero Sugar | Enjoy bold flavor without the crash", "Real Fruit | 100% natural juice, no syrups"

### Template

```
Amazon A+ Selling Points feature matrix for [PRODUCT_DESCRIPTION].

Layout:
- 3:2 landscape composition 
- Grid layout — 2x2, 2x3, or 3x2 depending on feature count
- Each grid cell: icon + feature name (bold) + 1-line benefit (regular)

Text elements (write EACH feature in this exact format):
- Feature 1 Name: "[FEATURE_1_NAME]" (34pt, bold)
- Feature 1 Benefit: "[FEATURE_1_BENEFIT]" (30pt, regular)
- Feature 2 Name: "[FEATURE_2_NAME]" (34pt, bold)
- Feature 2 Benefit: "[FEATURE_2_BENEFIT]" (30pt, regular)
(repeat for features 3 through 6 as applicable)

Typography:
- **CRITICAL TEXT FORMAT RULE:** Every text element written as `Label: "exact text" (Xpt)`.
- Sans-serif, modern
- Feature names at 34pt bold, benefits at 30pt regular
- High contrast with background

Icons:
- Simple line or solid icons, ONE style across all features
- Each icon clearly represents its feature
- Consistent stroke width and size

Background:
- Clean, bright background
- Soft off-white, pale brand tint, or gentle gradient
- Color palette matches the brand
- NOT busy — grid cells are the focus

Product presence:
- Small product shot in the center or corner
- OR: product absent (icons + text carry the message)
- If product included, matches the main image reference exactly

Mobile safety:
- All critical text and icons within inner 90%
- Grid cells evenly spaced

Strict exclusions:
- NO unverifiable claims
- NO badges
- NO promotional language
- NO competitor references
```

---

## Module 4 — Key Ingredients / Technology (3:2)

### Placeholders

- `[PRODUCT_DESCRIPTION]` — brief product description
- `[INGREDIENTS]` — 2 to 4 hero ingredients/components with benefit. Example: "Natural Peach Juice → antioxidants and natural sweetness", "Verbena Extract → calming and fresh aromatic notes"

### Template

```
Amazon A+ Key Ingredients module for [PRODUCT_DESCRIPTION].

Layout:
- 3:2 landscape composition 
- Headline at top: "Key Ingredients" or similar
- 2 to 4 ingredient features displayed below, side by side OR stacked

Text elements (write EACH in this exact format):
- Headline: "Key Ingredients" (42pt, bold)
- Ingredient 1 Name: "[INGREDIENT_1_NAME]" (34pt, bold)
- Ingredient 1 Benefit: "[INGREDIENT_1_BENEFIT]" (30pt, regular)
- Ingredient 2 Name: "[INGREDIENT_2_NAME]" (34pt, bold)
- Ingredient 2 Benefit: "[INGREDIENT_2_BENEFIT]" (30pt, regular)
(repeat for ingredients 3 and 4 as applicable)

Per ingredient visual:
- Photograph, illustration, or symbol of the ingredient (peach slice, verbena leaves, grain, tech component)

Typography:
- **CRITICAL TEXT FORMAT RULE:** Every text element written as `Label: "exact text" (Xpt)`.
- Sans-serif, clean
- Headline 42pt, ingredient names 34pt bold, benefits 30pt regular

Visuals:
- Hyperrealistic ingredient photography OR clean illustration
- Style consistent across all ingredients
- Natural, fresh feel for food/beverage; clean technical feel for electronics

Background:
- Warm, natural, clean — supporting the "what's inside" theme
- Soft off-white, pale sage, or brand-aligned
- Not distracting from the ingredients

Mobile safety:
- All critical text within inner 90%

Strict exclusions:
- NO stock-photo-looking images (ingredients should feel real and crafted)
- NO competitor brand comparisons
- NO unverifiable health claims ("cures", "prevents disease")
- NO badges
```

---

## Module 5 — Efficacy / Comparison (3:2)

### Placeholders

- `[PRODUCT_DESCRIPTION]` — brief product description
- `[COMPARISON_TYPE]` — choose one: "before/after", "data chart", "us vs them feature table", "testimonial quote"
- `[CONTENT]` — the specific comparison data/content

### Template (varies by comparison type)

```
Amazon A+ Efficacy / Comparison module for [PRODUCT_DESCRIPTION].

Layout:
- 3:2 landscape composition 
- Format depends on comparison type: [COMPARISON_TYPE]

If before/after:
- Split composition — left side "before", right side "after"
- Clear visual contrast between the two states
- Label Left: "Before" (36pt, bold)
- Label Right: "After" (36pt, bold)

If data chart:
- Simple clean bar chart, pie chart, or percentage visualization
- Big Number: "[DATA_VALUE]" (80pt, bold) — e.g. "87%", "3x", "24hrs"
- Data Description: "[DATA_DESCRIPTION]" (30pt) — e.g. "less sugar than leading brand"
- 2-4 data points maximum

If us vs them table:
- Two columns
- Column Header Left: "Our Product" (36pt, bold)
- Column Header Right: "Typical Alternative" (36pt, bold) — NEVER named competitor
- 4-6 feature rows, each with short label: Feature Row: "[FEATURE_TEXT]" (28pt)
- Checkmarks for ours, X marks for alternative
- Factual only, no disparaging language

If testimonial quote:
- Large quote marks decorative element
- Quote: "[TESTIMONIAL_TEXT, 20-30 words max]" (32pt, italic)
- Attribution: "— [FIRST_NAME] [LAST_INITIAL]." (24pt)
- Star rating visualization

Content:
[CONTENT]

Typography:
- **CRITICAL TEXT FORMAT RULE:** Every text element written as `Label: "exact text" (Xpt)`.
- Sans-serif
- Headlines 40pt, body text 30pt minimum, impact numbers 80pt

Color palette:
- Use green/checkmarks for positive, gray/X for negative
- Brand-aligned accents
- High contrast for data clarity

Mobile safety:
- Key numbers centered, not at edges
- Comparison tables readable at mobile size

Strict exclusions:
- NO named competitors
- NO unverifiable claims
- NO disparaging language ("they suck", "avoid X")
- NO badges
- NO review screenshots from other listings
```

---

## Module 6 — How to Use (3:2)

### Placeholders

- `[PRODUCT_DESCRIPTION]` — brief product description
- `[STEPS]` — 3 to 5 numbered steps, each a short action phrase. Example: "1. Chill the can in the fridge", "2. Shake gently", "3. Pour into a glass", "4. Enjoy"

### Template

```
Amazon A+ How to Use module for [PRODUCT_DESCRIPTION].

Layout:
- 3:2 landscape composition 
- Horizontal row of 3 to 5 steps (left to right flow)
- Each step: large number + small illustration or product photo + short action text

Steps to display (write EACH step in this exact format):
- Step 1 Number: "1" (72pt, bold)
- Step 1 Action: "[STEP_1_TEXT]" (30pt, regular)
- Step 2 Number: "2" (72pt, bold)
- Step 2 Action: "[STEP_2_TEXT]" (30pt, regular)
(repeat for steps 3 through 5 as applicable)

Per step visual:
- Small illustration OR product photo representing the action
- Arrow or connector line between steps (optional)
- Short action phrase (4-8 words max)

Typography:
- **CRITICAL TEXT FORMAT RULE:** Every text element written as `Label: "exact text" (Xpt)`.
- Sans-serif
- Step numbers 72pt bold in brand-accent color, action text 30pt regular

Illustrations:
- Simple, consistent style across all steps
- Could be line illustrations, simple icons, or mini product photos
- Convey the action clearly

Background:
- Clean, bright, uncluttered
- Subtle color separation between steps (if visual cue is helpful)

Mobile safety:
- All steps visible — don't let them shrink too small
- If 5 steps is too many for the 3:2 frame, use 2 rows of steps

Strict exclusions:
- NO badges
- NO promotional language
- NO unnecessary complexity — steps should be obvious
```

---

## Module 7 — Brand Endorsement / Qualifications (21:9)

### Placeholders

- `[BRAND_NAME]` — brand name
- `[ENDORSEMENT_CONTENT]` — choose one or combine: certifications (organic, vegan, FDA-registered — only if REAL), heritage ("Since 1952"), awards, sustainability commitments, brand mission

### Template

```
Amazon A+ Brand Endorsement banner for [BRAND_NAME].

Layout:
- 21:9 wide banner composition 
- Closing module — trust-building, emotional close
- Balanced composition with certification badges, text, or brand imagery

Text elements (write EACH in this exact format):
- Main Message: "[MAIN_BRAND_MESSAGE]" (42pt, bold) — e.g. "Crafted in Italy since 1952", "Nature in every sip"
- Supporting Line: "[SUPPORTING_TEXT]" (30pt, regular) — optional secondary line
- Certification Labels: "[CERT_NAME]" (24pt, bold) — one per real certification (e.g. "USDA Organic", "Non-GMO Verified")

Possible content elements:
- Certification badges (real ones only — organic, vegan, cruelty-free, FDA, etc.)
- Brand heritage line
- Awards (if documented)
- Sustainability commitments
- Brand mission in one line

Typography:
- **CRITICAL TEXT FORMAT RULE:** Every text element written as `Label: "exact text" (Xpt)`.
- Sans-serif, clean and trustworthy
- Main message 42pt bold, supporting text 30pt, certification labels 24pt bold

Visuals:
- Real certification logos (only if the brand actually has these certifications)
- Optional: founder photo, heritage photo, craft scene
- Minimal, premium aesthetic

Background:
- Premium feel — could be dark and elegant, or light and clean
- Brand-aligned color palette
- Quality and trust-building mood

Mobile safety:
- Key messages centered
- Nothing critical in outer 5%

Strict exclusions:
- NO fake certifications (only REAL ones the brand owns)
- NO "Amazon's Choice" or "Bestseller" style badges
- NO competitor references
- NO contact info (email, phone, website, social handles)
```

---

## Tool call pattern for A+ modules

All 7 A+ modules are generated with `model="gpt-image-2"` (they are typography- and graphic-heavy), each referencing the main image via `image_urls=["main:final"]` for product consistency. Each `generate_image` call returns its result directly — no job submission, no polling.

For **21:9 modules** (Module 1 and 7):

```
generate_image(
  prompt="[FILLED_PROMPT]",
  output_asset_id="aplus:<module-name>",
  aspect_ratio="21:9",
  resolution="2K",
  model="gpt-image-2",
  image_urls=["main:final"]
)
# → returns the result directly with the given output_asset_id
```

For **3:2 modules** (Modules 2–6):

```
generate_image(
  prompt="[FILLED_PROMPT]",
  output_asset_id="aplus:<module-name>",
  aspect_ratio="3:2",
  resolution="2K",
  model="gpt-image-2",
  image_urls=["main:final"]
)
# → returns the result directly with the given output_asset_id
```

The result lands at the `output_asset_id` you set. Use `get_asset` / `list_assets` only if you need to inspect the result asset inline.

## Key reminders

- **Text size is critical** in A+ — Amazon compresses images aggressively. Always >30pt, preferably larger for headlines.
- **Narrative flow matters** — the 7 modules should read in order like a story (identity → empathy → solution → credibility → proof → simplicity → trust).
- **Consistent visual identity** — same palette, typography, icon style, product appearance across all 7 modules.
- **Product reference is mandatory** — every generation references the main image asset `main:final` in `image_urls`.
- **If the user hasn't provided content** for selling points, ingredients, steps, etc. — ask before generating. Don't fabricate claims.
