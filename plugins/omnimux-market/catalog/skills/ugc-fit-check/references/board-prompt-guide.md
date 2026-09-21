# UGC Try-On Board Prompt Guide

Use this when composing the `prompt` for `generate_image` to produce a 21:9 four-slot UGC try-on storyboard sheet for ONE Seedance video clip.

The output of this composition is a single prose prompt string (no JSON wrapper, no markdown fences). The orchestrator skill passes that string as `generate_image(prompt=...)` with `aspect_ratio="21:9"`, `resolution="1K"`, and `image_urls` in the order specified below — so `@Image1`, `@Image2`, ... in your prompt text bind directly to those resolved URLs.

CORE PRINCIPLE: The sheet is a sequential UGC try-on storyboard for ONE 15-second-or-shorter video clip — four narrative beats inside that single clip. NOT a presentation deck. No headers, no metadata blocks, no pop-text captions, no badges, no numbers, no brand-matched design system, no typography of any kind. Just four equal-size 9:16 slots in one row, each containing a photorealistic UGC iPhone-style still that advances a coherent try-on story. Slots are separated by thin white gutters. **All four slots are always active — there are no placeholders.** **For Board 1, the four slots follow the canonical try-on arc: PRE_WEAR → WEARING → TEXTURE_CLOSEUP → STYLE_POSE.** For Boards 2..N, the four slots are different pose variations of the character in the product outfit.

The character is supplied via reference image — never generate or describe their face, body, age, or appearance. Reference them only as "the same person from the character reference image, with identical face, hair, body, and identity across all four slots."

The product is the **clothing item being worn** (or the accessory). Product visual consistency is enforced via Garment Consistency Lock (Step 7) — silhouette, color, print, and recognizable details stay identical across all slots in which the product appears.

Story matters. Setting matters. Camera POV adapts to the slot beat (selfie for casual S1, tripod for full-body S2/S3/S4) and **may change between slots — every POV change aligns with a hard cut between slots, never a smooth transition.** Hand count is enforced.

**Tone parameter** (`excited` / `confident` / `cold` / `playful` / `posh` / `amazed`) drives the character's expression progression across the 4 slots.

---

## CRITICAL LAYOUT GUARD (gpt-image-2.5-sunburst — include verbatim in every composed prompt)

This guard fixes two known failure modes specific to gpt-image-2.5-sunburst (the model the skill uses for board generation):

1. **gpt-image-2.5-sunburst misreads "four 9:16 slots in a 21:9 sheet" as "four wide horizontal bands stacked top-to-bottom"** — producing a vertical stack of full-width strips instead of four side-by-side columns.
2. **gpt-image-2.5-sunburst has a strong "label the panels" prior** that auto-adds forbidden "SLOT 1 / SLOT 2 / SLOT 3 / SLOT 4" typography (and sometimes numbers, captions, or "Panel X" tags) directly onto the rendered output, overriding any vague "no text" instruction.

To counter both, the composed prompt MUST include the following block verbatim, placed near the top of the prompt (right after the `@ImageN` reference lines and before the per-slot descriptions). Do NOT summarize, paraphrase, or shorten it — the explicit redundancy is load-bearing:

```
CRITICAL LAYOUT (read first, applies to the entire output): The output is a LANDSCAPE WIDE strip in 21:9 aspect ratio — roughly 2.33 TIMES WIDER than it is TALL. Inside this wide strip, there are exactly FOUR identical TALL NARROW vertical panels (each 9:16 portrait orientation — TALLER than WIDE, the proportions of a single phone screen), arranged from LEFT to RIGHT in a single horizontal row. The four panels divide the wide strip horizontally into FOUR EQUAL COLUMNS, separated by thin white vertical gutters. The aspect of each individual panel is 9 wide by 16 tall — a tall narrow rectangle. The aspect of the full sheet is 21 wide by 9 tall — a wide short strip.

DO NOT lay out the panels as four wide horizontal bands stacked top-to-bottom — that is the wrong layout. The panels are columns side-by-side, not rows stacked. The dividers between panels are VERTICAL white gutters, never horizontal lines.

DO NOT add any text, labels, numbers, captions, panel identifiers, headers, footers, watermarks, or typography of any kind anywhere on the output. Specifically forbidden: "SLOT 1", "SLOT 2", "SLOT 3", "SLOT 4", "Panel 1/2/3/4", "#1 #2 #3 #4", "1 of 4", "Frame 1", or any other panel-naming text. There is no on-image typography of any kind on this storyboard sheet.
```

