# Headline styling for baked-in text

Use this when (and only when) the user has asked for one headline on the image.

## Rules

- **One headline. No subline. No CTA. No badges.**
- Length: ≤ 8 words. Some languages run long; aim for ≤ 6 if you can.
- Two natural lines, broken at a phrase boundary (after a comma, conjunction, or natural caesura — never mid-word, never mid-noun-phrase).
- Position: upper third of frame, horizontally centered.
- Type: modern serif (think: a digital take on Lyon, Tiempos, or a soft Garamond), medium weight, ~3–4% positive letter-spacing.
- Color on warm beige: dark warm brown around `#3B2A1F`. Not black. Not white. Not brand-accent.
- No drop shadow. No outline. No box. No underline.

## Tone

Declarative, short, calm. No exclamation marks. No hype words ("best", "amazing", "incredible"). Quality / craft / function language, not promotion.

Good (English):
- "Made for the everyday."
- "One ingredient. Done well."
- "Quality, in the size you actually use."

Good (non-English example — invented, for a neutral product):
- "Pure quality. Nothing added."
- "In the size you actually use."
- "Made to a higher standard."

Bad (do not produce):
- "BUY NOW!" / "ON SALE!" / "50% OFF!"
- "The world's best <product> — try them today!"
- Anything with a star row, percentage flash, or "★★★★★".

## Prompt block (copy into the generate_image prompt)

```
TEXT OVERLAYS (bake into image):
- ONE headline, upper third, horizontally centered.
- Wording: "<exact-headline-text-with-explicit-line-break>"
- Line break exactly as shown above.
- Font: modern serif, medium weight, ~3-4% letter spacing.
- Color: dark warm brown #3B2A1F.
- No drop shadow. No outline. No box. No underline. No other text anywhere in the image.
- No subline, no CTA, no badges, no star rating, no price.
```

## Model

Always `gpt-image-2` when typography is baked in — especially for any non-English diacritics (ä ö ü ß, é è ñ, etc.). `nano-banana-2` will garble these reliably enough that it costs you a second generation.
