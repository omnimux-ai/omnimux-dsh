# Static product ad from a reference layout

## When to use this pattern

Use when the user provides:
- One **reference image** (competitor ad, mood board, existing creative) that defines the layout / visual language they want to emulate, **AND**
- One or more **product images** of their own SKU (pack shot, hero, lifestyle), **AND** optionally a brand logo.

The deliverable is a **single static image** (1:1, 9:16, 4:5, or 16:9), not a video, not a carousel, not a multi-frame storyboard. If the user wants motion, hand off to the video ad skills instead.

Do **not** use this skill when:
- There is no reference image — that's an open-ended creative brief, not a reference-emulation task.
- The user wants a faithful reproduction of the reference (i.e. just re-render the competitor ad). This skill is about *re-skinning* a layout for a different product, not copying it.
- The user has not supplied a product image. Without a real pack shot the result will be a generic stock-style mockup; ask for the product photo before running.

## The creative move

> "Keep the mold, swap the contents — and rewrite every claim to match the new contents."

A reference ad is a **mold**: spatial zones (logo / headline / hero / callouts / footer), a palette, a typographic feel, a decorative motif (a doodle, a pedestal, a halo). The mold stays. What pours into it — the product, the brand, the claim copy — is what changes. The single biggest failure mode is leaving the **competitor's claim text** in the mold; that ships false advertising. Treat claim verification as a hard step, not an optional one.

## Step-by-step

### 1. Inventory every uploaded asset (parallel)

Call `get_asset` on **every** input the user attached, in one parallel batch. For each, mentally label its role:
- `reference` — the layout you're emulating
- `product` — the user's pack shot (pick the cleanest, most front-facing one as primary)
- `logo` — the user's brand mark
- `lifestyle` — optional supporting imagery
- `unrelated` — anything that doesn't fit the brief (note it, don't use it)

Do not skip assets you assume are duplicates; users sometimes upload two near-identical pack shots and one of them is the better hero.

### 2. Read the reference's layout

Describe the reference back to yourself in zones. A typical breakdown:
- **Top-left / top-right corners:** brand logo, headline, decorative motif (sun, sparkle, swoosh).
- **Center:** the hero subject (product on a pedestal, floating, in-hand, in a bowl).
- **Sides or stacked column:** claim badges / callout pills — count them.
- **Bottom:** footer, footnote, secondary brand, legal asterisk.

Also note: **palette** (two or three named colors), **typography feel** (rounded sans, serif, condensed, handwritten), **decorative grammar** (flat illustration, photoreal, mixed), **negative space density**.

### 3. List every text/claim block in the reference, then verify

Write out every word visible in the reference: headline, subhead, each callout, footer, asterisked footnote. For **each claim**, ask: *is this true of the user's product?*

Sources of truth, in order:
1. The user's product description / spec sheet if they provided one in this conversation.
2. Text visible on the user's pack shot (ingredients panel, spec table, claims printed on the label).
3. The user's brand voice (tone of the logo / pack — premium, sporty, clinical, friendly).

If a claim from the reference is **not verifiable** as true for the user's product, **replace it** with a truthful equivalent drawn from the product copy. Never carry over claims like "fragrance-free", "rechargeable", "X-hour battery", "waterproof", "ships in 24h" without proof — these are the exact claims that mismatch between SKUs.

See `references/claim-swap-rules.md` for the swap-decision checklist.

### 4. Pick the aspect ratio

Priority order:
1. **User override** — if they asked for 1:1, 9:16, etc., use that even when the reference is a different ratio. Re-flow the zones into the new canvas (a vertical reference becomes a square by widening the negative space sideways and stacking the callouts vertically on one side).
2. **Reference's native ratio** — if the user didn't specify, match the reference.
3. **Platform default** — if neither, default to 1:1 (broadest platform compatibility).

### 5. Pick the image model

Decision rule:
- **gpt-image-2** — choose when the ad has **≥3 distinct text blocks** (headline + subhead + multiple callouts + footer), OR when brand wordmark / logo fidelity is critical, OR when the product label text must remain legible. gpt-image-2 is the only model that reliably handles dense typography in non-English languages.
- **nano-banana-2** — choose when the product silhouette / packaging photorealism is the dominant fidelity concern AND the ad has minimal text (just a logo + a one-line headline). nano-banana-2 renders product textures and materials more faithfully but garbles text once you exceed two or three distinct blocks.

