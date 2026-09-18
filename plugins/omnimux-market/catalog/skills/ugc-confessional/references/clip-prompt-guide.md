# UGC Clip Prompt Guide — Seedance 2.0 (Generic 3-Cut)

Use this when composing the `motion` string for `generate_scene_video` (backend `seedance`) to produce a single 9:16 vertical clip of `clip_duration` seconds containing THREE INTERNAL HARD CUTS.

The clip contains THREE INTERNAL HARD CUTS corresponding to the three board slots — Cut 1 = slot 1's moment, Cut 2 = slot 2's moment, Cut 3 = slot 3's moment.

The board image is the **narrative map** — read it to understand the story, not to copy frames.

Extract from the board: **what happens** in each slot (the story beat), **chronology** (slot 1 → Cut 1, slot 2 → Cut 2, slot 3 → Cut 3), **overall aesthetic** (light, environment, mood), and **character / product continuity**.

The written prompt is the **primary signal** to Seedance. The board is also fed to Seedance as a reference image — if the prompt is sparse, Seedance will copy board panels frame-for-frame and the result will look stiff. The prompt must be dense enough to dominate: packed with motion, breath, micro-expressions, and kinetic detail that no static panel can encode.

---

## Inputs (provided in the skill dispatch)

1. **Board image** — REQUIRED. 16:9 strip, three vertical 9:16 slots. Each slot is a narrative moment.
2. **Character image** — REQUIRED. Identity reference for the creator.
3. **Product image** — OPTIONAL. When provided, Angle Lock applies (only the front-facing side of the product, never rotate / spin / reveal unseen sides).
4. **Metadata** — passed externally:
   - `K` — board index (1, 2, 3, ...)
   - `N` — total boards
   - `clip_duration` — 4-15 seconds
   - `arc_role` — HOOK / HOOK+SETUP / MAIN / REVEAL / APPLY / APPLY+CLOSER / CLOSER / FULL_ARC
   - `monologue_segment` — the spoken text for THIS clip, to distribute across the 3 cuts
   - `tone` — optional free-text mood; triggers calm-register (Pattern A/C/D) when it contains any of `goth` / `vampire` / `cinematic noir` / `cold` / `passive` / `deadpan` / `clinical` / `refined` / `luxury-passive` / `minimal` / `somber` / `serious` / `dark` / `shadowy`. Default = Pattern B sustained-hyped.

---

## Output

The clip-prompt composition produces a single prose `motion` string (no JSON wrapper, no markdown fences). The orchestrator passes it to `generate_scene_video(motion=..., dialogue=[{...}], ...)`.

Inside `motion`, reference assets via `{{persona:<name>}}` / `{{product:<id>}}` tokens, and wrap the `monologue_segment` (verbatim) in ONE `{{speak:persona:<name>}}…{{/speak}}` span at the end. The single `dialogue[]` entry's `text` and `speaker` must exactly match.

---

## Prompt Structure (mandatory)

Each Seedance prompt follows this structure, in order:

