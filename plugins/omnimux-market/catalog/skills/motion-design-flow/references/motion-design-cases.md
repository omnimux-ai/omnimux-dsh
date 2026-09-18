# Motion Design Cases (v2.1)

The four reel modes. Pick via SKILL.md Step 0a, then resolve image source via Step 0b (image-gate OR foundation generator), then follow the per-mode pipeline.

| Case | Mode | Pipeline | Master camera |
|---|---|---|---|
| **MDC8** | Product Reel | character sheet → 9-shot 3×3 → scene video | Motion-control roboarm precision / Mode A Slow Elegant |
| **MDCM** (v2.8) | Classic Motion Design | Stage A 4-up moodboard → user picks → Stage B 6-panel storyboard in picked style → scene video x2 takes | Adaptive — depends on picked style (kinetic if HM-leaning / internal-choreography if editorial / etc) |
| **MDH** | High Motion Reel | 6-panel 3×2 storyboard → scene video | HYPERKINETIC CHAOS default |
| **MDT** | Typography Reel | 6-panel 3×2 storyboard → scene video (or N keyframes + AE-post for letter morphing) | Internal choreography primary |
| **MDI** | Infographic Reel | 6-panel 3×2 storyboard → scene video | Internal choreography primary |

All four modes share: HR-1 image source resolution (HR-1a image-gate when image attached / HR-1b foundation generator when not — both bypass for Product Reel), HR-2 MIN-TEXT, HR-3 REALISM BAN (except Product Reel), HR-4 Pattern A/B/Hybrid, HR-5 punch-line discipline, HR-6 named camera + transition, HR-7 sheet chrome tier, HR-8 Visual World Lock, HR-9 palette LOCK, HR-10 tail freeze, HR-11 cliché ban.

**Foundation generator (HR-1b, v2.1)** — MDH / MDT / MDI users who don't attach a foundation image are offered a 2-up parallel generation (`generate_image` with `model="nano-banana-2"` + `generate_image` with `model="gpt-image-2"`) before the storyboard step. Picked image(s) carry into the storyboard with build-from-this default semantics. Full procedure in SKILL.md Step 0b Branch B. Product Reel does NOT participate — if no product photo attached, Product Reel stops and asks user to attach (cannot fabricate the user's actual product).

---

## MDC8 — Product Reel (Track B Product Commercial)

**DOCTRINE FROZEN in v2.0.** Product Reel pipeline + lighting tiers + reference tier vocabulary + signature beats + Track-B-specific production parameters live in `track-b-product-commercial.md` (unchanged from v1.8.x). Only the global HR-2 MIN-TEXT RULE applies as a surgical addition.

**Use case (quick reference):** Premium product commercial reel — luxury / athletic / tech / editorial register. Character sheet → 9-shot 3×3 storyboard → scene video (1 take default, N takes opt-in). Reference tier: Tom Ford / Cartier / BMW / Apple / ASICS / Salomon / Buck Studio / Pentagram.

**HR-3 REALISM BAN exception:** Product Reel is the ONLY mode where photoreal humans / documentary register / cinema lens vocabulary is allowed. Model holding / wearing / using the product, photoreal environment around the product, ARRI Alexa / 35mm grain / iPhone editorial — all permitted here.

**HR-1 image-gate exception:** Product Reel does not run the image-gate ask. Product photo is always the hero by design; the pipeline operates on it via the character sheet step (no "style ref vs build from this" disambiguation needed).

**HR-1b foundation generator NOT allowed for Product Reel.** If user attempts Product Reel without attaching a product photo, STOP and ask user to attach (or switch to High Motion Reel which CAN use foundation generator). Strict guard against fabricating a generated product that doesn't match the user's actual brand asset. See SKILL.md Step 0b Branch D.

**HR-2 MIN-TEXT applies:** any text rendered inside frames of the 9-shot sheet must be ≥headline cap-height of "cities" baseline. Diegetic typography (text rendered on the product / environment) and overlay typography (strict positions 01 / 08 / 09 per existing MDC8 doctrine) both respect this minimum.

**See `track-b-product-commercial.md` for:** 7-step pipeline (DNA decoding / character sheet / 9-shot 3×3 board / scene video / best-of-N selection / chapter regen) · 9-shot anatomy + scale alternation rule · lighting tier system · diegetic + overlay typography discipline · reference tier vocabulary · pacing tiers · color palette discipline · signature beats catalog · anti-vocabulary · validated failure modes.

---

## MDCM — Classic Motion Design (DEFAULT entry — v2.10)

**v2.10 status:** MDCM is the **default entry point** for motion-design-flow. When the brief has no explicit specialized trigger (no `kinetic` / no `product reveal` / no `typography` / no `infographic` / no Track B reference-tier vocab), routing goes directly to MDCM — no mode picker, no clarify-gate. Specialized modes (MDH / MDT / MDI / MDC8) activate only when explicit triggers present. See SKILL.md Step 0a for trigger table.