When in doubt with a typography-heavy reference: **gpt-image-2**.

### 6. Compose ONE `generate_image` call

`image_urls` ordering matters — the model treats the first reference as the primary subject. Order:
1. **Product image first** (this is what must be preserved verbatim)
2. **Brand logo** (so the model knows the mark)
3. **Reference layout last** (style guidance, not subject)

Resolution: **2K** for static ads (higher fidelity for on-image text).

Prompt structure — three labelled blocks in this order:

**LAYOUT** — describe the canvas zone by zone, mirroring the reference. Be spatially explicit ("top-left", "right-side vertical stack of three pills", "bottom-center one-line footer"). Name every text element with the **verified, swapped** copy from step 3.

**STYLE** — palette (named colors with hex if you have them), font feel, decorative motifs, mood (e.g. "friendly and optimistic", "premium cold-stone minimal", "sporty high-energy"), photo treatment of the product ("photoreal, sharp, soft top-light"), negative-space density.

**HARD CONSTRAINTS** — anti-drift rules. Always include at minimum:
- "Preserve the product packaging exactly as shown in the primary reference — same label, same brand marks, same colors, same proportions."
- "Do NOT alter the product's printed label text or brand logo colors."
- "Do NOT add extra text, claims, badges, or graphics beyond what is listed above."
- Any product-specific preservation note (e.g. "keep the accent footer band", "keep the colored label stripe").

See `references/prompt-template.md` for the full skeleton.

### 7. Inspect the result, then either deliver or regenerate

Call `get_asset` on the generated image. Check, in order:
1. **Product label fidelity** — is the brand name spelled correctly on the pack? Are the colors and proportions intact?
2. **Logo fidelity** — gradient, wordmark, no distortion.
3. **Claim copy** — does every visible text block match exactly what you specified? No hallucinated extras?
4. **Layout** — are the zones where you put them?

If product or logo is mangled: regenerate with stronger preservation language in the HARD CONSTRAINTS block, or switch to gpt-image-2 if you were on nano-banana-2.
If claim text is garbled or hallucinated: regenerate with shorter claim strings, or switch to gpt-image-2.
Stop after **two regeneration attempts**; if it's still wrong, surface the issue to the user and ask whether to simplify the layout.

### 8. Deliver

Register the result as an ad asset and link it to the user as a markdown asset reference. One image, one link. Do not generate variants unless the user asks.

## Hard rules / do-not-regress

1. **Never copy a claim verbatim from the reference without verifying it against the user's product.** This is the single most important rule. A "sugar-free" or "fragrance-free" badge on a SKU that does not qualify ships false advertising.
2. **One `generate_image` call per round.** No A/B grids, no "let me try three approaches", no variant explosions. Single-shot, inspect, regenerate only if broken.
3. **Inspect every uploaded asset before composing the prompt.** Don't guess what's in an attachment — call `get_asset` and look.
4. **Product image is `image_urls[0]`**, always. Reference layout goes last. This ordering is what keeps the model from photorealistically rendering the *competitor's* pack.
5. **Keep the reference's palette unless the user explicitly asks to rebrand the colors.** "Using this reference" means emulate, not over-interpret. Don't recolor the background to the user's brand palette unless asked.
6. **Re-flow, don't crop, on aspect-ratio overrides.** If the user asks for 1:1 and the reference is 9:16, redistribute the zones into the square — don't just describe the 9:16 layout and hope the model crops sensibly.
7. **No extra graphics, badges, or claims beyond what the reference contained (after swap).** Producers tend to "improve" the reference by adding stars, "NEW!" flashes, etc. Don't.
8. **If the user provided lifestyle or unrelated imagery, ignore it unless the reference layout calls for an inset lifestyle frame.** Extra assets are not invitations to use them.

## What this skill is NOT

- Not a video skill. Hand off to the video producer skills if motion is needed.
- Not a brand-system / multi-asset skill. One reference in, one ad out.
- Not a copywriter. You use the user's existing product copy / pack text for claims; you don't invent new benefit claims.