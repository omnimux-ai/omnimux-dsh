# Animated Ad Plan (text-only blueprint, any narrative arc)

This skill encodes a creative move, not a tool pipeline: **mundane setting + absurd object/event, rendered as cinematic stylized 3D character comedy with photoreal detail, told dialogue-free, with the product as either the absurd object or the literal transformation reward.** It outputs a complete text plan a human (or a later paid run) can paste straight into Nano Banana 2 (keyframes) and Seedance (image-to-video). It never fires production tools — the deliverable is words.

The one big generalization over a fixed reference build: **the narrative arc is selectable**. Do not hard-lock the 4-beat hook-reveal-conflict-payoff. Pick the arc that makes the product's benefit land hardest, then bend the climax onto that benefit.

## When to use this pattern

Use it for:
- Short-form (≤45s) animated character-comedy ads for a product or brand.
- Anything described as a stylized 3D-animation look, "3D mascot", "cute animal ad", "animated short spot", or a visual-gag commercial.
- Cases where the user wants a reusable, paste-ready plan rather than rendered assets right now (free-trial-safe).

Avoid / adapt it for:
- Live-action or talking-head UGC (different skill).
- Long-form explainer or heavy-dialogue narrative.
- Products whose benefit cannot be dramatized visually (pure B2B abstractions) — only use if you can find a physical metaphor.

## Workflow (creative decisions, in order)

### 1. Analyze the reference (if one is provided)
If the user supplies a reference video, run `analyze_ad_video_pro` and extract only the creative DNA:
- **Form**: 3D character animation vs live action vs motion graphics (this skill assumes 3D character animation; confirm it).
- **Cast**: how many characters, species, archetypes.
- **Pacing**: shot count, average shot length, where the rhythm breaks.
- **Dialogue policy**: dialogue-free vs VO vs full dialogue (default here is dialogue-free).
- **Sound design**: ambient bed + the one hero SFX.
- **Narrative arc** and **payoff mechanic** (the gag/transformation that pays off the hook).

If no reference is given, default to the worked example DNA below and label every borrowed choice as a swappable placeholder.

