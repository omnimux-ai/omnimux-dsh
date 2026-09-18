# UGC Tutorial Seedance Clip Prompt Guide

Use this when composing the `motion` string for `generate_scene_video` (`backend="seedance"`) to produce a single 9:16 vertical UGC tutorial video clip with FOUR INTERNAL HARD CUTS — one chronological step of using the product per cut, with the corresponding `"Step N — Heading"` caption (baked into the source board) staying visible throughout each cut.

The output of this composition is a single prose `motion` string (no JSON wrapper, no markdown fences) plus a matching `dialogue[]` array. The orchestrator skill passes:

- `start_image` = the generated 21:9 board sheet **with rendered Step captions** — Seedance treats it as the narrative map AND reads the caption typography off it
- `reference_images` = `[character, product]` (plus `tutorial:board:K-1` when K>1) — **IMAGE asset IDs only**; voice/audio assets do NOT go here
- `motion` = the prose string composed per this guide, with inline `{{persona:<name>}}` / `{{product:<id>}}` tokens for asset references and one trailing `{{speak:persona:<name>}}…{{/speak}}` span wrapping the monologue (plus the CTA tail if `is_last_board`)
- `dialogue` = single-entry array `[{speaker, text, voice_id, delivery}]` matching the speak span
- `aspect_ratio` = `9:16`
- `duration` = `clip_duration` (rounded to an integer in [3, 15])
- `backend` = `"seedance"` (pass explicitly even when it's the mode default)

The IR layer (`SceneIR`) translates these into the Seedance-specific format the model actually receives — you never write `@Image1`, `@Audio1`, or backend-specific syntax in `motion`. **Use `{{asset_id}}` and `{{speak:X}}` tokens only.** Voice timbre resolves automatically from the persona registry via the speaker's persona ID.

You are writing a Seedance motion string that produces a single 9:16 vertical video clip of `clip_duration` seconds. The clip contains FOUR INTERNAL HARD CUTS corresponding to the four board slots — Cut 1 = slot 1's step, Cut 2 = slot 2's step, Cut 3 = slot 3's step, Cut 4 = slot 4's step. **Each cut depicts ONE physical step of using the product, AND the rendered `"Step N — Heading"` caption baked into that slot stays visible throughout the corresponding cut.**

When `is_last_board == true` (this is the final board of the whole video), the LAST ~0.5-1 second of Cut 4 carries a CTA tail: a brief talking-head selfie + downward hand gesture + short English CTA phrase ("Link in bio." / "Follow me." / "Subscribe!"). The CTA tail does NOT add a fifth cut and does NOT appear as a new on-screen caption — it lives only inside Cut 4 as audio + gesture, and the Step 4 caption stays visible throughout.

The board image is your **narrative map** — read it to understand the chronological tutorial steps and the rendered Step captions, not to copy frames.

Extract from the board: **which step happens** in each slot, **chronology** (slot 1 → Cut 1, slot 2 → Cut 2, slot 3 → Cut 3, slot 4 → Cut 4), **the rendered Step captions** (these are part of the source frames — they are baked into the slot images and stay visible during the corresponding cuts), **overall aesthetic** (light, environment, mood), and **character / product continuity**.

Your written prompt is the **primary signal** to Seedance. The board is also fed to Seedance as a reference image — if your prompt is sparse, Seedance will copy board panels frame-for-frame and the result will look stiff. Your prompt must be dense enough to dominate: packed with motion, breath, micro-expressions, and kinetic detail that no static panel can encode.

**Language: English only.** All output, all examples, all captions, all dialogue — English.

---

## Inputs (provided in the skill dispatch)

1. **Board image** — REQUIRED. 21:9 strip, four vertical 9:16 slots. **Each slot has a rendered `"Step N — Heading"` caption baked into the image.**
2. **Character image** — REQUIRED. Identity reference for the creator.
3. **Product image** — OPTIONAL. When provided, Angle Lock applies (only the front-facing side of the product, never rotate / spin / reveal unseen sides).
4. **Previous-board image** — OPTIONAL (K > 1). Continuity reference.
5. **Metadata** — passed externally:
   - `K` — board index (1, 2, 3, ...)
   - `N` — total boards
   - `clip_duration` — 4-15 seconds
   - `arc_role` — always `BOARD_TUTORIAL_STEPS` for tutorial flow
   - `is_last_board` — boolean. `true` only when K == N. Controls whether Cut 4 ends with the CTA tail.
   - `step_captions` — array of 4 strings (the captions baked into the slots), e.g. `["Step 5 — Pump Twice", "Step 6 — Spread Evenly", "Step 7 — Pat It In", "Step 8 — Final Mist"]`
   - `monologue_segment` — the spoken text for THIS clip, to distribute across the 4 cuts
   - `cta_phrase` (OPTIONAL) — used only when `is_last_board == true`; auto-pick if absent

---

## Motion Structure (mandatory)

Each `motion` string follows this structure, in order. Inline `{{persona:<name>}}` / `{{product:<id>}}` tokens anchor character and product references; the trailing `{{speak:persona:<name>}}…{{/speak}}` span carries the monologue (and the CTA tail when applicable) and must have a matching `dialogue[]` entry.

```
Style & Mood: UGC iPhone aesthetic, [light description matching the board], [SELFIE: front-facing camera, intimate handheld feel | TRIPOD: locked-off on tripod, completely static, frozen frame | MIXED: starts TRIPOD locked-off, hard-cuts to TRIPOD locked-off, hard-cuts to TRIPOD locked-off, hard-cuts to SELFIE handheld — POV alternates per cut as specified], social media vertical format. Each cut shows the on-screen text caption "Step N — Heading" baked into the frame in [font vibe — match the board's typography], identical typography across cuts in this clip. Featuring {{persona:<name>}}[ and {{product:<id>}}].

Narrative Summary: This clip demonstrates Steps [4·(K−1)+1] through [4·K] of the [PRODUCT] tutorial, with the four cuts following the chronological usage sequence.

Dynamic Description:
Cut 1 (0-Xs) — [framing distance per board slot 1, e.g. MEDIUM, TIGHT CLOSE-UP, MACRO, WIDER, PRODUCT-EXTENDED] [POV per slot 1]: [step 1 action — explicit physical mechanic, hand allocation, 5+ micro-behaviors, expression, product placement]. The on-screen caption "Step (4·(K−1)+1) — Heading" stays visible in its baked [position — top-center / bottom-center] throughout this cut, sharp and legible, baked into the frame. Hard cut to.
Cut 2 (Xs-Ys) — [framing distance per board slot 2] [POV per slot 2]: [step 2 action — explicit mechanic, hand allocation, 5+ micro-behaviors, expression, product placement]. The on-screen caption "Step (4·(K−1)+2) — Heading" stays visible in its baked [position] throughout this cut, sharp and legible, baked into the frame. Hard cut to.
Cut 3 (Ys-Zs) — [framing distance per board slot 3] [POV per slot 3]: [step 3 action — explicit mechanic, hand allocation, 5+ micro-behaviors, expression, product placement]. The on-screen caption "Step (4·(K−1)+3) — Heading" stays visible in its baked [position] throughout this cut, sharp and legible, baked into the frame. Hard cut to.
Cut 4 (Zs-end) — [framing distance per board slot 4] [POV per slot 4]: [step 4 action — explicit mechanic, hand allocation, 5+ micro-behaviors, expression, product placement]. The on-screen caption "Step (4·K) — Heading" stays visible in its baked [position] throughout this cut, sharp and legible, baked into the frame. [IF is_last_board == true: In the final ~0.5-1 second of this cut, the camera angle resolves into a tight talking-head selfie POV; {{persona:<name>}} pulls in close to lens, makes a quick decisive downward hand gesture toward the bottom edge of the frame as if pointing at the description, eyes flicked briefly to lens with a confident half-smile, and briefly says the English CTA phrase. The Step (4·K) caption stays visible in its baked position throughout — no new caption is added for the CTA.]

Static Description: [1-2 sentences: setting, ambient details, props, light direction — match the board image's environment].

Audio: She speaks to camera, iPhone microphone audio with natural room tone[, IF K==1 AND non-verbal cues used: prepend up to 3 bracketed cues inside the speak span at the start, sparingly]: {{speak:persona:<name>}}[monologue segment, distributed across the 4 cuts at natural phrase boundaries][, IF is_last_board == true: append the CTA phrase here at the very end, e.g. " Link in bio."]{{/speak}}

Facial features clear and undistorted, consistent clothing throughout. Shot on iPhone, natural lighting, social media aesthetic. [SELFIE-only: slight natural handheld micro-shake from her grip | TRIPOD-only: locked-off camera on tripod, absolutely static, zero camera movement of any kind, no shake, no drift, no breathing wobble | MIXED: handheld micro-shake during selfie cuts, locked-off frozen frame during tripod cuts]. The Step captions baked into each slot stay sharp, legible, undistorted, and unchanged throughout each cut. No additional on-screen text, no subtitles, no extra captions, no watermarks beyond the Step captions baked into the source frames.
```

Accompanying `dialogue` array:

```json
[
  {
    "speaker": "persona:<name>",
    "text": "<monologue segment verbatim — same words as inside the {{speak}} span, including the CTA phrase appended at the end when is_last_board>",
    "voice_id": "<persona's kling_voice_id from setup_persona>",
    "delivery": "<2-6 word tone cue, e.g. 'calm, instructive' / 'warm, conversational'>"
  }
]
```

The `speaker` string must match the persona ID used in `{{speak:persona:<name>}}`. The `text` must match what's inside the speak span verbatim. The `voice_id` is required for Kling parity (auto-resolved for Seedance, but always pass it). `delivery` is optional but recommended — tutorials lean calm/instructional; if K=1 has trailer-style cues, lean slightly brighter.

For male creators: replace "She speaks" with "He speaks", change pronouns throughout. Always third-person framing.

---

## Step 1 — Read the Board

Before writing the prompt, read the board image and extract per-slot:

1. **Step caption** — read the rendered text `"Step N — Heading"` baked into the slot. This is the canonical heading for the cut. **Quote it verbatim in your Cut description** — same casing, same en-dash separator, same exact heading words.
2. **POV** — selfie or tripod (look for the creator's phone-holding arm visible at the frame edge = SELFIE; framing locked symmetric with both hands free = TRIPOD).
3. **Framing distance** — MEDIUM CLOSE-UP, TIGHTER CLOSE-UP, TIGHT CLOSE-UP, MEDIUM, MEDIUM-WIDE, MACRO, WIDER, PRODUCT-EXTENDED.
4. **Action** — what physical step she's performing (the Step heading should match).
5. **Product placement** — visible in hand / partially visible / fully hidden / absent.
6. **Expression** — opener / building / peak / settle.
7. **Caption position** — top-center or bottom-center; identical across all 4 slots of this board.

Don't **contradict** the board (don't switch SELFIE↔TRIPOD between Cut and slot, don't swap which hand holds the product, don't replace the product interaction). Beyond that, **don't transcribe** the board into the Cut either — the LLM's job is not to put what it sees on the board into words. The Cut description's job is to render the **physical step** of that slot **in motion**: in-cut movement, weight shifts, breath, micro-expressions, kinetic hand detail, posture changes — all the things the static panel cannot show.

Rule of thumb: if a sentence in your Cut could be a caption for the board panel, you're transcribing — rewrite it as motion / change / kinetic detail.

**For tutorial specifically:** each slot is one chronological step of using the product. Cut N must depict the physical mechanic of Step N as the heading describes (`"Apply Primer"` → fingertip onto cheek; `"Press The Pump"` → press once with thumb; `"Pat It In"` → fingertip patting motion). **Step headings are the contract; honor them.** The chronology Step 1 → Step 2 → Step 3 → Step 4 (within this board, with global numbering) is the spine of the clip; treat any deviation as an error in your reading.

**Critical reminder — board panels are SEQUENCE and TIMING reference only.** They confirm WHICH step each slot represents and they show the rendered captions. They are NOT pose-by-pose frame templates. Your Cut description must invent the in-cut motion (breath, weight shift, kinetic detail, expression evolution, hand mechanics) — these things are NOT on the static panel and must come from your text.

---

## Step 2 — POV Cadence and Style & Mood

Based on the board's per-slot POVs, set the Style & Mood line:

| Per-slot POVs | Style & Mood camera language |
|---|---|
| All four slots SELFIE | `front-facing camera, intimate handheld feel` |
| All four slots TRIPOD | `locked-off on tripod, completely static, frozen frame` |
| POV varies between slots (e.g., TRIPOD → TRIPOD → TRIPOD → SELFIE) | `MIXED: starts [POV1] [language], hard-cuts to [POV2] [language], hard-cuts to [POV3] [language], hard-cuts to [POV4] [language] — POV alternates per cut` |

The default tutorial cadence is `TRIPOD → TRIPOD → TRIPOD → SELFIE` (Steps 1-3 demonstrate two-handed mechanics; Step 4 is the wrap and the natural lead-in to the CTA tail when `is_last_board`). Use the MIXED phrasing in Style & Mood for it. If product mechanics make a step naturally one-handed (e.g., spray bottle, lipstick), that step may be SELFIE — match the board.

The Style & Mood line MUST also mention the rendered Step captions and their typography vibe: `Each cut shows the on-screen text caption "Step N — Heading" baked into the frame in [font vibe matching the board], identical typography across cuts in this clip.`

---

## Step 3 — Time-Slicing the Cuts

Distribute `clip_duration` roughly evenly across the 4 cuts — tutorial steps are similar in narrative weight, so default to equal slices. Adjust only if a step is unusually quick (e.g., a single press) or unusually involved (e.g., a multi-stroke application):

| clip_duration | Cut 1 | Cut 2 | Cut 3 | Cut 4 |
|---|---|---|---|---|
| 4s | 1s | 1s | 1s | 1s |
| 6s | 1.5s | 1.5s | 1.5s | 1.5s |
| 8s | 2s | 2s | 2s | 2s |
| 10s | 2.5s | 2.5s | 2.5s | 2.5s |
| 12s | 3s | 3s | 3s | 3s |
| 15s | 3.5s | 4s | 4s | 3.5s |

Adjust within ±0.5s per cut if needed. Each cut must remain ≥0.5s.

When `is_last_board == true`, the CTA tail (~0.5-1s) is BUILT INTO Cut 4's allotted time — it does not extend the clip duration. So if Cut 4 = 4s and `is_last_board`, the structure is roughly: 3-3.5s of Step (4·K) action, then 0.5-1s of talking-head selfie + downward gesture + brief English CTA.

Write the time spans into the Cut headers exactly: `Cut 1 (0-3.5s)`, `Cut 2 (3.5-7.5s)`, `Cut 3 (7.5-11.5s)`, `Cut 4 (11.5-15s)` — values per the table above.

---

## Step 4 — Action Language Per Cut

For each cut, write 4-10 sentences in the Dynamic Description describing the physical step. Rules:

### TRIPOD cut language
- Camera is **absolutely frozen on a tripod — zero movement of any kind. No shake. No drift. No breathing wobble. No organic sway. No micro-movement. The frame is completely fixed and immovable. Only the subject and the product move within the locked frame.**
- The Style & Mood / quality suffix MUST use locked-off TRIPOD phrasing for the tripod cut(s).
- **Forbidden words inside a TRIPOD cut's description:** `handheld`, `shake`, `drift`, `wobble`, `sway`, `slight movement`, `micro-shake`, `intimate handheld`, `natural movement`, `subtle movement`. These leak motion into the render.

### SELFIE cut language
- **The phone is NEVER visible in frame.** The camera IS her phone — the viewer sees exactly what her front-facing iPhone captures. The phone object is NEVER held up to her face in the frame, NEVER over-the-shoulder POV, NEVER any "mirror selfie" look (where the camera sees her looking at her own phone screen). NO phone screen visible. NO third-person view of her holding a phone.
- Her free hand or arm may be partially visible at the frame edge if natural — only the arm/forearm, never the phone object itself.
- Natural handheld micro-shake from her grip is expected.
- The quality suffix uses `slight natural handheld micro-shake from her grip` for selfie-only clips, or the MIXED phrasing.

**Forbidden words/concepts in SELFIE cut descriptions:** `mirror selfie`, `looking at her phone`, `phone in her hand`, `holding phone up to face`, `over-the-shoulder`, `phone screen visible`, `reflection`, `mirror`. These leak phone-as-object into the render.

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

### Caption persistence per cut (mandatory)

Each Cut MUST mention that the rendered Step caption stays visible in its baked position throughout the cut, sharp and legible. The captions are baked into the source slot frames; Seedance must preserve them across the cut's duration without redrawing, glitching, replacing, or animating them. Required phrase to include in each Cut description (verbatim, adapted to the slot):

> `The on-screen caption "Step N — Heading" stays visible in its baked [top-center / bottom-center] position throughout this cut, sharp and legible, baked into the frame.`

NEVER describe the caption animating in, out, or shifting position. NEVER describe a NEW caption appearing during a cut. NEVER describe the caption changing font, color, or size. The caption is a static element baked into the source frame and Seedance is told to preserve it as-is.

For Cut 4 with `is_last_board == true`: the Step (4·K) caption stays visible throughout the cut, **including during the 0.5-1s CTA tail**. NEVER add a "Subscribe!" / "Follow me!" / "Link in bio" caption to the frame. The CTA is audio + gesture only.

### Weight & Grip Logic (mandatory)

Classify the product by weight before describing the lifting/holding action in any Cut:

| Class | Examples | Hand allocation | Facial expression |
|---|---|---|---|
| Heavy | Appliance, bottle ≥1L, toolbox-class | TWO hands required, body leans forward | Visible strain — jaw set, brow slightly furrowed, controlled exhale |
| Bulky but light | Oversized box, large but empty | TWO hands for stability | NO strain — relaxed face, easy grip |
| Light | Cosmetics, phone, small bottle | ONE hand, relaxed grip | Neutral / pleased / focused, no strain |
| Tiny | Earring, pill, contact lens | Pinched (thumb + index), close to lens | Focused / curious |

**Forbidden:** describing one-handed lifting of heavy items, or two-handed strain on light items. Both produce unrealistic AI-tell renders. Classify the product before writing the prompt — if the class is ambiguous, default to the heavier class (safer for realism).

### Cinematic Specificity (mandatory per cut)

Each cut must include all three of:

1. **5+ concrete micro-beats** from this menu (rotate — never repeat the same combination across the 4 cuts):
   weight shift, hair touch, glance break, head tilt, eyebrow flash, hand gesture, posture shift, lip movement, shoulder shrug, breath (inhale / exhale / sigh / sharp inhale), jaw set, neck tendon definition, knuckle tightening, foot pivot, brow furrow, chin tuck, lean forward / back, micro-grin, half-blink, slight off-center handheld tilt (selfie only).

2. **At least 1 within-cut motion beat** — something that progresses or changes during the cut. The cut is not a still — describe what evolves inside it.

3. **Expression evolution across the 4 cuts** — never the same expression twice. Default tutorial arc: focused setup (Cut 1) → instructive demonstration (Cut 2) → focused application (Cut 3) → satisfied wrap / talking-head (Cut 4). Identical expression across cuts is forbidden.

**Forbidden in any Cut description:** sentences that only re-state what the static board already shows. Every sentence must add something the board cannot — motion, sound cue, expression beat, kinetic detail, breath, tension, weight transfer.

Anti-patterns (NEVER write these):
- "smiles at the camera"
- "looks at the camera"
- "sits in front of the camera"
- "holds the product and talks"
- Identical expression across all 4 cuts

### Cut Markers (mandatory verbatim)

Between Cut 1 and Cut 2: `Hard cut to.` — at the end of Cut 1's description sentence.
Between Cut 2 and Cut 3: `Hard cut to.` — at the end of Cut 2's description sentence.
Between Cut 3 and Cut 4: `Hard cut to.` — at the end of Cut 3's description sentence.
No marker after Cut 4.

These are scene-edit instructions Seedance reads literally. Without them, cuts collapse into smooth motion.

### CTA Tail (mandatory when `is_last_board == true`, FORBIDDEN otherwise)

Only when `is_last_board == true`, append the CTA tail to the END of Cut 4's description (after the Step (4·K) action sentences AND the caption-persistence sentence, before the final period of the Cut 4 paragraph):

> In the final ~0.5-1 second of this cut, the camera angle resolves into a tight talking-head selfie POV — {{persona:<name>}} pulls in close to lens, makes a quick decisive downward hand gesture toward the bottom edge of the frame as if pointing at the description, eyes flicked briefly to lens with a confident half-smile, and briefly says "[CTA phrase]". The Step (4·K) caption stays visible in its baked position throughout — no new caption is added for the CTA.

Pick the CTA phrase by available time (or use the `cta_phrase` from the dispatch if supplied):
- ~1s of audio space → `"Link in bio."` (3 syllables) or `"Follow me."` (3 syllables)
- ≤0.5s → `"Subscribe!"` (2 syllables)

If the monologue is dense and Cut 4 is short, prefer the shortest CTA. **Never extend the clip duration to fit the CTA** — clip the monologue earlier instead.

For ALL boards where `is_last_board == false`, NEVER include a CTA tail in any cut. The clip ends naturally on Step (4·K)'s action.

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

### K=1 (Board 1) — measured non-verbal sounds

ONLY for K=1, optionally include up to 3 bracketed non-verbal sounds at the START of the speak span, before the monologue. The bracketed cues stay INSIDE `{{speak:…}}` (they're part of what the persona vocalizes):

```
Audio: She speaks to camera, iPhone microphone audio with natural room tone. {{speak:persona:<name>}}[*small bright laugh*] [*okay so*] <monologue>{{/speak}}
```

The `dialogue[].text` MUST contain those bracketed cues verbatim too — `text` mirrors the speak span contents.

Use sparingly — at most 3 bracketed sounds. Tutorial tone is generally measured and calm; trailer-style gasps fit unboxing more than tutorial. **Skip non-verbal cues entirely if the monologue tone is calm/instructional** (most tutorials are).

### K>1 (Boards 2..N) — strict no-greetings rule

The Audio segment for boards 2..N MUST NOT start with greetings or product re-introductions. Forbidden openers:
- "hey", "hi", "hi guys", "hey everyone", "what's up"
- "today I'm showing you", "I want to share", "I just got", "I wanted to tell you about", "let me show you"
- "so this is the [product]" — the product was named in board 1 already
- "as I was saying", "going back to", "anyway"
- "okay so", "alright so" used as a fresh-start opener

Instead, the audio opens **mid-thought** — typically continuing into the next step (`"Now I press the pump twice..."`, `"Then I rub it in like this..."`, `"After that settles, I move to..."`). The viewer should feel they're watching one continuous tutorial with hard cuts, not N separate recordings.

NO bracketed non-verbal sounds for K>1.

### CTA tail in audio (when `is_last_board == true`)

Append the brief English CTA phrase at the very END of the speak span, after the last step's monologue text. The CTA is INSIDE the same `{{speak:…}}` span (it's spoken by the persona):

```
Audio: She speaks to camera, iPhone microphone audio with natural room tone: {{speak:persona:<name>}}<monologue verbatim>. <CTA phrase>{{/speak}}
```

Examples:
- `{{speak:persona:maya}}...and that's how I get glass skin in five minutes. Link in bio.{{/speak}}`
- `{{speak:persona:maya}}...quick swipe and you're done. Follow me.{{/speak}}`
- `{{speak:persona:maya}}...press once for a single shot. Subscribe!{{/speak}}`

The `dialogue[0].text` MUST include the CTA phrase too — it mirrors the speak span contents exactly.

The CTA is one short phrase, English, picked by remaining time. **Never two CTAs.** Never combine ("Link in bio AND follow me!"). Pick one.

For `is_last_board == false`, NEVER append a CTA — the audio ends naturally with the last step's instructional sentence.

### No phrase repetition across cuts (mandatory)

Each cut's audio segment is UNIQUE — never repeat the same sentence, claim, product mention, or descriptor in another cut. Each cut owns a different chunk of the monologue (one tutorial step's narration each). If the same idea needs to span multiple cuts, paraphrase or move on.

