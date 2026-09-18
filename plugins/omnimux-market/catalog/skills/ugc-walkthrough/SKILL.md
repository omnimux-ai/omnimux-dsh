# Ads UGC Tutorial Skill

End-to-end producer for UGC tutorial video ads. Plans the boards, generates a 21:9 storyboard sheet with **rendered Step-N captions baked into each slot** for each board, writes the Seedance video prompt for each board, generates each 9:16 clip, assembles the final video with captions, and returns the final assembled video asset.

## Why this skill exists

The standard `ads-storyboard` + `ads-director` skills assume multi-scene narrative ads where each scene is a separate video generation call. UGC tutorial breaks that mold: **ONE Seedance call produces ONE 9:16 clip with FOUR INTERNAL HARD CUTS** that carry four chronological steps of using the product. The board image is a 21:9 four-slot storyboard sheet that Seedance reads as a narrative map (not a frame template) for that single clip.

It also differs from unboxing and try-on:

- **Step captions are RENDERED onto each board slot** as typography (`"Step 1 — Wet Hands"`, `"Step 2 — Pump Twice"`, ...), with identical font / position / color across all 4 slots of one board. Seedance preserves those captions verbatim while it animates the rest of the frame — captions are baked into the source frame, not added as overlays in post.
- **Step numbering is global across the entire video.** Board K carries Steps `(4·(K-1)+1)` through `(4·K)` — Board 1 has Steps 1-4, Board 2 has Steps 5-8, etc. The viewer sees one continuous numbered tutorial across the assembled clip.
- **Audio is a single per-board monologue segment** (like unboxing), not a 4-line voiceover array (like try-on). The monologue is split at natural phrase boundaries across the 4 cuts.
- **The last board's Cut 4 carries an optional CTA tail** (`is_last_board == true`) — a ~0.5-1s talking-head selfie + downward gesture + brief English CTA phrase ("Link in bio." / "Follow me." / "Subscribe!"). The CTA does NOT add a fifth cut or a new caption — it lives inside Cut 4 as audio + gesture only.

This skill bakes in the format:
- Every board carries the same arc role: **`BOARD_TUTORIAL_STEPS`** — four chronological steps of product usage.
- Each board = ONE Seedance clip with FOUR internal hard cuts.
- Multi-board (>15s total) chains boards; step numbering continues globally; only the final board's Cut 4 gets the CTA tail.

## Persona precondition (HARD GATE — read first)

**This skill does NOT create personas.** The producer / creative-director must call `setup_persona` BEFORE dispatching this skill so that `persona:<id>` (image) AND `persona:<id>:voice` (voice anchor) are both registered. Without the voice anchor, every `generate_scene_video` call fails preflight with `_canonical_persona_for_speaker returned None` and the whole run cascades.

**If the dispatch brief asks you to "create a persona" or says "no pre-existing persona":**

- **Do NOT call `generate_image` with `output_asset_id="persona:<id>"`** — that registers an image only, leaves the voice anchor undefined, and the first `generate_scene_video` will fail.
- **Do NOT call `setup_persona`** — that tool is producer-level and not available to skill subagents.
- **Bail out immediately.** Return `is_success: false` with `reason: "persona '<id>' not registered — please call setup_persona before re-dispatching ads-ugc-tutorial-skill"`. The producer will register the persona and retry.

## Inputs

Provided in the producer's dispatch prompt:

