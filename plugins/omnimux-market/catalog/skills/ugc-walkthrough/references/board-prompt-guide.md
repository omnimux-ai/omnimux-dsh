# UGC Tutorial Board Prompt Guide

Use this when composing the `prompt` for `generate_image` to produce a 21:9 four-slot UGC tutorial storyboard sheet for ONE Seedance video clip. **Each slot depicts ONE chronological physical step of using the product AND carries a rendered `"Step N — Heading"` text caption baked into the slot using consistent typography across all 4 slots of one board.**

The output of this composition is a single prose prompt string (no JSON wrapper, no markdown fences). The orchestrator skill passes that string as `generate_image(prompt=...)` with `aspect_ratio="21:9"`, `resolution="1K"`, `model="gpt-image-2"`, and `image_urls` in the order specified below — so `@Image1`, `@Image2`, ... in your prompt text bind directly to those resolved URLs.

CORE PRINCIPLE: The sheet is a sequential UGC tutorial storyboard for ONE 15-second-or-shorter video clip — four product-usage steps inside that single clip. NOT a presentation deck. **Allowed text on each slot: exactly ONE caption in the format `"Step N — Heading"`, rendered with identical typography (font family, size, color, position) across all four slots of one board.** No other text of any kind. Just four equal-size 9:16 slots in one row, each containing a photorealistic UGC iPhone-style still + the Step caption that advances a coherent tutorial. Slots are separated by thin white gutters. **All four slots are always active — there are no placeholders.** **The four slots follow a tutorial step arc — Step `(4·(K−1)+1)` through Step `(4·K)` of a real product-usage sequence, in chronological order.**

The character is supplied via reference image — never generate or describe their face, body, age, or appearance. Reference them only as "the same person from the character reference image, with identical face, hair, body, and identity across all four slots."

The product (when supplied) follows strict Angle Lock, Realistic Scale, and Placement Logic rules.

**Language: English only. All output, all captions, all examples — English.**

---

## CRITICAL LAYOUT GUARD (gpt-image-2 — include verbatim in every composed prompt)

This guard fixes three known failure modes specific to gpt-image-2 (the model the skill uses for board generation):

1. **gpt-image-2 misreads "four 9:16 slots in a 21:9 sheet" as "four wide horizontal bands stacked top-to-bottom"** — producing a vertical stack of full-width strips instead of four side-by-side columns.
2. **gpt-image-2 has a strong "label the panels" prior** that auto-adds forbidden `"SLOT 1 / SLOT 2 / SLOT 3 / SLOT 4"` typography (and sometimes numbers, captions, or "Panel X" tags) to the rendered output, overriding any vague "no text" instruction. For this tutorial flow we DO want one specific caption per slot (the `"Step N — Heading"` line) — but ONLY that caption, never "SLOT N" / "Panel N" / "Frame N" labels alongside it.
3. **gpt-image-2 sometimes silently swaps the rendered caption text** — e.g. the brief asks for `"Step 1 — Wet Hands"` and the render comes back with `"Step One: Wet Your Hands"` or just `"Wet Hands"`. To anchor the exact caption strings, the prompt must repeat each slot's caption text in quotes inside the slot description AND list all four captions verbatim in a single "rendered captions" line near the top.

To counter all three, the composed prompt MUST include the following block verbatim, placed near the top of the prompt (right after the `@ImageN` reference lines and before the per-slot descriptions). Do NOT summarize, paraphrase, or shorten it — the explicit redundancy is load-bearing:

```
CRITICAL LAYOUT (read first, applies to the entire output): The output is a LANDSCAPE WIDE strip in 21:9 aspect ratio — roughly 2.33 TIMES WIDER than it is TALL. Inside this wide strip, there are exactly FOUR identical TALL NARROW vertical panels (each 9:16 portrait orientation — TALLER than WIDE, the proportions of a single phone screen), arranged from LEFT to RIGHT in a single horizontal row. The four panels divide the wide strip horizontally into FOUR EQUAL COLUMNS, separated by thin white vertical gutters. The aspect of each individual panel is 9 wide by 16 tall — a tall narrow rectangle. The aspect of the full sheet is 21 wide by 9 tall — a wide short strip.

DO NOT lay out the panels as four wide horizontal bands stacked top-to-bottom — that is the wrong layout. The panels are columns side-by-side, not rows stacked. The dividers between panels are VERTICAL white gutters, never horizontal lines.

CAPTIONS: each of the four panels carries exactly ONE rendered text caption in the format "Step N — Heading", typed onto the panel as part of the image. The four captions across this board are, in order from leftmost panel to rightmost panel: "[CAPTION 1 VERBATIM]", "[CAPTION 2 VERBATIM]", "[CAPTION 3 VERBATIM]", "[CAPTION 4 VERBATIM]". The captions are RENDERED IN ENGLISH, with IDENTICAL typography across all four panels — same font family, same size, same color, same position. The separator is an en-dash with a single space on each side. The captions are rendered crisply, with no AI-text artifacts, no glitching letters, no missing characters, no doubled letters, no warped glyphs.

DO NOT add ANY OTHER text, labels, numbers, panel identifiers, headers, footers, watermarks, or typography anywhere on the output — only the four "Step N — Heading" captions. Specifically forbidden: "SLOT 1", "SLOT 2", "SLOT 3", "SLOT 4", "Panel 1/2/3/4", "#1 #2 #3 #4", "1 of 4", "Frame 1", brand banners, badges, pop-text, subtitles, or any decorative typography beyond the four Step captions. The only other text that may appear is the product's own real label printed on the physical product itself when the product is in frame.
```