```
Style & Mood: UGC iPhone aesthetic, [light description matching the board], [SELFIE: front-facing camera, intimate handheld feel | TRIPOD: locked-off on tripod, completely static, frozen frame | MIXED: starts SELFIE handheld, hard-cuts to TRIPOD locked-off, hard-cuts back to SELFIE handheld — POV alternates per cut], social media vertical format.

Narrative Summary: [1 sentence stating what happens in this clip — references the arc_role and the throughline of the 3 cuts. For DEFAULT (sustained-hyped Pattern B) clips, this sentence MUST close with the calibration phrase `performed by an INSANELY hyped creator with explosive screaming energy throughout` (or near-equivalent). Skip the calibration phrase ONLY when the brief signals a calm-tone aesthetic (`goth` / `vampire` / `cinematic noir` / `cold` / `passive` / `deadpan` / `clinical` / `refined` / `luxury-passive` / `minimal` / `somber` / `serious` / `dark` / `shadowy`)].

Dynamic Description:
Cut 1 (0-Xs) — [framing distance per board slot 1, e.g. MEDIUM CLOSE-UP, TIGHT CLOSE-UP, MACRO, WIDER, PRODUCT-EXTENDED] [POV per slot 1]: [action from slot 1, explicit hand allocation, 3+ micro-behaviors, expression, product placement]. Hard cut to.
Cut 2 (Xs-Ys) — [framing distance per board slot 2] [POV per slot 2]: [action from slot 2, explicit hand allocation, 3+ micro-behaviors, expression, product placement]. Hard cut to.
Cut 3 (Ys-end) — [framing distance per board slot 3] [POV per slot 3]: [action from slot 3, explicit hand allocation, 3+ micro-behaviors, expression, product placement].

Static Description: [1-2 sentences: setting, ambient details, props, light direction — match the board image's environment].

Audio: She speaks to camera, iPhone microphone audio with natural room tone[, IF K==1 AND non-verbal cues used: include bracketed sounds at the start of Cut 1, e.g. [*explosive gasp*] [*small bright laugh*] [*hyped yelp*]]: {{speak:persona:<name>}}<monologue_segment verbatim, distributed across the 3 cuts at natural phrase boundaries>{{/speak}}

Facial features clear and undistorted, consistent clothing throughout. Shot on iPhone, natural lighting, social media aesthetic. [SELFIE-only: slight natural handheld micro-shake from her grip | TRIPOD-only: locked-off camera on tripod, absolutely static, zero camera movement of any kind, no shake, no drift, no breathing wobble | MIXED: handheld micro-shake during selfie cuts, locked-off frozen frame during tripod cuts]. No on-screen text, no subtitles, no captions, no watermarks.
```

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

---

## Step 2 — POV Cadence and Style & Mood

Based on the board's per-slot POVs, set the Style & Mood line:

| Per-slot POVs | Style & Mood camera language |
|---|---|
| All three slots SELFIE | `front-facing camera, intimate handheld feel` |
| All three slots TRIPOD | `locked-off on tripod, completely static, frozen frame` |
| POV varies between slots (e.g., SELFIE → TRIPOD → SELFIE) | `MIXED: starts [POV1] [language], hard-cuts to [POV2] [language], hard-cuts to [POV3] [language] — POV alternates per cut` |

The classic FULL_ARC cadence is `SELFIE → TRIPOD → SELFIE`. Use the MIXED phrasing for it.

---

## Step 3 — Time-Slicing the Cuts

Distribute `clip_duration` across the 3 cuts. Default split — slightly back-loaded toward the payoff:

| clip_duration | Cut 1 | Cut 2 | Cut 3 |
|---|---|---|---|
| 4s | 1.5s | 1.5s | 1s |
| 6s | 2s | 2s | 2s |
| 10s | 3s | 3.5s | 3.5s |
| 12s | 3.5s | 4s | 4.5s |
| 15s | 4.5s | 5s | 5.5s |

Adjust if the action of a particular cut needs more or less time. The default is fine for most cases.

Write the time spans into the Cut headers exactly: `Cut 1 (0-4.5s)`, `Cut 2 (4.5-9.5s)`, `Cut 3 (9.5-15s)`.

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

### Action Sequences (when the cut is REVEAL or APPLY)

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

### Cinematic Specificity (mandatory per cut)

Each cut must include all three of:

1. **5+ concrete micro-beats** from this menu (rotate — never repeat the same combination across the 3 cuts). **Default emotional register is HIGH-ENERGY / hyped throughout — pick predominantly from the skit half of the menu (the second half below).** Switch to predominantly-calm picks ONLY when the brief explicitly signals one of: `goth`, `vampire`, `cinematic noir`, `cold`, `passive`, `deadpan`, `clinical`, `refined`, `luxury-passive`, `minimal`, `somber`, `serious`, `dark`, `shadowy` tone or aesthetic.

   **Skit half (default — pick from here first):** WILD open-mouth scream-gasp (jaw dropped wide, eyes blown wide, neck tendons visible), mouth blown open in full scream of excitement, victorious mouth-open shout, dramatic head jerk back recoil with explosive joy, cheek puff out then deflate, mid-bite then explosive react-scream, lip wipe with thumb at corner of mouth (food / drink residue), eyebrows shoot skyward, knuckles white grip-tighten, mock-confused squint then break-into-laugh, slow head shake with massive grin, full-body satisfaction shudder, tongue-press inside cheek, eye-roll then explosive grin back to lens, head thrown back with burst of laughter.

   **Calm half (override — pick from here only when brief signals calm tone):** weight shift, hair touch, glance break, head tilt, eyebrow flash, hand gesture, posture shift, lip movement, shoulder shrug, breath (inhale / exhale / sigh / sharp inhale), jaw set, neck tendon definition, knuckle tightening, foot pivot, brow furrow, chin tuck, lean forward / back, micro-grin, half-blink, slight off-center handheld tilt.

2. **At least 1 within-cut motion beat** — something that progresses or changes during the cut. The cut is not a still — describe what evolves inside it. Examples: "weight shifts forward as she brings X closer", "shoulders roll back slightly as the rep peaks", "a quick genuine grin breaks across her face after the controlled exhale".

3. **Expression evolution across the 3 cuts** — never the same expression twice (e.g., raised brow → focused jaw set → confident grin). Identical expression across cuts is forbidden (already in Anti-patterns below).

**Performance tendency — at least 1 unguarded micro-beat per clip.** Real UGC creators break character, recover, and let micro-mistakes through. Include at least one recovered eye-flick / mid-thought stumble / post-laugh settle / quick self-correction / re-found composure / "wait what was I saying" beat. Wooden, posed-throughout performances read as AI. Skip this tendency only when the brief explicitly specifies a sustained deadpan / clinical / cold tone that should hold across the whole clip.

**Playful improv tendency — include ONE small goofy moment per clip.** Real creators ham it up — they pull mock faces, do little physical bits, break the "selling" frame for a half-second. Lean into natural creator goofiness — examples (not exhaustive, pick whatever fits the moment): tongue-out flash, "blep" face, crossed-eyes mock, mock-zen closed-eyes, eyebrow waggle, exaggerated mock-thinking face with finger on chin, double thumbs-up with cartoon grin, mid-gesture cartoon shrug, mock-disappointment slow head shake. ONE such beat per clip — natural-improv, never theatrical. Skip ONLY when the brief specifies a sustained `refined` / `clinical` / `cold` / `luxury-passive` / `goth` / `vampire` / `cinematic noir` / `somber` / `serious` tone where playfulness would break register.

**Forbidden in any Cut description:** sentences that only re-state what the static board already shows. Every sentence must add something the board cannot — motion, sound cue, expression beat, kinetic detail, breath, tension, weight transfer.

Anti-patterns (NEVER write these):
- "smiles at the camera"
- "looks at the camera"
- "sits in front of the camera"
- "holds the product and talks"
- Identical expression across all 3 cuts

Instead: weave specific micro-behaviors into each cut's description.

### Cut Markers (mandatory verbatim)

Between Cut 1 and Cut 2: `Hard cut to.` — at the end of Cut 1's description sentence.
Between Cut 2 and Cut 3: `Hard cut to.` — at the end of Cut 2's description sentence.
No marker after Cut 3.

These are scene-edit instructions Seedance reads literally. Without them, cuts collapse into smooth motion.

---

## Step 5 — Audio / Monologue

Use the provided `monologue_segment` verbatim. Distribute it across the 3 cuts at natural phrase boundaries — roughly proportional to cut duration. Render as ONE Audio line containing ONE `{{speak}}` span:

```
Audio: She speaks to camera, iPhone microphone audio with natural room tone: {{speak:persona:<name>}}<monologue verbatim>{{/speak}}
```