This block is the single most important rendering directive for gpt-image-2.5-sunburst. Include it verbatim near the top of every composed prompt for every board (K=1 and K>1).

---

## Inputs (provided in the skill dispatch)

1. **Character/creator image** — REQUIRED. Always provided. Recurring identity reference. Never re-described.
2. **Product image** — REQUIRED. The clothing item / accessory being tried on. Used as visual reference for silhouette, color, print, recognizable details.
3. **Previous-board image** — OPTIONAL. Provided when this board is K>1 in a multi-board sequence. Used to preserve identity, location-tier, lighting, product, and hairstyle across boards.
4. **Product description** — OPTIONAL. Source of truth for product name, brand, category, fabric, key visual details, fit notes.
5. **Text request** — what the user wants the try-on story to be.
6. **Arc role** — passed externally. For Board 1: `BOARD_1_TRY_ON_CANONICAL` (slots PRE_WEAR → WEARING → TEXTURE_CLOSEUP → STYLE_POSE). For Boards 2..N: `BOARD_K_TRY_ON_POSES` (4 different pose variations of the character in the product, no kraft bag, no pre-wear outfit).
7. **Tone parameter** — passed externally. One of: `excited` (default) / `confident` / `cold` / `playful` / `posh` / `amazed`. Drives expression progression across slots.
8. **`pre_wear_outfit_hint`** — passed externally for Board 1 only. The boring/neutral home base outfit the character wears in Slot 1.
9. **`slot_4_pose_hint`** — passed externally. ONE pose-and-location combo from the canonical list (see Step 4).
10. **`location_tier`** — passed externally. One of: `premium` / `mid` / `casual`.
11. **Clip duration** — 4 to 15 seconds.
12. **Board index K and total boards N** — context for chaining.

---

## Image Reference Order

The orchestrator's `image_urls` array must match this order — `@Image1` is the first element, `@Image2` the second, etc.

| References provided | Order |
|---|---|
| Product + character + previous board (K>1) | `@Image1` = product, `@Image2` = character, `@Image3` = previous board |
| Product + character (K=1) | `@Image1` = product, `@Image2` = character |
| Character + previous board (no product) | `@Image1` = character, `@Image2` = previous board |
| Character only | `@Image1` = character |

The prompt MUST start with explicit `@ImageN` references in this order.

---

## Input Tiers

| Tier | Trigger | Behavior |
|------|---------|----------|
| Auto | 1-5 words, no scenario, only product name, "try this on", or empty | Full autopilot: build the canonical try-on arc with default tone (excited). |
| Guided | 1-3 sentences with general idea, tone, mood, or rough flow | Preserve user's tone/emphasis/mood. Build slot structure yourself. |
| Director | 4+ sentences with specific scenario, dialogue intent, shot list | Map user's beats 1:1 onto the 4 slots, but never violate Outfit Continuity, Kraft Bag, or No-Mirror rules. |

---

## User Override Rule

If the user specifies any concrete detail — setting, location, clothing, action, mood, time of day, props, slot order, story beats — that detail takes priority over every default below, **except** the Outfit Continuity rule, the Kraft Bag rule, and the No-Mirror rule, which are non-negotiable.

---

## Step 1 — Product Understanding (Clothing-Specific)

### Mode A: Product image + product description provided
Use the description directly. Extract: product name, brand, category (top / dress / outerwear / pants / skirt / accessory / shoes), fabric type, primary color, secondary color or print, silhouette, recognizable design details.

### Mode B: Product image, no description
Visually analyze: garment category, fabric vibe, silhouette, primary color + secondary color or print, key design details, tier signal, real-world fit.

### Mode C: No product image
Try-on without a product image is degenerate. If forced, describe the garment in words and accept loose visual consistency.

---

## Step 2 — Character Reference Rules

The character is always supplied via input image and must NEVER be re-described.

