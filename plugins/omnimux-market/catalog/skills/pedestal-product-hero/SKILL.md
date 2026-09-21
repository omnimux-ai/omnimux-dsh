# Pedestal Product Hero — Image Ad

A creative mold for a single packaged product photographed as if for a high-end editorial e-commerce hero. The subject (product) is always swappable. Composition, lighting, spillage, palette and headline styling stay locked.

## When to use this pattern

Use when:
- The deliverable is a **single still image** (1:1, 4:5 or 9:16), not a video.
- The product is **packaged** with its own printed front label — bag, pouch, jar, tub, box, bottle. The packaging is the typography; do not composite a separate brand mark.
- The brief calls for an **editorial / minimalist / Scandi** look — clean, warm, quiet, premium.
- The user wants either no headline, or **one short headline** baked in. Never more.

Do NOT use when:
- The brief asks for lifestyle / in-use / hands-in-frame / kitchen-scene imagery.
- Multiple SKUs need to share a frame (this pattern is one product, centered).
- The brand language is loud / promotional / discount-driven (price flashes, "SALE", star rows, ribbon callouts). This mold is the opposite of that.

## The creative move (one sentence)

A pale-wood disc lifts the product an inch off a warm beige seamless paper backdrop, the product's own contents are dusted in small natural clusters at the base of the disc, and a long soft warm shadow stretches sideways — the packaging is allowed to speak, the spillage proves what is inside, the pedestal grants it status.

## Composition spec (locked)

- **Backdrop**: warm beige seamless paper, slightly warmer/lighter on the key side, deeper warm tone on the shadow side. Not pure white. Not grey. Reference hex feel: `#E8DCC6` light side → `#C9B79A` shadow side.
- **Pedestal**: a round disc of **pale maple / birch wood**, roughly 3–4 cm tall, smooth straight edge, faintly visible end-grain on the top surface. Diameter ≈ slightly wider than the product's footprint so the product reads as "placed on" not "balanced on". No tiered stacks, no marble, no concrete.
- **Subject placement**: product stands upright, **centered on the disc**, front label squared to camera (perpendicular to lens axis), occupying the lower-middle of the frame.
- **Spillage at base**: a small natural distribution of the **product's actual contents** on the backdrop around the pedestal base. 2–3 loose clusters of 8–15 pieces each, plus a few stragglers. Organic, never symmetric, never a tidy ring. Only the actual product (granola = granola, crispies = crispies, powder = a small mound + a dusting, capsules = scattered capsules, etc.). See `references/spillage-rules.md`.
- **Lighting**: single soft warm key from **upper right**, mild warm fill from below-left. Long soft diagonal **cast shadow falling to the lower left** of the pedestal — feathered, not crisp. No rim light, no specular hotspots.
- **Camera**: slight high eye-line on the product (≈ 5–10° down), straight-on to the label, ~50mm equivalent — flatter than a wide lens, not telephoto-compressed.
- **No extras**: no props (no leaves, no spoons, no fabric), no floor line/wall line visible, no other SKUs, no brand wordmarks added, no callout pills, no star-rating rows, no ribbons, no price flashes.

## Headline policy

Default: **no on-image text**. The packaging does the talking.

If the user requests one short headline:
- Exactly one headline. No subline. No CTA text. No badges.
- **Position**: upper third of the frame (product sits lower-middle, so the upper third is empty backdrop).
- **Type**: modern serif, medium weight, slightly open letter-spacing, **two natural lines** broken at a phrase boundary (not mid-word).
- **Color** on warm beige: dark warm brown around `#3B2A1F`. Never black, never white, never colored brand-accent.
- **No drop shadow, no outline, no box, no underline.** The beige-vs-brown contrast is enough.
- Length: ≤ 8 words total. Non-English diacritics (e.g. ä ö ü ß, é è ñ) must render cleanly — see Model selection below.

See `references/headline-styling.md` for sample phrasings and the exact baked-in-text block to drop into the prompt.

## Visual style anchors

- Cinematic, not UGC.
- Palette: warm neutrals (beige, oat, soft cream) + the product packaging's own colors. No external accent color introduced.
- Surface mood: dry, calm, quiet. Slight matte sheen on the wood disc, no wet/glossy highlights.
- Shot type: a single composed still. No collage, no split-screen, no inset.

## Voice & persona