### K=1 (Board 1) — trailer-style non-verbal sounds

For K=1, **include 1-3 bracketed non-verbal sounds at the START of the Audio line by default** — they sell the explosive opener energy. Pick from this pool (rotate — never repeat the same combo across consecutive boards):

`[*explosive gasp*]` · `[*barely-contained scream*]` · `[*hyped yelp*]` · `[*excited shriek*]` · `[*small bright laugh*]` · `[*ooooh*]` · `[*open-mouthed exhale*]` · `[*choke-laugh*]` · `[*incredulous scoff*]` · `[*explosive shocked inhale*]`

Example:

```
Audio: She speaks to camera, iPhone microphone audio with natural room tone. [*explosive gasp*] [*small bright laugh*] [*hyped yelp*] {{speak:persona:<name>}}<monologue>{{/speak}}
```

Skip the bracketed sounds entirely ONLY when the brief explicitly signals a calm-tone aesthetic (`goth`, `vampire`, `cinematic noir`, `cold`, `passive`, `deadpan`, `clinical`, `refined`, `luxury-passive`, `minimal`, `somber`, `serious`, `dark`, `shadowy`). At most 3 bracketed sounds per clip.

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

When you split the `monologue_segment` across the 3 cuts, verify NO sentence or near-identical phrase appears in two different cut segments. If the user-supplied monologue itself contains repetition, reword to deduplicate.

### Forbidden audio openers (positional — first word only, K=1 AND K>1)

