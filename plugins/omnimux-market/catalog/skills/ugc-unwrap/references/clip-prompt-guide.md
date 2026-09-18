# UGC Unboxing Seedance Clip Prompt Guide

Use this when composing the `motion` string for `generate_scene_video` (`backend="seedance"`) to produce a single 9:16 vertical UGC unboxing video clip with FOUR INTERNAL HARD CUTS.

The output of this composition is a single prose `motion` string (no JSON wrapper, no markdown fences) plus a matching `dialogue[]` array. The orchestrator skill passes:
- `start_image` = the generated 21:9 board sheet — Seedance treats it as the narrative map
- `reference_images` = `[character, product, package]` (in order) — **IMAGE asset IDs only**; voice/audio assets do NOT go here
- `motion` = the prose string composed per this guide, with inline `{{persona:<name>}}` / `{{product:<id>}}` tokens for asset references and one trailing `{{speak:persona:<name>}}…{{/speak}}` span wrapping the monologue
- `dialogue` = single-entry array `[{speaker, text, voice_id, delivery}]` matching the speak span
- `aspect_ratio` = `9:16`
- `duration` = `clip_duration` (rounded to an integer in [3, 15])
- `backend` = `"seedance"` (pass explicitly even when it's the mode default)

The IR layer (`SceneIR`) translates these into the Seedance-specific format the model actually receives — you never write `@Image1`, `@Audio1`, or backend-specific syntax in `motion`. **Use `{{asset_id}}` and `{{speak:X}}` tokens only.** Voice timbre resolves automatically from the persona registry via the speaker's persona ID.

You are writing a Seedance motion string that produces a single 9:16 vertical video clip of `clip_duration` seconds. The clip contains FOUR INTERNAL HARD CUTS corresponding to the four board slots — Cut 1 = slot 1's moment, Cut 2 = slot 2's moment, Cut 3 = slot 3's moment, Cut 4 = slot 4's moment. For Board 1 of an unboxing video the slots carry the canonical arc: Cut 1 = PACKED, Cut 2 = REVEAL, Cut 3 = PRODUCT-FOCUS, Cut 4 = SATISFACTION.

The board image is your **narrative map** — read it to understand the story, not to copy frames.

Extract from the board: **what happens** in each slot (the story beat), **chronology** (slot 1 → Cut 1, slot 2 → Cut 2, slot 3 → Cut 3, slot 4 → Cut 4), **overall aesthetic** (light, environment, mood), and **character / product continuity**.

Your written prompt is the **primary signal** to Seedance. The board is also fed to Seedance as a reference image — if your prompt is sparse, Seedance will copy board panels frame-for-frame and the result will look stiff. Your prompt must be dense enough to dominate: packed with motion, breath, micro-expressions, and kinetic detail that no static panel can encode.

---

## Inputs (provided in the skill dispatch)

1. **Board image** — REQUIRED. 21:9 strip, four vertical 9:16 slots. Each slot is a narrative moment. For Board 1 of unboxing the slots are PACKED → REVEAL → PRODUCT-FOCUS → SATISFACTION.
2. **Character image** — REQUIRED. Identity reference for the creator.
3. **Product image** — OPTIONAL. When provided, Angle Lock applies (only the front-facing side of the product, never rotate / spin / reveal unseen sides).
4. **Metadata** — passed externally:
   - `K` — board index (1, 2, 3, ...)
   - `N` — total boards
   - `clip_duration` — 4-15 seconds
   - `arc_role` — for Board 1 of unboxing: `BOARD_1_CANONICAL_UNBOXING` (slots PACKED → REVEAL → PRODUCT-FOCUS → SATISFACTION). For Boards 2..N: `BOARD_K_POST_REVEAL` (post-unboxing exploration / use / settle).
   - `monologue_segment` — the spoken text for THIS clip, to distribute across the 4 cuts

---

## Motion Structure (mandatory)

Each `motion` string follows this structure, in order. Inline `{{persona:<name>}}` / `{{product:<id>}}` tokens anchor character and product references; the trailing `{{speak:persona:<name>}}…{{/speak}}` span carries the monologue and must have a matching `dialogue[]` entry.

```
Style & Mood: UGC iPhone aesthetic, [light description matching the board], [SELFIE: front-facing camera, intimate handheld feel | TRIPOD: locked-off on tripod, completely static, frozen frame | MIXED: starts SELFIE handheld, hard-cuts to TRIPOD locked-off, hard-cuts back to SELFIE handheld — POV alternates per cut], social media vertical format. Featuring {{persona:<name>}}[ and {{product:<id>}}].

Narrative Summary: [1 sentence stating what happens in this clip — references the arc_role and the throughline of the 4 cuts].

Dynamic Description:
Cut 1 (0-Xs) — [framing distance per board slot 1, e.g. MEDIUM CLOSE-UP, TIGHT CLOSE-UP, MACRO, WIDER, PRODUCT-EXTENDED] [POV per slot 1]: [action from slot 1 (for Board 1: PACKED — sealed box on flat surface, character interacting with packaging, product NOT visible), explicit hand allocation, 5+ micro-behaviors, expression, product placement]. Hard cut to.
Cut 2 (Xs-Ys) — [framing distance per board slot 2] [POV per slot 2]: [action from slot 2 (for Board 1: REVEAL — product just out of box, peak surprise/delight reaction), explicit hand allocation, 5+ micro-behaviors, expression, product placement]. Hard cut to.
Cut 3 (Ys-Zs) — [framing distance per board slot 3] [POV per slot 3]: [action from slot 3 (for Board 1: PRODUCT-FOCUS — product extended toward lens, box GONE), explicit hand allocation, 5+ micro-behaviors, expression, product placement]. Hard cut to.
Cut 4 (Zs-end) — [framing distance per board slot 4] [POV per slot 4]: [action from slot 4 (for Board 1: SATISFACTION — character settled with product, confident pose, box GONE), explicit hand allocation, 5+ micro-behaviors, expression, product placement].

Static Description: [1-2 sentences: setting, ambient details, props, light direction — match the board image's environment].

Audio: She speaks to camera, iPhone microphone audio with natural room tone[, IF K==1 AND non-verbal cues used: prepend bracketed sounds inside the speak span at the start, e.g. [*sharp inhale*] [*small bright laugh*]]: {{speak:persona:<name>}}[monologue segment, distributed across the 4 cuts at natural phrase boundaries]{{/speak}}

Facial features clear and undistorted, consistent clothing throughout. Shot on iPhone, natural lighting, social media aesthetic. [SELFIE-only: slight natural handheld micro-shake from her grip | TRIPOD-only: locked-off camera on tripod, absolutely static, zero camera movement of any kind, no shake, no drift, no breathing wobble | MIXED: handheld micro-shake during selfie cuts, locked-off frozen frame during tripod cuts]. No on-screen text, no subtitles, no captions, no watermarks.
```

Accompanying `dialogue` array:

```json
[
  {
    "speaker": "persona:<name>",
    "text": "<monologue segment verbatim — same words as inside the {{speak}} span>",
    "voice_id": "<persona's kling_voice_id from setup_persona>",
    "delivery": "<2-6 word tone cue, e.g. 'warm, bright, conversational' / 'breathless, surprised'>"
  }
]
```

The `speaker` string must match the persona ID used in `{{speak:persona:<name>}}`. The `text` must match what's inside the speak span verbatim. The `voice_id` is required for Kling parity (auto-resolved for Seedance, but always pass it). `delivery` is optional but recommended — pull tone from the board's arc role: Board 1 leans surprised/bright; Boards 2..N lean settled/conversational.

For male creators: replace "She speaks" with "He speaks", change pronouns throughout. Always third-person framing.

---

## Step 1 — Read the Board

Before writing the prompt, read the board image and extract per-slot:

1. **POV** — selfie or tripod (look for the creator's phone-holding arm visible at the frame edge = SELFIE; framing locked symmetric with both hands free = TRIPOD)
2. **Framing distance** — MEDIUM CLOSE-UP, TIGHTER CLOSE-UP, TIGHT CLOSE-UP, MEDIUM, MEDIUM-WIDE, MACRO, WIDER, PRODUCT-EXTENDED
3. **Action** — what is she doing with her hands and product
4. **Product placement** — visible in hand / partially visible / fully hidden / absent
5. **Expression** — opener / building / peak / settle

Don't **contradict** the board (don't switch SELFIE↔TRIPOD between Cut and slot, don't swap which hand holds the product, don't replace the product interaction). Beyond that, **don't transcribe** the board into the Cut either — the LLM's job is not to put what it sees on the board into words. The Cut description's job is to render the **story beat** of that slot **in motion**: in-cut movement, weight shifts, breath, micro-expressions, kinetic hand detail, posture changes — all the things the static panel cannot show.

Rule of thumb: if a sentence in your Cut could be a caption for the board panel, you're transcribing — rewrite it as motion / change / kinetic detail.

**For unboxing specifically:** Slot 1 ALWAYS depicts a sealed box (the character interacting with packaging, product not yet visible) — Cut 1 must reflect this and never describe the product itself in this Cut. Slot 4 ALWAYS depicts settled satisfaction — Cut 4 lands the closer with the character and product, never re-introduces packaging. The story arc PACKED → REVEAL → PRODUCT-FOCUS → SATISFACTION is the spine of Board 1; treat any deviation as an error in your reading of the board, not a creative choice.

**Critical reminder — board panels are SEQUENCE and TIMING reference only.** They confirm WHICH beat each slot represents (PACKED / REVEAL / PRODUCT-FOCUS / SATISFACTION). They are NOT pose-by-pose frame templates. Your Cut description must invent the in-cut motion (breath, weight shift, slicing, kinetic detail, expression evolution, hand mechanics) — these things are NOT on the static panel and must come from your text. Repeating the panel composition frame-for-frame in the Cut text gives Seedance two identical signals (image input + text caption) and produces stiff, lifeless output. The board says "this is the PACKED moment" — your text says HOW it unfolds in motion.

---

## Step 2 — POV Cadence and Style & Mood

Based on the board's per-slot POVs, set the Style & Mood line:

| Per-slot POVs | Style & Mood camera language |
|---|---|
| All four slots SELFIE | `front-facing camera, intimate handheld feel` |
| All four slots TRIPOD | `locked-off on tripod, completely static, frozen frame` |
| POV varies between slots (e.g., TRIPOD → TRIPOD → TRIPOD → SELFIE) | `MIXED: starts [POV1] [language], hard-cuts to [POV2] [language], hard-cuts to [POV3] [language], hard-cuts to [POV4] [language] — POV alternates per cut` |

The canonical Board 1 unboxing cadence is `TRIPOD → TRIPOD → TRIPOD-CLOSE → SELFIE` (PACKED, REVEAL, PRODUCT-FOCUS in tripod for two-handed package/product handling and product close-up; SATISFACTION in selfie for intimate ending). Use the MIXED phrasing in Style & Mood for it.

---

## Step 3 — Time-Slicing the Cuts

Distribute `clip_duration` across the 4 cuts. Default split for unboxing — REVEAL gets the most time (peak moment), PRODUCT-FOCUS is brief (single beat), SATISFACTION lands the closer:

| clip_duration | Cut 1 (PACKED) | Cut 2 (REVEAL) | Cut 3 (FOCUS) | Cut 4 (SATISFACTION) |
|---|---|---|---|---|
| 4s | 1s | 1.5s | 0.5s | 1s |
| 6s | 1.5s | 2s | 1s | 1.5s |
| 8s | 2s | 2.5s | 1.5s | 2s |
| 10s | 2.5s | 3s | 2s | 2.5s |
| 12s | 3s | 3.5s | 2.5s | 3s |
| 15s | 3.5s | 4.5s | 3s | 4s |

Adjust if the action of a particular cut needs more or less time. The default is fine for most cases. Each cut must remain ≥0.5s.

Write the time spans into the Cut headers exactly: `Cut 1 (0-3.5s)`, `Cut 2 (3.5-8s)`, `Cut 3 (8-11s)`, `Cut 4 (11-15s)` — values per the table above.

---

## Step 4 — Action Language Per Cut

For each cut, write 4-10 sentences in the Dynamic Description describing the action. Rules:

### TRIPOD cut language
- Camera is **absolutely frozen on a tripod — zero movement of any kind. No shake. No drift. No breathing wobble. No organic sway. No micro-movement. The frame is completely fixed and immovable. Only the subject and the product move within the locked frame.**
- The Style & Mood / quality suffix MUST use locked-off TRIPOD phrasing for the tripod cut(s).
- **Forbidden words inside a TRIPOD cut's description:** `handheld`, `shake`, `drift`, `wobble`, `sway`, `slight movement`, `micro-shake`, `intimate handheld`, `natural movement`, `subtle movement`. These leak motion into the render.

### SELFIE cut language
- **The phone is NEVER visible in frame.** The camera IS her phone — the viewer sees exactly what her front-facing iPhone captures. The phone object is NEVER held up to her face in the frame, NEVER over-the-shoulder POV, NEVER any "mirror selfie" look (where the camera sees her looking at her own phone screen). NO phone screen visible. NO third-person view of her holding a phone.
- Her free hand or arm may be partially visible at the frame edge if natural — only the arm/forearm, never the phone object itself.
- Natural handheld micro-shake from her grip is expected.
- The quality suffix uses `slight natural handheld micro-shake from her grip` for selfie-only clips, or the MIXED phrasing.

**Forbidden words/concepts in SELFIE cut descriptions:** `mirror selfie`, `looking at her phone`, `phone in her hand`, `holding phone up to face`, `over-the-shoulder`, `phone screen visible`, `reflection`, `mirror`. These leak phone-as-object into the render — Seedance interprets them as "show the phone object", which produces the wrong shot.

### Hand Allocation per cut
- SELFIE cut → 1 hand free for action (other holds phone). NEVER two objects in selfie cut → if the action requires it, the slot is wrong, the board is wrong, fix the board first.
- TRIPOD cut → 2 hands free. Suitable for opening, twisting, applying with one hand while holding product with another.

### Action Sequences (when the cut depicts product opening or application)

Use exact physical mechanics, never vague verbs:

| Product | Cut sequence |
|---|---|
| Perfume / cologne | Hold base → lift cap straight up → cap disappears → press nozzle → mist on wrist or neck |
| Serum dropper | Hold bottle → unscrew dropper counterclockwise → lift pipette → squeeze bulb → drops on fingertips |
| Cream jar | Hold base → twist lid off counterclockwise → lid disappears → fingertip scoop |
| Soft tube | Hold middle → flip or unscrew cap → squeeze → product on fingertip |
| Pump bottle | Hold base → press pump head with two fingers → product on palm |
| Lipstick | Hold base → pull cap straight up off → cap disappears → twist base → swipe lips |
| Mascara | Hold tube → unscrew wand → pull out slowly → apply |
| Compact / powder | Hold compact → flip hinged lid open → tap brush/sponge → apply |
| Spray bottle | Hold bottle → remove cap if visible → press trigger → mist |

Cap / lid rules: cap is removed BEFORE contents exit; after removal, NEVER describe where the cap goes — it ceases to exist; max 1 opening + 1 usage action per cut.

### Box Presence per Cut (mandatory for unboxing)

The unboxing centers on a delivery package. Each Cut has a fixed box state:

- **Cut 1 (PACKED)**: sealed box is the focal object. Product is NOT visible. Character interacts with the box (hands on, hovering, ready). The box rests on a flat surface — never lifted in the air, never carried. **At the end of Cut 1, the character picks up a small utility / box-cutter knife from beside the box, slices the packing tape with one decisive motion (one quick action — no lingering on the blade, no zoom-in, no detailed inspection of the knife), then sets the knife aside on the surface beside the box. The knife stays visible on the surface in subsequent cuts but is NEVER described, focal, or referenced again — it's a quick functional beat, not a feature. As the box flaps fall open, color-matched packing / tissue paper inside the box is briefly visible (atmospheric backdrop, one quick beat — not focal, not zoomed).** Hard cut to Cut 2.
- **Cut 2 (REVEAL)**: product is just emerging from / nestled in color-matched packing / tissue paper inside the open box. The paper is backdrop only — visible for the first beat of Cut 2, never described in detail beyond "color-matched tissue paper inside the open box flaps". The box may be visible at the frame edge (open flaps, just-emptied) for atmosphere — but is fading from focus. The hard cut from Cut 1 handles the "box → product" transition; the cutter knife (now resting on the surface from Cut 1's end) is not mentioned. Do not describe the opening motion within Cut 2 itself unless the user explicitly asks for slow opening.
- **Cut 3 (PRODUCT-FOCUS)**: box is GONE from the frame. Product is the hero — extended toward lens, on palms, held up.
- **Cut 4 (SATISFACTION)**: box is GONE. Character + product only.

Once the box has disappeared in any Cut, NEVER re-introduce it in subsequent Cuts. No re-taping, no closing, no carrying, no setting it back on the table. The box ceases to exist.

If the user provided a real package image, Cut 1 must depict THAT package (matching the reference) — do not invent a generic box when a specific one is provided.

### Weight & Grip Logic (mandatory)

Classify the product by weight before describing the lifting/holding action in any Cut:

| Class | Examples | Hand allocation | Facial expression |
|---|---|---|---|
| Heavy | Appliance, bottle ≥1L, toolbox-class | TWO hands required, body leans forward | Visible strain — jaw set, brow slightly furrowed, controlled exhale |
| Bulky but light | Oversized box, large but empty | TWO hands for stability | NO strain — relaxed face, easy grip |
| Light | Cosmetics, phone, small bottle | ONE hand, relaxed grip | Neutral / pleased, no strain |
| Tiny | Earring, pill, contact lens | Pinched (thumb + index), close to lens | Focused / curious |

**Forbidden:** describing one-handed lifting of heavy items, or two-handed strain on light items. Both produce unrealistic AI-tell renders. Classify the product before writing the prompt — if the class is ambiguous, default to the heavier class (safer for realism).

### Cinematic Specificity (mandatory per cut)

Each cut must include all three of:

1. **5+ concrete micro-beats** from this menu (rotate — never repeat the same combination across the 4 cuts):
   weight shift, hair touch, glance break, head tilt, eyebrow flash, hand gesture, posture shift, lip movement, shoulder shrug, breath (inhale / exhale / sigh / sharp inhale), jaw set, neck tendon definition, knuckle tightening, foot pivot, brow furrow, chin tuck, lean forward / back, micro-grin, half-blink, slight off-center handheld tilt.

2. **At least 1 within-cut motion beat** — something that progresses or changes during the cut. The cut is not a still — describe what evolves inside it. Examples: "weight shifts forward as she brings X closer", "shoulders roll back slightly as the rep peaks", "a quick genuine grin breaks across her face after the controlled exhale".

3. **Expression evolution across the 4 cuts** — never the same expression twice (e.g., raised brow → focused jaw set → confident grin). Identical expression across cuts is forbidden (already in Anti-patterns below).

**Forbidden in any Cut description:** sentences that only re-state what the static board already shows. Every sentence must add something the board cannot — motion, sound cue, expression beat, kinetic detail, breath, tension, weight transfer.

Anti-patterns (NEVER write these):
- "smiles at the camera"
- "looks at the camera"
- "sits in front of the camera"
- "holds the product and talks"
- Identical expression across all 4 cuts

Instead: weave specific micro-behaviors into each cut's description.

### Cut Markers (mandatory verbatim)

Between Cut 1 and Cut 2: `Hard cut to.` — at the end of Cut 1's description sentence.
Between Cut 2 and Cut 3: `Hard cut to.` — at the end of Cut 2's description sentence.
Between Cut 3 and Cut 4: `Hard cut to.` — at the end of Cut 3's description sentence.
No marker after Cut 4.

These are scene-edit instructions Seedance reads literally. Without them, cuts collapse into smooth motion.

---

## Step 5 — Audio / Monologue

Use the provided `monologue_segment` verbatim. Distribute it across the 4 cuts at natural phrase boundaries — roughly proportional to cut duration. Wrap the full monologue in ONE `{{speak:persona:<name>}}…{{/speak}}` span at the end of the motion's Audio line, and add a single matching entry to `dialogue[]`.

```
Audio: She speaks to camera, iPhone microphone audio with natural room tone: {{speak:persona:<name>}}<monologue verbatim>{{/speak}}
```

Matching `dialogue[]` entry:
```json
{"speaker": "persona:<name>", "text": "<monologue verbatim>", "voice_id": "<kling_voice_id>", "delivery": "<tone cue>"}
```

The `speaker` value in `dialogue[]` MUST match the persona ID inside `{{speak:…}}` exactly (e.g. `persona:maya` in both, not `maya` in one and `persona:maya` in the other). Preflight rejects unmatched speak-span/dialogue pairs.

### K=1 (Board 1) — trailer-style non-verbal sounds

ONLY for K=1, optionally include 1-3 bracketed non-verbal sounds at the START of the speak span, before the monologue. The bracketed cues stay INSIDE `{{speak:…}}` (they're part of what the persona vocalizes):

```
Audio: She speaks to camera, iPhone microphone audio with natural room tone. {{speak:persona:<name>}}[*sharp inhale*] [*small bright laugh*] [*mock gasp* "wait"] <monologue>{{/speak}}
```

The `dialogue[].text` MUST contain those bracketed cues verbatim too — `text` mirrors the speak span contents:
```json
{"speaker": "persona:<name>", "text": "[*sharp inhale*] [*small bright laugh*] [*mock gasp* \"wait\"] <monologue>", "voice_id": "...", "delivery": "bright, surprised"}
```

Use sparingly — at most 3 bracketed sounds. Skip them entirely if the monologue tone is calm.

### K>1 (Boards 2..N) — strict no-greetings rule

The Audio segment for boards 2..N MUST NOT start with greetings or product re-introductions. Forbidden openers:
- "hey", "hi", "hi guys", "hey everyone", "what's up"
- "today I'm showing you", "I want to share", "I just got", "I wanted to tell you about", "let me show you"
- "so this is the [product]" — the product was named in board 1 already
- "as I was saying", "going back to", "anyway"
- "okay so", "alright so" used as a fresh-start opener

Instead, the audio opens **mid-thought** — mid-sentence if necessary. The viewer should feel they're watching one continuous take with hard cuts, not N separate recordings.

NO bracketed non-verbal sounds for K>1.

### No phrase repetition across cuts (mandatory)

Each cut's audio segment is UNIQUE — never repeat the same sentence, claim, product mention, or descriptor in another cut. Each cut owns a different chunk of the monologue. If the same idea needs to span multiple cuts, paraphrase or move on. Repeating "this is my favorite perfume" / "I love this scent" / "smells incredible" across two cuts breaks the continuous-monologue feel and reads as AI-loop.

When you split the `monologue_segment` across the 4 cuts, verify NO sentence or near-identical phrase appears in two different cut segments. If the user-supplied monologue itself contains repetition, reword to deduplicate.

### Forbidden AI-tell phrases (NEVER use)

These phrases are dead AI giveaways. Real creators don't say them. Replace verbatim or rephrase:

- `I'm obsessed`, `I am obsessed`, `literally obsessed`, `so obsessed`, `like obsessed`, `obsessed with this`, `obsessed` as praise — **all banned, no exceptions**
- `you have to try this`, `you have to see this`, `you NEED this` — overused AI clichés
- Generic praise without specifics: `it's amazing`, `it's incredible`, `so good`, `mind-blowing`, `unreal`, `out of this world`
- `Trust me on this`, `I cannot recommend enough`, `game changer`, `total game changer` — AI sales-speak
- `ten out of ten`, `10/10`, `100%`, `1000%` — AI rating clichés

Use SPECIFIC creator language instead:
- Scent: `smells like jasmine and pepper`, `vanilla with a smoky finish`, `fresh laundry vibe`
- Texture: `melts in instantly, no stickiness`, `goes on like silk`, `dries down in seconds`
- Context: `I've worn it three days in a row and people keep asking what I'm wearing`, `it lasted through dinner and an Uber home`
- Real creators describe **sensations and moments**, not abstract feelings.

### Audio language

Default English. Switch only if user explicitly requests another language.

For male creators: "He speaks" / "He" — never mix genders in one prompt.

---

## Step 5b — Product Action Logic

This is where realistic product interaction is enforced. The board image is a composition reference; if the board shows a closed product, the video Cut MUST still describe a realistic opening motion before any application — Seedance will not invent it. Action logic lives here, not in the board.

### Single action per Cut (mandatory)

Each Cut depicts ONE physical product interaction at most. Forbidden patterns:
- Repeated sprays / multiple presses / "she sprays again"
- Back-and-forth motion (open → close → open)
- Two distinct interactions in the same Cut (e.g. spray AND smell AND apply — pick one)

One press, one mist, one swipe, one sip, one scoop. If the action needs more, split across Cuts.

### Cap / lid removal logic

If the product is closed at the start of a Cut and the Cut is the application moment, the Cut prompt MUST describe cap removal as a clear, distinct motion BEFORE the action — even if the board image shows the cap still on. Pattern:

> "She lifts the cap straight up off the bottle, the cap disappears off-frame, then [single application action]."

Never describe cap removal AND application as a blurred simultaneous motion. The cap comes off first, then the action lands. After the cap is removed in any Cut, never describe the cap returning, never describe re-closing.

For multi-Cut application (>15s, K>1), once the cap is removed in any Cut of any prior board, all subsequent Cuts assume the product is open. Do not re-introduce cap removal.

### Body-part target lock (mandatory)

Application target is product-specific and non-negotiable:

| Product | Apply to | NEVER apply to |
|---|---|---|
| Perfume / cologne / mist | wrist or neck | palm, face, eyes, hair, lips |
| Cream / serum / lotion | fingertip first, then face or hands | directly to face from container, eyes |
| Lipstick / lip balm / gloss | lips only | cheek, neck, forehead, eyelids |
| Drink / beverage | bottle or glass to mouth (drinking) | wrist, palm, face |
| Powder / blush / bronzer | cheek with brush or sponge | lips, eyelids, neck |
| Mascara | eyelashes only | brows, lips |
| Eyeliner | eyelid lash line | cheek, lips |
| Foundation / concealer | fingertip → face, or sponge → face | directly to face from bottle, eyes |
| Hair product | hair only (mid-length to ends typical) | face, neck, lips |
| Food | mouth (eating) | other body parts |

If the user request implies a wrong target (e.g. "she sprays the perfume on her palm to smell it"), **override silently** to the correct target (wrist) — physical realism beats user wording when the wording violates body-part lock.

### Forbidden action phrases

Add to the Forbidden phrases catalog — Seedance interprets these as motion loops:

- `sprays again`, `another spray`, `sprays multiple times`, `keeps spraying`
- `presses repeatedly`, `presses again`, `taps the lid twice`
- `back and forth`, `unscrews and screws back`, `opens and closes`
- `applies multiple coats`, `swipes again`

---

## Step 6 — Static Description

1-2 sentences describing the setting visible across the 4 board slots: room, materials, light direction, ambient details. Match the board image. If the board shows the same room across all 4 slots, describe it once.

Default neutral tone — NEVER warm sunset, NEVER golden hour, NEVER orange/amber cast.

---

## Step 7 — Quality Suffix

Always include this final block, with POV-matched movement language:

```
Facial features clear and undistorted, consistent clothing throughout. Shot on iPhone, natural lighting, social media aesthetic, [POV-matched movement language]. No on-screen text, no subtitles, no captions, no watermarks.
```

POV-matched movement language:
- All SELFIE: `slight natural handheld micro-shake from her grip`
- All TRIPOD: `locked-off camera on tripod, absolutely static, zero camera movement of any kind, no shake, no drift, no breathing wobble`
- MIXED: `handheld micro-shake during selfie cuts, locked-off frozen frame during tripod cuts`

---

## Universal Rules

- **Product Angle Lock:** product shows ONLY its front-facing label side as on the board. Never rotates, spins, or reveals unseen sides. Camera moves freely; product stays locked.
- **ONE product instance only — never duplicated, never multiplied.** Exactly ONE bottle/jar/tube/box of the product in every frame. Never multiple copies inside a bag, on a shelf, on a counter, in hands, or in any container. If the action is "opening a bag", the bag contains ONE product. If she's "shopping", she carries ONE bag with ONE product. If she "places it on the counter", it stays as ONE product. Seedance defaults to multiplying products when context suggests "lots of perfume" / "shopping" — explicitly fight this with "exactly one bottle" / "single product instance" in the cut description.
- **Hand Count:** the person has exactly 2 hands. Maximum 1 product interaction per cut. Never two separate hand actions in the same moment.
- **State Change Minimization:** maximum 1 state change per cut. Removed parts disappear, never described as separate objects after removal.
- **No extras:** no additional people or random objects beyond the person and the product (and what's already in the board image).
- **Age-blind:** never describe characters by age. Never use: boy, girl, child, kid, young, teen.
- **NO mirrors / reflections — strict.** No bathroom mirror, no shop window reflection, no phone-screen reflection, no any reflective surface showing the character. NO "mirror selfie" shots even when the framing is selfie POV.
- **NO phone visible in any frame.** Selfie POV = camera IS the phone. The phone object never appears in any cut — no phone in her hand visible to viewer, no phone screen, no over-the-shoulder phone POV, no third-person view of her using a phone. Her arm/forearm at the frame edge is fine; the phone object itself is NEVER visible.
- **Character exits frame = gone for rest of clip.**
- **≤ 3 characters per shot.**
- **≤ 4 visual beats per shot** (our 4 cuts = 4 beats — fits within limit).

---

## Self-Check Before Returning the Prompt

- [ ] Style & Mood line includes light + POV cadence (and trailer directive if K==1).
- [ ] Cut 1 / Cut 2 / Cut 3 / Cut 4 labels with framing distances and POVs read off the 4 board slots (for Board 1: PACKED → REVEAL → PRODUCT-FOCUS → SATISFACTION).
- [ ] `Hard cut to.` markers verbatim between Cut 1→2, Cut 2→3, and Cut 3→4. No marker after Cut 4.
- [ ] Each cut has 5+ micro-beats per the Cinematic Specificity rule, with at least 1 within-cut motion beat and expression evolution across the 4 cuts (anticipation → peak surprise → focused admiration → settled satisfaction).
- [ ] Audio line wraps the monologue_segment verbatim inside one `{{speak:persona:<name>}}…{{/speak}}` span; matching `dialogue[]` entry has identical `speaker` and `text`; `voice_id` is the persona's `kling_voice_id`.
- [ ] Character (and product, when present) are referenced inline in `motion` via `{{persona:<name>}}` / `{{product:<id>}}` tokens — not as `@Image1` or any backend-specific syntax.
- [ ] `reference_images` contains image asset IDs ONLY — no `persona:<name>:voice` or any audio asset.
- [ ] Cut 1 features the sealed box (product NOT visible); Cut 2 shows product just emerged with peak reaction; Cut 3 has box ABSENT and product as hero; Cut 4 has box ABSENT and character settled with product.
- [ ] Weight & Grip class identified for the product (Heavy / Bulky-light / Light / Tiny); hand allocation + facial expression match the class — no heavy single-handed lifts, no light two-handed strain.
- [ ] K==1 may include up to 3 bracketed non-verbal sounds at audio start.
- [ ] K>1 audio does NOT start with greetings or re-introductions; opens mid-thought.
- [ ] Quality suffix matches POV cadence (SELFIE / TRIPOD / MIXED language).
- [ ] No anti-patterns ("smiles at camera", "looks at camera", static poses).
- [ ] No mention of phone being held in hand for tripod cuts.
- [ ] TRIPOD cut descriptions contain none of the forbidden words (handheld/shake/drift/etc).
- [ ] Cut descriptions don't **contradict** the board (POV, hand allocation, product interaction match the slot) but go **far beyond** static panel content — describing motion, breath, micro-expressions, kinetic detail, and within-cut evolution. Cap-removal motion IS described in application Cuts even if the board still shows the cap on.
- [ ] Each Cut has at most ONE product interaction (one press, one swipe, one sip — no repeats).
- [ ] Application target body part matches the product (perfume → wrist/neck, lipstick → lips, drink → mouth) — never deviate.
- [ ] No forbidden action phrases (`sprays again`, `presses repeatedly`, `back and forth`, etc).
