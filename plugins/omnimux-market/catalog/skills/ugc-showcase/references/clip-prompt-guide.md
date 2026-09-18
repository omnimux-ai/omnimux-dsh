# UGC Product Clip Prompt Guide — Seedance 2.0 (4-Cut, Voice-Over Only)

Use this when composing the `motion` string for `generate_scene_video` (backend `seedance`) to produce a single 9:16 vertical product-hero clip of `clip_duration` seconds containing FOUR INTERNAL HARD CUTS.

The clip contains FOUR INTERNAL HARD CUTS corresponding to the four board slots — Cut 1 = slot 1's moment, Cut 2 = slot 2's moment, Cut 3 = slot 3's moment, Cut 4 = slot 4's moment. For Board 1 of a product-flow video the slots carry the canonical arc: Cut 1 = PRODUCT-INTRO, Cut 2 = PRODUCT-DEMO-A, Cut 3 = PRODUCT-DEMO-B, Cut 4 = PRODUCT-RESULT.

The board image is the **narrative map** — read it to understand the demo story, not to copy frames.

Extract from the board: **what happens** in each slot (the demo beat), **chronology** (slot 1 → Cut 1, slot 2 → Cut 2, slot 3 → Cut 3, slot 4 → Cut 4), **overall aesthetic** (light, environment, mood), and **product continuity**.

The written prompt is the **primary signal** to Seedance. The board is also fed to Seedance as a reference image — if the prompt is sparse, Seedance will copy board panels frame-for-frame and the result will look stiff. The prompt must be dense enough to dominate: packed with motion, breath, kinetic detail, and product mechanics that no static panel can encode.

**This flow is voice-over only.** Audio is an off-screen voiceover describing the product's benefits and capabilities. The auxiliary person, when present in any cut, is silent on camera — mouth closed, no lip-sync, no speaking gesture toward the lens.

---

## Inputs (provided in the skill dispatch)

1. **Board image** — REQUIRED. 21:9 strip, four vertical 9:16 slots. Each slot is a narrative beat. For Board 1 the slots are PRODUCT-INTRO → PRODUCT-DEMO-A → PRODUCT-DEMO-B → PRODUCT-RESULT.
2. **Product image** — REQUIRED. Angle Lock applies (only the front-facing side of the product, never rotate / spin / reveal unseen sides).
3. **Metadata** — passed externally:
   - `K` — board index (1, 2, 3, ...)
   - `N` — total boards
   - `clip_duration` — 4-15 seconds
   - `arc_role` — for Board 1: `BOARD_1_PRODUCT_DEMO`. For Boards 2..N: `BOARD_K_PRODUCT_DEMO`.
   - `voiceover_segment` — the off-screen voiceover text for THIS clip, to distribute across the 4 cuts.
   - `voice_gender` — `female` / `male` / `random` (`random` is resolved at planning time and stays consistent across all boards in the pipeline). Drives the voiceover voice AND the gender of any auxiliary person rendered in frame.
   - `voice_persona` — the persona asset ID for the voice (e.g. `persona:narrator`), already registered as voice-only via `setup_persona(voice_only=true)`.

---

## Output

The clip-prompt composition produces a single prose `motion` string (no JSON wrapper, no markdown fences). The orchestrator passes it to `generate_scene_video(motion=..., dialogue=[{...}], ...)`.

Inside `motion`, reference the product inline via `{{product:<id>}}`. The Audio line wraps the entire `voiceover_segment` (verbatim) in ONE `{{speak:persona:<voice_persona>}}…{{/speak}}` span. The single `dialogue[]` entry's `text` and `speaker` must exactly match.

---

## Prompt Structure (mandatory)

Each Seedance prompt follows this structure, in order:

```
Style & Mood: UGC iPhone aesthetic — phone-sensor grain, natural ambient light typical of a phone photo (NOT studio strobes, NOT moody side-light, NOT dramatic mood lighting, NOT golden hour), NOT editorial product photography, NOT studio shoot, NOT magazine commercial; [light description matching the board — soft neutral daylight or even ambient room light], [TRIPOD: locked-off on tripod, completely static, frozen frame | FIRST-PERSON-POV: handheld first-person, slight natural micro-shake, only the operator's hand or forearm at frame edge if natural, phone object NEVER visible | MIXED: starts TRIPOD locked-off, hard-cuts to FIRST-PERSON-POV handheld, hard-cuts to MACRO locked-off, hard-cuts back to TRIPOD locked-off — POV alternates per cut], social media vertical format.

Narrative Summary: [1 sentence stating what happens in this clip — references the arc_role and the throughline of the 4 cuts as a product-demo story].

Dynamic Description:
Cut 1 (0-Xs) — [framing distance per board slot 1, e.g. MEDIUM-WIDE, TRIPOD-WIDE, MEDIUM] [POV per slot 1]: [action from slot 1 (for Board 1: PRODUCT-INTRO — product placed in its native context, clean establishing frame, no active demo yet, person absent or only hand at edge), product placement, 5+ micro-beats describing kinetic detail of the product or the environment (NO speaking from any person)]. Hard cut to.
Cut 2 (Xs-Ys) — [framing distance per board slot 2] [POV per slot 2]: [action from slot 2 (for Board 1: PRODUCT-DEMO-A — product in active first-angle demo), explicit hand allocation if auxiliary person present, mouth CLOSED on any visible person, 5+ kinetic beats of the demo motion, product mechanics]. Hard cut to.
Cut 3 (Ys-Zs) — [framing distance per board slot 3] [POV per slot 3]: [action from slot 3 (for Board 1: PRODUCT-DEMO-B — product in active second-angle demo, distinctly different from Cut 2), explicit hand allocation if auxiliary person present, mouth CLOSED, 5+ kinetic beats]. Hard cut to.
Cut 4 (Zs-end) — [framing distance per board slot 4] [POV per slot 4]: [action from slot 4 (for Board 1: PRODUCT-RESULT — product result state OR final hero shot), explicit hand allocation if auxiliary person present, mouth CLOSED, 5+ kinetic beats showing the outcome / settled state].

Static Description: [1-2 sentences: setting, ambient details, props, light direction — match the board image's environment].

Audio: Off-screen voiceover, [female | male per voice_gender] UGC creator voice describing the product's benefits and capabilities, emotional UGC tone, NOT on-camera dialogue, NO lip-sync, no on-camera mouth movement, iPhone microphone audio with natural room tone: {{speak:persona:<voice_persona>}}<voiceover_segment verbatim, distributed across the 4 cuts at natural phrase boundaries>{{/speak}}

Facial features clear and undistorted on any auxiliary person, mouth closed throughout. Shot on iPhone, casual handheld framing, natural ambient light, phone-sensor grain and realistic textures preserved, no retouch, no professional gloss — authentic UGC creator phone capture, NOT editorial product photography, NOT studio shoot, NOT magazine commercial. [TRIPOD-only: locked-off camera on tripod, absolutely static, zero camera movement of any kind, no shake, no drift, no breathing wobble | FIRST-PERSON-POV-only: slight natural handheld micro-shake from the operator's grip | MIXED: handheld micro-shake during FIRST-PERSON-POV cuts, locked-off frozen frame during TRIPOD cuts, completely still during MACRO cuts]. No on-screen text, no subtitles, no captions, no watermarks.
```

---

## Step 1 — Read the Board

Before writing the prompt, read the board image and extract per-slot:

1. **POV** — TRIPOD (locked, no person OR person cropped) / FIRST-PERSON-POV (handheld, only the operator's hand or forearm at edge) / MACRO (extreme close-up on product detail) / WIDE-CONTEXT (camera at distance)
2. **Framing distance** — MEDIUM CLOSE-UP, TIGHT CLOSE-UP, MEDIUM, MEDIUM-WIDE, MACRO, WIDER, PRODUCT-EXTENDED, PRODUCT-WIDE
3. **Action** — what is the product doing / being done with
4. **Product placement** — primary subject of the frame (it always is — product is the hero)
5. **Auxiliary person presence** — absent / hand-only at edge / cropped partial / wide-context distant

Don't **contradict** the board (don't switch POV, don't swap which hand operates the product, don't replace the demo action with a different one). Beyond that, **don't transcribe** the board into the Cut either — your job is to render the **demo beat in motion**: in-cut movement, mechanism actuation, product state change, kinetic detail of the demo.

Rule of thumb: if a sentence in your Cut could be a caption for the board panel, you're transcribing — rewrite it as motion / mechanism / kinetic detail.

**For product-flow specifically:** Slot 1 is always PRODUCT-INTRO — product in its native context, NOT yet in active demo. Cut 1 must respect this: no demo motion in Cut 1, only establishing-frame ambient detail (light glinting on the product, gentle environmental motion). Slot 4 is always PRODUCT-RESULT — Cut 4 lands the outcome; never re-introduces demo action. The story arc PRODUCT-INTRO → PRODUCT-DEMO-A → PRODUCT-DEMO-B → PRODUCT-RESULT is the spine; treat any deviation as an error in your reading of the board.

