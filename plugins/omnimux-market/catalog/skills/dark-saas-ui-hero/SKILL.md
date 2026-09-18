# SaaS UI — Dark Cinematic Product Hero (9:16, no-VO)

This skill teaches how to turn a set of uploaded SaaS / dashboard / app-UI screenshots into a short vertical product-hero ad in a **dark cinematic startup** voice. The product is interchangeable; the visual grammar, pacing, and CTA shape are locked.

## When to use this pattern

**Use it when:**
- The user uploads 3–6 screenshots of a software product (dashboard, settings, feature pages, marketing site sections).
- The hero of the ad is the UI itself — not a person, not a physical object.
- Format is short vertical (TikTok / Reels / Shorts), ~12–24 seconds.
- Tone is "premium startup brand spot" — Linear, Vercel, Arc, Raycast, Superhuman energy.
- The user wants a product feel without a creator, voice actor, or generated talking head.

**Do NOT use it when:**
- There is a creator/person in the assets → use a UGC-style skill instead.
- The product is physical → use a product-showcase / unboxing skill.
- The user wants voiceover narration or a script-driven explainer → different skill.
- More than ~6 screens are provided → cut to a hero subset first, do not stretch this past ~24s.

## The single biggest rule (this is what makes the skill work)

**Never re-render UI screenshots through an image-to-image model** (nano-banana, Seedance, Kling, Runway image, etc). UI text gets garbled — a clean headline comes back as scrambled, near-gibberish glyphs. Every. Single. Time.

The hero of this ad is the UI's *readability*. The whole skill is built around preserving original pixels:

- Crop the source screenshot tightly in Python/PIL.
- Composite onto a dark canvas with PIL.
- Animate with `ffmpeg zoompan` (deterministic Ken-Burns).
- Only then register the resulting MP4 as a scene asset.

If you find yourself reaching for `generate_image`, `imagine`, or any I2I tool to "polish the screenshot" — stop. Use PIL.

## Hook & opening (scene 1, 0–4s)

**Structural move:** the hook overlay sits on its own in the upper-third dead space *above* the floating UI panel, in clean minimal type (no pill, no outline, no emoji). The UI panel below it is already glowing from second 0; the hook is a calm declaration, not a shout.

**Example hook (invented, not from any real product):**

> "One prompt. Full output. 60 seconds."

**The move, not the words.** Three short fragments, period-separated, total under ~6 words. First fragment names the input, second names the output, third names the time/scale claim. Read it as `[trigger] · [magnitude] · [speed]`.

**Swap the subject, keep the move.** For a CRM tool: `One contact. Whole timeline. Instant.` For a code-review SaaS: `One PR. Every reviewer. In minutes.` For a wellness app: `One scan. Full report. Today.` The cadence (three fragments, terminal periods, no verbs in fragments 2–3) is the lock.

Hook overlay config: `style: "minimal"`, white text, soft shadow, **no pill / no outline / no background**, positioned at roughly `position_y_ratio: 0.18` so it floats above the panel.

## Narrative arc

Total runtime is **N × 4 seconds**, where N = number of screens (3–6). Each scene maps to exactly one screenshot / one section of the product.

| Beat | Time | Visual | On-screen text |
|---|---|---|---|
| 1 — Hook | 0–4s | First "marquee" section of the UI (the most identity-carrying screen — usually the homepage / generator / primary action) | Hook line (above panel) + section caption (below panel) |
| 2..N-1 — Feature beats | 4s × (N-2) | One section per scene, in functional-flow order (input → working → output) | Section caption only (below panel) |
| N — Sign-off | (N-1)×4 → N×4 | Final destination screen (settings, output, launch plan — the "result" screen) | Section caption + delayed wordmark (last 1.5s) |

**Pacing fingerprint:** locked 4-second shots, no cuts inside a shot, no transitions between shots beyond the natural panel re-composition. The rhythm is *meditative*, not *snappy* — the Ken-Burns zoom does the breathing.

**Functional-flow order matters.** Verify the user's stated screen order matches the logical user-journey of the product. If they say "show screens 1, 2, 4, 5, 6" but the content order tells you 4 logically precedes 2, ask once. Their numbering is often off-by-one because they're indexing upload order, not content.

## Visual style spec (the heart of the skill)

### Canvas

