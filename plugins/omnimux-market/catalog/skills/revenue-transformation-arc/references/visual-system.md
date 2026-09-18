# Visual System Reference

## Color Palette

| Token | Hex | Use |
|-------|-----|-----|
| `color-bg` | `#0d0d0d` | Background — charcoal, not black |
| `color-pain` | `#FF3B3B` | Pain state, before-numbers, problems |
| `color-money` | `#39FF14` | Results, after-numbers, CTAs |
| `color-caption` | `#FFFFFF` | All spoken captions, neutral text |
| `color-service` | `#FFD600` | Service pillars, action items |
| `color-magnitude` | `#00AAFF` | Scale stats, impressive counts |

## Typography Stack

| Role | Font | Weight | Size Range |
|------|------|--------|-----------|
| Impact word (hook number) | Anton | Regular (inherently bold) | 72–96 px |
| Section label / pillar | Bebas Neue Condensed | Regular | 40–56 px |
| Caption (word-by-word) | Bebas Neue or Montserrat Bold | Bold | 28–36 px |
| Sub-caption / fine print | Roboto Condensed | Regular | 18–22 px |

## Texture Overlay

- Grain/dust texture PNG, desaturated, screen or overlay blend mode.
- Opacity: 10–15%. Enough to feel tactile on OLED; invisible on lower-contrast monitors.
- Tile seamlessly; avoid obvious pattern repeat in the center of frame.

## Grid Specification

- 1 px white lines, both horizontal and vertical.
- Spacing: 60 px (1080p canvas) / 40 px (720p canvas).
- Opacity: 8%. If the grid becomes the focal point, reduce to 5%.

## SFX Timing

| Moment | SFX | Duration |
|--------|-----|---------|
| Hook cut (before → after) | Whoosh + impact hit | 60–80 ms hit tail |
| Each pillar reveal | Short hit (no tail) | 30 ms |
| CTA card entry | Riser + impact | 100 ms |
| End card logo | Jingle sting | ≤2 s |

## Shot Length Distribution

| Phase | Avg shot | Min | Max |
|-------|----------|-----|-----|
| Hook (blocks 1–2) | 2.0 s | 1.2 s | 3.0 s |
| Problem (blocks 3–4) | 3.0 s | 2.0 s | 4.0 s |
| Solution/Pillars (5–9) | 3.5 s | 2.5 s | 5.0 s |
| Proof/Magnitude (10–11) | 4.5 s | 3.0 s | 6.0 s |
| CTA (12) | 6.0 s | 5.0 s | 8.0 s |
