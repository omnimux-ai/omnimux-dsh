# Amazon Product Listing Designer

Turns a single product photo or product URL into a full set of Amazon-compliant marketplace images: main image, secondary images (infographics, multi-angle, detail shots, lifestyle, what's in box), and A+ Brand Content modules. All generation happens through the native `generate_image` tool. Use `model="nano-banana-2"` for photoreal product shots and `model="gpt-image-2"` for typography- and infographic-heavy images (on-image text, callouts, feature matrices, A+ modules).

## When to use this skill

- User provides a product image or a product URL and asks for Amazon images
- User mentions "main image", "secondary images", "A+ content", "A+ page", "Amazon listing"
- User wants product infographics, lifestyle shots, or feature callouts for e-commerce
- User asks to improve an existing Amazon listing's visuals

## When NOT to use this skill

- Generic product photography requests with no Amazon context
- Social media content (Instagram, TikTok posts) — use a different skill
- Video generation — this skill is image-only
- Logo or brand identity design

---

## Workflow (4 steps)

### Step 1 — Autonomous product analysis

Analyze the input without asking questions first.

**If input is an image:** Examine it visually. Identify product name, brand, category, packaging type (bottle/can/box/pouch), colors, flavor/variant, key visible features, and materials.

**If input is a URL:** Use `web_fetch` to retrieve the page. Extract product title, brand, description, key features, and any visible product photos. If photos are behind JavaScript or blocked, fire the **`image_source`** `AskUserQuestion` defined in the `AskUserQuestion` section below — do not proceed without an image (or an explicit text-only opt-in).

**Extract these data points:**
- Product name
- Brand
- Category (beverage, skincare, electronics, apparel, food, etc.)
- Packaging (aluminum can, glass bottle, plastic pouch, box, etc.)
- Visual characteristics (colors, shape, size)
- Flavor / variant / model
- Key selling points (if visible on packaging or in URL content)
- Target user hypothesis (based on product type)

**After identifying the category**, read `references/category_conventions.md` to load category-specific conventions.

### Step 2 — Present the plan (single confirmation question)

First, print **"What I see"** in chat as a 1–2 sentence summary (adapt to the user's language — Russian or English):

```
What I see: [brand, product, category, packaging, distinctive details]
```

Then — **unless the brief already locked the scope OR contains auto-approve language** (see the `AskUserQuestion` section below) — fire the **`scope`** `AskUserQuestion` with the four scope options. **Skip this question entirely** when:

- The brief explicitly names the deliverable ("just the main image", "only an infographic", "A+ hero banner only", "what's-in-the-box image", "lifestyle shot")
- The brief contains *"full auto"*, *"auto approve"*, *"no questions"*, *"just do it"*, *"go ahead"* — pick the most specific scope the brief implies; if none implied, default to **main image only** and continue without asking
- The brief is a follow-up turn where scope was already chosen earlier in the conversation

If skipped, state the chosen scope in one line before Step 4 (*"Scope: main image only — proceeding."*) so the user can interrupt if it was the wrong read.

### Step 3 — Handle corrections and scope confirmation

If the user corrects the product analysis ("it's not peach, it's passion fruit" / "the brand is spelled differently") — update the internal understanding and apply the correction to ALL subsequent prompts.

If the user picks a scope — proceed to Step 4.

If the user's request is vague — default to generating the main image first, then ask which secondary they want next.

### Step 4 — Generation (in the correct order)

**Critical order:** Main image ALWAYS first. It establishes the visual baseline and is used as a reference in every subsequent image for product consistency.

**Before generating each image type**, read the corresponding reference and prompt template files listed in the Reference Router section below.

**Execution flow:**

1. **Resolve the product reference** — the user's product photo is referenced by its asset ID (e.g. `product:main`). If the product was supplied as an external URL and is not yet an asset, register it once with `register_asset` and capture its asset ID. Use that asset ID as the input reference for the main image.
2. **Generate main image** — single `generate_image` call with the product asset as the input reference (`image_urls=["product:main"]`) and `output_asset_id="main:final"`. The main image returns its result directly — no polling.
3. **Generate everything downstream**, each referencing the main image asset `main:final` in `image_urls` to enforce product consistency. Generate the items the user asked for; you can issue the downstream `generate_image` calls concurrently since each returns its result directly.
   - **Secondary set** (up to 5 items, all `1:1`) — generate each secondary image with `image_urls=["main:final"]`.
   - **A+ set** (7 modules, mixed `21:9` / `3:2` / `21:9`) — generate each module with `image_urls=["main:final"]`.
   - **Full set** (12 downstream items) — generate the 5 secondary images, then the 7 A+ modules, all referencing `main:final`.
4. **Present each result as it lands.** `generate_image` returns the result directly with its `output_asset_id`, so surface each image to the user as soon as its call completes — do NOT wait for the whole set before showing the first result.

**Maximize parallelism** — the downstream items have no dependency on each other (only on the main image), so kick them off together once `main:final` exists rather than strictly one at a time.

---

## Reference Router

Read the relevant files BEFORE building each prompt. Never generate without reading the reference + template first.

### Main image
- **Reference:** `references/main_image_rules.md` — mandatory Amazon rules, Suppressed Listing triggers, apparel-specific rules, 45° angle guidance, compliance checklist
- **Template:** `references/main_image.md`

### Secondary images (general)
- **Reference:** `references/secondary_images.md` — all secondary types, default 5-image carousel recipe, general principles, typography, mobile-first rules, compliance

### Per secondary type
| Type | Template |
|------|----------|
| Infographic | `references/infographic.md` |
| Multi-angle | `references/multi_angle.md` |
| Detail shot | `references/detail_shot.md` |
| Lifestyle | `references/lifestyle.md` |
| What's in the box | `references/whats_in_box.md` |

### A+ content
- **Reference:** `references/aplus_modules.md` — all 7 modules, narrative structure, design principles, mobile cropping rules
- **Template:** `references/aplus_modules_template.md` — per-module prompt templates

### Supporting references
- **Category conventions:** `references/category_conventions.md` — read after identifying the product category
- **Technical specs:** `references/technical_specs.md` — read when user asks about file formats, sizes, or delivery
- **Infographic deep-dive:** `references/infographic.md` — read when building infographic prompts

---

## Generation Integration

All generation runs through the native `generate_image` tool — never shell out to a CLI binary, never craft API JSON by hand. Inputs are referenced by asset ID; results are returned directly with their `output_asset_id` (no job submission, no polling).

### Model

Use **`model="nano-banana-2"`** for photoreal product shots (main image, multi-angle, detail shot, lifestyle, what's-in-the-box) — it handles product + person composition well and keeps the product faithful to the reference. Use **`model="gpt-image-2"`** for typography- and graphic-heavy images (infographic and all 7 A+ modules) where crisp on-image text, callouts, icons, and feature matrices are the point. Keep the model choice consistent within each image type across the whole set so the visual style stays unified.

### Aspect ratios and resolution

| Image type | `aspect_ratio` |
|------------|----------------|
| Main image | `1:1` |
| All secondary images | `1:1` |
| A+ Hero Banner (Module 1) | `21:9` |
| A+ Modules 2–6 | `3:2` |
| A+ Brand Endorsement (Module 7) | `21:9` |

**Resolution:** all images generated at `resolution="2K"`. Never specify `width` / `height` in pixels — always use `aspect_ratio` + `resolution`.

### Product reference

The user's product photo is referenced by its asset ID (e.g. `product:main`). Pass it in `image_urls` on the main-image generation. If the product only exists as an external URL, register it once with `register_asset` to obtain an asset ID, then reuse that same asset ID — referencing the same asset keeps the product identical across the batch.

### Generate main image

```
generate_image(
  prompt="[MAIN_IMAGE_PROMPT]",
  output_asset_id="main:final",
  aspect_ratio="1:1",
  resolution="2K",
  model="nano-banana-2",
  image_urls=["product:main"]
)
# → returns the result directly with output_asset_id "main:final"
```

The main image result is available immediately. It is the visual anchor for every downstream image — confirm it exists before chaining, since every other image references `main:final`.

### Generate downstream images

For each downstream image, reference the main image asset `main:final` in `image_urls`. Photoreal secondary shots use `model="nano-banana-2"`; the infographic and A+ modules use `model="gpt-image-2"`. Each call returns its result directly — issue them concurrently once the main image exists.

**Example — secondary images (5 items):**

```
generate_image(prompt="[INFOGRAPHIC_PROMPT]", output_asset_id="secondary:infographic",
  aspect_ratio="1:1", resolution="2K", model="gpt-image-2", image_urls=["main:final"])

generate_image(prompt="[MULTI_ANGLE_PROMPT]", output_asset_id="secondary:multi-angle",
  aspect_ratio="1:1", resolution="2K", model="nano-banana-2", image_urls=["main:final"])

generate_image(prompt="[LIFESTYLE_PROMPT]", output_asset_id="secondary:lifestyle",
  aspect_ratio="1:1", resolution="2K", model="nano-banana-2", image_urls=["main:final"])

generate_image(prompt="[DETAIL_SHOT_PROMPT]", output_asset_id="secondary:detail",
  aspect_ratio="1:1", resolution="2K", model="nano-banana-2", image_urls=["main:final"])

generate_image(prompt="[WHATS_IN_BOX_PROMPT]", output_asset_id="secondary:whats-in-box",
  aspect_ratio="1:1", resolution="2K", model="nano-banana-2", image_urls=["main:final"])
```

**Example — A+ modules (7 items, mixed aspect ratios, all typography-heavy → gpt-image-2):**

```
generate_image(prompt="[APLUS_MODULE_1_HERO_BANNER]", output_asset_id="aplus:1-hero",
  aspect_ratio="21:9", resolution="2K", model="gpt-image-2", image_urls=["main:final"])

generate_image(prompt="[APLUS_MODULE_2_PAIN_POINTS]", output_asset_id="aplus:2-pain-points",
  aspect_ratio="3:2", resolution="2K", model="gpt-image-2", image_urls=["main:final"])

generate_image(prompt="[APLUS_MODULE_3_FEATURES]", output_asset_id="aplus:3-features",
  aspect_ratio="3:2", resolution="2K", model="gpt-image-2", image_urls=["main:final"])

generate_image(prompt="[APLUS_MODULE_4_INGREDIENTS]", output_asset_id="aplus:4-ingredients",
  aspect_ratio="3:2", resolution="2K", model="gpt-image-2", image_urls=["main:final"])

generate_image(prompt="[APLUS_MODULE_5_EFFICACY]", output_asset_id="aplus:5-efficacy",
  aspect_ratio="3:2", resolution="2K", model="gpt-image-2", image_urls=["main:final"])

generate_image(prompt="[APLUS_MODULE_6_HOW_TO_USE]", output_asset_id="aplus:6-how-to-use",
  aspect_ratio="3:2", resolution="2K", model="gpt-image-2", image_urls=["main:final"])

generate_image(prompt="[APLUS_MODULE_7_ENDORSEMENT]", output_asset_id="aplus:7-endorsement",
  aspect_ratio="21:9", resolution="2K", model="gpt-image-2", image_urls=["main:final"])
```

**Full-set ordering:** generate the main image first, then the 5 secondary images and the 7 A+ modules (all referencing `main:final`). The two downstream groups together = the 12 downstream items of a full set; together with the main image, the user gets 13 total.

### Present each result

`generate_image` returns each result directly, with its `output_asset_id`. The frontend renders each image as it lands, so present each image to the user AS IT COMPLETES — do not accumulate and dump at once. If you need to inspect a result asset (e.g. to confirm it landed), use `get_asset` / `list_assets`.

### Key reference rules
- Reference the main image (`main:final`) via `image_urls` on every secondary and every A+ module — this is what enforces product consistency.
- Reference the freshly registered product asset only on the main-image generation.
- Set `model` per image type: `nano-banana-2` for photoreal product shots, `gpt-image-2` for infographic and A+ modules.
- Each `generate_image` call writes its result to the `output_asset_id` you specify — use descriptive, stable IDs so downstream references resolve.

### Partial scope handling

Generate exactly what the user asked for. Don't pad with extras, don't drop requested items.

Examples:
- "Full set" → 1 main + 5 secondary + 7 A+ = 13 images total
- "Product images only" → 1 main + 5 secondary = 6 total
- "A+ page only" → 1 main + 7 modules = 8 total (main still needed as reference)
- "Only infographic and lifestyle" → 1 main + 2 secondary = 3 total
- "3 different infographic variations" → 1 main + 3 infographics = 4 total

Different `aspect_ratio` values per item are fine — the set can mix `1:1`, `3:2`, `21:9`.

### Presenting the results

After each `generate_image` call returns, the result lands at its `output_asset_id`. Present each image AS IT COMPLETES — do not accumulate and dump at once. Use a descriptive, stable `output_asset_id` per image (e.g. `main:final`, `secondary:lifestyle`, `aplus:1-hero`) so downstream references resolve cleanly and the user can identify each deliverable.

---

## Multi-image consistency (critical rules)

1. **Main image first** — always. It's the visual anchor for the whole set.
2. **Reference main image** — every secondary and every A+ module prompt must include `image_urls=["main:final"]`.
3. **Consistent product appearance** — product color, material, shape, label design must be identical across all images. The reference enforces this; do not over-describe the product in the prompt.
4. **Unified visual style** — pick a color palette, font style, and icon style for the whole set. State these constraints in every prompt.

---

## `AskUserQuestion` — what to ask, what to NEVER ask

`amazon-product-listing` pins every technical parameter (model per image type, aspect ratio per image type, resolution = `2K`, Amazon compliance rules, generation order). Use `AskUserQuestion` ONLY for the small set of genuinely user-owned creative / routing gaps. Never surface a locked default as a fork.

### Default mode (silent path — no questions)

The skill has a **default scope**: if the brief did not specify a deliverable AND contains *"full auto"*, *"auto approve"*, *"no questions"*, *"just do it"*, *"go ahead"*, or any equivalent auto-mode phrase — proceed WITHOUT any `AskUserQuestion` call:

- If the brief explicitly named a deliverable (*"just the main image"*, *"only an infographic"*, *"A+ hero banner only"*, *"what's-in-the-box image"*, *"lifestyle shot"*) — generate exactly that, nothing more.
- If the brief is otherwise unspecified — default to **main image only**, generate it, and stop. Do not pad with extras.

In auto mode: state the chosen scope in ONE line before Step 4 (*"Scope: main image only — proceeding."*) so the user can interrupt if it was the wrong read. Do not turn that statement into a question.

### NEVER ask via `AskUserQuestion` (anti-flow forks — defaults are locked)

- **Model** — locked per image type (`nano-banana-2` for photoreal product shots, `gpt-image-2` for infographic / A+ modules). See § *Generation Integration* → *Model*.
- **Aspect ratio per image type** (1:1 main + secondary, 21:9 A+ hero / endorsement, 3:2 A+ modules 2–6) — locked. See § *Aspect ratios and resolution*.
- **Resolution** — locked to `2K`. Never *"1K or 2K?"* / *"what size?"*.
- **Pixel dimensions** (`width` × `height`) — never. Aspect ratio + resolution is the contract.
- **Reference shape** (the registered product asset on the main image, `main:final` for downstream) — locked per step.
- **Generation order** (main first, everything else downstream referencing the main image) — locked. Never *"sequential or parallel?"*.
- **Whether to put the product on pure white for the main image** — locked by Amazon compliance (`references/main_image_rules.md`).
- **Number of A+ modules in the full A+ deliverable** — always 7. Never *"how many modules?"*.
- **Whether to ask for compliance approval before submitting** — never poll. Compliance is enforced by the prompt template + main-image rules reference.
- **Style / palette / typography across the set** — locked to ONE choice per project for consistency (see § *Multi-image consistency*). Never *"modern or classic?"* / *"which font?"* forks.

### DO ask via `AskUserQuestion` (creative / routing gaps only)

Bundle gaps into ONE call when more than one is open — never fire a separate question per gap.

| Question id | Ask when | Notes |
|---|---|---|
| `scope` | Step 2, brief did not specify a deliverable AND no auto-approve language present. | Four scope options. Skip entirely under Default mode above. |
| `image_source` | Step 1, `web_fetch` returned no usable product image (JS-blocked, paywalled, 404, missing alt photos). | Three options. Blocks Step 4 until answered. |
| `iteration_triage` | User rejects a generated image with a vague reason ("not it", "redo this", "I don't like it"). | Four options. Skip if the reject message already named the problem. |

### Canonical call shapes

**`scope`** — Step 2 confirmation:

```
AskUserQuestion(
  questions=[
    {
      "id": "scope",
      "prompt": "What would you like me to create?",
      "options": [
        "Complete set (main + 5 secondary + A+ page) — 13 images",
        "Product images only (main + 5 secondary) — 6 images",
        "A+ page only (main + 7 modules) — 8 images",
        "Just the main image to start (continue from there)",
        "Other (describe in chat)",
      ],
    },
  ]
)
```

**`image_source`** — Step 1 URL failure:

```
AskUserQuestion(
  questions=[
    {
      "id": "image_source",
      "prompt": "I couldn't pull a product image from that URL. How do you want to proceed?",
      "options": [
        "Upload an image directly — I'll wait",
        "Use URL text only — lower product fidelity",
        "Try a different URL with a direct product photo",
        "Other (describe in chat)",
      ],
    },
  ]
)
```

**`iteration_triage`** — after a vague reject:

```
AskUserQuestion(
  questions=[
    {
      "id": "iteration_triage",
      "prompt": "What about the image isn't working?",
      "options": [
        "Product itself is wrong (color, label, shape)",
        "Background / scene / lifestyle context is wrong",
        "Text / wording / callouts need different copy",
        "Other (describe in chat)",
      ],
    },
  ]
)
```

Free-text *"Other"* is always present so the user can override the options when none fit.

---

## Iteration guidance

When the user is not satisfied with a generated image, **do not regenerate blindly**. Fire the **`iteration_triage`** `AskUserQuestion` (defined above) to localize the problem first — wrong product vs wrong scene vs wrong copy vs other. Skip the question only when the user already named the problem in their reject message ("the text is wrong", "background should be lifestyle, not white") — in that case act on their answer directly.

Regeneration rules once the problem is localized:

- **Text / wording on an infographic or A+ module** — regenerate ONLY the problem image. Do not redo the main or other downstream images.
- **Product appearance** (color, label, packaging shape) — regenerate the **main image first**, then regenerate ALL downstream images that reference `main:final` (their product anchor changed).
- **Background / scene / lifestyle context** — regenerate only the problem image; the main image stays valid as the product anchor.
- **Style / palette / typography drift across the set** — regenerate the affected secondary / A+ items, keep the main image untouched.