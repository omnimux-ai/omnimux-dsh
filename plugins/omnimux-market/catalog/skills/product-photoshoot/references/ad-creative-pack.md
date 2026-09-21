# Mode: ad-creative-pack

A coordinated pack of static ad creatives from a single brief. Multiple variants engineered for paid-channel testing — different hooks, different offers, different aspect ratios — anchored in the same brand identity.

## Why ad creatives are their own genre

Performance ad creatives obey rules organic content does not:
- **Hook in 0.5 seconds** — first frame must stop the scroll
- **Multiple variants for testing** — performance marketing depends on A/B variation
- **Platform-specific aspect ratios** — IG Feed 4:5, IG Story 9:16, FB Feed 1:1, Pinterest 2:3
- **Higher saturation and contrast** than organic — needs to fight a busy feed

## Hook Angles (the heart of ad testing)

Every ad needs a different angle of attack. Use these as variant generators:

| Angle | Visual approach |
|---|---|
| `problem-solution` | Visualize the pain point or problem state |
| `transformation` | Show the desirable end state |
| `social-proof` | Show product with trust cues, lots of users implied |
| `curiosity-gap` | Intriguing visual that demands explanation |
| `lifestyle-aspiration` | Show the aspirational life the product enables |
| `feature-zoom` | Closeup on a specific differentiating feature |
| `comparison` | Side-by-side or before-after style |
| `urgency-scarcity` | Time-limited or limited-availability cue |
| `founder-story` | Personal, founder-led visual |
| `bold-statement` | Strong dramatic visual |
| `unboxing-reveal` | Anticipation and product reveal |
| `behind-scenes` | Process, manufacturing, raw authenticity |

## Platform Specifications

| Platform | Aspect ratio | Notes |
|---|---|---|
| Instagram Feed | `4:5` | Most important format |
| Instagram Story / Reels Cover | `9:16` | Full-screen vertical |
| Facebook Feed | `1:1` | Some legacy 1.91:1 |
| TikTok Feed | `9:16` | Native-feel content wins |
| Pinterest Promoted Pin | `2:3` | Same as organic pin |
| Google Performance Max (Square) | `1:1` | |
| Google Performance Max (Landscape) | `16:9` | |
| LinkedIn Sponsored | `1:1` | |

## Visual System (FIXED across the pack)

Lock specifications across all variants — different hooks, same brand DNA:

```
[VISUAL SYSTEM — applies across the pack]

Palette: {{2-3 dominant brand-aligned tones, with one HIGH-SATURATION accent for scroll-stopping}}
Surface/backdrop: {{specific texture or color used across variants}}
Lighting baseline: {{key direction and quality, can vary slightly per hook}}
Composition rule: {{rule of thirds with strong focal hierarchy}}
Style reference: {{descriptors extracted from 2-3 photographer rows — same descriptors across pack, never the names}}
Brand colors: {{from brand memory}}
```

## Per-variant Prompt Template

```
[VISUAL SYSTEM]
{{Locked specifications copied verbatim}}

[VARIANT {{N}}: {{Hook Angle}} — {{Aspect Ratio}}]

[HOOK VISUAL]
{{Specific visual that delivers the chosen hook angle}}.

[COMPOSITION]
{{Variant-specific framing}}, {{focal anchor placement using rule of thirds}}, strong eye-leading hierarchy.

[LIGHTING]
{{Lighting tuned to deliver the hook — dramatic for problem-solution, warm aspirational for lifestyle, clean clinical for feature-zoom}}.

[CONTRAST & SATURATION]
Higher saturation and contrast than organic content — must fight the feed. Bold tonal range, deep shadows, bright highlights.

[STYLE REFERENCE]
{{Locked style descriptors from visual system}}.

[QUALITY MARKERS]
Scroll-stopping, magazine-quality, hyper-detailed, performance-ad ready.

[AVOID]
{{universal + anti-stock-feel}}
no inconsistent palette across variants, no flat lighting, no synthetic stock look.
```

