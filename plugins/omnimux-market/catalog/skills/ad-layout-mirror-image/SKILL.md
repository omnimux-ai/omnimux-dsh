# Ad Layout-Mirror (Image)

You are recreating the **composition** of a reference image ad with a **different product** in the hero slot. The reference is a mold; the product is the fill.

## When to use this pattern

Trigger when **all three** are true:

1. The user uploaded (or pointed at) a reference image ad they want to mirror.
2. The user supplied a different product — at minimum one clean product image plus some spec text.
3. The desired output is a single static image (1:1 unless otherwise specified). Photoreal, hero-on-counter / hero-in-context look. Copy is baked into the image.

Do **not** use this pattern for:
- Video ads (no motion brief here).
- Persona / UGC ads where a person is the hero.
- Briefs with no reference image — that's open-form ad creative, not a layout mirror.

## The core creative move

**The reference is a wireframe, not a moodboard, not an I2I anchor.**

- The reference image gives you: headline position, hero position, secondary visual (pour shot, ingredient shot, lifestyle prop), badge/chip rail position, rating-row position (if any), background mood, aspect ratio, overall density.
- The reference image must NOT contribute: its product silhouette, its brand colors, its wordmark, its exact claim numbers, its review counts, its product category-specific details that don't apply to the new product.

You enforce this split by **describing the reference layout in prose** in the image-generation handoff and passing **only the user's product image** as the I2I / product reference. The reference image is never attached as an I2I source.

## Step-by-step creative direction

### 1. Inspect every uploaded asset before deciding which is which

Asset IDs (`input:image-1`, `input:image-4`, etc.) tell you nothing about content. Fan out `get_asset` on every upload in parallel and mentally label each one:

- **LAYOUT REFERENCE** — the one (usually one) that is a fully-composed ad.
- **PRODUCT HERO REFERENCE** — clean front-of-pack / clean shot of the user's product. This is the I2I anchor.
- **Supporting product shots** — backs of pack, lifestyle, comparison charts, marketing collateral. Usually unused. Pick from these only if a specific layout slot calls for it (e.g. the reference has a "back of pack" inset, or the layout has a lifestyle background plate).
- **Logos / wordmarks** — only use if the product hero image lacks the wordmark and you need it elsewhere in the layout. Most clean product shots already carry the wordmark on-pack.
- **Unrelated / noise assets** — ignore.

Do not skip this. The reference-layout vs. product-hero distinction is the single highest-stakes decision in this skill. Getting it backwards (passing the reference as I2I, or passing the wrong product) produces an ad for the wrong brand.

### 2. Parse the layout into named slots

Look at the reference and decompose it into a slot list before you write a single word of the handoff. Typical slots:

- **Headline band** (top ~⅓): one-line claim, often centered.
- **Hero cluster** (mid): product on one side, action shot (pour, scoop, stir, slice) on the other.
- **Trust row** (just below cluster): rating stars + short trust line. Often omittable — see §6.
- **Benefit chips** (bottom band): 3 short pill-shaped claims on a cream/neutral bar.
- **Background**: kitchen counter, studio sweep, lifestyle environment.

Write the slot list down (mentally or in scratch). Each slot becomes a sentence in the layout-prose part of the handoff. See `references/slot-vocabulary.md` for a fuller slot vocabulary.

### 3. Adapt the copy — never blindly transcribe the reference

This is where most mirror-ads go wrong: the reference makes a specific numeric/category claim and the writer just copies it. The user's product has different numbers.

For every claim slot, do a 30-second sanity pass against the user's actual product info:

- **Quantitative claims** (g of an ingredient, % whatever, mg of X): recompute from the user's spec sheet, per the user's serving size. Round sensibly.
- **Type / category claims** ("origin-of-manufacture", "single-source", "lab-tested"): only keep if the user's product actually makes that claim. Otherwise rewrite or drop.
- **"0 additives" / "no sugar" / purity claims**: only keep if the ingredient list supports it.
- **Headline**: if the reference headline is generic and verifiably true of the user's product, keep verbatim. If it makes a category-specific claim that doesn't apply, rewrite to the user's product in the same tonal register and roughly the same word count.

If you cannot verify a claim from the user-provided spec, **don't put a fabricated version of it in the ad.** Drop the slot or replace it with a brand-quality phrase that doesn't require evidence (e.g. "Premium Quality" instead of a fabricated "N ★ from N reviews").

### 4. Compose the image handoff