The literal FIRST WORD of any audio line (Board 1 Slot 1 for K=1, or the first word of any K>1 board's audio) must be hook content, not a filler / recording-warmup word. Bracketed non-verbal sounds at the start (e.g. `[*explosive gasp*]`) are sound effects, not "first words" — they don't count.

Banned as the literal first word:

- `OK`, `Okay`, `Okay so`, `Alright`, `Alright so`
- `So` (when literal first word — fine mid-sentence)
- `Yeah so`, `Right so`
- `Um`, `Well`
- `Like` (when literal first word — fine mid-sentence as filler within a phrase)
- `Wait`, `Wait what`, `Hold on` — these turn the opener into a pause-and-setup beat; the clip must START with the review content directly, not with a suspense pre-amble

These words read as AI-recording-warmup when they're the first thing the viewer hears. The constraint is **positional** — they ARE allowed mid-sentence (`this is so good`, `it's like crazy`, `the cap goes so smoothly`, `well now I get it`).

If the drafted monologue starts with one of these words, **rewrite the opener** to lead with the hook content directly.

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

### Quirk beat (optional — only for residue-leaving products)

When the product naturally leaves a visible residue on the body — food / drink with foam / lip cosmetic / chocolate / cream / sticky candy — the clip MAY include ONE quirk beat: a brief, unguarded micro-aftermath that lands AFTER the main action and BEFORE the cut ends.

Eligible categories and residue examples:

| Category | Residue | Possible quirk beat |
|---|---|---|
| Drink with foam (latte, beer, smoothie, milk) | foam ring on upper lip, faint mustache | quick natural thumb-wipe at the corner of the mouth, or self-aware grin without wiping |
| Lip cosmetic (gloss, lipstick, balm) | smudge off the lip line, corner residue | soft tongue-press inside the cheek, quick lip-press, or thumb-tap at the corner to settle it |
| Food (chocolate, frosting, cream, sauce) | faint smear at the corner of the mouth, crumb on the lower lip | thumb-wipe at the corner, quick lip-lick, or soft self-deprecating grin without wiping |
| Snack with powder / crumbs (chips, donut, powdered sugar) | powder dust on the fingertips, crumb on the lip | thumb-rub of fingertips, small grin with the crumb still visible |
| Sticky / drippy (caramel, popsicle, ice cream) | drip line near the corner of the mouth | quick thumb-catch of the drip, or letting it sit while she laughs at it |

Rules:

- **At most ONE quirk beat per clip** — never the main beat, never repeated across cuts.
- **Lands AFTER the main action** — first the bite / sip / swipe, then the residue, then the reaction. Never before.
- **Brief** — 1 short clause for the residue + 1 short clause for the reaction. ≤ 2 sentences total.
- **Unguarded reaction** — genuine grin / half-laugh / soft self-correction, never theatrical or "showing the camera".
- **Body micro-beat, not a product interaction** — the quirk beat is NOT counted as a 2nd product interaction. The Single-action-per-Cut rule above is not violated; the product is already off-hand or set aside when the quirk beat lands.
- **Skip entirely** when the product isn't on the eligible table OR when the brief specifies a clinical / refined / luxury tone where a residue would break the register.

This is an option, not a requirement — clips without a quirk beat are also fine.

### Forbidden action phrases

Add to the Forbidden phrases catalog — Seedance interprets these as motion loops:

- `sprays again`, `another spray`, `sprays multiple times`, `keeps spraying`
- `presses repeatedly`, `presses again`, `taps the lid twice`
- `back and forth`, `unscrews and screws back`, `opens and closes`
- `applies multiple coats`, `swipes again`

---

## Step 6 — Static Description

1-2 sentences describing the setting visible across the 3 board slots: room, materials, light direction, ambient details. Match the board image. If the board shows the same room across all 3 slots, describe it once.

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
- **≤ 4 visual beats per shot** (our 3 cuts = 3 beats — fits within limit).

---

## Self-Check Before Outputting

- [ ] `motion` is a single prose string, no markdown fences, no JSON wrapper.
- [ ] Style & Mood line includes light + POV cadence (and trailer directive if K==1).
- [ ] Cut 1 / Cut 2 / Cut 3 labels with framing distances and POVs read off the board.
- [ ] `Hard cut to.` markers verbatim between Cut 1→2 and Cut 2→3.
- [ ] Each cut has 3+ micro-behaviors, expressions evolving across cuts.
- [ ] Audio = monologue_segment verbatim, wrapped in ONE `{{speak:persona:<name>}}…{{/speak}}` span, distributed across 3 cuts at natural phrase boundaries.
- [ ] One matching `dialogue[]` entry with identical `speaker` and `text`.
- [ ] K==1 may include up to 3 bracketed non-verbal sounds at audio start (skip on calm-tone briefs).
- [ ] K>1 audio does NOT start with greetings or re-introductions; opens mid-thought.
- [ ] Quality suffix matches POV cadence (SELFIE / TRIPOD / MIXED language).
- [ ] No anti-patterns ("smiles at camera", "looks at camera", static poses).
- [ ] No mention of phone being held in hand for tripod cuts.
- [ ] TRIPOD cut descriptions contain none of the forbidden words (handheld/shake/drift/etc).
- [ ] Cut descriptions don't **contradict** the board (POV, hand allocation, product interaction match the slot) but go **far beyond** static panel content — describing motion, breath, micro-expressions, kinetic detail, and within-cut evolution. Cap-removal motion IS described in application Cuts even if the board still shows the cap on.
- [ ] Each Cut has at most ONE product interaction (one press, one swipe, one sip — no repeats).
- [ ] Application target body part matches the product (perfume → wrist/neck, lipstick → lips, drink → mouth) — never deviate.
- [ ] No forbidden action phrases (`sprays again`, `presses repeatedly`, `back and forth`, etc).
- [ ] No forbidden first-word openers (`OK` / `Okay` / `Alright` / `Wait` etc as the literal first word).
- [ ] No forbidden AI-tell phrases (`I'm obsessed`, `you have to try this`, `game changer`, `10/10`, etc).
- [ ] Calibration phrase `performed by an INSANELY hyped creator with explosive screaming energy throughout` (or near-equivalent) closes the Narrative Summary for Pattern B clips. Skipped only for calm-tone briefs.
