# Podcast Skill

End-to-end producer for podcast-style video using a **5-step still-backed pipeline**. Plans the episode as `N` Seedance chunks of 8–15 s each, generates a 16:9 seated-composite of host + guest in the studio, generates 1–2 B&W 4-panel storyboard sketches locking the chunk shot grammar, writes per-chunk Seedance prompts with verbatim camera-state-tagged dialog, generates each chunk, splits + transcribes audio, and assembles the final video.

## Why this skill exists

A plain Seedance call ("two people in a studio talking about X") fails as a multi-chunk episode for four reasons:

1. **Continuity across chunk splices** — viewer must read "same room, same blocking, same lighting" across every cut. Without a **master composite** anchoring all chunks, each Seedance call re-imagines blocking and the multi-chunk video falls apart at the splices.
2. **Shot grammar is the format's identity** — wide → CU speaker → wide shifted → CU listener. Without a **pre-locked 4-panel B&W storyboard**, Seedance picks shots ad-hoc and produces flat "two heads on camera" output.
3. **Per-line camera state** — dialog must carry `[on-camera]` / `[voice-over, off-camera]` / `[continuing]` / `[silent — mouth stays closed]` tags directly into the Seedance prompt. A plain `dialogue[]` array doesn't express this granularity, so listener mouths animate when the speaker is voice-over.
4. **Chunking with mid-thought handoffs** — only the final chunk has a silent tail; intermediates end mid-beat. Without an explicit chunk-arc plan, chunks read as N separate TikTok ideas instead of one episode.

This skill bakes in all four:
- **One composite** call locks blocking / room / mic geometry / lighting (re-attached on every chunk as `reference_images[0]`).
- **One or two 4-panel B&W storyboards** lock shot grammar per pattern (used as Seedance `start_image`).
- **Per-chunk Seedance prompts** carry verbatim quoted dialog with per-line camera-state tags.
- **Chunk arc** locked in the plan file; only chunk N gets the silent tail.

## Persona precondition (HARD GATE — read first)

**This skill does NOT create personas.** Producer must call `setup_persona` for BOTH host and guest BEFORE dispatching this skill so that `persona:<host>`, `persona:<host>:voice`, `persona:<guest>`, `persona:<guest>:voice` are all registered.

**If the brief asks you to "create a persona" or lacks pre-existing personas:**

- **Do NOT call `generate_image` with `output_asset_id="persona:<name>"`** — registers image only, leaves voice anchor undefined, first `generate_scene_video` fails preflight.
- **Do NOT call `setup_persona`** — producer-level tool, not available to skill subagents.
- **Bail out immediately.** Return `is_success: false` with `reason: "persona '<host>' or persona '<guest>' not registered — please call setup_persona for both before re-dispatching podcast"`.

## Inputs

Provided in the producer's dispatch prompt:

- **topic** — what the podcast is about (the conversational angle). REQUIRED. Without this you cannot write hooks, beats, or dialog.
- **host** — REQUIRED. Persona asset ID (`persona:<host>`) **already registered by `setup_persona`**, plus the persona's `kling_voice_id`. Optional archetype hint.
- **guest** — REQUIRED. Persona asset ID (`persona:<guest>`) **already registered by `setup_persona`**, plus the persona's `kling_voice_id`. Encourage **contrast** with the host.
- **total_duration** — total episode length in seconds (15–300+). Compute `N = ceil(T / d)` with `d ∈ [8, 15]`.
- **setting** *(optional)* — the location vibe from the brief. Default to a neutral, non-warm studio. Reach for a warm / golden look ONLY when the brief explicitly calls for one.
- **tone** *(optional)* — conversational / investigative / documentary gravitas / comedic banter. Default = conversational.
- **aspect_ratio** *(optional)* — `16:9` default.

If the brief is missing topic / host / guest / setting / total_duration, ask the producer to fill the gap before proceeding — do **not** invent defaults that downgrade the chain (e.g. "I'll just do a 15s text-only chunk").

## Workflow

### 1. Plan the episode

Decide chunk count `N` from `total_duration`: `N = ceil(total_duration / d)` with each chunk `d ∈ [8, 15] s` (aim for the middle of that range). Longer episodes simply mean more chunks of the same length.