The director call is `output_type: image`, `aspect_ratio: 1:1` (match the reference unless told otherwise), `scene_type: live_action` (photoreal). The handoff has four sections in this order — see `references/handoff-template.md` for the fill-in-the-blank version.

**A. PRODUCT REFERENCE.** Name the user's clean product image as the I2I anchor and list every on-pack element that must survive intact. Be granular: wordmark spelling, decorative stripes / waves / illustrations, on-pack headline, feature bullets (paraphrase each), weight callout, URL, cap/closure shape, pouch vs canister vs bottle silhouette. The director will preserve what you name and will drift on what you leave unsaid.

**B. LAYOUT (prose).** Walk slot by slot through the composition you parsed in §2. Phrase as "top third: …, left of center: …, right of center: …, bottom band: …". Explicitly state when something from the reference is **not** to be included — especially the reference's own product, brand colors, wordmark. Example phrasing that works:

> The reference image (image-1) is provided as a LAYOUT template only. Do NOT include the reference's product container or its brand wordmark anywhere. Replicate only the composition.

**C. TEXT OVERLAYS (bake into image).** Image ads have no downstream video-editor step — every word that appears on screen must be in this section. Format as a labeled list:

> - Headline (top, centered, bold sans-serif, dark text on light bg): "<verbatim copy>"
> - Chip 1 (bottom band, left, pill-shaped, dark text on cream): "<verbatim copy>"
> - Chip 2 (bottom band, center): "<verbatim copy>"
> - Chip 3 (bottom band, right): "<verbatim copy>"

Rules: ≤8 words per line; headlines crisp; non-ASCII characters (umlauts ö ä ü ß, accents, etc.) spelled out verbatim — typography fidelity is on you to demand explicitly.

**D. CRITICAL CONSTRAINTS.** A short block of must-nots. Always include:

- Hand / body anatomy if any human element is in frame: "fingers and wrist only, anatomically correct, five fingers, no extra digits."
- Pour / action physics: "single delicate stream of powder, soft cloud where it meets liquid, no spillage."
- Packaging silhouette: "pouch must remain a flat-bottom standup pouch — not a canister, not a bottle, not a jar" (or whatever shape applies).
- Text fidelity: "all on-screen copy must render exactly as written, including umlauts; no garbled letterforms."
- Reference exclusion: re-state the "do not include the reference brand's product" line.

### 5. Model choice

Use **gpt-image-2.5-sunburst** for image ads with non-trivial typography: multi-line headlines, multiple short copy strings (chips, badges, rating), or non-ASCII characters. It is materially better at multi-string text fidelity than the alternatives. Echo packaging-shape constraints verbatim regardless of model — silhouette drift happens in every model.

### 6. The rating row — omit by default

User preference, locked: **do not include a star-rating row / review count / "★★★★★ N reviews" row unless the user explicitly asks for one.** When the reference has a rating row, replace it with clean negative space and pull the bottom chip rail slightly closer to the hero cluster to keep the composition balanced. If the user asks for some form of social proof, prefer a non-numeric trust line ("Premium Quality", "Trusted by athletes") over a fabricated review count.

### 7. Handling iteration

When the user asks for an edit ("skip the rating", "make the headline bigger", "tighten the chips"), re-dispatch the full handoff at a new versioned `asset_id` (e.g. `ad-<product>-v2:image_hero`). Do not partial-edit — image generation isn't compositional. Repeat the product-reference block and constraints **verbatim** in the new handoff so packaging fidelity doesn't regress on the edit.

## Hard rules (do-not-regress)

1. **Never** pass the layout reference image as an I2I / product reference. It is described in prose only.
2. **Always** pass the user's clean product image as the I2I anchor, with explicit packaging-preservation language.
3. **Never** copy quantitative claims from the reference without re-checking against the user's spec.
4. **Never** fabricate a review count or star rating. If no real number is available, omit the rating row or use a non-numeric trust line.
5. **Omit the rating row by default.** Add only on explicit request.
6. **Every** on-screen word goes inside the TEXT OVERLAYS block of the handoff. There is no later step to add it.
7. **Always** re-state the reference-exclusion ("do not include the reference brand's product / colors / wordmark") in the constraints block — even when it feels redundant.
8. **Always** name the packaging silhouette explicitly (pouch / canister / bottle / jar / box) to lock the shape.
9. For edits, **re-send the full handoff** at a new version id. No partial edits.

## See also

- `references/handoff-template.md` — a fill-in-the-blank handoff skeleton.
- `references/slot-vocabulary.md` — common reference-ad slot names and how to describe them in prose.