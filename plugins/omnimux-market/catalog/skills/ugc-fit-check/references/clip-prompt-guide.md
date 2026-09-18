# UGC Try-On Clip Prompt Guide — Seedance 2.0

Use this when composing the `motion` string for `generate_scene_video` (backend `seedance`) to produce a single 9:16 vertical try-on clip of `clip_duration` seconds containing FOUR INTERNAL HARD CUTS.

The clip contains FOUR INTERNAL HARD CUTS corresponding to the four board slots — Cut 1 = slot 1's beat, Cut 2 = slot 2's beat, Cut 3 = slot 3's beat, Cut 4 = slot 4's beat. For Board 1 of a try-on video the slots carry the canonical arc: Cut 1 = PRE_WEAR (kraft bag, character speaks **on-camera in selfie**, lip-syncing, joyful reaction to package), Cut 2 = WEARING (**voiceover layered** + one natural twirl beat embedded, character silent on camera), Cut 3 = TEXTURE_CLOSEUP (**voiceover layered**, **hand-free macro** of fabric / cut / detail — NO hand contact with the fabric), Cut 4 = STYLE_POSE (**voiceover layered**).

For Boards 2..N the four cuts are pose variations of the character in the product outfit. No kraft bag in any cut. No twirl in any cut beyond Board 1. Each cut still carries its corresponding audio line — Cut 1 = on-camera dialogue if POV=SELFIE / voiceover if POV=TRIPOD (mid-thought, no greetings); Cuts 2 / 3 / 4 = voiceover always.

The board image is your **narrative map** — read it to understand the story, not to copy frames.

Extract from the board: **what happens** in each slot (the beat), **chronology** (slot 1 → Cut 1, slot 2 → Cut 2, slot 3 → Cut 3, slot 4 → Cut 4), **overall aesthetic** (light, environment, mood, location_tier), and **character / product / outfit continuity**.

The written prompt is the **primary signal** to Seedance. The board is also fed to Seedance as a reference image — if the prompt is sparse, Seedance will copy board panels frame-for-frame and the result will look stiff. The prompt must be dense enough to dominate: packed with motion, breath, micro-expressions, fabric movement, and kinetic detail that no static panel can encode.

**Language: English only.** All output, all examples, all voiceover content — English.

**Tone parameter** (`excited` / `confident` / `cold` / `playful` / `posh` / `amazed`) drives expression progression and voiceover language style.

---

## Inputs (provided in the skill dispatch)

1. **Board image** — REQUIRED. 21:9 strip, four vertical 9:16 slots. For Board 1 of try-on the slots are PRE_WEAR → WEARING → TEXTURE_CLOSEUP → STYLE_POSE. For Boards 2..N the slots are pose variations.
2. **Character image** — REQUIRED. Identity reference for the creator.
3. **Product image** — REQUIRED. The clothing item / accessory being worn. Garment Consistency Lock applies (silhouette / color / print / recognizable details stay identical; the character may turn or pose freely).
4. **Metadata** — passed externally:
   - `K` — board index (1, 2, 3, ...)
   - `N` — total boards
   - `clip_duration` — 4-15 seconds
   - `arc_role` — for Board 1: `BOARD_1_TRY_ON_CANONICAL`. For Boards 2..N: `BOARD_K_TRY_ON_POSES`.
   - `tone` — one of `excited` / `confident` / `cold` / `playful` / `posh` / `amazed`
   - `audio_lines` — array of 4 short tone-matched English strings, one per cut: `[cut_1_on_camera_dialogue, cut_2_voiceover, cut_3_voiceover, cut_4_voiceover]`.
     - **Index 0** (Cut 1) — character's reaction to having received the package; on-camera dialogue when Cut 1 POV is SELFIE (mouth moves, lip-syncing), voiceover when Cut 1 POV is TRIPOD. E.g. `"look what just arrived"`, `"this is finally here"`.
     - **Index 1** (Cut 2) — voiceover during WEARING; reaction to fit / silhouette / how it looks once worn. E.g. `"the fit is so good"`, `"this works"`.
     - **Index 2** (Cut 3) — voiceover during TEXTURE_CLOSEUP; reaction to fabric / cut / texture detail. E.g. `"the fabric is so soft"`, `"the cut sits perfectly"`.
     - **Index 3** (Cut 4) — voiceover during STYLE_POSE; settled wrap reaction. E.g. `"didn't expect this"`, `"the cut is exactly right"`.
     - Lines never repeat within a board and never repeat across boards.
   - `twirl_in_cut_2` — boolean. `true` for K=1 only (the canonical reveal twirl in Board 1 / Cut 2). `false` for K>1.

---

## Output

The clip-prompt composition produces a single prose `motion` string (no JSON wrapper, no markdown fences). The orchestrator passes it to `generate_scene_video(motion=..., dialogue=[...], ...)`.

Inside `motion`, reference assets via `{{persona:<name>}}` / `{{product:<id>}}` tokens, and wrap each audio line in its own `{{speak:persona:<name>}}…{{/speak}}` span at the appropriate Cut. Each `{{speak}}` span needs a matching `dialogue[]` entry whose `text` and `speaker` exactly match.

---

## Prompt Structure (mandatory)

Each Seedance prompt follows this structure, in order:

```
Style & Mood: UGC iPhone aesthetic, [light description matching the board, tier-matched], [SELFIE: front-facing camera, intimate handheld feel | TRIPOD: locked-off on tripod, completely static, frozen frame | MIXED: starts SELFIE handheld, hard-cuts to TRIPOD locked-off, hard-cuts to TRIPOD locked-off, hard-cuts to TRIPOD locked-off — POV alternates per cut as specified], social media vertical format. Tone: [tone descriptor — excited/confident/cold/playful/posh/amazed].

Narrative Summary: [1 sentence stating what happens in this clip — references the arc_role and the 4-cut throughline. For Board 1: "She picks up the new outfit, tries it on, shows the texture, and lands in a styled pose." For Boards 2..N: "She moves through four pose variations of the new outfit."]

Dynamic Description:
Cut 1 (0-Xs) — [framing distance per board slot 1, e.g. WAIST-UP, MEDIUM] [POV per slot 1, default SELFIE for Board 1]: [for Board 1: PRE_WEAR — character in pre-wear outfit with kraft bag at her side or beside her, product NOT yet worn, expression matching tone, 5+ micro-behaviors, NO opening of bag, NO peeking inside. **She SPEAKS ON CAMERA in selfie**, mouth moves visibly, lip-syncing the assigned audio_lines[0] dialogue line — joyful reaction to having received the package; for Boards 2..N: first pose variation, character in product outfit, audio mode follows POV (SELFIE → on-camera dialogue lip-syncing audio_lines[0]; TRIPOD → voiceover layered audio_lines[0], silent on camera)]. Hard cut to.
Cut 2 (Xs-Ys) — [framing distance per board slot 2, e.g. FULL-BODY, THREE-QUARTER] [POV per slot 2, default TRIPOD]: [for Board 1: WEARING — character now in the product outfit, full body, settled stance, then a brief natural twirl revealing the back of the outfit in roughly the middle of the cut, then settles back facing camera with reaction matched to tone; for Boards 2..N: second pose variation], explicit hand allocation, 5+ micro-behaviors, expression evolution. **Voiceover layered**: character is silent on camera (NOT lip-syncing — she may smile, react expressively, but mouth does not form words); her voice plays as off-camera narration speaking audio_lines[1] (reaction to fit / silhouette). Hard cut to.
Cut 3 (Ys-Zs) — [framing distance per board slot 3, e.g. MACRO, TIGHT CLOSE-UP] [POV per slot 3, default TRIPOD-CLOSE]: [for Board 1: TEXTURE_CLOSEUP — tight macro on fabric / cut / detail, **NO HAND CONTACT with the fabric**. The texture, cut, or design detail is shown through framing, drape, light catching the surface, and natural body micro-movement only (e.g. light catches the texture as she takes a slow breath, the fabric drapes naturally as the body settles, the seam shifts subtly on her shoulders). The character's hands stay at her sides / off-frame / clearly NOT touching the garment. No "operator hand" enters the close-up frame; for Boards 2..N: third pose variation — if framing is macro-tight on the garment, the same NO-HAND-CONTACT rule applies]. **Voiceover layered**: character is silent on camera; her voice plays as off-camera narration speaking audio_lines[2] (reaction to fabric / cut / texture detail). 5+ micro-behaviors. Hard cut to.
Cut 4 (Zs-end) — [framing distance per board slot 4, e.g. MEDIUM-WIDE, FULL-BODY-WIDE] [POV per slot 4]: [for Board 1: STYLE_POSE — character in DIFFERENT room of same home, in slot_4_pose pose (e.g., seated in soft accent armchair, leg crossed casually), settles into pose, holds it, soft natural breath, one micro-adjustment of fabric or posture; for Boards 2..N: fourth pose variation, may be in different room if K≥3]. **Voiceover layered**: character is silent on camera (NOT lip-syncing the voiceover); her voice plays as off-camera narration speaking audio_lines[3] (settled wrap reaction). She may flick a glance to lens, lift a brow, or hold the pose calm. 5+ micro-behaviors.

Static Description: [1-2 sentences: setting, ambient details, props, light direction, location_tier — match the board image's environment].

Audio: [Cut 1 — when POV=SELFIE: on-camera dialogue, she speaks visibly to camera, mouth moves, lip-syncing: "[audio_lines[0]]"; when POV=TRIPOD: layered voiceover, silent on camera, voice off-camera: "[audio_lines[0]]". Cut 2 — layered voiceover, character silent on camera (NOT lip-syncing), her voice off-camera in calm conversational delivery: "[audio_lines[1]]". Cut 3 — layered voiceover, character silent on camera, off-camera voice: "[audio_lines[2]]". Cut 4 — layered voiceover, character silent on camera, off-camera voice: "[audio_lines[3]]". iPhone microphone audio with natural room tone throughout. Plus ambient fabric rustle on Cut 2's twirl beat. Tone-matched delivery for all 4 lines.]

Facial features clear and undistorted, hairstyle consistent across all cuts. Garment is consistent across all cuts in which it appears (Cuts 2, 3, 4 of Board 1; all cuts of Boards 2..N) — silhouette / color / print / recognizable design details identical. Realistic fit on the character's body, natural drape. Shot on iPhone, natural lighting, social media aesthetic. [SELFIE-only: slight natural handheld micro-shake from her grip | TRIPOD-only: locked-off camera on tripod, absolutely static, zero camera movement of any kind, no shake, no drift, no breathing wobble | MIXED: handheld micro-shake during selfie cuts, locked-off frozen frame during tripod cuts]. No mirror or reflection shots. No on-screen text, no subtitles, no captions, no watermarks. No CTA tail.
```

For male creators: replace "She speaks" with "He speaks", change pronouns throughout. Always third-person framing.

The four audio lines must each be wrapped in their own `{{speak:persona:<name>}}…{{/speak}}` span placed in-line at the corresponding Cut's audio description. Example for Cut 1: `... mouth moves visibly, lip-syncing: {{speak:persona:maya}}look what just arrived{{/speak}}.`