- **Output resolution:** 1080×1920.
- **Canvas color:** `#080C14` (near-black with a hint of cool blue — NOT pure `#000000`; pure black reads as a broken render on OLED phones because there's no tonal information for the vignette to gradient into).
- **Radial vignette** on top, strength ~0.45, darkening the corners. Generate with numpy: `1 - 0.45 * (distance_from_center / max_distance)`.

### The panel (where the UI lives)

This is the signature move. The UI screenshot is not pasted flat onto the canvas — it sits inside a "floating glowing panel":

1. **Crop tight** in source pixels. For a typical landscape SaaS dashboard (~2048×~1100), use roughly `crop=(x≈740, y≈180, w≈1170, h≈480–720)` — this skips the left sidebar AND the section-nav strip with tiny badges. For a portrait/scrolled screenshot (~1875×2048), start `crop_x ≈ 395`. **Always inspect the screenshot first** and pick the crop rect per-image; do not assume a uniform rect across scenes.
2. **Scale** the cropped section to width 1020px (keeping aspect).
3. **Build the panel frame:** 24px padding around the scaled crop, rounded corners (radius ~28px), inner fill `#10141F`, 2px outline in the product's accent color at ~25% opacity, plus a drop-shadow blur (~40px, ~60% black). The result reads as "screen inside a screen".
4. **Position** the panel vertically centered with a slight lift — top of panel around `y≈380`, leaving room for hook above and caption below.

### Logo / wordmark

Extract the product wordmark **once** from one of the source screenshots (usually a sidebar logo at known coords — e.g. `x=15, y=12, w=195, h=45`). Rescale to ~360px wide. **Stamp it as an overlay** on every scene at `y≈130` (top band).

Do not crop wide enough to include the sidebar logo *inside* the panel — that forces the UI scale-down past mobile-readable. Logo lives outside the panel, always.

### Layout zones (memorize these three bands)

```
y=0      ┌────────────────────┐
         │  (vignette dark)   │
y=130    │   [LOGO WORDMARK]  │   ← top band, brand presence
y=200    │                    │
y=280    │   [hook overlay]   │   ← scene 1 only, above panel
y=380    │  ╔══════════════╗  │
         │  ║              ║  │
         │  ║  UI  PANEL   ║  │   ← middle band, the hero
         │  ║              ║  │
y=1300   │  ╚══════════════╝  │
y=1380   │  [section caption] │   ← bottom band, explains the beat
y=1620   │  [BRANDMARK]       │   ← final scene only, delayed
y=1920   └────────────────────┘
```

Caption `y` is approximate; nudge per scene so it sits ~80px below the panel's bottom edge (which varies with crop height).

### Motion — Ken-Burns

Per-scene MP4 is rendered with `ffmpeg zoompan`:
- Pre-scale composited PNG 2x (to 2160×3840) to keep zoom crisp.
- `z='zoom+0.0005'` → reaches ~1.06x over 120 frames at 30fps.
- Center-anchored: `x='iw/2-(iw/zoom/2)'`, `y='ih/2-(ih/zoom/2)'`.
- 4-second clip = 120 frames.

**6% is the magic number.** 3% is invisible; 10% reads as "stock template Ken Burns". 6% breathes.

See `references/render_recipes.md` for the exact PIL + ffmpeg snippets.

## Voice & persona

- **No voiceover.** Ever. This is locked.
- **No persona.** No creator, no character, no narrator.
- **The "voice" is the on-screen typography + the music.**
- **Music:** dark cinematic instrumental. Generate with `music_generate` (run it in parallel with PIL compositing — they are independent work streams). Prompt direction: "dark cinematic startup, minimal, ambient pulse, builds slowly, no drums until midpoint, N seconds". **`music_volume: 0.35`** — louder than the typical 0.15 default because there's no VO competing.
- **Typography:** **DM Sans Bold, 54–56px** for section captions. White `#FFFFFF`, soft text-shadow (4px blur, 50% black, 2px y-offset). NOT Poppins. NOT Montserrat. NOT Inter. DM Sans specifically — it carries the premium-tech voice this aesthetic depends on.
- **Caption phrasing:** one short declarative sentence per scene, 4–8 words, lowercase optional for vibe but title-case is safer. Describe *what the section does*, not *what it is*. Bad: "Ad Hooks section". Good: "Scroll-stopping hooks, ready to ship."

## CTA mechanic

**This is a brand sign-off, not a direct response CTA.** No "Link in Bio", no "Comment X to get Y", no "Swipe up".

Mechanic: on the final scene only, the product wordmark **re-appears larger and centered** at `y≈1620` (below the section caption), with:
- Letter-spacing increased to 4px.
- Soft blue glow (20px blur, accent color at ~40% opacity).
- **Delayed entrance** — fade in at t=2.5s of the final scene (so it lands 1.5s before the end).
- No URL, no handle, no arrow.

The brand mark *is* the CTA. The viewer has just seen the tool work; the closing image is the name they should remember.

## Hard rules / do-not-regress

Treat each as non-negotiable.

1. **Never use I2I image generation on UI screenshots.** Text glyphs will be mangled. Use PIL compositing.
2. **Never use motion-video models (Seedance/Kling/Runway) with UI start frames.** Same glyph-warping problem, plus drift. Use ffmpeg `zoompan`.
3. **`mute_captions: true` on every scene.** No VO means auto-transcribe produces noise or confuses the renderer.
4. **Hook overlay only on scene 1.** Not scenes 2..N. Subsequent scenes carry only the section caption.
5. **Logo extraction once, then stamped per-scene as overlay.** Do not include the sidebar logo *inside* the cropped panel — it forces UI scale-down past mobile-readable.
6. **DM Sans, not the LLM-default sans.** If DM Sans isn't installed, install it; do not silently fall back to Poppins/Montserrat/Inter.
7. **6% Ken-Burns. No more, no less.** Not 10%, not 15%. The breathing only works at 6%.
8. **Confirm screenshot-to-scene mapping with `get_asset` before compositing.** User-provided numbering is often off-by-one (upload order vs content order).
9. **Canvas is `#080C14`, not `#000000`.**
10. **Exactly 4 seconds per scene.** Do not vary scene length to "balance" — the locked cadence is part of the aesthetic.
11. **CDN downloads need a Mozilla User-Agent.** Default Python `urllib` UA gets 403'd.

## Production checklist (creative gates only)

Before assembling, verify:
- [ ] Each scene's crop excludes the sidebar AND any "step-number" badges adjacent to cards.
- [ ] The wordmark is consistent in scale and position across all scenes.
- [ ] The hook overlay reads as three fragments with terminal periods.
- [ ] Section captions are 4–8 words, describe action not label.
- [ ] Music volume is 0.35 (not the 0.15 default).
- [ ] Final scene has the delayed brandmark sign-off.
- [ ] `mute_captions: true` on every scene.

## References

- `references/render_recipes.md` — PIL compositing snippets, ffmpeg `zoompan` command, vignette numpy formula.
- `references/caption_library.md` — caption phrasings for common SaaS section types (dashboard, settings, generator, output, billing, integrations).