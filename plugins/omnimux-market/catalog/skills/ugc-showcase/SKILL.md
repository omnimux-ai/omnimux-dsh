# Ads UGC Product Skill (Product-Hero, Voice-Over Only)

End-to-end producer for product-hero UGC ads — appliances, peripherals, tools, beauty products, kitchenware — where the product is the focal subject of every frame and any visible person is auxiliary (cropped, hands-only, first-person POV). Audio is off-screen voiceover, not on-camera dialogue. Plans the boards, generates a 21:9 storyboard sheet for each board, writes the Seedance video prompt for each board, generates each 9:16 clip, concatenates them if multi-board, and returns the final assembled video asset.

## Why this skill exists

The sibling UGC skills all put the **creator** as the focal subject:
- `ads-ugc-skill` — 3-slot 16:9 creator talking-head / demo with on-camera dialogue
- `ads-ugc-unboxing-skill` — 4-slot 21:9 creator unboxing with on-camera reactions
- `ads-ugc-try-on-skill` — 4-slot 21:9 creator wearing the product

This skill is the **product-hero counterpart** — the product is the only consistent subject across slots; the person is incidental (cropped, hands-only, first-person POV, sometimes absent). Audio is **off-screen voiceover** describing the product's benefits — never on-camera dialogue. The auxiliary person's mouth is closed in every cut; no lip-sync, no speaking gesture.

The format baked in here:
- **4-slot 21:9 board → ONE Seedance clip with FOUR internal hard cuts.** Same single-clip paradigm as the unboxing / try-on skills.
- **Board 1 always carries the canonical arc: PRODUCT-INTRO → PRODUCT-DEMO-A → PRODUCT-DEMO-B → PRODUCT-RESULT.** Slot 4 MUST be visually distinct from Slot 1.
- **Slot 2 (DEMO-A) and Slot 3 (DEMO-B) must show distinctly different demo angles** — different action, target, scale, or context. Never "same shot, different scale".
- **Product is REQUIRED** — this flow does not generate no-product / talking-head shots.
- **Auxiliary person identity is NOT preserved** across slots — only `voice_gender` consistency is enforced. Different boards may show different incidental people.
- **iPhone aesthetic is mandatory** — the static product shots are vulnerable to drifting into commercial/editorial product-ad polish; the reference enforces explicit anti-studio phrasing.

## Persona precondition (HARD GATE — read first)

**This skill needs a voice-only persona, not an image persona.** The producer / creative-director must call `setup_persona(voice_only=true, character_id="<id>", gender=<voice_gender>, ...)` BEFORE dispatching this skill so that `persona:<id>:voice` is registered. The auxiliary person is rendered inline in the board (no image reference is preserved across slots), but the voice anchor is still required because every `generate_scene_video` call wraps the voiceover in a `{{speak:persona:<id>}}` span.

**If the dispatch brief asks you to "create a persona" or says "no pre-existing persona":**

- **Do NOT call `generate_image` with `output_asset_id="persona:<id>"`** — that registers an image only, leaves the voice anchor undefined, and the first `generate_scene_video` will fail preflight with `_canonical_persona_for_speaker returned None`.
- **Do NOT call `setup_persona`** — that tool is producer-level and not available to skill subagents.
- **Bail out immediately.** Return `is_success: false` with `reason: "voice persona '<id>' not registered — please call setup_persona(voice_only=true, gender=<voice_gender>) before re-dispatching ads-ugc-product-skill"`. The producer will register the voice persona and retry.

## Inputs

Provided in the producer's dispatch prompt:

- **product** — REQUIRED. Name, brand, category (appliance / peripheral / cosmetics / drink / tool / accessory / etc.), key visual details, mechanism / applicator type, plus a **product image asset ID** (e.g. `product:vacuum`). A product image is mandatory — Angle Lock cannot hold without one and the board generator can't render the product convincingly from text alone.
- **voice_persona** — REQUIRED. Persona asset ID for the voiceover voice (e.g. `persona:narrator`) **already registered as voice-only by `setup_persona(voice_only=true)`** (see Persona precondition above), and the persona's `kling_voice_id` for Kling parity. **Never pass `persona:<id>:voice` as a reference image** — voice routes via `dialogue[].voice_id`, not through image slots.
- **voice_gender** — REQUIRED. One of: `female` / `male` / `random`. Drives the voiceover voice timbre AND the gender of any auxiliary person rendered in frame. `random` → pick `female` or `male` once at the start of planning and lock that choice for the entire pipeline (every board uses the same gender).
- **total_duration** — total ad length in seconds (4-60).
- **voiceover** — the full off-screen voiceover script across all boards. Benefit-driven, mid-thought openers only — no greetings, no host intros, no "today I'm showing you", no product re-introductions on Boards 2..N. Producer is responsible for splitting it into per-board segments.
- **aspect_ratio** — output video aspect ratio (default `9:16`).

If anything is unclear, infer sensible defaults and document the assumption in the plan file.

## Workflow

### 1. Plan the boards

Decide board count `N` from `total_duration`. Each board's `clip_duration` must land in `[4, 15]`:

| total_duration | N | per-board clip_duration |
|---|---|---|
| ≤15s | 1 | total_duration |
| 16-30s | 2 | ~15s + remainder, balanced |
| 31-45s | 3 | ~15 + 15 + remainder, balanced |
| 46-60s | 4 | ~15s each |

For each board, decide:
- `arc_role`: K=1 → `BOARD_1_PRODUCT_DEMO`; K>1 → `BOARD_K_PRODUCT_DEMO` (additional demo angles distinct from Board 1's).
- For Board 1: the 4 slots ALWAYS follow PRODUCT-INTRO → PRODUCT-DEMO-A → PRODUCT-DEMO-B → PRODUCT-RESULT.
- For K>1: pick 4 additional demo angles / contexts / scales not already covered by Board 1. Slot 1 of K>1 does NOT have to be a fresh intro — pick up post-demo state from Board K-1.

Split `voiceover` into `N` segments at natural phrase boundaries — roughly proportional to per-board duration. Verify no sentence or near-identical phrase repeats across boards (the clip guide enforces this). Verify no segment opens with a greeting / host intro / product re-introduction.

### 2. For each board K from 1 to N

**a. Compose the board image prompt** following [references/board-prompt-guide.md](references/board-prompt-guide.md).

Set `voice_gender` so the board guide can match the auxiliary person's gender to the voiceover voice. The board generator renders the auxiliary person inline — no character reference image is needed.

Apply the guide's `@ImageN` ordering exactly. Order is `[product]` for K=1, `[product, prev_board]` for K>1.

**b. Generate the board sheet** via `generate_image`:

| Parameter | Value |
|---|---|
| `prompt` | the composed board prompt (full template instantiated) |
| `image_urls` | per the board guide's Image Reference Order — `[product]` for K=1, `[product, prev_board]` for K>1 |
| `aspect_ratio` | `21:9` |
| `resolution` | `1K` |
| `model` | `"gpt-image-2"` — 4-slot 21:9 storyboard sheets render with stronger slot separation and cleaner panel-to-panel layout on gpt-image-2 than on the default nano-banana-2. **Layout guard: the board-prompt-guide's Required Prompt Template includes explicit anti-stack / anti-label phrasing** because gpt-image-2 otherwise (a) lays slots out as horizontal bands stacked top-to-bottom instead of vertical panels side-by-side, and (b) adds forbidden "SLOT 1 / SLOT 2 / SLOT 3 / SLOT 4" typography. Always use the guide's template verbatim; never shorten the anti-stack / anti-label clauses. |
| `output_asset_id` | `productugc:board:K` |

**c. Compose the Seedance clip prompt** following [references/clip-prompt-guide.md](references/clip-prompt-guide.md).

Inputs to the composer: the board image you just generated, the product ref, `K`, `N`, `clip_duration`, `arc_role`, `voice_gender`, and this board's `voiceover_segment`.

Per the clip guide:
- Audio is **off-screen voiceover only**. No bracketed non-verbal sounds (no `[*explosive gasp*]` — those belong to creator-hero flows). The Audio line uses `she describes` / `he describes` per `voice_gender`.
- Auxiliary person's mouth is CLOSED in every Cut. No "smiles at camera", no "looks at camera", no "explains while holding".
- Cut 1 (PRODUCT-INTRO) is establishing only — no active demo motion.
- Cut 2 (PRODUCT-DEMO-A) and Cut 3 (PRODUCT-DEMO-B) are the substance — distinctly different demo motions per the guide's per-category Cut 2 vs Cut 3 pairings table.
- Cut 4 (PRODUCT-RESULT) lands the outcome. Must be visually distinct from Cut 1 (different angle / scale / surface, OR result visible).
- Each cut has 5+ kinetic micro-beats focused on product mechanics and environmental motion (not facial expressions).
- iPhone aesthetic enforcement is mandatory — the Style & Mood line MUST close with the anti-editorial calibration phrasing, and the quality suffix MUST close with the iPhone anchor block.

**d. Generate the 9:16 clip** via `generate_scene_video`:

| Parameter | Value |
|---|---|
| `backend` | `"seedance"` |
| `start_image` | `productugc:board:K` — the board sheet is the first-frame image and Seedance's narrative map |
| `reference_images` | `[product]` (plus `productugc:board:K-1` when K>1), in that order. **IMAGES ONLY** — never put a voice asset here. No character reference image — auxiliary person renders inline. |
| `motion` | the composed Seedance prompt. Reference the product inline with `{{product:<id>}}`. End the Audio line with ONE `{{speak:persona:<voice_persona>}}…{{/speak}}` span wrapping this board's `voiceover_segment` verbatim. Seedance distributes the line across the 4 cuts at natural phrase boundaries. |
| `dialogue` | a single-entry array: `[{"speaker": "persona:<voice_persona>", "text": "<voiceover_segment verbatim>", "voice_id": "<kling_voice_id>", "delivery": "<2-6 word tone — e.g. 'calm, benefit-driven', 'energetic creator commentary', 'matter-of-fact demo'>"}]`. **Required** because motion contains the `{{speak:X}}` span. |
| `duration` | this board's `clip_duration` rounded to an integer in `[3, 15]` (the tool's hard range) |
| `aspect_ratio` | `"9:16"` |
| `output_asset_id` | `productugc:board:K:video` |
| `scene_number` | `K - 1` (0-based) |