The image itself has a persona — even though no human appears: **the calm, confident product clerk** who lays one thing on the counter and steps back. Premium without shouting. If a headline is included, voice it the same way: declarative, short, no exclamation marks, no hype words ("best ever", "amazing"). For formal-address languages, match the buyer-address formality only if the brand's own packaging does; otherwise use neutral noun phrases.

## CTA mechanic

There is no on-image CTA in this pattern. The product's own packaging and the headline (if any) carry the message; the platform's native buy/link affordance is the CTA. If the user insists on a CTA, refuse the on-image route and suggest a paired caption instead — adding a CTA pill regresses the look.

## Model selection (decision rule — IMPORTANT)

This is the single highest-leverage decision in the workflow. Pick based on whether text must render in the image:

- **No baked-in headline → `nano-banana-2`.** Best product fidelity, preserves packaging detail, label typography stays sharp.
- **Baked-in headline (especially any non-English diacritics) → `gpt-image-2.5-sunburst`.** Renders typography much more reliably. `nano-banana-2` frequently garbles diacritics (ä, ö, ü, ß, é, ñ, etc.) and breaks lines wrong.

Do not try to force `nano-banana-2` to bake non-English typography "to keep fidelity" — the headline will come back wrong and you will burn a second generation anyway.

## Reference-leak avoidance (the #1 failure mode — read this)

When the user supplies a reference layout image **and** the hero product image, the natural instinct is to pass both into `image_urls`. **Don't.** The model leaks unrelated content from the reference image into the output — most commonly, the reference's *product contents* appear at the base of *your* product's pedestal (for example, dark cube-shaped pieces from the reference get spilled around a powder bag that should only have a fine dusting).

Rules:
1. Pass **only the hero product** to `image_urls`. Describe the pedestal composition, backdrop, lighting and spillage in **prose** in the prompt.
2. Always include a **negative-content block** in the prompt naming the specific things that must NOT appear in the spillage. Be concrete — name shapes, colors, foods. Example: `NO dark brown cubes, NO chocolate squares, NO dice-shaped pieces, NO berries, NO powders, NO leaves — only round tan-beige spherical crispies matching the product's actual contents`.
3. If the user *insists* both images go in `image_urls`, the negative-content block becomes mandatory and must be stricter.

## Spillage-content rule

The spillage at the base of the pedestal MUST be the product's own contents. Read the product description / ingredients / a visible window in the packaging before generating, and describe the spillage in those exact terms:

- Crispies / cereal pieces → round tan-beige spherical crispies, matte surface.
- Powder → a small soft mound + a light dusting, slight scoop trail.
- Capsules / tablets → scattered capsules of the exact color and shape on the label.
- Whole foods (nuts, berries) → name the food and its color.
- Liquid product → no spillage; instead, a single accompanying glass/bowl element placed flat on the backdrop (rare exception).

If you do not know the product's contents, **ask the user** rather than guessing — guessing causes the leak failure mode above.

## Aspect ratios

- `1:1` — default e-commerce / marketplace hero. Headline optional, usually omitted.
- `4:5` — feed-native portrait. Headline optional.
- `9:16` — story / reels still. Headline almost always wanted; route through `gpt-image-2.5-sunburst`.

Vertical formats: keep the pedestal in the lower third, headline in the upper third, generous breathing space between them. Do not enlarge the product to fill vertical space — the empty backdrop is the look.

## Prompt skeleton

A concrete fill-in-the-blanks prompt skeleton lives in `references/prompt-skeleton.md`. Use it as the starting point for every generation in this pattern.

## Hard rules (do-not-regress)

1. **No star-rating rows** on the image. Ever. Even if the brand has great reviews.
2. **No composited brand wordmarks** added on top of the packaging. The packaging's own printed brand is the only brand mark.
3. **No callout pills, ribbons, badges, price flashes, "NEW", "BIO", percentage discs.**
4. **Spillage matches contents** — never leak content shapes/colors from a reference image.
5. **One headline maximum**, or none. No subline, no CTA text on image.
6. **Non-English typography → `gpt-image-2.5-sunburst`.** Do not try to bake non-English diacritics with `nano-banana-2`.
7. **Reference image stays out of `image_urls` once the layout is internalized** — describe it in prose, pass only the hero product.
8. **No people, no hands, no in-use scenes.** Pure still-life only.
9. **Headline color is dark warm brown on the warm beige backdrop** — never black, never white, never brand-accent.
10. **The empty backdrop is the look.** Resist the urge to fill negative space with props.