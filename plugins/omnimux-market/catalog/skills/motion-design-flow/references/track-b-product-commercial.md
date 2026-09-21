# Track B — Product Commercial (MDC8)

Premium product commercial reel — luxury / athletic / tech / editorial register. Single hero product preserved with engineering-grade consistency across 9 shots, anchored by a character sheet bible. Reference tier: Tom Ford / Cartier / BMW / Apple / ASICS / Salomon / Buck Studio / Pentagram editorial-technical.

Track B is the heavier of the two production tracks in motion-design-flow. Track A (default brand reel) lives in `motion-design-cases.md`; this file documents Track B end-to-end.

---

## When to use (Hard Rule #13 trigger)

Full phrase / reference-tier vocab / format-trigger list lives in `trigger-phrases.md § Track B Product Commercial triggers`. Plus: reference video URL → ffmpeg keyframe extract (Step 1 below).

If none of the triggers match — default to Track A (MDC1-MDC7 / MDC9). Track B is the heavier pipeline (4-7 gens vs Track A's 2-3 gens), only invoke when user is in commercial-grade territory.

---

## v1.8.0 — Character sheet vs Storyboard sheet chrome doctrine

Two distinct artifacts in Track B pipeline have DIFFERENT chrome doctrine:

| Artifact | Chrome doctrine | Reference |
|---|---|---|
| **Character sheet** (Step 2 below — production bible) | Full chrome ALLOWED — top bar with brand+sheet-version+product-category / per-view labels / palette swatches / material callouts / dimensions / model code | Track B Step 2 specification |
| **9-shot 3×3 storyboard sheet** (Step 5 below — production board) | Hard Rule #15 applies — brief panel labels only, NO top headers / NO TONE strips / NO STYLE strips / NO version tags | BRAMBLE-tier restraint |

**Why the asymmetry:** Character sheet is a production bible document — NOT a deliverable, NOT a storyboard. It exists as reference for downstream cross-shot consistency. Full chrome (palette swatches / material callouts / model code) is PURPOSE of character sheet doctrine — without it, the downstream scene-video pipeline loses the bible's metadata layer.

9-shot storyboard sheet IS a board sheet — Hard Rule #15 sheet chrome restraint applies (same doctrine as Track A 6-panel storyboard).

PHOTOGRAPHIC FRAME PURITY (Rule 10) applies INSIDE panel frames in BOTH artifacts — no `CHAPTER X` / `SECTOR Y` / version stamps INSIDE photographic frames in either character sheet panel cells or storyboard panel frames.

---

## Pipeline (7 steps — validated through 70+ production gens)

**Step 1 — Reference DNA decoding (only if reference video URL provided).** Extract aesthetic DNA via ffmpeg keyframe sampling at 1.5-2.5 fps. View 3-5 representative frames. Build DNA table mentally:

| Element | Capture |
|---|---|
| Aspect | Reference aspect → output aspect (often overridden by client to 16:9 / 9:16) |
| Duration | 15s default |
| Background | Pure pitch black void / atmospheric gradient / light gray studio |
| Lighting | Single source / multi-source / chiaroscuro level |
| Typography | Diegetic on product / graphic overlay / both |
| Material reading | Specular / absorption / texture hierarchy |
| Editing arc | Macro→wide→detail→hero / hyperkinetic vs contemplative |
| Signature beat | Exploded view / rock-wipe / dutch tilt / mandala spin |
| Palette | Monochrome / accent color / full color |
| Pacing | 0.8-2.5s per shot range |
| Reference tier | Tom Ford / BMW / Cartier / ASICS / Buck / Pentagram |

If no reference video — skip to Step 2 and infer DNA from brief tier vocabulary.

**Step 2 — Character sheet (`generate_image`, `model="gpt-image-2.5-sunburst"`).** Product bible for cross-shot consistency. Build the character sheet following the format spec described below. Pass the user's product photo as `@Image1` foundation (in `image_urls`). Single 16:9 4K image, light gray paper background `#DDDDDD`, 5 views horizontal row (single product) OR 6 views in 2×3 (two-colorway). Studio cyclorama lighting (NOT dramatic chiaroscuro — sheet must show product clearly across all angles). Hairline borders, monospace bold labels, brand+sheet-version+product-category top bar, color palette swatches + material callouts + dimensions + model code bottom section. (Use `gpt-image-2.5-sunburst` because the sheet is typography/label-heavy.)

```python
generate_image(
  prompt="<character sheet prompt — built following the Track B character-sheet format spec described in this file>",
  output_asset_id="product:character_sheet",
  image_urls=["product:main"],   # the user's real product photo asset id
  aspect_ratio="3:2",
  resolution="2K",
  model="gpt-image-2.5-sunburst"
)
```

Output asset id = `product:character_sheet`.

**Step 3 — 9-shot 3×3 storyboard (`generate_image`, `model="gpt-image-2.5-sunburst"`).** Pass character sheet as `@Image1` foundation (in `image_urls`). Single 16:9 4K image, light gray paper background, 9 thumbnails in 3×3 grid (validated optimal — 9 is the sweet spot between 6-shot fidelity and 12-shot detail loss). 16:9 horizontal aspect inside each thumbnail (matches deliverable). 3px black borders, gutters 28px, outer margin 40px. Above each thumbnail: shot number + timecode + scale tag. Below each: 3-line tech notes (SHOT / CAMERA / COLORWAY).

```python
generate_image(
  prompt="<9-shot storyboard prompt with scale alternation — built following the Track B storyboard structure described in this file>",
  output_asset_id="product:storyboard_9shot",
  image_urls=["product:character_sheet"],   # the Step 2 character sheet asset id
  aspect_ratio="3:2",
  resolution="2K",
  model="gpt-image-2.5-sunburst"
)
```

**9-shot anatomy for 15s (validated):**

| # | Type | Purpose | Pacing |
|---|------|---------|--------|
| 01 | WIDE atmospheric | Brand entry / arrival | 1.5-1.7s |
| 02 | EXTREME MACRO | Material detail #1 | 1.5-1.7s |
| 03 | MEDIUM 3/4 hero | Product establish | 1.4-1.7s |
| 04 | SPECIAL transition | Signature beat (rock-wipe / dutch tilt / exploded view) | 1.3-1.5s |
| 05 | MEDIUM hero | Reveal / secondary state | 1.4-1.7s |
| 06 | EXTREME MACRO | Material detail #2 (different element) | 1.5-1.7s |
| 07 | OVERHEAD god view | Geometric beauty | 1.5-1.7s |
| 08 | WIDE environmental | Tagline / context | 1.6-1.8s |
| 09 | MEDIUM endcard | Logo lock | 1.8-2.2s |

**CRITICAL: scale alternation rule.** Never two consecutive shots of the same scale/plane. Validated optimal sequence: `WIDE → MACRO → MEDIUM → SPECIAL → MEDIUM → MACRO → OVERHEAD → WIDE → MEDIUM`. Each neighbor = different plane. Macros separated by other scales. Same-scale neighbors produce "повторяющийся storyboard" failure ("storyboard слишком повторяющийся" — most common Track B iteration pitfall).

**Step 4 — Scene video (`generate_scene_video`, `backend="seedance"`).** Storyboard passed as `start_image`. Sandwich full-frame composition pattern (triple-layer positive prescription). Balanced ~600-word `motion` prompt (longer than Track A's 250-300 because 9 shots vs 6). 1080p quality is the native output (NEVER lower — letterforms break). **1 take DEFAULT (v1.7.15)** — a single scene-video take per Track B reel. N takes OPT-IN variance hedge when brief explicitly requests ("best-of-4" / "premium variants" / "× N takes" / "4 alternate cuts") — submit the same call N times. SFX only audio (no music in the `motion` prompt — music goes to post on a unified timeline).

```python
generate_scene_video(
  output_asset_id="product:final",
  start_image="product:storyboard_9shot",   # the Step 3 storyboard asset id
  motion="<~600-word balanced Track B motion prompt — built following the Track B clip-prompt structure described in this file>",
  duration=15,
  aspect_ratio="16:9",
  generate_audio=True,
  backend="seedance",
  scene_number=0
)
```

**IMPORTANT — the take-count hedge applies to Step 4 scene video ONLY (v1.7.15).** Never multiply Step 3 storyboard generation. One storyboard, then variance hedge (if opted in) on the scene-video step — resubmit the same `generate_scene_video` call N times. Multiplying the storyboard step produces N redundant storyboard sheets and zero scene video — wasted gens, broken pipeline.

**Step 5 — Best-of-N selection (only when N takes were opted in).** When user requested variance hedge and Step 4 produced N takes, evaluate them on these criteria, pick the winner. When 1 take default — Step 5 is implicitly the single scene-video output, no selection needed:

- **Product geometry consistency** across all 9 shots — silhouette, proportions, key features preserved. Character sheet's primary job is to anchor this.
- **Signature beat execution quality** — does the special transition shot (panel 04) actually pull off the rock-wipe / dutch tilt / exploded view, or did the video model flatten it to a plain cut?
- **Camera moves per shot reading distinctly** — each shot's named camera move (Bot&Dolly snap / motion-control dolly / lateral parallax / overhead boom) registers as visually different. No two shots feel mechanically identical.
- **Typography clean** — diegetic text readable, overlay text on shots 01/08/09 sharp, no gibberish on macro detail shots.
- **Background discipline** — pure void stays pure (no atmospheric haze leaked in), light gray studio stays evenly lit, gradient stays controlled.

If multiple variants pass — ship the cleanest. If all 4 fail same shot → Step 6 chapter regen.

**Step 6 — Chapter regen for weak shots (optional).** When the winner has 1-2 weak shots (say shot 04 signature beat fizzled, shot 07 overhead misaligned) — re-gen those specific shots as standalone `generate_scene_video` chapters. Chain via `start_image` + `end_frame` to lock entry/exit framing using surrounding shots' first/last frames as anchors (`end_frame` is Kling-only — set `backend="kling"` for chapter regens that need a locked exit frame). Stitch the regenerated chapters back into the winner timeline in your NLE. This is a per-chapter scene-video technique scoped to Track B Step 6 only — the broader production-keyframes-pipeline was removed v1.8.2.

**Step 7 — Editor assembly (external NLE).**
- Drop the winner scene video on the timeline
- Insert chapter regens if Step 6 was used (match their start/end frames to surrounding shots)
- Add unified music track over the timeline (NOT in the `motion` prompt — music there mismatches at chapter stitches)
- Color grade match across chapters if regens were inserted
- Export 1920×1080

---

## Lighting tier system

Pick one per reel — drives shot 02 / 06 macro detail framings:

| Tier | Background | Use case |
|---|---|---|
| **Pure pitch black void** | `#000000` solid black, NO atmospheric haze, NO visible light beams as graphic, NO dust motes, NO surfaces beneath. Light source OFF-frame. Sharp specular sculpting on product edges only. | Tom Ford / Cartier / Persol luxury chiaroscuro |
| **Atmospheric gradient** | Cool gray gradient `#1A1A1A → #2C2C2C`. Soft hero glow visible. Volumetric beam with dust motes (Cartier high jewelry style). Multi-source pro lighting. | Editorial depth — luxury watches, fragrances, high jewelry |
| **Light gray studio** | Off-white `#DDDDDD` soft gradient. Studio cyclorama. Clean directional key from upper-left. Soft shadows beneath product. Levitating product with scenic props (rocks / textures). | ASICS / Salomon / Nike athletic and lifestyle |
| **Validated premium light pattern** | Single hard top-light beam through silk softbox diffusion. Sharp specular sculpting on curved edges. Deep crushed shadows preserved. ARRI Alexa cinema grade with halation. Fine 35mm grain. | Default fallback when reference tier is mixed/premium |

---

## Typography discipline (Track B specific — overrides Track A Pattern A/B)

**Diegetic typography is primary.** Text lives ON physical product surface — laser-etched on case handle, wordmark on shoe midsole, embossed on rubber outsole, projected on volcanic rock surface. Treated as part of material, NOT graphic overlay. **Survives video animation cleanly** (the video model respects diegetic-on-surface vs frequently breaking floating text overlays).

**Graphic overlay typography STRICTLY limited to 3 shots:**
- **Shot 01 brand entry** — wordmark on rock face / background / projected on environment (often diegetic-feeling rather than pure overlay)
- **Shot 08 tagline** — mountain vista / wide environmental + tagline overlay (e.g. "ADD SPEED TO YOUR TRAIL RUN" massive bold sans-serif)
- **Shot 09 endcard** — logo lock with brand wordmark + optional tagline. Two-tier hierarchy: TIER 1 hero (massive white Helvetica Now Display Black 140-200pt all caps), TIER 2 tagline (medium white Helvetica Now Light tracked uppercase 40-50pt). ALL WHITE only, ZERO color.

**Shots 02-07 = pure product cinematography. ZERO graphic text.** Macro detail / hero / overhead / signature beat shots have NO overlay text. Only diegetic-on-product if applicable.

**Anti-pattern (breaks the video model):**
- Tiny text < 25-30pt → the video model renders gibberish
- Multiple text overlays simultaneously → letterforms collide
- Animated text mid-shot (letterforms morph) → break and corrupt
- Green text / colored typography → Track B is white-typography only
- Heavy HUD overlay graphics, wireframe schematics, plus-marker grids with measurement readouts — micro-text breaks

---

## Reference tier vocabulary

Pick one tier per reel — drives camera + light + pacing + palette:

| Tier | Camera | Light | Pacing | Palette |
|---|---|---|---|---|
| **Tom Ford / Persol / Cartier** (luxury / jewelry) | Slow contemplative motion-control | Pure pitch black void OR atmospheric gradient. Volumetric beam with dust motes. Multi-source. | Editorial slow tempo — 1.8-2.5s per shot | Monochrome (black + cool gray + white only) |
| **BMW / Apple** (premium dynamic) | Bot&Dolly motion-control. Surgically smooth high-speed dolly. Programmed easing. | ARRI Alexa cinematography. Clean precision. | 1.4-1.8s per shot, controlled speed ramps | Monochrome OR monochrome + single neon accent |
| **ASICS / Salomon / Nike** (athletic / lifestyle) | Motion-control dolly with rotational drift. Overhead boom. Lateral parallax. | Light gray off-white background. Levitating product with scenic props (rocks / textures). | 1.3-1.7s per shot, dynamic energy | Monochrome + neon accent (volt green / orange / cyan) on key feature |
| **Buck Studio / Tendril** (motion design) | Hyperkinetic camera vocabulary. Stutter cuts with time-freeze. Datamosh transitions. | Mixed — depends on art direction | 0.8-1.5s per shot, hyperkinetic | Brand-color led, often saturated |
| **Pentagram / Buck editorial-technical** | Motion-control with technical overlays | Studio bright. Technical labels visible. White hairline brackets. | 1.5-2.0s per shot | Editorial gray scale + technical accent |

---

## Pacing tiers

| Tier | Per-shot duration | Total shots in 15s |
|---|---|---|
| **Premium contemplative** (Tom Ford / Cartier register) | 1.5-2.5s | 6-9 shots |
| **Hyperkinetic** (Buck / sport / tech) | 0.8-1.5s | 9-12 shots |

Match pacing to reference tier — Tom Ford slow vs ASICS dynamic. Mismatched pacing (slow Tom Ford vibe with 0.8s shots = jittery) is a top-3 Track B failure mode.

---

## Color palette discipline

| Palette | Use |
|---|---|
| **Monochrome (luxury default)** | Black + cool gray + white only. Zero color anywhere. Premium tier reading. |
| **Monochrome + neon accent** | Black + white + ONE neon (volt green / orange / cyan). Sport / tech / gaming. Accent on key product feature only (laces / button / detail). |
| **Editorial gray scale** | Off-white + cool gray + black + white. Lifestyle / fashion. Atmospheric depth. |

**Avoid:** multiple color introductions mid-spec, color drift between shots, generic "colorful" without specific palette.

---

## Signature beats catalog

Use shot 04 SPECIAL TRANSITION slot:

| Beat | Description | Best for |
|---|---|---|
| **Exploded view suspended** | Components float disconnected mid-air, frozen | Premium watch / case / camera (when product has interesting internal anatomy) |
| **Bullet-time orbit** | Camera 360° around frozen suspended scene | Dramatic beat after exploded view |
| **Rock-wipe transition** | Foreground rock / element passes across frame, occludes briefly, reveals different state of product (e.g. colorway B emerges) | Two-product / two-colorway reveal |
| **Dutch tilt 30°** | Kinetic editorial diagonal composition | Fashion / lifestyle / sport |
| **360° spin color-morph** | Single object 360° rotation, transforms colorway through the spin | Two-colorway product |
| **Match cut** | Identical composition, different state / color | Premium transition between similar shots |
| **Top-down mandala spin** | Geometric god view rotation | Beauty / breath beat between intense shots |
| **Impact drop slow-mo** | Object hitting surface with dust eruption | Durability proof (sneaker, watch case, helmet) |

---

## Anti-vocabulary (creates cheap chaotic feel — never use in Track B)

- ❌ "Violent crash"
- ❌ "Lightning fast" (overuse)
- ❌ "Random handheld shake"
- ❌ Generic "chaos"
- ❌ "Motion blur as graphic overlay" (looks like AE preset)
- ❌ "Light streaks rendered as graphic effect"
- ❌ "Speed ramps faked through static motion blur"
- ❌ "Particle trails as 2D overlay"

→ Replace with: motion-control precision / premium dynamic / surgically smooth / Bot&Dolly Iris robotic arm precision / programmed orbital sweep / camera-driven push-through.

---

## Per-shot rule (Track B specific)

**ONE clear action + ONE camera move per shot.** Not three. Don't combine "rotates while orbits while zooms" → fails. The ASICS-style brief discipline:
- ACTION: what subject is doing
- CAMERA: how camera is moving
- LIGHT: what illumination does this shot

These three slots per shot, no mixed actions or stacked camera moves.

---

## Production parameters (Track B specific)

```yaml
storyboard:                # generate_image
  model: "gpt-image-2.5-sunburst"     # typography/label-heavy character sheet + 9-shot board
  aspect_ratio: "3:2"
  resolution: "2K"

video:                     # generate_scene_video
  backend: "seedance"
  aspect_ratio: "16:9"     # default for product commercial; vertical 9:16 supported but rare for Track B
  duration: 15
  generate_audio: true
  takes: 1                 # DEFAULT — a single scene-video take per Track B reel (v1.7.15)
  # takes: 4               # OPT-IN best-of-N variance hedge — resubmit the same generate_scene_video
                           # call N times, ONLY when brief explicitly requests variance hedge
                           # ("best-of-4" / "premium variants" / "× N takes" / "4 alternate cuts").
                           # Default × 1 keeps Track B affordable while preserving the opt-in escape hatch.
```

**Cost calculation (v1.7.15 default — 1 take):**
- 1 character sheet + 1 storyboard + 1 scene-video take = **3 generations** per Track B reel
- Previously (4 takes default): 6 generations per reel = 2× cost
- Opt-in 4 takes still available for premium production when explicitly requested

**SFX-only audio rule:** music goes to post on a unified timeline. In-video music mismatches between shots when generating multiple takes (when N takes opted-in) — the music drift across stitched chapters is the bug.

Acceptable SFX descriptions in the `motion` prompt:
- "Deep low rumble" (impact moments)
- "Subtle whoosh" (camera moves)
- "Atmospheric room tone"
- "Sharp glass impact sounds"
- "Bass impact on whip-pan transitions"

❌ NO dialog, NO voiceover, NO music in commercial prompt.

---

## Validated failure modes for Track B

- **Sunglasses + storyboard sheet (thin frame geometry)**: drifts in small thumbnails. After 13 iterations failed across both `gpt-image-2.5-sunburst` and `nano-banana-2`. Solution: pivot to W2 modular pipeline (individual full-4K hero shots) OR pivot product entirely.
- **Multi-thumbnail grid > 12 shots**: each thumbnail too small. **9 shots in 3×3 grid is the optimal balance** — validated through 70+ production gens.
- **Dual-ref (character sheet + storyboard at once)**: confuses model. Use single ref `image` role — storyboard ref already encodes character sheet visually.
- **3+ iterations same approach failing**: honest format/product ceiling signal. Real options: pivot product, W2 modular, or skip storyboard.

**Cost (v1.7.15 default — 1 take):** 1 character sheet + 1 storyboard + 1 scene-video take = **3 gens** (vs Track A's 2-3 gens — now cost-parity with Track A default). Track B with opt-in N-take variance hedge: 1 + 1 + N gens. Use opt-in only when brief explicitly requests variance hedge for premium production.