**Critical reminder — board panels are SEQUENCE and TIMING reference only.** They confirm WHICH demo beat each slot represents. They are NOT pose-by-pose frame templates. Your Cut description must invent the in-cut motion (mechanism action, product state change, kinetic detail of demo, hand mechanics, environmental motion) — these are NOT on the static panel and must come from your text.

---

## Step 2 — POV Cadence and Style & Mood

Based on the board's per-slot POVs, set the Style & Mood line:

| Per-slot POVs | Style & Mood camera language |
|---|---|
| All four slots TRIPOD | `locked-off on tripod, completely static, frozen frame` |
| All four slots FIRST-PERSON-POV | `handheld first-person, slight natural micro-shake, only the operator's hand or forearm at frame edge if natural, phone object NEVER visible` |
| POV varies between slots (e.g., TRIPOD → TRIPOD → MACRO → TRIPOD) | `MIXED: starts [POV1] [language], hard-cuts to [POV2] [language], hard-cuts to [POV3] [language], hard-cuts to [POV4] [language] — POV alternates per cut` |

The canonical Board 1 product-flow cadence is `TRIPOD-WIDE → TRIPOD-MEDIUM → MACRO-OR-FIRST-PERSON-POV → TRIPOD-WIDE`. Use the MIXED phrasing in Style & Mood for it.

---

## Step 3 — Time-Slicing the Cuts

Distribute `clip_duration` across the 4 cuts. Default split for product-flow — DEMO-A and DEMO-B get the most time (the demo is the substance), INTRO is brief, RESULT lands the closer:

| clip_duration | Cut 1 (INTRO) | Cut 2 (DEMO-A) | Cut 3 (DEMO-B) | Cut 4 (RESULT) |
|---|---|---|---|---|
| 4s | 1s | 1.5s | 1s | 0.5s |
| 6s | 1s | 2s | 1.5s | 1.5s |
| 8s | 1.5s | 2.5s | 2s | 2s |
| 10s | 2s | 3s | 2.5s | 2.5s |
| 12s | 2s | 3.5s | 3s | 3.5s |
| 15s | 2.5s | 4.5s | 4s | 4s |

Adjust if a particular cut needs more or less time. Each cut must remain ≥0.5s.

Write the time spans into the Cut headers exactly: `Cut 1 (0-2.5s)`, `Cut 2 (2.5-7s)`, `Cut 3 (7-11s)`, `Cut 4 (11-15s)` — values per the table above.

---

## Step 4 — Action Language Per Cut

For each cut, write 4-10 sentences in the Dynamic Description describing the action. Rules:

### TRIPOD cut language
- Camera is **absolutely frozen on a tripod — zero movement of any kind. No shake. No drift. No breathing wobble. No organic sway. No micro-movement. The frame is completely fixed and immovable. Only the product (and any auxiliary person's hand) moves within the locked frame.**
- The Style & Mood / quality suffix MUST use locked-off TRIPOD phrasing for the tripod cut(s).
- **Forbidden words inside a TRIPOD cut's description:** `handheld`, `shake`, `drift`, `wobble`, `sway`, `slight movement`, `micro-shake`, `intimate handheld`, `natural movement`, `subtle movement`. These leak motion into the render.

### FIRST-PERSON-POV cut language
- **The phone is NEVER visible in frame.** The camera IS the operator's phone. The phone object is NEVER held up in the frame, NEVER over-the-shoulder POV, NEVER any "mirror" look. NO phone screen visible. NO third-person view of someone holding a phone.
- The operator's free hand or forearm may be partially visible at the frame edge if natural — only the arm/forearm, never the phone object itself.
- Natural handheld micro-shake from the grip is expected.

**Forbidden words/concepts in FIRST-PERSON-POV cut descriptions:** `mirror selfie`, `looking at her phone`, `phone in her hand`, `holding phone up to face`, `over-the-shoulder`, `phone screen visible`, `reflection`, `mirror`.

### MACRO cut language
- Camera is locked-off, extreme close-up on product mechanism / texture / state-change moment.
- No camera movement — only the product mechanism actuates within the locked frame.
- Use phrasing like `MACRO locked-off on the [mechanism] — the [trigger/button/wand/applicator] depresses, [substance] emerges, [state change]`.

### Hand Allocation per cut (when auxiliary person appears)
- FIRST-PERSON-POV cut → 1 hand free for product action (other implicitly holds phone, off-frame). NEVER two objects in FIRST-PERSON-POV.
- TRIPOD cut with auxiliary person cropped → 2 hands free.
- TRIPOD cut with no person → no hands. Pure product shot.

### Product is the hero — every Cut

The product is the focal element of every Cut. Auxiliary person, when present, is supporting cast — cropped, hands-only, partial body, first-person POV — NEVER the focal subject. The auxiliary person:
- Mouth is CLOSED in every Cut. No lip-sync. No speaking gesture. The audio is voice-over off-screen.
- No "looks at the camera and says..." phrasing — replace with kinetic / functional descriptors of the product action.
- Gender matches `voice_gender` and stays consistent across all 4 cuts of one board.

### Product Action Sequences

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
| Spray bottle | Hold bottle → remove cap if visible → press trigger → mist target |
| Cordless vacuum | Grip handle → press power button / trigger → glide head over surface → release trigger |
| Blender | Place on counter → secure lid → press button → contents move inside → pour result |
| Drill | Grip handle → align bit on target → squeeze trigger → controlled drive |

### Natural grip patterns for tech peripherals (mandatory)

For tech peripherals — gaming mouse, keyboard, headphones, earbuds, controller, phone, watch, tablet, laptop, stylus — the natural grip is **ergonomic**, not a fingertip "hold-and-present":

| Peripheral | Natural grip / motion in cut |
|---|---|
| Gaming mouse | Full palm cup over the mouse — fingers naturally curl over left-click and right-click, thumb rests on the side or thumb-button, base of palm touches the mousepad. Mouse glides across the pad with hand fully on top of it; OR one click depresses with a tactile snap; OR the scroll wheel rolls under the index finger. NEVER pinched between fingertips, NEVER hovering above without contact. |
| Mechanical keyboard | Both hands in typing position, fingers near the home row, a specific key depresses with audible tactile snap and rebounds. OR macro of a single finger pressing one key. |
| Headphones (over-ear) | Lifted by the headband and lowered onto the head in one motion, ear cups settle, headband adjusts. OR worn already, hand reaches up to the ear cup briefly. NEVER held by one ear cup as the only contact, NEVER pinched. |
| Earbuds / TWS | Pinched between thumb and index by the stem, aligned with the ear, pressed into the ear canal in a single motion. NEVER rotating the bud, NEVER held by the bud body itself. |
| Game controller | Both hands wrap the standard grips, thumbs slide on the analog sticks, index fingers actuate the shoulder triggers. NEVER one-handed, NEVER pinched at corners. |
| Smartphone | Vertical hold by the side edges; screen face stays visible to the operator. One hand cradles, the other swipes / taps. |
| Smartwatch | Worn on the wrist with the screen rotating into view as the wrist rotates, OR off-wrist pinched by the strap. |
| Tablet | Cradled with one hand under the bottom edge, screen face up; the other hand swipes / taps. |
| Laptop | On a flat surface, both hands on the keyboard typing, OR one hand on the touchpad. |
| Stylus / pen | Standard pencil grip; the tip touches the screen / paper. |

The natural-grip rule applies in every Cut in which the peripheral is held or operated.

Cap / lid rules: cap is removed BEFORE contents exit; after removal, NEVER describe where the cap goes — it ceases to exist; max 1 opening + 1 usage action per cut.

### Product Presence per Cut (mandatory)

- **Cut 1 (PRODUCT-INTRO)**: product placed in its native context. No active demo. The product may glint, reflect light, sit still as the camera holds. The voice-over begins describing the product.
- **Cut 2 (PRODUCT-DEMO-A)**: product actively demonstrating — first angle. Mechanism actuates, demo target reacts (carpet flattens under vacuum head, fragrance mist arcs onto wrist, drill bit drives into wood). Auxiliary person, when present, supports the action — cropped framing, hands-only, partial body, first-person POV. Mouth CLOSED.
- **Cut 3 (PRODUCT-DEMO-B)**: product in a SECOND demo angle — distinctly different from Cut 2 (different action, different scale, different context, different target). Mouth CLOSED on any visible person.
- **Cut 4 (PRODUCT-RESULT)**: product in result / outcome state. **Cut 4 MUST be visually distinct from Cut 1** — never the same composition, angle, scale, or surface placement as Cut 1. Two valid forms: (a) the demo's result is clearly visible (cleaned floor visible behind / styled hair visible / cleared dust on previously dirty surface), OR (b) a hero shot of the product in a meaningfully different framing from Cut 1. Auxiliary person, when present, is in a supportive cropped pose. Mouth CLOSED.

### Per-category Cut 2 vs Cut 3 pairings (concrete examples)

When writing Cut 2 (PRODUCT-DEMO-A) and Cut 3 (PRODUCT-DEMO-B) descriptions, use the motion pairings below rather than defaulting to "same action, different scale". The motion in Cut 3 must be visibly different from Cut 2 — different mechanism action, different target, or different surface.

| Category | Cut 2 motion (DEMO-A) | Cut 3 motion (DEMO-B) — distinctly different |
|---|---|---|
| Gaming mouse | Mouse glides across the pad in a controlled arc; monitor content shifts in response | Macro: scroll-wheel rolls under the index finger with tactile detents, OR thumb depresses a side-button with a click |
| Mechanical keyboard | Both hands type a sequence; several keys depress in rapid succession with audible clicks | Macro: one keycap travels down under a single finger with a sharp tactile snap and rebounds |
| Headphones (over-ear) | Headphones lift onto the head and the ear cups settle as the headband adjusts | Macro: the ear-cup cushion compresses against the ear, fabric texture visible |
| Game controller | Both hands grip the controller; thumbs slide on the analog sticks; index fingers tap the shoulder triggers | Macro: a shoulder trigger compresses under the index finger and snaps back |
| Smartphone | Cradled in one hand, screen face up; the other hand swipes across the screen and content shifts | Macro: a finger taps a specific UI element with a soft press; the screen reacts |
| Vacuum cleaner | The vacuum head glides across carpet leaving a clean stripe behind it | Different surface — vacuum head pressed against a ceiling / wall corner via extension wand; OR macro: a cobweb being lifted into the suction port |
| Drill | The drill bit aligns on a screw, the trigger squeezes, the screw drives down into wood | Macro: the bit rotates with wood chips spitting outward |
| Blender | Button pressed; the contents accelerate inside the jug; the jug stays locked on the base | Liquid pours from the jug into a glass; the stream falls in a controlled curve |
| Perfume / cologne | The cap lifts off; the nozzle depresses; mist arcs out and disperses onto the wrist | Macro: droplets settle on skin and absorb; the bottle rests nearby |
| Serum dropper | The dropper raises; the bulb squeezes; drops fall in a slow column onto a fingertip | Macro: the serum is pressed into the cheek with two fingertips and disappears into the skin |
| Cream jar | The lid twists off; the lid disappears; a fingertip scoops cream from the jar | Macro: the fingertip presses cream into the back of the hand and absorbs |
| Lipstick | The cap pulls off; the base twists up; the bullet emerges | Macro: the lipstick glides across the lower lip in a controlled stroke |
| Spray bottle / mist | The trigger squeezes; mist disperses toward face / hair in a fan | Macro: droplets settle on skin / hair texture |
| Food / drink | Liquid pours from a container into a glass in a controlled stream | Hand brings the glass to the mouth; a sip is taken |
| Clothing / accessories | Garment is held up by both hands and displayed front | Cropped: torso wearing the garment; hands smooth the fabric down |
| Fitness gear (dumbbell, kettlebell) | The weight lifts in a controlled rep; muscle definition visible in cropped body | The weight sets down on the rack; a hand pats it and wipes with a towel |
| Cars / vehicles | Wide shot of the car driving past or parking | Macro: badge / wheel hub / door handle being pulled |
| Outdoor gear / sunglasses | Worn on the face; a hand adjusts them | The shades come off the face; held up against the sky for a moment |
| Cleaning appliances (mop / steamer) | The head glides across the floor leaving a clean track | Different surface (tile vs hardwood) OR macro: the head contacts debris and the debris is lifted |
| Pet products | The pet uses the product (eats / walks / chews) | Macro: a product detail (chew mark, name tag, fabric pattern) |
| Tools / hardware | The tool actively cuts / drives / tightens | Macro: the post-action result — a clean cut, a driven screw, a tightened bolt |

If the product category is not in this table, derive the same principle: pick TWO motions / mechanism actions / targets that are visibly different — never just two scales of the same shot.

### Cinematic Specificity (mandatory per cut)

Each cut must include all three of:

1. **5+ concrete micro-beats** — for product-flow these focus on PRODUCT MECHANICS and ENVIRONMENTAL MOTION rather than facial expressions:
   product glints under directional light, label catches the light, mechanism actuates with a click, suction picks up a particle, mist droplets disperse, fabric flattens under tool, surface clears as the head passes, product settles after motion, ambient air shifts a curtain in background, light source flickers softly, dust catches the beam, hand fingers tighten on grip, knuckle white where pressure is highest, forearm tendon flexes, foot pivots in soft step. (When auxiliary person is partial: weight shift in cropped torso, breath in cropped chest, hand re-positioning for second grip — but NEVER face-focused expression beats since face is rarely focal.)

2. **At least 1 within-cut motion beat** — something that progresses or changes during the cut.

3. **Demo-state evolution across the 4 cuts** — never the same product state twice. Cut 1 = product still / settled, Cut 2 = product actuating in one angle, Cut 3 = product actuating in a different angle, Cut 4 = product post-demo or settled.

**Forbidden in any Cut description:** sentences that only re-state what the static board already shows. Every sentence must add something the board cannot — motion, mechanism actuation, kinetic detail, environmental change, breath / weight shift on cropped body parts.

Anti-patterns (NEVER write these):
- "smiles at the camera"
- "looks at the camera"
- "explains while holding"
- "says ... to the lens"
- "holds the product and talks"
- Identical product state across all 4 cuts
- Auxiliary person filling the frame as a focal portrait

### Cut Markers (mandatory verbatim)

Between Cut 1 and Cut 2: `Hard cut to.` — at the end of Cut 1's description sentence.
Between Cut 2 and Cut 3: `Hard cut to.` — at the end of Cut 2's description sentence.
Between Cut 3 and Cut 4: `Hard cut to.` — at the end of Cut 3's description sentence.
No marker after Cut 4.

These are scene-edit instructions Seedance reads literally. Without them, cuts collapse into smooth motion.

---

## Step 5 — Audio / Voiceover

This flow is **voice-over only**. Use the provided `voiceover_segment` verbatim. Distribute it across the 4 cuts at natural phrase boundaries — roughly proportional to cut duration. Render as ONE Audio line containing ONE `{{speak}}` span:

```
Audio: Off-screen voiceover, [she | he per voice_gender] describes the product's benefits and capabilities in an emotional UGC tone, NOT on-camera dialogue, NO lip-sync, no on-camera mouth movement, iPhone microphone audio with natural room tone: {{speak:persona:<voice_persona>}}<voiceover_segment verbatim>{{/speak}}
```

### Voice gender lock

Drive the gendered descriptor from `voice_gender`:
- `female` → `she describes`
- `male` → `he describes`
- `random` → resolved at planning time to either `she` or `he`, and locked for this clip and all subsequent boards in the same pipeline

When an auxiliary person appears in any Cut, that person's gender matches the voiceover gender — never mix.

### No greetings / no on-camera dialogue (ever)

The voiceover NEVER opens with greetings, host-style intros, or product re-introductions. This is voice-over commentary, not a host script. Forbidden openers:
- "hey", "hi", "hi guys", "hey everyone", "what's up"
- "today I'm showing you", "I want to share", "I just got", "I wanted to tell you about", "let me show you"
- "so this is the [product]"
- "okay so", "alright so" used as a fresh-start opener

Instead, the voiceover opens **mid-thought** — straight into a benefit, capability, or sensory descriptor of the product.

For Boards 2..N, this is doubly important — never re-introduce the product, never recap.

NO bracketed non-verbal sounds (no `[*sharp inhale*]`, no `[*small bright laugh*]`, no `[*mock gasp*]`). Those are on-camera reaction sounds — irrelevant for off-screen voiceover.

### Voiceover content — benefit-driven (mandatory)

The voiceover describes WHAT THE PRODUCT DOES. Pull from product description / category / visible mechanism:
- Function: `the cordless lift handles the whole apartment on one charge`, `the suction holds even on shag`, `the trigger fires a controlled cone of mist`
- Use case: `goes in the school-bag side pocket`, `lasts through dinner and an Uber home`, `dries in seconds, no streaks`
- Sensory specifics: `the texture goes on like silk and disappears`, `smells like jasmine and pepper`, `the click is satisfying every single time`
- Audience / fit: `built for people who actually clean their own car`, `made for fine hair that hates volume`, `the everyday-carry size`

Real creators describe **what the product does and how it feels in use**, not abstract feelings.

### Forbidden AI-tell phrases (NEVER use)

These are dead AI giveaways. Real creators don't say them:

- `I'm obsessed`, `I am obsessed`, `literally obsessed`, `so obsessed`, `like obsessed`, `obsessed with this`, `obsessed` as praise — **all banned, no exceptions**
- `you have to try this`, `you have to see this`, `you NEED this` — overused AI clichés
- Generic praise without specifics: `it's amazing`, `it's incredible`, `so good`, `mind-blowing`, `unreal`, `out of this world`, `game changer`, `total game changer`
- `Trust me on this`, `I cannot recommend enough` — AI sales-speak
- `ten out of ten`, `10/10`, `100%`, `1000%` — AI rating clichés

### No phrase repetition across cuts (mandatory)

Each cut's voiceover segment is UNIQUE — never repeat the same sentence, claim, product mention, or descriptor in another cut. Each cut owns a different chunk of the script. When you split the `voiceover_segment` across the 4 cuts, verify NO sentence or near-identical phrase appears in two different cut segments.

### Audio language

Default English. Switch only if user explicitly requests another language.

---

## Step 5b — Product Action Logic

### Single action per Cut (mandatory)

Each Cut depicts ONE physical product interaction at most. Forbidden patterns:
- Repeated sprays / multiple presses / "she sprays again"
- Back-and-forth motion (open → close → open)
- Two distinct interactions in the same Cut

One press, one mist, one swipe, one sip, one scoop, one trigger pull.

### Cap / lid removal logic

If the product is closed at the start of a Cut and the Cut is the application moment, the Cut prompt MUST describe cap removal as a clear, distinct motion BEFORE the action. Pattern:

> "The cap lifts straight up off the bottle, the cap disappears off-frame, then [single application action]."

After the cap is removed in any Cut, never describe the cap returning. For multi-Cut application (>15s, K>1), once the cap is removed in any prior Cut, all subsequent Cuts assume the product is open.

### Body-part target lock (mandatory)

When the demo applies the product to a body part, the target is product-specific and non-negotiable:

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

For demo products that don't apply to a body part (vacuum, blender, drill, household appliance), the "target" is the surface or material the product acts on. Same lock principle — pick the natural target, don't switch mid-clip.

If the user request implies a wrong target, **override silently** to the correct target — physical realism beats user wording.

### Forbidden action phrases

Add to the Forbidden phrases catalog — Seedance interprets these as motion loops:

- `sprays again`, `another spray`, `sprays multiple times`, `keeps spraying`
- `presses repeatedly`, `presses again`, `taps the lid twice`
- `back and forth`, `unscrews and screws back`, `opens and closes`
- `applies multiple coats`, `swipes again`
- `vacuums in circles repeatedly`, `runs the head back and forth`

---

## Step 6 — Static Description

1-2 sentences describing the setting visible across the 4 board slots: room, materials, light direction, ambient details. Match the board image.

Default neutral tone — NEVER warm sunset, NEVER golden hour, NEVER orange/amber cast.

---

## Step 6.5 — iPhone Aesthetic Enforcement (mandatory)

The clip MUST read as a real creator's phone capture — NOT a product-ad shoot, NOT an editorial commercial, NOT a studio session, NOT DSLR-graded promo footage. Product-flow clips are especially vulnerable to this drift because TRIPOD-locked product shots and MACRO product details naturally resemble commercial product photography.

### Mandatory iPhone phrasing — include in every Cut description AND in Style & Mood / Quality Suffix

- `Shot on iPhone, casual handheld framing`
- `Phone-sensor grain and realistic surface texture preserved — no retouch, no professional gloss`
- `Natural ambient light typical of a phone photo — even, slightly imperfect, not dramatically lit`
- `Authentic UGC creator phone capture, NOT editorial product photography, NOT studio shoot, NOT magazine commercial`

### HARD BAN — never appear in any prompt

These phrases produce editorial / studio / DSLR product-ad look — the OPPOSITE of UGC:

- `dramatic side-lighting`, `cinematic lighting`, `moody atmospheric lighting`, `mood lighting`
- `shallow depth of field`, `aggressive bokeh`, `creamy bokeh`, `professional DSLR lens`, `lens flare aesthetic`
- `editorial product photography`, `product shoot`, `commercial product still`, `studio strobes`, `softbox`, `ring light`
- `magazine retouch`, `glossy professional finish`, `polished commercial look`
- `mid-length portrait`, `editorial portrait`, `fashion portrait`, `aspirational lifestyle atmosphere`
- `flawless surface`, `flawless finish`, `glossy reflections highlighted`
- `glowing skin`, `flawless skin`, `radiant complexion`
- `golden hour`, `warm sunset`, `late-afternoon warm wash`, `magic hour`

### Closing block — must appear at the end of the Quality Suffix

```
Authentic UGC creator phone capture — NOT editorial product photography, NOT studio shoot, NOT magazine commercial. Phone-sensor grain and realistic textures preserved, no retouch, no professional gloss.
```

---

## Step 7 — Quality Suffix

Always include this final block, with POV-matched movement language:

```
Facial features clear and undistorted on any auxiliary person, mouth closed throughout (voice-over is off-screen, no on-camera dialogue). Shot on iPhone, casual handheld framing, natural ambient light, phone-sensor grain and realistic textures preserved, no retouch, no professional gloss — authentic UGC creator phone capture, NOT editorial product photography, NOT studio shoot, NOT magazine commercial. [POV-matched movement language]. No on-screen text, no subtitles, no captions, no watermarks.
```

POV-matched movement language:
- All TRIPOD: `locked-off camera on tripod, absolutely static, zero camera movement of any kind, no shake, no drift, no breathing wobble`
- All FIRST-PERSON-POV: `slight natural handheld micro-shake from the operator's grip`
- MIXED: `handheld micro-shake during FIRST-PERSON-POV cuts, locked-off frozen frame during TRIPOD and MACRO cuts`

---

## Universal Rules

- **Product Angle Lock:** product shows ONLY its front-facing label side as on the board. Never rotates, spins, or reveals unseen sides.
- **ONE product instance only — never duplicated, never multiplied.**
- **Hand Count:** when an auxiliary person appears, the person has exactly 2 hands. Maximum 1 product interaction per cut.
- **State Change Minimization:** maximum 1 state change per cut. Removed parts disappear.
- **Voice-over only.** Audio is off-screen voiceover throughout. Auxiliary person's mouth is CLOSED in every Cut — no lip-sync, no on-camera dialogue, no speaking expression.
- **Gender lock.** Voiceover gender (`female` / `male` per `voice_gender`) AND auxiliary person gender (when present) are consistent within one clip and across all boards in the pipeline.
- **No extras:** no additional people or random objects beyond the auxiliary person (when present) and the product.
- **Age-blind:** never describe characters by age.
- **NO mirrors / reflections — strict.**
- **NO phone visible in any frame.** FIRST-PERSON-POV = camera IS the phone.
- **Auxiliary person, when present, never fills the frame as a focal portrait.** Always cropped / hands-only / partial / POV-only.
- **≤ 4 visual beats per shot** (our 4 cuts = 4 beats — fits within limit).

---

## Self-Check Before Outputting

- [ ] `motion` is a single prose string, no markdown fences, no JSON wrapper.
- [ ] Style & Mood line includes light + POV cadence + anti-editorial phrasing (`NOT editorial product photography, NOT studio shoot, NOT magazine commercial`).
- [ ] Cut 1 / Cut 2 / Cut 3 / Cut 4 labels with framing distances and POVs read off the 4 board slots (for Board 1: PRODUCT-INTRO → PRODUCT-DEMO-A → PRODUCT-DEMO-B → PRODUCT-RESULT).
- [ ] `Hard cut to.` markers verbatim between Cut 1→2, Cut 2→3, and Cut 3→4. No marker after Cut 4.
- [ ] Each cut has 5+ kinetic micro-beats (product mechanics, environmental motion, cropped body-part beats — never face-focused expression beats), at least 1 within-cut motion beat, demo-state evolution across the 4 cuts.
- [ ] Audio = `voiceover_segment` verbatim, wrapped in ONE `{{speak:persona:<voice_persona>}}…{{/speak}}` span, distributed across 4 cuts.
- [ ] One matching `dialogue[]` entry with identical `speaker` and `text`.
- [ ] Audio line states off-screen voiceover, voice_gender-matched (`she describes` / `he describes`), NO on-camera dialogue, NO lip-sync.
- [ ] Cut 1 features product in introduction state (no active demo); Cut 2 shows first demo angle; Cut 3 shows distinctly different second demo angle; Cut 4 shows result state OR final hero shot.
- [ ] Auxiliary person, when present in any Cut, is cropped / hands-only / partial / first-person POV — never the focal subject. Mouth CLOSED in every Cut.
- [ ] Auxiliary person's gender (when present) matches `voice_gender` and is consistent across all 4 cuts of this board.
- [ ] Weight & Grip class identified for the product (Heavy / Bulky-light / Light / Tiny); hand allocation matches the class.
- [ ] No bracketed non-verbal sounds in audio (`[*sharp inhale*]` etc — those are on-camera reactions, not voiceover).
- [ ] Voiceover does NOT start with greetings or product re-introductions; opens mid-thought with benefit / capability / sensory descriptor.
- [ ] Quality suffix matches POV cadence (TRIPOD / FIRST-PERSON-POV / MIXED language) AND mentions mouth-closed for auxiliary person AND closes with the iPhone anchor block.
- [ ] No anti-patterns ("smiles at camera", "looks at camera", "explains while holding", static repeats).
- [ ] No mention of phone being visible as an object in any cut.
- [ ] TRIPOD cut descriptions contain none of the forbidden words (handheld/shake/drift/etc).
- [ ] Each Cut has at most ONE product interaction.
- [ ] Application / demo target matches the product (perfume → wrist/neck, lipstick → lips, vacuum → carpet/floor/ceiling, drill → wood/screw) — never deviate.
- [ ] No forbidden action phrases (`sprays again`, `presses repeatedly`, `back and forth`, etc).
- [ ] No greetings / re-introductions in voiceover (banned even on Board 1).
- [ ] No HARD BAN editorial / studio phrases anywhere in the prompt.