**Use case:** Generic 2026 motion design reel for product/service WITHOUT specific aesthetic direction or image references. The catch-all DEFAULT mode for "make me a motion ad for X" style briefs. The agent auto-generates a 4-up Behance/Dribbble style moodboard, user picks one style, storyboard renders strictly in that style.

**The mode for users who:**
- Have a product/service to advertise but no fixed visual identity
- Want surprise / random current motion design style
- Don't want to attach reference images (the brief is "make me something good")
- Don't want kinetic/peak-action (MDH) or text-as-subject (MDT) or data viz (MDI) specifically — just generic motion design ad

**Pipeline:** Stage A (4-up moodboard via `generate_image`) → user picks one of 4 / regen / skip → Stage B (6-panel storyboard with picked style as @Image1 reference) → Stage C scene video x2 takes (default v2.5).

**Cost:** 1 moodboard `generate_image` + 1 storyboard `generate_image` + 2 `generate_scene_video` takes = 4 gens.

### MDCM characteristics

- **No image refs required** — Stage A auto-generates style. If user has image, route them to MDH/MDT/MDI/Product Reel instead (where image actually drives output).
- **Style is random / current 2026** — Stage A is fixed-prompt with optional user hint. Output is moodboard of 4 DIFFERENT random motion design styles in 2026 register (Behance / Dribbble / current trend) — each frame is a distinct style with its own palette, texture register, and energy. Each beautiful in its own way. NOT a monostyle 2×2 — 4 distinct style options as a menu.
- **Mode-agnostic register** — picked style could be 2D flat / kinetic typography / abstract liquid / editorial poster / glassmorphic / brutalist / collage / 3D / illustrated — depends on what Stage A randomly generates.
- **Text on 3 of 6 panels** — Pattern A {01,03,05} default for MDCM (text leads atmospheric beats). Pattern B opt-in if brief explicitly asks.
- **Direct like a motion design genius** — Stage B prompt explicitly instructs concept arc that TRANSFORMS across 6 panels (hook → develop → reveal), not 6 disconnected decorations.

### MDCM pipeline (full)

**Step 0 — Routing.** the agent detected MDCM via Step 0a (motion design / motion reel / motion graphics ad / Behance / Dribbble / AE-style / vague-motion-ad brief) OR fallback from Step 0b Branch B "Classic Motion Design" pick.

**Step 0c-0d — Clarify-gate + aspect.** Same as other modes. If brief too vague — clarify-gate fires first.

**Stage A — Generate 4-up moodboard.** Fixed English prompt to `generate_image` (see SKILL.md Step 0g for full prompt). Aspect 3:2 for moodboard regardless of Step 0d (moodboard is a menu, final video aspect comes from Step 0d).

**Stage A.2 — User picks style.** `AskUserQuestion` with 6 options (4 styles + regen + skip). See SKILL.md Step 0g.2 for question text.

**Stage B — Storyboard.** `generate_image` with @Image1 = stage A moodboard (passed in `image_urls`), prompt explicitly tells which style position to pick (top-left / top-right / bottom-left / bottom-right) and lock to it strictly. Stage B aspect follows Step 0d.

**Stage C — Scene video.** Standard clip-prompt structure via `generate_scene_video`. 2 takes default. Master camera doctrine = whatever picked style implies (kinetic if style is hyperkinetic / static-internal-choreography if style is editorial poster / etc — adaptive per picked register).

### MDCM anti-patterns (v2.11 foundation semantics)