### 2. Lock creative direction — ONE question batch
Use a single `AskUserQuestion` batch covering exactly four things:
1. **Product / Brand** (the subject — always swappable).
2. **Cast** (animal / creature / mascot choice).
3. **Comedy / narrative payoff mechanic** (what's the gag or the transformation?).
4. **Format** (aspect ratio + length).

If the user cancels or skips, proceed with the closest-to-reference defaults and clearly mark them as placeholders the user can swap.

### 3. CHOOSE A NARRATIVE ARC deliberately
This is the heart of the skill. Pick the arc that best dramatizes the product's benefit; do not default to the 4-beat template. Offer/choose from this menu (see `references/arc-library.md` for full beat maps):
- **Curiosity-hook → escalation → surprise transformation** — great when the benefit is a power-up / dramatic upgrade.
- **Underdog wants something → obstacle → clever win** — classic animated short; great when the product helps you overcome a struggle.
- **Setup → misdirection → comedic twist/subversion** — great for "not what you expected" positioning.
- **Emotional micro-arc (loneliness → connection)**, product as the bridge — great for social / sharing / comfort products.
- **Rivalry → one-upmanship → mutual payoff** — great for "everyone wins" or sharing/duo products.
- **Day-in-the-life mundane loop → absurd disruption → new normal** — great when the product changes a daily routine.

Rule: **map the product benefit onto the arc's climax.** The climax is where the benefit becomes literal and visible.

### 4. Build the CAST BIBLE
Write 2–4 named characters with **fixed, verbatim-reusable** physical descriptions: species, build, color, eyes, one signature trait, and archetype role. These descriptions must be pasted **identically** into every keyframe prompt so identity stays locked across scenes. Production note to include in the plan: *generate Scene 1 characters first, then use those frames as image-to-image (I2I) references for all later scenes.*

### 5. Write each scene
For every scene produce all of:
- **Beat / script**: the story moment (action, no dialogue by default).
- **Direction**: shot type, angle, lens, camera move, lighting, aesthetic.
- **Sound design**: ambient bed + the one hero SFX for this beat.
- **Nano Banana 2 start-frame prompt** — self-contained and re-pasteable. Always:
  - Opens with: `Highly polished cinematic stylized 3D animation, high-end animated-film render quality with photoreal detail`
  - Contains the **verbatim** cast descriptions for every character in frame.
  - Ends with the **aspect ratio** and any **readable on-pack / button / wordmark text** the frame must show.
- **Seedance motion prompt** — one energy/action beat per scene, snappy timing, explicitly state camera lock vs move, and **no baked-in overlay text**.

### 6. Assembly / CTA notes
- Text overlays are added in **post**, never baked into frames.
- Captions OFF for dialogue-free spots, except an end-card or a short VO tag.
- Music ambient-light so the hero SFX punches; drop the bed for the key beat, then sting.
- CTA matched to platform and **varied** — do not default to "link in bio". Prefer product-reveal end card, link sticker, or a soft sign-off.
- Reuse cast descriptions verbatim across scenes.
- Feed the **real product packaging as an I2I reference on the payoff keyframe** so the label/wordmark is exact.

## Hard rules / do-not-regress
1. **Output is text only.** Fire no rendering/production tools. This keeps it free-trial-safe.
2. **Dialogue-free-first.** Ambient sound + one hero SFX. Optional VO tag is **≤3 words, at the very end only.**
3. **Comedy engine = mundane setting + absurd object/event.** The product is the absurd object or the transformation reward.
4. **Arc is selectable**, not locked to hook-reveal-conflict-payoff. Always justify the arc choice by the product benefit.
5. **Cast identity is locked**: verbatim-identical descriptions in every keyframe prompt; Scene 1 first, then I2I.
6. **Every Nano Banana 2 prompt is self-contained**, opens with the exact stylized-3D render line, and ends with aspect ratio + readable text.
7. **Seedance = one action beat per scene**, explicit camera lock/move, no baked-in text.
8. **Packaging fidelity**: payoff keyframe uses the real product as I2I reference.
9. **CTA varies** by platform; never auto-default to "link in bio".
10. **Subject is the only swappable layer.** Style, structure family, dialogue-free comedy, render aesthetic, and cast-locking discipline stay fixed.

---

## Worked example — invented placeholder (generic product)

This is an illustrative build. Treat the product, cast, and every value below as **placeholders** — swap them for any new subject while keeping the moves.

**Reference DNA (illustrative):** a short animated spot (~30s, 4 scenes, stylized 3D character animation, dialogue-free, ambient + one hero SFX). Arc = curiosity hook → reveal → conflict → surprise transformation. Cast = 3 anthropomorphic forest critters. Beats: (1) low-angle POV critters peer down into the lens against a forest canopy; (2) wide reveal — critters around a mysterious glowing device on a mossy log; (3) telephoto two-shot "argument"; (4) press → glow burst → smallest critter transforms.

**New plan (placeholder product — a fictional snack bar called "PLACEHOLDER BAR"):** 9:16, ~30s, 4 scenes. Arc chosen = **curiosity-hook → escalation → surprise transformation**, because the placeholder benefit ("instant energy") is a literal upgrade — the arc's climax = the transformation = the benefit made literal. Concept: a small timid critter taps a glowing dispenser, gets a burst, and returns bold and supercharged — product is both the absurd object and the transformation reward.

**Cast bible (paste verbatim every time):**
- **PIP** — small scruffy russet-brown squirrel, ruffled cheek fur, big amber eyes, bushy tail, timid underdog energy.
- **BORO** — round slate-grey hedgehog, rounded snout, sleepy half-lidded eyes, comic bystander.
- **NEELA** — sleek tawny fox kit, long lashes, dainty upright posture, unimpressed.

**Scene 1 — HOOK (0–7s).** Beat: critters peer down into the lens against a forest canopy, heads cocking. Direction: low-angle POV, static. Sound: breeze + soft chitters.
- *Nano Banana 2:* "Highly polished cinematic stylized 3D animation, high-end animated-film render quality with photoreal fur detail. Low-angle POV looking up: three anthropomorphic forest critters peer down into the lens against a sunlit green canopy. PIP (small scruffy russet-brown squirrel, ruffled cheek fur, big amber eyes, bushy tail) closest, head cocked; BORO (round slate-grey hedgehog, rounded snout, sleepy half-lidded eyes) and NEELA (sleek tawny fox kit, long lashes, dainty) behind. Dappled overhead sunlight, soft shadows, lens flare, cinematic color grade, subtle handheld feel. 9:16. No text."
- *Seedance:* static low angle with micro-shake; heads cock in staccato; PIP leans toward lens ~4s; breeze ruffles fur; no camera move.

**Scene 2 — REVEAL (7–14s).** Beat: trio gathered around a mysterious glowing dispenser on a mossy log, glowing button. Direction: wide, eye-level, locked tripod, shallow DoF. Sound: forest ambience + low electric hum.
- *Nano Banana 2:* "Highly polished cinematic stylized 3D animation, high-end animated-film render quality with photoreal detail. Wide shot on a mossy fallen log: PIP (small scruffy russet-brown squirrel, ruffled cheek fur, big amber eyes, bushy tail), BORO (round slate-grey hedgehog, half-lidded eyes), and NEELA (sleek tawny fox kit, long lashes) in a semicircle staring at a weathered dispenser with a large glowing pulsing green button and a snack-bar slot. Dim forest clearing, blurred ferns behind, shallow depth of field, soft side light. 9:16. Sharp readable 'PLACEHOLDER BAR' text on the button."
- *Seedance:* locked wide; curious head bobs; button pulses green; PIP hops one step closer ~10s; no camera move.

**Scene 3 — CONFLICT (14–19s).** Beat: PIP and BORO "argue" over tapping it; NEELA unimpressed; BORO shakes head no; PIP resolves. Direction: medium close-up, telephoto two-shot, compressed bokeh. Sound: rapid chitter-bickering, no music.
- *Nano Banana 2:* "Highly polished cinematic stylized 3D animation, high-end animated-film render quality with photoreal fur detail. Telephoto compression two-shot, blurred forest bokeh: PIP (small scruffy russet-brown squirrel, ruffled cheek fur, big amber eyes, bushy tail) in profile looking determined, facing BORO (round slate-grey hedgehog, half-lidded eyes) worried mid-squeak. Edge of the dispenser visible at the bottom of frame. Soft side light, cinematic grade. 9:16. No text."
- *Seedance:* locked telephoto; fast staccato head bobs; BORO shakes head no; PIP firms up ~17s; torsos locked; no camera move.

**Scene 4 — PAYOFF (19–30s).** Beat: PIP taps the button, BORO lunges to block too late, green energy whiteout, reveal — a PLACEHOLDER BAR ejects and PIP is transformed into a bold supercharged critter in a confident pose; BORO jaw-drops; NEELA admiring. Direction: wide golden-hour hero shot, warm rim light, energy particles. Sound: charge-up whine → whiteout → triumphant sting.
- *Nano Banana 2:* "Highly polished cinematic stylized 3D animation, high-end animated-film render quality with photoreal detail. Wide golden-hour hero shot in a forest clearing: PIP transformed into a bold supercharged squirrel (puffed glowing chest, soft green aura, confident hero pose) — same russet-brown fur, big amber eyes, bushy tail. A wrapped snack bar (bold 'PLACEHOLDER BAR' wordmark, leaf graphic) glows on the log having ejected from the dispenser. BORO (round slate-grey hedgehog, half-lidded eyes) gawking jaw-dropped, NEELA (sleek tawny fox kit, long lashes) admiring. Blurred ferns, warm rim light, drifting energy particles. 9:16. Crisp readable 'PLACEHOLDER BAR' wordmark on the wrapper. (Feed the real product image as an I2I product reference so packaging is exact.)"
- *Seedance:* locked wide; PIP taps button; BORO lunges to block a beat late; green energy whiteout ~22s; reveal ~24s — bar drops and PIP strikes hero pose, chest puffing; BORO recoils jaw-dropped; NEELA eyes widen; particles drift; hold the hero pose; single whiteout transition.

**Assembly / CTA:** overlays added in post, none baked into frames. Scene 4 end card "PLACEHOLDER BAR — Fuel up." as a green lower third that fades in. Captions off (dialogue-free) except the end card. Optional ≤3-word VO tag at the very end only: "Fuel up." Music is ambient-light, drops out for the burst, then a triumphant sting on the reveal. CTA = product-reveal end card / link sticker, **not** generic "link in bio". Reuse the cast descriptions verbatim across all scenes. Generate the Scene 1 critters first, then use them as I2I references for Scenes 2–4; feed the real product as an I2I reference on the Scene 4 payoff keyframe.