# Model Selection & Image Reference Guide

## Model assignment by image type

| Image | Type | Recommended Model | Notes |
|-------|------|-------------------|-------|
| 1 — Hero | Graphic / design-heavy | gpt-image-2 | Dark bg, UI layout, icon grid |
| 2 — Antes/Después | Graphic / split-screen | gpt-image-2 | Checklist layout, color zones |
| 3 — Beneficios / Manos | Photorealistic lifestyle | nano-banana-2 | Real hands holding product |
| 4 — Ingredientes | Graphic + macro photo circles | gpt-image-2 | Realistic ingredient textures |
| 5 — Comparación | Infographic / design | gpt-image-2 | 3-column table layout |
| 6 — Doctor | Photorealistic person | nano-banana-2 | Doctor holding large product box |
| 7 — Testimonio | Photorealistic person | nano-banana-2 | Relatable local person, holding product |
| 8 — Prueba Social | Graphic / design | gpt-image-2 | Big number, face circles, review cards |
| 9 — Ofertas | Graphic / design | gpt-image-2 | 3-column pricing cards |
| 10 — FAQs | Graphic / design | gpt-image-2 | 5 visible Q&A blocks |
| 11 — Cierre CTA | Graphic / design | gpt-image-2 | Badges + logos + CTA button |

## Resolution & aspect ratio
- Always: **1024×1792** (1K, 9:16 vertical)
- Never use square or landscape for this funnel

## Passing product references

When generating images that must show the correct product box:
- Pass the **vertical product box image** as `image_urls` reference input
- Label it in the prompt: "Use the product box shown in the reference image — it is a tall vertical box with [description]"

When generating images that show capsules/pills:
- Pass the **capsule reference image** as `image_urls`
- Describe: "2 oval soft gelatin capsules, translucent, as shown in reference"

**Never assume the model will recall the correct packaging** — always pass the reference image.

## Prompt construction pattern

```
[Scene description in Spanish or English]

Product reference: [vertical box description] — use the reference image provided.
People: relatable local persona, [age range], [expression], [lighting].
Hold the product LARGE and prominent — the box/capsules should be clearly visible.

Background: [#hex or description].
Text overlay (if any): [exact Spanish text, font style].
No logos, no text unless specified.
Resolution: 1024x1792. Style: photorealistic / graphic design.
```