- **product** — name, brand, category, key details, plus a product image asset ID (e.g. `product:serum`) if an image exists. Tutorials work best when a product is present — without one the skill degenerates to a lifestyle "how I do X" walkthrough (Mode D in the board guide).
- **character** — REQUIRED. Persona asset ID (e.g. `persona:maya`) **already registered by `setup_persona`** (see Persona precondition above), and the persona's `kling_voice_id` from the persona bundle the producer received. Seedance auto-resolves the voice timbre from the registry via the `persona:<name>` speaker reference; `voice_id` is also threaded through for Kling parity. **Never pass `persona:<name>:voice` as a reference image** — voice routes via `dialogue[].voice_id`, not through image slots. **Never call `generate_image` to "create" the persona yourself** — see Persona precondition.
- **total_duration** — total ad length in seconds (4-60).
- **monologue** — the full instructional script across all boards. Tutorials are usually measured and calm. Must obey the no-greetings rule for Boards 2..N (the clip guide enforces this) — Boards 2..N open mid-thought as the routine continues. Banned AI-tell phrases (`I'm obsessed`, `game changer`, `10/10`, generic praise) must not appear.
- **step_headings** — OPTIONAL. Array of `4·N` short Title Case headings (e.g. `["Wet Hands", "Pump Twice", "Massage In", "Rinse Clean", ...]`). If omitted, derive them from the product's usage mechanics (per the board guide's product-usage matrix). Each heading is paired with its sequence number to form the caption rendered on a slot — `"Step 1 — Wet Hands"`, `"Step 2 — Pump Twice"`, etc.
- **typography_hint** — OPTIONAL. `{font_family_vibe, position, size, color}` overrides for the rendered Step captions. If absent, the board guide's Caption Typography Selection table picks a vibe by product category (editorial serif for skincare, bold condensed caps for fitness, geometric sans for tech, etc.).
- **cta_phrase** — OPTIONAL. The English CTA spoken at the end of the final board's Cut 4. If absent, the clip guide auto-picks one by available time: `"Link in bio."` / `"Follow me."` (3 syllables, ~1s) or `"Subscribe!"` (2 syllables, ≤0.5s). Only the final board uses it.
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

Decide global step numbering: Board K carries Steps `(4·(K-1)+1)` through `(4·K)`. So a 2-board tutorial covers Steps 1-8 total, a 3-board tutorial covers Steps 1-12, etc. **Total steps = 4·N.** If the product realistically has fewer steps than `4·N` (e.g. a one-pump-and-rinse cleanser only has 4 real steps), prefer N=1 — don't pad with filler steps. If it has more, condense.