- ❌ **Using user's attached image as Stage A moodboard** — if user attached image, route to MDH/MDT/MDI (image-gate) or Product Reel. MDCM is the no-image path. If user wants their image to dictate the foundation, that's MDH build-from-this branch, not MDCM.
- ❌ **Skipping Stage A.2 user-pick** — never silently pick a frame from 4-up moodboard. ALWAYS fire `AskUserQuestion` (HR-13). Stage A is a menu, not a guess.
- ❌ **Mixing 2 frames from moodboard inside ONE storyboard as foundation** — pick ONE of 4 only per storyboard. Stage B prompt builds FROM single picked frame; never "blend top-left and bottom-right foundations" in one sheet. (Multi-frame branch where each separate storyboard uses a different position = legitimate, see HR-12.)
- ❌ **6 panels each rendered in DIFFERENT moodboard frame** — picked frame foundation applies to ALL 6 panels of one storyboard. Subject/material/palette/atmosphere all locked from picked frame across the reel.
- ❌ **6 identical copies of picked frame** — Scene Variation Mandate (HR-8 sub-rule) requires 6 DIFFERENT moments/scales/angles WITHIN the picked frame's visual world. Subject LOCK ≠ Same-Scene LOCK. Each panel = new scene context (different angle / different supporting element / different interaction setup / different micro-environment) within the same foundation world.
- ❌ **Subject from user brief instead of picked frame** (v2.11 critical) — this was the OLD v2.8-2.10.1 reference semantics. In v2.11 foundation: subject comes from PICKED FRAME, not user brief. User brief contributes brand wordmark (P06 only, if brand name present), text beats (atmospheric punch-lines fitting the frame's world), narrative arc tone. The picked frame contributes subject, material, palette, atmosphere, composition energy.
- ❌ **Hallucinated brand wordmark when brief has no brand** — if user brief doesn't mention a brand name, panel 06 is a pure atmospheric closer in the foundation world. Do NOT invent a brand. Do NOT use a placeholder wordmark. Pure aesthetic motion-design reel, foundation expansion only.

### MDCM anti-pattern — Stage B text-only shortcut (v2.10, validated failure)

The single most damaging MDCM regression — the agent generating Stage B storyboards without passing the Stage A moodboard asset id in `image_urls`. Validated in v2.9 smoke-test (May 2026).

**Failure context.** User responded to Stage A.2 with freeform multi-pick ("все 4, по одному в каждый, один задублируй") instead of single-pick option. The agent had the moodboard's `output_asset_id` in hand. Instead of running multi-style branch with the same moodboard asset id passed in `image_urls` on all 5 Stage B calls, the agent wrote text-only style descriptions ("Buck 3D dark cinematic / Ordinary Folk illustrated / Tendril abstract / MVM glassmorphic") into each Stage B prompt body and called the tool with empty `image_urls`. Resulting storyboards were AI's interpretation of style names, not lock to actual moodboard frames.

**Root cause from agent self-diagnosis:** the standard Stage B branch was written for single-pick. Multi-pick was an unhandled freeform case. Without an explicit branch, the agent took a cognitive shortcut — "I remember how the 4 styles look, I'll just describe them in words" — instead of recognizing the mechanical fix (same moodboard asset id in `image_urls`, different position lock per call).

**WRONG (validated failure):**

```python
# storyboard 1 (and 4 more like it) — empty image_urls = HARD VIOLATION
generate_image(
  prompt="Storyboard for X. Render in sculptural 3D dark cinematic Buck Studio style — heavy chiaroscuro, polished material, deep void background.",
  output_asset_id="storyboard1:sheet",
  image_urls=[],  # ← HARD VIOLATION
  aspect_ratio="16:9", resolution="2K", model="gpt-image-2"
)
# ... 4 more with text-only style descriptions, no moodboard asset passed
```

**RIGHT (v2.11 foundation multi-frame branch):**

```python
# storyboard 1 — TOP-LEFT foundation
generate_image(
  prompt="6-panel storyboard sheet generated FROM @Image1. BUILD FROM the TOP-LEFT frame of @Image1 as foundation — preserve its subject, material, palette, atmosphere across all 6 panels. Scene variation: 6 different moments/scales/angles WITHIN the picked frame's world. Brand wordmark on P06 only if brief mentions brand.",
  output_asset_id="storyboard1:sheet",
  image_urls=["moodboard:sheet"],   # the Stage A moodboard asset id
  aspect_ratio="16:9", resolution="2K", model="gpt-image-2"
)
# storyboard 2 — TOP-RIGHT foundation
generate_image(
  prompt="6-panel storyboard sheet generated FROM @Image1. BUILD FROM the TOP-RIGHT frame of @Image1 as foundation — preserve its subject, material, palette, atmosphere across all 6 panels...",
  output_asset_id="storyboard2:sheet",
  image_urls=["moodboard:sheet"],   # SAME moodboard asset id
  aspect_ratio="16:9", resolution="2K", model="gpt-image-2"
)
# ... 3 more with the same moodboard asset id in image_urls, different position foundation phrases
```

**Why:** text style description ≈ averaged AI concept. Image foundation = exact subject/material/light/composition from the picked frame. The whole point of Stage A is to commit to ONE visual — text-only Stage B throws that commitment away. v2.11 foundation goes further than v2.10 style-ref: the picked frame's SUBJECT carries forward, not just its style.

**Mechanical defense (HR-12 in SKILL.md):** pre-flight checklist before every Stage B call asserts `image_urls` non-empty AND prompt contains `"BUILD FROM"` + `"foundation"` + explicit position name. Empty `image_urls` = abort. Missing foundation-build phrase = abort.

### MDCM vs MDH disambiguation (v2.10 — explicit trigger gate)

- **MDH High Motion** — brief has EXPLICIT kinetic / peak-action / energy / sport / hyperkinetic / `kinetic brand reel` / `high motion reel` trigger word. The agent generates HYPERKINETIC CHAOS storyboard with peak-action per panel.
- **MDCM Classic Motion Design (DEFAULT)** — brief says "motion reel" / "motion ad" / "сделай моушн дизайн" / "do something cool" / "video for X brand" WITHOUT explicit specialized trigger. The agent auto-generates moodboard, user picks, register can be anything from gentle editorial to hyperkinetic — depends on user's pick. **In v2.10 this is the DEFAULT — no ambiguity ask.**

**v2.10 routing tie-breaker:** when in doubt about whether brief has explicit kinetic trigger, lean toward MDCM default (the user can pivot to MDH explicitly on the next turn after seeing the moodboard). Do NOT default-trigger MDH just because brief mentions a brand vaguely — MDH requires explicit kinetic-energy language.

---

## MDH — High Motion Reel

**Use case:** Brand identity launch with maximum kinetic energy. Peak-action moments, hyperkinetic camera, big display headline typography, brand-DNA material identity, smash transitions. The default register for brand reels in v2.0.

**Pipeline:** storyboard (`generate_image`) → `generate_scene_video` with full storyboard as start_image. 1 storyboard + 1-2 scene-video takes = 2-3 gens.

**Reference register (per `reference-tier-matrix.md`):** Tier 1 Premium 3D motion design default (Buck / ManvsMachine / Block & Tackle / Sucuk und Bratwurst / Polygon1993 / Tendril). Tier 3 Illustrated motion acceptable for playful brand domains (chibi mascot food delivery, kawaii CPG). NEVER Tier 4 photographic cinematic (HR-3 REALISM BAN).

**Validated High Motion benchmarks (palette differs per brand-DNA, kinetic LANGUAGE is shared):**

| Benchmark | Brand domain | Palette / material world | Kinetic signature |
|---|---|---|---|
| **BRAMBLE** | luxury perfume | chrome thorns · purple-pink · pitch black void | thorns breaking ground / spiked perfume bottle / thorn crown silhouette / corridor of thorns / hand with thorny nails / thorny wordmark |
| **DRIFT** | food delivery (chibi mascot) | green palette · chibi 3D character · food splash motion | mascot riding green sauce wave / avocado mid-splash / mascot delivering bowl / salad splash / mascot pose / wordmark with mascot |
| **MOVEMENT / BODY KNOWS** | athletic / dancewear | yellow + purple Gen-Z palette · stylized silhouette dancers · neon motion streaks | dancer mid-jump with light streaks / shoe macro with streaks / dancer crew silhouette / dancer mid-fall / dancer mid-crouch / 6-panel grid → wordmark |
| **PIERCE** | energy drink | electric voltage current · neon yellow + jet black | arrow shatter / chain pulse / can splash / silhouette lightning / wordmark with voltage |
| **RUSH** | energy drink | plasma material · pink + cyan · industrial environment | plasma forms / lightning between objects / can with plasma trail / silhouette in plasma cloud / wordmark |

**Common kinetic language across all High Motion benchmarks:**
- Frozen peak-action moment per shot (subject at apex of jump / splash / explosion / shatter / streak)
- Big display headline typography in motion ("MOVE NOW.", "WEAR THE THORNS.", "EAT SHARP.", "BUILT TO MOVE.") — never panel-caption-size labels (HR-2)
- Saturated brand-DNA palette + void / solid color background — environment supports the subject impact, not competes with it
- Hyperkinetic camera vocabulary (CRASH-OUT REVEAL / SHATTER PUSH-THROUGH / WHIP-PAN SMEAR / HYPERKINETIC ORBITAL SWEEP / DROP-DIVE PAST / VERTIGO PULL / speed ramps / stutter cuts / frame-freeze)
- Match-cut between panels, NEVER cross-fade
- 6-panel 3×2 sandwich — Panel 06 = brand wordmark reveal (R-type from the Brand Reveal Catalog, R1-R8)

### MDH pipeline

**Step 0 — Image source (SKILL.md Step 0b).**
- Image attached → HR-1a image-gate. Style ref → TAKE-6 atmospheric extraction. Build from this → subject locked through 6 panels.
- No image attached → HR-1b foundation generator (Step 0b Branch B). 3-up parallel fan-out → user picks → picked images carry as build-from-this through 6 panels (style-ref override only via explicit "use as style ref" phrase in original brief).
- User declined foundation generator → text-to-storyboard (no `image_urls`), Step 0e style direction asks for "describe atmosphere in words" or "pick default by domain".

**Step 1 — Storyboard via `generate_image`.** 6-panel 3×2 sheet. Inject:
- **Visual World Lock** (HR-8) — Subject / Material / Style triple + Scene Variation. Each panel = different scene context within locked subject world. Scale spread ≥3 distinct framings.
- **Master camera = HYPERKINETIC CHAOS** — peak-action moment per panel. Subject at apex of motion: mid-jump, mid-splash, mid-shatter, mid-explosion, mid-streak.
- **Reference tier** (HR-3) — Tier 1 Premium 3D motion design default. NEVER Tier 4 photographic.
- **Brand-DNA material identity** — extract uniquely-this-brand material essence. NOT generic genre default.
- **HR-7 sheet chrome tier (b) PANEL-CAPTIONS** default — kinetic register matches tier (b). Tier (a) MINIMAL acceptable for restraint registers.
- **HR-2 MIN-TEXT** — every in-frame text element ≥ headline cap-height. No tracked monospace sub-labels.

**Step 2 — Scene video (`generate_scene_video`).** Use storyboard asset id as `start_image`. Full clip-prompt structure:
- Per-shot: STATIC / CHOREOGRAPHY / TEXT / TRANSITION / AUDIO / LIGHT / PARALLAX
- Master camera doctrine = HYPERKINETIC CHAOS — VERTIGO PULL / CRASH-OUT REVEAL / SHATTER PUSH-THROUGH / DROP-DIVE PAST / MATCH-FRAME SWING / HYPERKINETIC ORBITAL SWEEP / WHIP-PAN. Speed ramps + stutter cuts + frame-freeze acceptable.
- Match-cut transitions between shots — DRAMATIC OBJECT MORPH / DRAMATIC LIGHT SWEEP / DRAMATIC PARTICLE DISSOLVE / DRAMATIC COLLAPSE / DRAMATIC UNFURL / DRAMATIC PUSH-THROUGH
- TEXT PERSISTENCE locking for the full shot duration on text panels
- Tail freeze 13.7-15s pixel-identical
- Audio = cinematic whooshes + bass impact hits + prismatic flares + glass-clink hits + rising synth tension — SFX-only mix throughout

**Step 3 — Post-production (external to skill).** User handles music track / scale-pop / motion blur / whoosh SFX at transitions in their NLE of choice.

**Cost:** 1 storyboard + 1-2 scene-video takes = 2-3 gens.

### MDH ambient density requirement

Pure peak-action subject on void = flat AE-template feel even when subject is well-animated. Every panel needs at least 2 ambient fill layers behind the subject (NOT counting the subject itself):
- Particle drift (sparks / dust / streak particles / atmospheric haze)
- Background gradient breath (palette saturation cycle)
- Volumetric beam (rim light / god-rays / spot)
- Surface texture (concrete / sand / liquid pool / mirror floor)
- Foreground depth element (out-of-focus prop in front of subject)

With 2+ ambient layers per panel, the frame has space for camera to move through and atmosphere to breathe.

### MDH anti-patterns

- ❌ Photoreal humans (HR-3 — replace with silhouette / stylized 3D / illustrated / abstract form)
- ❌ Tier 4 photographic cinematic register — even if brand is athletic / fashion / luxury
- ❌ Cross-fade between panels — High Motion uses match-cut only
- ❌ Slow-elegant camera as default — that's Mode A; High Motion is Mode B HYPERKINETIC by default
- ❌ Tracked monospace sub-labels below headlines (HR-2 MIN-TEXT)
- ❌ Single hero on empty void for 6 panels (HR-11 cliché)
- ❌ Generic Y2K chrome / pink-yellow chrome bevel / centered POW-BAM (HR-11 AE-template ban)
- ❌ 6 disconnected environments (HR-8 Visual World Lock)
- ❌ Brand wordmark on multiple panels (HR-5 — once only)

---

## MDT — Typography Reel

**Use case:** Text IS the visual subject — letters / words / wordmarks actively transform per panel. NOT static-object-photography with text printed on a surface.

**TYPE-AS-SUBJECT mandate (v2.5, critical doctrine):** typography reel means TYPE itself does the work — letters morph / bleed / build / scale / fragment / form-from-particles / transform between panels. The TYPE is what the camera frames as primary subject, not a book / poster / page that happens to have text on it.

Examples of CORRECT MDT subject treatment:
- Massive single letter filling 60% of frame, mid-rotation, material identity carrier (BRAMBLE-style "letterform forged from material world")
- Ink-bleed forming "SLOW." over 2 seconds with stroke-by-stroke draw-on
- Letterforms shattering into particles that re-form into next word
- Vertical type column scaling up from frame-bottom
- Type kerning / tracking actively shifting across panel duration
- Typography composition where letterforms ARE the visual subject, no other competing object

Examples of WRONG MDT subject treatment (v2.5 banned — validated SLOW READ regression):
- ❌ Book object photographed × 6 panels with text printed on inner pages — that's product photography of a book, NOT typography reel
- ❌ Poster object photographed × 6 panels with type printed on surface — same regression
- ❌ Page-turn transitions where type is just "text on paper" not active subject
- ❌ Object-with-text-on-it composition (mug-with-text / sign-with-text / book-with-text / coffee-cup-with-text)

If brief asks for "calm editorial book vibe" — render TYPE in editorial register (Penguin / Faber & Faber-style typography with paper texture and ink-bleed), NOT a book photographed.

**Two valid sub-registers:**
1. **2D editorial display** — Anthropic-style typography reel. Halftone, paper texture, restrained palette, hand-feel discipline, editorial concept poster register. Tier 2 Editorial poster. TYPE is rendered AS editorial composition (massive letterforms filling frame), not "book photographed with text inside".
2. **Kinetic display 3D** — AE-style smash typography in stylized 3D material identity. Sucuk und Bratwurst / Polygon1993 / Buck Studio register. Tier 1 Premium 3D motion design.

**Pipeline default:** storyboard (`generate_image`) → `generate_scene_video` with full storyboard as start_image. 1 storyboard + 1-2 scene-video takes = 2-3 gens (v2.5 default 2 takes — see SKILL.md production parameters).

**Pipeline for active letter-morphing:** N production keyframes (`generate_image`) → external post-production for letter-morph transitions. The video model cannot animate individual letterform construction natively — for required morphing use T3 post-text strategy + external transitions on top of static keyframes.

### MDT pipeline

**Step 0 — Image source (SKILL.md Step 0b).**
- Image attached → HR-1a image-gate. Style ref → TAKE-6 atmospheric extraction (palette, paper texture, type register, atmosphere). Build from this → subject typography preserved as concept anchor across 6 panels.
- No image attached → HR-1b foundation generator (Step 0b Branch B). 3-up parallel fan-out → user picks → picked images carry as build-from-this through 6 panels.
- User declined foundation generator → text-to-storyboard (no `image_urls`), Step 0e style direction asks for atmosphere-in-words or default-by-domain.

**Step 1 — Storyboard via `generate_image`.** 6-panel 3×2 sheet. Inject:
- **Sub-register** — 2D editorial (Tier 2) OR Kinetic 3D (Tier 1). Pick from brand domain + brief language.
- **Type IS visual subject** — text occupies meaningful frame mass per panel, not a tiny caption layer
- **Conceptual escalation across text beats** (HR-5 text-string count + escalation per the TEXT-ANCHOR MANDATE) — each beat advances brand voice on a new semantic level (Invitation → Verb action → Revelation → Absolute claim → Identity). Parallel synonyms = FAIL.
- **HR-2 MIN-TEXT** — every visible text element ≥ headline cap-height. Latin sub-labels, tracked monospace dates, location tags = stripped.
- **HR-7 sheet chrome tier (c) FULL** default for 2D editorial (Anthropic register); tier (a) MINIMAL or (b) PANEL-CAPTIONS for kinetic 3D depending on register.
- **Brand-DNA material identity** — the typography material IS the material identity (R1 material assembly from the Brand Reveal Catalog). Lightning current as material substance for energy-drink type, NOT generic Y2K chrome.

**Step 2 — Scene video (`generate_scene_video`).** Master camera = internal choreography primary. Camera HOLDS (drift lock-on default), typography animates within frame. Type kinetics > camera kinetics. Layered reveals, scale contrast, parallaxed type motion, controlled emphasis rhythm.
- **Text Reliability:** T1 if 2-4 word atmospheric beats (typical). T3 (post-text recommended externally) if dense kinetic typography with required letter morphing.
- Match-cut transitions still required between shots — HALFTONE MORPH / INK FLOW / DRAMATIC UNFURL / DRAMATIC LIGHT SWEEP / type-as-particle dissolve.
- Tail freeze 13.7-15s pixel-identical.

### MDT ambient density requirement

Pure text-on-void renders as low-budget AE template look in video. Every text panel needs at least 2 ambient fill layers behind typography:
- Particle field (paper dust drift / electric debris / atmospheric haze)
- Environmental texture (concrete wall / paper grain / arcade scanlines / club floor sheen)
- Glitch artifacts (RGB chromatic aberration / scanline tearing / pixel-jitter as ambient texture)
- Volumetric beam (soft directional light through frame creating depth)
- Negative-space element (subtle abstract form in deep background)

Ambient fill layers give the motion something to play against — particle drift, beam sweeps, scanline pulses become motion sources alongside the type impact.

### MDT Scene Variation hard rule (v2.6 NEW)

**Each of 6 panels MUST be a distinct typographic moment** — different WORD / PHRASE content + different scale + different visual treatment. NEVER 6 variations of the same wordmark.

**Required per-panel distinction across 3 dimensions:**

1. **CONTENT** — different words/phrases per panel. Each panel renders different copy. Example correct: P01 "BEAUTIFUL" / P02 single letter "A" / P03 "TYPOGRAPHY" / P04 "TYPE IS ALIVE" / P05 "MOVE" / P06 "BEAUTIFUL TYPOGRAPHY" wordmark closer. **NOT correct: P01 "BEAUTIFUL TYPOGRAPHY" different angle / P02 "BEAUTIFUL TYPOGRAPHY" macro / P03 "BEAUTIFUL TYPOGRAPHY" shatter / etc — that's 6 takes of same wordmark, banned (validated BEAUTIFUL TYPOGRAPHY regression)**.

2. **SCALE** — extreme macro (single letter at 95%) / close detail (single word at 60%) / medium (phrase at 35%) / wide (typographic landscape with multiple words) / vista (aerial-of-type-as-environment) / wordmark lockup. At least 4 distinct framings across 6 panels.

3. **VISUAL TREATMENT** — different "what's happening with the type" per panel:
   - One panel: type-as-character (letters with limbs / smiley faces / personality)
   - One panel: type-as-landscape (letters with foliage / weather / environment growing from them)
   - One panel: type-mid-transformation (shattering / re-assembling / bleeding / particles)
   - One panel: type-as-architecture (vertical column / stacked composition)
   - One panel: type-with-gestural-accents (squiggles / brush splatters / abstract marks around)
   - One panel: clean lockup endcard

If brief asks for a typography reel BUT mentions only one wordmark (e.g. "reel for BEAUTIFUL TYPOGRAPHY") — the agent MUST INVENT supporting copy for non-final panels (atmospheric beats, action-verb fragments, secondary type-as-subject moments) rather than render 6 variations of the single wordmark. The wordmark lockup is the FINAL panel only — the other 5 panels develop the typographic concept through different copy / scale / treatment.

### MDT anti-patterns

- ❌ **6 variations of same wordmark across all panels** (v2.6 critical ban) — BEAUTIFUL TYPOGRAPHY regression. NEVER render same word/phrase 6 times in different framings. Each panel must have distinct content + scale + treatment.
- ❌ **Static-object-photography with text printed on surface** (v2.5 critical ban) — book / poster / page / mug / sign photographed × 6 panels with type on them = NOT typography reel. TYPE must be the SUBJECT (massive letterforms filling frame, actively transforming per panel), not "object that has text on it"
- ❌ Photoreal humans (HR-3) — even if brief uses "documentary editorial register"; route that to Product Reel
- ❌ Comic POW-BAM / radial explosion bursts / shard debris / halo glow auras (HR-11 AE-template ban)
- ❌ Pink chrome bevel + yellow center as generic energy-drink typography (HR-11)
- ❌ Centered POW-BAM compositions — off-grid (60/40 or 70/30 split) instead
- ❌ Parallel synonym text beats (POWER / HIT / NOW = banned; escalation arc required)
- ❌ Latin metadata sub-labels below headlines (HR-2 MIN-TEXT)

---

## MDI — Infographic Reel

**Use case:** Data / chart / system / process visualization. Numbers, charts, system diagrams, process flows, step-by-step state transitions. Clarity-over-spectacle register.

**Pipeline:** storyboard (`generate_image`) → `generate_scene_video` with full storyboard as start_image. 1 storyboard + 1-2 scene-video takes = 2-3 gens.

**Structural variants:**
- **N-stats sequence** — 3+ data points sequenced (stat1 → stat2 → stat3 → dashboard hero → wordmark match-cut → optional tagline). Default infographic shape.
- **Process flow** — steps in a system shown as evolutionary state transitions (step1 → step2 → step3 → resolved state → wordmark).
- **System diagram** — relationships between entities animated (node1 / node2 / connections forming / data flow / wordmark).

### MDI pipeline

**Step 0 — Image source (SKILL.md Step 0b).**
- Image attached → HR-1a image-gate. Style ref → extract palette / dashboard typography / chart register. Build from this → preserve the data subject from the image (rare — typically when user attaches a dashboard mockup as the hero).
- No image attached → HR-1b foundation generator (Step 0b Branch B). 3-up parallel fan-out → user picks → picked images carry as build-from-this through 6 panels (useful for "generate me a dashboard hero" cases).
- User declined foundation generator → text-to-storyboard (no `image_urls`), Step 0e style direction asks for atmosphere-in-words or default-by-domain.

**Step 1 — Storyboard via `generate_image`.** 6-panel 3×2 sheet. Inject:
- **Reference tier** — Tier 1 Premium 3D motion design default (Buck / Polygon1993 / ManvsMachine for premium chrome data viz). Tier 3 Illustrated motion for friendly / wellness / education data viz. NEVER Tier 4 photographic cinematic (HR-3).
- **Visual World Lock** (HR-8) — Subject = the data subject (the metric / chart / system being shown). Material = the chrome / paper / glass / sculpted form of the data. Style = consistent register across all 6 panels.
- **Numeric values ARE headline-tier** — "$420", "12K", "84%", "+34%" rendered at HR-2 headline scale. NEVER as tiny labels.
- **HR-2 MIN-TEXT for sub-labels** — sub-labels next to numbers must EITHER be ≥headline size OR be removed entirely. No tiny "METRIC LABEL · 2026" tracked monospace.
- **HR-7 sheet chrome tier (b) PANEL-CAPTIONS** default in storyboard margins (NOT inside-frame). Margin caption describes the data state ("01 Initial state — single bar"). Inside-frame text follows HR-2.
- **HR-5 text-string count guard** — verify storyboard sheet renders EXACTLY the metric values + labels from brief. No invented metrics, no invented Q1-Q4 date splits, no invented STATUS callouts.

**Step 2 — Scene video (`generate_scene_video`).** Master camera = internal choreography primary. Camera supports the data state transitions, doesn't override them.
- Layered reveals (bar-by-bar build, line-chart draw-on, pie-slice rotate-in)
- Modular card sweep (multiple metric cards slide in / rearrange)
- Chart-build sequence (axis appears → ticks appear → bars rise → labels lock)
- Radial data bloom (donut / pie / radar diagram unfurls from center)
- Match-cut transitions between data states — DRAMATIC OBJECT MORPH (bar morphs into line), DRAMATIC PARTICLE DISSOLVE (chart dissolves into next chart), DRAMATIC UNFURL (panel content unfurls into next panel)
- Tail freeze 13.7-15s pixel-identical

### MDI anti-patterns

- ❌ Photoreal humans / documentary register (HR-3 — even for "real CFO scenario reel"; route that to Product Reel for hero shots, MDI for the data itself)
- ❌ Tiny "METRIC LABEL" tracked monospace below headline numbers (HR-2 MIN-TEXT)
- ❌ Invented Q1-Q4 splits / fake date stamps / fake STATUS callouts (HR-5 text-string count guard)
- ❌ Decorative chart movement with no semantic purpose (motion should encode meaning, not decorate)
- ❌ Making all 6 beats equally intense — alternate impact and breath (Expensive Look Doctrine)
- ❌ Cinematic camera theatrics that obscure data — internal choreography primary, not hyperkinetic

---

## Pre-write planning checklist

See `pre-write-checklist.md` for the v2.0 condensed checklist.

---

## Common failure modes — quick fixes

| Symptom | Pipeline fix |
|---|---|
| Grid leakage in scene-video output | Apply clip-prompt L1 anti-bleed clause + Rule 10 PHOTOGRAPHIC FRAME PURITY |
| Text drops in video | Specify TEXT PERSISTENCE clause in DYNAMIC + ≥HR-2 MIN-TEXT cap-height in STATIC |
| Brand renders 2-3× | Decide brand-shot once in storyboard; explicit "no brand letters" in other shots |
| Hallucinated tagline | Final shot: "NO tagline below wordmark" OR render tagline verbatim at ≥HR-2 size |
| Tiny chrome labels under panels | HR-2 MIN-TEXT — strip in-frame sub-labels; tier (b) panel-captions live in margin, not inside frame |
| Photoreal humans appear in MDH / MDT / MDI | HR-3 REALISM BAN — re-gen with silhouette / stylized 3D / illustrated form |
| Camera orbiting one object 15s | Specify trajectory + speed/distance in EVERY shot; HR-6 named camera move |
| Music brand → cliché waveforms | Apply music BAN list — vinyl / mixing console / club volumetric / speaker macro instead |
| Letters break mid-clip | "Appears fully-formed with light burst" NOT "letters assemble"; use T3 post-text if morphing needed |
| Black tail at 14s | "Freeze last frame, NO fade-to-black, NO darkening" (HR-10) |
| Style drift between shots | One camera mode across reel; HR-8 Visual World Lock |
| 6 disconnected environments | HR-8 Scene Variation requirement — same subject world, different scenes within it |
| Parallel synonym text beats | HR-5 + escalation arc — write each beat's semantic level, ≥3 distinct levels required for 3+ beats |

---

## Production parameters

See `SKILL.md` Production parameters section for canonical values — storyboard `aspect_ratio` mapping (Step 0d), scene-video defaults (`duration`, `aspect_ratio`, `generate_audio`), `start_image` / `reference_images` shape, tail-pause 13.7-15s freeze, audio defaults, anti-autosubs clause.

Track B Product Reel (MDC8) parameters are case-specific — see `track-b-product-commercial.md` for character sheet + 9-shot 3×3 generation parameters.
