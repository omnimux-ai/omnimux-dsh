# Product Photoshoot

The brand-imagery skill — covers marketing and commerce visuals (studio shots, lifestyle, Pinterest, hero banners, carousels, ads, model try-ons, conceptual, restyle). Structured prompt assembly, professional photography vocabulary, brand-aware composition, and a refinement pass that produces consistently higher-quality output than single-shot generation.

The product is always the hero. Every mode focuses on showcasing the product in a specific marketing context. **This skill does not handle Amazon marketplace listings** — Amazon main images, secondary infographics, and A+ Brand Content go to `amazon-product-listing`, which enforces a different set of compliance rules and a different output spec.

> **`context: inline`** — this skill generates images end-to-end (it calls `generate_image`, audits the output, and runs a refinement pass), so it must run inline with the full toolset rather than forking off to write a brief.

## How this skill works

This is a **router skill**. The main SKILL.md you are reading handles:
1. **Pre-generation interview** — ask the right questions before generating
2. **Mode selection** — figure out which generation mode the user wants
3. **Pre-flight setup** — read brand and product context from memory, confirm references
4. **Mode delegation** — load the relevant mode reference file from `references/`

All prompt assembly, photographer references, lighting setups, composition rules, quality gates, and refinement logic live in the mode reference files (`references/<mode>.md`) and shared resources (also in `references/`). The main SKILL.md does NOT contain prompt templates or generation details — those are always in the mode references.

## Modes (10 total)

| Mode | Use when the user wants... | Reference file |
|---|---|---|
| `product-shot` | Product on a neutral / seamless / studio background, catalog images, packshots, e-commerce listings | `references/product-shot.md` |
| `lifestyle-scene` | Product placed in a real-world environment with hands, action, atmosphere | `references/lifestyle-scene.md` |
| `closeup-product-with-person` | Tight crop showing product + hands + partial face — beauty application, holding, demonstrating, face-product interaction | `references/closeup-product-with-person.md` |
| `pinterest-pin` | Vertical 2:3 Pinterest-native aesthetic, moodboard feel | `references/pinterest-pin.md` |
| `hero-banner` | Wide-format website / email / campaign header | `references/hero-banner.md` |
| `social-carousel` | 3–10 connected slides for IG / LinkedIn / Facebook with locked visual system | `references/social-carousel.md` |
| `ad-creative-pack` | Coordinated pack of static ad variants for Meta / TikTok / Pinterest / Google Ads | `references/ad-creative-pack.md` |
| `virtual-model-tryout` | Product worn or used by an AI-rendered model | `references/virtual-model-tryout.md` |
| `conceptual-product` | Surreal / CGI-style / levitating / splash / sculptural product imagery — premium DTC, fragrance, beauty, tech | `references/conceptual-product.md` |
| `restyle` | Transform an existing image's aesthetic, mood, or seasonal context — preserving subject and composition | `references/restyle.md` |

## `AskUserQuestion` — what to ask, what to NEVER ask

`product-photoshoot` pins every technical parameter (model = `nano-banana-2`, resolution = `2K`, structured prompt template, negative prompts, refinement pass). Use `AskUserQuestion` ONLY for the small set of genuinely user-owned creative gaps. Never surface a locked default as a fork.

### Default mode (silent path — no questions)

The skill has a **default photoshoot recipe** that runs WITHOUT any `AskUserQuestion` call when:

- The brief contains *"full auto"*, *"auto approve"*, *"no questions"*, *"just do it"*, *"go ahead"*, *"auto"*, or any equivalent auto-mode phrase, **AND**
- A product image or a textual product description is present in the brief

Defaults applied silently in that case:

- **Variants:** `3`
- **Background preset:** `clean-studio` (most universal — Shopify / Amazon / IG e-commerce default)
- **Aspect ratio:** `1:1`
- **Brand palette:** loaded from `brand` memory if present; otherwise neutral
- **Photographer style:** the descriptors for the `clean-studio` row of `references/photographer-references.md` — NOT the names themselves (see § *Prompt sanitization*)

State the chosen recipe in ONE line before generating (*"Recipe: 3 variants, clean-studio preset, 1:1, neutral palette — proceeding."*) so the user can interrupt if it was the wrong read. Do NOT turn that statement into a question.

### NEVER ask via `AskUserQuestion` (anti-flow forks — defaults are locked)