Split `monologue` into `N` segments at natural phrase boundaries — roughly proportional to per-board duration. Verify NO sentence or near-identical phrase repeats across boards (the clip guide's no-repeat rule).

Decide caption typography once for the whole video — same font vibe / position / size / color across all `4·N` slot captions (per the board guide's Caption Typography Selection). Drift between boards reads as a different recording.

### 2. For each board K from 1 to N

**a. Compose the board image prompt** following [references/board-prompt-guide.md](references/board-prompt-guide.md).

Set `arc_role = "BOARD_TUTORIAL_STEPS"` (same for every board). Determine this board's `step_captions[4]` array: `["Step (4K-3) — <heading>", "Step (4K-2) — <heading>", "Step (4K-1) — <heading>", "Step (4K) — <heading>"]` using the global numbering above.

Apply the guide's `@ImageN` ordering exactly — the order maps directly to the `image_urls` array you pass to `generate_image`. Tutorial order is `[product, character, prev_board?]` (no package).

**b. Generate the board sheet** via `generate_image`:

| Parameter | Value |
|---|---|
| `prompt` | the composed board prompt (full template instantiated) — MUST include the verbatim Step captions and typography spec |
| `image_urls` | per the board guide's Image Reference Order — typical: `[product, character]` for K=1, `[product, character, prev_board]` for K>1 |
| `aspect_ratio` | `21:9` |
| `resolution` | `1K` |
| `model` | `"gpt-image-2"` — 4-slot 21:9 storyboard sheets render with stronger slot separation, cleaner panel-to-panel layout, AND sharper rendered typography on gpt-image-2 than on the default nano-banana-2. **Layout guard: the board-prompt-guide's Required Prompt Template includes explicit anti-stack / anti-label phrasing** because gpt-image-2 otherwise (a) lays slots out as horizontal bands stacked top-to-bottom instead of vertical panels side-by-side, and (b) adds forbidden "SLOT 1 / SLOT 2 / SLOT 3 / SLOT 4" typography alongside (or even replacing) the intended Step captions. The Step captions are the ONLY allowed text on each slot; any other typography on the output is a render failure. Always use the guide's template verbatim; never shorten the anti-stack / anti-label clauses. |
| `output_asset_id` | `tutorial:board:K` |

**c. Compose the Seedance clip prompt** following [references/clip-prompt-guide.md](references/clip-prompt-guide.md).

Inputs to the composer: the board image you just generated (with rendered Step captions), the same character / product refs, `K`, `N`, `clip_duration`, this board's `step_captions[4]`, this board's `monologue_segment`, and `is_last_board = (K == N)`.

Per the clip guide:
- K = 1 may include up to 3 bracketed non-verbal sounds at the start of Audio — use sparingly; tutorial tone is generally calm and measured.
- K > 1 audio MUST NOT start with greetings or product re-introductions — open mid-thought, continuing the routine.
- Each Cut N quotes its slot's `"Step N — Heading"` caption verbatim and confirms it stays visible throughout the cut (the caption is baked into the source frame; Seedance preserves it without redrawing).
- Each cut has 5+ micro-beats and at least one within-cut motion beat.
- Expression evolves across the 4 cuts (focused setup → instructive demonstration → focused application → settled satisfaction / talking-head).
- **When `is_last_board == true`**: Cut 4 ends with the ~0.5-1s CTA tail (camera resolves to tight talking-head selfie, brief English CTA phrase, downward hand gesture). The Step 4 caption stays visible throughout — NO new caption is added for the CTA.
- **When `is_last_board == false`**: NO CTA tail anywhere — Cut 4 ends naturally on Step 4's action sentence.

**d. Generate the 9:16 clip** via `generate_scene_video`:

| Parameter | Value |
|---|---|
| `backend` | `"seedance"` |
| `start_image` | `tutorial:board:K` — the board sheet (with rendered Step captions) is the first-frame image AND Seedance's narrative map. The captions are part of the source frame; Seedance reads them as image content. |
| `reference_images` | `[character, product]` (plus `tutorial:board:K-1` when K>1), in that order. **IMAGES ONLY** — never put a voice asset here. |
| `motion` | the composed Seedance prompt. Reference assets inline with `{{persona:<name>}}` and `{{product:<id>}}` tokens. End the motion with one `{{speak:persona:<name>}}…{{/speak}}` span wrapping this board's `monologue_segment` verbatim — when `is_last_board == true`, the CTA phrase is appended **inside** the same speak span (it's part of what the persona vocalizes). |
| `dialogue` | a single-entry array: `[{"speaker": "persona:<name>", "text": "<monologue_segment verbatim, with appended CTA when is_last_board>", "voice_id": "<kling_voice_id>", "delivery": "<2-6 word tone — e.g. 'calm, instructive'>"}]`. **Required whenever motion contains a `{{speak:X}}` span.** The `text` must match the speak span's contents exactly. Seedance auto-resolves voice timbre from the persona registry; `voice_id` is also passed for Kling parity. |
| `duration` | this board's `clip_duration` rounded to an integer in `[3, 15]` (the tool's hard range) |
| `aspect_ratio` | `"9:16"` |
| `output_asset_id` | `tutorial:board:K:video` |
| `scene_number` | `K - 1` (0-based) |

The mode default backend is already Seedance in creative mode, so `backend` can be omitted. Pass it explicitly anyway — tutorial's 4-cut single-clip paradigm depends on Seedance's reference-to-video behavior (it reads the rendered Step captions from `start_image` and preserves them) and a silent backend swap to Kling would break the format.

**e. Extract the audio track** via `split_audio`:

| Parameter | Value |
|---|---|
| `video_url` | `tutorial:board:K:video` |
| `output_asset_id` | `tutorial:board:K:audio` |
| `scene_number` | `K - 1` |

Seedance bakes the synthesized speech (including the CTA on the final board) into the video. `split_audio` pulls it back out as a standalone MP3 — the assembler needs this as the frame-aligned voice track (NOT any upstream original audio).

**f. Transcribe to word-level timestamps** via `transcribe_audio`:

| Parameter | Value |
|---|---|
| `audio_url` | `tutorial:board:K:audio` |
| `script_text` | this board's `monologue_segment` verbatim (with appended CTA on the final board) — corrects STT brand-name misspellings and removes hallucinated words |
| `output_asset_id` | `tutorial:board:K:words` |
| `scene_number` | `K - 1` |

The returned `words_file` (registered under `tutorial:board:K:words`) carries `[{word, start, end}, ...]` timing. Passing it to the assembler lets the renderer build per-word caption animations without re-transcribing.

