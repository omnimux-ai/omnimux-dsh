# Youth Sports Hype Reel

A creative mold for turning a parent's phone-shot game clips into a 30-40s vertical "championship trailer" the kid will actually rewatch. Maximalist, not minimalist. Broadcast / sneaker-spot / state-final-promo energy, scaled down for a 10-12 year old in a jersey.

## When to use this pattern

**Use when:**
- User has 3-6 raw game clips (any duration, any mix of 16:9 and 9:16, phone-shot is fine — exposure can be ugly, we fix it in grade).
- A team logo or letter mark is available (white-background JPGs are fine — we strip the white).
- Audience is the kid + their parents + their team group chat. Vertical-first delivery (Instagram Reels, TikTok, family text).
- Tone direction includes any of: "epic", "hype", "trailer", "broadcast", "championship", "make him look like a star".

**Don't use when:**
- The user wants a calm season recap, a slideshow, or anything montage-y but gentle — this skill is loud by design.
- The footage is a single continuous take (no cuts to make = no hype reel).
- It's an ad for a product. Use the ads pipeline.

## Hook & opening

**Structural move: "logo crash-in → hero walk-up."** The first 2 seconds establish brand (intro card with team logo crash-zoomed, team color stripe behind, team name + division stamped), then cut hard to the hero subject *walking toward camera with gear* — bat, glove, helmet under arm. Walking-toward-camera shots feel like a player intro tunnel. If no walk-toward-camera footage exists, use a tight dugout shot of the kid putting on a helmet, or a kid swinging the bat once in warmup (the "I'm here" beat).

Invented example of how the opening beats lay out:
- 0.0–1.4s: intro card, "{TEAM_NAME} / {DIVISION}" with crash-zoom logo
- 1.4–3.0s: hero kid walking in from the sideline, gear in hand
- 3.0s: corner ticker bug fades in and stays

**Swap rule:** the subject (kid, team, division, colors) is *always* swappable. The move — logo crash → hero walk-up → ticker bug latches on — stays locked. Don't replace it with a slow fade-in or a title-only opener; both kill the energy.

## Narrative arc

Target total: **~36 seconds** (sits cleanly inside a 42s music bed with a 2.5s fade tail).

Beat list — keep this order, adjust durations ±20% to match the music drop:

1. **Intro card** (0.0–1.4s) — crash-zoom logo, team name + division.
2. **Hero walk-up** (1.4–3.5s) — kid moves toward camera. Real-speed.
3. **Setup / readiness** (3.5–8.0s) — batter at the plate digging in, infield in ready stance, pitcher's grip. Two or three 1.5–2.0s cuts. First text flash lands here ("LET'S GO" or "GAME ON").
4. **First action burst** (8.0–14.0s) — swings, runs, throws, slides. Real-speed cuts, 1.5s each. Energy climbs.
5. **First slow-mo beat** (14.0–18.0s) — bat-raised stance OR the moment right before the swing, ramped to 0.5x. Time a single text flash to peak ("SWING IT" or "RISE UP"). **Slow-mo lands on stance/anticipation/celebration, NOT on the contact frame itself** — parent cameras almost never catch contact cleanly and slowing a missed moment ruins it.
6. **Team / dugout beat** (18.0–24.0s) — handshake line, dugout celebration, helmet bumps, a coach high-five. Text flash: team-identity line ("TEAM {TEAM_NAME}" / "ALL IN").
7. **Second slow-mo beat** (24.0–28.0s) — celebration jump, fist pump, or a triumphant walk-off back-shot. Slow to 0.5x. Text flash: "UNSTOPPABLE" or equivalent superlative.
8. **End card** (28.0–33.0s, ~5s) — diagonal color stripe, logo, "TEAM / DIVISION / EVENT · YEAR / RALLY CRY". Gentle slow zoom, not a crash — the music is fading.
9. **Audio tail** (33.0–36.0s) — end card holds while music fades out.

Corner ticker bug: fades in at ~4s (after intro lands), stays through the body, fades out around 30s (before end card takes over).

## Visual style spec

