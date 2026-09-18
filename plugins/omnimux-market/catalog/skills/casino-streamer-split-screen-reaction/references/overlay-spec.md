# Overlay Spec — Split-Screen Reaction Ad

All coordinates assume a **1080×1920** canvas (9:16). Zone `center` = horizontal center, aligned to the gold divider seam.

## Hook Overlay

| Property | Value |
|----------|-------|
| Text | Product-specific — e.g. `"ONE TAP COULD\nCHANGE YOUR DAY"` |
| Font | Punch display font |
| Size | 72px |
| Color | Gold (`#FFD700`) or white |
| Style | `promo-punch` / punch |
| Start time | 0.2s |
| Duration | 3s |
| position_y_ratio | **0.06** (critical — keeps text above creator's head) |
| Entrance | fade-in |

## Mid-Scene Timed Overlays (zone: center — gold divider seam)

| Time | Text | Color | Font | Size | Entrance |
|------|------|-------|------|------|----------|
| 0.2s | `"ONE TAP…"` | Gold | Punch display font | 72px | fade-in |
| 2.2s | `"IT'S BUILDING…"` | Orange | Punch display font | 68px | upSwipe-in |
| 4.2s | `"WAIT FOR IT 👀"` | White | Punch display font | 72px | bounce-in |
| 6.2s | Result counter pill (see below) | Gold | Punch display font | varies | fade-in |

*Swap copy to match new brand / result mechanic. Keep font, colors, entrance sequence.*

## Result Counter Overlay

| Property | Value |
|----------|-------|
| Text | A large rounded figure — always clean text, never AI-rendered |
| Font | Punch display font |
| Background | Dark pill |
| Position | Absolute: x=540, y=1720 (lower half, near the on-screen result) |
| Entrance | fade-in |
| Note | **This is the ONLY place the numeric figure appears** |

## End Card Overlays (mute_captions: true on end card scene)

| Property | Value |
|----------|-------|
| Product logo | Hero image, centered, upper 50% of frame |
| Third-party review badge | Product reference image, lower panel, faithfully reproduced |
| Tagline | e.g. `"BIG MOMENTS HAPPEN HERE"` — gold punch font, x=540 y=1530 |
| CTA pill | `"GET STARTED →"` — black on gold, x=540 y=1680, bounce-in |
| Disclaimer | e.g. `"Demo-style concept • Individual results vary"` — small clean sans-serif, x=540 y=1860 |
