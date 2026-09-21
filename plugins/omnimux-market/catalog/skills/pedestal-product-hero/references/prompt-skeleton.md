# Prompt skeleton for `generate_image`

Use this as the starting point for every pedestal-hero generation. Fill in the bracketed slots from the product you're shooting.

## Inputs

- `image_urls`: **only the hero product image**. Do NOT include the reference layout image even if the user provided one — describe the layout in prose below instead.
- `model`:
  - `nano-banana-2` if no baked-in headline.
  - `gpt-image-2.5-sunburst` if a headline is baked in (mandatory for non-English diacritics).
- `aspect_ratio`: `1:1` (default), `4:5`, or `9:16` per brief.

## Prompt template

```
Editorial product hero still-life, single composed shot.

SUBJECT: The product shown in the attached image — [one-sentence description of the
packaging: bag/jar/box, dominant label colors, key wordmark]. Stand it upright, label
squared to camera, centered.

COMPOSITION:
- Warm beige seamless paper backdrop. Slightly lighter and warmer on the right (key
  side), slightly deeper warm tone on the left (shadow side). Not white, not grey.
- A round pale-maple wood pedestal disc, approximately 3-4cm tall, smooth straight
  edge, faint end-grain visible on the top surface. Diameter slightly wider than the
  product's footprint.
- The product stands centered on the disc, occupying the lower-middle of the frame.
- Camera ~50mm equivalent, slight high eye-line (5-10 degrees down on the product),
  perpendicular to the front label.

SPILLAGE AT BASE:
- A small natural distribution of the product's own contents scattered on the backdrop
  at the base of the pedestal.
- 2-3 loose asymmetric clusters of 8-15 pieces each, plus a few stragglers further
  out. Heavier on one side than the other. Some pieces touching the disc.
- Exactly: [concrete-spillage-description from references/spillage-rules.md, e.g.
  "round tan-beige spherical crispies, matte surface, ~6-8mm diameter"].

NEGATIVE CONTENT (must not appear):
- NO [wrong-shape-1, e.g. dark brown cubes], NO [wrong-shape-2, e.g. chocolate
  squares], NO [wrong-shape-3, e.g. berries], NO leaves, NO props, NO spoons, NO
  fabric, NO bowls, NO additional product variants.
- NO people, NO hands.
- NO composited brand wordmarks added on top of the packaging.
- NO star ratings, NO callout pills, NO ribbons, NO badges, NO percentage discs, NO
  "NEW" / "BIO" / discount flashes, NO price text.
- NO floor line, NO wall line, NO horizon — the backdrop is seamless.

LIGHTING:
- Single soft warm key from upper right.
- Mild warm fill from lower left.
- Long, soft, feathered diagonal cast shadow falling from the pedestal toward the
  lower left of the frame. No crisp shadow edges, no specular hotspots, no rim light.

MOOD: editorial, minimalist, premium, calm. Scandi-European e-commerce hero. Dry,
quiet, confident.

[IF HEADLINE — drop in the TEXT OVERLAYS block from references/headline-styling.md.
 IF NO HEADLINE — write the line below:]
NO TEXT ANYWHERE in the image except what is already printed on the product's own
packaging.
```

## After generation

- QA the spillage first — if you see anything that doesn't match the product's own
  contents, regenerate with a stricter negative-content block.
- QA the headline (if any) — check diacritics, line break position, color, that no
  subline crept in.
- Do not post-process to "add a CTA" or "add a star row". Those regressions are
  hard-ruled in SKILL.md.