- **Format:** 1080×1920, 30fps, H.264 (libx264, crf 18 for final, ultrafast crf 20 for segment renders), yuv420p, +faststart.
- **Crop handling:** horizontal source → `scale=-2:1920,crop=1080:1920:(in_w-1080)/2:0` (center crop). Vertical source → `scale=1080:1920`. **Always sample post-crop thumbnails during clip selection** — the action is usually centered in horizontal phone footage, but verify; sometimes the parent panned and the hero is at the edge.
- **Look:** color pop, grey/cool shadows, warm midtones, gentle vignette. NOT desaturated cinematic teal-and-orange — this is youth sports, the jerseys need to scream their color.
- **Camera grammar:** the source is what it is (handheld parent phone). We don't simulate dolly moves. Energy comes from cut rhythm + slow-mo, not synthetic camera work.
- **Shot length distribution:**
  - Standard moments: 1.5–2.0s
  - Slow-mo beats: 4.0s on screen (2.0s real footage at 0.5x)
  - Intro card: 1.4s
  - End card: 5.0s
- **On-screen text:** kinetic text flashes (1–2 words, ALL CAPS, color underline streak under the word, hard-cut in/out — no fades). One text flash every 6–8 seconds. See `references/text_flashes.md` for the word bank.
- **Persistent corner bug:** small color pill, bottom-left, "TEAM NAME · EVENT YEAR". Branding ticker, hard-cut on at ~4s, hard-cut off at ~30s.

### Color grade — the order matters

The single biggest trap on this style is contrast-pushing washed-out cloudy daytime footage and clipping sky/dirt/grass into pure white. Pre-compress the input range *first*, then add saturation, *then* color shift. Do not chain `eq=contrast=` or `curves=preset=increase_contrast` in front — they clip.

Working grade chain (tune `romin/romax` etc. to taste per source):

```
colorlevels=rimin=0.00:gimin=0.00:bimin=0.00:rimax=1.00:gimax=1.00:bimax=1.00:
  romin=0.04:gomin=0.04:bomin=0.04:romax=0.74:gomax=0.74:bomax=0.74,
eq=saturation=1.45,
colorbalance=rs=0.10:gs=-0.02:bs=-0.12:rm=0.05:bm=-0.07,
vignette=PI/7
```

For darker source (evening / indoor / overcast-but-properly-exposed), raise `romax/gomax/bomax` toward 0.85. For very blown-out source, drop them toward 0.65. Full tuning table in `references/grade_recipes.md`.

**Verify a grade by extracting a static frame** (`ffmpeg -ss N -vframes 1`) and looking at it. Moving video forgives more than a still does — but if the still is blown out, the video is worse than it looks.

## Voice & persona

There is no voiceover. Energy comes from:

- **Music** — bass-heavy cinematic sports-trailer instrumental, 30–45s, generated via `music_generate` with `instrumental=true`. Prompt fragments that work: "epic cinematic sports trailer, big bass hits, rising tension, championship-final energy, anthemic, drum-heavy, no vocals". Aim for a track with a clear drop around the 14s mark so the first slow-mo lands on it.
- **Text flashes** as the "voice". Phrasing is short, declarative, hype-coded: `LET'S GO`, `GAME ON`, `SWING IT`, `HUSTLE`, `RISE UP`, `TEAM {TEAM_NAME}`, `ALL IN`, `UNSTOPPABLE`. See `references/text_flashes.md` to swap for the active team name.
- **Persona archetype:** the *promo voice the kid would write for himself if he were 22*. Not parental, not ironic, not gentle. Earnest hype.

Source audio from the clips is **always discarded**. Parents talking on camera, umpires yelling, wind hiss — none of it carries the energy. Music only.

## CTA mechanic