(Pass aspect ratio via the `aspect_ratio` parameter and `resolution="2K"` on the `generate_image` call — they are not part of the prompt body.)

## Typography handling

If user provided concrete ad copy/headline — see Case 1 in `references/typography.md` (integrate as part of the composition, and switch that variant to `model="gpt-image-2.5-sunburst"`).
If user said they'll add headline + CTA later in their ad manager — see Case 2 in `references/typography.md` (leave one tonally calm area within the natural scene).
Otherwise — compose freely with strong focal hierarchy.

## Photographer references

Pick a consistent set across the pack — adjust slightly per hook:

- **DTC / lifestyle ads**: Linda Pugliese, Aubrie Pick, Bobby Doherty
- **Premium product ads**: Carl Kleiner, Aaron Tilley, Sølve Sundsbø
- **Beauty ads**: Sølve Sundsbø, Mert & Marcus, David Sims
- **Food / beverage ads**: Linda Pugliese, Christopher Testani, Aaron Tilley
- **Tech / SaaS ads**: Spencer Lowell, Aaron Tilley, Joe Pugliese
- **Fashion ads**: Mert & Marcus, Steven Meisel, Tim Walker
- **Bold direct-response ads**: Maciek Jasik, Charlie Engman, Bobby Doherty

## Saturation guidance

Performance ads need to be slightly louder than organic. In the prompt:
- "High saturation, vivid color, strong contrast — scroll-stopping in busy feed"
- "Bold tonal range — deep shadows and bright highlights"
- "Clean clear focal hierarchy — eye lands on subject in 0.5 seconds"

But not so loud it looks cheap:
- Avoid neon-tinted oversaturation
- Avoid HDR halos
- Avoid stock photo synthetic look

## Default Pack Specification

If user hasn't specified, default to a 5-variant pack:

1. **Variant 1**: `lifestyle-aspiration` hook, IG Feed (4:5)
2. **Variant 2**: `feature-zoom` hook, IG Feed (4:5)
3. **Variant 3**: `transformation` hook, IG Story (9:16)
4. **Variant 4**: `social-proof` hook, FB Feed (1:1)
5. **Variant 5**: `curiosity-gap` hook, IG Story (9:16)

Confirm or modify with the user before generating.

## Outline first, generate second

Before any generation, draft a 1-line summary per variant:

```
Variant 1: [Hook] — [What's shown] — [Aspect ratio]
Variant 2: …
```

Confirm with user. Adjust if needed. Then generate.

## Generation invocation (per variant)

Submit each variant as its own `generate_image` call with its own aspect ratio and `output_asset_id`:

```
generate_image(prompt="<variant 1>", output_asset_id="ad:v1", aspect_ratio="4:5", resolution="2K", model="nano-banana-2")
generate_image(prompt="<variant 2>", output_asset_id="ad:v2", aspect_ratio="4:5", resolution="2K", model="nano-banana-2")
generate_image(prompt="<variant 3>", output_asset_id="ad:v3", aspect_ratio="9:16", resolution="2K", model="nano-banana-2")
generate_image(prompt="<variant 4>", output_asset_id="ad:v4", aspect_ratio="1:1", resolution="2K", model="nano-banana-2")
generate_image(prompt="<variant 5>", output_asset_id="ad:v5", aspect_ratio="9:16", resolution="2K", model="nano-banana-2")
```

If a product reference is provided, discover or register its asset ID (`register_asset(url="https://...", asset_id="product:reference")` for an external URL) and attach it to every variant via `image_urls=["product:reference"]`. The product anchors visual consistency across hook angles.

## Quality gates

- [ ] All variants share visual system (palette, surface, references)
- [ ] Each variant delivers its assigned hook angle visually
- [ ] Saturation and contrast are ad-appropriate
- [ ] Brand colors integrated consistently
- [ ] Aspect ratios match the assigned platforms
- [ ] No AI artifacts or warped baked-in text
- [ ] Pack feels coordinated, not random
- [ ] Typography (if any) renders correctly per the three-case rule
- [ ] `generate_image` call set `resolution="2K"`
