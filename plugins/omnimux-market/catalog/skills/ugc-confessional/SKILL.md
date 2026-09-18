# Ads UGC Skill (Generic 3-Slot)

End-to-end producer for generic UGC video ads — beauty, skincare, fragrance, food, drink, tech, lifestyle, etc. Plans the boards, generates a 16:9 storyboard sheet for each board, writes the Seedance video prompt for each board, generates each 9:16 clip, concatenates them if multi-board, and returns the final assembled video asset.

## Why this skill exists

Most UGC ad formats — talking-head reviews, demos, before/after, application+reaction — fit a **3-slot 16:9 board → ONE Seedance clip with THREE internal hard cuts** paradigm: hook (selfie hook), main (locked-off demo / application), closer (recap / recommendation). The classic FULL_ARC POV cadence is `SELFIE → TRIPOD → SELFIE`. Squeezing this format into the scene-per-call model loses the single-take feel and fragments the lipsync.

The sibling UGC skills handle their own narrow formats:
- `ads-ugc-unboxing-skill` — 4-slot 21:9 PACKED → REVEAL → PRODUCT-FOCUS → SATISFACTION
- `ads-ugc-try-on-skill` — 4-slot 21:9 PRE_WEAR → WEARING → TEXTURE_CLOSEUP → STYLE_POSE

This skill is the **generic base** for everything else — and it's the most-used UGC format, so trigger it whenever the brief doesn't specifically call for unboxing or try-on.

This skill bakes in the format:
- Each board = ONE Seedance clip with THREE internal hard cuts (3-slot 16:9 board image).
- Board carries an **arc role** (HOOK / HOOK+SETUP / MAIN / REVEAL / APPLY / APPLY+CLOSER / CLOSER / FULL_ARC) that determines the 3-slot mini-arc inside it.
- Multi-board (>15s total) chains boards; the producer assigns arc roles per board.
- **Default emotional register is HIGH-ENERGY / hyped throughout** (Pattern B — sustained INSANELY hyped). Switch to calmer registers (A / C / D) only when the brief signals a calm aesthetic.

## Persona precondition (HARD GATE — read first)

**This skill does NOT create personas.** The producer / creative-director must call `setup_persona` BEFORE dispatching this skill so that `persona:<id>` (image) AND `persona:<id>:voice` (voice anchor) are both registered. Without the voice anchor, every `generate_scene_video` call fails preflight with `_canonical_persona_for_speaker returned None` and the whole run cascades.

**If the dispatch brief asks you to "create a persona" or says "no pre-existing persona":**

- **Do NOT call `generate_image` with `output_asset_id="persona:<id>"`** — that registers an image only, leaves the voice anchor undefined, and the first `generate_scene_video` will fail.
- **Do NOT call `setup_persona`** — that tool is producer-level and not available to skill subagents.
- **Bail out immediately.** Return `is_success: false` with `reason: "persona '<id>' not registered — please call setup_persona before re-dispatching ads-ugc-skill"`. The producer will register the persona and retry.

The Seedance preflight will emit the same instruction verbatim if you ignore this and try anyway — saving the round-trip by checking upfront is cheaper than wasting a board generation.

## Inputs

Provided in the producer's dispatch prompt:

- **product** *(optional)* — name, brand, category, key details, plus a product image asset ID (e.g. `product:bottle`) if an image exists. UGC also supports product-less talking-head / lifestyle stories — set `product_present=false`.
- **character** — REQUIRED. Persona asset ID (e.g. `persona:maya`) **already registered by `setup_persona`** (see Persona precondition above), and the persona's `kling_voice_id` from the persona bundle the producer received. Seedance auto-resolves the voice timbre from the registry via the `persona:<name>` speaker reference; `voice_id` is also threaded through for Kling parity. **Never pass `persona:<name>:voice` as a reference image** — voice routes via `dialogue[].voice_id`, not through image slots. **Never call `generate_image` to "create" the persona yourself** — see Persona precondition.
- **total_duration** — total ad length in seconds (4-60).
- **monologue** — the full spoken script across all boards. The producer is responsible for splitting it into per-board segments. Must obey the no-greetings rule for Boards 2..N (the clip guide enforces this).
- **tone / aesthetic** *(optional)* — free-text mood signal. If the brief signals a calm aesthetic (`goth` / `vampire` / `cinematic noir` / `cold` / `passive` / `deadpan` / `clinical` / `refined` / `luxury-passive` / `minimal` / `somber` / `serious` / `dark` / `shadowy`), the clip guide switches off the default Pattern B sustained-hyped register and the K=1 trailer-sounds. Default (anything else, or empty) = Pattern B sustained hyped.
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