When you fill in `[CAPTION 1 VERBATIM]` through `[CAPTION 4 VERBATIM]`, drop the brackets and paste the exact caption strings the skill was handed (or that you derived from the product) — e.g. `"Step 5 — Pump Twice"`. The verbatim repetition near the top is what anchors gpt-image-2 to render the right letters; the per-slot description below repeats the caption once more inside its slot's text.

This block is the single most important rendering directive for gpt-image-2. Include it verbatim near the top of every composed prompt for every board (K=1 and K>1).

---

## Inputs (provided in the skill dispatch)

1. **Character/creator image** — REQUIRED. Always provided. Recurring identity reference. Never re-described.
2. **Product image(s)** — OPTIONAL. Used for product reference + Angle Lock when present.
3. **Previous-board image** — OPTIONAL. Provided when K>1. Used to preserve identity, location, lighting, product state, wardrobe, AND caption typography across boards.
4. **Product description / usage instructions** — OPTIONAL. Source of truth for product name, category, mechanics, claims.
5. **Text request** — what the user wants the tutorial to demonstrate.
6. **Arc role** — always `BOARD_TUTORIAL_STEPS` for this skill.
7. **Step captions** — REQUIRED. Array of exactly 4 strings formatted `"Step N — Heading"` (Title Case, English, en-dash separator). N is the global step number, NOT a per-board reset — Board 2 carries Steps 5 / 6 / 7 / 8, Board 3 carries Steps 9 / 10 / 11 / 12, etc.
8. **Typography spec** — REQUIRED. `{font_family_vibe, position, size, color}`. Identical across all 4 slots of one board (and ideally across the whole video).
9. **Clip duration** — 4 to 15 seconds. The single Seedance clip this board produces.
10. **Board index K and total boards N** — context for chaining ("Board 2 of 3").

---

## Image Reference Order