- **Model** (`nano-banana-2` vs any other) — locked. Never *"which model?"* / *"realistic or stylized?"*.
- **Resolution** — locked to `2K`. Never *"what size?"* / *"1K or 2K?"*.
- **Resolution setting** (`resolution: "2K"` on every `generate_image` call) — automatic.
- **Prompt structure** (the `[SUBJECT]`/`[COMPOSITION]`/`[LIGHTING]`/… template in `references/product-shot.md`) — locked. Never *"freeform or template?"*.
- **Negative prompts** — always appended from `references/negative-prompts.md`. Never *"include negative prompts?"*.
- **Refinement pass** — always runs per `references/refinement-pass.md`. Never *"one pass or two?"*.
- **Photographer references** — internal craft. **NEVER** surface photographer names to the user via `AskUserQuestion`, chat, logs, or any other channel — see § *Prompt sanitization*.
- **Lens / Kelvin / f-stop / lighting-setup terminology** — locked to `references/photography-vocabulary.md`. Never poll the user on technical photo settings.
- **Brand-memory contents** — internal. Never echo a brand's stored palette / tone back as an `AskUserQuestion` option label.

### DO ask via `AskUserQuestion` (creative gaps only)

Bundle gaps into ONE call when more than one is open — never fire a separate question per gap.

| Question id | Ask when | Notes |
|---|---|---|
| `variant_count` | Brief did not say how many images. | `1` / `3` (default) / `5`. Skip entirely under Default mode. |
| `preset` | Brief did not pick a background style AND it can't be inferred from product category or brand memory. | Show the 3 presets most relevant to the product category, plus `Other`. Always include free-text. |
| `aspect_ratio` | Brief did not name a use case AND `1:1` is genuinely ambiguous (e.g. user said "for my socials" → could be square or portrait). | `1:1` / `4:5` / `3:4` / `Other`. Default to `1:1` silently when use case is unstated. |
| `brand_palette` | NO `brand` memory loaded AND brief does not name brand colors. | Free-text. Skip if any colors mentioned in brief or in product packaging. |
| `product_description` | Text-only brief, no product image attached, no `product` memory loaded. | Free-text. Always preferred over guessing. Offer to wait for an image upload as the first option. |
| `iteration_triage` | User rejects a generated image with a vague reason ("not it", "redo this", "I don't like it"). | Four options. Skip if the reject message already names the problem. |

### Canonical call shapes

**Most common bundle — image attached, scope and style not specified:**

```
AskUserQuestion(
  questions=[
    {
      "id": "variant_count",
      "prompt": "How many variants?",
      "options": ["1", "3 (recommended)", "5", "Other (describe in chat)"],
    },
    {
      "id": "preset",
      "prompt": "Background style?",
      "options": [
        "Clean studio — universal e-commerce / Shopify / Amazon",
        "Dramatic studio — premium, deep shadows",
        "Minimal design — pastel solid, lots of negative space",
        "Other (describe in chat — luxury / vibrant / floating / ingredient flatlay)",
      ],
    },
    {
      "id": "aspect_ratio",
      "prompt": "Where will you use this?",
      "options": [
        "Shopify / Amazon / IG square (1:1)",
        "IG portrait (4:5)",
        "Web hero (3:4)",
        "Other (describe in chat)",
      ],
    },
  ]
)
```

**`product_description`** — text-only brief, no image attached:

```
AskUserQuestion(
  questions=[
    {
      "id": "product_description",
      "prompt": "Describe the product so I can render it — category, packaging, color, distinctive features. You can also attach a photo for higher fidelity.",
      "options": [
        "Attach a photo — I'll wait",
        "Other (describe the product in chat)",
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
      "prompt": "What about the photoshoot isn't working?",
      "options": [
        "Product itself is wrong (color, label, shape, materials)",
        "Background / surface / palette is wrong",
        "Lighting / shadows feel off",
        "Other (describe in chat)",
      ],
    },
  ]
)
```

Free-text *"Other"* is always present so the user can override the options when none fit.

## Mode selection rules

Once the interview is complete (or skipped because intent is obvious), pick the mode by intent, not keywords:

- Mentions a product + neutral / clean / white / studio / catalog / Shopify / packshot → `product-shot`
- Mentions a product + environment / scene / in use / kitchen / outdoor / cafe / gym → `lifestyle-scene`
- Mentions hands holding / closeup of face with product / beauty application / demonstrating → `closeup-product-with-person`
- Mentions Pinterest, pin, pinnable, vertical pin → `pinterest-pin`
- Mentions hero, banner, website header, landing page, email header, wide format → `hero-banner`
- Mentions carousel, slide post, multi-slide, swipeable, "X slides" → `social-carousel`
- Mentions ads, ad pack, ad creatives, paid social, Meta / TikTok / Pinterest ads → `ad-creative-pack`
- Mentions model wearing, virtual try-on, on body, fashion shoot, lookbook → `virtual-model-tryout`
- Mentions levitating, floating, splash, frozen motion, surreal, CGI-style, sculptural, conceptual → `conceptual-product`
- Modifies an EXISTING image's aesthetic, mood, season — without changing subject → `restyle`

When two modes could apply, prefer the more specific one:
- "Pinterest pin of my product on a kitchen counter" → `pinterest-pin` (Pinterest is the platform)
- "Hero banner showing my product in use" → `hero-banner` (banner format wins)
- "Carousel of my product in different scenes" → `social-carousel` (multi-slide wins)
- "Closeup of person applying my serum" → `closeup-product-with-person` (closeup with person + product is the specific genre)

## Universal pre-generation checklist

Run BEFORE loading the mode-specific reference. Skip none.

1. **Read brand context.** Check `.memory/MEMORY.md` for entries of type `brand`. Load any matching brand file. Extract: colors, visual direction, tone, things to avoid.
2. **Read product context.** Check for type `product` entries. Extract: category, USP, audience, materials, finish, price tier.
3. **Check user uploads.** If the user attached an image, use the Read tool to view it FIRST. Describe what you see — do not assume. Inspect attached / prior assets with `list_assets` and `get_asset` so you reference them by asset ID.
4. **Run the interview** if any essential info is missing (see Pre-generation interview above).
5. **Select the mode** from the table above.
6. **Load the mode reference file** from `references/<mode>.md` — it contains the prompt template, photographer references, lighting setups, composition rules, quality gates, and all generation details.
7. **Load shared resources as needed** — `references/typography.md`, `references/photography-vocabulary.md`, `references/photographer-references.md`, `references/negative-prompts.md`, `references/refinement-pass.md`.

## Typography

See `references/typography.md` for the three-case rule on handling text in generated images. Every mode reference file links to this shared resource.

## Shared resources

These files apply across all modes. Read them as needed:

- `references/typography.md` — the three-case rule for handling text in generated images.
- `references/photography-vocabulary.md` — lighting direction, color temperature, lens specs, surface terminology. Use this language in EVERY prompt.
- `references/photographer-references.md` — full curated list of commercial photographers grouped by genre.
- `references/negative-prompts.md` — universal AI-artifact suppression list.
- `references/refinement-pass.md` — the two-pass quality protocol.

## Prompt sanitization — extract style, never names

Photographer references (`references/photographer-references.md`) and similar branded craft-anchors are INTERNAL knowledge — they shape your style selection but MUST be extracted into descriptive language before the assembled prompt is sent to `generate_image`.

### Why

- **Content filters** — the image model may degrade or refuse prompts that name living photographers, magazines, or competitor brands.
- **Brand safety** — output rendered *"in the style of {name}"* can mimic a real photographer's signature work closely enough to raise plagiarism / IP concerns.
- **Leakage** — if a prompt is ever surfaced to the user (debug logs, error responses, support tickets, screen recordings), named refs leak internal craft.
- **Legal** — photographers, magazines, and retailer brands are real businesses with real trademarks.

### What gets extracted