Assign an `arc_role` to each board:

| N | Default arc-role sequence |
|---|---|
| 1 | `FULL_ARC` |
| 2 | `HOOK+SETUP` → `APPLY+CLOSER` |
| 3 | `HOOK` → `MAIN` → `CLOSER` |
| 4 | `HOOK` → `REVEAL` → `APPLY` → `CLOSER` |

(Adjust based on the brief — e.g. a serum review wants `HOOK → REVEAL → APPLY → CLOSER`; a tech demo may want `HOOK → MAIN → CLOSER`.)

Split `monologue` into `N` segments at natural phrase boundaries — roughly proportional to per-board duration. Verify NO sentence or near-identical phrase repeats across boards (the clip guide's no-repeat rule).

### 2. For each board K from 1 to N

**a. Compose the board image prompt** following [references/board-prompt-guide.md](references/board-prompt-guide.md).

Apply the guide's `@ImageN` ordering exactly — the order maps directly to the `image_urls` array you pass to `generate_image`. Typical order: `[product, character, prev_board]` (omit any absent, preserve relative order).

**b. Generate the board sheet** via `generate_image`:

| Parameter | Value |
|---|---|
| `prompt` | the composed board prompt (full template instantiated) |
| `image_urls` | per the board guide's Image Reference Order — `[product, character]` for K=1 with product, `[product, character, prev_board]` for K>1, `[character]` for product-less |
| `aspect_ratio` | `16:9` |
| `resolution` | `1K` |
| `model` | `"gpt-image-2"` — 3-slot 16:9 storyboard sheets render with stronger slot separation and cleaner layout structure on gpt-image-2 than on the default nano-banana-2. **Layout guard: the board-prompt-guide's Required Prompt Template includes explicit anti-stack / anti-label phrasing** because gpt-image-2 otherwise (a) lays slots out as horizontal bands stacked top-to-bottom instead of vertical panels side-by-side, and (b) adds forbidden "SLOT 1 / SLOT 2 / SLOT 3" typography. Always use the guide's template verbatim; never shorten the anti-stack / anti-label clauses. |
| `output_asset_id` | `ugc:board:K` |

**c. Compose the Seedance clip prompt** following [references/clip-prompt-guide.md](references/clip-prompt-guide.md).

Inputs to the composer: the board image you just generated, the same character / product refs, `K`, `N`, `clip_duration`, `arc_role`, this board's `monologue_segment`, and the tone signal (if any).

Per the clip guide:
- K = 1 may include up to 3 bracketed non-verbal sounds at the start of Audio (default Pattern B; skip for calm-tone briefs).
- K > 1 audio MUST NOT start with greetings or product re-introductions — open mid-thought.
- Each cut has 5+ micro-beats and at least one within-cut motion beat.
- Default emotional register is **Pattern B sustained-hyped** — explosive scream-gasp opener, peak energy through main, peak-victory closer. Switch to Pattern A / C / D only when the brief signals a calm aesthetic.
- For application/demo cuts: respect cap-removal logic, single-action-per-cut, and body-part target lock (perfume → wrist/neck, lipstick → lips, etc).
- Forbidden AI-tell phrases (`I'm obsessed`, `you have to try this`, generic praise, AI sales-speak) NEVER appear in the monologue or the K=1 trailer sounds.

**d. Generate the 9:16 clip** via `generate_scene_video`:

| Parameter | Value |
|---|---|
| `backend` | `"seedance"` |
| `start_image` | `ugc:board:K` — the board sheet is the first-frame image and Seedance's narrative map |
| `reference_images` | `[character, product]` (plus `ugc:board:K-1` when K>1; product omitted when product-less), in that order. **IMAGES ONLY** — never put a voice asset here. |
| `motion` | the composed Seedance prompt. Reference assets inline with `{{persona:<name>}}` / `{{product:<id>}}` tokens. End the motion with one `{{speak:persona:<name>}}…{{/speak}}` span wrapping this board's `monologue_segment` verbatim — Seedance distributes the line across the 3 cuts at natural phrase boundaries. |
| `dialogue` | a single-entry array: `[{"speaker": "persona:<name>", "text": "<monologue_segment verbatim>", "voice_id": "<kling_voice_id>", "delivery": "<2-6 word tone — e.g. 'warm, conversational' for Pattern A, 'hyped, scream-gasp energy' for Pattern B, 'deadpan, restrained' for Pattern D>"}]`. **Required whenever motion contains a `{{speak:X}}` span.** |
| `duration` | this board's `clip_duration` rounded to an integer in `[3, 15]` (the tool's hard range) |
| `aspect_ratio` | `"9:16"` |
| `output_asset_id` | `ugc:board:K:video` |
| `scene_number` | `K - 1` (0-based) |

