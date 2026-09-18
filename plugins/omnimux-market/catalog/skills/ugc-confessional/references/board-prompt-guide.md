# UGC Board Prompt Guide (Generic 3-Slot 16:9)

Use this when composing the `prompt` for `generate_image` to produce a 16:9 three-slot UGC storyboard sheet for ONE Seedance video clip.

The output of this composition is a single prose prompt string (no JSON wrapper, no markdown fences). The orchestrator skill passes that string as `generate_image(prompt=...)` with `aspect_ratio="16:9"`, `resolution="1K"`, and `image_urls` in the order specified below — so `@Image1`, `@Image2`, ... in your prompt text bind directly to those resolved URLs.

CORE PRINCIPLE: The sheet is a sequential UGC storyboard for ONE 15-second-or-shorter video clip — three frames showing three narrative moments inside that single clip. NOT a presentation deck. No headers, no metadata blocks, no pop-text captions, no badges, no numbers, no brand-matched design system, no typography of any kind. Just three equal-size 9:16 slots in one row, each containing a photorealistic UGC iPhone-style still that advances a coherent story. Slots are separated by thin white gutters. **All three slots are always active — there are no placeholders.**

The character is supplied via reference image — never generate or describe their face, body, age, or appearance. Reference them only as "the same person from the character reference image, with identical face, hair, body, and identity across all three slots."

The product (when supplied) follows strict Angle Lock, Realistic Scale, and Placement Logic rules.

Story matters. Setting matters. Camera POV adapts to the action in each slot and **may change between slots — every POV change aligns with a hard cut between slots, never a smooth transition.** Hand count is enforced.

---

## CRITICAL LAYOUT GUARD (gpt-image-2 — include verbatim in every composed prompt)

This guard fixes two known failure modes specific to gpt-image-2 (the model the skill uses for board generation):

1. **gpt-image-2 misreads "three 9:16 slots in a 16:9 sheet" as "three wide horizontal bands stacked top-to-bottom"** — producing a vertical stack of full-width strips instead of three side-by-side columns.
2. **gpt-image-2 has a strong "label the panels" prior** that auto-adds forbidden "SLOT 1 / SLOT 2 / SLOT 3" typography (and sometimes numbers, captions, or "Panel X" tags) directly onto the rendered output, overriding any vague "no text" instruction.

To counter both, the composed prompt MUST include the following block verbatim, placed near the top of the prompt (right after the `@ImageN` reference lines and before the per-slot descriptions). Do NOT summarize, paraphrase, or shorten it — the explicit redundancy is load-bearing:

```
CRITICAL LAYOUT (read first, applies to the entire output): The output is a LANDSCAPE WIDE rectangle in 16:9 aspect ratio — roughly 1.78 TIMES WIDER than it is TALL. Inside this wide rectangle, there are exactly THREE identical TALL NARROW vertical panels (each 9:16 portrait orientation — TALLER than WIDE, the proportions of a single phone screen), arranged from LEFT to RIGHT in a single horizontal row. The three panels divide the wide rectangle horizontally into THREE EQUAL COLUMNS, separated by thin white vertical gutters. The aspect of each individual panel is 9 wide by 16 tall — a tall narrow rectangle. The aspect of the full sheet is 16 wide by 9 tall — a wide short rectangle.

DO NOT lay out the panels as three wide horizontal bands stacked top-to-bottom — that is the wrong layout. The panels are columns side-by-side, not rows stacked. The dividers between panels are VERTICAL white gutters, never horizontal lines.

DO NOT add any text, labels, numbers, captions, panel identifiers, headers, footers, watermarks, or typography of any kind anywhere on the output. Specifically forbidden: "SLOT 1", "SLOT 2", "SLOT 3", "Panel 1/2/3", "#1 #2 #3", "1 of 3", "Frame 1", or any other panel-naming text. There is no on-image typography of any kind on this storyboard sheet. The only text that may appear is the product's own real label printed on the physical product itself when the product is in frame.
```

This block is the single most important rendering directive for gpt-image-2. Include it verbatim near the top of every composed prompt for every board (K=1 and K>1).

---

## Inputs (provided in the skill dispatch)

1. **Character/creator image** — REQUIRED. Always provided. Recurring identity reference. Never re-described.
2. **Product image(s)** — OPTIONAL. Used for product reference + Angle Lock when present.
3. **Previous-board image** — OPTIONAL. Provided when this board is K>1 in a multi-board sequence. Used to preserve identity, location, lighting, product, and wardrobe across boards.
4. **Product description** — OPTIONAL. Source of truth for product name, category, mechanics, claims.
5. **Text request** — what the user wants the story to be.
6. **Arc role** — passed externally. One of: `HOOK`, `HOOK+SETUP`, `MAIN`, `REVEAL`, `APPLY`, `APPLY+CLOSER`, `CLOSER`, or `FULL_ARC` (single-board video). Determines the story role this board plays in the larger video.
7. **Clip duration** — 4 to 15 seconds. The single Seedance clip this board produces.
8. **Board index K and total boards N** — context for chaining ("Board 2 of 3").

---

## Image Reference Order

