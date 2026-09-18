# UGC Unboxing Board Prompt Guide

Use this when composing the `prompt` for `generate_image` to produce a 21:9 four-slot UGC unboxing storyboard sheet for ONE Seedance video clip.

The output of this composition is a single prose prompt string (no JSON wrapper, no markdown fences). The orchestrator skill passes that string as `generate_image(prompt=...)` with `aspect_ratio="21:9"`, `resolution="1K"`, and `image_urls` in the order specified below — so `@Image1`, `@Image2`, ... in your prompt text bind directly to those resolved URLs.

CORE PRINCIPLE: The sheet is a sequential UGC unboxing storyboard for ONE 15-second-or-shorter video clip — four frames showing four narrative moments inside that single clip. NOT a presentation deck. No headers, no metadata blocks, no pop-text captions, no badges, no numbers, no brand-matched design system, no typography of any kind. Just four equal-size 9:16 slots in one row, each containing a photorealistic UGC iPhone-style still that advances a coherent story. Slots are separated by thin white gutters. **All four slots are always active — there are no placeholders.** **The four slots follow a fixed unboxing arc: PACKED → REVEAL → PRODUCT-FOCUS → SATISFACTION** (Board 1 always carries this arc; Boards 2..N continue the story post-reveal).

The character is supplied via reference image — never generate or describe their face, body, age, or appearance. Reference them only as "the same person from the character reference image, with identical face, hair, body, and identity across all four slots."

The product (when supplied) follows strict Angle Lock, Realistic Scale, and Placement Logic rules.

Story matters. Setting matters. Camera POV adapts to the action in each slot and **may change between slots — every POV change aligns with a hard cut between slots, never a smooth transition.** Hand count is enforced.

---

## CRITICAL LAYOUT GUARD (gpt-image-2 — include verbatim in every composed prompt)

This guard fixes two known failure modes specific to gpt-image-2 (the model the skill uses for board generation):

1. **gpt-image-2 misreads "four 9:16 slots in a 21:9 sheet" as "four wide horizontal bands stacked top-to-bottom"** — producing a vertical stack of full-width strips instead of four side-by-side columns.
2. **gpt-image-2 has a strong "label the panels" prior** that auto-adds forbidden "SLOT 1 / SLOT 2 / SLOT 3 / SLOT 4" typography (and sometimes numbers, captions, or "Panel X" tags) directly onto the rendered output, overriding any vague "no text" instruction.

To counter both, the composed prompt MUST include the following block verbatim, placed near the top of the prompt (right after the `@ImageN` reference lines and before the per-slot descriptions). Do NOT summarize, paraphrase, or shorten it — the explicit redundancy is load-bearing:

```
CRITICAL LAYOUT (read first, applies to the entire output): The output is a LANDSCAPE WIDE strip in 21:9 aspect ratio — roughly 2.33 TIMES WIDER than it is TALL. Inside this wide strip, there are exactly FOUR identical TALL NARROW vertical panels (each 9:16 portrait orientation — TALLER than WIDE, the proportions of a single phone screen), arranged from LEFT to RIGHT in a single horizontal row. The four panels divide the wide strip horizontally into FOUR EQUAL COLUMNS, separated by thin white vertical gutters. The aspect of each individual panel is 9 wide by 16 tall — a tall narrow rectangle. The aspect of the full sheet is 21 wide by 9 tall — a wide short strip.

DO NOT lay out the panels as four wide horizontal bands stacked top-to-bottom — that is the wrong layout. The panels are columns side-by-side, not rows stacked. The dividers between panels are VERTICAL white gutters, never horizontal lines.

DO NOT add any text, labels, numbers, captions, panel identifiers, headers, footers, watermarks, or typography of any kind anywhere on the output. Specifically forbidden: "SLOT 1", "SLOT 2", "SLOT 3", "SLOT 4", "Panel 1/2/3/4", "#1 #2 #3 #4", "1 of 4", "Frame 1", or any other panel-naming text. There is no on-image typography of any kind on this storyboard sheet. The only text that may appear is the product's own real label printed on the physical product itself when the product is in frame.
```

This block is the single most important rendering directive for gpt-image-2. Include it verbatim near the top of every composed prompt for every board (K=1 and K>1).

