# Typography craft rules

Universal typography rules that apply regardless of brand. The active design tokens decide *which* fonts; this file decides *how* they behave across weights, sizes, and scripts.

## Type scale

Use a multiplicative scale (1.2 or 1.25 ratio). Cap at 6–8 distinct sizes per page or canvas.

| Role | Pixel Range |
|---|---|
| Display | 48–72 px |
| H1 | 32–48 px |
| H2 | 24–32 px |
| H3 | 20–24 px |
| Body | 14–16 px |
| Small / Label | 12–13 px |
| Caption | 10–11 px |

## Line height (leading)

| Context | Latin Leading | CJK (Chinese / Japanese / Korean) |
|---|---|---|
| Display / H1 (≥32 px) | `1.0`–`1.2` (tight) | **`1.3`–`1.4` (mandatory floor)** |
| Body (14–16 px) | `1.5`–`1.6` | `1.6`–`1.7` |
| Small / Caption (≤13 px) | `1.4`–`1.5` | `1.5` |

### CJK Leading & Tracking — Invariant Rules

1. **The CJK leading floor is non-negotiable**: Latin glyphs have ascenders/descenders that leave natural breathing room, so `line-height: 1.1` works. CJK glyphs fill the entire square em-box; a `line-height: 1.1` on multi-line Chinese headlines causes glyphs on adjacent lines to collide and overlap. Keep CJK headings at `line-height: 1.3` minimum.
2. **Negative tracking is Latin-only**: Never apply negative letter-spacing (`letter-spacing: -0.02em`) to CJK text. Chinese characters sit on a fixed square grid; tightening tracking makes them look crowded and illegible. Set `letter-spacing: 0` for CJK display text.
3. **Mixed language headlines**: When an English kicker sits above a Chinese title, isolate the tight Latin tracking/leading to the English element. Do not let it cascade into the CJK title container.

## Letter-spacing (tracking)

This is a key differentiator between professional craft and amateur AI output.

| Context | Required Letter-spacing |
|---|---|
| Body text (14–16 px) | `0` (normal) |
| Small text / Caption (10–13 px) | `0.01em` to `0.02em` |
| UI labels / Button text | `0.02em` |
| **ALL CAPS text** | **`0.06em` to `0.1em` (mandatory)** |
| Latin Headings (≥32 px) | `-0.01em` to `-0.02em` |
| CJK Headings | `0` (never negative) |

**ALL CAPS without positive letter-spacing (`>=0.06em`) is a top amateur tell.** Without tracking, adjacent capitals collide.

## Three-weight system

Disciplined interfaces use exactly three weights:
1. **Read (400 / Regular)**: Body paragraphs, descriptions, secondary metadata.
2. **Emphasize (500 / Medium)**: Form labels, navigation tabs, table headers, interactive chips.
3. **Announce (600 / SemiBold)**: Section titles, modal headers, primary button labels.

Avoid weights of 700+ (Bold/Black) unless designing high-impact hero posters. If you need 700+ to create hierarchy, the typography scale or color contrast is flawed.