When you split the `monologue_segment` across the 4 cuts, verify NO sentence or near-identical phrase appears in two different cut segments. If the user-supplied monologue itself contains repetition, reword to deduplicate.

### Forbidden AI-tell phrases (NEVER use)

These phrases are dead AI giveaways. Real creators don't say them. Replace verbatim or rephrase:

- `I'm obsessed`, `I am obsessed`, `literally obsessed`, `so obsessed`, `like obsessed`, `obsessed with this`, `obsessed` as praise — **all banned, no exceptions**
- `you have to try this`, `you have to see this`, `you NEED this` — overused AI clichés
- Generic praise without specifics: `it's amazing`, `it's incredible`, `so good`, `mind-blowing`, `unreal`, `out of this world`
- `Trust me on this`, `I cannot recommend enough`, `game changer`, `total game changer` — AI sales-speak
- `ten out of ten`, `10/10`, `100%`, `1000%` — AI rating clichés

Use SPECIFIC creator language instead — describe **mechanics and outcomes**:
- `Two pumps is plenty for the whole face.`
- `Press it in with the pads of your fingers, don't rub.`
- `Wait thirty seconds before the next step.`
- `One drop on the back of each hand first, then onto the cheeks.`
- Real creators describe **what to do and what happens**, not abstract feelings.

