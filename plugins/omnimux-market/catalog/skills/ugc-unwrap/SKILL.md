# Ads UGC Unboxing Skill

End-to-end producer for UGC unboxing video ads. Plans the boards, generates a 21:9 storyboard sheet for each board, writes the Seedance video prompt for each board, generates each 9:16 clip, concatenates them if multi-board, and returns the final assembled video asset.

## Why this skill exists

The standard `ads-storyboard` + `ads-director` skills assume multi-scene narrative ads where each scene is a separate video generation call. UGC unboxing breaks that mold: **ONE Seedance call produces ONE 9:16 clip with FOUR INTERNAL HARD CUTS** that carry the unboxing arc. The board image is a 21:9 four-slot storyboard sheet that Seedance reads as a narrative map (not a frame template) for that single clip. Squeezing this format into the scene-per-call model loses the single-take feel, fragments the lipsync, and breaks the canonical arc.

This skill bakes in the format:
- Board 1 always carries the canonical arc: **PACKED → REVEAL → PRODUCT-FOCUS → SATISFACTION**.
- Each board = ONE Seedance clip with FOUR internal hard cuts.
- Multi-board (>15s total) chains boards; Boards 2..N continue the post-reveal exploration with previous-board continuity.

## Persona precondition (HARD GATE — read first)

**This skill does NOT create personas.** The producer / creative-director must call `setup_persona` BEFORE dispatching this skill so that `persona:<id>` (image) AND `persona:<id>:voice` (voice anchor) are both registered. Without the voice anchor, every `generate_scene_video` call fails preflight with `_canonical_persona_for_speaker returned None` and the whole run cascades.

**If the dispatch brief asks you to "create a persona" or says "no pre-existing persona":**

- **Do NOT call `generate_image` with `output_asset_id="persona:<id>"`** — that registers an image only, leaves the voice anchor undefined, and the first `generate_scene_video` will fail.
- **Do NOT call `setup_persona`** — that tool is producer-level and not available to skill subagents.
- **Bail out immediately.** Return `is_success: false` with `reason: "persona '<id>' not registered — please call setup_persona before re-dispatching ads-ugc-unboxing-skill"`. The producer will register the persona and retry.

## Inputs

Provided in the producer's dispatch prompt:

- **product** — name, brand, category, key details, plus a product image asset ID (e.g. `product:bag`) if an image exists.
- **character** — REQUIRED. Persona asset ID (e.g. `persona:maya`) **already registered by `setup_persona`** (see Persona precondition above), and the persona's `kling_voice_id` from the persona bundle the producer received. Seedance auto-resolves the voice timbre from the registry via the `persona:<name>` speaker reference; `voice_id` is also threaded through for Kling parity. **Never pass `persona:<name>:voice` as a reference image** — voice routes via `dialogue[].voice_id`, not through image slots. **Never call `generate_image` to "create" the persona yourself** — see Persona precondition.
- **package** *(optional)* — asset ID of a real delivery-package image. When absent, the skill describes a plain brown taped delivery box per the board guide's Case 2.
- **total_duration** — total ad length in seconds (4-60).
- **monologue** — the full spoken script across all boards. Must obey the no-greetings rule for Boards 2..N (the clip guide enforces this).
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