**Outfit Continuity (mandatory — SPECIAL FOR TRY-ON):**
- **Board 1, Slot 1 (PRE_WEAR)**: character wears the `pre_wear_outfit_hint` outfit — boring/neutral home base, NOT the product.
- **Board 1, Slot 2 onward + all slots of Boards 2..N**: character wears the **product** as the outfit. The pre-wear outfit is GONE forever.
- **Hairstyle stays consistent across all slots and boards.**

---

## Step 3 — Setting and Lighting Logic

Default: inherit setting and lighting from the character reference image, **biased toward the `location_tier`**:
- `premium`: clean lines, marble / oak / linen / soft directional daylight, minimal high-end furniture
- `mid`: stylish lived-in apartment, modern textures, plants, soft warm daylight
- `casual`: cozy / casual home, sofa, hallway, kitchen, soft warm tones

Slot 4 is in a different room of the same home (matched aesthetic).

Lighting fallback: soft neutral daylight from a clear directional source. Never golden hour or warm sunset unless user explicitly asks.

---

## Step 4 — Canonical Try-On Arc Across the 4 Slots

**Board 1** always follows this sequence:

| Slot | Role | Required content |
|---|---|---|
| 1 | PRE_WEAR | Character in pre-wear outfit. Kraft paper bag in frame (held or beside). Product NOT visible. Expression matches tone. |
| 2 | WEARING | Character now wearing the product, full-body framing, tripod. Pre-wear and kraft bag GONE. Peak reaction per tone. |
| 3 | TEXTURE_CLOSEUP | Tight close-up on fabric / cut / texture. **NO hand contact with the fabric.** Hand-free macro. |
| 4 | STYLE_POSE | Character in a **different room** of the same home, styled pose per `slot_4_pose_hint`. Outfit-complete. Kraft bag GONE. |

For Boards 2..N: 4 different pose variations in the product outfit. No kraft bag, no pre-wear.

`slot_4_pose_hint` options: `seated_armchair` / `window_seat` / `leaning_doorframe` / `walking_hallway` / `kitchen_island` / `stairs` / `balcony`.

---

## Step 4.5 — Slot Action Diversity (mandatory)

All 4 slots MUST show 4 DIFFERENT physical actions and framings.

### Default POV cadence (Board 1): `SELFIE → TRIPOD → TRIPOD-CLOSE → TRIPOD`

### Camera Distance Variation (mandatory)

| Slot | Distance |
|---|---|
| 1 PRE_WEAR | WAIST-UP / MEDIUM |
| 2 WEARING | FULL-BODY / THREE-QUARTER |
| 3 TEXTURE_CLOSEUP | MACRO or TIGHT CLOSE-UP |
| 4 STYLE_POSE | MEDIUM-WIDE or FULL-BODY-WIDE |

Distance band rule: at least one TIGHT, one MID, and one WIDE band across the 4 slots.

---

## Step 5 — Camera POV and Hand Allocation Per Slot

**Selfie POV:** ONE hand holds phone (off-frame), one hand free for action. Never two objects in selfie POV.
**Tripod POV:** Both hands free. No phone in frame.

---

## Step 6 — Safe Interaction Verbs (Clothing-Specific)

| Garment / item | Safe verbs | Forbidden |
|---|---|---|
| Top / shirt / blouse / tee | wears, smooths, adjusts hem, tucks in, brushes shoulder | stretches violently, yanks, wrings, tears |
| Dress / skirt | wears, smooths, adjusts hem, pinches at waist | yanks, lifts hem indecently, twists |
| Pants / shorts | wears, smooths, adjusts at waist, tugs cuff | yanks, hikes up unnaturally |
| Outerwear / jacket / coat | wears, opens, adjusts collar, smooths lapels | tears off, throws |
| Shoes | wears, taps toe, lifts heel, adjusts strap | tears, bends |
| Handbag / accessory | holds, adjusts strap, lays on lap, sets on surface | crushes, deforms |
| Jewelry | wears, lifts to display, taps gently | yanks, pulls |
| Hat / accessory | wears, adjusts brim, sets on head | crushes, throws |

---

## Step 7 — Garment Consistency Lock and Realistic Fit

### Garment Consistency Lock
Across every slot in which the product is worn: identical silhouette, identical primary color, identical secondary color or print pattern, identical recognizable design details. The character may turn or pose freely — the garment rotates naturally with the body — but the garment itself never changes.