### Audio language

**English only.** Switch only if user explicitly requests another language — but the default and the strong preference is English, including the CTA tail.

For male creators: "He speaks" / "He" — never mix genders in one prompt.

---

## Step 5b — Product Action Logic

This is where realistic product interaction is enforced. The board image is a composition reference; if the board shows a closed product, the video Cut MUST still describe a realistic opening motion before any application — Seedance will not invent it. Action logic lives here, not in the board.

### Single action per Cut (mandatory)

Each Cut depicts ONE physical step at most. Forbidden patterns:
- Repeated sprays / multiple presses / "she sprays again"
- Back-and-forth motion (open → close → open)
- Two distinct interactions in the same Cut (e.g. spray AND smell AND apply — pick one)

One press, one mist, one swipe, one sip, one scoop. If the action needs more, split across Cuts (or split across boards if you've already used all 4).

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

Always include this final block, with POV-matched movement language AND explicit caption-preservation note:

```
Facial features clear and undistorted, consistent clothing throughout. Shot on iPhone, natural lighting, social media aesthetic, [POV-matched movement language]. The Step captions baked into each slot stay sharp, legible, undistorted, and unchanged throughout each cut. No additional on-screen text, no subtitles, no extra captions, no watermarks beyond the baked-in Step captions.
```

POV-matched movement language:
- All SELFIE: `slight natural handheld micro-shake from her grip`
- All TRIPOD: `locked-off camera on tripod, absolutely static, zero camera movement of any kind, no shake, no drift, no breathing wobble`
- MIXED: `handheld micro-shake during selfie cuts, locked-off frozen frame during tripod cuts`

---

## Universal Rules

- **Product Angle Lock:** product shows ONLY its front-facing label side as on the board. Never rotates, spins, or reveals unseen sides. Camera moves freely; product stays locked.
- **ONE product instance only — never duplicated, never multiplied.** Exactly ONE bottle/jar/tube/box of the product in every frame. Never multiple copies. Seedance defaults to multiplying products when context suggests "lots of perfume" / "shopping" — explicitly fight this with "exactly one bottle" / "single product instance" in the cut description.
- **Hand Count:** the person has exactly 2 hands. Maximum 1 product interaction per cut. Never two separate hand actions in the same moment.
- **State Change Minimization:** maximum 1 state change per cut. Removed parts disappear, never described as separate objects after removal.
- **No extras:** no additional people or random objects beyond the person and the product (and what's already in the board image).
- **Age-blind:** never describe characters by age. Never use: boy, girl, child, kid, young, teen.
- **NO mirrors / reflections — strict.** No bathroom mirror, no shop window reflection, no phone-screen reflection, no any reflective surface showing the character. NO "mirror selfie" shots even when the framing is selfie POV.
- **NO phone visible in any frame.** Selfie POV = camera IS the phone. The phone object never appears in any cut.
- **Character exits frame = gone for rest of clip.**
- **≤ 3 characters per shot.**
- **≤ 4 visual beats per shot** (our 4 cuts = 4 beats — fits within limit; the CTA tail in Cut 4 is a sub-beat of Cut 4, not a new beat).
- **Step captions are baked into the source frames** — never animate them, never replace them, never overlay anything else on them. They stay static and consistent throughout each cut.
- **English only** for all dialogue, captions, examples, CTA tail.

---

## Self-Check Before Returning the Prompt

- [ ] Style & Mood line includes light + POV cadence + caption-vibe note ("each cut shows the on-screen caption ... baked into the frame in [font vibe]").
- [ ] Cut 1 / Cut 2 / Cut 3 / Cut 4 labels with framing distances and POVs read off the 4 board slots.
- [ ] **Each Cut description quotes the slot's `"Step N — Heading"` caption verbatim and confirms it stays visible in its baked position throughout the cut.**
- [ ] `Hard cut to.` markers verbatim between Cut 1→2, Cut 2→3, and Cut 3→4. No marker after Cut 4.
- [ ] Each cut has 5+ micro-beats with at least 1 within-cut motion beat and expression evolution across the 4 cuts (focused setup → instructive demonstration → focused application → satisfied wrap).
- [ ] Audio line wraps the monologue_segment verbatim inside one `{{speak:persona:<name>}}…{{/speak}}` span; matching `dialogue[]` entry has identical `speaker` and `text`; `voice_id` is the persona's `kling_voice_id`.
- [ ] **If `is_last_board == true`**: Cut 4 ends with the ~0.5-1s talking-head selfie + downward gesture + brief English CTA phrase ("Link in bio." / "Follow me." / "Subscribe!"). The Audio span ends with the same CTA appended INSIDE the `{{speak:…}}` span. The `dialogue[0].text` mirrors that. The Step 4 caption stays visible throughout — no new on-screen text.
- [ ] **If `is_last_board == false`**: NO CTA tail anywhere — Cut 4 ends naturally on Step 4 action, audio ends naturally on the last instructional sentence.
- [ ] Character (and product, when present) are referenced inline in `motion` via `{{persona:<name>}}` / `{{product:<id>}}` tokens — not as `@Image1` or any backend-specific syntax.
- [ ] `reference_images` (passed by the skill) contains image asset IDs ONLY — no `persona:<name>:voice` or any audio asset.
- [ ] Weight & Grip class identified for the product; hand allocation + facial expression match the class — no heavy single-handed lifts, no light two-handed strain.
- [ ] K==1 may include up to 3 bracketed non-verbal sounds at audio start (use sparingly — tutorial tone is generally calm).
- [ ] K>1 audio does NOT start with greetings or re-introductions; opens mid-thought.
- [ ] Quality suffix matches POV cadence (SELFIE / TRIPOD / MIXED language) AND mentions captions stay sharp and unchanged.
- [ ] No anti-patterns ("smiles at camera", "looks at camera", static poses).
- [ ] No mention of phone being held in hand for tripod cuts.
- [ ] TRIPOD cut descriptions contain none of the forbidden words (handheld/shake/drift/etc).
- [ ] Cut descriptions don't **contradict** the board (POV, hand allocation, product interaction match the slot) but go **far beyond** static panel content — describing motion, breath, micro-expressions, kinetic detail, and within-cut evolution.
- [ ] Each Cut has at most ONE product interaction (one press, one swipe, one sip — no repeats).
- [ ] Application target body part matches the product (perfume → wrist/neck, lipstick → lips, drink → mouth) — never deviate.
- [ ] No forbidden action phrases (`sprays again`, `presses repeatedly`, `back and forth`, etc).
- [ ] No NEW captions added in any cut beyond the baked-in Step caption. CTA is audio + gesture only — never a text overlay.
- [ ] All text content (captions referenced, dialogue, CTA) is English only.
