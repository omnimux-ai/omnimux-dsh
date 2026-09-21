# Ads UGC Try-On Skill

End-to-end producer for UGC try-on video ads (clothing, accessories, jewelry, shoes, hats — anything wearable). Plans the boards, generates a 21:9 storyboard sheet for each board, writes the Seedance video prompt for each board, generates each 9:16 clip, concatenates them if multi-board, and returns the final assembled video asset.

## Why this skill exists

The standard `ads-storyboard` + `ads-director` skills assume multi-scene narrative ads where each scene is a separate video generation call. UGC try-on breaks that mold: **ONE Seedance call produces ONE 9:16 clip with FOUR INTERNAL HARD CUTS** that carry the try-on arc. The board image is a 21:9 four-slot storyboard sheet that Seedance reads as a narrative map (not a frame template) for that single clip. Squeezing this format into the scene-per-call model loses the single-take feel, fragments the lipsync, and breaks the canonical arc.

It also differs from the unboxing skill: try-on has **on-camera dialogue in Cut 1** (selfie POV, lip-synced reaction to package arrival) and **layered voiceover in Cuts 2 / 3 / 4** (character silent on camera while her voice plays over the wearing / texture / styled-pose beats). The audio is supplied as a 4-string `audio_lines` array — one short line per cut — not a single monologue.

This skill bakes in the format:
- Board 1 always carries the canonical arc: **PRE_WEAR → WEARING → TEXTURE_CLOSEUP → STYLE_POSE**.
- Each board = ONE Seedance clip with FOUR internal hard cuts.
- Multi-board (>15s total) chains boards; Boards 2..N carry four pose variations of the character in the product outfit (no kraft bag, no pre-wear, no twirl).

## Persona precondition (HARD GATE — read first)

**This skill does NOT create personas.** The producer / creative-director must call `setup_persona` BEFORE dispatching this skill so that `persona:<id>` (image) AND `persona:<id>:voice` (voice anchor) are both registered. Without the voice anchor, every `generate_scene_video` call fails preflight with `_canonical_persona_for_speaker returned None` and the whole run cascades.

**If the dispatch brief asks you to "create a persona" or says "no pre-existing persona":**

- **Do NOT call `generate_image` with `output_asset_id="persona:<id>"`** — that registers an image only, leaves the voice anchor undefined, and the first `generate_scene_video` will fail.
- **Do NOT call `setup_persona`** — that tool is producer-level and not available to skill subagents.
- **Bail out immediately.** Return `is_success: false` with `reason: "persona '<id>' not registered — please call setup_persona before re-dispatching ads-ugc-try-on-skill"`. The producer will register the persona and retry.

## Inputs

Provided in the producer's dispatch prompt:

- **product** — REQUIRED. Name, brand, category (top / dress / outerwear / pants / skirt / accessory / shoes / jewelry / hat), key visual details (silhouette, color, print, fabric), plus a **product image asset ID** (e.g. `product:dress`). A product image is mandatory for try-on — without a visual reference the Garment Consistency Lock cannot hold across cuts.
- **character** — REQUIRED. Persona asset ID (e.g. `persona:maya`) **already registered by `setup_persona`** (see Persona precondition above), and the persona's `kling_voice_id`. Seedance auto-resolves the voice timbre from the registry via the `persona:<name>` speaker reference; `voice_id` is also threaded through for Kling parity. **Never pass `persona:<name>:voice` as a reference image** — voice routes via `dialogue[].voice_id`, not through image slots. **Never call `generate_image` to "create" the persona yourself** — see Persona precondition.
- **total_duration** — total ad length in seconds (4-60).
- **tone** — one of `excited` (default) / `confident` / `cold` / `playful` / `posh` / `amazed`. Drives expression progression across the 4 cuts AND voiceover language style. If the brief implies a mood (e.g. "girly fun haul" → `playful`, "luxury drop" → `posh`, "runway editorial" → `cold`), infer it; otherwise default to `excited`.
- **pre_wear_outfit_hint** *(Board 1 only)* — short description of the boring/neutral home-base outfit the character wears in Slot 1 before the cut to the product (e.g. `"oversized cream tee + black biker shorts"`, `"plain ribbed tank + grey lounge pants"`). If absent, infer from the persona's reference image vibe (default: a muted basics combo).
- **slot_4_pose_hint** — ONE pose-and-location combo for Slot 4 / Cut 4 from the canonical list: `seated_armchair` / `window_seat` / `leaning_doorframe` / `walking_hallway` / `kitchen_island` / `stairs` / `balcony`. Default `seated_armchair` for `premium`/`posh`, `window_seat` for `mid`/`excited`/`amazed`, `leaning_doorframe` for `casual`/`playful`/`confident`/`cold`.
- **location_tier** — `premium` / `mid` / `casual`. Drives setting / lighting / surfaces. Default `mid`.
- **audio_lines** — REQUIRED. Array of EXACTLY 4 short tone-matched English strings, one per cut:
  - `audio_lines[0]` — Cut 1: reaction to the package having just arrived (e.g. `"look what just arrived"`). When Cut 1 POV is SELFIE this is on-camera dialogue, lip-synced; when TRIPOD it plays as voiceover.
  - `audio_lines[1]` — Cut 2: reaction to fit / silhouette while wearing (e.g. `"the fit is so good"`). Always voiceover.
  - `audio_lines[2]` — Cut 3: reaction to fabric / cut / texture (e.g. `"the fabric is so soft"`). Always voiceover.
  - `audio_lines[3]` — Cut 4: settled wrap reaction (e.g. `"this is the one"`). Always voiceover.
  - Lines must be in English, tone-matched, NEVER contain banned AI-tell phrases (`I'm obsessed`, `game changer`, `10/10`, generic praise — see clip guide), unique within and across boards. If the user supplies a long monologue instead of 4 lines, split it into 4 cut-aligned reactions yourself, using the tone × cut beat examples in the clip guide.
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
- `arc_role`: K=1 → `BOARD_1_TRY_ON_CANONICAL`; K>1 → `BOARD_K_TRY_ON_POSES`.
- `twirl_in_cut_2`: `true` for K=1 only; `false` for all other boards.
- A fresh `audio_lines[4]` array. Lines must NOT repeat across boards (clip guide enforces this) — if Board 2 needs to say "the fit is so good" again, reword it. The producer is responsible for handing 4×N unique lines downstream; if only Board 1 lines were supplied, generate K>1 lines using the tone × cut beat library in the clip guide.
- `pre_wear_outfit_hint` applies only to Board 1. For K>1, the character is already in the product outfit and never returns to pre-wear.

### 2. For each board K from 1 to N

**a. Compose the board image prompt** following [references/board-prompt-guide.md](references/board-prompt-guide.md).

Set `arc_role`:
- K = 1 → `BOARD_1_TRY_ON_CANONICAL` (slots PRE_WEAR → WEARING → TEXTURE_CLOSEUP → STYLE_POSE).
- K > 1 → `BOARD_K_TRY_ON_POSES` (four pose variations of the character in the product outfit; condition on board K-1).

Apply the guide's `@ImageN` ordering exactly — the order maps directly to the `image_urls` array you pass to `generate_image`. Try-on order is `[product, character, previous_board?]` (no package).

**b. Generate the board sheet** via `generate_image`:

| Parameter | Value |
|---|---|
| `prompt` | the composed board prompt (full template instantiated) |
| `image_urls` | per the board guide's Image Reference Order — typical: `[product, character]` for K=1, `[product, character, prev_board]` for K>1 |
| `aspect_ratio` | `21:9` |
| `resolution` | `1K` |
| `model` | `"gpt-image-2.5-sunburst"` — 4-slot 21:9 storyboard sheets render with stronger slot separation and cleaner panel-to-panel layout on gpt-image-2.5-sunburst than on the default nano-banana-2. **Layout guard: the board-prompt-guide's Required Prompt Template includes explicit anti-stack / anti-label phrasing** because gpt-image-2.5-sunburst otherwise (a) lays slots out as horizontal bands stacked top-to-bottom instead of vertical panels side-by-side, and (b) adds forbidden "SLOT 1 / SLOT 2 / SLOT 3 / SLOT 4" typography. Always use the guide's template verbatim; never shorten the anti-stack / anti-label clauses. |
| `output_asset_id` | `tryon:board:K` |