---

## Step 1 — Read the Board

Before writing the prompt, read the board image and extract per-slot:

1. **POV** — selfie or tripod (look for the creator's phone-holding arm visible at the frame edge = SELFIE; framing locked symmetric with both hands free = TRIPOD)
2. **Framing distance** — WAIST-UP, MEDIUM, FULL-BODY, THREE-QUARTER, MEDIUM-WIDE, MACRO, TIGHT CLOSE-UP
3. **Beat** — Slot 1 = PRE_WEAR (pre-wear outfit + kraft bag, product not yet worn) / Slot 2 = WEARING (full body in product) / Slot 3 = TEXTURE_CLOSEUP (close-up on fabric detail) / Slot 4 = STYLE_POSE (different room, styled pose)
4. **Outfit state** — pre-wear (S1 of Board 1 only) vs. product (everywhere else)
5. **Expression** — match the tone progression for the board

Don't **contradict** the board (don't switch SELFIE↔TRIPOD between Cut and slot, don't put the character in pre-wear in Slot 2, don't put the kraft bag in Slot 2/3/4). Beyond that, **don't transcribe** the board into the Cut either. The Cut description's job is to render the beat **in motion**: in-cut movement, breath, micro-expressions, fabric movement, kinetic detail, posture changes — all the things the static panel cannot show.

Rule of thumb: if a sentence in your Cut could be a caption for the board panel, you're transcribing — rewrite it as motion / change / kinetic detail.

**For try-on specifically:**
- **Slot 1 (Board 1) ALWAYS depicts the character in pre-wear outfit with the kraft bag** — Cut 1 must reflect this and never describe the product being worn here. The character does NOT open the bag, does NOT lift the product out, does NOT peek inside.
- **Slot 2 ALWAYS shows the character now in the product outfit, full body** — Cut 2 begins with her already in the product. Do NOT describe the changing motion. The hard cut from Cut 1 handles the implicit transition. For Board 1 specifically, embed the **twirl beat** inside Cut 2.
- **Slot 3 ALWAYS shows a close-up on a fabric/detail beat** — Cut 3 includes ONE tactile micro-beat (described in motion).
- **Slot 4 ALWAYS shows a styled pose in a different room** — Cut 4 has voiceover layered while the character poses silently in frame.

**Critical reminder — board panels are SEQUENCE and TIMING reference only.** They confirm WHICH beat each slot represents. They are NOT pose-by-pose frame templates. Your Cut description must invent the in-cut motion (breath, weight shift, fabric movement, twirl arc, expression evolution, hand mechanics) — these things are NOT on the static panel and must come from your text.

---

## Step 2 — POV Cadence and Style & Mood

Based on the board's per-slot POVs, set the Style & Mood line:

| Per-slot POVs | Style & Mood camera language |
|---|---|
| All four slots SELFIE | `front-facing camera, intimate handheld feel` |
| All four slots TRIPOD | `locked-off on tripod, completely static, frozen frame` |
| POV varies between slots (e.g., SELFIE → TRIPOD → TRIPOD → TRIPOD) | `MIXED: starts [POV1] [language], hard-cuts to [POV2] [language], hard-cuts to [POV3] [language], hard-cuts to [POV4] [language] — POV alternates per cut` |

The canonical Board 1 try-on cadence is `SELFIE → TRIPOD → TRIPOD → TRIPOD` (S1 casual selfie with bag; S2/S3/S4 tripod for full-body / close-up / styled pose). Use the MIXED phrasing in Style & Mood for it. For Boards 2..N: typically all TRIPOD with one SELFIE break for variety.

Append the tone descriptor to the Style & Mood line: `Tone: [excited — warm, anticipatory, glowing | confident — collected, settled, half-smile | cold — neutral, runway, restrained | playful — lively, light, grin | posh — refined, restrained-luxe, considered | amazed — eyes lit, lips parted, soft awe].`

---

## Step 3 — Time-Slicing the Cuts

Distribute `clip_duration` across the 4 cuts. Default split for try-on — Cut 2 (the WEARING reveal with twirl) and Cut 4 (styled pose with voiceover) get slightly more time:

| clip_duration | Cut 1 (PRE_WEAR) | Cut 2 (WEARING) | Cut 3 (TEXTURE) | Cut 4 (STYLE_POSE) |
|---|---|---|---|---|
| 4s | 1s | 1.5s | 0.5s | 1s |
| 6s | 1.5s | 2s | 1s | 1.5s |
| 8s | 1.5s | 2.5s | 1.5s | 2.5s |
| 10s | 2s | 3s | 2s | 3s |
| 12s | 2.5s | 3.5s | 2.5s | 3.5s |
| 15s | 3s | 4.5s | 3s | 4.5s |

Adjust if the action of a particular cut needs more or less time. Each cut must remain ≥0.5s.

For Boards 2..N (no twirl in Cut 2, all 4 cuts are pose variations of similar weight), use a more even split — divide `clip_duration` roughly equally across the 4 cuts.

Write the time spans into the Cut headers exactly: `Cut 1 (0-3s)`, `Cut 2 (3-7.5s)`, `Cut 3 (7.5-10.5s)`, `Cut 4 (10.5-15s)` — values per the table above.

---

## Step 4 — Action Language Per Cut

For each cut, write 4-10 sentences in the Dynamic Description describing the action. Rules:

### TRIPOD cut language
- Camera is **absolutely frozen on a tripod — zero movement of any kind. No shake. No drift. No breathing wobble. No organic sway. No micro-movement. The frame is completely fixed and immovable. Only the subject moves within the locked frame.**
- The Style & Mood / quality suffix MUST use locked-off TRIPOD phrasing for the tripod cut(s).
- **Forbidden words inside a TRIPOD cut's description:** `handheld`, `shake`, `drift`, `wobble`, `sway`, `slight movement`, `micro-shake`, `intimate handheld`, `natural movement`, `subtle movement`. These leak motion into the render.

### SELFIE cut language
- **The phone is NEVER visible in frame.** The camera IS her phone. The phone object is NEVER held up to her face in the frame, NEVER over-the-shoulder POV, NEVER any "mirror selfie" look. NO phone screen visible. NO third-person view of her holding a phone.
- Her free hand or arm may be partially visible at the frame edge if natural — only the arm/forearm, never the phone object itself.
- Natural handheld micro-shake from her grip is expected.
- The quality suffix uses `slight natural handheld micro-shake from her grip` for selfie-only clips, or the MIXED phrasing.

**Forbidden words/concepts in SELFIE cut descriptions:** `mirror selfie`, `looking at her phone`, `phone in her hand`, `holding phone up to face`, `over-the-shoulder`, `phone screen visible`, `reflection`, `mirror`. These leak phone-as-object or mirror-shot into the render — both are wrong for try-on.

### Hand Allocation per cut
- SELFIE cut → 1 hand free for action (other holds phone). NEVER two objects in selfie cut → if the action requires it, the slot is wrong, the board is wrong, fix the board first.
- TRIPOD cut → 2 hands free. Suitable for natural posing, two-handed adjustments.

### Cut 1 — PRE_WEAR (Board 1 only) — with on-camera dialogue

Cut 1 of Board 1 specifics:
- Character is in the **pre-wear outfit** (NOT the product) — explicitly describe: `She wears a [pre-wear description — basic tee + lounge pants / oversized hoodie + cotton shorts / simple robe / plain knit + sweatpants — boring/neutral home base].`
- **Kraft paper bag** is in the frame: `A single plain kraft paper shopping bag (no logo, no branding, optional handles tinted [color]) is held by one handle at her side OR placed upright on the surface beside her.`
- **Audio: on-camera dialogue (when POV = SELFIE).** Character speaks visibly to lens, mouth moves, lip-syncing the assigned `audio_lines[0]` dialogue line — short joyful reaction to the just-arrived package. Voice is hers, on-camera, iPhone mic, tone-matched delivery (warm-glowing for `excited`/`amazed`, calm-collected for `confident`/`posh`, dry for `cold`, light-grin for `playful`). She speaks TO CAMERA, not to the bag. If Cut 1 POV is TRIPOD instead (rare for Board 1), audio mode is voiceover (silent on camera, voice off-camera) speaking the same `audio_lines[0]` line.
- **Forbidden in Cut 1:**
  - Character opening the bag
  - Character lifting the product out of the bag
  - Character peeking inside the bag
  - Character addressing the bag itself ("hi baby" to the bag) or vlogging the bag's contents
  - The product itself being visible in any way
- Expression: tone-matched reaction supplemented by mouth movement for lip-syncing the dialogue line. Default `excited`: `eyes light up briefly toward the bag, soft hopeful smile, fingers settle on the bag handle, she takes a small breath and starts speaking to lens with the dialogue line`. Adjust per `tone`.
- For Boards 2..N: Cut 1 is NOT a PRE_WEAR moment — it's the first of four pose variations in the product outfit. NO kraft bag, NO pre-wear outfit. Audio mode follows POV: SELFIE → on-camera dialogue lip-syncing `audio_lines[0]`; TRIPOD → voiceover layered `audio_lines[0]` (silent on camera). Content of `audio_lines[0]` for Boards 2..N is mid-thought continuation (no greetings, no product re-introductions).

### Cut 2 — WEARING with twirl beat (Board 1 only when `twirl_in_cut_2 == true`) — with voiceover

Cut 2 of Board 1 specifics:
- Character is **now in the product outfit**, full body or three-quarter framing, locked-off tripod. **Do NOT describe the act of changing.** The hard cut from Cut 1 handles the implicit transition. Cut 2 begins with her already in the product.
- The kraft bag is GONE — never mention it.
- The pre-wear outfit is GONE — never mention it.
- **Twirl beat (mandatory in Cut 2 of Board 1):** in roughly the middle of the cut, the character does ONE brief natural twirl, smoothly turning in place to reveal the back of the outfit, then settles back facing the camera. The twirl is one rotation, not multiple, not continuous, not a slow spin — a quick natural reveal motion. Pattern: `she takes a slow exhale, weight shifts onto the right foot, she rolls her body in one smooth turn revealing the back of the outfit (hold for half a beat as the back is visible), then turns back to camera and settles, hands relaxed at her sides`.
- **Audio: voiceover layered.** Character is silent on camera (NOT lip-syncing — she may smile, react expressively, glance to lens, but mouth does NOT form words). Her voice plays as off-camera narration speaking `audio_lines[1]` — short reaction to fit / silhouette / how it looks once worn. iPhone mic, calm conversational delivery, tone-matched.
- Expression matched to tone: peak reaction (excited = wide warm smile / glowing; confident = collected half-smile; cold = neutral runway; playful = quick grin + hand-on-hip; posh = restrained pleased; amazed = lips parted, eyes lit).
- Fabric movement during twirl: `the [garment fabric type — silk / linen / denim / knit / leather] catches a slight breath of motion as she turns — natural drape, not exaggerated`.

For Boards 2..N (`twirl_in_cut_2 == false`): Cut 2 is just the second pose variation, no twirl. Plain description of the pose, micro-expressions, natural settle. Voiceover layered with `audio_lines[1]` (still silent on camera, voice off-camera).