The mode default backend is already Seedance in creative mode, so `backend` can be omitted. Pass it explicitly anyway — the 4-cut single-clip paradigm depends on Seedance's reference-to-video behavior and a silent backend swap to Kling would break the format.

**e. Extract the audio track** via `split_audio`:

| Parameter | Value |
|---|---|
| `video_url` | `productugc:board:K:video` |
| `output_asset_id` | `productugc:board:K:audio` |
| `scene_number` | `K - 1` |

Seedance bakes the synthesized voiceover into the video. `split_audio` pulls it back out as a standalone MP3 — the assembler needs this as the timing-aligned voice track. (Unlike on-camera dialogue, there's no lip-sync to worry about here, but the split track is still required because `assemble_video` mixes audio per scene.)

**f. Transcribe to word-level timestamps** via `transcribe_audio`:

| Parameter | Value |
|---|---|
| `audio_url` | `productugc:board:K:audio` |
| `script_text` | this board's `voiceover_segment` verbatim — corrects STT brand-name misspellings and removes hallucinated words |
| `output_asset_id` | `productugc:board:K:words` |
| `scene_number` | `K - 1` |

The returned `words_file` (registered under `productugc:board:K:words`) carries `[{word, start, end}, ...]` timing. Passing it to the assembler lets the renderer build per-word caption animations without re-transcribing.

### 3. Assemble the final video

Call `assemble_video` with one `scenes[]` entry per board, in order:

```
scenes = [
  {
    "asset_url":   "productugc:board:1:video",
    "audio_url":   "productugc:board:1:audio",
    "words_file":  "productugc:board:1:words",
  },
  ...
  {
    "asset_url":   "productugc:board:N:video",
    "audio_url":   "productugc:board:N:audio",
    "words_file":  "productugc:board:N:words",
  },
]
```

Plus:
- `output_asset_id`: `productugc:final:video`
- `aspect_ratio`: `9:16`

For `N = 1`, still call `assemble_video` with one scene.

**Optional overlays:** If the brief mentions a hook headline or CTA copy, pass `hook_overlay` (first board) and `text_overlays` (per-board). Since the auxiliary person is never the focal subject (cropped / hands-only / POV / absent), face-area overlays are usually safe — but `get_asset` on the board sheet first to confirm where the product lands per slot, and avoid covering the product or the demo target.

### 4. Write the plan file

Save `/tmp/outputs/ugc-product-plan.md` per [templates/product-plan-template.md](templates/product-plan-template.md). The plan documents: total duration, board count, voice_gender, per-board metadata (arc_role, clip_duration, POV cadence, framing-distance cadence, per-slot demo angles), voiceover segmentation, the verbatim board prompt and Seedance prompt for every board, and the final asset ID.

### 5. Return

Final response from the skill is a one-paragraph summary stating: total duration, board count, voice_gender, the final asset ID (`productugc:final:video` — always, since `assemble_video` registers under that ID for N=1 too), and the path to the plan file.

## Hard rules

- **Product is the hero of every slot AND every cut.** No "creator talking head" frames. No centered face portraits. The product is the focal element in every slot of the storyboard and every cut of the video.
- **Auxiliary person is NEVER the focal subject.** When present in any slot, they are cropped / hands-only / partial body / first-person POV / wide-context-distant. Identity is NOT preserved across slots — only `voice_gender` consistency is enforced within one board.
- **Auxiliary person's mouth is CLOSED in every slot and every cut.** Audio is off-screen voiceover only. No lip-sync, no speaking gesture toward the lens, no "explaining while holding".
- **`voice_gender` lock.** When `voice_gender` is `female`, every auxiliary person rendered in this board AND the voiceover voice are female. Same for `male`. `random` → pick one at planning time and lock it across the entire pipeline (every board uses the same gender).
- **Board 1 ALWAYS carries the canonical arc** PRODUCT-INTRO → PRODUCT-DEMO-A → PRODUCT-DEMO-B → PRODUCT-RESULT. Slot 1 MUST show the product in its native context (not yet in active demo). Slot 4 MUST be visually distinct from Slot 1 (different angle / scale / surface / pose).
- **Slot 2 and Slot 3 must be visually unmistakable demo variations.** Different action, different target, different scale, or different context. NEVER "same shot, different scale". The board guide's per-category Cut 2 vs Cut 3 pairings table is the source of truth.
- **One `generate_scene_video` call per board.** Never split a board's 4 cuts across multiple calls — those four cuts are INTERNAL to one video. The hard cuts come from the `Hard cut to.` markers inside `motion`, not from concatenation.
- **`assemble_video`, not `concatenate_videos`, is the final step.** Always run `split_audio` → `transcribe_audio` per board first, then feed all three asset IDs into `assemble_video.scenes[]`.
- **Pass `productugc:board:K:audio` (the split track) as `audio_url`, NEVER `persona:<id>:voice`.** Seedance bakes the synthesized voiceover into the video with its own timing; only the split track is timing-aligned to the per-cut beats.
- **Board image is 21:9, video is 9:16.** Never swap aspect ratios on those calls.
- **One `{{speak:persona:<voice_persona>}}…{{/speak}}` span + matching `dialogue[]` entry per board.** The text in the dialogue entry must exactly match the `{{speak}}` span contents.
- **For K > 1, always pass board K-1's image as a reference image** in both the board generation (`image_urls`) and clip generation (`reference_images`) so product / location / lighting / overall aesthetic stay continuous across boards.
- **iPhone aesthetic is mandatory.** The Style & Mood line MUST include the anti-editorial calibration phrasing (`NOT editorial product photography, NOT studio shoot, NOT magazine commercial`), and the quality suffix MUST close with the iPhone anchor block. Skipping this drift the output toward commercial product-ad polish, which loses UGC credibility — this flow is especially vulnerable because TRIPOD-locked product shots and MACRO product details naturally resemble commercial product photography.
- **No on-camera dialogue** — auxiliary person mouth closed throughout. The audio is voiceover, off-screen, always.
- **No bracketed non-verbal sounds** in the Audio line — no `[*explosive gasp*]`, no `[*hyped yelp*]`. Those belong to creator-hero flows. This is benefit-driven voiceover.
- **No mirror or reflection shots.** No phone object visible in any frame (FIRST-PERSON-POV = camera IS the phone; only the operator's hand/forearm may appear at the frame edge).
- **TRIPOD cuts contain ZERO camera movement language.** Forbidden words (`handheld`, `shake`, `drift`, `wobble`, ...) per the clip guide.
- **ONE product instance only.** Never duplicated, never multiplied.
- **Forbidden first-word openers** in voiceover (`OK` / `Okay` / `Alright` / `So` / `Um` / `Well` / `Wait` / `Like`) AND forbidden greeting openers (`hey` / `hi guys` / `today I'm showing you` / `so this is`).
- **Forbidden AI-tell phrases** in voiceover (`I'm obsessed` / `you have to try this` / `game changer` / `10/10` / generic praise without specifics).
- **Weight & Grip Logic** — never depict heavy products lifted single-handedly, never depict two-handed strain on light items, never balance paired products (dumbbells, kettlebells, earrings) on a single palm.

## When NOT to use this skill

Hand off to a sibling skill if the brief is specifically:

- **Creator talks to camera about the product** → use `ads-ugc-skill` (3-slot 16:9 talking-head / demo / before-after / application+reaction with on-camera dialogue).
- **Unboxing / package reveal / "open the box"** → use `ads-ugc-unboxing-skill` (4-slot 21:9 board with PACKED → REVEAL → PRODUCT-FOCUS → SATISFACTION; on-camera reactions to the unbox).
- **Try-on / fit check / outfit reveal / clothing haul** → use `ads-ugc-try-on-skill` (4-slot 21:9 board with PRE_WEAR → WEARING → TEXTURE_CLOSEUP → STYLE_POSE; supports tone, location_tier, pose hints; on-camera reactions).

This skill is the right pick when the brief is specifically about the **product demonstrating itself** — appliance demos, peripheral demos, tool demos, faceless beauty demos, "how it works" / "what it does" / "see it in action" framing — with voice-over narration and the creator NOT on camera as a focal subject.

## Reference resources

- [references/board-prompt-guide.md](references/board-prompt-guide.md) 📖 — Full guide for composing the 21:9 board image prompt: canonical PRODUCT-INTRO → DEMO-A → DEMO-B → RESULT arc, native-use accessories per category (2-3 across the 4 slots), POV cadence, Angle Lock + Realistic Scale + Weight & Grip Logic, per-category DEMO-A vs DEMO-B pairings, iPhone aesthetic enforcement with hard-banned editorial phrasing, no-mirror rule, no-on-camera-dialogue rule. **Read before composing any board prompt.**

- [references/clip-prompt-guide.md](references/clip-prompt-guide.md) 📖 — Full guide for composing the Seedance clip prompt: time-slicing across 4 cuts (back-loaded toward DEMO-A / DEMO-B), TRIPOD vs FIRST-PERSON-POV vs MACRO language, hand allocation per cut, natural grip patterns for tech peripherals, cap/lid logic, body-part / target lock, off-screen voiceover rules with `voice_gender` lock, forbidden AI-tell phrases, no-greeting / no-host-intro rule, no bracketed non-verbal sounds, iPhone aesthetic enforcement, quality suffix. **Read before composing any Seedance prompt.**

- [templates/product-plan-template.md](templates/product-plan-template.md) — Output plan file format.

---

**Usage**: Dispatched by Producer / Creative Director when the brief calls for a product-hero UGC ad (product demo, "how it works", appliance / tool / peripheral demo, voiceover product ad, faceless product video). Self-contained: plans the boards, generates board sheet(s), composes Seedance prompt(s), generates clip(s), assembles into the final video. References use progressive disclosure — read only when needed.