Split `monologue` into `N` segments at natural phrase boundaries — roughly proportional to per-board duration. Verify NO sentence or near-identical phrase repeats across boards (the clip guide's no-repeat rule).

### 2. For each board K from 1 to N

**a. Compose the board image prompt** following [references/board-prompt-guide.md](references/board-prompt-guide.md).

Set `arc_role`:
- K = 1 → `BOARD_1_CANONICAL_UNBOXING` (slots PACKED → REVEAL → PRODUCT-FOCUS → SATISFACTION).
- K > 1 → `BOARD_K_POST_REVEAL` (post-unboxing exploration; condition on board K-1).

Apply the guide's `@ImageN` ordering exactly — the order maps directly to the `image_urls` array you pass to `generate_image`.

**b. Generate the board sheet** via `generate_image`:

| Parameter | Value |
|---|---|
| `prompt` | the composed board prompt (full template instantiated) |
| `image_urls` | per the board guide's Image Reference Order — typical order: `[product, character, package, prev_board]` (omit any absent, preserve relative order) |
| `aspect_ratio` | `21:9` |
| `resolution` | `1K` |
| `model` | `"gpt-image-2.5-sunburst"` — 4-slot 21:9 storyboard sheets render with stronger slot separation and cleaner panel-to-panel layout on gpt-image-2.5-sunburst than on the default nano-banana-2. **Layout guard: the board-prompt-guide's Required Prompt Template includes explicit anti-stack / anti-label phrasing** because gpt-image-2.5-sunburst otherwise (a) lays slots out as horizontal bands stacked top-to-bottom instead of vertical panels side-by-side, and (b) adds forbidden "SLOT 1 / SLOT 2 / SLOT 3 / SLOT 4" typography. Always use the guide's template verbatim; never shorten the anti-stack / anti-label clauses. |
| `output_asset_id` | `unboxing:board:K` |

**c. Compose the Seedance clip prompt** following [references/clip-prompt-guide.md](references/clip-prompt-guide.md).

Inputs to the composer: the board image you just generated, the same character / product / package refs, `K`, `N`, `clip_duration`, this board's `monologue_segment`.

Per the clip guide:
- K = 1 may include up to 3 bracketed non-verbal sounds at the start of Audio.
- K > 1 audio MUST NOT start with greetings or product re-introductions — open mid-thought.
- Each cut has 5+ micro-beats and at least one within-cut motion beat.
- Expression evolves across the 4 cuts (anticipation → peak surprise → focused admiration → settled satisfaction for Board 1).

**d. Generate the 9:16 clip** via `generate_scene_video`:

| Parameter | Value |
|---|---|
| `backend` | `"seedance"` |
| `start_image` | `unboxing:board:K` — the board sheet is the first-frame image and Seedance's narrative map |
| `reference_images` | `[character, product, package]` (omit absent), in that order. **IMAGES ONLY** — never put a voice asset here. |
| `motion` | the composed Seedance prompt. Reference assets inline with `{{persona:<name>}}`, `{{product:<id>}}`, etc. End the motion with one `{{speak:persona:<name>}}…{{/speak}}` span wrapping this board's `monologue_segment` verbatim. |
| `dialogue` | a single-entry array: `[{"speaker": "persona:<name>", "text": "<monologue_segment verbatim>", "voice_id": "<kling_voice_id>", "delivery": "<2-6 word tone — e.g. 'warm, conversational'>"}]`. **Required whenever motion contains a `{{speak:X}}` span.** Seedance auto-resolves voice timbre from the persona registry; `voice_id` is also passed for Kling parity. |
| `duration` | this board's `clip_duration` rounded to an integer in `[3, 15]` (the tool's hard range) |
| `aspect_ratio` | `"9:16"` |
| `output_asset_id` | `unboxing:board:K:video` |
| `scene_number` | `K - 1` (0-based) |

The mode default backend is already Seedance in creative mode, so `backend` can be omitted. Pass it explicitly anyway — unboxing's 4-cut single-clip paradigm depends on Seedance's reference-to-video behavior and a silent backend swap to Kling would break the format.

**e. Extract the audio track** via `split_audio`:

| Parameter | Value |
|---|---|
| `video_url` | `unboxing:board:K:video` |
| `output_asset_id` | `unboxing:board:K:audio` |
| `scene_number` | `K - 1` |

Seedance bakes the synthesized speech into the video. `split_audio` pulls it back out as a standalone MP3 — the assembler needs this as the frame-aligned voice track (NOT any upstream original audio).

**f. Transcribe to word-level timestamps** via `transcribe_audio`:

| Parameter | Value |
|---|---|
| `audio_url` | `unboxing:board:K:audio` |
| `script_text` | this board's `monologue_segment` verbatim — corrects STT brand-name misspellings and removes hallucinated words |
| `output_asset_id` | `unboxing:board:K:words` |
| `scene_number` | `K - 1` |

The returned `words_file` (registered under `unboxing:board:K:words`) carries `[{word, start, end}, ...]` timing. Passing it to the assembler lets the renderer build per-word caption animations without re-transcribing.

### 3. Assemble the final video

Call `assemble_video` with one `scenes[]` entry per board, in order:

```
scenes = [
  {
    "asset_url":   "unboxing:board:1:video",
    "audio_url":   "unboxing:board:1:audio",
    "words_file":  "unboxing:board:1:words",
  },
  ...
  {
    "asset_url":   "unboxing:board:N:video",
    "audio_url":   "unboxing:board:N:audio",
    "words_file":  "unboxing:board:N:words",
  },
]
```

Plus:
- `output_asset_id`: `unboxing:final:video`
- `aspect_ratio`: `9:16`

The assembler concatenates the per-board videos, mixes the per-board audio frame-aligned to lip movement, and renders word-by-word captions on top from each board's `words_file`. **`assemble_video` replaces `concatenate_videos` here** — it adds captions, supports overlays, and handles the audio/video sync correctly.