Lock the **episode spine** in the plan file (one-sentence narrative + per-chunk beat mapping). The spine is shared across all chunks but NEVER pasted into any Seedance prompt body (Hard Rule #8).

**Chunk-position rules** (apply when authoring chunk prompts in Step 4):

- **Chunk 1** — cold-open mid-conversation. NO "welcome to the show / I'm joined today by…". May include 1–2 bracketed non-verbal sounds at the start (`[half-laugh]`, `[mm]`).
- **Chunks 2..N-1** — open **mid-thought**. First voiced line answers or extends whatever was left "open" before chunk K-1 ended. NO greetings, NO fresh hooks.
- **Chunk N** — lands the narrative payoff + ONE more conversational close beat + **silent ~1.5 s tail**.

### 2. Generate the seated composite

Call `generate_image`:

| Parameter | Value |
|---|---|
| `prompt` | Composite prompt per [references/podcast-composite-prompt-guide.md](references/podcast-composite-prompt-guide.md) — 2-host seated wide, mutual / inward gaze (NEVER eyes-to-camera), mics in frame plain unbranded, location-as-positive-description (default cool lighting, warm only on explicit warmth signal). |
| `image_urls` | `[persona:<host>, persona:<guest>]` — left-to-right seating order. |
| `aspect_ratio` | `16:9` |
| `resolution` | `1K` |
| `model` | `"gpt-image-2.5-sunburst"` |
| `output_asset_id` | `podcast:composite` |

The composite is the **180° anchor + blocking + room + lighting + mic geometry ground truth** for every chunk. Every chunk's `reference_images` includes this asset in slot 0.

### 3. Generate storyboard sketch(es)

For each shot pattern used (typically Pattern A for most chunks, optional Pattern B for monologue chunks, Pattern C for reaction beats), call `generate_image`:

| Parameter | Value |
|---|---|
| `prompt` | Verbatim Storyboard template per [references/podcast-storyboard-prompt-guide.md](references/podcast-storyboard-prompt-guide.md). MUST include strict B&W clause + 180° clause + eyeline clause. |
| `image_urls` | `[podcast:composite, persona:<host>, persona:<guest>]` |
| `aspect_ratio` | `16:9` |
| `resolution` | `1K` |
| `model` | `"gpt-image-2.5-sunburst"` |
| `output_asset_id` | `podcast:storyboard:A` (or `:B`, `:C`) |

**Pattern selection per chunk** (lock in plan):
- **A — Dialog turn**: wide → CU speaker → wide shifted → CU listener. Default for chunks with a speaker handoff.
- **B — Monologue continuation**: CU speaker → wide → CU speaker (different angle) → CU listener. For chunks where one host carries an extended thought.
- **C — Reaction emphasis**: wide → CU speaker → wide both react → CU listener. For comedic / surprise beats.

**Set design rule** (inside one 4-panel sheet): first panel framing **≠** last panel framing. Every active pattern lands on a close-up of the listener — guarantees the chunk-to-chunk splice is a clean reverse-shot or close-up-to-wide cut.

### 4. For each chunk K from 1 to N

**a. Compose the Seedance clip prompt** following [references/podcast-clip-prompt-guide.md](references/podcast-clip-prompt-guide.md).

Inputs to the composer:
- `composite_asset_id` (always `podcast:composite`)
- `storyboard_asset_id` (one of `podcast:storyboard:A/B/C`)
- `speaker_persona_id`, `listener_persona_id`
- chunk's monologue segment with **per-line camera-state tags**
- chunk position (`K=1` cold-open / `1<K<N` middle / `K=N` close)
- chosen Pattern A/B/C

**b. Generate the chunk video** via `generate_scene_video`:

| Parameter | Value |
|---|---|
| `backend` | `"seedance"` |
| `start_image` | `podcast:storyboard:<A|B|C>` — the chosen storyboard is Seedance's narrative map for this chunk's shot pattern |
| `reference_images` | `[podcast:composite, persona:<speaker>, persona:<listener>]` — **composite MUST be slot 0**. Swap speaker / listener positions per chunk by which host is speaking. **IMAGES ONLY** — never put a voice asset here. |
| `motion` | composed Seedance prompt with verbatim quoted dialog + per-line camera-state tags + `{{persona:<speaker>}}` / `{{persona:<listener>}}` inline. End with `{{speak:persona:<speaker>}}…{{/speak}}` spans wrapping each on-camera line. Include explicit "no camera motion, locked tripod, no zoom, no pan, no push, no pull". |
| `dialogue` | per-speaker entries in spoken order: `[{"speaker": "persona:<name>", "text": "<line verbatim>", "voice_id": "<kling_voice_id>", "delivery": "<2-6 word tone>"}, ...]`. **Required whenever motion contains any `{{speak:X}}` span.** |
| `duration` | this chunk's `d` rounded to an integer in `[8, 15]` |
| `aspect_ratio` | output aspect |
| `output_asset_id` | `podcast:chunk:K:video` |
| `scene_number` | `K - 1` (0-based) |

**c. Extract the audio track** via `split_audio`:

| Parameter | Value |
|---|---|
| `video_url` | `podcast:chunk:K:video` |
| `output_asset_id` | `podcast:chunk:K:audio` |
| `scene_number` | `K - 1` |

Seedance bakes synthesized speech into the video. `split_audio` pulls it back out as standalone MP3 — `assemble_video` uses this as the frame-aligned voice track (NOT any upstream original voice asset).

**d. Transcribe to word-level timestamps** via `transcribe_audio`:

| Parameter | Value |
|---|---|
| `audio_url` | `podcast:chunk:K:audio` |
| `script_text` | this chunk's verbatim dialog (host + guest lines concatenated in spoken order) |
| `output_asset_id` | `podcast:chunk:K:words` |
| `scene_number` | `K - 1` |

The returned `words_file` carries `[{word, start, end}, ...]` timing — `assemble_video` uses it to render word-by-word captions if requested by the producer.

### 5. Assemble the final video

Call `assemble_video` with one `scenes[]` entry per chunk, in order:

```
scenes = [
  {
    "asset_url":   "podcast:chunk:1:video",
    "audio_url":   "podcast:chunk:1:audio",
    "words_file":  "podcast:chunk:1:words",
  },
  ...
  {
    "asset_url":   "podcast:chunk:N:video",
    "audio_url":   "podcast:chunk:N:audio",
    "words_file":  "podcast:chunk:N:words",
  },
]
```

Plus:
- `output_asset_id`: `podcast:final:video`
- `aspect_ratio`: output aspect

Hard-cut concat is the default. Music / captions / additional overlays are downstream producer decisions — this skill returns the assembled chunks; the producer can re-render with music score on top.

### 6. Write the plan file

Save `/tmp/outputs/podcast-plan.md` per [templates/podcast-plan-template.md](templates/podcast-plan-template.md). The plan documents: total duration, chunk count, episode spine, per-chunk metadata (pattern, speaker, listener, duration, monologue segment with camera-state tags), the verbatim composite prompt, storyboard prompt(s), per-chunk Seedance prompt, and the final asset ID.

### 7. Return

One-paragraph summary stating: total duration, chunk count, the final asset ID (`podcast:final:video`), and the path to the plan file.

---

## Hard Rules (10 — non-negotiable)

Each rule is enforced at one or more pipeline steps.

1. **Exactly 2 personas — host + guest.** No third person, no audience, no walk-ons.
2. **Hosts speak themselves — NO narrator.** Every chunk prompt is a literal script of quoted lines from named hosts with **per-line camera-state tags**. No third-person narrator describing actions, no anonymous off-screen voice, no third unnamed speaker, no `Style & Mood` / `Narrative Summary` / `Dynamic Description` / `Static Description` skeleton (that block format is for non-podcast Seedance and is forbidden here).
3. **Set is a podcast studio.** Bookshelf / brand backdrop / neon / lived-in production space, table mics. Both personas share the SAME backdrop (one room, two angles). Outdoors / home / cafe are valid setting variants (see composite guide invent-from-scratch seeds), but never **mixed** within one episode.
4. **Eye-line continuity — NEVER eyes-to-camera.** Host on camera-LEFT → body angled toward camera-right, eyes off-camera right. Guest on camera-RIGHT → body angled toward camera-left, eyes off-camera left. Wides on the composite = mutual / inward gaze. Chunk close-ups = biased toward the off-frame partner. **No "presenting to camera," ever.**
5. **Camera is LOCKED-OFF on every chunk.** No push-in, pull-out, pan, tilt, zoom, rack focus, handheld shake, Ken-Burns. Each `generate_scene_video` motion field MUST include "no camera motion, locked tripod, no zoom, no pan, no push, no pull" — otherwise Seedance adds motion by default.
6. **Mics visible on every talking shot — plain, unbranded.** Generic black studio condenser on a black boom arm. **Never name a specific mic model** — gpt-image-2.5-sunburst renders model names as branding text on the mic body. Describe it generically instead: "a large black studio condenser mic on a black boom arm in the lower-third foreground."
7. **Composite is the blocking anchor — REQUIRED in every chunk's `reference_images[0]`.** Without it, chunks re-imagine blocking and the multi-chunk video falls apart at splices.
8. **No planning markers in the Seedance prompt body.** No `chunk #K of N`, no `EPISODE_SPINE`, no `CONTINUATION_RULE`, no `BEAT_NOTE`, no total-duration / outline metadata. Plan the arc in the plan file; the chunk prompt describes only what is shown and said in this one chunk.
9. **Silent tail = final chunk only.** The ~1.5 s silent end-tail belongs ONLY on chunk N (or chunks the user explicitly asked to end on silence). Intermediate chunks end mid-beat — no silent hold, no "clean editing tail", no "hold the final close-up silently", no "ambient room tone only" directive.
10. **Natural, conversational performance — never exaggerated.** Gestures and facial expressions stay understated, like two people genuinely talking. No theatrical reactions, no mugging for the camera, no oversized hand-waving or eyebrow acting. Each `generate_scene_video` motion field should direct calm, natural delivery and subtle movement — the realism of an ordinary conversation, not a performance.

---

## Reference resources

- [references/podcast-composite-prompt-guide.md](references/podcast-composite-prompt-guide.md) 📖 — Full guide for the 16:9 seated-composite `generate_image` prompt: 2-host seating, eye-line geometry, mic placement, location-as-positive-description, default cool-lighting policy (warm only on explicit warmth signal), 3–5 host panel extensions. **Read before Step 2.**
- [references/podcast-storyboard-prompt-guide.md](references/podcast-storyboard-prompt-guide.md) 📖 — Verbatim Storyboard A / B / C templates, color rule (strict B&W on `#FFFFFF`), 180° rule, first-panel ≠ last-panel rule, grayscale-conversion rule for colored persona refs. **Read before Step 3.**
- [references/podcast-clip-prompt-guide.md](references/podcast-clip-prompt-guide.md) 📖 — Per-chunk Seedance prompt anatomy: dialog labeling conventions (`[on-camera]` / `[voice-over, off-camera]` / `[continuing]` / `[silent — mouth stays closed]`), voice-over rules, silence / dead-air budget, episode narrative continuity, conversation premise patterns, topic frameworks. **Read before Step 4a.**
- [references/podcast-patterns.md](references/podcast-patterns.md) 📖 — 5 validated example structures (SP1–SP5) — full hero portraits, voice direction, 5-chunk dialog, storyboard pattern selection per chunk. Use as scaffolds, swap the topic. **Read before Step 1 to seed the chunk arc.**
- [references/podcast-troubleshooting.md](references/podcast-troubleshooting.md) 📖 — P0–P14 failure-mode diagnostics: composite missing / silent tail leaking / B&W violation / 180° break / lipsync wrong / refused generation / dead-air / wrong vibe. **Read as needed when a chunk or storyboard fails QA.**
- [templates/podcast-plan-template.md](templates/podcast-plan-template.md) — Output plan file format.

---

**Usage**: Dispatched by Producer when the user wants a podcast-style two-host conversational video — "Joe Rogan–style", "creator interview", "founder talk", "investigative deep-dive", any content that should feel like a clip from a longer sit-down podcast. Persona precondition required (host + guest both registered via producer-level `setup_persona`). Self-contained: plans episode arc, generates one composite + 1–2 storyboards, composes per-chunk Seedance prompts, generates chunks, splits + transcribes audio, assembles final video. References use progressive disclosure — read only when needed for the current step.