> **Caption layering note.** The Step captions baked into the board are STATIC typography on the slot — they tell the viewer what the current step is. The assembler's `words_file`-driven per-word captions are DYNAMIC and follow the spoken monologue. These are two different caption tracks and they coexist fine — the Step caption sits in its baked top-center (or bottom-center) slot position, while the per-word voice captions render in the assembler's default lower-third band. If a per-word caption would visually collide with the Step caption (e.g. both top-center because the Step caption shifted to bottom-center to avoid faces), pass a non-default `caption_position` to `assemble_video` — but in most cases the two layers don't conflict.

### 3. Assemble the final video

Call `assemble_video` with one `scenes[]` entry per board, in order:

```
scenes = [
  {
    "asset_url":   "tutorial:board:1:video",
    "audio_url":   "tutorial:board:1:audio",
    "words_file":  "tutorial:board:1:words",
  },
  ...
  {
    "asset_url":   "tutorial:board:N:video",
    "audio_url":   "tutorial:board:N:audio",
    "words_file":  "tutorial:board:N:words",
  },
]
```

Plus:
- `output_asset_id`: `tutorial:final:video`
- `aspect_ratio`: `9:16`

The assembler concatenates the per-board videos, mixes the per-board audio frame-aligned to lip movement, and renders word-by-word captions on top from each board's `words_file`. **`assemble_video` replaces `concatenate_videos` here** — it adds captions, supports overlays, and handles the audio/video sync correctly.

For `N = 1`, still call `assemble_video` with one scene — single-board needs captions and overlays just as much as multi-board, and the API is identical.

**Optional overlays:** If the brief mentions a hook headline, pass `hook_overlay` (first board). Before placing any face-area overlay, `get_asset` on the board sheet to see where the head/torso AND the baked Step caption land — keep the hook above the head and clear of the Step caption's top-center position (or shift the hook to bottom-center if the Step caption sits up top). **Do NOT pass a CTA `text_overlay` for the final board if the audio CTA tail is already in place** — duplicating "Link in bio" as overlay + audio reads as AI sloppy. Pick one channel for CTA per video: in-video audio tail (preferred for tutorial — it feels native) OR overlay text, not both.

### 4. Write the plan file

Save `/tmp/outputs/ugc-tutorial-plan.md` per [templates/tutorial-plan-template.md](templates/tutorial-plan-template.md). The plan documents: total duration, board count, global step numbering, caption typography, per-board metadata (clip_duration, POV cadence, step captions, is_last_board flag), monologue segmentation, the verbatim board prompt and Seedance prompt for every board, and the final asset ID.

### 5. Return

Final response from the skill is a one-paragraph summary stating: total duration, board count, total step count, the final asset ID (`tutorial:final:video` — always, since `assemble_video` registers under that ID for N=1 too), and the path to the plan file.

## Hard rules