Standard order (the orchestrator's `image_urls` array must match this — `@Image1` is the first element, `@Image2` the second, etc.):

| References provided | Order |
|---|---|
| Product + character + previous board (K>1) | `@Image1` = product, `@Image2` = character, `@Image3` = previous board |
| Product + character (K=1) | `@Image1` = product, `@Image2` = character |
| Character + previous board (no product, K>1) | `@Image1` = character, `@Image2` = previous board |
| Character only (K=1, no product) | `@Image1` = character |

The prompt MUST start with explicit `@ImageN` references in this order.

---

## Input Tiers

Classify the user request:

| Tier | Trigger | Behavior |
|------|---------|----------|
| Auto | 1-5 words, no scenario, only product name | Full autopilot: derive 4 realistic usage steps per board from product analysis (Mode A or B below). |
| Guided | 1-3 sentences with general tone, audience, or mood | Preserve user's tone/emphasis/mood. Build per-slot step structure yourself from product mechanics. |
| Director | 4+ sentences with a specific step list | Map the user's steps 1:1 onto the slots in their order. Adapt only physically unsafe interactions. |

---

## User Override Rule

If the user specifies any concrete detail — setting, location, clothing, action, mood, time of day, props, slot order, specific step text, caption typography — that detail takes priority over every default below.

---

## Step 1 — Product Understanding

### Mode A: Product image(s) + product description provided
Use the description directly. Extract: product name, brand, category, key features, intended use, container material, applicator type, visible design details, safe-to-mention claims.

### Mode B: Product image(s), no description
Visually analyze:
1. Product category
2. Container material — glass, hard plastic, soft tube, metal, cardboard, fabric, food packaging, tech, unknown
3. Applicator type — removable cap, pump, dropper/pipette, wand, spray nozzle, twist-up, flip top, compact hinge, none
4. Usage mechanic — how the product is normally applied or operated
5. Key visual details — color, label text, logo, shape, distinctive features
6. Real-world physical size — estimate height/width in centimeters from packaging type
7. Forbidden actions — anything that breaks physics, deforms rigid packaging, or invents unseen sides

### Mode C: No product image
Extract from text request only. No `@Image` product references. No Angle Lock. Describe the product in words inside the prompt. If mechanics are unclear → hold-and-present only with neutral steps.

### Mode D: No product at all
The tutorial is a lifestyle "how I do X" walkthrough — e.g. a skincare routine without naming a product, a workout warmup, a journaling ritual. Each slot is one step of the routine; the character carries the entire arc.

---

## Step 2 — Character Reference Rules

The character is always supplied via input image and must NEVER be re-described.

In every prompt, include:

`@Image[N] is the character reference. The same person appears in every slot with identical face, hair, body, and identity. Do not alter facial features, hairstyle, body proportions, or skin tone between slots.`

Outfit:
- Default: identical outfit across all four slots, matching the character reference image.
- Outfit may change ONLY if the tutorial explicitly transitions to a new context (rare in a single 15s clip; more common across boards — e.g. Board 1 is hair styling in pajamas, Board 2 is the finished look in day-out clothes).
- When a previous-board reference is present (K > 1), wardrobe defaults to matching the previous board exactly.

Never describe the character's age, ethnicity, attractiveness, makeup, or features beyond what the reference image already supplies.

---

## Step 3 — Setting and Lighting Logic

Default: inherit setting and lighting from the character reference image. Reference in the prompt:

`Setting and lighting in all four slots default to the same environment, time of day, and light direction visible in the character reference image, unless the tutorial requires a different location.`

When K > 1 and a previous-board reference is provided: the setting and lighting MUST match the previous board exactly (same room, same light direction, same time of day) UNLESS the tutorial explicitly transitions to a new location.

Product-driven setting matching when reference is unusable:
- Cosmetics / makeup / fragrance → bathroom or bedroom (vanity)
- Skincare / haircare / body care → bathroom
- Food / beverages / kitchen products → kitchen
- Protein / supplements / sports nutrition → home gym or kitchen
- Clothing / accessories / jewelry → bedroom or dressing room
- Fitness gear → home gym or yoga corner
- Outdoor gear / sunglasses / sunscreen → cafe terrace, park, sunlit street
- Tech / electronics → home desk, living room, studio nook
- Home / decor → living room or bedroom

Lighting fallback: soft neutral daylight from a clear directional source (left or right window). **Never golden hour or warm sunset** unless the user explicitly asks. Never harsh studio strobes.

---

## Step 3.5 — Caption Typography Selection (mandatory)

Every board renders one caption per slot: `"Step N — Heading"`. Typography is **identical across all 4 slots of one board**.

Pick the font vibe by product category:

| Product category | Font vibe | Style notes |
|---|---|---|
| Skincare / serums / creams / luxury beauty | Editorial serif (Didot / Bodoni / Playfair vibe) | Thin contrasting strokes, refined, magazine-cover feel |
| Fragrance / perfume / cologne | Refined serif or thin-line elegant sans | Restrained, premium, fashion-house feel |
| Color cosmetics / makeup | Modern sans or italic stylized serif | Trendy, clean, beauty-blogger feel |
| Tech / electronics / gadgets | Modern geometric sans (Inter / Helvetica Neue / SF Pro vibe) | Clean, neutral, slightly tight tracking |
| Fitness / gym / sports nutrition / supplements | Bold condensed sans, ALL-CAPS (Oswald / Impact / League Gothic vibe) | Energetic, athletic, slight tracking |
| Food / beverage / snacks | Warm rounded sans or handwritten script | Friendly, inviting, slightly playful |
| Coffee / artisan food | Warm serif or hand-lettered display | Crafted, cafe-feel |
| Fashion / accessories / jewelry | Minimal thin sans or fashion-house thin serif | Restrained, editorial |
| Home / decor / candles | Light serif or soft refined sans | Calm, lifestyle-magazine feel |
| Outdoor / lifestyle | Modern sans, slightly bold | Clean, active |
| Default if uncertain | Clean sans (Inter / Helvetica vibe), regular weight | Neutral, readable |

**Typography rules** (state these explicitly in the prompt):

- **Position**: top-center, padded ~5-7% from the top edge. Identical across all 4 slots.
- **Size**: readable at thumbnail — roughly 60-70% of slot width for the longest caption. Same across all 4.
- **Color**: high-contrast against background. Default: white with a soft drop-shadow for legibility, OR dark charcoal on bright/light scenes. Same across all 4.
- **Casing**: Title Case (`"Step 1 — Wet Hands"`). For fitness/sports/condensed-bold style, ALL-CAPS is acceptable (`"STEP 1 — WET HANDS"`) — apply consistently across all 4 slots.
- **Separator**: en-dash (`—`) with a single space on each side. Not a hyphen (`-`), not a colon (`:`).
- **Max TWO lines per caption.** If any slot's caption wraps to 2 lines, apply the same wrap treatment to all 4 (wrap others if needed for visual parity, or rephrase the long one).
- **Caption MUST NOT overlap the character's face.** If conflict, shift ALL 4 to BOTTOM-CENTER (consistent, never split top/bottom across slots).
- Caption text must be sharp and legible — no AI-text artifacts, no glitching letters, no missing characters, no doubled letters, no warped glyphs.
- Caption is BAKED INTO the image (it's part of the rendered pixels Seedance later animates) — not a video overlay.

**User typography overrides:** the dispatch may pass a `typography_hint = {font_family_vibe, position, size, color}`. Apply it verbatim and skip the table above. If the user's typography_hint changes the font vibe mid-video (e.g. Board 1 editorial serif, Board 2 bold sans), it reads as AI inconsistency — gently override and keep the Board 1 typography across all subsequent boards unless the user explicitly demands variation.

---

## Step 4 — Canonical Tutorial Arc Across the 4 Slots

Four chronological steps of using the product. Step numbering is **global** across the video: Board K carries Steps `(4·(K−1)+1)` through `(4·K)`.

Default per-slot role within ONE board:

| Slot | Default role |
|---|---|
| 1 | Setup / preparation / first contact with the product (could be opening, dispensing, or first-position) |
| 2 | Core demonstration (activate / dispense / engage the main mechanic) |
| 3 | Application / interaction with the target (apply to skin / lips / hair / surface, ingest, etc.) |
| 4 | Wrap-up / result / final beat — the satisfying outcome of this board's steps |

**Important:** Slot 1 of Board 1 always shows the FIRST tutorial step — not "show product alone" and not an unboxing moment. If the brief implies the user wants the very first step to be "open the bottle", that's Step 1; if it's "wet your face", that's Step 1; you pick the natural starting beat for the product's actual usage flow.

For Boards 2..N, slot 1 picks up where Board K-1's slot 4 left off and continues the routine chronologically — never reintroduces the product or re-explains the setup.

### Director Override

If the user provides Director-tier beats (4+ sentences with specific scenario / shot list / explicit step text), map their step text 1:1 onto the slots in their order — Director input overrides the default role table above.

---

## Step 4.5 — Slot Action Diversity (mandatory)

The 4 slots MUST show four DIFFERENT physical actions, not four variations of the same pose. Same hand-product configuration in all four slots = the storyboard reads as one frozen moment, not a tutorial. Same pose with micro-variation (smile angle, head tilt) does NOT count as a different action.

### Default POV cadence

`TRIPOD → TRIPOD → TRIPOD → SELFIE`

Steps 1-3 typically need two-handed product mechanics (open / dispense / apply), which forces TRIPOD per the Hand Allocation Rule. Step 4 is the wrap — the character is settled or addresses camera — which works as SELFIE (and naturally leads into the CTA tail on the final board's Cut 4).

If product mechanics make a step naturally one-handed (e.g. spray bottle, lipstick, pre-measured supplement), that step may be SELFIE — match the actual mechanic, don't force tripod artificially.

### Camera Distance Variation (mandatory)

Each of the 4 slots MUST use a DIFFERENT camera distance/framing. Default cadence:

| Slot | Distance |
|---|---|
| 1 | MEDIUM tripod — character + product framed waist-up or chest-up, room context visible |
| 2 | MEDIUM CLOSE-UP — character mid-action, chest-up framing |
| 3 | MACRO or TIGHT CLOSE-UP — applicator-to-target contact zone, character's hands and partial face only |
| 4 | THREE-QUARTER or MEDIUM CLOSE-UP selfie — character settled, room context visible behind |

The slot description MUST explicitly state the framing distance — `TIGHT CLOSE-UP`, `MEDIUM CLOSE-UP`, `MEDIUM`, `MEDIUM-WIDE`, `MACRO`, `THREE-QUARTER`, `WAIST-UP`, `FULL-BODY WIDE`, or `PRODUCT-EXTENDED` — so the image model receives an unambiguous framing signal. Distance change between slots aligns with the hard cut between them.

### Distance band rule (mandatory)

The 4 slot framings MUST span at least **one TIGHT band** (TIGHT CLOSE-UP / MACRO), at least **one MID band** (MEDIUM CLOSE-UP / MEDIUM), and at least **one WIDE band** (THREE-QUARTER / WAIST-UP / FULL-BODY WIDE / PRODUCT-EXTENDED). If all 4 slots fall within the same band — e.g., all medium close-ups, all chest-up — REWRITE. The viewer must physically perceive the camera at four distinct distances.

### Hard validation rules

- All 4 slots MUST show 4 DIFFERENT physical actions per the default per-slot role table (or user-specified Director override).
- Same hand holding the same object in the same position across all 4 slots = REWRITE.
- All 4 slots MUST use 4 DIFFERENT camera distances/framings.
- Every POV / distance change between slots aligns with a hard cut (per Step 5).
- All 4 captions follow the same typography spec (Step 3.5).

---

## Step 5 — Camera POV and Hand Allocation Per Slot

Each slot picks the POV that fits its action AND obeys the Hand Allocation Rule.

### Camera POVs

| Action in slot | POV |
|---|---|
| Two-handed mechanic (open / unscrew / pump / apply with one hand while holding bottle with other) | **Tripod-style** front-facing iPhone shot, character at arm's-length distance, eye-level — both hands free for product handling |
| Macro on application zone (fingertip-to-cheek, dropper-to-fingertip, brush-to-lid) | **Tripod close-up** at chest/desk level, framing tight on hands and product |
| Settled wrap / character addresses lens / talking-head closer | **Selfie or tripod** front-facing, character at eye-level, expressive face |
| Walking demo / outdoor / one-object holds | **Arm's-length selfie** shot, slight handheld feel |

### Hand Allocation Rule (hard constraint)

The character has exactly two hands. Count hands before finalizing every slot.

**Selfie POV:**
- ONE hand is holding the phone — fully off-frame or its edge (forearm / palm side) partially visible.
- Only the OTHER hand is available for action — holding ONE object total (product OR applicator, not both).
- If the slot requires holding two objects simultaneously or any two-handed mechanic → **Selfie is FORBIDDEN. Switch to Tripod.**
- **Paired products** (dumbbells, gloves, earrings sold as pair): only ONE half in the free hand. The other is set down nearby or absent — never both held in selfie.

**Tripod POV:**
- Both character hands are free.
- Phone is not in frame; no hand holds it.
- Suitable for any two-handed action (opening, twisting, applying with one hand while holding the product with the other).

**Decision tree per slot:**
- Wet hands / first prep → Tripod (both hands at sink) or Selfie (single fluid motion)
- Press pump / unscrew dropper / pull cap → Tripod (one hand holds the bottle, the other operates)
- Apply to face / lips / hair → Tripod (one hand holds applicator or finger-dab, the other braces or balances)
- Pat in / massage in / settle → Tripod (both hands work the application)
- Final wrap / talking-head / CTA → Selfie (intimate ending; natural lead-in to CTA tail on final board)

**Hard validation rule (must appear in the rendering rules of every prompt):**
`Count hands per slot. The character has exactly two hands. In selfie POV, one hand is occupied by the phone (off-frame or visible at edge), so only one hand is available for action — never depict the character holding two objects in selfie POV. If the slot's action requires two free hands, the slot must be tripod POV with the phone not in frame. POV may change between slots; every POV change aligns with a hard cut. No third arm, no extra hand, no impossible grip.`

---

## Step 6 — Safe Interaction Verbs

| Material | Safe verbs | Forbidden |
|---|---|---|
| Glass / hard plastic / metal | rests on palm, holds lightly, cradles, presents, taps gently | squeeze, crush, clench, twist body, deform |
| Soft tube | holds, gently squeezes, presses lightly | crushes, wrings, twists violently |
| Fabric / clothing | wears, adjusts, smooths, drapes, holds up | stretches unnaturally, yanks, wrings |
| Food | bites, pours, scoops, stirs, serves | throws, juggles, morphs, multiplies |
| Tech / electronics | holds, presents, points to screen/detail | opens compartments, plugs cables (unless that's literally the tutorial step) |
| Any product | holds, shows, lifts, presents, applies, points at | throws, catches, juggles, spins, drops |

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

Reference real-world sizes (same as unboxing — included here for self-contained read):

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

### Weight & Grip Logic (mandatory)

Before depicting the character holding/lifting the product, classify by weight and size:

| Class | Examples | Hand allocation | Facial expression |
|---|---|---|---|
| Heavy | Appliance, bottle ≥1L, toolbox-class | BOTH hands required, character leans forward to lift | Visible strain — jaw set, slight brow furrow, controlled exhale |
| Bulky but light | Oversized box, large pillow, big plush, tall but empty container | BOTH hands required for stability | NO strain — relaxed face, easy grip |
| Light | Cosmetics, phone, small bottle, jewelry case | ONE hand, relaxed grip | Neutral / pleased / focused, no strain |
| Tiny | Single earring, pill, contact lens, small chip | Pinched between thumb and index finger, held close to lens | Focused / curious, no strain |

Single-handed lifting of heavy items is FORBIDDEN. Two-handed strain on light items is FORBIDDEN.

**Never balance paired products on a single palm** — paired items use one-per-hand, one-displayed-other-set-down, or side-by-side on surface.

---

## Step 8 — Product Placement & Visibility Logic

The product is visible in a slot ONLY if the action of that slot requires it.

Tutorial-specific guidance:
- **Slot 1 (first step)** — product is typically visible because the first step usually involves picking it up, opening it, or first contact. Exception: skincare tutorial Step 1 = "wash hands" → product appears in Step 2.
- **Slot 2 (core mechanic)** — product clearly visible, mechanic in motion.
- **Slot 3 (application)** — product applicator-to-target zone is the focus; the product container may be partially in frame.
- **Slot 4 (wrap)** — product may be set down beside character, held in hand, or absent from frame — depends on the natural settle of the routine.

### Hidden product configurations (when applicable)

When a slot shows a non-product action (e.g. wetting hands before applying skincare), the product is **absent** from that slot's frame entirely. Do NOT show the product floating in the background, sitting at the frame edge, or half-visible — keep the frame clean of product when the action doesn't involve it.

### Forbidden placements (must appear in the rendering rules)

`Forbidden product placements: product half-sticking out of a pocket, product balancing on a counter edge, product wedged between objects, product floating, product peeking with cap exposed. The product is either fully visible held in hand / on a surface, or absent from the frame. Never partial, never sticking out, never awkwardly positioned.`

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
| Tech / electronics | Hold-and-present, point to screen or exterior detail. Open compartments only if the tutorial step specifically demands it. |

General rules:
- Maximum one product state change per slot.
- Removed caps/lids disappear after removal — never described again.
- Two hands max. Never two separate hand actions at the same time.
- Two-handed interactions force tripod POV.

### Cross-board product state continuity (K > 1 only)

Within a single board, product state may stay constant per slot. Across boards: when a previous-board reference is provided (K > 1) and that previous board's final slot showed the product in an open state (cap removed, dropper extended, lid flipped), board K's slots MUST continue that open state — **never re-close a previously-opened product across boards**. Re-introducing the closed cap reads as a fresh recording and breaks the continuous-tutorial feel.

---

## Step 10 — Human Performance Direction

Each slot includes specific micro-behaviors so the character feels alive:
- slight lean toward camera, glance down then back to lens, eyebrow raise, head tilt, hand gesture, shoulder shift, hair tuck, focused grin, satisfied exhale, small nod, pointing at applicator, holding product closer to camera, tapping label, posture shift, pause before the next step.

Avoid as a sole descriptor:
- "smiles at the camera"
- "looks at the camera"
- "holds product and talks"
- identical expression across all slots

Expression progression across the 4 slots (default tutorial arc):
- Slot 1 — focused / prepared / engaged; ready to start, eyes on what she's about to do
- Slot 2 — concentrated / instructive; mid-mechanic, brows softened, attention locked
- Slot 3 — focused application / inspection; lips parted in study, attention on the contact zone
- Slot 4 — settled satisfaction / warm grin / confident; result is in, posture relaxed, half-smile

Identical expression across slots = REWRITE. For Boards 2..N, slot 1 picks up from Board K-1's slot 4 and continues evolving.

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

**Plus:** the `Step N — Heading` caption rendered per the Step 3.5 typography spec, baked into the slot.

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
- **Exactly ONE caption per slot**, in the format `"Step N — Heading"`, with identical typography across all 4 slots of one board.
- No other on-image text: no badges, no slot numbers, no pop-text, no subtitles, no watermarks, no panel identifiers.
- The product label (if visible on the physical product) keeps its real text accurately — that is part of the product itself, not added typography.

---

## Step 13 — Rendering Rules

The final image prompt must demand:
- Exactly 4 slots, identical size, exact 9:16 each, single horizontal row, total sheet aspect 21:9.
- Thin white gutters between slots.
- All four slots active — no placeholders.
- Photorealistic UGC iPhone stills, with one `"Step N — Heading"` caption rendered per slot in identical typography across the board.
- Caption text crisp, legible, no AI-text artifacts.
- Consistent character identity across all four slots.
- Consistent product design across all slots in which the product appears (Angle Lock when product image is provided).
- **Product at realistic real-world scale**, not enlarged. Camera moves closer if the label needs to be readable.
- **Product placement is clean** — fully visible held in hand or on a surface, or absent. Never half-sticking out, never balancing awkwardly, never partial.
- **Hand count enforced** — character has exactly two hands. Selfie POV occupies one hand with the phone, leaving one for action. Two-handed actions force tripod POV.
- **POV may change between slots** — every POV change aligns with a hard cut, never a smooth transition.
- Same setting and lighting across slots within the same location; switch only when the tutorial crosses to a new location.
- When a previous-board reference is provided (K > 1), identity / location / lighting / product / wardrobe / caption typography MUST match the reference unless the tutorial explicitly demands a change.
- No mirror/reflection shots. No deformed hands. No third arm. No additional brands or IP. No watermarks. No extra text beyond the four `"Step N — Heading"` captions.

---

## Prompt Template

Use this structure as the `prompt` value you pass to `generate_image` (no JSON wrapper, no markdown fences — pure prose):

```
[@Image1 product reference + ANGLE LOCK if product is present.] [@Image2 character reference, or @Image1 if no product.] [@Image3 previous-board reference if K > 1, with explicit instruction to preserve identity / location / lighting / wardrobe / product / caption typography from this reference.] The same person appears in every slot with identical face, hair, body, and identity — no changes to features, hair, or proportions between slots.

[INSERT THE CRITICAL LAYOUT GUARD BLOCK VERBATIM HERE, with the four caption strings substituted into the CAPTIONS line.]

A single horizontal storyboard sheet composed of exactly four equal-size 9:16 vertical slots arranged in one row, separated by thin white gutters on a clean white background, total sheet aspect 21:9. All four slots are active photorealistic UGC iPhone-style stills that tell a tutorial across one continuous [DURATION]-second video clip — slot 1 depicts Step [4·(K-1)+1] of using [PRODUCT], slot 2 depicts Step [4·(K-1)+2], slot 3 depicts Step [4·(K-1)+3], slot 4 depicts Step [4·K]. There are no placeholder slots.

Caption typography across all four slots: [font_family_vibe per Step 3.5 — e.g. "editorial serif, Didot/Bodoni vibe, thin contrasting strokes"], [position — e.g. "top-center, padded ~5-7% from the top edge"], [size hint — e.g. "readable at thumbnail, ~60-70% of slot width"], [color — e.g. "white with soft drop-shadow"]. All four captions use IDENTICAL font, size, color, and position. Separator is an en-dash with single spaces. Title Case. Max 2 lines per caption. Captions are baked into the image, rendered crisply, with no AI-text artifacts, no glitching letters, no doubled or warped glyphs. No other text appears anywhere on the sheet.

Setting and lighting in all four slots default to the same environment, time of day, and light direction visible in the character reference image (and previous-board reference if provided), unless the tutorial requires a different location. Outfit stays identical across slots within the same location.

Product (if present) appears at realistic real-world scale, approximately [X cm] in real size, fitting naturally in the character's hand without enlargement. Product placement in every slot is clean: either fully visible held in hand / on a surface, or absent from the frame — never half-sticking out, never balancing awkwardly, never partial.

The character has exactly two hands. In selfie POV slots, one hand is occupied by the phone (off-frame or visible at edge), so only one hand is available for action — never two objects in selfie POV. Slots requiring two free hands are tripod POV with the phone not in frame. POV may change between slots — every POV change aligns with a hard cut between slots, never a smooth transition.

Slot 1 — exact 9:16 vertical photorealistic UGC iPhone still, [tripod POV / selfie POV], framing [MEDIUM / MEDIUM CLOSE-UP / etc.]: [explicit Step 1 action — what the character physically does, exact hand allocation, expression, product placement, framing detail, light note]. Rendered caption baked into this slot at [position]: "[caption 1 verbatim — e.g. 'Step 1 — Wet Hands']".

Slot 2 — exact 9:16 vertical photorealistic UGC iPhone still, [POV], framing [...]: [explicit Step 2 action, hand allocation, expression, product placement, framing detail]. Rendered caption baked into this slot at [same position]: "[caption 2 verbatim — e.g. 'Step 2 — Pump Twice']".

Slot 3 — exact 9:16 vertical photorealistic UGC iPhone still, [POV], framing [MACRO / TIGHT CLOSE-UP / etc.]: [explicit Step 3 action, hand allocation, focus on contact zone, expression, product placement]. Rendered caption baked into this slot at [same position]: "[caption 3 verbatim — e.g. 'Step 3 — Massage In']".

Slot 4 — exact 9:16 vertical photorealistic UGC iPhone still, [POV — typically SELFIE for the wrap], framing [THREE-QUARTER / MEDIUM CLOSE-UP / etc.]: [explicit Step 4 action — the settle/result, hand allocation, expression, product placement]. Rendered caption baked into this slot at [same position]: "[caption 4 verbatim — e.g. 'Step 4 — Rinse Clean']".

Rendering rules: every slot is an exact 9:16 vertical rectangle, all four slots identical in size, arranged in a single horizontal row with thin white gutters on a clean white background, total sheet aspect 21:9. All four slots are active — there are no placeholder slots. Active slots are photorealistic iPhone-style UGC stills with natural light and casual real-life feel. The character's identity is identical across all four panels. The character has exactly two hands; selfie POV occupies one hand with the phone, leaving one hand for action; two-handed actions are tripod POV. POV may change between slots; every POV change aligns with a hard cut, never a smooth transition. The product (if present) appears at realistic real-world scale relative to the character's hand and body, never enlarged for visibility, and keeps the same visible angle from the reference image across all appearances. Product placement is always clean: fully held in hand, fully on a surface, or absent — never partial, never sticking out, never balancing awkwardly. The four "Step N — Heading" captions are the ONLY on-image text. No other text of any kind: no panel labels, no slot numbers ("SLOT 1 / SLOT 2 / ..."), no header, no metadata, no pop-text, no badges, no subtitles, no watermarks. Caption typography is identical across all four slots. Caption text crisp, legible, no AI-text artifacts. No mirror or reflection shots. No deformed hands. No third arm. No additional brands or logos beyond the user's product. No invented product claims.
```

---

## Defaults

| Parameter | Default |
|---|---|
| Slots | Always 4, all active |
| Arc role | `BOARD_TUTORIAL_STEPS` (only role) |
| Clip duration | Provided externally (4-15s) |
| Sheet aspect | 21:9 (4 × 9:16 slots side by side) |
| Slot aspect | Exact 9:16, identical for all 4 |
| Character | From reference image; no re-description |
| Setting | Inherited from character reference (and previous-board if K>1) |
| Lighting | Inherited; soft neutral daylight as fallback. NEVER golden hour. |
| Outfit | Identical across slots within one location; matches previous board if K>1 |
| Camera POV cadence | Default TRIPOD → TRIPOD → TRIPOD → SELFIE; adapt to product mechanics |
| Hand allocation | Selfie = phone-hand + one free; Tripod = both free |
| Product scale | Real-world physical size; never enlarged |
| Product placement | Visible in hand / on surface / absent — never partial |
| Product interaction | Exact mechanic per Step 9 table; hold-and-present otherwise |
| Caption typography | Picked from Step 3.5 table by product category, identical across all 4 slots |
| Caption position | Top-center default; shift to bottom-center if it conflicts with faces — same position for all 4 |

---

## Hard Restrictions

- Never describe the character's age, ethnicity, attractiveness, makeup, or facial features beyond what the reference image supplies.
- Never generate more or fewer than 4 slots.
- Never make slots different sizes from each other.
- Never deviate from exact 9:16 per slot.
- Never include placeholder slots — all four are always active.
- **Never put any text on a slot beyond the single `"Step N — Heading"` caption.** No additional headers, metadata blocks, captions, badges, slot numbers ("SLOT 1 / Panel 1 / Frame 1"), pop-text, subtitles, watermarks, brand banners, CTA text.
- **Never vary the caption typography across slots within the same board.** Font, size, color, and position MUST be identical for all 4 captions.
- Never wrap a caption to more than two lines. If any slot wraps, apply consistent treatment to all 4.
- Never invent unseen product sides when product reference is provided.
- Never enlarge the product beyond its real-world physical size — move the camera closer instead.
- Never depict the product half-sticking out, balancing awkwardly, peeking partially, wedged, or floating.
- Never depict more than two hands. Selfie POV = one phone-hand + one free hand only. Two-object holds in selfie POV are forbidden — switch to tripod.
- Never use mirror or reflection shots.
- Never use unsafe or physically impossible product interactions.
- Never invent legal claims, medical claims, certifications, or unsupported superiority claims about the product.
- Never include unrelated real-world brands or IP.
- Never ignore user-specified setting, action, duration, or step list (Director-tier override wins).
- Never let outfit change inside a single location.
- **Tutorial steps must be physically realistic for the actual product.** No imaginary steps. If the user wants a step the product can't actually do, override silently to a realistic adjacent mechanic.
- Never depict heavy products lifted single-handedly — heavy items require BOTH hands AND visible facial strain. Never depict two-handed strain on light items either.
- **Never balance heavy items or paired products on a single palm** — heavy and paired items require natural gripping mechanics (one-per-hand, or one-displayed-other-set-down, or side-by-side on surface).
- Never break the previous-board match when K > 1 unless the tutorial sequence explicitly demands a location change.
- **English only** for all captions, headings, and prompt content — switch only if the user explicitly requests another language.
