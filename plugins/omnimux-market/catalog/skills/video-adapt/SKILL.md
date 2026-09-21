# Video Adaptation Pipeline

Canonical home of the adaptation workflow. Load this skill when a source video URL is paired with adapt/recreate intent. Research-only trend analysis lives elsewhere and refuses adaptation requests — load video-adapt directly instead.

The pipeline is end-to-end: it analyzes the source, builds every reference keyframe with `generate_image`, regenerates every scene with `generate_scene_video`, and assembles the final cut with `assemble_video`. Reference-keyframe generation (locations, avatars, props, outfits, composites, storyboard sheet) is done with `generate_image`; each keyframe is written to a stable `output_asset_id` so a re-run with the same inputs reuses the asset instead of regenerating. Scenes are rendered with `generate_scene_video` (one call per chunk), keyed off the reference assets via `reference_images`.

## Setup (mandatory before Step A)

No special toolset load is required — `web_fetch`, `get_asset`, `list_assets`, `generate_image`, `generate_scene_video`, `assemble_video`, and `AskUserQuestion` are all available natively.

The pipeline's deterministic concepts (slot budget planning, element creation with the right body shape, scene-prompt substitution) are applied as you build the IMAGE MAP and the per-scene prompts — each reference keyframe is generated once with `generate_image` against a stable `output_asset_id`, so re-running with the same inputs reuses the cached asset.

When the user attaches a reference image (a real persona or product to preserve), inspect it with `get_asset` / `list_assets` and carry its asset id forward as a `reference_images` / `image_urls` input — there is no separate upload step.

**Source video tip.** For public YouTube/TikTok URLs, read the reference directly: fetch the page/metadata with `web_fetch`, and if the user attached the clip as an asset, read it with `get_asset`. Analyze the source scene-by-scene yourself (the `video_analyze` step below describes the structured concept you produce from that read).

### Reading the reference (the analyze step)

The Step A and C.2 analysis steps below are described as `video_analyze(...)` calls for clarity — operationally, you read the reference (via `web_fetch` for a public URL, or `get_asset` for an attached clip) and produce the structured storyboard / adapted concept yourself, following the exact output schema each step specifies. There is no separate upload or job-status poll — keep the reference as an asset id / URL and analyze it in your own turn.

## User-facing output rule (silent pipeline)

The pipeline runs **silently**. Do NOT print bookkeeping to the user — keep IMAGE MAP, ELEMENT_BINDINGS, render-mode decision, case-routing rationale, location-counting tables, per-step status narration, or any "what I'm about to do next" text inside your own scratch reasoning. None of it is needed for the pipeline to function — every block is either consumed by a later step (IMAGE MAP → adapt prompt in C.2; ELEMENT_BINDINGS → the `reference_images` substitution in D.1) or is a purely internal decision (render mode, case selection).

The ONLY user-visible messages allowed during a run:

- `AskUserQuestion` calls when the skill explicitly requires user input (e.g. Step 0a aspect ratio + storyboard mode in one card — INVARIANT 10).
- Failure escalations per D.2 (`nsfw`, repeated `failed`, `no_url`, outfit-transfer refusal per INVARIANT 6, training refusal per INVARIANT 7).
- The final delivery after Step E: the assembled video URL (and a one-line note if default mode rendered only chunk 0 — see D.1.5).

Anything else — IMAGE MAP block, `[RENDER MODE: ...]` marker, "I'll now create elements for...", "Detected case 2 because...", "Generating 3 scenes..." — stays internal. The user sees tool calls (their progress is rendered by the harness) and the final result, nothing in between.



## INVARIANTS (hard rules — violations = stop)

1. **Workflow is fixed:** Step A → B → C → D → E. No alternatives, no improvised shot-by-shot workflow, no skipping steps.
2. **Case routing is fixed:** product → Case 1; avatar only → Case 2; neither → Case 3.
3. **Reference keyframes are generated once with `generate_image`.** Each location / avatar / prop / outfit / composite / storyboard slot is a single `generate_image` call to a stable `output_asset_id`; re-running with the same inputs reuses the asset. Do NOT re-implement upload + element-create chains — there is no separate upload step; the input/reference asset id is carried via `image_urls` / `reference_images`.
4. **Substitution is reference-image-only.** Scene rendering resolves each `<<image_N>>` marker to its bound asset id and passes those ids to `generate_scene_video(reference_images=[...])`. Do NOT pre-substitute UUIDs into the prompt text and pass post-substitution text to the video model. Do NOT hand-edit chunk prompts after parsing — they go straight into `generate_scene_video(motion=...)` verbatim.
5. **NSFW / failed scenes are NOT auto-retried.** When a `generate_scene_video` call returns a content-policy block or repeated failure, escalate to the user. Re-submitting the identical prompt won't change content-policy decisions; rewriting the prompt violates the byte-identical rule. The user decides: (a) skip the failed chunk in final assembly, (b) re-run from Step C with adjusted source storyboard, (c) abort.
6. **Main character ALWAYS gets a base outfit-element; `preserve_source_outfit` only flips the SOURCE.** Default = extract the outfit from the user's avatar image (read it with `get_asset` and describe the garments) and lock it via a dedicated outfit-board `generate_image` call so each scene composites the same wardrobe. Opt-in via `preserve_source_outfit=True` ("outfit of original", "keep original clothing", "wear the source outfit", "как в оригинале по одежде", "сохрани одежду", "оставь костюм оригинала") flips the SOURCE: outfit comes from the source storyboard's `CHARACTERS.main.outfit_summary` instead of the avatar. For repeating SECONDARY characters (`role: secondary` with `len(appears_in_scenes) >= 2`), always build the combined identity+base-outfit keyframe per B.5 (the base outfit is baked into that combined keyframe, no separate outfit slot needed for the base). For ENSEMBLE groups (`role: ensemble`), build a single combined group portrait per B.5 (uniform is baked into the group keyframe, no separate outfit slot). For each `outfit_changes` entry on any character, build an additional outfit-board keyframe. NEVER hand-edit chunk prompts post-adapt; outfit gets injected via the IMAGE MAP outfit-slot which the adapt step renders as `dressed in <<image_N>>`. **Fallbacks for main outfit**: if outfit reading fails OR returns all-`inferred` garment slots (avatar shows only face/shoulders), skip the main outfit element entirely and fall back to "avatar image carries the outfit" — log warning, do NOT block the pipeline.
7. **No identity training inside the pipeline.** Pre-trained persona references are pass-through; missing → use the auto-avatar rule (B.3). Training requests are refused — direct the orchestrator to the identity-training skill instead.
8. **Full mode runs in the main agent context.** A full-mode A→B→C→D→E pipeline is long-running; run the steps directly from your own turns rather than handing the whole pipeline to a single bounded sub-task.
9. **Pipeline assembles at Step E.** After every in-scope chunk has rendered, assemble the completed scene videos into the final cut with `assemble_video`. Do NOT hand back un-stitched scene clips.
10. **MANDATORY Step 0a prompt — first user-facing action.** You MUST call `AskUserQuestion` at Step 0a (immediately after the brief is understood, BEFORE Step A analysis or any B-step keyframe generation) with BOTH questions in a single card (aspect ratio + storyboard mode) per the `## AskUserQuestion` section above. There is NO implicit storyboard default — proceeding to generate a storyboard sheet without the user's explicit `storyboard_mode` answer is a HARD VIOLATION. Three modes the user picks from — `classic`, `sketch`, or `off`:
    - **`classic`** (default visual) — colored pictogram on warm beige paper; LEGEND ROW banner + ID badges + END card. Build the C.5 storyboard sheet with `generate_image(model="gpt-image-2.5-sunburst", ...)` using `style="classic"` prompt layers.
    - **`sketch`** — semi-transparent pencil/ink strokes (`#A0A0A0–#C0C0C0`) on pure white `#FFFFFF`; NO LEGEND ROW banner, NO entity badges, NO ID glyphs, NO END card; CHUNK badge rendered in thinnest grey `#D0D0D0–#E8E8E8`; hairline cell-grid stays black for legibility. Build the C.5 storyboard sheet with `generate_image(model="gpt-image-2.5-sunburst", ...)` using `style="sketch"` prompt layers.
    - **`off`** — NO storyboard sheet generated; do NOT run C.5; do NOT add a storyboard slot to IMAGE MAP / ELEMENT_BINDINGS / `bindings_meta`; render scenes in D.1 with no storyboard reference image.

    For modes `classic` / `sketch`: the SHEET parameters are locked to `model="gpt-image-2.5-sunburst"` / 2:3 vertical / `resolution="2K"` / high quality — none overridable (typography/flat-graphic output is why the sheet uses `gpt-image-2.5-sunburst`). Two public knobs: `panel_aspect` (orients inner cell tiles to match the chosen scene-video output aspect) and `style` (`classic` / `sketch`). The storyboard sheet's asset id is bound to the trailing slot in IMAGE MAP / ELEMENT_BINDINGS and passed to each scene's `generate_scene_video(reference_images=[..., <storyboard asset id>])`. A storyboard generation failure ABORTS the pipeline — do NOT fall through to Step D without it (modes `classic` / `sketch` only). The deterministic composition prefix prepended to each chunk's prompt at scene-render time is internal (the chunk dict is NOT mutated, INVARIANT 4 holds: the parsed `prompt_text` from the adapt step stays byte-identical). Element naming uses the `vadapt-sb-<sha8>` convention so storyboard sheets never get confused with outfit boards (`*-outfit`) or other prop elements. Both visual styles are HARDCODED-per-mode — they are NOT driven by the source video's visual register (a cinematic source does NOT make the storyboard render as a cinematic frame; that would defeat its purpose as a composition anchor).