For `N = 1`, still call `assemble_video` with one scene — single-board needs captions and overlays just as much as multi-board, and the API is identical.

**Optional overlays:** If the brief mentions a hook headline or CTA copy, pass `hook_overlay` (first board) and `text_overlays` (per-board, e.g. CTA on Board N). Before placing any face-area overlay, `get_asset` on the board sheet to see where the head/torso lands per slot — keep hooks above the head, CTAs below the torso. Skip overlays entirely when the brief doesn't call for them; unboxing already carries its own story without on-screen text.

### 4. Write the plan file

Save `/tmp/outputs/ugc-unboxing-plan.md` per [templates/unboxing-plan-template.md](templates/unboxing-plan-template.md). The plan documents: total duration, board count, per-board metadata (arc_role, clip_duration, POV cadence), monologue segmentation, the verbatim board prompt and Seedance prompt for every board, and the final asset ID.

### 5. Return

Final response from the skill is a one-paragraph summary stating: total duration, board count, the final asset ID (`unboxing:final:video` — always, since `assemble_video` registers under that ID for N=1 too), and the path to the plan file.

## Hard rules

- **Board 1 ALWAYS carries the canonical arc** PACKED → REVEAL → PRODUCT-FOCUS → SATISFACTION. Slot 1 must depict the sealed delivery box (product NOT visible). Slot 4 must show the satisfied character with product (box GONE). Any deviation is an input-reading error, not a creative choice — re-read the brief.
- **One `generate_scene_video` call per board.** Never split a board's 4 cuts across multiple calls — those four cuts are INTERNAL to one video. The hard cuts come from the `Hard cut to.` markers inside `motion`, not from concatenation.
- **`assemble_video`, not `concatenate_videos`, is the final step.** `concatenate_videos` only joins MP4s — it can't add captions, hooks, music, or sync audio/video. Always run `split_audio` → `transcribe_audio` per board first, then feed all three asset IDs into `assemble_video.scenes[]`.
- **Pass `unboxing:board:K:audio` (the split track) as `audio_url`, NEVER `persona:<name>:voice`.** Seedance regenerates speech with its own per-board timing baked into the video; only the split track is frame-aligned to lip movement. Passing the original voice asset desyncs the mouth.
- **Board image is 21:9, video is 9:16.** Never swap aspect ratios on those calls.
- **`{{speak:persona:<name>}}…{{/speak}}` + matching `dialogue[]` entry is mandatory** for any board with a monologue segment. Voice routes via `dialogue[].voice_id` and is auto-resolved from the persona registry — **never put `persona:<name>:voice` in `reference_images`**, the preflight rejects non-image assets in image slots.
- **For K > 1, always pass board K-1's image as a reference image** in both the board generation (`image_urls`) and clip generation (`reference_images`) so character / wardrobe / lighting / product state stay continuous across boards. The clip guide's cross-board cap-state continuity rule applies: never re-close a previously-opened product across boards.
- **Never re-introduce the delivery box after Cut 1 of Board 1.** Once it's gone, it stays gone for the rest of the video.
- **No phone object in any frame.** Selfie POV = the camera IS the phone. The clip guide enforces forbidden words (`mirror selfie`, `phone in her hand`, etc).
- **TRIPOD cuts contain ZERO camera movement language.** The clip guide lists the forbidden words (`handheld`, `shake`, `drift`, `wobble`, ...) for tripod cuts.

## Reference resources

- [references/board-prompt-guide.md](references/board-prompt-guide.md) 📖 — Full guide for composing the 21:9 board image prompt: canonical 4-slot arc, POV cadence, hand allocation, weight & grip class, surface placement, packing paper, box behavior across slots, anti-AI-tell rendering rules. **Read before composing any board prompt.**

- [references/clip-prompt-guide.md](references/clip-prompt-guide.md) 📖 — Full guide for composing the Seedance clip prompt: time-slicing across 4 cuts, TRIPOD vs SELFIE language, hand allocation per cut, action sequences by product type, cap/lid logic, body-part target lock, K=1 trailer sounds vs K>1 mid-thought openers, forbidden AI-tell phrases, no-repeat phrase rule, quality suffix. **Read before composing any Seedance prompt.**

- [templates/unboxing-plan-template.md](templates/unboxing-plan-template.md) — Output plan file format.

---

**Usage**: Dispatched by Producer / Creative Director when the brief calls for UGC unboxing. Self-contained: plans, generates board sheet(s), composes Seedance prompt(s), generates clip(s), concatenates if multi-board, returns the final video asset ID. References use progressive disclosure — read only when needed.