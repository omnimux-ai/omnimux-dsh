# Spillage rules

The spillage at the base of the pedestal is the second-most-important element in this pattern (after the packaging itself). Get it wrong and the image looks staged or, worse, lies about what is in the bag.

## The shape of a good spillage

- **2–3 loose clusters** of 8–15 pieces each, plus 3–6 stragglers further out.
- Asymmetric: heavier on one side of the pedestal than the other.
- Pieces touching the base of the wood disc, a few overlapping each other, none stacked vertically.
- One or two pieces in the foreground edge-of-frame to give depth.
- Total footprint: roughly 1.5–2× the diameter of the disc, spread sideways more than forward.

## The shape of a bad spillage (do not produce)

- A tidy ring around the pedestal.
- A neat little pile in front like a serving suggestion.
- A single straight line of pieces.
- Pieces evenly spaced like a pattern.
- Powder that looks poured from a bag (no implied human action — the spillage just *is*).

## Mapping product type → spillage description

| Product type | Spillage prose to use in prompt |
|---|---|
| Crispies / cereal puffs | "round tan-beige spherical crispies, matte surface, 6–8mm diameter, scattered in 2–3 loose clusters" |
| Granola / muesli | "irregular oat-cluster pieces with visible seeds and dried fruit, scattered loosely in 2–3 small groups" |
| Protein powder | "a small soft mound of fine cream-colored powder plus a light dusting trail, slight scoop indentation" |
| Capsules | "scattered oblong capsules of [exact color], some upright, some lying flat, in 2–3 small clusters" |
| Tablets | "round flat tablets of [exact color], scattered in 2–3 loose clusters, some face-up some on edge" |
| Whole nuts | "[nut name] in natural shells / blanched / roasted form, scattered in 2–3 clusters" |
| Dried fruit | "individual [fruit name] pieces, irregular shapes, scattered loosely" |
| Coffee beans | "whole roasted coffee beans, dark glossy surface, 2–3 loose clusters" |
| Tea leaves | "loose dried [tea variety] leaves, scattered in a thin natural drift" |
| Liquid | NO spillage — replace with a single small glass tumbler placed flat on the backdrop |

## Negative-content block (always include)

Whatever the correct spillage is, also name the wrong ones explicitly. Sample template:

```
NO <wrong-shape-1>, NO <wrong-shape-2>, NO <wrong-color> pieces, NO leaves, NO berries
unless they ARE the product. Only <correct-spillage-description>.
```

This is the single line that prevents reference-image content leak.
