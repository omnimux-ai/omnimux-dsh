# `generate_image` prompt skeleton

Use this as a fill-in template for the single image-generation call. Three labelled blocks, in this exact order. Be spatially explicit. Quote claim text in the exact wording you want rendered.

```
LAYOUT
A {ASPECT_RATIO} static product ad.
- Top-left: {BRAND_LOGO_DESCRIPTION} at ~{SIZE}% of canvas width.
- Top-right: {DECORATIVE_MOTIF, e.g. "small hand-drawn sun in mustard yellow"}, with the headline "{HEADLINE_TEXT}" in {FONT_FEEL} immediately below, and the subhead "{SUBHEAD_TEXT}" in a smaller weight underneath.
- Center: the product, {PRODUCT_DESCRIPTION}, resting on {PEDESTAL_OR_GROUND_DESCRIPTION}, photoreal, sharp focus, soft top-light.
- Right side, vertical stack of {N} rounded pill badges in {BADGE_COLOR} with {TEXT_COLOR} text, evenly spaced:
    1. "{CLAIM_1}"
    2. "{CLAIM_2}"
    3. "{CLAIM_3}"
- Bottom-center: a single-line footer "{FOOTER_TEXT}" in small {FONT_FEEL}, {FOOTER_COLOR}.

STYLE
Flat illustrated background in {PRIMARY_COLOR} (#{HEX}), with accents in {SECONDARY_COLOR} (#{HEX}) and {TERTIARY_COLOR} (#{HEX}). The product itself is rendered photorealistically — do not flatten or illustrate it. Typography: {FONT_FEEL, e.g. "rounded geometric sans, friendly weight"}. Mood: {MOOD, e.g. "optimistic, clean, energetic"}. Generous negative space around the product. No textures, no gradients on the background — flat color only.

HARD CONSTRAINTS
- Preserve the product packaging exactly as shown in the primary reference: same label artwork, same brand marks, same colors, same proportions, same {SPECIFIC_PACK_FEATURE, e.g. "colored band at the bottom of the package"}.
- Do NOT alter the product's printed label text or brand logo colors.
- Do NOT add extra text, claims, badges, or graphics beyond what is listed in LAYOUT.
- Do NOT include any text from the reference image; only the text strings I have quoted above should appear.
- Keep the {PALETTE_COLOR} background; do not recolor to the brand's primary palette.
```

## Call parameters

```
model: gpt-image-2.5-sunburst          # default for ≥3 text blocks; switch to nano-banana-2 only if pure product-fidelity case
aspect_ratio: <user override or reference native>
resolution: 2K
image_urls:
  - <product pack shot, primary>
  - <brand logo>
  - <reference layout>
prompt: <the three-block string above, all placeholders filled>
```

## Anti-drift phrases that actually work

These phrases empirically reduce specific failure modes — include them when relevant:

- **Product label drift:** "Preserve the product's printed label exactly as in the primary reference image; do not re-letter, re-spell, or re-color any text on the package."
- **Logo gradient drift:** "Preserve the brand logo's gradient direction and color stops exactly as in the second reference image."
- **Hallucinated extra text:** "The ONLY text in the final image is: {LIST EVERY STRING EXPLICITLY}. No other words, letters, or numbers appear anywhere."
- **Background recoloring drift:** "The background color is {COLOR}, the same as in the third reference image. Do not change it."
- **Badge count drift:** "There are exactly {N} pill badges, no more and no fewer."

## Anti-patterns in prompting

- Don't paste the reference's text wholesale into the prompt — write out only the claims you've verified.
- Don't use vague style words ("modern", "clean", "professional") — they don't constrain anything.
- Don't ask for "options" or "variants" — one image per call.
- Don't describe the product with subjective adjectives ("delicious", "premium") — describe it visually (shape, color, label).