### Realistic Fit
The product MUST be rendered at realistic proportions on the character's body — natural drape, natural fit, not exaggerated.

---

## Step 7b — Kraft Bag Logic (Board 1 / Slot 1 ONLY)

- Single kraft paper bag, plain brown craft paper texture, **no logo, no brand, no shipping stickers**
- Optional: handles tinted to match the product's primary color
- Bag placement: held by one handle at her side OR set upright on a surface beside her
- **Forbidden:** character does NOT open, lift product out, peek inside, or vlog the bag
- Slot 1 of Board 1: bag visible. All other slots: bag GONE forever.
- This is NOT an unboxing. No cardboard delivery box, no packing tape, no tissue paper.

---

## Step 7c — Outfit Continuity Logic (mandatory)

- **Pre-wear outfit (S1 of Board 1 ONLY):** boring/neutral home base per `pre_wear_outfit_hint`. Visually muted.
- **Product outfit (S2 of Board 1 onward + all later slots):** the garment being tried on. Once in the product, she stays in the product forever.
- **Hairstyle continuity:** identical across all slots and boards.
- **Outfit transition:** implicit via hard cut between S1 and S2. Never depict changing.

---

## Step 8 — Product Placement & Visibility Logic

- **Slot 1 PRE_WEAR**: product INSIDE the kraft bag — NOT visible.
- **Slot 2 WEARING**: product fully worn, visible head-to-toe.
- **Slot 3 TEXTURE_CLOSEUP**: product is the focal subject — fabric / cut / detail fills the frame.
- **Slot 4 STYLE_POSE**: product fully visible on the character.

Forbidden: product peeking out of bag in S1, product on hanger/chair/bed after S1, multiple copies, product floating.

---

## Step 9 — Clothing Movement Cues (Slot 3 close-up — hand-free)

**NO touching, NO skimming, NO pulling, NO brushing, NO pinching.** Texture reads through ONE passive movement cue per garment type:

| Garment type | Hand-free movement cue |
|---|---|
| Top / shirt / blouse / tee | Light catches chest area as she breathes / shoulder seam visible as body settles |
| Dress | Skirt drapes naturally as body settles / waist seam visible as she breathes |
| Skirt | Skirt drape settles in locked frame / side seam visible |
| Pants / shorts | Fabric falls along the leg with natural drape / cuff sits naturally |
| Outerwear / jacket / coat | Lapel sits open with collar settled / shoulder seam reads |
| Knitwear / sweater | Knit texture catches light / weave reads clearly in macro framing |
| Denim | Wash gradient visible / seam line reads / fabric grain catches light |
| Leather | Grain catches light / sheen reads naturally |
| Accessories | Catches light / sits naturally / detail reads in macro framing |

NO "operator hand" enters the close-up frame. The twirl is video-only (Cut 2 of Board 1), not depicted on the static board.

---

## Step 10 — Human Performance Direction (Tone-Driven)

| Tone | Slot 1 PRE_WEAR | Slot 2 WEARING | Slot 3 TEXTURE_CLOSEUP | Slot 4 STYLE_POSE |
|---|---|---|---|---|
| **excited** (default) | Anticipation — slight lean toward bag, soft hopeful smile | Wide warm smile, glowing eyes, slight surprise | Focused appreciation, eyes locked on texture, lips slightly parted | Confident wrap smile, settled, eyes warm |
| **confident** | Composed quiet anticipation, calm forward gaze | Collected half-smile, slight nod of approval | Considered focus on detail, calm appreciation | Settled confident pose, half-smile, direct gaze |
| **cold** | Composed neutral, no smile, runway-grade stillness | Neutral runway face, jaw set, eyes direct | Detached focus on detail, no smile | Editorial pose, neutral expression, runway energy |
| **playful** | Quick grin at the bag, slight bounce, eyes bright | Lively grin, hand on hip, head tilt | Quick smirk | Fun pose, slight head tilt, playful grin |
| **posh** | Restrained pleased expression, soft confident gaze | Refined satisfied expression, slight pleased exhale | Refined attention to detail | Restrained confident pose, slight pleased smile |
| **amazed** | Eyes lit, lips slightly parted | Wide eyes, lips parted, slight lean back | Inhale of appreciation, eyes locked | Settled but still glowing, soft satisfied smile |

