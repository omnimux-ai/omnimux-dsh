# Reference-Ad Slot Vocabulary

Common slots that appear in static product-ad layouts, and how to describe each one in prose so the image model places it correctly. Use these as building blocks when you decompose a reference image into slots.

## Top-band slots

- **Headline band.** Top ~⅓ of frame. Usually centered, sometimes left-aligned. Bold sans-serif. Describe color (dark on light, white on dark) and alignment. Pair with a TEXT OVERLAYS entry.
- **Eyebrow / kicker.** Small line above the headline. Often a category tag ("New", "Limited Edition"). Drop unless the reference has one.
- **Brand wordmark, top-corner.** Some references float the wordmark in a corner. If the product hero already shows the wordmark on-pack, this is usually redundant — skip unless the reference layout requires it for balance.

## Hero-cluster slots

- **Hero product, right.** Pack standing upright or slightly angled, soft contact shadow on the surface, hero light from upper left. Always name the silhouette explicitly.
- **Hero product, center.** Used when the reference is symmetrical. Then secondary visuals go behind or float around the product.
- **Action shot, left.** The "pour", "scoop", "stir", "slice" — whatever shows the product being used. Specify physics: single stream, soft cloud, gentle ripple. Specify anatomy: hand only, fingers and wrist, correct count.
- **Glass / bowl / plate receiver.** The vessel receiving the action. Describe shape (rocks glass, tall tumbler, ceramic bowl) and contents (water, milk, oat milk — match the product category).
- **Ingredient halo.** Some references float raw ingredients (berries, leaves, beans) around the hero. Only include if the reference does.

## Trust-band slots (between hero and bottom)

- **Rating row.** Stars + count + trust line. **Omit by default per user preference.** Replace with negative space and tighten the chip rail upward.
- **Press / certification badges.** Logo row ("As seen in…", organic certs). Only include if the user provided real ones; never fabricate.
- **Single trust line.** A non-numeric phrase ("Premium Quality", "Trusted by chefs"). Acceptable substitute when the reference had a rating row but no real data exists.

## Bottom-band slots

- **Benefit chips / pill rail.** Three short pill-shaped claims on a cream or neutral bar. ≤3 words per chip. Pair each with a TEXT OVERLAYS entry. This is the most common bottom-band pattern.
- **CTA button.** Some references end in a rounded rectangle CTA ("Shop now", "Get yours"). Bake the text verbatim and describe button color + shape.
- **Fine print / disclaimer.** Tiny legal-style text. Usually skippable for layout-mirror ads unless the user supplies specific legal copy.

## Background slots

- **Surface plane.** Kitchen counter (marble, wood, concrete), studio sweep (white seamless, cream paper), lifestyle table. Name the material.
- **Backdrop / depth.** Soft-focus kitchen, gradient, plain wash. Specify depth-of-field intent: "shallow depth, background reads as soft warm light."
- **Light direction.** Almost always "soft natural light from upper left" for the kitchen/lifestyle look. Hard rim light for premium/dramatic looks.

## How to use this list

When parsing a reference, scan top-to-bottom and tick which slots are present. Your layout-prose block should mention each present slot in spatial order and explicitly skip absent ones — don't pad with slots the reference didn't have.