11. **Scene budget is ≤ 9 unique reference images per scene.** The scene video model rejects scenes that reference more than 9 distinct reference-image asset ids via `<<image_N>>` markers. **The agent ALWAYS plans under an effective budget of 8** — the planner keeps `reserve_storyboard_slot=True` regardless of which storyboard mode the user picks at Step 0a. Rationale: this guarantees a plan built for `off` stays valid if the user later flips the mode to `classic` / `sketch` (the storyboard prefix would then add 1 ref per scene and a budget-9 plan would over-fill). At render time the per-scene audit relaxes to 9 when there is no storyboard reference (mode `off`) and stays 8 when a storyboard reference is set (modes `classic` / `sketch`); the planning-side reserve is independent of that. Effective budget for everything else (main + secondaries + ensembles + locations + recurring props + outfit-elements): **8**. **Compaction is upstream, at keyframe-creation time** (Steps A.5 → B.2 / B.4 / B.5), driven by the budget-planning oracle (Step A.5). The oracle takes the chunked adapt output plus the agent's intended slot kinds and returns ordered composite recommendations following the **composition hierarchy** (priority order, MUST be honored):

    1. **`composite_outfit`** (B.5) — same-subject outfits collapsed onto one numbered ghost-mannequin sheet. Fires when one character has ≥2 outfit slots and at least one chunk holds two or more of them. Cap: 2 ≤ panels ≤ 3 (image fidelity).
    2. **`composite_props`** (B.4) — ≥2 recurring inanimate props that co-occur in the same chunk, packed onto one numbered shelf. Cap: 2 ≤ panels ≤ 3.
    3. **`composite_environment`** (B.2, **last resort**) — EXACTLY 2 locations that co-occur in the same chunk, packed side-by-side at 21:9 with a vertical divider. Cap: 2 panels (envs need depth/sky and don't compress past two).

    The oracle picks the smallest set of composites that closes the deficit; it never recommends a composite whose panel count its generator would reject. `all_within_budget_post: true` ⇒ proceed to B.2/B.4/B.5 by generating the matching composite keyframe(s). `false` (rare) ⇒ chunk is fundamentally over budget; revisit the chunking before generation. For more than 3 items of one kind, split into multiple composites (e.g. 6 outfits → two composites of 3+3, 5 props → 3+2; for envs split each pair into its own `composite_environment` keyframe).

    Each composite participates in IMAGE MAP as a single `<<image_N>>` slot whose entry spells out each panel ("panel 1 = grey suit, panel 2 = warrior armor, panel 3 = night jumpsuit") so the adapt step in C.2 writes `panel I of <<image_N>>` inside scene text on its own. Substitution at render time then handles it like any other slot — no special composite parameter, no rewrite layer. The `bindings_meta` list (see C.1b for the schema) drives a per-scene budget audit; over-budget scenes log a structured WARNING with kind-breakdown but rendering still proceeds (the video model will hard-fail at the API layer if a scene really has too many reference images). If a warning fires after honoring the oracle, the agent skipped the planner OR ignored a recommendation — re-run the budget plan and apply ALL of its recs.

    **The planner ALWAYS reserves the storyboard slot at planning time, regardless of mode.** The budget plan keeps `reserve_storyboard_slot=True` for ALL storyboard modes (`classic` / `sketch` / `off`) so its `effective_budget_per_chunk` returns **8**. This is intentional: a plan built for `off` stays valid if the user later flips the mode to `classic` / `sketch` (the storyboard prefix would then add 1 ref per scene; a plan made under budget 9 would over-fill). The render-time audit relaxes to 9 in mode `off` and stays at 8 in modes `classic` / `sketch`. Do NOT include the storyboard slot in `slot_plan` — the reserve already accounts for it; listing it would double-count.

## Distinguishing reference photos from trained personas

A user-attached photo is NOT a trained persona reference. Photo → read it with `get_asset` and carry the asset id forward as the identity `reference_images` input. An explicit "train" phrase → refuse and direct the orchestrator to the identity-training skill instead.

---

## `AskUserQuestion` — what to ask, what to NEVER ask

`video-adapt` already pins every workflow parameter (model per step, aspect ratio default, resolution, duration, audio, reference-image shape, storyboard sheet parameters). Use `AskUserQuestion` **only** to fill the two user-owned choices the brief left blank — never to "confirm" defaults, offer pipeline forks, or downgrade the chain.

### NEVER ask via `AskUserQuestion` (anti-flow forks — defaults are already set)

Defaults are non-negotiable; surfacing them as a viewer choice is a flow violation.

- **Model preference** ("which image / video model?", "cinematic vs UGC?") — locked: `generate_scene_video(backend="seedance")` (video) + `generate_image(model="nano-banana-2")` (B-step keyframes) + `generate_image(model="gpt-image-2.5-sunburst")` (storyboard sheet). Never ask.
- **Input assets** ("do you have a product photo / brand logo / reference image?") — the source video URL IS the input. Avatar is either user-attached (auto-detected) or auto-generated via B.3. Never ask.
- **Quantity / variants** ("how many variants?", "how many chunks?") — pinned by the `D.0` render-mode keyword detector (default = chunk 0 only; full = all chunks via English keyword list). Never ask.
- **Style reference** ("any creator's style to match?", "match an existing aesthetic?") — the source video IS the style reference. Never ask.
- **Render mode forks** ("full or default?", "all chunks or just one?", "preview or final?") — derived from the `D.0` keyword detector inside the brief. Never asked.
- **Outfit preservation** ("keep original outfit or use the avatar's?") — derived from the `D.0c` keyword detector inside the brief. Never asked.
- **Resolution / quality / dimensions** — locked per step (scene-video preset, `gpt-image-2.5-sunburst` `resolution="2K"` high). Never ask.
- **Pipeline forks** ("skip storyboard?", "skip composite?", "skip B-step?", "text-only?") — Step C.5's mode-gate is already covered by `storyboard_mode` in DO ask. No other pipeline forks exist for adapt.

### DO ask via `AskUserQuestion` (creative gaps only)

Bundle these into **one** `AskUserQuestion` call when more than one is missing — do **not** fire a separate question per gap.

| Question | Ask when | Notes |
|---|---|---|
| **Aspect ratio** ("Output aspect ratio?") | Brief did NOT explicitly state aspect ("16:9 video", "vertical reel format", "9:16 нужно") | Required. Drives the C.5 storyboard `panel_aspect` AND `generate_scene_video(aspect_ratio=...)` at D.1. Both MUST receive the SAME value. |
| **Storyboard mode** ("Composition storyboard for scenes?") | Brief did NOT explicitly state a mode ("no storyboard", "sketch storyboard", "карандашный сториборд", "без сториборда") | Required. Controls whether C.5 runs and which `style=` to use. Three modes: `classic` (color on beige), `sketch` (pencil on white), `off` (no storyboard). |

**Format the question like this** (single bundled call, plain text):

```
AskUserQuestion(
  questions=[
    {
      "id": "aspect_ratio",
      "prompt": "Output aspect ratio?",
      "options": [
        "9:16 (vertical — Reels / Shorts / TikTok)",
        "16:9 (horizontal — YouTube / desktop)",
      ],
    },
    {
      "id": "storyboard_mode",
      "prompt": "Composition storyboard for scenes?",
      "options": [
        "classic — color on beige",
        "sketch — pencil on white",
        "off — no storyboard",
      ],
    },
  ],
)
```

**Skip a question only when the brief explicitly answers it.** If the brief states the aspect (e.g. "make a 16:9 video", "vertical reel format"), drop that question. If the brief states a storyboard mode (e.g. "no storyboard", "sketch storyboard", "карандашный сториборд"), drop that question. If neither is stated, ask BOTH — combined into the single tool call above.

**Capture and thread the answers downstream:**
- `aspect_ratio` → C.5 storyboard `panel_aspect` (modes `classic` / `sketch` only) AND `generate_scene_video(aspect_ratio=...)` at D.1.
- `storyboard_mode` → controls whether C.5 runs at all and which `style=` to use:
  - `classic` → build the C.5 storyboard sheet with `style="classic"`; pass its asset id as the storyboard `reference_images` member to D.1.
  - `sketch` → build the C.5 storyboard sheet with `style="sketch"`; pass its asset id as the storyboard `reference_images` member to D.1.
  - `off` → SKIP C.5; OMIT the storyboard slot from IMAGE MAP / ELEMENT_BINDINGS / `bindings_meta`; render D.1 scenes with no storyboard reference image.

---

## Step 0a — Ask user (aspect ratio + storyboard mode)

> **STOP.** This is the first agent action after the brief is understood. Issue the `AskUserQuestion` call from the section above BEFORE Step A (analysis), B-step keyframe generation, or any other tool call. Follow ONLY the `### DO ask` list — skip a question only if the brief explicitly answered it.

Two decisions feed Step C.5 (storyboard sheet) and Step D.1 (scene render): **(1) scene-video aspect ratio** and **(2) storyboard mode** (`classic` / `sketch` / `off`). Both are pure user preferences — they do NOT depend on source analysis. Collect them upfront so the rest of the pipeline runs without interruption.

**Aspect ratio.** Source videos vary (a 1920×1080 horizontal source, a 1080×1920 vertical TikTok/Reel), and the agent cannot reliably infer user intent from the source — a horizontal source might still be wanted as a 9:16 reel cut, and vice versa. The chosen value drives both the C.5 storyboard `panel_aspect` (orients inner storyboard tiles) and `generate_scene_video(aspect_ratio=...)` (the rendered framing). Both MUST receive the SAME value or the storyboard's blocking won't match the rendered framing.

**Storyboard mode.** Picks the visual register of the C.5 sheet (or skips it). Three options (per INVARIANT 10):
- `classic` — colored pictogram on warm beige paper; LEGEND ROW + ID badges + END card. The original look. Build with `style="classic"` at C.5.
- `sketch` — semi-transparent pencil/ink on white `#FFFFFF`; NO legend, NO entity badges, NO END card; thin-grey CHUNK badge; black hairline grid. Build with `style="sketch"` at C.5.
- `off` — NO storyboard sheet. Skip C.5 entirely; do NOT add a storyboard slot to IMAGE MAP / ELEMENT_BINDINGS / `bindings_meta`; render D.1 scenes with no storyboard reference image.

### After Step 0a — proceed to Step A

> **Step 0a is a questionnaire gate ONLY — not a "ready to render" signal.** After the user answers (or after both questions are skipped because the brief already answered them), ALWAYS proceed to **Step A (analysis)** as the immediate next action. Do NOT skip ahead to Step C.5 (storyboard) or Step D.1 (scene render) — Steps A → A.5 → B → C.1..C.3 must complete first. The Step 0a answers (`aspect_ratio`, `storyboard_mode`) sit in scratch context until C.5 / D.1 consume them.

---

## Step A — Analyze video

```
storyboard = video_analyze(
    video_source="<youtube_or_tiktok_url>",   # read via web_fetch (public URL) or get_asset (attached clip)
    category="analysis_templates",
)
```

`video_analyze` here means: read the reference (public URL via `web_fetch`, attached clip via `get_asset`) and produce the structured scene-by-scene storyboard yourself, in the `analysis_templates` schema described below.

For Instagram reels (private/cookied content can't be fetched directly):

```
1. Resolve the reel's public media URL from the shortcode.
2. Read that media URL with web_fetch and analyze it as the analysis_templates storyboard.
```

Extract shortcode from URL: `https://www.instagram.com/reel/ABC123/` → `ABC123`.

**Use a video-understanding read, not a metadata read.** Plain metadata (formats, channel, duration, comments, statistics) does NOT produce a scene-by-scene storyboard — you must analyze the actual frames. This restriction applies only to obtaining the Step A storyboard; metadata reads remain valid for unrelated tasks (channel discovery, view-counts).

The output is the original concept. Preserve the STRUCTURE HEADER (STRUCTURE, VARIANT_AXIS, CHARACTER_CONTINUITY, STYLE, UNIQUE_LOCATIONS, RECURRING_PROPS, **CHARACTERS**) verbatim. The `STYLE` value is the routing key for B.3 auto-avatar prompt construction — keep it intact. The `CHARACTERS:` block drives B.5 element generation: each entry has `role` (`main` / `secondary` / `ensemble`), `outfit_summary`, `appears_in_scenes`, optional `outfit_changes`, plus `count` (required for ensemble) and `is_member_of_ensemble` (optional on a secondary that belongs to an ensemble). Read it from this Step A output — do NOT re-derive characters by grepping the scene blocks.

### A.5 — Plan composites (mandatory two-pass oracle, INVARIANT 11)

> **NOTE on ordering.** A.5 sits between Step A and Step B in the section listing for clarity, but it can ONLY run AFTER you have a chunked concept. You will return here from Step C.4 (after the chunks are parsed) the FIRST time you build a slot plan. Treat A.5 as the planner that gates Step B.2 / B.4 / B.5 keyframe creation — re-run B.2/B.4/B.5 only AFTER A.5 returns `all_within_budget_post: true`.

**Why this step exists.** The scene video model hard-rejects scenes with > 9 unique reference images (INVARIANT 11). Generating individual keyframes first and discovering the overrun at render time wastes a full B-step worth of generations. The budget-planning oracle projects the budget BEFORE you generate anything and tells you exactly which composites to make.

**Inputs.** The chunked concept text (Section 2 of the adapt output, after `===CHUNKS_15S===`) and a `slot_plan` of your tentative `<<image_N>> → kind/subject` assignments — what each slot will be once you've generated it. The slot_plan does NOT need actual asset ids at this step; the planner is purely structural.

**Plan.** Project the per-chunk budget with a slot plan like:

```
report = plan_chunk_budget(
    chunked_concept=<adapt output>,
    slot_plan=[
        {"slot": "<<image_1>>", "kind": "character"},
        {"slot": "<<image_2>>", "kind": "outfit", "subject": "main"},
        {"slot": "<<image_3>>", "kind": "outfit", "subject": "main"},
        {"slot": "<<image_4>>", "kind": "outfit", "subject": "main"},
        {"slot": "<<image_5>>", "kind": "environment", "label": "street"},
        {"slot": "<<image_6>>", "kind": "environment", "label": "rooftop"},
        {"slot": "<<image_7>>", "kind": "prop", "label": "guitar"},
        # ...
    ],
)
```

**Output.** A structured report:

- `chunks: [{chunk_index, slots_in_chunk, n_unique_pre, n_unique_post, over_budget_pre, over_budget_post, by_kind_pre, slack_pre, slack_post}, ...]` — per-chunk projections. `over_budget_*` and `slack_*` are computed against the **effective** budget (see below), not the raw 9.
- `recommendations: [{kind, subject, slots, saves_per_chunk, saves_total}, ...]` — ordered composites you must build, following the **composition hierarchy** (priority order): `composite_outfit` → `composite_props` → `composite_environment`.
- `all_within_budget_post: bool` — headline pass/fail.
- `effective_budget_per_chunk: int` — actual cap applied per chunk (raw 9 minus reserved slots). With the default `reserve_storyboard_slot=True` you'll see **`8`**. Audit aid: verify the planner reserved for the storyboard.
- `reserved_storyboard_slot: bool` — echoes the input flag (default `True`). Production never sets this to `False` — see "About the storyboard reserve" below.
- `unknown_slots: [...]` — slots referenced in chunks but missing from your slot_plan (agent bug to fix).
- `unused_slots: [...]` — slots planned but never referenced (agent over-planned; not fatal).

> **About the storyboard reserve.** The planner ALWAYS reserves 1 slot per chunk for the storyboard sheet, regardless of which storyboard mode the user picks at Step 0a (`classic` / `sketch` / `off`). For modes `classic` / `sketch` the reserve matches reality — the Step C.5 storyboard prefix occupies 1 of the 9 reference slots at render time. For mode `off` the reserve is "wasted" (no storyboard prefix is prepended), but it keeps the plan valid if the user later flips the mode — a plan built under budget 9 would over-fill after the storyboard prefix is added. Cost: at most one extra composite per run (negligible). Always keep `reserve_storyboard_slot=True` (the default). Do **NOT** include the storyboard slot in `slot_plan` — the reserve already accounts for it.

**Decision rule (do NOT skip).**

0. **Sanity-check `effective_budget_per_chunk == 8` and `reserved_storyboard_slot == true`** — if you see `9` / `false` here, you accidentally turned the reserve off. The reserve is what makes the projection match what the scene model will actually see at render time.
1. `all_within_budget_post == true, recommendations == []` ⇒ no composites needed. Proceed to B.2/B.4/B.5 with one keyframe `generate_image` call per slot.
2. `all_within_budget_post == true, recommendations != []` ⇒ apply the recs verbatim. For each rec, build the matching composite keyframe with `panels=[{description: <plan label or full description>}, ...]` in the SAME order as `slots`. Then make ONE binding entry for the composite slot in IMAGE MAP / `bindings_meta`, listing all panels in its `description` field; do NOT also create the per-slot bindings the composite replaces. Continue to B.2/B.4/B.5 for the slots NOT consumed by composites.
3. `all_within_budget_post == false` ⇒ chunk is fundamentally over budget; the planner could not close the gap. Return to Step C.2 and re-chunk into shorter windows (≤8s) for the overrun region. Do NOT proceed to B-step generation.

**Cache and idempotency.** Re-running the budget plan is free (pure structural projection, no API calls). Re-running with the same panel order produces the same composite keyframes and reuses the cached `output_asset_id` on the first generation attempt. **Panel order is part of the cache key** — `[A, B]` and `[B, A]` produce different keyframes and different rendered layouts (panel 1 = panels[0]). Decide order once and pass it on every retry.

**Examples**

| Source profile | Likely recs |
|---|---|
| 7 outfit changes for main, 4 envs, 2 props | `composite_outfit(main, [O1..O3])` + `composite_outfit(main, [O4..O6])` + maybe `composite_outfit(main, [O7])` ⇒ no — single outfits stay individual; agent splits outfits into pairs/triples. |
| 4 envs that all co-occur in chunk 1 | `composite_environment([E1, E2])` + `composite_environment([E3, E4])` |
| 3 props + 3 envs + 3 outfits all in one dense chunk | outfit-comp(3) → 1 saved; props-comp(3) → 2 saved; env-comp(2) → 1 saved; one env stays individual. |

---

## Step B — Create elements

### B.1 — User character (if provided)

When the user attaches a photo, read it with `get_asset` (or find it via `list_assets`) and carry its asset id forward as the identity reference. There is no separate upload step.

**⚠️ Share-page URLs vs direct image URLs.** Users sometimes paste a *viewer/share URL* (Kommodo, Loom, Notion, Google Drive preview, etc.) instead of a direct image URL. These return HTML, not an image. Known share-page platforms and their real image URL patterns:

| Platform | Share URL pattern | Real image URL pattern |
|---|---|---|
| Kommodo | `kommodo.ai/i/<id>` | `plain-eeur-prod-public.komododecks.com/<YYYYMM>/<DD>/<id>/image.jpg` |
| Loom | `loom.com/share/<id>` | Look for `cdn.loom.com` thumbnail URLs |
| Google Drive | `drive.google.com/file/d/<id>/view` | `drive.google.com/uc?export=download&id=<id>` |

Resolve the content-specific direct image URL (not site icons or OG images) before using it as a reference.

The user's character is the terminal identity reference. Never regenerate. Carry its asset id (e.g. `<<image_1>>` → that asset id) into the IMAGE MAP / ELEMENT_BINDINGS so it flows into every scene's `reference_images`. Cache the asset id in your scratchpad if you intend to reference the same source image later in the run.

### B.2 — Locations

Identify unique physical spaces from the storyboard (count UNIQUE PHYSICAL SPACES, not shots — multiple angles of the same space = 1; time-of-day shifts in the same space = 1 unless narratively central).

> **DECISION CHECK (read this BEFORE writing any tool call).** Did the Step A.5 budget oracle return a `composite_environment` recommendation? If yes, those slots go through a single composite-environment `generate_image` call (one call per pair, EXACTLY 2 panels per call), NOT through two separate location keyframes. See "Composite environments" subsection below for the exact procedure. Generating two individual environment keyframes when the oracle recommended a pair is the bug this check exists to prevent — env composites are the LAST-RESORT compaction tier (priority 3) and the planner only emits them when a chunk is genuinely over budget after outfit + props composites.

For each NON-composited unique location, generate the environment keyframe:

```
loc = generate_image(
    prompt="<verbatim location description from Step A>",
    output_asset_id="<location-slug>:final",   # e.g. street:final  — ≤32-char kebab-case slug
    aspect_ratio="16:9",
    resolution="2K",
    model="nano-banana-2",
)
```

This produces a clean wide environment plate keyed to a stable `output_asset_id`; re-running with the same prompt + asset id reuses the existing asset.

#### Composite environments — pair-up via a single composite keyframe

**When to use.** Only when the Step A.5 budget plan returns a `composite_environment` recommendation. This means the chunk is genuinely over budget AND outfit + props composites alone could not close the gap (env composite is priority 3 in the hierarchy). Two locations that co-occur in the same chunk get packed onto one wide reference plate split by a vertical divider.

**Constraints.**

- **EXACTLY 2 panels per call.** Environment composites do NOT support 3 panels (envs need depth/sky and don't compress past two). For 3+ recurring locations to compact, group them into pairs and build one composite per pair (e.g. 4 envs → two composites of 2+2).
- **21:9 aspect, hardcoded prompt geometry.** Use `aspect_ratio="21:9"` — the prompt language assumes that geometry. A different ratio will produce a layout mismatch.
- **Pair selection.** The two locations MUST co-occur within the SAME chunk — otherwise the composite saves no slots. Prefer visually compatible pairs (same time of day, similar architectural register) so the render doesn't show a forced juxtaposition.
- **Order matters for the cache key.** Swapping panel 1 and panel 2 yields a different cached keyframe AND a different image (panel 1 = panels[0]). The IMAGE MAP entry you write must list panels in the same order you passed.

**Build:**

```
env_comp = generate_image(
    prompt=(
        "Two-panel side-by-side environment reference plate, split by a vertical divider, 21:9. "
        "Panel 1 (left): wooden walkway over a marsh at golden hour. "
        "Panel 2 (right): stone medieval corridor with torchlight."
    ),
    output_asset_id="env-pair-marsh-corridor:final",   # default: env-pair-{sha8}:final
    aspect_ratio="21:9",
    resolution="2K",
    model="nano-banana-2",
)
```

**Then ONE IMAGE MAP entry for the composite slot:** `<<image_N>> = Composite environment (2 locations): panel 1 = wooden walkway over a marsh at golden hour, panel 2 = stone medieval corridor with torchlight`. Do NOT also create the two individual binding entries the composite replaces.

**`bindings_meta` entry:**

```
{"slot": "<<image_N>>", "label": "env-pair-marsh-corridor",
 "kind": "composite_environment"}
```

### B.3 — Auto-avatar rule (≥2 segments + no avatar provided)

If the adapted concept will split into ≥2 segments AND the user did NOT provide an avatar / character image / persona reference, generate the avatar keyframe:

```
avatar = generate_image(
    prompt="<built per STYLE-driven template — see below>",
    output_asset_id="auto-avatar:final",
    aspect_ratio="3:4",
    resolution="2K",
    model="nano-banana-2",
)
```

Produces a 3:4 portrait character reference. Switch to Case 2.

**Disabled whenever `avatar_provided == true`.**

**Auto-framing prefix (`portrait shot`).** Prepend `portrait shot, ` to the description before generating — image models may otherwise render the subject at varying scales (full body, mid shot, close-up), which produces inconsistent identity references across re-runs. The prefix locks the auto-avatar to a head-and-shoulders subject that the scene model then composites into per-scene full-body action.

The prepend is **idempotent** — if the description you build already declares a portrait-like framing (`Portrait of...`, `headshot`, `head and shoulders`, `bust shot`, `studio portrait`, `above-the-waist`), leave it as is. **Note**: changing this prefix would invalidate cached avatar keyframes (the asset id keys off the prompt), so descriptions that previously generated the same avatar will produce a fresh generation on first re-run.

#### Building the `prompt`

Do NOT improvise wild details — build the avatar portrait prompt directly from the appearance traits in Step A (see below). Structure it as: identity → appearance → face anchor → skin anchor → clothing → pose → lighting → background → aspect. Two craft anchors keep identity stable across re-runs and across scene composites:

- `high model facial features` (for a `ugc`-register source, also `symmetrical features`, `well-proportioned figure`)
- `natural skin texture`

Match the register to `STYLE` (from the Step A header):

- **`ugc`** — casual creator look: neutral-daylight lighting, no products in the subject's hands, and close on a UGC anchor like "captured in UGC style with a smartphone camera." Choose clothing to fit the location / tier / wardrobe sense of the source.
- **`editorial` / `cinematic` / `fashion`** — cleaner standalone-portrait register with an explicit clothing description and a wider stylistic range. Do NOT bake the source's smartphone/UGC look — or its cinematic grade — into the reference portrait.

**Source the appearance traits from Step A.** The `analysis_templates` schema requires describing each character on first appearance with age range, skin tone, hair (colour/style/length), clothing, accessories, body type — all in the Visual field of the scene where the character first appears. Pull those traits from there. The CELEBRITY rule in `analysis_templates` already strips names from public figures, so what you read is already anonymised — keep it that way.

**Drop "exact likeness" markers**: skip celebrity names (already absent), specific tattoos/scars, exact face-feature descriptions ("aquiline nose", "almond eyes"). Keep structural traits (age range, skin, hair, build, gender). The character keyframe is for **identity continuity across scenes**, not for cloning the source actor's face.

**Build a clean portrait — not a scene.** Even when `STYLE = cinematic` and the source is a music video with dramatic atmosphere, the prompt must produce a portrait of the person, not a recreation of the source's atmosphere. Cinematic colour grade / film grain / anamorphic flare belong in the **per-scene video prompts** (which you write in Step C), not in the character reference image. A cinematic-grade reference will bleed colour and grain into every scene and overpower per-scene grading.

**User brief overrides Step A traits.** If the user's brief contradicts what's in the storyboard (e.g. "make the character a redhead" while the source actor is dark-haired), the brief wins. The auto-avatar exists because the source avatar is unavailable — it should not slavishly mimic the source actor.

**Neutral-background override (mandatory for video-adapt).** Avatar portrait prompts tend to default to a contextual scene background ("blurred cafe interior", etc.). For video-adapt this is harmful: the scene model composites the WHOLE reference image, and a scene-bound backdrop leaks into every scene where main appears.

Override the `[background/setting]` field in your avatar prompt with:

```
isolated on pale white seamless studio background, no scene context, no environmental elements
```

Keep the rest of the prompt (face anchor, skin anchor, clothing description) intact. The B.5 secondary-identity generation uses the same override.

### B.4 — Recurring props

> **DECISION CHECK (read this BEFORE writing any tool call).** Did the Step A.5 budget oracle return a `composite_props` recommendation? If yes, those slots go through a single composite-props `generate_image` call (one call per group of 2-3 panels in the order the planner specified), NOT through N separate prop keyframes. See "Composite props" subsection below for the exact procedure. Generating individual prop keyframes when the planner recommended a composite is the bug this check exists to prevent — composites are how INVARIANT 11 stays satisfied at keyframe-creation time. Without an A.5 recommendation, fall through to per-prop keyframe calls below.

For each entry in Step A's `RECURRING_PROPS` block, generate the prop keyframe:

```
prop = generate_image(
    prompt=(
        "<verbatim visual description from RECURRING_PROPS>, "
        "isolated on pure white background, no scene context, single object centered"
    ),
    output_asset_id="<prop-slug>:final",   # e.g. silver-guitar:final
    aspect_ratio="1:1",
    resolution="2K",
    model="nano-banana-2",
)
```

Use the neutral-isolation suffix shown above so the scene model reads the prop silhouette cleanly. If `RECURRING_PROPS:` contains `- none`, skip B.4.

**Auto-framing prefix (`full body shot`) — animals only.** For an animal prop (dog, wolf, horse, cat, bird), prepend `full body shot, ` so the reference shows the complete silhouette (head + body + legs + tail) rather than a head-cropped close-up, and route it as a character-category reference (animals carry identity like characters). Inanimate objects (guitar, bottle, helicopter, piano, sword, phone) skip the prefix — they have no body framing. Idempotent: if the description already contains `full body`, `full-body`, `head to toe`, `head-to-toe`, or `full figure`, don't re-add the prefix.

#### Composite props — when ≥3 inanimate-object props would coexist in the same chunk (INVARIANT 11)

If `RECURRING_PROPS` contains 3+ inanimate items that are likely to co-appear inside a single scene budget window (typical signal: a montage with 3+ recurring fashion accessories or 3+ recurring set-dressing items that scenes hop between), generate a SINGLE composite props shelf instead of N individual prop keyframes:

```
shelf = generate_image(
    prompt=(
        "Three-panel numbered props shelf on pure white, evenly spaced, each object centered in its panel. "
        "Panel 1 = wide-brimmed black felt hat. "
        "Panel 2 = light beige straw hat with wide brim. "
        "Panel 3 = large beige textured tote bag."
    ),
    output_asset_id="props-shelf-<sha8>:final",
    aspect_ratio="1:1",
    resolution="2K",
    model="nano-banana-2",
)
# shelf asset id → one IMAGE MAP slot
```

**Hard cap: 2 ≤ panels ≤ 3 per shelf.** For more than 3 props, split (5 props → 3+2, 6 props → 3+3, etc.).

The composite participates in IMAGE MAP as one slot; its IMAGE MAP entry spells out each panel so the adapt step in C.2 writes `panel I of <<image_N>>` inside scene text:

```
<<image_8>> = Props shelf composite (3 panels):
              panel 1 = wide-brimmed black felt hat
              panel 2 = light beige straw hat
              panel 3 = large beige textured tote bag
```

Composite props are inanimate objects only. Animals and human secondary characters never go into a composite — they stay individual keyframes (identity/face fidelity matters too much, and they typically don't bunch up like inventory items do anyway).

When `RECURRING_PROPS` has < 3 items OR the items are spread thin across chunks (e.g. one prop per chunk), stick with individual per-prop keyframe calls.

### B.5 — Character identity & outfit elements

This step generates the per-character reference keyframes that the scene model composites into every scene. Two element types:

- **Identity element** (`character`). Locks the character's face/body (or group's shared identity) across every scene they appear in.
- **Outfit element** (`prop`, ghost-mannequin photography). Locks the character's wardrobe across scenes — without it the scene model reinvents the outfit per chunk.

Each role has its own identity + outfit pattern:

| Character | Identity source | Base outfit (in scenes without a change) | Per outfit_change |
|---|---|---|---|
| `main` (user provided avatar)        | user photo asset id (B.1)                   | outfit board from the avatar-derived outfit (default) OR from `main.outfit_summary` when `preserve_source_outfit=True` — **always generated** unless reading fallback triggers | outfit board from `entry.new_outfit` |
| `main` (auto, no avatar provided)    | auto-avatar keyframe (B.3)                  | outfit board from the outfit clause of the B.3 description verbatim — **always generated**; no read call (the avatar wasn't observed, the outfit was authored) | outfit board from `entry.new_outfit` |
| `secondary` with `appears_in_scenes >= 2` | combined persona+base-outfit keyframe on white background, used as a `character`-category reference | carried by the combined identity keyframe (no separate outfit slot needed for base) | outfit board from `entry.new_outfit` — separate board, identity stays locked |
| `secondary` with `appears_in_scenes == 1` | **skip — text-only in captions** | **skip** | n/a |
| `ensemble` (any count, ≥ 2 scenes by definition) | combined GROUP portrait of N matching figures (frontal full-body, white background), used as a `character`-category reference | carried by the combined ensemble keyframe (uniforms baked in, no separate outfit slot) | n/a — ensembles don't have outfit_changes per Step A schema |

**Why the asymmetry main vs secondary.** For main the user often provides a real photo whose identity must be preserved exactly — the user photo (carried via `reference_images` / `image_urls`) is the right primitive there (face fidelity matters most). The base outfit is split off into a separate outfit-board (default video-adapt behaviour) so the scene model composites a stable wardrobe across all main scenes; without this split the wardrobe drifts visibly between scenes. For secondaries identity-quality matters less (they're often side-of-frame or episodic) and a single keyframe locks both face and base wardrobe in one shot, used as a reusable `character`-category reference. Outfit_changes on either character work identically: identity is never regenerated, only an additional outfit board is produced and Step C composites it via `dressed in <<image_N>>`.

**Why ensemble exists.** When the source video features a recurring matching group (3 ninjas, 5 backup dancers) without internal differentiation in group shots, the scene model reinvents the group's appearance every chunk if there is no group reference — members look subtly different across scenes. A single group portrait used as one `character`-category reference locks the group's silhouette / uniform / count across every group-shot scene. If one member is also named with their own close-ups (e.g. lead-warrior who leads the trio), they get a SEPARATE `secondary` entry with `is_member_of_ensemble: <ensemble-slug>` — the ensemble slot is for group shots only, the individual slot is for that one member's close-ups (the two coexist; Step C routes each scene to the correct slot).

**No CHARACTERS entries for one-off crowds.** Step A schema reserves `CHARACTERS:` for individuals (`main`/`secondary`) and recurring matching groups (`ensemble`). Unnamed crowds, single-appearance background masses, distant generic figures (eight guards in one scene, audience members, passersby) are described inline in scene captions as plain text. They never enter B.5. The `adapt_avatar` / `adapt_product` adapt prompts have an explicit BACKGROUND/CROWD CHARACTERS rule preventing `<<image_1>>` from being attached to such groups.

#### Procedure (execute literally, do not skip steps)

> **DECISION CHECK (read this BEFORE writing any tool call).** Did the Step A.5 budget oracle return a `composite_outfit` recommendation for ANY character (`subject="<slug>"`)? If yes, that character's recommended outfit slots go through a single composite-outfit `generate_image` call (one call per group of 2-3 panels in the order the planner specified), NOT through N separate outfit-board calls. See "Composite outfits" subsection below for the exact procedure. Saying "I'll group them into composites" and then generating six individual outfit boards anyway is the bug this check exists to prevent — you must literally build the composite. Without an A.5 recommendation, fall through to per-outfit board calls below.

1. Read `CHARACTERS:` from Step A output. For each entry:

2. **If `role: main`:**
   - Identity already handled (B.1 if user provided avatar, B.3 if auto).
   - **Always generate the base outfit-board** (default video-adapt behaviour locks main's wardrobe to a reusable keyframe). Source the outfit text via one of three paths depending on `preserve_source_outfit` and whether an avatar was provided:
     - **(a) User-provided avatar + `preserve_source_outfit=False` (default)** — read the garments from the avatar image (via `get_asset` and your own visual description):
       ```
       outfit_dict = None
       try:
           outfit_dict = describe_outfit_from_image(asset_id=<character asset id from B.1>)
       except (RuntimeError, ValueError):
           # Reading the avatar failed / returned bad payload.
           # Fallback: skip the main outfit element entirely (warning, no block).
           outfit_dict = None
       if outfit_dict is not None:
           # If every visible garment slot is `inferred: true`, the avatar shows
           # only face/shoulders — the described outfit is invented, not observed.
           # Skip rather than lock invented clothing onto every scene.
           visible_slots = [
               s for s in (outfit_dict.get("top"), outfit_dict.get("bottom"),
                           outfit_dict.get("footwear"), outfit_dict.get("headwear"))
               if isinstance(s, dict) and not s.get("inferred", False)
           ]
           if not visible_slots:
               outfit_dict = None  # all-inferred → skip, log warning
       if outfit_dict is not None:
           main_outfit = generate_image(
               prompt=(
                   "<flattened outfit_dict garments>, ghost-mannequin product photography, "
                   "garments worn on an invisible body, isolated on pure white, no head, no skin"
               ),
               output_asset_id="main-outfit:final",
               aspect_ratio="3:4", resolution="2K", model="nano-banana-2",
           )
       ```
     - **(b) User-provided avatar + `preserve_source_outfit=True`** (rare opt-in per D.0c) — take the outfit from the source storyboard instead of the avatar:
       ```
       main_outfit = generate_image(
           prompt=(
               "<main.outfit_summary verbatim from Step A>, ghost-mannequin product photography, "
               "garments worn on an invisible body, isolated on pure white, no head, no skin"
           ),
           output_asset_id="main-outfit:final",
           aspect_ratio="3:4", resolution="2K", model="nano-banana-2",
       )
       ```
     - **(c) Auto-avatar (no user photo, B.3 path)** — reuse the same outfit text that was injected into the B.3 avatar prompt (no read call: the avatar wasn't observed; the outfit was authored):
       ```
       main_outfit = generate_image(
           prompt=(
               "<the outfit clause from the B.3 description verbatim>, ghost-mannequin product photography, "
               "garments worn on an invisible body, isolated on pure white, no head, no skin"
           ),
           output_asset_id="main-outfit:final",
           aspect_ratio="3:4", resolution="2K", model="nano-banana-2",
       )
       ```
   - For each entry in `outfit_changes` (if any), generate a separate outfit-board so the identity stays locked across states:
     ```
     outfit_changed = generate_image(
         prompt="<entry.new_outfit verbatim>, ghost-mannequin product photography, isolated on pure white, no head, no skin",
         output_asset_id="main-<state>-outfit:final",   # e.g. main-warrior-outfit:final
         aspect_ratio="3:4", resolution="2K", model="nano-banana-2",
     )
     ```

3. **If `role: secondary` AND `len(appears_in_scenes) >= 2`:**
   - Generate combined identity+base-outfit keyframe (white background, ghost-mannequin-friendly framing):
     ```
     secondary = generate_image(
         prompt=(
             "full body shot, "
             "<persona description from Visual field of secondary's first appears_in_scenes — "
             "gender, age range, build, skin, hair, distinguishing features>, "
             "wearing <secondary.outfit_summary verbatim>, "
             "full body, frontal view, isolated on pure white background, no scene context"
         ),
         output_asset_id="<secondary-slug>:final",   # e.g. lead-warrior:final
         aspect_ratio="3:4", resolution="2K", model="nano-banana-2",
     )
     ```
     Include the neutral-isolation suffix (`isolated on pure white background, no scene context`) and the `full body shot, ` prefix so the secondary always renders head-to-toe with the full outfit visible. Used as a `character`-category reference. The prefix is **idempotent** — if the description already includes `full body`, don't duplicate it.
   - For each entry in `outfit_changes` (if any) — generate a separate outfit-board keyframe so the identity stays locked across states:
     ```
     outfit_changed = generate_image(
         prompt="<entry.new_outfit verbatim>, ghost-mannequin product photography, isolated on pure white, no head, no skin",
         output_asset_id="<secondary-slug>-<state>-outfit:final",
         aspect_ratio="3:4", resolution="2K", model="nano-banana-2",
     )
     ```

4. **If `role: secondary` AND `len(appears_in_scenes) == 1`:**
   Skip entirely. Describe the character textually in the Step C scene caption for that one scene (the scene model will pick natural visuals).

5. **If `role: ensemble`:**
   - Generate a single combined GROUP portrait showing all `count` members with their shared uniform/costume on a clean white background:
     ```
     ensemble = generate_image(
         prompt=(
             "full body shot, "
             "<count> figures in matching <ensemble.outfit_summary verbatim>, "
             "<persona description if Step A captures it — e.g. 'all in their late twenties, athletic build', "
             "otherwise just count + 'figures' + outfit>, "
             "standing in a row, full body, frontal view, isolated on pure white background, no scene context"
         ),
         output_asset_id="<ensemble-slug>:final",   # e.g. ninja-trio:final
         aspect_ratio="3:4", resolution="2K", model="nano-banana-2",
     )
     ```
     Include the neutral-isolation suffix and the `full body shot, ` prefix so all `count` members render head-to-toe with their shared uniform clearly visible. Used as a `character`-category reference. No outfit-board for ensembles — the shared uniform is baked into the group portrait. The prefix is idempotent: if the description already includes `full body`, don't duplicate it.
   - When the ensemble has a named member (a `secondary` entry with `is_member_of_ensemble: <ensemble-slug>` exists), that secondary STILL gets its own combined identity keyframe per step 3 above. The two coexist: Step C routes group-shot scenes to the ensemble slot and close-up scenes on the named member to the individual secondary slot.

6. **Crowds / one-off background groups:** there are no `CHARACTERS` entries for these (Step A schema reserves CHARACTERS for `main` / `secondary` / `ensemble` only). They appear inline in scene captions as plain text (e.g. "eight guards in silver armor"). The Step C de-tagging rule handles them.

#### Outfit-board style (ghost mannequin)

Outfit boards render outfits in **ghost mannequin** photography style: garments displayed as if worn on an invisible human body, retaining natural shoulder/sleeve/waist drape, isolated on pure white, no visible mannequin form, no head, no skin. This is the standard e-commerce technique — the scene model reads the silhouette correctly when compositing the outfit onto a character without picking up any face/identity from the reference. Always include the ghost-mannequin + pure-white-background language in the outfit-board prompt (as shown in the step 2/3 calls above).

#### Cost formula

```
n_jobs =
    1 image for main BASE outfit (default — reading fallback may skip it; see B.5 step 2)
  + sum(len(c.outfit_changes) for c in characters if c.role == "main")        # main outfit_changes
  + sum(
        1 + len(c.outfit_changes)   # 1 image (combined identity+base) + N images (per outfit_change)
        for c in characters
        if c.role == "secondary" and len(c.appears_in_scenes) >= 2
    )
  + sum(1 for c in characters if c.role == "ensemble")                        # 1 image per ensemble (no outfit_changes)
```

Everything in B.5 is a `generate_image(model="nano-banana-2")` call. The auto-avatar (B.3) is the only B-step image that uses a portrait reference and only when the user did not provide a photo. Caps: ~5 secondaries per video AND ~2 ensembles per video — if `CHARACTERS:` produces more, something is misclassified (probably an unnamed crowd marked as secondary or ensemble; it should be inline-text instead).

#### Two ways to source the outfit description (for the outfit-board prompt)

1. **Avatar-derived (default for main when a user photo is provided and `preserve_source_outfit=False`):** read garments from the avatar image (`get_asset` + your own description), then build the outfit board with that garment list.
2. **Text-driven from Step A caption (used for outfit_changes on any character, the secondary outfit_changes board, opt-in `preserve_source_outfit=True` on main, and the auto-avatar B.3 main path):** pass the source storyboard text directly into the outfit-board prompt.

#### Naming convention

| Element type        | Slug pattern (`output_asset_id` stem) | Examples |
|---------------------|---------------------------|----------|
| Secondary (combined identity+base) | `<role>`           | `lead-warrior`, `barista`, `patrol-guard` |
| Ensemble (combined group portrait) | `<group-slug>`     | `ninja-trio`, `backup-dancers`, `palace-guards` |
| Base outfit (main, default-on for video-adapt) | `<role>-outfit` | `main-outfit` |
| Outfit-change (main or secondary) | `<role>-<state>-outfit` | `main-warrior-outfit`, `lead-warrior-armored-outfit` |

≤ 32 chars; auto-truncated. Use kebab-case; never include real names. Append `:final` to form the `output_asset_id` (e.g. `main-outfit:final`).

**Element category:** secondary identity keyframes are used as `character`-category references; outfit boards as `prop`-category references. Identity stays separate from outfit-changes so a wardrobe swap never touches the face.

#### Worked example — Snickers commercial

`CHARACTERS:` from Step A:
```yaml
- main:
    label: "young man in suit"
    role: main
    outfit_summary: "grey tweed suit jacket, white collared shirt, red patterned tie"
    appears_in_scenes: [1, 2, 3, 5, 8, 12, 15, 18, 20, 21, 23, 24, 25, 26, 27]
    outfit_changes:
      - at_scene: 24
        new_outfit: "brown textured warrior tunic with dark red sash, leather wristbands, topknot hairstyle"
- lead-warrior:
    label: "the warrior leader"
    role: secondary
    outfit_summary: "burnished bronze chest plate over dark red robes, leather pauldrons, sword at hip"
    appears_in_scenes: [22, 23, 25]
    outfit_changes: []
- patrol-guard:
    label: "the patrol leader"
    role: secondary
    outfit_summary: "silver scale armor, silver helmet with red crest, longsword scabbard"
    appears_in_scenes: [20, 21]
    outfit_changes: []
```

Generated elements (B.5 output):

| Slot in IMAGE MAP | Element                                                  | Generated by                                       | Cost            |
|-------------------|----------------------------------------------------------|----------------------------------------------------|-----------------| 
| `<<image_1>>`     | main avatar (user's character photo)                     | B.1 (asset id only)                                | 0               |
| `<<image_2>>`     | location: city rooftops                                  | B.2                                                | 1 image |
| `<<image_3>>`     | location: temple courtyard                               | B.2                                                | 1 image |
| `<<image_4>>`     | recurring prop: snickers-bar                             | B.4                                                | 1 image           |
| `<<image_5>>`     | secondary `lead-warrior` (combined identity + base outfit) | **B.5 step 3 — combined identity keyframe**       | 1 image           |
| `<<image_6>>`     | secondary `patrol-guard` (combined identity + base outfit) | B.5 step 3                                       | 1 image           |
| `<<image_7>>`     | outfit for main (BASE — grey suit, default-on)           | **B.5 step 2 — main BASE outfit, default path (a) avatar-derived** | 1 image           |
| `<<image_8>>`     | outfit for main (warrior state — outfit_change)          | **B.5 step 2 — main outfit_change**                | 1 image           |

Total B.5 cost: **4 image jobs** (excluding locations/props which B.2/B.4 own). Identity for both secondaries is locked across all their scenes via the combined keyframes — wardrobes are baked in for the base case so scenes that don't change outfit do not need a separate outfit slot. Main's wardrobe is now also locked across all scenes via the BASE outfit board (`<<image_7>>`), with a switch to `<<image_8>>` from scene 24 onward when main transforms into the warrior outfit.

Step C IMAGE MAP construction will then reference these in scenes:

- Scenes 1-23 (main, normal suit): `the young man <<image_1>> dressed in <<image_7>> ...` — main's BASE outfit slot anchors the grey tweed suit across every scene before the transformation.
- Scenes 20-21 (main + patrol-guard + crowd): `the young man <<image_1>> dressed in <<image_7>> stands as the patrol leader <<image_6>> approaches; behind him eight guards in silver scale armor stand in formation` — `<<image_1>>` + `<<image_7>>` on main, `<<image_6>>` on patrol-guard (combined keyframe brings identity + bronze armor in one slot), crowd as plain text without any tag.
- Scenes 22-23 (main + lead-warrior in temple, main still in suit): `the young man <<image_1>> dressed in <<image_7>> stands beside the warrior leader <<image_5>>` — `<<image_5>>` brings lead-warrior's identity + base bronze-and-red outfit together.
- Scenes 24-27 (main transformed to warrior): `the young man <<image_1>> dressed in <<image_8>> raises his sword beside the warrior leader <<image_5>>` — main switches to the warrior outfit slot (`<<image_8>>`), lead-warrior continues with combined `<<image_5>>` (no outfit_change for him).

If the source storyboard ALSO had a `CHARACTERS:` entry like `ninja-trio: role: ensemble, count: 3, outfit_summary: "matching dark tunics ..."`, B.5 would additionally generate `<<image_9>> = Ensemble: ninja-trio (3 figures)` (1 extra image job, total **5 images**). Group-shot scenes would then read `three ninjas <<image_9>> leap across the rooftop`, while a close-up on lead-warrior continues to use his individual `<<image_5>>` slot.

This produces the Snickers transformation joke: scene 24 explicitly shows the warrior outfit on main (via `<<image_8>>`) instead of generic "now in different outfit" text, while every pre-transformation scene composites the same locked grey tweed suit (via `<<image_7>>`). Secondaries keep identity + base outfit locked across all their scenes through their combined keyframes; ensembles (when present) lock the group's shared uniform.

#### Composite outfits — when one character has ≥3 outfit_changes (INVARIANT 11)

If `len(CHARACTERS.<role>.outfit_changes) ≥ 3` for a character (i.e. base outfit + 2+ outfit changes that all live inside the same scene budget window), generate a SINGLE composite outfit keyframe instead of N individual outfit boards:

```
composite = generate_image(
    prompt=(
        "Three-panel numbered ghost-mannequin outfit sheet on pure white, garments on invisible bodies, no heads, no skin. "
        "Panel 1 = <base outfit description>. "
        "Panel 2 = <outfit_change[0].new_outfit>. "
        "Panel 3 = <outfit_change[1].new_outfit>."
    ),
    output_asset_id="main-outfit-cmp-<sha8>:final",   # subject baked into the slug
    aspect_ratio="3:4", resolution="2K", model="nano-banana-2",
)
# composite asset id → one IMAGE MAP slot
```

**Hard cap: 2 ≤ panels ≤ 3 per grid.** Per-panel fidelity drops fast past 3. For more than 3 outfits, split into multiple composites:
- 4 outfits → composite of 3 + 1 standalone outfit board OR 2 composites of 2+2
- 6 outfits → 2 composites of 3+3
- 8 outfits → 3 composites of 3+3+2

The composite participates in IMAGE MAP as **one slot** (e.g. `<<image_7>>`); its IMAGE MAP entry spells out each panel so the adapt step in C.2 writes `panel I of <<image_7>>` inside scene text on its own:

```
<<image_7>> = Outfit composite for main (3 panels):
              panel 1 = tweed grey suit, white shirt, red tie
              panel 2 = bronze plate armor with red surcoat
              panel 3 = black tactical jumpsuit, harness
```

The adapt step then naturally produces scene text like `the man <<image_1>> dressed in panel 1 of <<image_7>>` for early scenes, switching to `panel 2 of <<image_7>>` from the warrior transformation onward, etc. Substitution at render time runs unchanged — there is no special composite parameter.

When `len(outfit_changes) < 3`, stick with individual outfit-board calls (no composite saving). When the character is a `secondary` whose identity keyframe already bakes in the base outfit (B.5 step 3), the composite trigger applies only to ADDITIONAL outfit_changes (e.g. 4 outfit_changes on a secondary → one composite of 3 panels + 1 standalone IF the leftover is alone, else two composites).

---

## Step C — Adapt concept (Cases 1 & 2 only)

Three cases. Cases 1 & 2 produce an adapted concept via the `adapt_*` analysis. Case 3 builds chunks manually (see Step C.alt below).

### C.1 — Build IMAGE MAP and ELEMENT_BINDINGS

Slot ordering depends on case:

| Case | `<<image_1>>` | `<<image_2>>` | next slots | then | then | LAST slot (mode `classic` / `sketch` only) |
|------|---------------|---------------|------------|------|------|--------------------------------------------|
| 1 | Product | Avatar (if any) | Locations | Recurring props | Outfit-elements (if any) | Storyboard sheet (Step C.5) |
| 2 | Avatar | Location A | Locations B..N | Recurring props | Outfit-elements (if any) | Storyboard sheet (Step C.5) |
| 3 | Location A | Location B | Locations C..N | Recurring props | Outfit-elements (if any) | Storyboard sheet (Step C.5) |

Outfit-slots come after recurring props; in modes `classic` / `sketch` the **storyboard slot is always the LAST entry** in IMAGE MAP and ELEMENT_BINDINGS — this keeps existing slot indices stable for downstream consumers and tests, and lets the Step C.5 generator append cleanly without reshuffling earlier slots. **In mode `off` the LAST slot is whichever non-storyboard slot was last** — do NOT add a storyboard placeholder; do NOT reserve `<<image_N>>` for it.

Each outfit-slot in the IMAGE MAP MUST declare which character role it binds to: `<<image_N>> = Outfit for <role>: <description>` (e.g. `<<image_7>> = Outfit for main: tweed grey suit, white collared shirt, red patterned tie`).

**Composite outfit/props/environment slots** (per INVARIANT 11 — produced when the Step A.5 budget oracle recommends compaction; generated at B.2 / B.4 / B.5) take ONE slot in IMAGE MAP and the slot's entry spells out each panel by number, so the adapt step in C.2 writes `panel I of <<image_N>>` inside scene text on its own. The same `panel I of <<image_M>>` syntax applies UNIFORMLY across all three composite kinds — outfit, prop, environment — so the adapt step does not have to distinguish them at write time:

```
<<image_7>> = Outfit composite for main (3 panels):
              panel 1 = tweed grey suit, white shirt, red tie
              panel 2 = bronze plate armor with red surcoat
              panel 3 = black tactical jumpsuit, harness

<<image_8>> = Props shelf composite (3 panels):
              panel 1 = wide-brimmed black felt hat
              panel 2 = light beige straw hat
              panel 3 = large beige textured tote bag

<<image_9>> = Environment composite (2 panels, 21:9 side-by-side):
              panel 1 = wooden walkway over a marsh at golden hour
              panel 2 = stone medieval corridor with torchlight
```

Substitution at render time treats these like any other slot — `<<image_7>>` resolves to ONE composite asset id; the `panel I` text the adapt step wrote stays as-is for the scene model to read. There is no special composite parameter at D.1. **Panel order is part of the cache key** — `[A, B]` and `[B, A]` produce different keyframes; pass the same order on retries to hit the cache.

The storyboard slot uses a clearly internal label so neither the adapt step (in C.2) nor downstream tooling mistakes it for an entity reference: `<<image_N>> = Video-adapt storyboard sheet (Step C.5, chunked-hierarchical, 2:3 vertical, internal use only)`.

Build BOTH blocks **internally** (do not print them to the user — see "User-facing output rule" above). Their only consumers are downstream steps:

- IMAGE MAP → injected verbatim into the C.2 adapt prompt.
- ELEMENT_BINDINGS → resolves each `<<image_N>>` to its bound asset id, which becomes the `reference_images` list for each scene's `generate_scene_video` call in D.1.
- BINDINGS_META (new) → consumed by the C.5 storyboard generator AND by the D.1 per-scene budget audit. Same list, two consumers — build it once in C.1, reuse downstream.

Shape (track in your private reasoning, not in user-visible text):

```
## IMAGE MAP (sent to the adapt step — no asset ids):
<<image_1>> = Avatar (character/person)
<<image_2>> = Location: vast cracked desert at twilight
<<image_3>> = Recurring prop [object]: silver electric guitar
<<image_4>> = Recurring prop [creature]: grey wolf
<<image_5>> = Recurring prop [object]: amp stack

## ELEMENT_BINDINGS (internal — drives Step D reference-image substitution):
<<image_1>> -> <character_asset_id>
<<image_2>> -> <location_asset_id>
<<image_3>> -> <guitar_asset_id>
<<image_4>> -> <wolf_asset_id>
<<image_5>> -> <amp_asset_id>

## BINDINGS_META (internal — drives storyboard legend + Step D budget audit):
[
  {"slot": "<<image_1>>", "label": "main-avatar",     "kind": "character",   "subject": "main"},
  {"slot": "<<image_2>>", "label": "desert-twilight", "kind": "environment"},
  {"slot": "<<image_3>>", "label": "silver-guitar",   "kind": "prop"},
  {"slot": "<<image_4>>", "label": "grey-wolf",       "kind": "character"},
  {"slot": "<<image_5>>", "label": "amp-stack",       "kind": "prop"},
]
```

Mismatch (slot in IMAGE MAP without a binding) = stop and reconcile before C.3.

#### BINDINGS_META schema (C.1b)

Each entry is a dict with these fields:

| Field | Required | Type / Values | Purpose |
|---|---|---|---|
| `slot` | yes | `"<<image_N>>"` placeholder string | Joins to ELEMENT_BINDINGS by exact match |
| `label` | yes | kebab-case slug (≤ 32 chars), same as the `output_asset_id` stem you used | Human-readable identifier; storyboard legend uses it as the entity caption; budget logs use it for breakdown |
| `kind` | yes | one of: `character` \| `environment` \| `prop` \| `outfit` \| `storyboard` \| `composite_outfit` \| `composite_props` \| `composite_environment` | Drives storyboard legend grouping AND Step D reference-image-budget classification (INVARIANT 11). YOU set this — you already know which keyframe you generated for the slot. |
| `subject` | required for `kind="outfit"` and `kind="character"`; optional otherwise | character slug (e.g. `"main"`, `"lead-warrior"`, `"ninja-trio"`) | Groups outfit slots that belong to the same character so future composite-planning can bundle them into one sheet. For non-character/outfit kinds, leave unset. |
| `shape` | optional | free-form silhouette description | Used by Step C.5 storyboard to override the auto-derived per-character silhouette. See `video-adapt-storyboard.md` Layer 4. |
| `is_storyboard` | optional | boolean (true only for the storyboard slot itself) | Tells the storyboard helper not to legend itself. Equivalent to `kind="storyboard"`. |

**`kind` values cheat sheet** — pick the one that matches the keyframe you generated:

| Keyframe you generated for the slot | `kind` value to set |
|---|---|
| B.1 user avatar (asset id carried as identity reference) | `"character"` (set `subject="main"`) |
| B.3 auto-avatar (`generate_image` portrait) | `"character"` (set `subject="main"`) |
| B.2 location keyframe | `"environment"` |
| B.4 prop keyframe — inanimate object | `"prop"` |
| B.4 prop keyframe — animal | `"character"` (set `subject="<creature-slug>"`) |
| B.5 human secondary / ensemble keyframe | `"character"` (set `subject="<secondary-slug>"`) |
| B.5 ghost-mannequin outfit board | `"outfit"` (set `subject="<character-slug>"`) |
| B.5 multi-panel outfit sheet (planner rec) | `"composite_outfit"` (set `subject="<character-slug>"`) |
| B.4 props inventory shelf (planner rec) | `"composite_props"` (no subject) |
| B.2 2-panel env pair (planner rec) | `"composite_environment"` (no subject) |
| C.5 storyboard sheet (always last slot) | `"storyboard"` (no subject) |

**Why this is mandatory.** The `kind`/`subject` annotations are the source of truth for the Step D reference-image-budget audit (INVARIANT 11) and for the storyboard legend (Step C.5). Classification is NOT done retroactively — YOU know the type at generation time, so you write it down once. There is a defensive naming-heuristic fallback (`*-outfit` → `outfit`, `vadapt-sb-*` → `storyboard`, `*-outfit-cmp-*` → `composite_outfit`, `props-shelf-*` → `composite_props`, `env-pair-*` → `composite_environment`), but relying on it is an anti-pattern: mis-classified bindings get logged as `unknown` and lose their kind-breakdown in audit warnings.

### C.2 — Adapt the concept

```
adapt_response = video_analyze(
    video_source="<avatar_or_product_asset_id_or_cdn_url>",   # read via get_asset
    category="adapt_avatar",                                   # or "adapt_product" for Case 1
    prompt=(
        "<IMAGE MAP block from C.1>\n\n"
        "## ORIGINAL CONCEPT:\n"
        "<storyboard from Step A>\n\n"
        + (
            # Case 1 only:
            '## PRODUCT INFO (JSON):\n{"title": "...", "description": "..."}\n\n'
            if case == "product" else ""
        )
        + (
            "Replace the character(s) with the avatar from the IMAGE MAP. "
            "Keep ALL other elements (script, audio, product, timing) IDENTICAL. "
            if case == "avatar" else ""
        )
        + "Generate the full adapted concept and the chunked scene-ready version, "
          "separated by the ===CHUNKS_15S=== delimiter as instructed."
    ),
)
```

`video_analyze` here is the adapt step: read the source (via `get_asset` for the attached avatar/product asset) and produce the adapted concept yourself, in the `adapt_avatar` / `adapt_product` schema, weaving in the IMAGE MAP and (for Case 1) the PRODUCT INFO. The `video_source` MUST be a readable asset id / CDN URL, not a local path.

### C.3 — Parse chunks

```
chunks = parse_chunks(adapt_output=adapt_response["analysis"])
```

`parse_chunks` here means: split the adapt output on the `===CHUNKS_15S===` delimiter and return a **list** of `{chunk_index, time_range, duration, prompt_text}`. The text inside `prompt_text` is byte-identical to what the adapt step wrote — do NOT modify it. Loud-fail on a missing `===CHUNKS_15S===` delimiter; on that error, escalate (do not retry blindly — the adapt step occasionally returns malformed output, but two malformed runs in a row indicate a real problem).

### C.alt — Case 3 (location-only, no adapt step)

For Case 3 there is no `adapt_*` analysis. Build chunks manually from the Step A storyboard:

1. Inject location refs as a `## LOCATION ELEMENTS:` header before the storyboard.
2. Split at `Scene N —`.
3. Group consecutive scenes into ≤15s segments by time-packing.
4. Treat each segment as one chunk with `prompt_text` = concatenated scene blocks (verbatim).
5. Build `chunks: list[dict]` with the same shape `parse_chunks` returns.

### C.5 — Storyboard sheet (mode-gated — INVARIANT 10)

**Skip this entire step when the Step 0a storyboard mode answer is `off`.** When mode is `off`: do NOT build a storyboard sheet; do NOT add a storyboard slot to IMAGE MAP / ELEMENT_BINDINGS / `bindings_meta`; jump directly to D.1 with no storyboard reference image.

When the Step 0a answer is `classic` or `sketch`, after C.3 (or C.alt) produces `chunks` AND Step 0a has resolved the user's chosen scene-video aspect ratio + storyboard mode, generate the video-adapt storyboard sheet that anchors composition for every scene in Step D. Build the 9-layer prompt (see `video-adapt-storyboard.md`) and render the sheet with `generate_image(model="gpt-image-2.5-sunburst")` (typography / flat-graphic output — the storyboard is a labeled schematic, which is why it uses `gpt-image-2.5-sunburst`):

```
storyboard = generate_image(
    prompt="<9-layer storyboard prompt built from chunks + bindings_meta, style=classic|sketch, panel_aspect=<aspect>>",
    output_asset_id="vadapt-sb-<sha8>:final",
    aspect_ratio="2:3",
    resolution="2K",
    model="gpt-image-2.5-sunburst",
)

storyboard_slot = "<<image_9>>"   # next free slot AFTER all other elements
```

The sheet is locked to `model="gpt-image-2.5-sunburst"` / 2:3 vertical / `resolution="2K"` / quality=high. Two public knobs drive the prompt: `panel_aspect` and `style`.

**`panel_aspect` orientation:**

| `panel_aspect` | Cell-grid trend (on the 2:3 sheet) | Inner sub-layout |
|---|---|---|
| `"16:9"` (default — YouTube / desktop) | More rows → horizontal cells stacked | LARGE PREVIEW left ~60%, SMALL SQUARES strip right ~40% |
| `"9:16"` (Reels / Shorts / TikTok) | More columns → vertical cells side-by-side | LARGE PREVIEW top ~70%, SMALL SQUARES strip bottom ~30% |
| `"1:1"` (square) | Roughly square cells | LARGE PREVIEW top half, SMALL SQUARES strip bottom half |

**`style` visual register (HARDCODED-per-mode):**

| Layer | `style="classic"` (default) | `style="sketch"` |
|---|---|---|
| Background | Warm beige paper | Pure white `#FFFFFF` |
| Stroke palette | Black ink line-art + flat colored silhouettes | Semi-transparent pencil/ink strokes `#A0A0A0–#C0C0C0` (~50% opacity); NO colored fills |
| Cell-grid borders | Thin black hairline | Thin black hairline (kept BLACK for legibility) |
| LEGEND ROW (top banner) | Present (~10% sheet height): one ID-card per recurring entity | Omitted entirely — top of sheet is blank |
| Entity badges + ID glyphs (`①②③`) | One badge per cell, smart-placed | Omitted entirely (entities identified by silhouette alone) |
| CHUNK badge | Black sans-serif on white rectangle | Thinnest grey `#D0D0D0–#E8E8E8`, no background rectangle |
| END card in orphan cells | Centered "END" on beige | Omitted (orphan cells stay completely blank) |

The prompt is built from 9 layers internally. Both styles are **blocking diagrams**, NOT recreations of the source video's visual register.

**Element naming.** Use names of shape `vadapt-sb-<sha8>` (the `output_asset_id` stem).

After generation, append the storyboard slot to IMAGE MAP and ELEMENT_BINDINGS as the LAST entry.

Failure handling: if the storyboard `generate_image` call fails, ABORT the pipeline per INVARIANT 10.

For the architectural rationale behind the 9-layer prompt structure, see `video-adapt-storyboard.md`.

---

## Step D — Render scenes

### D.0 — Render mode selection

`full_mode=True` ONLY when the user's brief contains one of these English keywords (case-insensitive substring match):

- `full`, `fully`, `entire`, `recreate all`, `full length`, `all chunks`, `the whole video`, `complete recreation`

Russian / transliterated / paraphrased equivalents do NOT trigger full mode — even if intent is obvious. The user must use one of the exact English phrases. This is intentional: default-conservative cost behavior, opt-in for the expensive full render.

Decide render mode silently — do not print a `[RENDER MODE: ...]` marker to the user. In default mode, render ONLY the first chunk (chunk 0). In full mode, render every chunk.

### D.0c — Preserve source outfit (opt-in detector)

`preserve_source_outfit=True` ONLY when the user's brief contains an explicit clothing-preservation cue (case-insensitive substring match):

- English: `outfit of original`, `keep original clothing`, `wear the source outfit`, `preserve original outfit`, `same outfit as source`, `original character clothing`
- Russian: `как в оригинале по одежде`, `сохрани одежду`, `оставь костюм оригинала`, `такой же аутфит`, `в оригинальной одежде`

This flag controls only the SOURCE of main's BASE outfit — the outfit element itself is generated EITHER WAY (default video-adapt behaviour locks main's wardrobe via the B.5 step 2 outfit board):

- **Default (`preserve_source_outfit=False`)** — read the outfit from the user's avatar image.
- **Opt-in (`preserve_source_outfit=True`)** — take the outfit text from `CHARACTERS.main.outfit_summary` in the Step A storyboard.

If no avatar was provided (auto-avatar B.3 path), the flag is ignored. If reading the avatar fails or returns all-`inferred` slots, the main outfit element is skipped entirely.

Decide silently — do not print a `[preserve_source_outfit: true|false]` marker to the user.

### D.1 — Render each chunk

For each in-scope chunk (chunk 0 only in default mode; all chunks in full mode), render the scene with `generate_scene_video`. Resolve every `<<image_N>>` marker in the chunk to its bound asset id (from ELEMENT_BINDINGS) and pass those ids as `reference_images`. The chunk's `prompt_text` goes verbatim into `motion` (INVARIANT 4 — never pre-substitute UUIDs into the text):

**Modes `classic` / `sketch` — include the storyboard sheet asset id in `reference_images`:**

```
scene = generate_scene_video(
    output_asset_id=f"scene{chunk_index}:video",
    start_image=<bound asset id of the chunk's primary location/keyframe>,
    motion=<chunk["prompt_text"] verbatim, with a deterministic storyboard-composition prefix prepended>,
    duration=<chunk["duration"] clamped to [3, 15]>,
    aspect_ratio=<aspect_ratio from Step 0a>,
    reference_images=[<each <<image_N>> asset id used in this chunk>, <storyboard sheet asset id>],
    backend="seedance",
    generate_audio=True,
    scene_number=<chunk_index>,   # 0-based
)
```

**Mode `off` — OMIT the storyboard sheet asset id:**

```
scene = generate_scene_video(
    output_asset_id=f"scene{chunk_index}:video",
    start_image=<bound asset id of the chunk's primary location/keyframe>,
    motion=<chunk["prompt_text"] verbatim>,
    duration=<chunk["duration"] clamped to [3, 15]>,
    aspect_ratio=<aspect_ratio from Step 0a>,
    reference_images=[<each <<image_N>> asset id used in this chunk>],   # no storyboard slot
    backend="seedance",
    generate_audio=True,
    scene_number=<chunk_index>,
)
```

Render the in-scope chunks as a parallel batch — one `generate_scene_video` call per chunk, each keyed to its own `output_asset_id` (`scene0:video`, `scene1:video`, …). Do NOT re-render a chunk that already succeeded.

When a storyboard sheet is present (modes `classic` / `sketch`), PREPEND a deterministic storyboard-composition prefix to each chunk's `motion` BEFORE rendering. The chunk dict is NOT mutated — INVARIANT 4 holds (the prefix is added at the call site, the stored `prompt_text` stays byte-identical).

Each `generate_scene_video` call returns when its scene is rendered (or fails) — there is no separate job-status poll to manage. Collect the completed scene asset ids / URLs as the calls return.

### D.1.5 — Known operational pitfalls

**Transient backend errors (502 / rate limit)**
Treat as **still rendering** — let the same scene call retry rather than spawning a duplicate scene for the same chunk.

**Default mode renders exactly 1 chunk (chunk 0 only)**
Default mode fans out to **only the first chunk**. After the scene completes (and assembly in Step E), inform the user and offer to re-run in full mode.

**Minimum chunk duration is 3 seconds — merge short tail chunks**
The scene model rejects durations below the minimum. Merge any chunk shorter than the floor into its preceding neighbor before rendering. `generate_scene_video` accepts `duration` in `[3, 15]`.

**`parse_chunks` requires actual newlines — not escaped `\n` sequences**
Use multi-line strings with actual line breaks, never `\n` escape sequences inside a single-line string.

**Render duration auto-clamps to [3, 15] — do NOT redistribute scenes to "fix" a long chunk**
Clamp `duration` to the supported range `[3, 15]` before the call. Just pass the chunk through.

### D.2 — Failure handling

Track each scene's outcome as it returns:

```
complete -> [{"chunk_index": int, "asset_id": str, "url": str}]   # done, ready for assembly
pending  -> [int]                                                 # still rendering / retrying
failed   -> [{"chunk_index": int, "status": str, "reason": str}]
```

For each entry in `failed`:

| `status` | Meaning | Action |
|---|---|---|
| `nsfw` | Content-policy block | Surface to user. **Do NOT rewrite and resubmit** (INVARIANT 4). |
| `failed` | Generic backend failure | Single retry OK. Two failures → escalate. |
| `canceled` | Job cancelled (rare) | Investigate; usually transient. |
| `no_url` | `completed` but no result URL | Treat as failure; escalate. |
| `timeout` | Stuck rendering past deadline | Let the same scene call retry. |

**Storyboard generation failures (Step C.5, modes `classic` / `sketch` only):** Per INVARIANT 10, a storyboard failure ABORTS the pipeline before Step D.

| `status` | Meaning | Action |
|---|---|---|
| `nsfw` | `gpt-image-2.5-sunburst` content-policy block | Escalate — do NOT auto-retry. |
| `failed` | Generic backend failure | Single retry OK. Two failures → escalate. |
| `timeout` | Render deadline exceeded | Single retry OK; sustained → escalate. |
| `download_failed` | Internal CDN swap / download error | Same as `failed`. |

After all in-scope scenes have rendered, proceed to Step E.

---

## Step E — Assemble

Stitch the completed scene videos into the final cut, in chunk order:

```
final = assemble_video(
    output_asset_id="<name>:final",
    scenes=[<scene0:video asset id>, <scene1:video asset id>, ...],   # chunk order
    aspect_ratio=<aspect_ratio from Step 0a>,
)
```

Pass the scenes in chunk order. If a chunk failed and the user chose to skip it (per D.2 / INVARIANT 5), omit that chunk's scene from the list. Deliver the assembled video URL as the final user-visible message (with a one-line note if default mode rendered only chunk 0 — see D.1.5).

---

## Tool reference

| Step | Tool | Notes |
|---|---|---|
| A | read source + analyze (`web_fetch` / `get_asset`) | Produce the `analysis_templates` storyboard from the source frames |
| B.1 (user avatar) | `get_asset` / `list_assets` | Carry the attached photo's asset id as the identity reference (no upload step) |
| B.2 (location) | `generate_image(model="nano-banana-2")` | Wide environment plate, keyed to a stable `output_asset_id` |
| B.3 (auto-avatar) | `generate_image(model="nano-banana-2")` | 3:4 portrait. Prepend `portrait shot, ` (idempotent). |
| B.4 (props) | `generate_image(model="nano-banana-2")` | Neutral-isolation prop plate. Animals: prepend `full body shot, ` (idempotent). |
| B.5 (secondary/ensemble) | `generate_image(model="nano-banana-2")` | Combined identity (+ baked outfit) keyframe. Prepend `full body shot, ` (idempotent). |
| C.2 | adapt the concept (`get_asset` + your own write) | `adapt_avatar` / `adapt_product` schema; IMAGE MAP + ORIGINAL CONCEPT (+ PRODUCT INFO for Case 1) |
| C.3 | parse chunks | Split on `===CHUNKS_15S===`; returns a list of `{chunk_index, time_range, duration, prompt_text}` |
| C.5 (storyboard) | `generate_image(model="gpt-image-2.5-sunburst", panel_aspect=..., style=...)` | Sheet locked to 2:3 / `resolution="2K"` / high. `vadapt-sb-<sha8>` naming. Both styles HARDCODED-per-mode. |
| A.5 (planner) | budget plan (`plan_chunk_budget`) | Readonly structural projection — no API calls; idempotent. |
| B.2 / B.4 / B.5 (composite, planner-driven) | `generate_image(model="nano-banana-2")` multi-panel sheet | Panel order is part of the cache key. |
| D.1 (render) | `generate_scene_video(backend="seedance", reference_images=..., scene_number=...)` | One call per chunk; resolves `<<image_N>>` → bound asset ids. |
| E (assemble) | `assemble_video` | Stitch scene videos in chunk order. |

## Adapt-step categories

The `analysis_templates`, `adapt_avatar`, `adapt_product` schemas describe what each analysis step must output.

| Step | Category | Dynamic input via `prompt` |
|---|---|---|
| A | `analysis_templates` | none (the schema is self-contained) |
| C, Case 1 | `adapt_product` | IMAGE MAP + ORIGINAL CONCEPT + PRODUCT INFO JSON |
| C, Case 2 | `adapt_avatar` | IMAGE MAP + ORIGINAL CONCEPT |