# Caption Preset & Font Rotation

LLMs default. Without forced variety every ad in a launch ends up with `outlined-text` / `promo-punch` and Poppins/Montserrat. That's the regression you are fighting.

**Rule:** every ad in a launch set uses a caption preset **AND** a font **AND** a hook-overlay style that none of the prior ads in the set used.

---

## Sample four-ad rotation (a worked example)

| # | Angle | Caption preset | Font | Hook overlay | CTA accent color |
|---|---|---|---|---|---|
| 1 | Print Parade | `mint` | Corben (warm craft serif) | `pill` | brand-warm |
| 2 | Single-Product Feature | `zoom-punch` | Anton (UGC pulse) | `outlined` | brand-warm |
| 3 | Gift Reveal | `editorial-clean` | Alice (emotional editorial serif) | `minimal` | brand accent |
| 4 | POV Diary | `soft-pill` | DM Sans (modern lifestyle) | `minimal` | brand accent |

Notice:
- Every row uses a different preset and a different font.
- Hook-overlay style rotates: pill → outlined → minimal → minimal (minimal can repeat; pill/outlined should not within a set).
- CTA accent color is locked across the brand — pick one and reuse it across every CTA card in the set.

---

## How to pick a preset + font per angle

Match the typographic energy to the angle, then check it doesn't collide with the prior ad.

| Angle | Preset family | Font family |
|---|---|---|
| Print Parade | warm/craft (`mint`, `notebook`, `marker`) | craft serif (Corben, Fraunces, Recoleta) |
| Single-Product Feature (UGC) | punch/pulse (`zoom-punch`, `promo-punch`, `bold-pop`) | display sans (Anton, Bebas Neue, Druk) |
| Gift Reveal (emotional) | editorial/clean (`editorial-clean`, `serif-soft`) | editorial serif (Alice, Cormorant, Playfair) |
| POV Diary (lifestyle) | soft/pill (`soft-pill`, `rounded-chip`) | modern lifestyle sans (DM Sans, Inter, Manrope) |
| Identity Hook | warm/craft OR soft/pill | craft serif OR modern sans |
| Founder UGC | minimal-mono (`mono-clean`, `caption-only`) | mono / utilitarian sans (IBM Plex Mono, JetBrains Mono, Inter) |
| Pattern Montage | bold-pop / kinetic | display sans (Druk, Bebas, Anton) |
| Before / After | clean / serif-soft | sans-serif workhorse (Inter, Manrope) |

---

## Extending the rotation past 4 ads

Once you've used 4 preset-font combos, the 5th ad pairs the *next angle* with a *5th unused preset*. Maintain a running used-list per launch — never let row N reuse row N−1's preset OR font.

Example 8-ad extension:

| # | Angle | Preset | Font |
|---|---|---|---|
| 5 | Print Parade #2 (new persona) | `notebook` | Fraunces |
| 6 | Single-Product Feature #2 (different SKU) | `bold-pop` | Bebas Neue |
| 7 | Founder UGC | `mono-clean` | IBM Plex Mono |
| 8 | Pattern Montage | `caption-only` | Druk |

---

## Hard "don't"s

- Don't reuse the same preset across two ads in a launch.
- Don't reuse Poppins or Montserrat *anywhere* — they're the LLM-default flags. If a caption preset defaults to one of those, override the font.
- Don't put hook text in `text_overlays` and don't put CTA-card overlays in `hook_overlay`. They're different slots with different timing semantics.
- Don't let `mute_captions: true` leak outside the CTA scene — non-CTA scenes need live captions to survive sound-off viewing.
