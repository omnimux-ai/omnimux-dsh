# Main Image Prompt Template

Use this template to build the prompt for the Amazon main image. The product reference supplied by the user goes in the `image_urls` array (referenced by its asset ID) — the prompt describes the scene + compliance requirements.

## Placeholders to fill

- `[PRODUCT_DESCRIPTION]` — short factual description of the product, e.g. "aluminum can of natural lemonade with peach and verbena flavor, brand 'lapochka'"
- `[PRODUCT_CATEGORY]` — e.g. "beverage can", "skincare bottle", "electronics device"
- `[APPAREL_MODE]` — ONLY for apparel. Choose: "on a live standing model", "on an invisible ghost mannequin", "flat lay top-down"

## Standard template (non-apparel)

```
Professional Amazon product photography of [PRODUCT_DESCRIPTION].

Composition:
- Product perfectly centered in a 1:1 square frame
- Product fills at least 85% of the frame
- Shot at 45-degree angle to show volume and depth
- Single product, single angle, no collage

Background:
- Pure white seamless background, RGB 255 255 255, no gradient, no texture
- Clean, studio-quality, infinite white sweep

Lighting:
- Soft, even, diffused lighting
- Minimal natural shadow directly under the product only
- No harsh cast shadows, no hotspots, no flash glare
- Accurate white balance, true product colors

Quality:
- Hyperrealistic, photorealistic product photography
- Sharp focus on the entire product
- Studio commercial photography quality
- High detail on labels, textures, and materials

Strict exclusions (must NOT appear in the image):
- NO text overlays, NO added labels, NO descriptions
- NO watermarks, NO borders, NO frames, NO color blocks
- NO decorative graphics, NO illustrations, NO icons
- NO badges such as "Amazon's Choice", "Prime", "Bestseller", "Sale", "New", "Free Shipping"
- NO star ratings, NO review elements
- NO props, NO accessories that are not part of the product
- NO packaging box unless the box IS the product
- NO hands, NO people, NO body parts
- NO price tags, NO currency symbols
- NO contact information
- NO multiple angles stitched together
- NO cartoon or illustrated style — photorealistic only

Preserve exactly the product design, label, colors, and proportions shown in the reference image.
```

## Apparel template

```
Professional Amazon product photography of [PRODUCT_DESCRIPTION], displayed [APPAREL_MODE].

If live model:
- Model standing upright, natural relaxed posture
- Model must NOT be sitting, lying, or leaning on anything
- Head framing optional — can crop above shoulders to focus on garment
- Neutral natural expression
- Model's pose shows the garment's fit without distortion

If invisible/ghost mannequin:
- Garment displayed as if worn but with no mannequin visible
- Clean cutout silhouette
- Shows natural drape and fit

If flat lay:
- Garment laid flat, photographed from directly above
- Smooth, not wrinkled
- Natural folds only for fit indication

Composition:
- Garment fills at least 85% of the 1:1 square frame
- Centered composition

Background:
- Pure white seamless background, RGB 255 255 255

Lighting:
- Soft, even, diffused lighting
- Natural color rendering of fabric
- Minimal shadow

Quality:
- Hyperrealistic photography
- Sharp focus showing fabric texture, stitching, and drape

Strict exclusions (must NOT appear):
- NO traditional mannequins
- NO text, NO logos (other than those physically on the garment)
- NO watermarks, NO borders, NO color blocks
- NO props, NO accessories not included with the product
- NO badges, NO price tags
- NO additional people or body parts beyond the primary model

Preserve exactly the garment design, color, and pattern shown in the reference image.
```

## Usage example (filled)

For an aluminum can of natural peach-verbena lemonade:

```
Professional Amazon product photography of an aluminum can of natural lemonade with peach and verbena flavor, brand 'lapochka', 330ml size.

Composition:
- Product perfectly centered in a 1:1 square frame
- Product fills at least 85% of the frame
- Shot at 45-degree angle to show volume and depth
- Single product, single angle, no collage

Background:
- Pure white seamless background, RGB 255 255 255, no gradient, no texture
- Clean, studio-quality, infinite white sweep

Lighting:
- Soft, even, diffused lighting
- Minimal natural shadow directly under the product only
- No harsh cast shadows, no hotspots, no flash glare
- Accurate white balance, true product colors

Quality:
- Hyperrealistic, photorealistic product photography
- Sharp focus on the entire product
- Studio commercial photography quality
- High detail on the can label, brand name, and finish

Strict exclusions (must NOT appear in the image):
- NO text overlays beyond what is physically printed on the can
- NO watermarks, NO borders, NO frames, NO color blocks
- NO decorative graphics, NO illustrations, NO icons
- NO badges such as "Amazon's Choice", "Prime", "Bestseller", "Sale", "New", "Free Shipping"
- NO fruit props, NO herbs, NO garnishes next to the can
- NO drinking glasses, NO ice cubes, NO condensation droplets
- NO hands, NO people, NO body parts
- NO price tags, NO currency symbols
- NO multiple angles or collage
- NO cartoon style — photorealistic only

Preserve exactly the can design, label typography, colors, and proportions from the reference image.
```

## Tool call

The main image is photoreal and must preserve the real product, so use `model="nano-banana-2"` with the product asset as the input reference. The product photo is referenced by its asset ID (e.g. `product:main`); if it only exists as an external URL, register it once with `register_asset` first and use the resulting asset ID. The call returns the result directly — no polling.

```
generate_image(
  prompt="[FILLED_PROMPT]",
  output_asset_id="main:final",
  aspect_ratio="1:1",
  resolution="2K",
  model="nano-banana-2",
  image_urls=["product:main"]
)
# → returns the result directly with output_asset_id "main:final"
```

`main:final` is the visual anchor for the whole set — confirm it exists before generating any downstream image, since every other image references it.

## Pre-flight self-check

Before sending:
- [ ] Product description is specific (brand, variant, packaging type)
- [ ] All 5 prompt sections present (Composition, Background, Lighting, Quality, Exclusions)
- [ ] No placeholders left unfilled
- [ ] For apparel: APPAREL_MODE is specified (model / invisible mannequin / flat lay)
- [ ] `image_urls` contains the product reference asset ID
- [ ] `model="nano-banana-2"` is set
- [ ] `aspect_ratio="1:1"` and `resolution="2K"` set (NOT width/height in pixels)
