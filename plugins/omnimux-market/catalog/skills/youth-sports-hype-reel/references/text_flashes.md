# Text Flash Word Bank

Each entry is 1–2 words, ALL CAPS, rendered as a PNG overlay (1080×1920, transparent BG) with DejaVu Sans Bold + a color underline streak. Pick 4–6 per reel.

## Rules
- Auto-fit font size: start at 220px, decrement by 10px until `text_width + stroke + letter_spacing ≤ 980px`. Reposition the underline streak relative to resolved font size.
- One flash per ~6–8 seconds of runtime. Don't stack two within 3s.
- Hard-cut in and out via `overlay=enable='between(t,START,END)'`. No alpha fades.
- Match the flash to the action behind it (see "When each lands" below).

## Universal bank (any team)
- `LET'S GO`
- `GAME ON`
- `HUSTLE`
- `ALL IN`
- `RISE UP`
- `LOCKED IN`
- `NO FEAR`
- `UNSTOPPABLE`
- `LEGEND`
- `LEVEL UP`

## Action-specific (use sparingly, must match what's on screen)
- `SWING IT` — bat-raised or stance beat, ideally slow-mo
- `SEND IT` — throw, pitch, or long fly
- `WHEELS` — running between bases or a stolen base
- `WALL` — defensive play, glove save
- `BANG` — only if there's a visible solid contact (rare from parent cams)

## Team-identity (swap the team token)
- `TEAM {TEAM_NAME}`
- `{TEAM_NAME} UP`
- `{TEAM_NAME} NATION`
- `GO {TEAM_NAME}` — usually reserved for end-card rally cry, not body

## When each lands in the arc
- Setup / readiness beat (~6s mark): `LET'S GO` or `GAME ON`
- First action burst (~10s): `HUSTLE` or `LOCKED IN`
- First slow-mo (~15s): `SWING IT` or `RISE UP`
- Team beat (~20s): `TEAM {TEAM_NAME}` or `ALL IN`
- Second slow-mo (~26s): `UNSTOPPABLE` or `LEGEND`

## Example selection for one reel
A typical 36s reel pulls ~5–7 flashes across the arc, e.g.: `LET'S GO`, `GAME ON`, `SWING IT`, `HUSTLE`, `RISE UP`, `TEAM {TEAM_NAME}`, `UNSTOPPABLE`. Always substitute the active team's real name for `{TEAM_NAME}` before rendering.
