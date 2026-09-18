# Technical Specifications

Amazon enforces specific technical requirements on all uploaded images. Violations can cause upload rejections or degraded display quality.

## Size requirements

| Parameter | Specification |
|-----------|--------------|
| Minimum size | 1000 px on longest side |
| Recommended size | 1600 px on longest side |
| Maximum size | 10,000 px on longest side |
| Zoom feature | Requires ≥1000 px on longest side |
| Best zoom experience | 1600 px or larger on longest side |

This skill generates images using `aspect_ratio` + `resolution="2K"` parameters (never raw pixel dimensions). The 2K resolution easily satisfies Amazon's 1000px minimum for zoom and approaches the 1600px recommended size for best zoom quality.

## File format

| Format | Status | Best for |
|--------|--------|----------|
| JPEG (.jpg) | Preferred | All product photography |
| PNG (.png) | Allowed | Graphics with transparency, infographics |
| TIFF (.tif) | Allowed | Highest quality lossless, large files |
| GIF (.gif) | Allowed | Non-animated only |
| WebP | NOT ACCEPTED | Never upload |
| HEIC | NOT ACCEPTED | Never upload |
| SVG | NOT ACCEPTED | Never upload |

**Default recommendation:** JPEG for photos, PNG for images with text/graphics or transparency needs.

## Color profile

| Profile | Status |
|---------|--------|
| sRGB | Preferred, standard web color space |
| CMYK | Allowed but less common |
| Adobe RGB | Use only with explicit user request — may cause color shift |

Amazon converts non-sRGB images to sRGB automatically, which can shift colors unpredictably. Always deliver in sRGB unless the user specifies otherwise.

## Resolution

- Minimum: 72 DPI
- Amazon ignores DPI in favor of pixel dimensions — it's pixel count that matters, not DPI
- Higher DPI only helps if paired with larger pixel dimensions

## File size

- Typical: 1–3 MB per image
- Maximum: 10 MB per image (Amazon's upper limit)
- Optimize compression to balance quality and load time
- JPEG quality level 85–92 is the sweet spot (good quality, reasonable file size)

## Aspect ratio

| Ratio | Use case |
|-------|----------|
| 1:1 (square) | Preferred for all main and secondary images — optimal display on desktop AND mobile app |
| 3:2 | A+ middle content modules (Modules 2-6) |
| 21:9 | A+ Hero Banner (Module 1) and Brand Endorsement (Module 7) |

Square 1:1 is the safest format — it displays correctly everywhere without cropping.

## Filename conventions (for bulk upload via Excel)

If the user uploads via Seller Central's bulk Excel method, filenames must be:
```
[ASIN or UPC or EAN].[extension]
```

Example: `B000123456.jpg`

For regular single-upload through Seller Central UI, any filename works.

## Color accuracy rules

- **White balance must be neutral** — no blue, yellow, or green color casts
- **Product colors must match reality** — customers can't physically see it, so images are the entire color reference
- Test on calibrated monitor before finalizing
- For skincare/cosmetics: color accuracy is critical (customers return items when the actual shade differs)

## Shadow and lighting rules

- **Main image:** Minimal shadow. A soft natural shadow directly under the product is acceptable; no cast shadows across the background.
- **Secondary images:** Subtle shadows CAN add depth and realism — use them intentionally, not as errors.
- Avoid direct flash (creates harsh hotspots and hard shadow edges)
- Softbox / diffused lighting or soft daylight is ideal

## Output delivery for this skill

When generation completes:
1. Each `generate_image` call returns its result directly, written to the `output_asset_id` you specified — there is no job to poll and no URL to fetch.
2. Use a descriptive, stable `output_asset_id` per image so each deliverable is identifiable:
   - `main:final` for the main image
   - `secondary:[type]` for secondary images (e.g. `secondary:lifestyle`, `secondary:infographic`)
   - `aplus:[module-number]` for A+ modules (e.g. `aplus:1-hero`)
3. Present each image to the user as soon as its `generate_image` call returns.
4. Present one image at a time as it completes (do not batch). Use `get_asset` / `list_assets` only if you need to inspect a result asset inline.

## Image optimization tips (optional, for user education)

If the user asks "how do I prepare these for upload":
- Export JPEG at quality 85–92
- Strip EXIF metadata (Amazon strips it anyway)
- Use sRGB color profile
- No embedded color profile warning is needed
- Don't add watermarks — Amazon forbids them