### Cut 3 — TEXTURE_CLOSEUP, hand-free macro (Board 1) — with voiceover

Cut 3 of Board 1 specifics:
- Tight macro on the product's fabric / cut / detail. Character partially visible (partial face / torso) — but **NO HAND CONTACT WITH THE FABRIC**.
- The texture, cut, or design detail is shown through **framing, drape, light, and natural body micro-movement only**. Pick ONE in-cut motion beat (matched to garment type):
  - Light catches the texture as she takes a slow breath, the surface plays in soft directional light
  - The fabric drapes naturally as the body settles into a stable stance
  - The shoulder seam / collar / lapel shifts subtly as the body breathes
  - The hem catches a small natural movement as she shifts weight
  - The garment's pattern / weave / grain reads clearly in the locked frame as the camera holds tight
- Character's hands stay at her sides, off-frame, behind the back, or clearly NOT in contact with the close-up garment area. No "operator hand" enters the macro frame. **No skim, no pull, no pinch, no brush** — these read as someone touching her clothes during filming.
- **Audio: voiceover layered.** Character is silent on camera (NOT lip-syncing). Her voice plays as off-camera narration speaking `audio_lines[2]` — short reaction to fabric / cut / texture detail. iPhone mic, calm conversational delivery, tone-matched.
- Expression: focused appreciation, eyes drifting toward the detail or held calm forward, slight head tilt, lips slightly parted (excited/amazed) or restrained calm (cold/posh/confident).
- **Forbidden in Cut 3:** any hand making contact with the product (own or otherwise); back-and-forth motion; deforming or stretching the garment; multiple beats.

For Boards 2..N: Cut 3 is the third pose variation. If the framing is macro-tight on the garment (close-up), the same NO-HAND-CONTACT rule applies. If the framing pulls back, the character can naturally move her hands per pose, but never to "touch / show off" the garment in close-up framing. Voiceover layered with `audio_lines[2]`.

### Cut 4 — STYLE_POSE with voiceover (every board)

Cut 4 specifics:
- Character is in a **different room of the same home** (Board 1, K=2 may stay in same room, K≥3 may switch room) — the room visible in the board's Slot 4.
- Character is in the styled pose from the board (e.g., seated in soft accent armchair, leg crossed casually). She settles into the pose, holds it, slight natural breath, one micro-adjustment of fabric (smooths a sleeve / re-crosses a leg / shifts hand).
- **Voiceover layered (mandatory):** while she poses silently in frame, the character's voice plays as off-camera narration speaking `audio_lines[3]`. Her face on camera is silent and expressive — NOT lip-syncing. She may flick a glance to lens, lift a brow, or hold a calm gaze.
- Audio language for Cut 4 description: `Voiceover (off-camera) — her voice over ambient room tone, calm conversational delivery: "[audio_lines[3]]". On-camera she is silent, expression matched to tone.`
- Outfit-complete details: shoes visible if framing is full-body; up to 1 paired accessory if it was in the board.
- Expression: tone-locked confidence / settled satisfaction.

### Cinematic Specificity (mandatory per cut)

Each cut must include all three of:

1. **5+ concrete micro-beats** from this menu (rotate — never repeat the same combination across the 4 cuts):
   weight shift, hair touch, glance break, head tilt, eyebrow flash, hand gesture, posture shift, lip movement, shoulder roll, breath (inhale / exhale / sigh), jaw set, slight off-center handheld tilt (selfie only), micro-grin, half-blink, lean forward / back, quick hair flick, slight chin lift, soft exhale.

2. **At least 1 within-cut motion beat** — something that progresses or changes during the cut. The cut is not a still — describe what evolves inside it. Examples for try-on: `weight shifts forward as she hypes herself up off-camera`, `she takes a small breath as the new outfit settles on her shoulders`, `fingertips trail across the fabric and pause on the seam`, `she settles into the chair, exhales softly, and gives one small confident nod`.

3. **Expression evolution across the 4 cuts** — never the same expression twice. The default tone-driven progression is encoded in the tone table; identical expression across cuts is forbidden.

**Forbidden in any Cut description:** sentences that only re-state what the static board already shows. Every sentence must add something the board cannot — motion, breath, fabric movement, expression beat, kinetic detail.

Anti-patterns (NEVER write these):
- "smiles at the camera"
- "looks at the camera"
- "stands in front of the camera wearing the outfit"
- "poses for the camera"
- Identical expression across all 4 cuts

### Cut Markers (mandatory verbatim)

Between Cut 1 and Cut 2: `Hard cut to.` — at the end of Cut 1's description sentence.
Between Cut 2 and Cut 3: `Hard cut to.` — at the end of Cut 2's description sentence.
Between Cut 3 and Cut 4: `Hard cut to.` — at the end of Cut 3's description sentence.
No marker after Cut 4.

These are scene-edit instructions Seedance reads literally. Without them, cuts collapse into smooth motion.

The Cut 1 → Cut 2 hard cut implicitly handles the costume change (pre-wear → product) without depicting it. Never describe the changing motion in either Cut 1 or Cut 2.

---

## Step 5 — Audio / Voiceover

Try-on audio is split across **all 4 cuts** using the `audio_lines` array. Cut 1 typically has on-camera dialogue (character speaks visibly in SELFIE POV, lip-syncing); Cuts 2 / 3 / 4 layer voiceover (character silent on camera, voice plays over).

### Cut 1 audio — on-camera dialogue (when POV = SELFIE) / voiceover (when POV = TRIPOD)

