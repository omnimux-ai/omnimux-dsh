# Motion Design Troubleshooting

Real failures from production sessions and verified fixes. If output is broken — open this file first.

## P1. Seedance makes split-screen output from motion sheet

**Symptoms:**
- Output shows a pink/grey hairline divider that was between panels in the input sheet
- Video displays both panels simultaneously as a 2-screen layout
- "Animation" happens in both halves of the frame (if at all)

**Root cause:** Sheet with N panels was submitted as `image` role to Seedance. The model interpreted the composite layout literally — as a single first frame with all elements.

**Fixes (in order of preference, v1.8.2 — production-keyframes pipeline removed):**

1. **RECOMMENDED — clip-prompt 4-layer sandwich + anti-bleed clause:**
   - Apply the L1 anti-bleed clause from Rule 1 (positive prescription: `@Image1 ONLY as visual reference for composition planning, palette, subject identity — NEVER render the storyboard sheet itself, its chrome layer, panel borders, or grid layout as scene content`).
   - Combine with Rule 10 PHOTOGRAPHIC FRAME PURITY at sheet source (no metadata chips inside panel frames).
   - 4-layer sandwich + pre-flight checklist closes grid leak at video layer; this is the canonical defense.

2. **Premium per-shot pixel control — escalate to Track B MDC8:**
   - Track B character sheet → 9-shot 3×3 storyboard → Seedance single-pass with character sheet as `@Image1` foundation
   - Designed for product commercials where pixel-perfect per-shot control matters; uses production-bible character sheet instead of per-shot keyframes
   - See `track-b-product-commercial.md`

3. **Crop fallback (absolutely urgent only):**
   - Crop sheet manually via Python (PIL) into separate frames
   - Use cropped versions as clean keyframes
   - This is a last-resort manual workaround, not a supported routing path

**Removed v1.8.2:** "separate production keyframes pipeline" (MDC2.2) — was P1 recommendation in prior versions; creative drift between separately-generated keyframes could not be closed by anti-drift guards; superseded by anti-bleed clause + Track B character sheet pipeline.

---

## P2. Letters morph mid-clip / random characters

**Symptoms:**
- A long wordmark like "MERIDIAN" becomes "MERIDAN" / "MERIIDAN"
- Spencerian Coca-Cola cursive breaks down into illegible scrawl
- Random letters appear mid-clip then disappear

**Root cause:** Seedance text rendering capacity — limited. If active typography animation (smash, morph, typewriter) — capacity is spent on letterforms recreation, breaking down.

**Fixes:**

1. **Convert to ABSOLUTE TEXT LOCK:**
   - Use T1 GRAPHIC OVERLAY MODE
   - Freeze text, animate only camera/light/particles
   - Add: "ABSOLUTE TEXT LOCK — zero deformation, zero morphing, zero new text"

2. **If active animation is still needed:**
   - Use T3 dual-ref interpolation
   - Text in both keyframes same scale and position (only surrounding environment different)
   - Seedance interpolates light/atmosphere, not letterforms

3. **If nothing helps:**
   - Render Seedance with final text present from frame 0 (no animation)
   - Animate in CapCut/AE post: text typewriter / scale-pop / slide-up via text presets

---

## P3. Auto-generated subtitles appear in output

**Symptoms:**
- Auto-generated subtitles at bottom of frame duplicate dialog (if native audio)
- Additional captions appear on top of design

**Root cause:** Seedance native subtitle generator runs by default.

**Fix:**

Add this block to every prompt:

```
ABSOLUTE TEXT-FREE VIDEO RULE: Do NOT add any auto-generated subtitles. Do NOT add any new caption overlays. Generate without subtitles. No subtitles. No captions.
```

If still appearing — check that frame doesn't have UI with baked text + caption overlays simultaneously (this triggers capacity overflow, see A3 in SKILL.md).

---

## P4. Style drift between keyframes in one series

**Symptoms:**
- Keyframe 1 confident bold sans, Keyframe 2 — slightly thinner
- Colors slightly off (pink in one has slightly different hue)
- Letter spacing inconsistent

**Root cause:** GPT Image 2 / Nano Banana 2 random seed on each gen. Without anchor — drift.

**Fixes:**

1. **Chain refs (RECOMMENDED):**
   ```
   Generate 2nd keyframe passing the 1st as ref:
   generate_image(..., image_urls=["<keyframe_1 asset id>"])
   In prompt: "Use the EXACT SAME font, weight, color, outline thickness, and proportions as @Image1."
   ```
   Generate 3rd passing 2nd, and so on.

2. **Explicit font + weight in every prompt:**
   - "Apple SF Pro Display weight 500"
   - "Neue Haas Grotesk Display Black weight 900, tight letter-spacing"
   - "Suisse Int'l Bold weight 700"
   - "Inter weight 800"
   - Color hex codes everywhere

