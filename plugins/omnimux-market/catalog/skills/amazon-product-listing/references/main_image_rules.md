# Main Image Rules

Main image is what customers see in Amazon search results. Amazon automatically suppresses listings (hides them from search) when main image rules are violated. These rules are NON-NEGOTIABLE.

## Mandatory requirements

| Rule | Specification |
|------|--------------| 
| Background | Pure white, RGB(255, 255, 255) — no exceptions |
| Product frame fill | ≥85% of the image area |
| Composition | Product fully centered |
| Ratio | 1:1 (square) |
| Minimum size | 1000 × 1000 px |
| Recommended size | 1600 × 1600 px (best zoom experience) |
| Content | Only the actual product (what the customer receives) |
| Lighting | Clear, even, diffused — no harsh or cluttered shadows |
| Angle | 45 degrees recommended (shows volume and depth) |

**Natural product shadow directly under the product is acceptable.** Background must remain pure white.

## Absolutely prohibited on the main image

### Graphics and text
- Any text, labels, or descriptions
- Brand logos (except those physically printed on the product itself)
- Watermarks
- Borders, frames, or color blocks
- Decorative graphics or illustrations
- Icons or infographic elements

### Fake badges (instant Suppressed Listing)
- "Amazon's Choice"
- "Prime"
- "Bestseller"
- "Sale" / "Discount" / "Offer"
- "New" / "New Arrival"
- "Free Shipping"
- Any star ratings or review badges

### Props and extras
- Accessories NOT included in the package
- Packaging boxes (unless the packaging IS the product, like gift boxes)
- Food/drinks staged next to the product (e.g., a cup of coffee next to a coffee maker that doesn't include the cup)
- Hands or partial body parts holding the product
- Any decorative objects

### Content restrictions
- Multiple angles of the same product in one frame (collage format)
- Illustrations, cartoons, or non-photographic rendering
- Review screenshots
- Seller contact info (email, phone, website, URLs)
- Price tags or currency symbols
- Misleading accessories or packaging

### 3D renders — nuance

Amazon's official rule says "real photos only, no renders". In practice, hyperrealistic 3D renders pass moderation. Rule of thumb:
- If the render looks indistinguishable from a photograph → acceptable
- If the render looks illustrated, cartoonish, or obviously CGI → will be removed

When generating with `model="nano-banana-2"`, always include "photorealistic", "looks like a real product photograph", "studio product photography" in the prompt to avoid the render-like look.

## Apparel-specific rules

- **Live models** or **invisible mannequin** (ghost mannequin / flat lay) allowed
- **Traditional mannequins are PROHIBITED**
- Model must be **standing** — not sitting, lying, or leaning
- Model's head may be cropped if the focus is on the garment
- No other people or distracting elements in the frame

## Product composition rules

- Show **exactly what the customer will receive**:
  - 1-piece product → show 1 piece
  - 3-piece set → show all 3 pieces arranged neatly
  - Bundle with accessories → show the full bundle
- Single primary angle only — typically 45° angle works best to show the product's depth and main features
- No collages, no multiple angles stitched together

## Category-specific main image guidance

| Category | Main image tip |
|----------|---------------|
| Beverages (bottles, cans) | Label-forward, slight 3/4 angle, condensation droplets optional but keep natural |
| Food packaged goods | Front of package visible, product standing upright |
| Skincare / cosmetics | Packaging with clear label, cap on, minimal shadow |
| Electronics | Front view or 45° angle showing main interface |
| Apparel | Flat lay OR model OR invisible mannequin (never traditional mannequin) |
| Shoes | Side profile or 3/4 angle, single shoe or pair |
| Home goods | Product at natural upright position |
| Books | Cover front, perfectly rectangular, no perspective distortion |

## Self-check before generating main image prompt

- [ ] Is pure white background RGB 255,255,255 explicitly stated?
- [ ] Is 85% frame fill mentioned?
- [ ] Is 45° angle specified?
- [ ] Are ALL prohibited items in the negative part of the prompt?
- [ ] Is "photorealistic, product photography" included?
- [ ] For apparel: is model standing / invisible mannequin / flat lay specified?
- [ ] Is the product reference asset ID passed in `image_urls`?