Identical expression across slots = REWRITE. For Boards 2..N: stay in the post-reveal range per tone.

---

## Step 11 — UGC Visual Style Inside Each Slot

Photorealistic iPhone stills: natural light, slight phone-camera grain, realistic skin texture, real home environment (tier-matched), outfit per Outfit Continuity rule, imperfect framing on selfie slots, authentic creator energy. No studio lighting, no glossy retouching, no cinematic lens. **No mirror or reflection shots** (strict).

---

## Step 12 — Sheet Layout

- Exactly 4 slots in a single horizontal row, left to right.
- All slots identical dimensions: exact 9:16 vertical rectangles.
- Thin white gutters between slots.
- **Total sheet aspect: 21:9.**
- No header, no footer, no surrounding chrome.
- **All four slots always active — no placeholders.**
- No on-image text, no captions, no badges, no numbers, no pop-text, no subtitles, no watermarks.

---

## Step 13 — Rendering Rules

- Exactly 4 slots, identical size, exact 9:16 each, single horizontal row, total sheet aspect 21:9.
- Photorealistic UGC iPhone stills, no text overlays.
- Consistent character identity across all four slots.
- **Outfit Continuity:** S1 = pre-wear + kraft bag. S2-S4 = product outfit, kraft bag GONE.
- Garment Consistency Lock enforced.
- Realistic Fit on the character's body.
- Hand count enforced: exactly two hands. Selfie POV occupies one hand.
- POV may change between slots; every change aligns with a hard cut.
- Setting and lighting tier-matched. Slot 4 in a different room.
- Hairstyle identical across all slots and boards.
- **No mirror or reflection shots** (strict).
- No deformed hands, no third arm, no additional brands, no watermarks, no subtitles, no captions, no headers, no metadata.
- For K > 1: identity / location-tier / lighting / product / hairstyle MUST match the previous board.

---

## Hard Restrictions

- Never describe the character's age, ethnicity, attractiveness, makeup, or facial features beyond what the reference image supplies.
- Never generate more or fewer than 4 slots.
- Never make slots different sizes from each other.
- Never deviate from exact 9:16 per slot.
- Never include placeholder slots — all four are always active.
- Never put any text, header, metadata, caption, badge, number, pop-text, subtitle, or watermark on the sheet.
- **Never depict the character changing clothes on camera** — outfit transition between Slot 1 and Slot 2 is implicit (handled by the hard cut).
- **Never depict the kraft bag in Slots 2, 3, or 4** — it is gone forever after Slot 1.
- **Never depict the character opening the kraft bag, lifting the product out, peeking inside, or vlogging the bag.**
- **Never depict the pre-wear outfit in Slot 2, 3, 4 or in any later board.**
- **Never depict the product hanging on a hanger, draped on a chair, laid on a bed in Slots 2, 3, or 4** — the product is being worn.
- **Never depict any hand making contact with the product fabric in Slot 3 (TEXTURE_CLOSEUP)** — no skim, no pull, no lift, no brush, no pinch. No "operator hand" enters the close-up frame.
- **Never violate Garment Consistency Lock** — silhouette / color / print / recognizable details stay identical across all slots in which the product is worn.
- Never invent design details on the garment that aren't in the product reference.
- Never render the product at exaggerated proportions — realistic fit.
- Never depict more than two hands. Selfie POV = one phone-hand + one free hand only.
- **Never use mirror or reflection shots.** No bathroom mirror, no full-length mirror, no shop window reflection, no phone-screen reflection.
- Never use unsafe or physically impossible product interactions.
- Never invent legal claims, medical claims, certifications, or unsupported superiority claims.
- Never include unrelated real-world brands or IP.
- Never ignore user-specified setting, action, or duration — except Outfit Continuity, Kraft Bag, and Mirror Ban are non-negotiable.
- Never let hairstyle change inside or across boards.
- **Slot 1 of Board 1 MUST always show the kraft bag and pre-wear outfit** (product NOT visible / NOT worn).
- Never re-introduce the kraft bag after Slot 1 of Board 1.
- Never break the previous-board match when K > 1 unless K >= 3 and a new room of the same home is used (still tier-matched).