3. **Both techniques simultaneously** for critical brand work.

---

## P5. AE-style smash motion comes out generic / faint

**Symptoms:**
- Asked for "ONE STUDIO. SMASHES IN with overshoot bounce + motion blur" — got smooth fade-in
- Text appearance reads as regular Hollywood dissolve, not kinetic typo
- Motion blur absent or imperceptible

**Root cause:** Seedance is camera-trained, not graphic-design-trained. Concepts like overshoot bounce, instant snap, anticipation curve — not in its vocabulary.

**Fix — DON'T do smash through Seedance.**

1. **Static keyframes from Seedance + AE-style transitions in CapCut:**
   - Seedance gives frame with final text (T1 GRAPHIC OVERLAY MODE)
   - In CapCut on top — scale-pop preset, motion blur stamp, white flash transitions
   - SFX layer — whoosh + bass thump
   - This gives real AE-feel

2. **Fully After Effects:**
   - GPT Image 2 keyframes only, no Seedance
   - All motion in AE
   - MDC6 pipeline in motion-design-cases.md

---

## P6. Seedance doesn't understand "render as single full-frame, NOT panel layout"

**Symptoms:**
- Prompt contains instruction for single frame, but Seedance still makes split-screen
- Multi-panel sheet preserved in output

**Root cause:** If sheet is passed as `image` role, Seedance uses it as FIRST FRAME visually, and instruction parsing happens later. Composition wins over text instruction.

