# Prompt recipe

This is the template structure for every `generate_image` call. Fill the bracketed slots; keep everything else verbatim.

## Vertical card (9:16, 2K)

```
A premium Google Play Store screenshot promo card, vertical 9:16.

BACKGROUND: solid [PRIMARY_HEX] fill with a soft circular radial glow centered
behind the phone (the glow is roughly 15% lighter than the base). No gradients
across the full frame, no textures, no patterns.

PHONE: a single Android Pixel-style device, centered horizontally, sitting in
the lower-middle of the frame, with a slight ~5° Y-axis tilt and a realistic
soft drop shadow. Thin dark bezels. No hand. The phone screen shows the
provided source screenshot, full-bleed inside the device frame, pixel-accurate.

ON-SCREEN UI TEXT (must be preserved verbatim, character-for-character, no
paraphrase, no translation):
- [exact string 1, e.g. a screen title]
- [exact string 2, e.g. a primary button label]
- [exact string 3, e.g. a list item or field value]
- [...one bullet per visible string that matters]

HEADLINE (above the phone, top ~12% of frame): two lines, white, bold geometric
sans-serif, centered.
Line 1: "[HEADLINE_LINE_1]"
Line 2: "[HEADLINE_LINE_2]"
All [LANGUAGE] words must be spelled correctly with proper diacritics.

DIVIDER: a thin horizontal line in [SECONDARY_HEX], roughly 60px wide,
centered directly beneath the headline.

ACCENTS: minimal [SECONDARY_HEX] accents — 3 to 5 small dots and one thin
short diagonal line, tucked into one corner area or beside the phone. No
border. No frame. Single accent cluster only.

NEGATIVE SPACE: at least 25% of the frame must remain empty primary color.

NO bullet lists, NO feature names, NO URLs, NO Google Play badges, NO star
ratings, NO "Available now," NO additional copy of any kind outside the
headline.

CRITICAL: DO NOT redraw, retype, or alter ANY text on the phone screen — it
must look pixel-identical to the source UI provided in image_urls.
```

Call params:
```
generate_image(
  prompt=<above>,
  model="gpt-image-2.5-sunburst",
  aspect_ratio="9:16",
  resolution="2K",
  image_urls=["input:image-N"],   # the matching screenshot
)
```

## Feature graphic (generate at 16:9, post-process to 1024×500)

```
A premium Google Play feature graphic, wide 16:9.

LEFT HALF (≈50%): the provided brand logo at the top-left third, plus one
single tagline line beneath it in white bold sans-serif: "[TAGLINE]". Nothing
else on the left half. If the logo's figurative wordmark elements are dark,
render them in PURE WHITE for contrast on the dark background, but KEEP
[any brand-secondary-colored sub-element, e.g. "the icon mark"] in the
brand-secondary color [SECONDARY_HEX].

RIGHT HALF (≈50%): two Android Pixel-style phones, overlapping, the back phone
partially occluded by the front phone (~30% overlap). Both phones extend
slightly past the bottom edge of the frame. Slight 3D tilt. Realistic shadows.
- Front phone screen: [exact source screenshot description, e.g. "the main
  dashboard / list screen"]
- Back phone screen: [exact source screenshot description, e.g. "the primary
  action / confirm screen"]

BACKGROUND: solid [PRIMARY_HEX] with a soft radial glow behind the phone
cluster.

ON-SCREEN UI TEXT for both phones (preserve verbatim):
- [front phone strings...]
- [back phone strings...]

NO additional copy beyond the tagline. NO store badges. NO ratings.

CRITICAL: DO NOT redraw, retype, or alter ANY text on either phone screen —
must look pixel-identical to the sources provided in image_urls.
```

Call params:
```
generate_image(
  prompt=<above>,
  model="gpt-image-2.5-sunburst",
  aspect_ratio="16:9",
  resolution="2K",
  image_urls=["input:logo", "input:front-screenshot", "input:back-screenshot"],
)
```

Then post-process to 1024×500 (see `post_process.md`) and `register_asset` the result.

## Filling the brackets

- `[PRIMARY_HEX]` / `[SECONDARY_HEX]` — from the user's brand colors. Prefer a dark primary.
- `[HEADLINE_LINE_1]` / `[HEADLINE_LINE_2]` — see `headline_library.md`, swap subject for the actual app verb.
- `[LANGUAGE]` — match the screenshots' UI language exactly.
- `[TAGLINE]` — one noun phrase, no imperative verb.
- On-screen UI text bullets — populated *after* inspecting each screenshot with `get_asset`. Never guessed.