- For Board 1 (canonical cadence has Cut 1 = SELFIE): **on-camera dialogue.** Character speaks visibly to lens, mouth moves, lip-syncing `audio_lines[0]`. iPhone mic, voice from on-camera, tone-matched delivery (warm-glowing for `excited`, calm-collected for `confident`/`posh`, dry for `cold`, light-grin for `playful`, soft-awe for `amazed`).
- For Boards 2..N where Cut 1 may be TRIPOD: **voiceover** (silent on camera, voice off-camera narration). Same `audio_lines[0]` line.
- Content: short joyful reaction to having received the package — mid-thought, no greetings.
- Optional ambient: subtle bag rustle if she shifts the bag.

### Cut 2 audio — voiceover (always)

- **Voiceover layered.** Character silent on camera (smiles, reacts expressively, may glance to lens, but does NOT lip-sync); her voice plays off-camera speaking `audio_lines[1]`.
- Content: reaction to fit / silhouette / how it looks once worn.
- Ambient: subtle fabric rustle on Cut 2's twirl (Board 1) or natural fabric sounds with motion (Boards 2..N).

### Cut 3 audio — voiceover (always)

- **Voiceover layered.** Character silent on camera; her voice plays off-camera speaking `audio_lines[2]`.
- Content: reaction to fabric / cut / texture detail.
- Ambient: ambient room tone only. NO finger-on-fabric sounds (since no hand contact with the garment per Cut 3 rules).

### Cut 4 audio — voiceover (always, settled wrap)

- **Voiceover layered.** Character silent on camera; her voice plays off-camera speaking `audio_lines[3]`.
- Content: settled wrap reaction — overall verdict on the look.
- Ambient: ambient room tone.

### Render the Audio line as:

```
Audio: Cut 1 — [SELFIE POV → on-camera dialogue, she speaks visibly to camera, mouth moves, lip-syncing: "[audio_lines[0]]" / TRIPOD POV → layered voiceover, silent on camera, voice off-camera: "[audio_lines[0]]"]. Cut 2 — layered voiceover, character silent on camera, her voice off-camera in calm conversational delivery: "[audio_lines[1]]". Cut 3 — layered voiceover, character silent on camera, off-camera voice: "[audio_lines[2]]". Cut 4 — layered voiceover, character silent on camera, off-camera voice: "[audio_lines[3]]". iPhone microphone audio with natural room tone throughout. Plus ambient fabric rustle on Cut 2's twirl beat. Tone-matched delivery for all 4 lines.
```

For male creators: replace "she/her" with "he/his" pronouns appropriately.

### `{{speak}}` span placement

Each audio line must be wrapped in its own `{{speak:persona:<name>}}…{{/speak}}` span placed in-line at the corresponding Cut's audio description AND in the Audio line. Use the same span four times (one per line). Each span needs a matching `dialogue[]` entry whose `text` and `speaker` exactly match — Seedance preflight rejects mismatches.

### Audio line examples by tone × cut beat

Each cut has its own line. The 4 lines flow as one continuous emotional reaction across the whole clip. Lines never repeat within a board, never repeat across boards.

**excited** (warm, anticipatory, glowing):
- Cut 1: `"look what just arrived"`, `"this is finally here"`, `"can't wait to try this on"`, `"okay so this just came in"`
- Cut 2: `"the fit is so good"`, `"this is exactly what I wanted"`, `"the way it sits on me"`
- Cut 3: `"the fabric is so soft"`, `"the cut is sitting perfectly"`, `"this material though"`
- Cut 4: `"didn't think it'd look this good"`, `"I'm gonna live in this"`, `"this is the one"`

**confident** (collected, settled, half-smile):
- Cut 1: `"new piece, just arrived"`, `"about to try this on"`
- Cut 2: `"yeah, this works"`, `"clean fit"`, `"that's the silhouette"`
- Cut 3: `"the material's quality"`, `"the silhouette holds"`
- Cut 4: `"that's the one"`, `"this is the look"`, `"clean"`

**cold** (neutral, runway, restrained — dry delivery):
- Cut 1: `"new arrival"`, `"let's see"`
- Cut 2: `"clean."`, `"yeah."`
- Cut 3: `"the fabric reads well"`, `"the cut works"`
- Cut 4: `"that's it"`, `"good"`, `"clean."`

**playful** (lively, light, grin):
- Cut 1: `"okay so this just came in"`, `"finally, finally"`, `"wait it's here"`
- Cut 2: `"how is this fitting me this well"`, `"so cute"`, `"okay this is so good"`
- Cut 3: `"obsessed-vibes — the texture though"`, `"this material is so cute"`
- Cut 4: `"can't deal with how cute this is"`, `"this is the one"`

**posh** (refined, restrained-luxe, considered):
- Cut 1: `"the new piece is here"`, `"about to see how this sits"`
- Cut 2: `"the silhouette is correct"`, `"that's a refined cut"`
- Cut 3: `"the texture is exactly right"`, `"quality fabric"`
- Cut 4: `"the cut is exactly right"`, `"perfect drape"`

**amazed** (eyes lit, lips parted, soft awe):
- Cut 1: `"wait it's actually here"`, `"oh my god finally"`
- Cut 2: `"wait this looks unreal"`, `"how is this fitting me like this"`
- Cut 3: `"the texture is incredible"`, `"didn't expect this material"`
- Cut 4: `"didn't expect this"`, `"I'm not used to seeing myself like this"`

### Forbidden AI-tell phrases (NEVER use)

These phrases are dead AI giveaways — NEVER use, even when validating or generating voiceover lines:

- `I'm obsessed`, `I am obsessed`, `literally obsessed`, `so obsessed`, `like obsessed`, `obsessed with this` — all banned. These are direct emotional-state praise ("I feel obsessed") and kill UGC realism. **EXCEPTION**: `obsessed-vibes` as an aesthetic descriptor (pointing at the look's vibe / energy, not at her own feeling-state) IS acceptable for `playful` tone — it reads as self-aware meta, not generic praise. Example of the allowed form: `"obsessed-vibes — but no, this is genuinely so good"`.
- `you have to try this`, `you have to see this`, `you NEED this` — overused AI cliches
- Generic praise without specifics: `it's amazing`, `it's incredible`, `so good`, `mind-blowing`, `unreal` (except "this looks unreal" is acceptable for `amazed` tone), `out of this world`
- `Trust me on this`, `I cannot recommend enough`, `game changer`, `total game changer` — AI sales-speak
- `ten out of ten`, `10/10`, `100%`, `1000%` — AI rating cliches

Real creator language for try-on focuses on **fit, drape, silhouette, fabric, how it sits, how it moves, how she feels in it** — specific concrete observations, not abstract praise.

### No phrase repetition across boards (mandatory)

Each board's `audio_lines` array is UNIQUE — never repeat the same line, sentence, or near-identical phrase across cuts within a board OR across boards. If the user-supplied audio_lines contain repetition, reword to deduplicate.

### Audio language

**English only.** Switch only if user explicitly requests another language.

### No CTA tail

Try-on does NOT use a CTA tail. The video ends naturally on the final voiceover line of the final Cut 4. Do NOT append `"link in bio"`, `"follow me"`, `"subscribe"`, or any other CTA phrase. Do NOT add a downward gesture in the final cut. The last Cut 4 ends on the styled pose with voiceover, period.

---

## Step 5b — Bag / Outfit State per Cut (mandatory)

This replaces the unboxing flow's box logic. Each cut has a fixed bag/outfit state that MUST be honored in the prompt:

### Board 1

- **Cut 1 (PRE_WEAR)**: kraft paper bag visible. Character in pre-wear outfit. Product NOT visible. NO opening / NO peeking / NO interaction with bag contents. Bag is held by one handle at her side OR set upright on a surface beside her.
- **Cut 2 (WEARING)**: kraft bag GONE. Character in product outfit, full body, locked tripod. Twirl beat embedded.
- **Cut 3 (TEXTURE_CLOSEUP)**: kraft bag GONE. Character in product outfit, tight macro on fabric / cut / detail with **NO hand contact** — texture reads through framing, drape, and light only. Voiceover layered (`audio_lines[2]`).
- **Cut 4 (STYLE_POSE)**: kraft bag GONE. Character in product outfit, different room, styled pose, voiceover layered.

### Boards 2..N

- All 4 cuts: kraft bag GONE forever. Character in product outfit. Pre-wear outfit never returns. Each cut is a different pose variation.

### Cross-cut continuity

Once the bag is gone (Cut 2 of Board 1 onward), it NEVER returns. Once the character is in the product outfit (Cut 2 of Board 1 onward), she NEVER returns to the pre-wear outfit. These are non-negotiable.

### No depiction of changing

Cut 1 ends with the character in pre-wear holding the bag. Cut 2 begins with her in the product outfit. The hard cut handles the implicit transition. NEVER describe:
- The character opening the bag
- The character changing clothes on screen
- The character pulling the product out of the bag
- The character putting the product on

The transition is invisible to the viewer — she's in pre-wear, hard cut, she's in product. That's the magic of the try-on cut.

---

## Step 6 — Static Description

1-2 sentences describing the setting visible across the 4 board slots: room, materials, light direction, ambient details, location_tier (`premium` / `mid` / `casual`). Match the board image. If the board shows the same primary location across Slots 1-3 with a different room in Slot 4, describe both briefly:

`Slots 1-3 in [primary room — premium living room with marble console and soft daylight / mid stylish loft / casual cozy bedroom]. Slot 4 in [different room — accent armchair corner / window-seat / hallway / kitchen island / balcony, tier-matched to primary room].`

Default neutral lighting tone — NEVER warm sunset, NEVER golden hour, NEVER orange/amber cast.

---

## Step 7 — Quality Suffix

Always include this final block, with POV-matched movement language:

```
Facial features clear and undistorted, hairstyle consistent across all cuts. Garment is consistent across all cuts in which it appears (silhouette / color / print / recognizable design details identical), realistic fit on the character's body, natural drape, not exaggerated. Shot on iPhone, natural lighting, social media aesthetic, [POV-matched movement language]. No mirror or reflection shots. No on-screen text, no subtitles, no captions, no watermarks. No CTA tail.
```

POV-matched movement language:
- All SELFIE: `slight natural handheld micro-shake from her grip`
- All TRIPOD: `locked-off camera on tripod, absolutely static, zero camera movement of any kind, no shake, no drift, no breathing wobble`
- MIXED: `handheld micro-shake during selfie cuts, locked-off frozen frame during tripod cuts`

---

## Universal Rules

- **Garment Consistency Lock:** the product (garment / accessory) keeps identical silhouette / primary color / print / recognizable design details across every cut in which it appears. The character may turn or pose freely; the garment rotates naturally with her body. Do NOT change color, print, design details, or fabric across cuts.
- **Realistic Fit:** the product is rendered at realistic real-world proportions on the character's body — natural drape per the fabric weight, natural fit, not exaggerated.
- **ONE product instance only.** Exactly ONE garment / accessory at a time. Never multiple copies of the same item, never duplicate accessories.
- **Hand Count:** the person has exactly 2 hands. Maximum 1 dedicated body action per cut (one twirl, one pose adjustment, one micro-gesture). **In Cut 3 specifically — NO hand contact with the product fabric.** Never two separate hand actions in the same moment.
- **Outfit Continuity:** Cut 1 of Board 1 = pre-wear outfit + kraft bag. Cut 2 of Board 1 onward + every cut of Boards 2..N = product outfit, no kraft bag. Never return to pre-wear.
- **No on-screen costume change:** the transition between Cut 1 (pre-wear) and Cut 2 (product) is implicit via the hard cut. Never describe changing clothes.
- **Hairstyle locked:** identical across all cuts and boards.
- **No extras:** no additional people or random objects beyond the character, the product, and the kraft bag (Cut 1 of Board 1 only). No additional clothing or props.
- **Age-blind:** never describe characters by age. Never use: boy, girl, child, kid, young, teen.
- **NO mirrors / reflections — strict.** No bathroom mirror, no full-length mirror, no shop window reflection, no phone-screen reflection, no any reflective surface showing the character. NO "mirror selfie" shots even when the framing is selfie POV. Try-on does NOT use mirrors as POV or as prop.
- **NO phone visible in any frame.** Selfie POV = camera IS the phone. The phone object never appears in any cut.
- **Character exits frame = gone for rest of clip.**
- **≤ 3 characters per shot** (typically 1 — the creator alone).
- **≤ 4 visual beats per shot** (our 4 cuts = 4 beats — fits within limit).
- **English only** for all dialogue, voiceover, examples.
- **No CTA tail** — try-on ends naturally on the final voiceover line.

---

## Self-Check Before Outputting

- [ ] `motion` is a single prose string, no markdown fences, no JSON wrapper.
- [ ] Style & Mood line includes light + POV cadence + tone descriptor.
- [ ] Cut 1 / Cut 2 / Cut 3 / Cut 4 labels with framing distances and POVs read off the 4 board slots.
- [ ] For Board 1: Cut 1 = PRE_WEAR with kraft bag and **on-camera dialogue lip-syncing audio_lines[0]** (or voiceover if Cut 1 POV is TRIPOD); Cut 2 = WEARING with twirl beat + **voiceover layered audio_lines[1]**; Cut 3 = TEXTURE_CLOSEUP **hand-free macro** with **voiceover layered audio_lines[2]** (NO hand contact with fabric); Cut 4 = STYLE_POSE with **voiceover layered audio_lines[3]**.
- [ ] For Boards 2..N: 4 pose variations, no kraft bag, no twirl, no pre-wear. Each cut has its corresponding `audio_lines[i]` line. Cut 1 audio mode = on-camera dialogue if POV=SELFIE, voiceover if POV=TRIPOD; Cuts 2 / 3 / 4 always voiceover.
- [ ] `Hard cut to.` markers verbatim between Cut 1→2, Cut 2→3, and Cut 3→4. No marker after Cut 4.
- [ ] Each cut has 5+ micro-beats per the Cinematic Specificity rule, with at least 1 within-cut motion beat and expression evolution across the 4 cuts (tone-locked).
- [ ] Four `{{speak:persona:<name>}}…{{/speak}}` spans, one per cut, present in `motion`. Four matching `dialogue[]` entries handed to `generate_scene_video`. Each `dialogue[]` entry's `text` matches its corresponding `{{speak}}` span exactly.
- [ ] Audio: Cut 1 = on-camera dialogue lip-syncing `audio_lines[0]` (or voiceover if TRIPOD); Cut 2 = layered voiceover `audio_lines[1]`; Cut 3 = layered voiceover `audio_lines[2]`; Cut 4 = layered voiceover `audio_lines[3]`. For Cuts 2 / 3 / 4 character is silent on camera (NOT lip-syncing).
- [ ] All 4 audio lines are in English, tone-matched, NOT in the AI-tell forbidden phrases list, unique within the board, NOT repetitions of any prior board's lines.
- [ ] Cut 1 (Board 1) features the kraft bag and pre-wear outfit; product NOT visible; NO opening / NO peeking. Character SPEAKS visibly to camera in SELFIE (mouth moves, lip-syncing).
- [ ] Cut 2 (Board 1) shows character now in product outfit with one natural twirl beat embedded; no description of changing clothes; voiceover layered, character silent on camera.
- [ ] Cut 3 macro is **HAND-FREE** — NO hand contact with the fabric (no skim / pull / lift / brush / pinch). Texture is shown through framing, drape, light, and natural body micro-movement only. No "operator hand" enters the close-up frame.
- [ ] Cut 4 (every board) is a styled pose in a different room of the same home (or pose variation for K≥3 with possible new room), with voiceover layered (`audio_lines[3]`), character silent on camera, NO CTA tail.
- [ ] Quality suffix matches POV cadence (SELFIE / TRIPOD / MIXED language) AND mentions garment consistency + no-mirror + no-hand-on-fabric-in-Cut-3.
- [ ] No anti-patterns ("smiles at camera", "looks at camera", "poses for the camera", static poses).
- [ ] No mention of phone being held in hand for tripod cuts.
- [ ] TRIPOD cut descriptions contain none of the forbidden words (handheld/shake/drift/etc).
- [ ] No mirror / reflection / mirror-selfie language anywhere.
- [ ] No on-screen costume change described.
- [ ] No CTA tail appended (no "link in bio" / "follow me" / "subscribe" / no downward gesture in final cut).
- [ ] Garment Consistency Lock honored: silhouette / color / print / recognizable details identical across all cuts in which the product is worn.
- [ ] Realistic fit on character's body, no exaggerated proportions.
- [ ] Hairstyle locked across all cuts.