**c. Compose the Seedance clip prompt** following [references/clip-prompt-guide.md](references/clip-prompt-guide.md).

Inputs to the composer: the board image you just generated, the same character / product refs, `K`, `N`, `clip_duration`, this board's `tone`, `arc_role`, `twirl_in_cut_2`, and `audio_lines`.

Per the clip guide:
- Cut 1 (Board 1): SELFIE POV, on-camera dialogue lip-syncing `audio_lines[0]`, pre-wear outfit + kraft paper bag visible at her side. Product NOT visible. NO opening / NO peeking / NO lifting product out / NO addressing the bag.
- Cut 2 (Board 1): TRIPOD, character now in product outfit, one natural twirl beat embedded in roughly the middle of the cut, voiceover layered with `audio_lines[1]`, character silent on camera.
- Cut 3 (Board 1): TRIPOD-CLOSE macro, **HAND-FREE** — no hand contact with the fabric. Voiceover layered with `audio_lines[2]`.
- Cut 4 (Board 1): different room of same home, styled pose per `slot_4_pose_hint`, voiceover layered with `audio_lines[3]`, character silent on camera.
- For K>1: four pose variations in product outfit, no kraft bag, no twirl. Cut 1 audio mode follows POV (SELFIE → on-camera dialogue, TRIPOD → voiceover); Cuts 2 / 3 / 4 always voiceover. Lines must be mid-thought — no greetings, no product re-introductions, no repeats of any prior board's lines.
- Each cut has 5+ micro-beats and at least one within-cut motion beat.
- Expression evolves across the 4 cuts per the tone table (anticipation → peak surprise → focused admiration → settled satisfaction for `excited`; runway-neutral throughout for `cold`; etc.).
- NO mirror or reflection shots anywhere. NO phone object visible in any frame.

**d. Generate the 9:16 clip** via `generate_scene_video`:

| Parameter | Value |
|---|---|
| `backend` | `"seedance"` |
| `start_image` | `tryon:board:K` — the board sheet is the first-frame image and Seedance's narrative map |
| `reference_images` | `[character, product]` (plus `tryon:board:K-1` when K>1), in that order. **IMAGES ONLY** — never put a voice asset here. |
| `motion` | the composed Seedance prompt. Reference assets inline with `{{persona:<name>}}` and `{{product:<id>}}` tokens. Wrap each audio line in its own `{{speak:persona:<name>}}…{{/speak}}` span at the appropriate Cut. For Cut 1 lip-synced dialogue and Cuts 2 / 3 / 4 voiceovers, **all four spans go in `motion`** so Seedance bakes the audio per cut. |
| `dialogue` | a four-entry array, one per cut: `[{"speaker": "persona:<name>", "text": "<audio_lines[i] verbatim>", "voice_id": "<kling_voice_id>", "delivery": "<2-6 word tone — e.g. 'warm, anticipatory'>"}]` × 4. **Required whenever motion contains `{{speak:X}}` spans.** Each entry's `text` must exactly match the corresponding `{{speak}}` span's contents. |
| `duration` | this board's `clip_duration` rounded to an integer in `[3, 15]` (the tool's hard range) |
| `aspect_ratio` | `"9:16"` |
| `output_asset_id` | `tryon:board:K:video` |
| `scene_number` | `K - 1` (0-based) |

The mode default backend is already Seedance in creative mode, so `backend` can be omitted. Pass it explicitly anyway — try-on's 4-cut single-clip paradigm depends on Seedance's reference-to-video behavior and a silent backend swap to Kling would break the format.

**e. Extract the audio track** via `split_audio`:

| Parameter | Value |
|---|---|
| `video_url` | `tryon:board:K:video` |
| `output_asset_id` | `tryon:board:K:audio` |
| `scene_number` | `K - 1` |

