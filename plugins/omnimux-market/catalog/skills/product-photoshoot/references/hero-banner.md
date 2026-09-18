# Mode: hero-banner

Wide-format banner images for website headers, landing pages, email campaigns, and section dividers. Cinematic composition, strong focal anchor, brand-aligned mood.

## Why hero banners are their own genre

A hero banner must:
- Have a strong focal anchor and clear visual hierarchy
- Survive being cropped — works at multiple aspect ratios
- Convey brand mood in under one second
- Feel cinematic and editorial, not generic stock

## Banner Presets

| Preset | Use for | Visual signature |
|---|---|---|
| `cinematic-product-hero` | Premium product launches, DTC homepages | Wide composition with dramatic atmosphere, product as focal anchor |
| `lifestyle-environmental` | Brand identity heroes, lookbook covers | Wide lifestyle scene with strong story cue |
| `editorial-portrait` | Personal brand, founder stories, fashion | Subject in cinematic editorial context |
| `abstract-brand-mood` | Color-led brand banners, no product visible | Atmospheric texture, gradient, light play, pure mood |
| `studio-product-wide` | E-commerce category banners, sale headers | Product centered or grouped, premium studio backdrop |
| `seasonal-campaign` | Holiday, seasonal launches | Themed environment with strong narrative cue |
| `panoramic-landscape` | Travel, lifestyle, outdoor brands | Wide landscape with focal element, atmospheric depth |
| `split-composition` | Comparison heroes, dual-message headers | Left and right halves visually distinct |

## Prompt Template

```
[FORMAT]
Wide {{aspect ratio}} cinematic banner composition.

[FOCAL SUBJECT]
{{Product / scene / portrait}} positioned at {{specific placement using rule of thirds — left third / right third / centered offset}}, occupying {{rough percentage}} of frame width.

[COMPOSITION]
{{Strong horizontal flow, eye-leading lines, clear visual hierarchy}}. {{Foreground / midground / background separation for depth}}.

[ATMOSPHERE]
{{Cinematic mood — refined / energetic / calm / indulgent / fresh / dramatic}}. {{Air quality and depth cues}}.

[LIGHTING]
{{Dramatic key with strong direction / soft cinematic ambient / golden hour / studio with rim}}. Color temp {{Kelvin}}. {{Shadow behavior}}.

[LENS & CAMERA]
Shot on {{wide-angle 24mm / standard 35mm / portrait 50mm}}, aperture {{f-stop}}, {{deep DoF for environment / shallow for separation}}, anamorphic feel.

[COLOR PALETTE]
{{2-3 brand-aligned dominant tones}}. {{Warm or cool dominance}}. Rich tonal range.

[STYLE REFERENCE]
{{Descriptors extracted from 2-3 photographer rows in photographer-references.md — never the names}}. Cinematic editorial photography.

[QUALITY MARKERS]
Magazine-cover quality, ultra-sharp, wide cinematic depth, hyper-realistic.

[AVOID]
{{universal + anti-stock-feel}}
no symmetric framing if asymmetric requested, no flat lighting.
```

(Pass aspect ratio via the `aspect_ratio` parameter and `resolution="2K"` on the `generate_image` call — they are not part of the prompt body.)

## Typography handling

If user provided concrete text — see Case 1 in `references/typography.md`.
If user said they'll add text later — see Case 2 in `references/typography.md`.
Otherwise — let model compose freely for maximum visual richness.

## Photographer references

- **cinematic-product-hero**: Dan Tobin Smith, Hugh Kretschmer, Sølve Sundsbø
- **lifestyle-environmental**: Cass Bird, Jamie Hawkesworth, Annie Leibovitz
- **editorial-portrait**: Peter Lindbergh, Annie Leibovitz, Steven Meisel
- **abstract-brand-mood**: Wolfgang Tillmans, Aaron Tilley, Carl Kleiner
- **studio-product-wide**: Irving Penn, Carl Kleiner, Aaron Tilley
- **seasonal-campaign**: Tim Walker, Mert & Marcus, Steven Meisel
- **panoramic-landscape**: Sebastiao Salgado, Cass Bird, Lucas Foglia
- **split-composition**: Wolfgang Tillmans, Erwin Olaf, Tim Walker

## Aspect Ratio

| Use case | Ratio |
|---|---|
| Modern web hero (full-width) | `16:9` |
| Wide cinematic hero | `21:9` |
| Email header | `3:1` or `2:1` |
| LinkedIn cover (personal) | `4:1` |
| YouTube channel art | `16:9` |
| Twitter / X header | `3:1` |
| Section divider | `21:9` or `3:1` |

Default `16:9`.

## Composition rules

- Strong focal anchor at one of two strong vertical thirds, not dead center
- Lighting and lines lead the eye through the composition
- Foreground depth element adds richness (out-of-focus leaf, surface texture, fabric edge)
- Crop safety — keep critical subject inside the central safe zone for mobile
- Rich tonal range — banners should feel cinematic, not flat

## Lighting by brand tier

- **Premium / luxury**: hard rim light against deep shadow, single dominant source
- **Approachable / DTC**: soft window light, warm ambient, low contrast
- **Energetic / bold**: strong directional, saturated color, dramatic shadows
- **Calm / wellness**: diffused overcast, even tones, atmospheric haze
- **Editorial / fashion**: golden hour, anamorphic flare, cinematic depth

## Quality gates

- [ ] Wide aspect ratio appropriate for use case
- [ ] Strong focal anchor with clear visual hierarchy
- [ ] Lighting has clear direction and signals brand tier
- [ ] Color palette aligns with brand memory
- [ ] Composition leads eye through the frame
- [ ] Survives mobile crop (subject inside central safe zone)
- [ ] Atmosphere feels cinematic, not stock
- [ ] Typography (if any) renders correctly per the three-case rule
- [ ] `generate_image` call set `resolution="2K"`

## Generation invocation

```
generate_image(
  prompt="<assembled prompt>",
  output_asset_id="hero:main",
  aspect_ratio="16:9",
  resolution="2K",
  model="nano-banana-2"
)
```

For batch (testing different compositions — one `generate_image` call per variant, each with its own `output_asset_id`):

```
generate_image(prompt="<variant 1>", output_asset_id="hero:v1", aspect_ratio="16:9", resolution="2K", model="nano-banana-2")
generate_image(prompt="<variant 2>", output_asset_id="hero:v2", aspect_ratio="21:9", resolution="2K", model="nano-banana-2")
```

When the deliverable is on-image typography (Case 1 in `references/typography.md`), switch `model="gpt-image-2"`. If preserving a real uploaded product, add `image_urls=["product:reference"]` to each call.