There is no clickable CTA. The close is the **end card rally cry** — three lines stacked, all caps. Invented shape of the block (fill in the active team's real values):

```
{TEAM_NAME}
{DIVISION} · {AGE_GRADE}
{EVENT} · {YEAR}
{RALLY_CRY}
```

The rally cry (the team's dugout chant) is always the last line and is the line the kid will quote back when shown the video. Confirm it with the user before render — the rally cry is non-generic and never something you can guess.

Deliver to the user as a single markdown link: `[▶ Watch the full hype video](final:<team>-hype)`.

## Pacing fingerprint

- Average shot length: ~2.0s (skewed by the slow-mo beats and end card).
- Fastest cut: 1.2s (during the first action burst around 8–12s).
- Rhythm shift: around 14s and 24s, where slow-mo beats cut the cadence in half and let the music breathe.
- Text-flash density: one every 6–8s, max ~5 in the body. Don't overdo it; the eye reads the flash, not the action behind it, if they're too frequent.

## Hard rules / do-not-regress

These are bugs and corrections that cost real time. Treat each as non-negotiable.

1. **Slow-mo never lands on the contact frame.** Bat-raised stance, anticipation, dugout celebration, walking-off triumphant back-shot — those slow well. The actual swing-contact or ball-leaving-bat moment is almost never cleanly captured by a parent phone, and slowing a blurry near-miss makes it worse.
2. **Always sample post-crop thumbnails before locking clip windows.** The 9:16 center-crop will drop a hero subject who happened to be panned to the edge of a 16:9 source. Confirm the crop catches the kid.
3. **Grade order is fixed: `colorlevels` (clamp) → `eq=saturation` → `colorbalance` → `vignette`.** No `contrast=` push, no `curves=preset=increase_contrast` in front of `colorlevels`. Cloudy youth-sports footage clips instantly under contrast-first chains.
4. **PNG overlays on YUV video MUST be tagged `format=yuva444p`, not `format=rgba`.** With `rgba`, alpha doesn't transfer through `overlay` and the graphic is invisible. Applies to every text flash and the corner bug.
5. **Do not add alpha fades (`fade=t=in:alpha=1`) on PNG overlays.** They break the alpha channel after `yuva444p` conversion. Use `overlay=enable='between(t,START,END)'` for hard cuts. Hard cuts match hype-reel pacing anyway.
6. **For input-side slow-mo trims, `-ss T_IN -t DUR_IN` go BEFORE `-i SRC`, and the output `-t` (equal to `DUR_IN / speed`) goes AFTER `-vf`.** Putting the output `-t` in the wrong position makes the slowed segment come out at original duration. Verify each speed-ramped segment with `ffprobe` — its duration must equal `(t_out - t_in) / speed`.
7. **Auto-fit text-flash font size.** Long words like "UNSTOPPABLE" or "TEAM {TEAM_NAME}" will clip the 1080-wide canvas at a fixed 220px. Start at 220px and decrement by 10px until rendered text width (including stroke + letter-spacing) is ≤ 980px. Reposition the color underline streak relative to the resolved font size, not a hard-coded y.
8. **Strip white backgrounds from JPG logos** via a PIL pixel scan (`r,g,b all > 235 → alpha=0`). White-bg logos crash-zoomed onto a colored card look terrible.
9. **Don't try `minterpolate` for speed ramps.** It's ~10× slower at this scale and the duplicated-frame look of plain `setpts={1/speed}*PTS` is fine on a hype reel — cuts and overlays mask it.
10. **Skip source audio entirely.** Music only. Parent-camera ambient drags the energy down even at low volume.
11. **Confirm the rally cry with the user** before the end card renders. It's the one line the kid will quote and it's never something you can guess (it's their dugout chant, not generic).
12. **Default team colors are red + grey only if the user hasn't said.** Always ask, or read from prior session memory if the team is known.

## Defaults the user may have already set (per-team memory)

If this is the *same team* as a prior session, inherit and don't re-ask:

- Team name, division, age grade
- Team colors (hex codes if known)
- Logo asset (with white already stripped)
- Rally cry
- "Energy direction" notes (e.g. "broadcast / sneaker-spot / championship trailer — maximalist")

Only re-ask if explicitly changing teams or events.

## References

- `references/text_flashes.md` — hype-word bank, with rules for swapping in the team name.
- `references/grade_recipes.md` — the working grade chain plus tuning notes for over/under-exposed source and alternate team palettes.