Seedance bakes the synthesized speech into the video (one continuous track covering Cut 1 dialogue + Cuts 2 / 3 / 4 voiceovers). `split_audio` pulls it back out as a standalone MP3 — the assembler needs this as the frame-aligned voice track (NOT any upstream original audio).

**f. Transcribe to word-level timestamps** via `transcribe_audio`:

| Parameter | Value |
|---|---|
| `audio_url` | `tryon:board:K:audio` |
| `script_text` | this board's 4 `audio_lines` concatenated in order, joined by single spaces — corrects STT brand/garment misspellings and removes hallucinated words |
| `output_asset_id` | `tryon:board:K:words` |
| `scene_number` | `K - 1` |

The returned `words_file` (registered under `tryon:board:K:words`) carries `[{word, start, end}, ...]` timing. Passing it to the assembler lets the renderer build per-word caption animations without re-transcribing.

### 3. Assemble the final video

Call `assemble_video` with one `scenes[]` entry per board, in order:

```
scenes = [
  {
    "asset_url":   "tryon:board:1:video",
    "audio_url":   "tryon:board:1:audio",
    "words_file":  "tryon:board:1:words",
  },
  ...
  {
    "asset_url":   "tryon:board:N:video",
    "audio_url":   "tryon:board:N:audio",
    "words_file":  "tryon:board:N:words",
  },
]
```

Plus:
- `output_asset_id`: `tryon:final:video`
- `aspect_ratio`: `9:16`

The assembler concatenates the per-board videos, mixes the per-board audio frame-aligned to lip movement (Cut 1) and voiceover beats (Cuts 2 / 3 / 4), and renders word-by-word captions on top from each board's `words_file`. **`assemble_video` replaces `concatenate_videos` here** — it adds captions, supports overlays, and handles the audio/video sync correctly.

For `N = 1`, still call `assemble_video` with one scene — single-board needs captions and overlays just as much as multi-board, and the API is identical.

**Optional overlays:** If the brief mentions a hook headline or CTA copy, pass `hook_overlay` (first board) and `text_overlays` (per-board). Before placing any face-area overlay, `get_asset` on the board sheet to see where the head/torso lands per slot — keep hooks above the head, CTAs below the torso. Try-on already carries strong story momentum on its own; skip overlays entirely when the brief doesn't call for them. **Note: the clip guide forbids a CTA tail inside the video itself** — overlays are the only way to add CTAs. Never inject "link in bio" / "follow me" into `audio_lines`.

### 4. Write the plan file

Save `/tmp/outputs/ugc-try-on-plan.md` per [templates/try-on-plan-template.md](templates/try-on-plan-template.md). The plan documents: total duration, board count, tone, location_tier, pre_wear_outfit_hint, slot_4_pose_hint, per-board metadata (arc_role, clip_duration, POV cadence, twirl flag), the four audio_lines per board, the verbatim board prompt and Seedance prompt for every board, and the final asset ID.

### 5. Return

Final response from the skill is a one-paragraph summary stating: total duration, board count, tone, the final asset ID (`tryon:final:video` — always, since `assemble_video` registers under that ID for N=1 too), and the path to the plan file.

## Hard rules