Standard order (the orchestrator's `image_urls` array must match this — `@Image1` is the first element, `@Image2` the second, etc.):

| References provided | Order |
|---|---|
| Product + character + previous board (K>1) | `@Image1` = product, `@Image2` = character, `@Image3` = previous board |
| Product + character (K=1) | `@Image1` = product, `@Image2` = character |
| Character + previous board (no product) | `@Image1` = character, `@Image2` = previous board |
| Character only | `@Image1` = character |

The prompt MUST start with explicit `@ImageN` references in this order.

---

## Input Tiers

Classify the user request:

| Tier | Trigger | Behavior |
|------|---------|----------|
| Auto | 1-5 words, no scenario, only product name, "make video", or empty | Full autopilot: build a default UGC mini-arc for the assigned arc role. |
| Guided | 1-3 sentences with general idea, tone, mood, or rough flow | Preserve user's tone/emphasis/mood. Build slot structure yourself. |
| Director | 4+ sentences with specific scenario, dialogue intent, shot list, location sequence, or props | Map user's beats 1:1 onto the 3 slots in their order. Adapt only physically unsafe interactions. |

---

## User Override Rule

If the user specifies any concrete detail — setting, location, clothing, action, mood, time of day, props, slot order, story beats — that detail takes priority over every default below.

---

## Step 1 — Product Understanding

### Mode A: Product image(s) + product description provided
Use the description directly. Extract: product name, brand, category, key features, intended use, container material, applicator type, visible design details, safe-to-mention claims.

### Mode B: Product image(s), no description
Visually analyze:
1. Product category
2. Container material — glass, hard plastic, soft tube, metal, cardboard, fabric, food packaging, tech, unknown
3. Applicator type — removable cap, pump, dropper/pipette, wand, spray nozzle, twist-up, flip top, compact hinge, none
4. Usage mechanic
5. Key visual details — color, label text, logo, shape, distinctive features
6. Real-world physical size — estimate height/width in centimeters from packaging type
7. Forbidden actions — anything that breaks physics, deforms rigid packaging, or invents unseen sides

### Mode C: No product image
Extract from text request only. No `@Image` product references. No Angle Lock. Describe the product in words inside the prompt. If mechanics are unclear → hold-and-present only.

### Mode D: No product at all
Story is talking-head / lifestyle / scenario-driven. The character carries the entire arc.

---

## Step 2 — Character Reference Rules

The character is always supplied via input image and must NEVER be re-described.

In every prompt, include:

`@Image[N] is the character reference. The same person appears in every slot with identical face, hair, body, and identity. Do not alter facial features, hairstyle, body proportions, or skin tone between slots.`

Outfit:
- Default: identical outfit across all three slots, matching the character reference image.
- Outfit may change ONLY if the story explicitly transitions to a new context (rare in a single 15s clip; more common across boards).
- When a previous-board reference is present (K > 1), wardrobe defaults to matching the previous board exactly.

Never describe the character's age, ethnicity, attractiveness, makeup, or features beyond what the reference image already supplies.

---

## Step 3 — Setting and Lighting Logic

Default: inherit setting and lighting from the character reference image. Reference in the prompt:

`Setting and lighting in all three slots default to the same environment, time of day, and light direction visible in the character reference image, unless the story requires a different location.`

When K > 1 and a previous-board reference is provided: the setting and lighting MUST match the previous board exactly (same room, same light direction, same time of day) UNLESS the story explicitly transitions to a new location.

For product-driven setting matching when reference is unusable:
- Cosmetics / makeup / fragrance → bathroom or bedroom by tier
- Skincare / haircare / body care → bathroom by tier
- Food / beverages / kitchen products → kitchen
- Protein / supplements / sports nutrition → home gym or kitchen
- Clothing / accessories / jewelry → bedroom or dressing room
- Fitness gear → home gym or yoga corner
- Cars → driveway / sunlit street / garage
- Outdoor gear / sunglasses / sunscreen → café terrace, park, sunlit street
- Tech / electronics → home desk, living room, studio nook
- Home / decor → living room or bedroom

Lighting fallback: soft neutral daylight from a clear directional source (left or right window). Never golden hour or warm sunset unless user explicitly asks. Never harsh studio strobes.

---

## Step 4 — Story Arc Across the 3 Slots

Each board carries an arc role assigned externally. The 3 slots inside the board carry an internal mini-arc that fits that role.

| Arc role | Slot 1 | Slot 2 | Slot 3 |
|---|---|---|---|
| `HOOK` (first board of multi-board video) | Attention-grab moment / discovery / curiosity | Pivot toward the product or the moment | Lead-in to next board (e.g., reaching for the product) |
| `HOOK+SETUP` (Board 1 of 2) | Attention-grab | Setup / context | First product touch |
| `MAIN` (middle board) | Continuing action picked up from previous board | Core demonstration / application moment | Reaction or transition out |
| `REVEAL` (Board 2 of 4) | Open packaging / reveal product | Show key detail | First impression reaction |
| `APPLY` (Board 3 of 4) | Begin application | Mid-application | Effect visible |
| `APPLY+CLOSER` (Board 2 of 2) | Application moment | Effect visible | Recommendation pose |
| `CLOSER` (last board) | Result visible | Recommendation | Final beat / settle |
| `FULL_ARC` (single-board video, N=1) | HOOK — attention-grab / setup | MAIN — application or core moment | CLOSER — reaction / result |

When the user gives a Director-tier sequence, map their beats 1:1 onto the slots in order.

### First slot ≠ obligatory "show product"

Slot 1 is the **setup of the moment**, not necessarily a product reveal. If the slot's narrative is on-the-way / discovery / talking-head hook — the product may be hidden, partial, or absent in slot 1. The "show product" beat moves to whichever slot the story actually delivers it.

---

## Step 4.5 — Slot Action Diversity (mandatory)

**The 3 slots MUST show three DIFFERENT physical actions, not three variations of the same pose.** Same hand-product configuration in all three slots = the storyboard reads as one frozen moment, not a story. Same pose with micro-variation (smile angle, head tilt) does NOT count as a different action.

### Default action patterns by arc role

| Arc role | Slot 1 action | Slot 2 action | Slot 3 action |
|---|---|---|---|
| `FULL_ARC` (15s, single board) | Hook intro — selfie pose, product visible in one hand at arm's length, talking direct-to-lens | Active two-handed interaction — open cap / spray / scoop / squeeze / sniff applied wrist / apply to skin | Reaction / result / settle — selfie back, product extended toward lens OR product placed on surface while she gestures |
| `HOOK` | Discovery / curiosity — selfie hook, hand on something | Pivot toward product, partial reach or first touch | Lead-in to next board — picking up the product, holding it ready |
| `HOOK+SETUP` | Attention-grab selfie | Setup / context shot | First product touch (held cleanly in one hand) |
| `MAIN` | Continuing action picked up from previous board | Core interaction — open / apply (typically two-handed = tripod) | Mid-reaction or transition out |
| `REVEAL` | Open packaging — tripod, two-handed | Show key detail close-up — product centered in palm | First impression reaction face |
| `APPLY` | Begin application — tripod | Mid-application close-up (lipstick swipe, drop landing on fingertip, mist hitting wrist) | Effect visible on skin/lips/wrist |
| `APPLY+CLOSER` | Application moment — tripod | Effect visible | Recommendation / final settle pose — selfie |
| `CLOSER` | Result visible — confident pose | Recommendation gesture or pose | Final settle smile / direct eye contact / fade |

### FULL_ARC Slot 1 — Hook variants

**Default = variant (b) Peak-shock skit hook for every board.** Switch to (a), (c), or (d) ONLY when the brief explicitly signals a calm-tone aesthetic (`goth`, `vampire`, `cinematic noir`, `cold`, `passive`, `deadpan`, `clinical`, `refined`, `luxury-passive`, `minimal`, `somber`, `serious`, `dark`, `shadowy`). The table row above (Hook intro — selfie pose, product visible, talking direct-to-lens) describes variant (a); it is NOT the default.

- **(b) Peak-shock skit hook (DEFAULT)** — WILD open-mouth scream-gasp / mouth blown open mid-yell / head jerk back with explosive joy, landing IMMEDIATELY on the product/action from frame 1 — no setup pause, no surprise pre-amble before the product enters frame. The product and the scream-reaction arrive together. Pairs with Pattern B in Step 10.
- **(a) Classic talking-head hook (override: warm-but-restrained briefs)** — selfie pose, product visible in one hand at arm's length, talking direct-to-lens, calm-to-warm energy. Pairs with Pattern A in Step 10.
- **(c) Mid-action straight-in hook (override: any tone, alternative opener)** — character already mid-bite / mid-sip / mid-gesture / mid-sentence at frame start, no setup beat. Compatible with Pattern A or B in Step 10 (pick based on energy of the brief).
- **(d) Sustained-passive hook (override: goth / vampire / cinematic noir / clinical / luxury-passive briefs)** — low-key opener; neutral face, half-lidded gaze, no expression spike, deliberate stillness. Pairs with Pattern D in Step 10. A `dramatic deadpan stare into lens` (no smile, brows neutral) is also valid for dry-humor / cool briefs — that variant pairs with Pattern C.

### Default POV cadence by arc role

| Arc role | POV cadence (Slot 1 → 2 → 3) | Why |
|---|---|---|
| `FULL_ARC` | **SELFIE → TRIPOD → SELFIE** | Real-creator phone-tripod-phone rhythm. Hook intimate (one hand), demonstration locked (two hands), reaction intimate (one hand). |
| `HOOK` / `HOOK+SETUP` | SELFIE → SELFIE → SELFIE or TRIPOD | Setup beats are usually one-handed talking-head |
| `MAIN` / `REVEAL` / `APPLY` | TRIPOD → TRIPOD → SELFIE | Two-handed action dominates middle boards; close on reaction |
| `APPLY+CLOSER` | TRIPOD → TRIPOD → SELFIE | End on intimate reaction after two-handed application |
| `CLOSER` | SELFIE → SELFIE → SELFIE | Result + recommendation = talking-head intimacy |

### Camera Distance Variation (mandatory)

Each of the 3 slots MUST use a DIFFERENT camera distance/framing. POV change alone is not enough — if all three slots show "head + shoulders" framing, the cuts collapse into one continuous shot regardless of POV. The viewer needs to physically see the camera at three distinct positions.

Default distance cadence by arc role:

| Arc role | Slot 1 distance | Slot 2 distance | Slot 3 distance |
|---|---|---|---|
| `FULL_ARC` | TIGHT CLOSE-UP — face dominant, product near cheek/jaw | MACRO or TIGHT CLOSE-UP — hands and product fill the frame, face partially in / out | WAIST-UP, THREE-QUARTER, or FULL-BODY WIDE — pulled back to show outfit and room context |
| `HOOK` / `HOOK+SETUP` | TIGHT or MEDIUM CLOSE-UP selfie | MEDIUM with slight pull-in | THREE-QUARTER or FULL-BODY WIDE with action, product partially visible |
| `MAIN` | MEDIUM CLOSE-UP transition | TIGHT or MACRO close-up of action | THREE-QUARTER pull-back to reaction face |
| `REVEAL` | MEDIUM tripod — package framed | MACRO close-up of detail | MEDIUM CLOSE-UP or THREE-QUARTER reaction |
| `APPLY` | MEDIUM tripod — product approaching skin | MACRO of application moment | MEDIUM or THREE-QUARTER with effect visible |
| `APPLY+CLOSER` | MEDIUM-TIGHT application | MACRO effect visible | THREE-QUARTER or FULL-BODY WIDE recommendation |
| `CLOSER` | TIGHT CLOSE-UP confident | MEDIUM with gesture | THREE-QUARTER or FULL-BODY WIDE settle / smile |

The slot description MUST explicitly state the framing distance — `TIGHT CLOSE-UP`, `MEDIUM CLOSE-UP`, `MEDIUM`, `MEDIUM-WIDE`, `MACRO`, `THREE-QUARTER`, `WAIST-UP`, `FULL-BODY WIDE`, or `PRODUCT-EXTENDED` — so the image model receives an unambiguous framing signal. Distance change between slots aligns with the hard cut between them.

### Distance band rule (mandatory)

The 3 slot framings MUST span at least **one TIGHT band** (TIGHT CLOSE-UP / MACRO), **one MID band** (MEDIUM CLOSE-UP / MEDIUM), and **one WIDE band** (THREE-QUARTER / WAIST-UP / FULL-BODY WIDE / PRODUCT-EXTENDED). If all 3 slots fall within the same band — e.g. all medium close-ups, all chest-up — REWRITE. The viewer must physically perceive the camera at three distinct distances. The wide slot is what gives the board breathing room and shows the creator's outfit + environment.

### Hard validation rules

- All three slots MUST show three DIFFERENT physical actions. Same pose with micro-variation = REWRITE.
- Same hand holding the same object across all three slots = REWRITE.
- All three slots MUST use three DIFFERENT camera distances/framings (per the Distance Variation table). Same framing distance across all 3 slots = REWRITE.
- The FULL_ARC default POV cadence is `SELFIE → TRIPOD → SELFIE` unless the user (Director-tier) explicitly overrides or the action sequence physically demands a different cadence.
- Every POV change AND every distance change between slots aligns with a hard cut (per Step 5).

---

## Step 5 — Camera POV and Hand Allocation Per Slot

Each slot picks the POV that fits its action AND obeys the Hand Allocation Rule. **POV may change between slots — every POV change between slots aligns with a hard cut, never a smooth transition.**

### Camera POVs

| Action in slot | POV |
|---|---|
| Product presentation / talking about product / hands-free demo / opening or twisting / two-handed application | **Tripod-style** steady front-facing iPhone shot, character at arm's-length distance, eye-level, like a TikTok review — both hands free for product handling |
| Walking / outdoor / movement / casual hook / talking head with at most one object in hand | **Arm's-length selfie** shot, slight handheld feel, character's phone-holding arm partially visible at the frame edge if natural |
| Tight product reveal / product centered in palm | **Tripod close-up** at chest/desk level, framing tight on hands and product |
| Reaction / CTA / final beat | **Tripod or selfie** front-facing, character at eye-level, expressive face |

### Hand Allocation Rule (hard constraint)

The character has exactly two hands. Count hands before finalizing every slot.

**Selfie POV:**
- ONE hand of the character is holding the phone — fully off-frame or its edge (forearm / palm side) partially visible at the frame edge.
- Only the OTHER hand is available for action — holding ONE object total (product OR bag OR something else, not both).
- If the slot requires holding two objects simultaneously, applying with one hand while holding product with another, or any two-handed mechanic → **Selfie is FORBIDDEN. Switch to Tripod.**

**Tripod POV:**
- Both character hands are free.
- Phone is not in frame; no hand holds it.
- Suitable for any two-handed action (opening, twisting, applying, holding product + cap simultaneously).

**Decision tree per slot:**
- Walking / outdoor + nothing in hand → Selfie
- Walking / outdoor + ONE bag → Selfie (bag in free hand)
- Walking / outdoor + bag + visible product → INVALID. Hide product inside bag (Selfie still works), or remove bag (Selfie still works), or switch to Tripod if both must be visible.
- Indoor + holding product alone, talking → Selfie or Tripod
- Indoor + opening cap / twisting dropper / pumping → Tripod
- Indoor + applying product to skin / lips / hair while holding bottle → Tripod
- Close-up of product in palm → Tripod close-up
- Reaction / smile / CTA with product visible in one hand → Selfie or Tripod

**Hard validation rule (must appear in the rendering rules of every prompt):**
`Count hands per slot. The character has exactly two hands. In selfie POV, one hand is occupied by the phone (off-frame or visible at edge), so only one hand is available for action — never depict the character holding two objects in selfie POV. If the slot's action requires two free hands, the slot must be tripod POV with the phone not in frame. POV may change between slots; every POV change aligns with a hard cut. No third arm, no extra hand, no impossible grip.`

---

## Step 6 — Safe Interaction Verbs

| Material | Safe verbs | Forbidden |
|---|---|---|
| Glass / hard plastic / metal | rests on palm, holds lightly, cradles, presents, taps gently, points at | squeeze, crush, clench, twist body, deform |
| Soft tube | holds, gently squeezes, presses lightly | crushes, wrings, twists violently |
| Fabric / clothing | wears, adjusts, smooths, drapes, holds up | stretches unnaturally, yanks, wrings |
| Cardboard box | holds from sides, presents front face, opens flap if visible | crushes, bends, folds unnaturally, tears |
| Food | bites, pours, scoops, stirs, serves | throws, juggles, morphs, multiplies |
| Tech / electronics | holds, presents, points to screen/detail | opens compartments, plugs cables |
| Any product | holds, shows, lifts, presents, points at | throws, catches, juggles, spins, drops |

When unsure → hold-and-present only.

---

## Step 7 — Product Angle Lock and Realistic Scale

When product image(s) are provided, Angle Lock is mandatory.

### Angle Lock — one product image
`@Image1 is the product reference. ANGLE LOCK: the product shows only the visible front-facing side from @Image1. The product keeps this same visible angle in every slot it appears in. Do not rotate, spin, flip, or reveal unseen sides.`

### Angle Lock — multiple product images
`@Image1 and additional product references show valid angles. The product may appear only from these provided angles. Switch angles only by hard cuts between slots, never by continuous rotation. Do not invent intermediate or unseen sides.`

Angle rules:
- Camera movement ≠ product rotation.
- The product can move closer/farther but the visible side stays consistent.
- Never invent back labels, side panels, or internal components.
- Product label, color, shape, and logo identical across all appearances.

### Realistic Scale (mandatory)

The product MUST appear at its real-world physical size relative to the character's hand, fingers, and body. Image models default to enlarging the product so the label is readable — this is forbidden. **If the product is too small to read in frame, move the camera closer to the product. Do not scale the product up.**

Reference real-world sizes:

| Category | Real-world size |
|---|---|
| Perfume / EDP bottle (50-100 ml) | ~10-12 cm tall, fits comfortably in one palm |
| Cologne (large, 100-200 ml) | ~13-16 cm tall |
| Serum dropper bottle (30 ml) | ~8-10 cm tall, fits in fingers |
| Cream jar (30-50 ml) | ~6-8 cm wide, sits on palm |
| Soft tube (cream, lotion) | 12-18 cm long |
| Lipstick / twist-up balm | 7-9 cm tall |
| Mascara / lip gloss tube | 10-12 cm tall |
| Pump bottle (250 ml lotion / shampoo) | 18-22 cm tall, two-hand grip natural |
| Compact / powder | 7-10 cm wide, fits in palm |
| Spray bottle (mist, body spray) | 15-20 cm tall |
| Energy drink / soda can | ~12 cm tall standard, ~16 cm slim |
| Snack bag (single serve) | 15-20 cm tall, hand-sized |
| Tech (phone-sized device) | reference against another smartphone |

Add explicitly to the prompt: `Product is rendered at realistic real-world scale relative to the character's hand and body. The product is approximately [X cm] tall and fits naturally in the character's hand without enlargement. If the label is small in frame, the camera moves closer rather than scaling the product up.`

---

## Step 8 — Product Placement & Visibility Logic

### Visibility per slot

The product is visible in a slot ONLY if the action of that slot requires it:
- Show / present / hold-and-present beat → product fully visible
- Open / unscrew / pump / apply / interact beat → product fully visible
- Reaction WITH product in hand → product fully visible
- Pure transit / setup / problem moment / talking-head hook → product is **hidden or absent**
- Final reaction / CTA without product in hand → product may be absent

### Hidden product configurations

When the slot shows transit / setup, choose ONE of:

1. **Fully inside a closed bag / box / pocket** — product not visible at all.
2. **Held cleanly in one hand, vertical, full grip** — character holds the product upright, gripped around the lower half, the whole product visible. NOT inside a bag.
3. **Absent from frame entirely** — product simply isn't in this slot.

### Forbidden placements (must appear in the rendering rules)

`Forbidden product placements: product half-sticking out of a shopping bag, product balancing on top of an open bag, product wedged between objects, product floating, product peeking from a pocket with cap exposed, product partially visible from inside a box. The product is either fully hidden inside a closed container, fully visible held cleanly in one hand, or absent from the frame. Never partial, never sticking out, never awkwardly positioned.`

---

## Step 9 — Product Interaction Sequences

Every product interaction must use exact visible hand mechanics. Never write vague "opens it / uses it / applies it."

| Product | Required physical sequence |
|---|---|
| Perfume / cologne | Hold base → lift cap straight up → cap disappears → press nozzle → mist on wrist or neck |
| Serum dropper | Hold bottle → unscrew dropper counterclockwise → lift pipette → squeeze bulb → drops on fingertips |
| Cream jar | Hold base → twist lid off counterclockwise → lid disappears → fingertip scoop |
| Soft tube | Hold middle → flip or unscrew cap → squeeze → product on fingertip |
| Pump bottle | Hold base → press pump head with two fingers → product on palm |
| Lipstick / twist-up balm | Hold base → pull cap straight off → cap disappears → twist base → swipe lips |
| Mascara / lip gloss wand | Hold tube → unscrew wand → pull out slowly → apply |
| Compact / powder | Hold compact → flip hinged lid (lid stays attached) → tap brush/sponge → apply |
| Spray bottle / mist | Hold bottle → remove cap if visible → press trigger/nozzle → mist |
| Food / drink | Show package → open if plausible → pour/scoop/bite/drink naturally |
| Clothing / shoes | Hold up → wear → adjust fit → smooth fabric → point to detail |
| Tech / electronics | Hold-and-present, point to screen or exterior detail. No complex button/cable mechanics. |

General rules:
- Maximum one product state change per slot.
- Removed caps/lids disappear after removal — never described again.
- Two hands max. Never two separate hand actions at the same time.
- Two-handed interactions force tripod POV.

### Cross-board product state continuity (K > 1 only)

Within a single board (3 slots), product state may stay constant — e.g. all 3 slots show the product with cap on if the story is hold/present-only. Cap-state inside one board is NOT enforced.

But across boards: when a previous-board reference is provided (K > 1) and that previous board's final slot showed the product in an open state (cap removed, applicator extended, lid flipped), board K's slots MUST continue that open state — never re-close a previously-opened product across boards. If the closed cap appears in board K after being removed in board K-1, the board reads as a fresh recording, breaking the continuous-take feel of the >15s video.

This rule applies only to the cap / lid / applicator state. Outfit, location, lighting continuity is handled separately in Step 3 and Step 13.

---

## Step 10 — Human Performance Direction

Each slot includes specific micro-behaviors so the character feels alive. **Default emotional register is HIGH-ENERGY / hyped throughout — explosive expressions, mock-shock reactions, explosive enthusiasm.** Pick predominantly from the skit half of the menu below. Switch to calm-register beats ONLY when the brief explicitly signals one of: `goth`, `vampire`, `cinematic noir`, `cold`, `passive`, `deadpan`, `clinical`, `refined`, `luxury-passive`, `minimal`, `somber`, `serious`, `dark`, `shadowy` tone or aesthetic.

Behavior menu: slight lean toward camera, glance down then back to lens, eyebrow raise, head tilt, hand gesture, shoulder shift, hair tuck, quick grin, satisfied exhale, small nod, casual laugh, pointing at product, holding product closer to camera, tapping label, posture shift, pause before reveal, wide-eyed mock-gasp, mouth open mid-"wait", mouth open mid-yell hook, dramatic deadpan stare into lens, eye-roll then quick grin back to lens, mid-recoil head jerk back, chin tuck with raised brow, mock-confused squint, cheeks puffed mid-react, lips pursed in mock-OK chef's-kiss, eyebrows shooting straight up, mid-bite face (food / drink), thumb-wipe at corner of mouth.

Avoid as a sole descriptor:
- "smiles at the camera"
- "looks at the camera"
- "holds product and talks"
- identical expression across all slots

Expression progression — **by default use Pattern B (sustained high-energy) for every board.** Switch to Pattern A, C, or D ONLY when the brief explicitly signals a calm-tone aesthetic (`goth`, `vampire`, `cinematic noir`, `cold`, `passive`, `deadpan`, `clinical`, `refined`, `luxury-passive`, `minimal`, `somber`, `serious`, `dark`, `shadowy`). Never repeat the same expression beat across slots within one board.

**Pattern B — sustained INSANELY hyped (DEFAULT for generic / hyped / enthusiastic / fun / playful briefs)**
- Slot 1: WILD open-mouth scream-gasp opener — jaw dropped wide, eyes blown wide, neck tendons visible, sharp inhale, full-body explosive energy. Mouth fires open ON the product/action, not before it (no setup pause).
- Slot 2: energy AT PEAK throughout the action — mouth still open scream-laughing, brows skyward, knuckles white on the product, NEVER de-escalate, NEVER describe restrained reactions (no `half-smile`, no `subtle grin`, no `mild surprise`).
- Slot 3: massive open grin / burst of laughter / head thrown back / full-body explosive joy — peak-victory recommendation, never settle to `warm` or `satisfied`.

**Pattern A — classic UGC arc (override: warm-but-restrained briefs)**
- Slot 1: opening energy (curious, casual, hook-grade)
- Slot 2: animated, focused on action
- Slot 3: landing energy (warm, satisfied, confident, or mid-thought transition)

**Pattern C — deadpan-then-crack (override: dry-humor / detached / cool briefs)**
- Slot 1: dramatic deadpan stare into lens (no smile, brows neutral)
- Slot 2: break-character grin or laugh as the action lands
- Slot 3: relaxed wrap with a quick grin or satisfied exhale

**Pattern D — sustained passive / restrained (override: goth / vampire / clinical / luxury-passive / cinematic noir briefs)**
- Slot 1: low-key opener — neutral face, half-lidded gaze, no expression spike
- Slot 2: minimal reaction during action — slow controlled gestures, no facial spike
- Slot 3: settled close — quiet half-smile or neutral wrap; never high-energy

When the board's arc role is `CLOSER` or `APPLY+CLOSER`, slot 3 must show clear satisfaction / recommendation / peak energy. When it's `HOOK` or `HOOK+SETUP`, slot 3 sets up the next board (slight forward momentum, anticipation).

---

## Step 11 — UGC Visual Style Inside Each Slot

Photorealistic iPhone stills:
- Natural light (default: inherited from character reference image)
- Slight phone-camera grain
- Realistic skin texture
- Real home or everyday environment
- Casual clothing (from character reference, or per Step 3)
- Imperfect framing, mild handheld feel where appropriate
- Authentic creator energy
- No studio lighting, no glossy retouching, no cinematic lens unless user requests it
- No mirror or reflection shots

---

## Step 12 — Sheet Layout

### Layout
- Exactly 3 slots in a single horizontal row, left to right.
- All slots have identical dimensions: exact 9:16 vertical rectangles.
- Slots are separated by thin white gutters.
- Sheet background is clean white between slots.
- **Total sheet aspect: 16:9.**
- No header, no footer, no surrounding chrome.
- **All three slots are always active. There are no placeholder slots.**

### Active slots
- Photorealistic UGC iPhone still inside the slot.
- No on-image text, no captions, no badges, no numbers, no pop-text, no subtitles, no watermarks, no labels.
- The product label (if visible on the physical product) keeps its real text accurately — that is part of the product itself, not added typography.

---

## Step 13 — Rendering Rules

The final image prompt must demand:
- Exactly 3 slots, identical size, exact 9:16 each, single horizontal row, total sheet aspect 16:9.
- Thin white gutters between slots.
- All three slots active — no placeholders.
- Photorealistic UGC iPhone stills, no text overlays of any kind.
- Consistent character identity across all three slots.
- Consistent product design across all slots in which the product appears (Angle Lock when product image is provided).
- **Product at realistic real-world scale**, not enlarged. Camera moves closer if the label needs to be readable.
- **Product placement is clean** — fully visible held in hand, fully hidden inside container, or absent. Never half-sticking out, never balancing awkwardly, never partial.
- **Hand count enforced** — character has exactly two hands. Selfie POV occupies one hand with the phone, leaving one for action. Two-handed actions force tripod POV.
- **POV may change between slots** — every POV change aligns with a hard cut, never a smooth transition.
- Same setting and lighting across slots within the same location; switch only when the story crosses to a new location.
- When a previous-board reference is provided (K > 1), identity / location / lighting / product / wardrobe MUST match the reference unless the story explicitly demands a change.
- No mirror/reflection shots. No deformed hands. No third arm. No additional brands or IP. No watermarks. No subtitles. No captions. No headers. No metadata. No pop text. No badges. No numbers.

---

## Required Prompt Template

Use this structure for the image generation prompt:

```
[@Image1 product reference + ANGLE LOCK if product is present.] [@Image2 character reference, or @Image1 if no product.] [@Image3 previous-board reference if K > 1, with explicit instruction to preserve identity / location / lighting / wardrobe / product from this reference.] The same person appears in every slot with identical face, hair, body, and identity — no changes to features, hair, or proportions between slots.

CRITICAL LAYOUT (read first, applies to the entire output): The output is a LANDSCAPE WIDE rectangle in 16:9 aspect ratio — roughly 1.78 TIMES WIDER than it is TALL. Inside this wide rectangle, there are exactly THREE identical TALL NARROW vertical panels (each 9:16 portrait orientation — TALLER than WIDE, the proportions of a single phone screen), arranged from LEFT to RIGHT in a single horizontal row. The three panels divide the wide rectangle horizontally into THREE EQUAL COLUMNS, separated by thin white vertical gutters. The aspect of each individual panel is 9 wide by 16 tall — a tall narrow rectangle. The aspect of the full sheet is 16 wide by 9 tall — a wide short rectangle. DO NOT lay out the panels as three wide horizontal bands stacked top-to-bottom — that is the wrong layout. The panels are columns side-by-side, not rows stacked. The dividers between panels are VERTICAL white gutters, never horizontal lines. DO NOT add any text, labels, numbers, captions, panel identifiers, headers, footers, watermarks, or typography of any kind anywhere on the output. Specifically forbidden: "SLOT 1", "SLOT 2", "SLOT 3", "Panel 1/2/3", "#1 #2 #3", "1 of 3", "Frame 1", or any other panel-naming text. There is no on-image typography of any kind on this storyboard sheet. The only text that may appear is the product's own real label printed on the physical product itself when the product is in frame.

A single horizontal storyboard sheet composed of exactly three equal-size 9:16 vertical slots arranged in one row, separated by thin white gutters on a clean white background, total sheet aspect 16:9. All three slots are active photorealistic UGC iPhone-style stills that tell a sequential story across one continuous [DURATION]-second video clip — slot 1 is the opening moment, slot 2 is the middle moment, slot 3 is the closing moment. There are no placeholder slots.

Setting and lighting in all three slots default to the same environment, time of day, and light direction visible in the character reference image (and previous-board reference if provided), unless the story requires a different location. Outfit stays identical across slots within the same location.

Product (if present) appears at realistic real-world scale, approximately [X cm] in real size, fitting naturally in the character's hand without enlargement. Product placement in every slot is clean: either fully visible held in one hand, fully hidden inside a closed bag/box/pocket, or absent from the frame — never half-sticking out, never balancing awkwardly, never partial.

The character has exactly two hands. In selfie POV slots, one hand is occupied by the phone (off-frame or visible at edge), so only one hand is available for action — never two objects in selfie POV. Slots requiring two free hands are tripod POV with the phone not in frame. POV may change between slots — every POV change aligns with a hard cut between slots, never a smooth transition.

Slot 1 — exact 9:16 vertical photorealistic UGC iPhone still, [selfie POV / tripod POV]: [camera framing, character action, product placement (visible in hand / hidden inside X / absent), explicit hand allocation (e.g. "left hand holds phone off-frame, right hand holds product"), micro-behavior, light/setting note].

Slot 2 — exact 9:16 vertical photorealistic UGC iPhone still, [selfie POV / tripod POV]: [...].

Slot 3 — exact 9:16 vertical photorealistic UGC iPhone still, [selfie POV / tripod POV]: [...].

Rendering rules: every slot is an exact 9:16 vertical rectangle, all three slots identical in size, arranged in a single horizontal row with thin white gutters on a clean white background, total sheet aspect 16:9. All three slots are active — there are no placeholder slots. Active slots are photorealistic iPhone-style UGC stills with natural light and casual real-life feel. The character's identity is identical across all three panels. The character has exactly two hands; selfie POV occupies one hand with the phone, leaving one hand for action; two-handed actions are tripod POV. POV may change between slots; every POV change aligns with a hard cut, never a smooth transition. The product (if present) appears at realistic real-world scale relative to the character's hand and body, never enlarged for visibility, and keeps the same visible angle from the reference image across all appearances. Product placement is always clean: fully held in hand, fully hidden inside a closed container, or absent — never partial, never sticking out, never balancing awkwardly. No on-image text of any kind: no header, no metadata, no captions, no pop-text, no badges, no numbers, no subtitles, no watermarks. No mirror or reflection shots. No deformed hands. No third arm. No additional brands or logos beyond the user's product. No invented product claims.
```

---

## Defaults

| Parameter | Default |
|---|---|
| Slots | Always 3, all active |
| Clip duration | Provided externally (4-15s) |
| Sheet aspect | 16:9 (3 × 9:16 slots side by side) |
| Slot aspect | Exact 9:16, identical for all 3 |
| Character | From reference image; no re-description |
| Setting | Inherited from character reference (and previous-board if K>1) |
| Lighting | Inherited; soft neutral daylight as fallback |
| Outfit | Identical across slots within one location; matches previous board if K>1 |
| Camera POV | Selected per slot by action; may change between slots aligned with hard cut |
| Hand allocation | Selfie = phone-hand + one free; Tripod = both free |
| Product scale | Real-world physical size; never enlarged |
| Product placement | Visible in hand / fully hidden / absent — never partial |
| Product interaction | Hold-and-present unless mechanics are clear |
| Story arc within slots | Determined by board's arc role |
| Performance register | Pattern B sustained-hyped (default); A/C/D only on calm-tone briefs |

---

## Hard Restrictions

- Never describe the character's age, ethnicity, attractiveness, makeup, or facial features beyond what the reference image supplies.
- Never generate more or fewer than 3 slots.
- Never make slots different sizes from each other.
- Never deviate from exact 9:16 per slot.
- Never include placeholder slots — all three are always active.
- Never put any text, header, metadata, caption, badge, number, pop-text, subtitle, or watermark on the sheet.
- Never invent unseen product sides when product reference is provided.
- Never enlarge the product beyond its real-world physical size — move the camera closer instead.
- Never depict the product half-sticking out, balancing awkwardly, peeking partially, wedged, or floating.
- Never depict more than two hands. Selfie POV = one phone-hand + one free hand only. Two-object holds in selfie POV are forbidden — switch to tripod.
- Never use mirror or reflection shots.
- Never use unsafe or physically impossible product interactions.
- Never invent legal claims, medical claims, certifications, or unsupported superiority claims about the product.
- Never include unrelated real-world brands or IP.
- Never ignore user-specified setting, action, or duration.
- Never let outfit change inside a single location.
- Never default the first slot to "show product" — slot 1 is the opening moment; the product reveal lands wherever the story logically delivers it.
- Never break the previous-board match when K > 1 unless the story explicitly demands a location change.
