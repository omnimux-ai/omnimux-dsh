# Grade Recipes

The single grade chain that survived testing on cloudy daytime youth-sports phone footage, plus tuning knobs for other lighting conditions. **Order is non-negotiable: clamp range first, then saturation, then color shift, then vignette.** Do not put `eq=contrast=`, `curves=preset=increase_contrast`, or any S-curve in front of `colorlevels` — it will clip sky/dirt/grass into pure white.

## Base chain (cloudy daytime — the default)

```
colorlevels=rimin=0.00:gimin=0.00:bimin=0.00:rimax=1.00:gimax=1.00:bimax=1.00:
  romin=0.04:gomin=0.04:bomin=0.04:romax=0.74:gomax=0.74:bomax=0.74,
eq=saturation=1.45,
colorbalance=rs=0.10:gs=-0.02:bs=-0.12:rm=0.05:bm=-0.07,
vignette=PI/7
```

What each piece does:
- `colorlevels` with `romax/gomax/bomax=0.74` compresses the output highlights into the top 74% of the range, leaving headroom so subsequent saturation pushes don't clip whites.
- `eq=saturation=1.45` pumps jersey color.
- `colorbalance` shifts shadows cool (`bs=-0.12`) and midtones warm (`rm=0.05, bm=-0.07`), giving the color-pop-on-grey-shadow look.
- `vignette=PI/7` darkens corners ~14% — subtle, not heavy.

## Tuning knobs

| Source condition          | Adjustment                                                                 |
|---------------------------|----------------------------------------------------------------------------|
| Blown-out / hazy sunlight | drop `romax/gomax/bomax` to ~0.65, raise `romin/gomin/bomin` to ~0.06      |
| Properly-exposed overcast | base chain works as-is                                                     |
| Evening / golden hour     | raise `romax/gomax/bomax` to ~0.85; drop `rs=0.10` → `0.05` (already warm) |
| Indoor / fluorescent      | raise `romax/gomax/bomax` to ~0.88; flip `colorbalance` to `bs=+0.05` to cool the lights, `rm=-0.03` to kill the yellow cast |
| Phone HDR clipping        | tighten `romax` further to 0.68; consider `gomax=0.70` if grass is neon    |

## For different team colors

The `colorbalance` step adds warmth toward the default palette. Re-tune per team palette:

| Primary color  | colorbalance shift                                          |
|----------------|-------------------------------------------------------------|
| Red            | `rs=0.10:gs=-0.02:bs=-0.12:rm=0.05:bm=-0.07` (default)      |
| Royal blue     | `rs=-0.05:bs=0.10:rm=-0.03:bm=0.05`                         |
| Forest green   | `rs=-0.04:gs=0.08:bs=-0.05:gm=0.05`                         |
| Navy + gold    | `rs=0.05:gs=0.03:bs=0.05:rm=0.03:gm=0.03` (warm both ends)  |
| Black + orange | `rs=0.12:gs=0.02:bs=-0.10:rm=0.08:bm=-0.05`                 |

## Verification

After any grade change:

```
ffmpeg -ss 5 -i segment.mp4 -vframes 1 -y /tmp/grade_check.png
```

Open the still. If the sky is pure white (RGB ~255,255,255) or the grass is neon (G ~240+), the chain is clipping — tighten `romax/gomax/bomax` and re-render. Static frames look slightly worse than moving video (motion masks brightness), so leave a small margin.