The mode default backend is already Seedance in creative mode, so `backend` can be omitted. Pass it explicitly anyway — UGC's 3-cut single-clip paradigm depends on Seedance's reference-to-video behavior and a silent backend swap to Kling would break the format.

**e. Extract the audio track** via `split_audio`:

| Parameter | Value |
|---|---|
| `video_url` | `ugc:board:K:video` |
| `output_asset_id` | `ugc:board:K:audio` |
| `scene_number` | `K - 1` |

Seedance bakes the synthesized speech into the video. `split_audio` pulls it back out as a standalone MP3 — the assembler needs this as the frame-aligned voice track (NOT any upstream original audio).

**f. Transcribe to word-level timestamps** via `transcribe_audio`:

| Parameter | Value |
|---|---|
| `audio_url` | `ugc:board:K:audio` |
| `script_text` | this board's `monologue_segment` verbatim — corrects STT brand-name misspellings and removes hallucinated words |
| `output_asset_id` | `ugc:board:K:words` |
| `scene_number` | `K - 1` |

The returned `words_file` (registered under `ugc:board:K:words`) carries `[{word, start, end}, ...]` timing. Passing it to the assembler lets the renderer build per-word caption animations without re-transcribing.

### 3. Assemble the final video

Call `assemble_video` with one `scenes[]` entry per board, in order:

```
scenes = [
  {
    "asset_url":   "ugc:board:1:video",
    "audio_url":   "ugc:board:1:audio",
    "words_file":  "ugc:board:1:words",
  },
  ...
  {
    "asset_url":   "ugc:board:N:video",
    "audio_url":   "ugc:board:N:audio",
    "words_file":  "ugc:board:N:words",
  },
]
```

Plus:
- `output_asset_id`: `ugc:final:video`
- `aspect_ratio`: `9:16`

The assembler concatenates the per-board videos, mixes the per-board audio frame-aligned to lip movement, and renders word-by-word captions on top from each board's `words_file`. **`assemble_video` replaces `concatenate_videos` here** — it adds captions, supports overlays, and handles the audio/video sync correctly.

For `N = 1`, still call `assemble_video` with one scene — single-board needs captions and overlays just as much as multi-board, and the API is identical.

**Optional overlays:** If the brief mentions a hook headline or CTA copy, pass `hook_overlay` (first board) and `text_overlays` (per-board, e.g. CTA on Board N). Before placing any face-area overlay, `get_asset` on the board sheet to see where the head/torso lands per slot — keep hooks above the head, CTAs below the torso. Skip overlays entirely when the brief doesn't call for them.

### 4. Write the plan file

Save `/tmp/outputs/ugc-plan.md` per [templates/ugc-plan-template.md](templates/ugc-plan-template.md). The plan documents: total duration, board count, tone signal, per-board metadata (arc_role, clip_duration, POV cadence, framing-distance cadence), monologue segmentation, the verbatim board prompt and Seedance prompt for every board, and the final asset ID.

### 5. Return

Final response from the skill is a one-paragraph summary stating: total duration, board count, arc-role sequence, the final asset ID (`ugc:final:video` — always, since `assemble_video` registers under that ID for N=1 too), and the path to the plan file.

## Hard rules