- **Board 1 ALWAYS carries the canonical arc** PRE_WEAR → WEARING → TEXTURE_CLOSEUP → STYLE_POSE. Slot 1 MUST depict the character in pre-wear outfit holding (or beside) a plain kraft paper bag with the product NOT visible. Slot 4 MUST show the character in a different room of the same home, in the styled pose. Any deviation is an input-reading error, not a creative choice — re-read the brief.
- **One `generate_scene_video` call per board.** Never split a board's 4 cuts across multiple calls — those four cuts are INTERNAL to one video. The hard cuts come from the `Hard cut to.` markers inside `motion`, not from concatenation.
- **`assemble_video`, not `concatenate_videos`, is the final step.** `concatenate_videos` only joins MP4s — it can't add captions, hooks, music, or sync audio/video. Always run `split_audio` → `transcribe_audio` per board first, then feed all three asset IDs into `assemble_video.scenes[]`.
- **Pass `tryon:board:K:audio` (the split track) as `audio_url`, NEVER `persona:<name>:voice`.** Seedance regenerates speech with its own per-board timing baked into the video; only the split track is frame-aligned to lip movement and voiceover.
- **Board image is 21:9, video is 9:16.** Never swap aspect ratios on those calls.
- **Four `{{speak:persona:<name>}}…{{/speak}}` spans + four matching `dialogue[]` entries per board** are mandatory whenever the board has audio (every board does). Voice routes via `dialogue[].voice_id` and is auto-resolved from the persona registry — **never put `persona:<name>:voice` in `reference_images`**, the preflight rejects non-image assets in image slots. Each `dialogue[]` entry's `text` must match its corresponding `{{speak}}` span's contents exactly.
- **For K > 1, always pass board K-1's image as a reference image** in both the board generation (`image_urls`) and clip generation (`reference_images`) so identity, location-tier, lighting, product, and hairstyle stay continuous across boards.
- **Never re-introduce the kraft paper bag after Slot 1 of Board 1.** Once it's gone (Slot 2 onward), it stays gone for the rest of the video.
- **Never re-introduce the pre-wear outfit after Slot 1 of Board 1.** Once she's in the product (Slot 2 onward + every cut of Boards 2..N), she stays in the product.
- **Garment Consistency Lock** — silhouette, primary color, print, and recognizable design details of the product must stay identical across every cut in which it appears. The character may turn or pose freely; the garment rotates naturally with her body. Never recolor, re-print, or redesign the product across cuts.
- **No hand contact with fabric in Cut 3.** Texture reads through framing, drape, light, and natural body micro-movement only. No "operator hand" enters the macro frame. No skim / pull / brush / pinch.
- **No on-screen costume change.** The pre-wear → product transition between Cut 1 and Cut 2 is handled by the hard cut. Never describe changing clothes.
- **No mirrors or reflections anywhere.** No bathroom mirror, no full-length mirror, no shop window reflection, no phone-screen reflection. Try-on does NOT use mirrors.
- **No phone object in any frame.** Selfie POV = the camera IS the phone. The clip guide enforces forbidden words (`mirror selfie`, `phone in her hand`, `over-the-shoulder`, etc).
- **TRIPOD cuts contain ZERO camera movement language.** The clip guide lists the forbidden words (`handheld`, `shake`, `drift`, `wobble`, ...) for tripod cuts.
- **No CTA tail inside the video.** Never inject `"link in bio"` / `"follow me"` / `"subscribe"` into any `audio_lines` entry. The video ends naturally on Cut 4's final voiceover line. CTAs go on overlays only.

## Reference resources

- [references/board-prompt-guide.md](references/board-prompt-guide.md) 📖 — Full guide for composing the 21:9 board image prompt: canonical 4-slot try-on arc (PRE_WEAR → WEARING → TEXTURE_CLOSEUP → STYLE_POSE), POV cadence, Outfit Continuity, Kraft Bag rules, slot-4 pose options, location tiers, Garment Consistency Lock, Realistic Fit, hand-free macro rule for Slot 3, tone-driven expression progression, no-mirror rule. **Read before composing any board prompt.**

- [references/clip-prompt-guide.md](references/clip-prompt-guide.md) 📖 — Full guide for composing the Seedance clip prompt: time-slicing across 4 cuts, on-camera dialogue (Cut 1 SELFIE) vs layered voiceover (Cuts 2 / 3 / 4), TRIPOD vs SELFIE language, hand allocation per cut, twirl beat embedding (Cut 2 of Board 1), hand-free macro rule for Cut 3, audio_lines content per tone × cut beat, forbidden AI-tell phrases, no-repeat phrase rule, quality suffix. **Read before composing any Seedance prompt.**

- [templates/try-on-plan-template.md](templates/try-on-plan-template.md) — Output plan file format.

---

**Usage**: Dispatched by Producer / Creative Director when the brief calls for UGC try-on / fit check / outfit haul. Self-contained: plans the boards, generates board sheet(s), composes Seedance prompt(s), generates clip(s), assembles into the final video. References use progressive disclosure — read only when needed.