| Sensitive token | Where it lives internally | What enters the prompt instead |
|---|---|---|
| Photographer name (Carl Kleiner, Aaron Tilley, Mert & Marcus, Sølve Sundsbø, Irving Penn, Tim Walker, …) | `references/photographer-references.md` | The one-line descriptor next to the name (e.g. *"geometric color-blocking with minimal product staging"*) |
| Magazine / publication name (Vogue, Vogue Italia, Vanity Fair, NYC Mag, Wallpaper, Kinfolk, …) | descriptor strings in mode references | The visual register — e.g. *"editorial high-fashion glossy"*, *"magazine-grade product still-life"* |
| Retailer / aesthetic brand name in style descriptors (IKEA aesthetic, Aesop aesthetic, Glossier aesthetic, …) | descriptor strings in mode references | The aesthetic shorthand — e.g. *"Scandinavian flat-pack minimal"*, *"warm Australian apothecary"*, *"millennial-pink minimalist beauty"* |
| User's own brand name (from `brand` memory) | `.memory/MEMORY.md` brand entries | The brand's palette, tone, and visual direction inside `[BRAND INTEGRATION]` — never the brand name itself unless the user's brand IS the printed label being rendered on the product |
| Competitor brand name mentioned in user brief | conversation only | Drop entirely — never reference competitors in the prompt body |

### How to apply

1. **Pick** 2–3 photographers from `references/photographer-references.md` based on mode + preset (e.g. `clean-studio` → Carl Kleiner, Aaron Tilley, Bobby Doherty internally).
2. **Read the descriptor** next to each name in that file — the one-line craft summary IS the extracted style.
3. **Compose the `[STYLE REFERENCE]` block** from descriptors only:
   - **BEFORE (forbidden):** `In the style of Carl Kleiner, Aaron Tilley, Bobby Doherty. Editorial commercial product photography.`
   - **AFTER (correct):** `Geometric color-blocking with minimal product staging, surreal product still-life with unusual compositions, vibrant witty editorial staging. Magazine-grade commercial product photography.`
4. **Apply the same rule** to magazines, retailers, and brand names — extract the visual register, never the literal name.

### Sanitization checklist (run before every `generate_image` call)

- [ ] No photographer names anywhere in the prompt body
- [ ] No specific magazine / publication titles
- [ ] No retailer or competitor brand names
- [ ] User-brand name appears only inside `[BRAND INTEGRATION]`, and only if the brand IS the on-product label being rendered
- [ ] Style descriptors are concrete (color, composition, lighting, surface) — not generic adjective lists
- [ ] No internal craft codenames or skill names (*"`clean-studio` preset"*, *"product-shot mode"*) in the prompt body

### Reference-file hygiene

`references/photographer-references.md` is fine as an internal craft document, but:

- Do NOT cat or quote its contents to the user in chat
- Do NOT copy a section of it into an `AskUserQuestion` option list
- Do NOT include its filename or any photographer name in user-facing output, error messages, or progress updates

If the user asks *"what style are you using?"* — respond with the **descriptors** ("clean Scandinavian still-life, geometric color-blocking, soft frontal key"), not the names.

## Universal generation rules

- **Model:** always `nano-banana-2` for photoreal product imagery. Switch to `gpt-image-2.5-sunburst` only when the deliverable is on-image typography, a logo, or a flat graphic (see `references/typography.md` Case 1 and the ad-creative-pack typography notes).
- **Prompt structure:** assemble using the mode's structured template from `references/<mode>.md` — never freeform.
- **Aspect ratio:** chosen from the mode's reference file, passed via the `aspect_ratio` parameter.
- **Typography:** follow the three-case rule in `references/typography.md`.
- **Photographer references:** extract descriptors per § *Prompt sanitization* — never paste raw names into the prompt body.
- **Negative prompts:** append per `references/negative-prompts.md`.
- **Refinement pass:** run after first generation per `references/refinement-pass.md`.
- **Resolution:** every `generate_image` call sets `resolution="2K"`.

## Generation invocation

All generation runs through the native `generate_image` tool. Inputs are referenced by asset ID (use `list_assets` / `get_asset` to discover them); if you need to bring in an external URL as an input, register it first with `register_asset`. Pattern is the same across modes — only prompt and aspect ratio differ. **Every call sets `resolution="2K"`.**

**Single image (pure text-to-image — no real product/persona to preserve):**

```
generate_image(
  prompt="<assembled prompt from mode template>",
  output_asset_id="product:main",
  aspect_ratio="<from mode rules>",
  resolution="2K",
  model="nano-banana-2"
)
```

**Batch (N variants):** call `generate_image` once per variant, each with its own `output_asset_id` (e.g. `product:v1`, `product:v2`, `product:v3`) so each result is addressable:

```
generate_image(prompt="<prompt 1>", output_asset_id="product:v1", aspect_ratio="...", resolution="2K", model="nano-banana-2")
generate_image(prompt="<prompt 2>", output_asset_id="product:v2", aspect_ratio="...", resolution="2K", model="nano-banana-2")
generate_image(prompt="<prompt 3>", output_asset_id="product:v3", aspect_ratio="...", resolution="2K", model="nano-banana-2")
```

For more variants, keep submitting per-variant calls. Track each `output_asset_id` so the user can reference a specific result ("regenerate v3").

**With a reference (preserving a real product or persona):** pass the input asset IDs in `image_urls`. Only include `image_urls` when you are preserving an actual uploaded/known product or persona — omit it entirely for pure text-to-image.

```
generate_image(
  prompt="<assembled prompt>",
  output_asset_id="product:main",
  aspect_ratio="...",
  resolution="2K",
  model="nano-banana-2",
  image_urls=["product:reference"]
)
```

To bring in an external URL as a reference, register it first:

```
register_asset(url="https://...", asset_id="product:reference")
generate_image(prompt="<assembled prompt>", output_asset_id="product:main", aspect_ratio="...", resolution="2K", model="nano-banana-2", image_urls=["product:reference"])
```

**With a prior result as a reference (image-to-image carried over from an earlier generation in the same session):** reference the prior result's `output_asset_id` directly in `image_urls`.

```
generate_image(
  prompt="<assembled prompt>",
  output_asset_id="product:refined",
  aspect_ratio="...",
  resolution="2K",
  model="nano-banana-2",
  image_urls=["product:main"]
)
```

### Typography / graphic output

When the deliverable IS the text — an on-image headline, a logo lockup, or a flat graphic — switch `model="gpt-image-2.5-sunburst"`. Keep everything else (prompt structure, aspect ratio, resolution, negative prompts, refinement pass) the same. Photoreal product imagery stays on `nano-banana-2`.

### Results are surfaced automatically

`generate_image` returns the finished image and the frontend renders it for the user automatically. **Submit, capture the `output_asset_id`, move on.** You do not need to poll or "wait for" or "confirm" a generation finished. Reference a prior result by its `output_asset_id` only when it feeds back as input into a later `generate_image` call in the same turn (e.g. anchor → fan-out variants, refinement pass), or when the user explicitly asks for the URL / file.

## Core principles

These are the design decisions that make this skill produce consistent, high-quality output. Follow all of them — skipping any one degrades results.

1. **Pre-generation interview** — 3–4 short questions before generating. First-pass hit rate is dramatically higher when context is gathered upfront.
2. **Professional photography lexicon** — Kelvin temperatures, focal lengths, f-stops, lighting direction, named lighting setups. Generic words produce generic output.
3. **Curated commercial photographer references** — used INTERNALLY to anchor style choice (clean still-life, dramatic editorial, surreal product, warm lifestyle, glossy beauty, etc.). The names live in `references/photographer-references.md` but never enter the prompt body — only their one-line descriptors do (see § *Prompt sanitization*).
4. **Structured prompts with named sections** — never freeform. Every mode has a template.
5. **Brand integration via memory** — palette and tone applied automatically from brand memory.
6. **Negative prompts** — tuned list to suppress AI sheen, plastic skin, warped text, generic stock feel.
7. **Refinement pass** — first generation is audited, second pass refines the weakest area.
8. **Free composition by default** — no fake empty space carved out for text unless user asks. Avoids the flat-color-band failure mode.
9. **Conceptual / CGI mode** — covers premium surreal product imagery (levitating, splash, sculptural) that requires specialized prompting.

## Common mistakes to avoid

- Skipping the brand and product memory reads
- Skipping the pre-generation interview when info is missing
- Loading the mode reference file before selecting the mode
- Writing freeform prompts instead of using the structured template from the mode reference
- Pasting raw photographer names (or magazine / retailer brand names) into the prompt body instead of extracting their descriptors per § *Prompt sanitization*
- Skipping negative prompts
- **Forgetting `resolution="2K"` on the `generate_image` call**
- Delivering the first pass without the refinement audit
- Using a model other than `nano-banana-2` for photoreal product imagery (reserve `gpt-image-2.5-sunburst` for typography / graphic output)
- Confusing modes (e.g. using `product-shot` for a Pinterest request)
- Asking more than 4 interview questions at once — users abandon
- Reserving "clean negative space" for text by default — produces flat color bands (see `references/typography.md`)