- **Always 3 slots per board, exact 9:16 each, total sheet aspect 16:9.** All three slots active — no placeholders. The 4-slot 21:9 paradigm belongs to the sibling skills (unboxing, try-on); never produce a 4-slot sheet here.
- **One `generate_scene_video` call per board.** Never split a board's 3 cuts across multiple calls — those three cuts are INTERNAL to one video. The hard cuts come from the `Hard cut to.` markers inside `motion`, not from concatenation.
- **`assemble_video`, not `concatenate_videos`, is the final step.** `concatenate_videos` only joins MP4s — it can't add captions, hooks, music, or sync audio/video. Always run `split_audio` → `transcribe_audio` per board first, then feed all three asset IDs into `assemble_video.scenes[]`.
- **Pass `ugc:board:K:audio` (the split track) as `audio_url`, NEVER `persona:<name>:voice`.** Seedance regenerates speech with its own per-board timing baked into the video; only the split track is frame-aligned to lip movement. Passing the original voice asset desyncs the mouth.
- **Board image is 16:9, video is 9:16.** Never swap aspect ratios on those calls.
- **`{{speak:persona:<name>}}…{{/speak}}` + matching `dialogue[]` entry is mandatory** for any board with a monologue segment. Voice routes via `dialogue[].voice_id` and is auto-resolved from the persona registry — **never put `persona:<name>:voice` in `reference_images`**, the preflight rejects non-image assets in image slots.
- **For K > 1, always pass board K-1's image as a reference image** in both the board generation (`image_urls`) and clip generation (`reference_images`) so character / wardrobe / lighting / product state stay continuous across boards. The clip guide's cross-board cap-state continuity rule applies: never re-close a previously-opened product across boards.
- **Slot Action Diversity is mandatory:** the 3 slots show 3 DIFFERENT physical actions AND 3 DIFFERENT framing distances (TIGHT / MID / WIDE bands all represented). If the board guide's distance-band rule fails, regenerate the board.
- **Default emotional register is Pattern B (sustained INSANELY hyped) — switch to A / C / D only when the brief explicitly signals a calm-tone aesthetic.** Don't default to a polite warm-Pattern-A read; UGC ads convert harder on explosive energy. The clip-guide calibration phrase (`performed by an INSANELY hyped creator with explosive screaming energy throughout`) MUST close the Narrative Summary for Pattern B clips.
- **Body-part target lock is non-negotiable.** Perfume → wrist/neck; lipstick → lips; cream/serum → fingertip first then face; food → mouth; etc. If the user's wording violates the lock ("she sprays perfume on her palm"), silently override to the correct target — physical realism beats user wording.
- **Single action per cut.** One press, one swipe, one sip, one mist — never `sprays again` / `presses repeatedly` / `back and forth`. Multiple actions split across cuts.
- **No phone object in any frame.** Selfie POV = the camera IS the phone. The clip guide enforces forbidden words (`mirror selfie`, `phone in her hand`, etc).
- **No mirror or reflection shots.** No bathroom mirror, no shop-window reflection, no phone-screen reflection.
- **TRIPOD cuts contain ZERO camera movement language.** The clip guide lists the forbidden words (`handheld`, `shake`, `drift`, `wobble`, ...) for tripod cuts.
- **ONE product instance only.** Never duplicated, never multiplied. Even when the action implies "lots of perfume" / "shopping bag full of product", explicitly fight the multiplication with "exactly one bottle" / "single product instance" in the cut description.
- **Forbidden first-word openers** (`OK` / `Okay` / `Alright` / `So` / `Um` / `Well` / `Wait` / `Like` as the literal first word). If the monologue starts with one, rewrite the opener to lead with hook content.

## When NOT to use this skill

Hand off to a sibling skill if the brief is specifically:

- **Unboxing / package reveal / "open the box"** → use `ads-ugc-unboxing-skill` (4-slot 21:9 board with PACKED → REVEAL → PRODUCT-FOCUS → SATISFACTION).
- **Try-on / fit check / outfit reveal / clothing haul** → use `ads-ugc-try-on-skill` (4-slot 21:9 board with PRE_WEAR → WEARING → TEXTURE_CLOSEUP → STYLE_POSE; supports tone, location_tier, pose hints).

Everything else — talking-head review, product demo, before/after, application+reaction, lifestyle ad, testimonial — belongs here.

## Reference resources

- [references/board-prompt-guide.md](references/board-prompt-guide.md) 📖 — Full guide for composing the 16:9 board image prompt: 3-slot story arcs by `arc_role`, POV cadence, hand allocation, Angle Lock + Realistic Scale + Placement Logic for the product, slot action diversity, distance-band rule, Pattern-B hook variant defaults, hyped-by-default expression register, no-mirror rule. **Read before composing any board prompt.**

- [references/clip-prompt-guide.md](references/clip-prompt-guide.md) 📖 — Full guide for composing the Seedance clip prompt: time-slicing across 3 cuts, TRIPOD vs SELFIE language, hand allocation per cut, action sequences by product type, cap/lid logic, body-part target lock, quirk-beat rules for residue-leaving products, K=1 trailer sounds vs K>1 mid-thought openers, forbidden AI-tell phrases, no-repeat phrase rule, forbidden first-word openers, quality suffix. **Read before composing any Seedance prompt.**

- [templates/ugc-plan-template.md](templates/ugc-plan-template.md) — Output plan file format.

---

**Usage**: Dispatched by Producer / Creative Director when the brief calls for a generic UGC ad (talking-head, demo, before/after, application+reaction, testimonial). Self-contained: plans, generates board sheet(s), composes Seedance prompt(s), generates clip(s), concatenates if multi-board, returns the final video asset ID. References use progressive disclosure — read only when needed.