- **Every board carries `BOARD_TUTORIAL_STEPS` — four chronological steps of product usage.** No "intro slot" / "outro slot" / "unboxing slot" / "before/after slot". Slot 1 of Board 1 always shows the FIRST tutorial step — not "show product alone", not a packaging moment. Any deviation is an input-reading error, not a creative choice — re-read the brief.
- **Step captions are the ONLY allowed text on each slot.** No additional headers, no metadata blocks, no badges, no slot numbers ("Panel 1 / 2 / 3 / 4"), no pop-text, no on-image subtitles, no watermarks, no brand banners. The product's own real label on the physical product is fine — that's part of the product, not added typography.
- **Caption typography is IDENTICAL across all 4 slots of one board.** Same font family/vibe, same size, same color, same position. Drift mid-board reads as AI inconsistency. The same typography spec should also carry across boards within one video for a continuous look.
- **Step numbering is GLOBAL across boards.** Board 1 = Steps 1-4, Board 2 = Steps 5-8, Board 3 = Steps 9-12, Board 4 = Steps 13-16. Restarting at Step 1 on Board 2 breaks the continuous-tutorial feel.
- **One `generate_scene_video` call per board.** Never split a board's 4 cuts across multiple calls — those four cuts are INTERNAL to one video. The hard cuts come from the `Hard cut to.` markers inside `motion`, not from concatenation.
- **`assemble_video`, not `concatenate_videos`, is the final step.** `concatenate_videos` only joins MP4s — it can't add captions, hooks, music, or sync audio/video. Always run `split_audio` → `transcribe_audio` per board first, then feed all three asset IDs into `assemble_video.scenes[]`.
- **Pass `tutorial:board:K:audio` (the split track) as `audio_url`, NEVER `persona:<name>:voice`.** Seedance regenerates speech with its own per-board timing (including the CTA tail on the final board) baked into the video; only the split track is frame-aligned to lip movement and voiceover.
- **Board image is 21:9, video is 9:16.** Never swap aspect ratios on those calls.
- **`{{speak:persona:<name>}}…{{/speak}}` + matching `dialogue[]` entry is mandatory** for any board with a monologue segment (every board has one). Voice routes via `dialogue[].voice_id` and is auto-resolved from the persona registry — **never put `persona:<name>:voice` in `reference_images`**, the preflight rejects non-image assets in image slots.
- **For K > 1, always pass board K-1's image as a reference image** in both the board generation (`image_urls`) and clip generation (`reference_images`) so character / wardrobe / lighting / product state / caption typography stay continuous across boards. The clip guide's cross-board cap-state continuity rule applies: never re-close a previously-opened product across boards.
- **CTA tail in audio is ONLY for the final board.** When `is_last_board == false`, the audio for that board MUST NOT contain `"Link in bio"` / `"Follow me"` / `"Subscribe"` / any similar CTA phrase. When `is_last_board == true`, the CTA is one short English phrase appended to Cut 4's audio — never two CTAs, never combined ("Link in bio AND follow me!"), never extending the clip duration to fit it (clip the monologue earlier instead).
- **CTA is audio + gesture only, never typography.** Do NOT render a `"Subscribe!"` / `"Follow me"` caption onto the final board's Cut 4 — the Step caption stays visible throughout. The CTA lives in the spoken audio plus a downward hand gesture, not as on-screen text.
- **No phone object in any frame.** Selfie POV = the camera IS the phone. The clip guide enforces forbidden words (`mirror selfie`, `phone in her hand`, `over-the-shoulder`, etc).
- **TRIPOD cuts contain ZERO camera movement language.** The clip guide lists the forbidden words (`handheld`, `shake`, `drift`, `wobble`, ...) for tripod cuts.
- **No mirror or reflection shots anywhere.** Tutorials read through direct view of the product action — never via a mirror.
- **Each cut depicts ONE physical step.** Maximum one product state change per cut. No "she pumps twice, then rubs in, then rinses" inside Cut 2 — those are three different steps and need their own cuts (or own board).
- **Tutorial steps must be physically realistic for the actual product.** No imaginary steps. The clip guide's body-part target lock (perfume → wrist/neck, lipstick → lips, cream → fingertip → face, etc.) applies — override silently if the user wording violates it.

## Reference resources

- [references/board-prompt-guide.md](references/board-prompt-guide.md) 📖 — Full guide for composing the 21:9 board image prompt: tutorial 4-slot step arc, baked `"Step N — Heading"` caption typography per product category, POV cadence, hand allocation, weight & grip class, product placement & visibility per step, anti-AI-tell rendering rules, and the verbatim CRITICAL LAYOUT GUARD that fixes gpt-image-2's vertical-stack / forced-label failure modes. **Read before composing any board prompt.**

- [references/clip-prompt-guide.md](references/clip-prompt-guide.md) 📖 — Full guide for composing the Seedance clip prompt: time-slicing across 4 equal-weight cuts, TRIPOD vs SELFIE language, hand allocation per cut, action sequences by product type, cap/lid logic, body-part target lock, K=1 measured non-verbal cues vs K>1 mid-thought openers, forbidden AI-tell phrases, no-repeat phrase rule, **Step caption persistence per cut**, the **CTA tail directive when `is_last_board == true`**, quality suffix. **Read before composing any Seedance prompt.**

- [templates/tutorial-plan-template.md](templates/tutorial-plan-template.md) — Output plan file format.

---

**Usage**: Dispatched by Producer / Creative Director when the brief calls for a UGC tutorial / how-to / step-by-step demo. Self-contained: plans the boards, generates board sheet(s) with rendered Step captions, composes Seedance prompt(s), generates clip(s), assembles into the final video. References use progressive disclosure — read only when needed.