---

## Inputs (provided in the skill dispatch)

1. **Character/creator image** — REQUIRED. Always provided. Recurring identity reference. Never re-described.
2. **Product image(s)** — OPTIONAL. Used for product reference + Angle Lock when present.
3. **Package/box image** — OPTIONAL. If the user supplies a real package photo, it is used in Slot 1 (PACKED) as the actual package the character is unboxing. Without it, the board generates a generic plain brown taped delivery box.
4. **Previous-board image** — OPTIONAL. Provided when this board is K>1 in a multi-board sequence. Used to preserve identity, location, lighting, product, and wardrobe across boards.
5. **Product description** — OPTIONAL. Source of truth for product name, category, mechanics, claims.
6. **Text request** — what the user wants the story to be.
7. **Arc role** — for Board 1 of unboxing: `BOARD_1_CANONICAL_UNBOXING` (slots PACKED → REVEAL → PRODUCT-FOCUS → SATISFACTION). For Boards 2..N: `BOARD_K_POST_REVEAL` (post-unboxing exploration / use / settle, conditioned on previous board's final slot).
8. **Clip duration** — 4 to 15 seconds. The single Seedance clip this board produces.
9. **Board index K and total boards N** — context for chaining ("Board 2 of 3").

---

## Image Reference Order

Standard order (the orchestrator's `image_urls` array must match this — `@Image1` is the first element, `@Image2` the second, etc.):

| References provided | Order |
|---|---|
| Product + character + package + previous board (K>1) | `@Image1` = product, `@Image2` = character, `@Image3` = package, `@Image4` = previous board |
| Product + character + package (K=1) | `@Image1` = product, `@Image2` = character, `@Image3` = package |
| Product + character + previous board (K>1, no package) | `@Image1` = product, `@Image2` = character, `@Image3` = previous board |
| Product + character (K=1, no package) | `@Image1` = product, `@Image2` = character |
| Character + previous board (no product, no package) | `@Image1` = character, `@Image2` = previous board |
| Character only | `@Image1` = character |

The prompt MUST start with explicit `@ImageN` references in this order. When the package is provided as `@Image3` (or wherever it lands per the table), Slot 1 (PACKED) MUST depict THAT exact package — same shape, same closure, same any-visible-printing. Do not substitute a generic delivery box when a real package reference is supplied.

---

## Input Tiers

Classify the user request:

| Tier | Trigger | Behavior |
|------|---------|----------|
| Auto | 1-5 words, no scenario, only product name, "make video", or empty | Full autopilot: build a default UGC mini-arc for the assigned arc role. |
| Guided | 1-3 sentences with general idea, tone, mood, or rough flow | Preserve user's tone/emphasis/mood. Build slot structure yourself. |
| Director | 4+ sentences with specific scenario, dialogue intent, shot list, location sequence, or props | Map user's beats 1:1 onto the 4 slots in their order. Adapt only physically unsafe interactions. |

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
- Default: identical outfit across all four slots, matching the character reference image.
- Outfit may change ONLY if the story explicitly transitions to a new context (rare in a single 15s clip; more common across boards).
- When a previous-board reference is present (K > 1), wardrobe defaults to matching the previous board exactly.

Never describe the character's age, ethnicity, attractiveness, makeup, or features beyond what the reference image already supplies.

---

## Step 3 — Setting and Lighting Logic

Default: inherit setting and lighting from the character reference image. Reference in the prompt:

`Setting and lighting in all four slots default to the same environment, time of day, and light direction visible in the character reference image, unless the story requires a different location.`

When K > 1 and a previous-board reference is provided: the setting and lighting MUST match the previous board exactly (same room, same light direction, same time of day) UNLESS the story explicitly transitions to a new location.

Product-driven setting matching when reference is unusable:
- Cosmetics / makeup / fragrance → bathroom or bedroom by tier
- Skincare / haircare / body care → bathroom by tier
- Food / beverages / kitchen products → kitchen
- Protein / supplements / sports nutrition → home gym or kitchen
- Clothing / accessories / jewelry → bedroom or dressing room
- Fitness gear → home gym or yoga corner
- Cars → driveway / sunlit street / garage
- Outdoor gear / sunglasses / sunscreen → cafe terrace, park, sunlit street
- Tech / electronics → home desk, living room, studio nook
- Home / decor → living room or bedroom

Lighting fallback: soft neutral daylight from a clear directional source (left or right window). Never golden hour or warm sunset unless user explicitly asks. Never harsh studio strobes.

---

## Step 4 — Canonical Unboxing Arc Across the 4 Slots

Every unboxing board carries a canonical 4-slot arc. **Board 1** always follows this sequence:

| Slot | Role | Required content |
|---|---|---|
| 1 | PACKED | Character with the sealed delivery box in front of them. Box is closed, taped, untouched. Character's expression: anticipation / curiosity / mild excitement. The product is NOT visible yet. |
| 2 | REVEAL | Product is just out of the box, held by the character or placed next to them. The (now-empty/discarded) box may be at the frame edge or already gone. Character's expression: peak surprise / genuine reaction / wide-eyed delight. |
| 3 | PRODUCT-FOCUS | The product is the subject of the frame — held up close to lens, on the character's palms, or extended toward camera. Character may be partially visible (hands, partial face) or absent from frame. Product is the hero of this slot. |
| 4 | SATISFACTION | Character with the product, settled into ownership — confident pose, warm grin, product in hand or beside them. Reaction has cooled from peak surprise (Slot 2) into steady satisfaction. |

For multi-board (K > 1) videos, Board 1 carries the canonical arc above. Boards 2..N continue the story past the reveal — exploring / using / demonstrating the product through 4 slots each, conditioned on the previous board's final slot. Boards 2..N slot-arc specifics are not strictly fixed in this iteration — use general 4-slot dramaturgy + previous-board continuity.

### User Override Rule

If the user provides Director-tier beats (4+ sentences with specific scenario / shot list), map their beats 1:1 onto the 4 slots in their order — Director input overrides the canonical arc above.

### First slot IS the sealed package

Unlike talking-head UGC, **Slot 1 of an unboxing board MUST always show the sealed delivery box** — character with the closed package in front of them, product NOT visible. This is a hard rule for Board 1: the unboxing story begins with anticipation of opening, and skipping the sealed-box moment breaks the entire arc.

If the user provides a real package image (per Image Reference Order), Slot 1 must depict THAT exact package — same shape, same closure. Otherwise, Slot 1 generates a generic plain brown taped delivery box (no logos, no branding, slightly larger than the product to look delivery-realistic).

The product reveal lands in Slot 2 (REVEAL), not Slot 1. Never default Slot 1 to "show product alone" — that's a Slot 3 (PRODUCT-FOCUS) beat for unboxing, not Slot 1.

---

## Step 4.5 — Slot Action Diversity (mandatory)

The 4 slots MUST show four DIFFERENT physical actions, not four variations of the same pose. Same hand-product configuration in all four slots = the storyboard reads as one frozen moment, not a story. Same pose with micro-variation (smile angle, head tilt) does NOT count as a different action.

### Default action per slot (Board 1 canonical unboxing arc)

| Slot | Action |
|---|---|
| 1 (PACKED) | Character seated/standing with sealed box in front of them on a flat surface — hands on box (resting, anticipating, fingers grazing edge), or hovering above ready to open. Box is sealed. Product NOT visible. Character is NOT lifting the box in the air. |
| 2 (REVEAL) | Product just emerged from box — character holds it in both hands (or one if light per Weight & Grip Logic) lifted from box level toward chest/face, eyes wide on product. The box is at frame edge or already faded. |
| 3 (PRODUCT-FOCUS) | Product extended toward camera — character holds product up to lens, framing tight on product itself. Character's hands and partial face may be visible; product dominates. Box is GONE from frame. |
| 4 (SATISFACTION) | Character settled into ownership pose — standing/sitting confidently with product, slight grin, posture relaxed and proud. Product visible in hand or beside character. Box is GONE from frame. |

For Boards 2..N (multi-board >15s): the canonical arc above applies to Board 1 only. Boards 2..N continue post-reveal exploration with their own 4-slot mini-arcs, conditioned on the previous board's final slot. Specific Board 2..N slot logic is not strictly enforced in this iteration.

### Default POV cadence (Board 1)

`TRIPOD → TRIPOD → TRIPOD-CLOSE → SELFIE`

| Slot | POV | Why |
|---|---|---|
| 1 PACKED | TRIPOD | Both hands free for box; locked frame to show "delivery has arrived" calmly |
| 2 REVEAL | TRIPOD | Both hands free for product (typically two-handed lift on REVEAL per Weight & Grip Logic) |
| 3 PRODUCT-FOCUS | TRIPOD close-up | Product centered, no creator phone in frame |
| 4 SATISFACTION | SELFIE | Intimate ending, character close to lens, ownership beat |

If user-Director input or product weight requires a different cadence (e.g., a tiny single-bottle product → SELFIE PACKED is acceptable), apply the override but never alternate POV more than necessary.

### Camera Distance Variation (mandatory)

Each of the 4 slots MUST use a DIFFERENT camera distance/framing. Default cadence for Board 1:

| Slot | Distance |
|---|---|
| 1 PACKED | MEDIUM tripod — character + sealed box framed waist-up, room context visible |
| 2 REVEAL | MEDIUM CLOSE-UP — character with product just out of box, chest-up framing, peak reaction face |
| 3 PRODUCT-FOCUS | MACRO or TIGHT CLOSE-UP on product — product fills the frame, character's hands and partial face only |
| 4 SATISFACTION | THREE-QUARTER or FULL-BODY WIDE — character with product, settled pose, room visible, outfit visible |

The slot description MUST explicitly state the framing distance — `TIGHT CLOSE-UP`, `MEDIUM CLOSE-UP`, `MEDIUM`, `MEDIUM-WIDE`, `MACRO`, `THREE-QUARTER`, `WAIST-UP`, `FULL-BODY WIDE`, or `PRODUCT-EXTENDED` — so the image model receives an unambiguous framing signal. Distance change between slots aligns with the hard cut between them.

### Distance band rule (mandatory)

The 4 slot framings MUST span at least **one TIGHT band** (TIGHT CLOSE-UP / MACRO), at least **one MID band** (MEDIUM CLOSE-UP / MEDIUM), and at least **one WIDE band** (THREE-QUARTER / WAIST-UP / FULL-BODY WIDE / PRODUCT-EXTENDED). If all 4 slots fall within the same band — e.g., all medium close-ups, all chest-up — REWRITE. The viewer must physically perceive the camera at four distinct distances. The wide slot (typically Slot 4 SATISFACTION) is what gives the board breathing room and shows the creator's outfit + environment.

### Hard validation rules

- All 4 slots MUST show 4 DIFFERENT physical actions per the default per-slot action table (or user-specified Director override).
- Same hand holding the same object across all 4 slots = REWRITE.
- All 4 slots MUST use 4 DIFFERENT camera distances/framings.
- **Slot 1 MUST show the sealed box** (product NOT visible). **Slot 4 MUST show the satisfied character holding/owning the product** (box GONE).
- Every POV / distance change between slots aligns with a hard cut (per Step 5).

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
- **Paired / set products (dumbbells, kettlebells, gloves, sneakers, earrings sold as pair):** in SELFIE POV only ONE half of the pair can be held by the free hand. The other half is set down on the surface beside the character, off-frame, or absent — NEVER both halves visibly held simultaneously in selfie. Showing both = 3-hand contradiction (phone + product1 + product2). If both halves must be visible together, switch to TRIPOD POV.

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

### Weight & Grip Logic (mandatory — for unboxing)

Before depicting the character holding/lifting the product (especially in Slot 2 REVEAL when the product just emerges from the box), classify by weight and size:

| Class | Examples | Hand allocation | Facial expression |
|---|---|---|---|
| Heavy | Appliance, bottle >=1L, toolbox-class | BOTH hands required, character leans forward to lift | Visible strain — jaw set, slight brow furrow, controlled exhale |
| Bulky but light | Oversized box, large pillow, big plush, tall but empty container | BOTH hands required for stability | NO strain — relaxed face, easy grip |
| Light | Cosmetics, phone, small bottle, jewelry case | ONE hand, relaxed grip | Neutral / pleased, no strain |
| Tiny | Single earring, pill, contact lens, small chip | Pinched between thumb and index finger, held close to lens | Focused / curious, no strain |

Single-handed lifting of heavy items is FORBIDDEN — produces unrealistic, AI-tell renders. Two-handed strain on light items is also FORBIDDEN — produces over-acted, fake renders. Always classify before writing the slot description; if the class is ambiguous, default to the heavier class (safer for realism).

**Paired or set products (dumbbells, kettlebells set, hand weights pair, gloves pair, earrings sold as pair):** never stack or balance both halves on a single palm or hand. Natural display options for paired products in PRODUCT-FOCUS / SATISFACTION slots:
- **(a) One in each hand at chest level** — works for light or moderate weight (single-hand grip per item)
- **(b) One held up in display position, the other set down** on the surface beside character — works for heavy items (heavy items can't be held one-per-hand at chest level long enough)
- **(c) Both visible side-by-side on a flat surface** with character's hand near or touching them but not balancing — works for any weight

**NEVER both halves balanced on one palm** — that's a guaranteed AI-tell render. For SELFIE POV slots (typically Slot 4 SATISFACTION), only ONE half of a pair can be in the free hand at a time per the Hand Allocation Rule; the other half is set down off-frame or beside the character.

---

## Step 7b — Box Logic (mandatory for unboxing)

The unboxing centers on a delivery package. Two cases:

### Case 1: User provided a real package image

The package image is `@Image3` (or wherever per the Image Reference Order table). Slot 1 (PACKED) MUST depict THIS exact package — same shape, same closure, same any-visible-printing. Subsequent slots: same disappearance rules apply (see Box Behavior Across Slots below).

### Case 2: No package image provided

Default: a plain brown cardboard delivery box, sealed with packing tape, no logos, no branding, no labels, no shipping stickers visible (or generic blurred ones). Box should be slightly larger than the product (delivery-realistic — not gift-wrap, not shrink-wrapped). Never white gift box, never branded retail box.

### Surface Placement (by product size)

The box rests on a surface in Slot 1 — choose by product size:

| Product size | Surface |
|---|---|
| Tiny / small (cosmetics, phone, jewelry, accessories, lipstick, supplements) | TABLE only — never floor |
| Medium (shoe box, small electronics, mid-size parcel <= monitor-size) | TABLE preferred (default) |
| Large (large parcel, big appliance <= ~50 cm) | TABLE or floor (table for indoor, floor if too large for table) |
| Oversized (bicycle, furniture, large appliance > ~50 cm) | FLOOR only — character kneels or stands beside |

Default to TABLE unless the product is clearly too large for it. Tiny / small products (cosmetics, jewelry, small electronics) must NEVER be unboxed on the floor — that reads as makeshift / unprofessional. Floor unboxing is reserved for genuinely large items (bicycle, furniture, appliance).

### Surface Aesthetic / Style

The table or surface in Slot 1 must match the room aesthetic visible in the character reference image — and default to a premium / clean look. The unboxing reads as a "moment in someone's styled home", not a workbench scene.

Match by room:
- **Living room** → marble / light wood coffee table, sideboard, or styled console (white lacquer, oak, ash)
- **Bedroom** → vanity / bedside / dresser top — light wood, white lacquer, or mirrored finish
- **Kitchen** → marble / quartz counter, kitchen island, white-tile counter
- **Bathroom** → marble / stone vanity counter
- **Hallway / entry** → console table (white lacquer, marble, light wood)
- **Default if room ambiguous** → light wood, white lacquer, or marble — premium, clean, minimal

**Forbidden surfaces:**
- Workshop / workbench / utility table (dark scratched wood, visible tool marks, deep gouges)
- Industrial / garage / mechanic-style surfaces (metal grates, oil-stained surfaces, raw concrete)
- Plastic folding table, camping table, makeshift surfaces
- Surfaces with visible tools, screws, hardware, mechanic equipment around them
- Heavily-distressed dark masculine wood that reads as "garage" or "barn"
- Cluttered surfaces with unrelated objects (mail, papers, tools, food)

The surface should look like it belongs in a styled home — neutral / light tones, clean lines, no clutter. If the floor is used (oversized products only, per Surface Placement), the floor should be hardwood / parquet / light tile / clean rug — never garage concrete, industrial flooring, or unfinished surfaces.

### Packing Paper Inside the Box

The interior of the delivery box should contain packing / tissue paper color-matched to the product. This adds realism and a premium "delivery experience" feel — empty boxes read as AI-fake / unfinished.

Visibility per slot:
- Slot 1 (PACKED): box is sealed → paper NOT visible (it's inside the closed box).
- Slot 2 (REVEAL): box is open → color-matched packing / tissue paper peeks out from the opened flaps, product nestled in or being lifted from the paper. Paper is **atmospheric backdrop only** — never the focal subject.
- Slot 3 (PRODUCT-FOCUS): box GONE → paper not visible.
- Slot 4 (SATISFACTION): box GONE → paper not visible.

Color matching guide:
- Pink / red / rose product → soft pink, rose, or blush tissue
- Blue / aqua product → light blue / sky / aqua tissue
- Black / dark product → cream, beige, or warm grey tissue (contrast for premium look)
- White / light / pastel product → soft pastel tissue (lavender, peach, mint)
- Multicolor / brand-led → dominant brand color tissue
- Default if uncertain → cream or beige (universal premium tone)

The paper is rendered as crumpled / loosely folded tissue inside the box — never flat, never gift-wrapped around the product. Mentioned in the prompt only as "color-matched packing / tissue paper inside the open box" — no further detail.

### Box Behavior Across Slots

- **Slot 1 (PACKED):** Box is sealed, taped, closed. Box is the focal element. Product is NOT visible.
- **Slot 2 (REVEAL):** Box may be partially visible at the frame edge (open flaps, just-emptied) OR already gone. Product is the new focal element.
- **Slot 3 (PRODUCT-FOCUS):** Box is GONE from the frame. Product is the hero.
- **Slot 4 (SATISFACTION):** Box is GONE from the frame. Character + product only.

### Box Forbidden States

- Never describe the character holding the box in the air, lifting it, carrying it, or moving it.
- The box rests on a flat surface (table, floor, lap) in Slot 1.
- After Slot 2, never re-introduce the box.
- Never describe the box being closed back, re-taped, or returning.
- Never depict multiple boxes — exactly one delivery box per Slot 1.

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

Within a single board (4 slots), product state may stay constant — e.g. all 4 slots show the product with cap on if the story is hold/present-only. Cap-state inside one board is NOT enforced.

But across boards: when a previous-board reference is provided (K > 1) and that previous board's final slot showed the product in an open state (cap removed, applicator extended, lid flipped), board K's slots MUST continue that open state — never re-close a previously-opened product across boards. If the closed cap appears in board K after being removed in board K-1, the board reads as a fresh recording, breaking the continuous-take feel of the >15s video.

This rule applies only to the cap / lid / applicator state. Outfit, location, lighting continuity is handled separately in Step 3 and Step 13.

---

## Step 10 — Human Performance Direction

Each slot includes specific micro-behaviors so the character feels alive:
- slight lean toward camera, glance down then back to lens, eyebrow raise, head tilt, hand gesture, shoulder shift, hair tuck, quick grin, satisfied exhale, small nod, casual laugh, pointing at product, holding product closer to camera, tapping label, posture shift, pause before reveal.

Avoid as a sole descriptor:
- "smiles at the camera"
- "looks at the camera"
- "holds product and talks"
- identical expression across all slots

Expression progression across the 4 slots (Board 1 canonical unboxing arc):
- Slot 1 (PACKED) — anticipation / curiosity / mild excitement; eyes on the box, fingers grazing edge or hovering above ready to open
- Slot 2 (REVEAL) — peak surprise / wide-eyed delight; eyes wide on the just-emerged product, mouth slightly parted, eyebrows raised
- Slot 3 (PRODUCT-FOCUS) — focused admiration / inspection; brows softened, lips parted in study, attention locked on product detail
- Slot 4 (SATISFACTION) — settled satisfaction / warm grin / ownership; relaxed shoulders, content half-smile, posture proud

The expression arc moves from anticipation → peak reaction → contained admiration → contented settle. Identical expression across slots = REWRITE. For Boards 2..N (post-unboxing exploration), Slot 1 picks up where Board K-1's Slot 4 left off and continues evolving across the 4 slots.

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
- Exactly 4 slots in a single horizontal row, left to right.
- All slots have identical dimensions: exact 9:16 vertical rectangles.
- Slots are separated by thin white gutters.
- Sheet background is clean white between slots.
- **Total sheet aspect: 21:9.**
- No header, no footer, no surrounding chrome.
- **All four slots are always active. There are no placeholder slots.**

### Active slots
- Photorealistic UGC iPhone still inside the slot.
- No on-image text, no captions, no badges, no numbers, no pop-text, no subtitles, no watermarks, no labels.
- The product label (if visible on the physical product) keeps its real text accurately — that is part of the product itself, not added typography.

---

## Step 13 — Rendering Rules

The final image prompt must demand:
- Exactly 4 slots, identical size, exact 9:16 each, single horizontal row, total sheet aspect 21:9.
- Thin white gutters between slots.
- All four slots active — no placeholders.
- Photorealistic UGC iPhone stills, no text overlays of any kind.
- Consistent character identity across all four slots.
- Consistent product design across all slots in which the product appears (Angle Lock when product image is provided).
- **Product at realistic real-world scale**, not enlarged. Camera moves closer if the label needs to be readable.
- **Product placement is clean** — fully visible held in hand, fully hidden inside container, or absent. Never half-sticking out, never balancing awkwardly, never partial.
- **Hand count enforced** — character has exactly two hands. Selfie POV occupies one hand with the phone, leaving one for action. Two-handed actions force tripod POV.
- **POV may change between slots** — every POV change aligns with a hard cut, never a smooth transition.
- Same setting and lighting across slots within the same location; switch only when the story crosses to a new location.
- When a previous-board reference is provided (K > 1), identity / location / lighting / product / wardrobe MUST match the reference unless the story explicitly demands a change.
- No mirror/reflection shots. No deformed hands. No third arm. No additional brands or IP. No watermarks. No subtitles. No captions. No headers. No metadata. No pop text. No badges. No numbers.

---

## Prompt Template

Use this structure as the `prompt` value you pass to `generate_image` (no JSON wrapper, no markdown fences — pure prose):

```
[@Image1 product reference + ANGLE LOCK if product is present.] [@Image2 character reference, or @Image1 if no product.] [@Image3 previous-board reference if K > 1, with explicit instruction to preserve identity / location / lighting / wardrobe / product from this reference.] The same person appears in every slot with identical face, hair, body, and identity — no changes to features, hair, or proportions between slots.

A single horizontal storyboard sheet composed of exactly four equal-size 9:16 vertical slots arranged in one row, separated by thin white gutters on a clean white background, total sheet aspect 21:9. All four slots are active photorealistic UGC iPhone-style stills that tell the unboxing story across one continuous [DURATION]-second video clip — slot 1 is PACKED (sealed delivery box, product NOT visible), slot 2 is REVEAL (product just emerged from box, peak surprise reaction), slot 3 is PRODUCT-FOCUS (product as hero of the frame, box GONE), slot 4 is SATISFACTION (character settled with product, box GONE). There are no placeholder slots.

Setting and lighting in all four slots default to the same environment, time of day, and light direction visible in the character reference image (and previous-board reference if provided), unless the story requires a different location. Outfit stays identical across slots within the same location.

Product (if present) appears at realistic real-world scale, approximately [X cm] in real size, fitting naturally in the character's hand without enlargement. Product placement in every slot is clean: either fully visible held in one hand, fully hidden inside a closed bag/box/pocket, or absent from the frame — never half-sticking out, never balancing awkwardly, never partial.

The character has exactly two hands. In selfie POV slots, one hand is occupied by the phone (off-frame or visible at edge), so only one hand is available for action — never two objects in selfie POV. Slots requiring two free hands are tripod POV with the phone not in frame. POV may change between slots — every POV change aligns with a hard cut between slots, never a smooth transition.

Slot 1 — exact 9:16 vertical photorealistic UGC iPhone still, [selfie POV / tripod POV] (PACKED): [camera framing, character with sealed delivery box on a flat surface in front of them, hands on box / hovering above ready to open, product NOT visible, explicit hand allocation, anticipation/curiosity expression, light/setting note].

Slot 2 — exact 9:16 vertical photorealistic UGC iPhone still, [selfie POV / tripod POV] (REVEAL): [camera framing, product just emerged from box, character holding it (one or two hands per Weight & Grip Logic), eyes wide on the product, peak surprise expression, the box may be at frame edge (just-emptied) or already gone].

Slot 3 — exact 9:16 vertical photorealistic UGC iPhone still, [selfie POV / tripod POV] (PRODUCT-FOCUS): [camera framing tight on product, product extended toward lens or held up close, box GONE from frame, character partially visible (hands, partial face) at most, focused admiration expression].

Slot 4 — exact 9:16 vertical photorealistic UGC iPhone still, [selfie POV / tripod POV] (SATISFACTION): [camera framing wider, character settled with product, confident pose, warm grin, box GONE from frame, room context visible, ownership beat].

Rendering rules: every slot is an exact 9:16 vertical rectangle, all four slots identical in size, arranged in a single horizontal row with thin white gutters on a clean white background, total sheet aspect 21:9. All four slots are active — there are no placeholder slots. Active slots are photorealistic iPhone-style UGC stills with natural light and casual real-life feel. The character's identity is identical across all four panels. The character has exactly two hands; selfie POV occupies one hand with the phone, leaving one hand for action; two-handed actions are tripod POV. POV may change between slots; every POV change aligns with a hard cut, never a smooth transition. The product (if present) appears at realistic real-world scale relative to the character's hand and body, never enlarged for visibility, and keeps the same visible angle from the reference image across all appearances. Product placement is always clean: fully held in hand, fully hidden inside a closed container, or absent — never partial, never sticking out, never balancing awkwardly. No on-image text of any kind: no header, no metadata, no captions, no pop-text, no badges, no numbers, no subtitles, no watermarks. No mirror or reflection shots. No deformed hands. No third arm. No additional brands or logos beyond the user's product. No invented product claims.
```

---

## Defaults

| Parameter | Default |
|---|---|
| Slots | Always 4, all active |
| Clip duration | Provided externally (4-15s) |
| Sheet aspect | 21:9 (4 x 9:16 slots side by side) |
| Slot aspect | Exact 9:16, identical for all 4 |
| Character | From reference image; no re-description |
| Setting | Inherited from character reference (and previous-board if K>1) |
| Lighting | Inherited; soft neutral daylight as fallback |
| Outfit | Identical across slots within one location; matches previous board if K>1 |
| Camera POV | Selected per slot by action; may change between slots aligned with hard cut |
| Hand allocation | Selfie = phone-hand + one free; Tripod = both free |
| Product scale | Real-world physical size; never enlarged |
| Product placement | Visible in hand / fully hidden / absent — never partial |
| Product interaction | Hold-and-present unless mechanics are clear |
| Story arc within slots | Board 1: canonical PACKED → REVEAL → PRODUCT-FOCUS → SATISFACTION; Boards 2..N: post-reveal exploration |

---

## Hard Restrictions

- Never describe the character's age, ethnicity, attractiveness, makeup, or facial features beyond what the reference image supplies.
- Never generate more or fewer than 4 slots.
- Never make slots different sizes from each other.
- Never deviate from exact 9:16 per slot.
- Never include placeholder slots — all four are always active.
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
- **Slot 1 of Board 1 MUST always show the sealed delivery box** (product NOT visible). The product reveal lands in Slot 2 (REVEAL); never default Slot 1 to "show product alone" — that's a Slot 3 (PRODUCT-FOCUS) beat for unboxing.
- Never depict the character holding the sealed box in the air, lifting it, or carrying it — the box rests on a flat surface in Slot 1.
- Never re-introduce the box after Slot 2 — once the product is revealed, the box ceases to exist in Slots 3 and 4.
- Never depict heavy products lifted single-handedly — heavy items require BOTH hands AND visible facial strain (per Weight & Grip Logic). Never depict two-handed strain on light items either.
- **Never balance heavy items (dumbbells, weights, tools, kettlebells) or paired products on a single palm** — heavy and paired items require natural gripping mechanics per Weight & Grip Logic (one-per-hand, or one-displayed-other-set-down, or side-by-side on surface). Stacking dumbbells on a single hand = guaranteed AI-tell render.
- Never break the previous-board match when K > 1 unless the story explicitly demands a location change.