**Fix:** Apply clip-prompt 4-layer sandwich + anti-bleed clause + Rule 10 PHOTOGRAPHIC FRAME PURITY (see P1 fix #1 above). If sheet leak persists even with full sandwich → escalate to Track B MDC8 character sheet pipeline.

---

## P7. 15s Seedance clip with >5 text changes comes out chaos

**Symptoms:**
- First 3-5s reads normally
- By 8-10s text starts deforming
- By 12-15s — alphabet soup with random captions

**Root cause:** Long clip + multiple text states = capacity overflow.

**Fix:**

1. **Split into 4×5s** (MDC2 workflow):
   - Each beat — separate 5s Seedance gen
   - Text pixel-locked in each
   - Splice in CapCut with AE-style transitions

2. If very long clip is needed — text should be STATIC (one state for entire clip), animate only environment.

---

## P8. Spencerian / cursive script breaks in Seedance even with ABSOLUTE TEXT LOCK

**Symptoms:**
- Coca-Cola cursive signature pixel-blurry
- Letters connecting strokes drift/break
- Cursive flourish reshaped

**Root cause:** Cursive scripts with connecting strokes — most fragile typography for AI video. Connecting line between letters easily breaks.

**Fixes:**

1. **Minimize camera movement:**
   - "Camera: extremely slow dolly-in 100→101%" instead of 105%
   - Static feel, sub-pixel only

2. **Text sheet pattern (dual-ref):**
   - Generate separate text sheet — pure typography on dark grey background
   - Submit as dual-ref: animation keyframe + text sheet
   - Prompt: "Captions matching @Image2 EXACTLY, NO auto-subs, do NOT replicate dark bg of @Image2."

3. **If nothing helps:**
   - Render Seedance without Spencerian (only bg + light + particles)
   - Composite Spencerian wordmark in CapCut on top (alpha PNG from GPT Image 2)

---

## P9. Multi-character per-second typewriter doesn't work

**Symptoms:**
- Prompt describes: "characters appear at 5 chars/sec sequentially"
- Output: text fades in entirely, without per-character logic

**Root cause:** Seedance interpolation model — it interpolates between frames, doesn't understand discrete event timing. Per-character timing is foreign to it.

**Fix:** Do typewriter in CapCut. Seedance not suited for this. Pipeline:
1. Seedance gives static frame with final text
2. CapCut text typewriter preset on top
3. Keyboard click SFX per 0.2s per character

---

## P10. Logo wordmark comes out correct spelling but wrong typeface

**Symptoms:**
- "MERIDIAN" spelled correctly, but font weight thinner than in keyframe
- Letter-spacing different
- Stylistic alternates substituted

**Root cause:** GPT Image 2 on ref-gen can drift in font choice if not anchored.

**Fix:**

1. **Fixed font name in prompt:**
   - "Neue Haas Grotesk Display Black weight 900"
   - "Suisse Int'l Bold"
   - "F37 Bergman Wide"
   - "Inter weight 800"

2. **Explicit metrics:**
   - "Tight letter-spacing"
   - "Ultra-wide grotesk"
   - "Heavy weight 900"

3. **Chain ref:** "Use the EXACT SAME font as @Image1 (when chained)"

---

## P11. Output resolution is muddy on text

**Symptoms:**
- Text in Seedance output reads, but letterforms blurry
- Pixel grain visible on edges

**Root cause:** Seedance default 720p, for 16:9 hero content this is too low.

**Fix:**

1. **Source keyframes — high resolution:**
   - `generate_image` params: `resolution="2K"` (or `"4K"`)
   - At low resolution — muddy typography

2. **Scene-video output resolution** — keep the storyboard keyframe at `2K`/`4K` so the video model has crisp source typography to animate.

3. **Final upscale** — after the scene video, run through an external upscaler (Topaz Video AI or your NLE's native upscaler) to 1080p+.

---

## P12. Cursor / arrow / mouse element comes out cartoonish in UI demo

**Symptoms:**
- "3D rendered cursor arrow" comes out plasticky
- Drop shadow looks fake

**Root cause:** GPT Image 2 interprets "3D" as stylized 3D render with mouse-shaped icon, not realistic cursor.

**Fix:**

1. **Describe more precisely:**
   - "Classic system pointer cursor (default macOS / Windows arrow), thin black outline, light grey fill, subtle 1px drop shadow, NOT a stylized 3D illustration"
   - "Standard OS cursor like seen in screen recordings"

2. **Reference real cursor:**
   - Provide reference image of actual screen recording cursor

3. **Composite in post:**
   - Render scene without cursor via Seedance
   - Add real cursor PNG in CapCut with anim path

---

## Quick diagnosis matrix

| Symptom | See section |
|---|---|
| Split-screen output | P1 |
| Letters morphing | P2 |
| Auto-subtitles | P3 |
| Font drift | P4 |
| Smash motion weak | P5 |
| Multi-panel preserved | P6 |
| Long clip chaos | P7 |
| Cursive script breaks | P8 |
| Typewriter doesn't work | P9 |
| Wordmark wrong typeface | P10 |
| Text blurry | P11 |
| Cursor cartoonish | P12 |

---

## When to give up on Seedance and switch to AE

Signs that Seedance pipeline isn't suitable — switch to pure After Effects (MDC6 workflow):

- Per-character timing critical (typewriter, stagger cascade)
- 5+ text state changes in 10-15s
- Glitch / RGB split / scan-line transitions
- Per-letter animator effects
- Liquid type morph
- Precise control over easing curves for each element
- Brand-critical typography that cannot drift

If 2+ of these signs — pipeline = pure AE on static GPT Image 2 keyframes.

---

## P13. "Sensitive content" moderation rejection (false positive)

**Symptom:** Seedance gen returns sensitive content / moderation error without apparent reason. Prompt is clearly harmless (educational, abstract, scientific).

**Trigger keywords/combos** that cause false positive moderation:

| Trigger combo | Reason | Replacement |
|---|---|---|
| "force" + "darkness" + "sphere" + "speed lines" | Reads as weapon/projectile firing | "vector" / "energy" / "direction" + "dark gradient" + "smooth trails" |
| "speed lines streaming behind" + "captured mid-motion" + "black background" | Action shot / projectile pattern | "elongated gradient trails" + "soft motion" + "dark gradient" |
| "ghost trails" / "ghost figures" | "Ghost" may flag | "fading echo" / "fading trails" |
| "blast" / "explode" / "shatter" / "burst" | Violence keywords | "expand" / "disperse" / "bloom" / "fragment" |
| "strike" / "impact" / "crash" | Action keywords | "meet" / "contact" / "land" |
| "tracking shot following" + dark BG + speed elements | Surveillance/weapon framing | "gentle slow camera move" + softer motion language |
| "high contrast change" in combination with motion | Action sequence flag | "tonal contrast change" |
| "whoosh of motion" + dark BG | Weapon SFX | "soft ambient air flow" |

**Fix protocol:**

1. Re-read prompt and identify any trigger combos above
2. Replace aggressive/action words with editorial-scientific neutrals
3. Soften "darkness/black/contrast" language with "deep grey gradient" or "tonal" framing
4. Replace "speed/streaks/trails" with "smooth gradient / soft motion blur / fading echo"
5. Avoid combination of: dark BG + sphere/object + motion lines + arrow trailing
6. Resubmit with softer prompt

**Preventive language palette** for premium scientific 3D / motion-design reels:
- Motion: "smooth movement", "gentle drift", "soft trail", "fading echo", "subtle progression"
- Energy: "vector", "direction", "influence", "dynamic", "shift"
- Camera: "gentle tracking", "slow drift", "soft pan", "smooth dolly"
- Background: "deep grey gradient", "tonal contrast", "darker space", "rich dark canvas"
- Sound: "soft ambient air", "gentle hum", "subtle whisper"

If after softening it rejects again — switch to completely static composition with minimal motion words, or split into 2 chapters where dark scene is separate prompt without mention of motion.
