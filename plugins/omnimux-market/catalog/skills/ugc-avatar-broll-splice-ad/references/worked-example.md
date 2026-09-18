# Worked example — brand reference template (and reusable ffmpeg recipes)

## Brand reference (fill in per client)

Ground these from the live site before drafting. Example shape, using a neutral
hypothetical product (a recipe-planning app for busy households):

- **Brand:** the product — a meal-planning app that auto-builds weekly menus and grocery lists.
- **Site:** the brand's site (fetch the live site to ground brand + product names before drafting).
- **Palette:** one brand accent color (used for the active caption word) over the brand's darkest UI color (used as the B-roll pad color). Pull both from the site.
- **Tone:** direct, confident, no-fluff. Audience = the product's core user (here, busy households who want dinner solved without thinking about it).
- **Named feature tools** (use whichever the ad demos): pull the product's actual named features from the site — e.g. an auto-menu builder, a one-tap grocery list, a pantry tracker, a budget-mode planner.

> Generalize: keep the *structure* (accent color tied into wardrobe + caption highlight + B-roll pad; dark canvas; direct peer tone) and substitute the new brand's palette, audience, and feature names.

## Persona accent menu (example)

A persona who fits the product's audience, in a setting that matches the product world, with a subtle brand-accent accent (wristband, scrunchie, or sleeve stripe). Rotate appearance per ad:
- Ad 1: one persona (e.g. a younger adult home cook).
- Ad 2: a visibly different persona (different age band / ethnicity / hair).

## Caption style

- Preset: `clean-bold`
- Font: `Anton`
- Active-word highlight color: brand accent (pull from the site)
- Coverage: per-ad parameter — avatar-only (mute captions on B-roll scenes) OR throughout (pass caption timing on B-roll scenes too).

## Music

- Subtle instrumental bed, ~30s, low energy, "designed to sit under voiceover."
- Mix volume ~0.13 (12–15%).

## ffmpeg recipes (UI screen-recording B-roll → 9:16 canvas)

Environment note: this sandbox blocks output redirection (`>`), pipes (`|`), and semicolons. Chain with `&&`. Commands must start with an allowed prefix (`ffmpeg`, `ffprobe`, `python3`, `ls`, `cat`, `mkdir`, `cp`, `find`, `grep`, `head`, `tail`, `cd`). If the sandbox briefly reports "Sandbox is unavailable", just retry the same command.

**Inspect a recording (map UI moments to timestamps):** extract thumbnails at 1 frame / 3s and read the jpgs.
```
ffmpeg -i input_video.mp4 -vf fps=1/3 frame_%03d.jpg
```

**Stretch a too-short clip to fill its VO slot** (6.9s → 8.0s ⇒ factor 8.0/6.9 ≈ 1.159):
```
ffmpeg -i broll.mp4 -filter:v setpts=1.159*PTS -an stretched.mp4
```

**Trim a featured window from a too-long clip** (start at 12s, take 8s):
```
ffmpeg -ss 12 -i broll.mp4 -t 8 -an trimmed.mp4
```

**Pad/scale a tall capture onto the 1080×1920 canvas with the brand's dark UI color as bars, audio stripped:**
```
ffmpeg -i broll.mp4 -vf scale=1080:-2,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0xRRGGBB -an padded.mp4
```

**QA frame grab at a timestamp** (then read the jpg):
```
ffmpeg -ss 9 -i final.mp4 -frames:v 1 qa_hook.jpg
```

## Delivery-shape examples (for shape reference only — do not copy verbatim)

- **Mode A example:** 4 separate captioned clips + edit map; then on request assembled to a final ~27–28s video, one B-roll source split into two featured windows, captions on avatar sections only.
- **Mode B example:** single continuous ~30s video, captions throughout, two screen recordings layered over two demo sections.
