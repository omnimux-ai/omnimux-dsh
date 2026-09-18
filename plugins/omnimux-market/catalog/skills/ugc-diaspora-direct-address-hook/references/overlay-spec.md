# Overlay Spec Quick Reference

Per-scene text overlay parameters for the UGC Diaspora Direct-Address pattern. All copy below is placeholder — replace with the audience's native-language wording.

## Scene 1 — Hook
| Parameter | Value |
|---|---|
| Type | Pill |
| Content | "Just for you in [City/Country] 🏳️" |
| position_y_ratio | 0.12 (near top) |
| Duration | 0 → 5 s |
| Color | Neutral warm (white text, soft tinted bg) |

## Scene 2 — Product intro
| Layer | Content | Zone | Timing |
|---|---|---|---|
| Badge pill | Product name + key ingredient | lower-center | full scene |
| Subtitle text | Format/flavour descriptor | bottom-center | full scene |
| Color | Brown/chocolate tones for food/supplement; match product packaging |

## Scene 3 — Benefits (sequential)
| Layer | Content | Zone | Timing | Animation |
|---|---|---|---|---|
| Badge 1 | ✓ Benefit 1 | lower-center | 1 → 4.5 s | upSwipe-in |
| Badge 2 | ✓ Benefit 2 | lower-center | 4.5 → 8 s | upSwipe-in |
| Badge 3 | ✓ Benefit 3 | lower-center | 8.5 → 12.5 s | upSwipe-in |
| Color | Green ticks, white text on dark pill |

*Add Badge 4/5 if product has more benefits; extend scene duration proportionally.*

## Scene 4 — Promo (three-layer urgency build)
| Layer | Content | Zone | Start | Animation |
|---|---|---|---|---|
| Promo headline | "🎁 BUY X GET Y FREE" | top-center | 1.5 s | bounce-in |
| Price pill | "[Price] · Free Shipping 🚚" | lower-center | 3 s | fade-in |
| Urgency text | "⏰ Until [Date] — Don't Miss Out!" | bottom-center | 6 s | fade-in |
| Font | Anton (headline), Poppins (price + urgency) |
| Colors | Yellow headline, red price pill, yellow urgency text |

## Scene 5 — CTA
| Parameter | Value |
|---|---|
| mute_captions | true |
| CTA pill | "💜 DM Me Now!" |
| Zone | bottom-center |
| Start | 4 s |
| Animation | bounce-in |
| Color | Purple bg, white text |

## Global caption settings
```
preset: outlined-text
font_family: Poppins
appear_mode: word
```
Music volume: `0.12`
