# video-recreate-skill

Reverse-engineer a user-supplied reference video into a full, paid-plan-ready ad recreation. The skill encodes a fixed 5-step pipeline, **every step gated by an input check** and **every artifact mirrored to tmpfiles.org** so the user always gets a stable URL back even when they jump in mid-pipeline.

The user may invoke any single step on its own — do not run downstream steps unless the user asks for them.

---

## When to use this skill

Trigger on any of:

- The user supplies a reference video (asset id like `input:video-1` / `ref:N`, or a public short-form video URL) AND asks to recreate / remake / clone / "make one like this".
- The user asks for the **plan only** ("analyze this and write the script", "give me the text plan I can run on paid", "no generation, just the brief").
- The user asks to execute **one stage in isolation** — e.g. "generate the images from this plan", "now produce the scene videos", "assemble the final from these scenes".

Do **not** trigger this skill for:
- Generic "make me an ad" with no reference video (use the standard ads pipeline / ads-fast-skill).
- Edits to an already-assembled final (use the editor skill).

---

## Inputs

| Input | Required | How it arrives |
|---|---|---|
| Reference video | **Yes** | Asset id (`input:video-1`, `ref:2`) **or** a public short-form video URL. For URLs, `web_fetch` it; if the platform blocks direct download, ask the user to upload the file. |
| Product info | Optional | Brand name, product title, description, PDP URL, and/or product image asset ids. If the user wants a subject swap and hasn't supplied any, ask **once** via `AskUserQuestion` before writing the plan. |
| Style overrides | Optional | Any explicit user request that overrides the reference (e.g. "make it UGC instead of cinematic", "drop the captions"). Record these in the plan's Conformance Check section. |

---

## Pipeline overview

```
STEP 1  analyze + write text ad plan  -> tmpfiles .md URL          (text-only, no production tools fire)
STEP 2  generate character/setting/prop images -> tmpfiles .zip URL
STEP 3  generate scene videos (parallel pro_director) -> tmpfiles .zip URL
STEP 4  assemble final w/ music + captions + overlays -> tmpfiles .mp4 URL
```

Every step ends by uploading the deliverable to tmpfiles.org and replying with the URL. The plan stage is **text only** — no `generate_image` / `setup_persona` / `pro_director` / `assemble_video` / `music_generate` calls in step 1.

---

## STEP 1 — Analyze reference and emit text ad plan

### Input gate
- Reference video present? If only a URL was given, `web_fetch` it; if fetch fails, ask user to upload.
- Product info: if the user wants a subject swap and hasn't supplied product info, `AskUserQuestion` once to collect brand / title / description / PDP URL.
- Free-trial duration check: if the reference video is longer than 20s and the session is free-trial, `AskUserQuestion` once — trim to ≤20s vs upgrade. Plan text itself is not capped.

### Actions
1. `web_fetch` any URLs (video source, PDP).
2. `analyze_ad_video(asset_id=<ref-video>)` — capture the structured breakdown.
3. Compose a markdown ad plan with these sections **in this order**:

   1. **Reference summary** — source, duration, aspect ratio, platform feel, shot count, average shot length, audio style, caption style, CTA mechanic, visual-spectacle signature.
   2. **Subject swap** — original subject, new subject, what changes vs what stays identical.
   3. **Brand + product info handoff** — verbatim block:
      ```
      brand: ...
      product_1_title: ...
      product_1_description: ...
      ```
   4. **Style direction** — one short string reused **verbatim** across `setup_persona` and every `pro_director` scene.
   5. **Personas** — full appearance-anchor paragraph per character with beauty-floor anchors + modesty triplet + voice notes; OR voice-only narrator spec for VO-only ads. Use the `ads-persona-prompt-skill` conventions.
   6. **Scene-by-scene breakdown** — per scene: duration, `speech_status`, cut count, visual description, motion prompt, dialogue verbatim with delivery cue, word count + words/sec check, **PRODUCT REFERENCE / BACKGROUND PROP** classification, text overlays (recorded here, applied in step 4 only), start-frame image prompt.
   7. **Music brief** — genre, mood, BPM, instrumentation, vocal/instrumental, duration.
   8. **Assembly notes** — caption preset, `hook_overlay`, per-scene `text_overlays`, CTA `mute_captions`, output size, playback rate.
   9. **Conformance check** — reference shot count / pacing vs plan, deltas mapped to user overrides.

4. Save to `/tmp/outputs/ad-plan-<slug>.md` (slug = brand or video id, kebab-case).
5. Upload to tmpfiles (see "tmpfiles upload helper" below) with `expire=172800`.
6. Reply with the tmpfiles URL **and** stop. **Do not** fire any production tools in this step.

### Model defaults to record in the plan
- Script + direction: **Claude**
- Keyframes / start frames: **Nano Banana 2 / GPT Image 2.5 画质版 (gpt-image-2.5-sunburst)** (default `gpt-image-2.5-sunburst` for standalone generation in step 2; `nano-banana-2` for tight product / persona I2I)
- Scene video: **Seedance 2.0 Pro / Kling O3 / Kling 3.0**

These model names are a deliverable — the user explicitly asked for them in the plan.

---

## STEP 2 — Generate images (characters, settings, props, locations)

### Input gate
- Ad plan required. If the user is jumping into this step, ask them to paste the plan or the tmpfiles URL.
- `list_assets` to confirm any user-uploaded reference images (face refs, product refs).

### Actions
1. **Personas** — use `setup_persona` (never `generate_image` for personas). Compose the persona prompt via `ads-persona-prompt-skill` conventions. Pass user face references in `reference_asset_ids`. Use the plan's **style_direction** string **verbatim**. Capture `voice_asset_id` and `kling_voice_id` from the returned asset for use in step 3.
2. **Settings / props / locations / backgrounds** — `generate_image` with `model="gpt-image-2.5-sunburst"` as default. Switch to `nano-banana-2` only for tight product silhouette I2I.
3. **QA every generated image** with the `ad-image-qa-skill` against product / persona / brand references. On FAIL, regenerate. Max 3 attempts per asset. On 3rd-attempt FAIL, surface the failure to the user with the QA diff and ask how to proceed.
4. **Pack the deliverable**:
   - Download each registered asset into `/tmp/outputs/images/<asset_id>.png`.
   - `zip -j /tmp/outputs/images-pack-<slug>.zip /tmp/outputs/images/*`
5. Upload zip to tmpfiles with `expire=172800`.
6. Reply with: tmpfiles URL + an index table mapping `asset_id` -> filename + brief role (persona / product / prop / location).

---

## STEP 3 — Generate scene videos

### Input gate
- Ad plan + step-2 image pack (personas, products, props) required. If the user is jumping in, ask them to re-upload the pack or run step 2.
- Confirm `voice_asset_id` + `kling_voice_id` are available for every speech scene.

### Actions
1. **Parallel `pro_director` calls** — one per scene, all dispatched in the **same turn**. Per scene the handoff payload includes:
   - `label` (unique, e.g. `scene_1`), `scene_number`, `output_type: video`, `aspect_ratio`, `duration`
   - `style_direction` — **identical** to the string passed to `setup_persona`
   - `speech_status`
   - Every persona asset id present in the scene
   - `voice_asset_id` + `kling_voice_id` for speech scenes
   - **PRODUCT REFERENCE:** vs **BACKGROUND PROP:** classification for every product appearance
   - `dialogue` verbatim with a 2–6 word delivery cue
   - `motion_prompt` with timestamped beats
   - Full multi-cut visual description decomposed with `[Hard cut]` and framing tags
   - The `brand:` / `product_1_title:` / `product_1_description:` block, verbatim
   - **Visual Description Lock** block — inspect referenced assets via `get_asset` first, lock the appearance.
2. **Do not bake text overlays into the scene description.** Overlays belong to `assemble_video` in step 4.
3. **Pack the deliverable**:
   - For each scene, copy `<label>:video` + `<label>:audio` into `/tmp/outputs/scenes/<label>/`.
   - `zip -r /tmp/outputs/scenes-pack-<slug>.zip /tmp/outputs/scenes/`
4. Upload zip to tmpfiles with `expire=172800`.
5. Reply with: tmpfiles URL + scene-to-label index.

---

## STEP 4 — Assemble final video

### Input gate
- Scene videos + audio from step 3 (or user-supplied scene pack).
- Plan's `text_overlays`, `hook_overlay`, `caption_style`, music brief, output size.

### Actions
1. `music_generate` with the plan's music prompt; `duration = sum(scene_durations)`. Register the result as `music:bg`.
2. `assemble_video` with:
   - `scenes[]` — each scene uses `<label>:video` + `<label>:audio` (the audio that came back from the director, **never** an upstream / original-reference audio).
   - Per-scene `text_overlays` from the plan.
   - `mute_captions: true` on the closing CTA scene.
   - `hook_overlay` on scene 1 only.
   - `caption_style` — preset + font from the plan.
   - `music_url: music:bg`, `music_volume: 0.15`.
   - `output_size` from the plan.
   - `output_asset_id: final:video`.
3. Download `final:video` to `/tmp/outputs/final-<slug>.mp4`.
4. Upload to tmpfiles with `expire=172800`.
5. Reply with the tmpfiles URL **and** the registered asset id as `[Watch the final](final:video)`.

---

## tmpfiles upload helper (used at every "pack and send" point)

Endpoint: `POST https://tmpfiles.org/api/v1/upload`

Form fields:
- `file` (required, max 100 MB)
- `expire` (optional, 60–172800 sec; default 3600 in the API; **we always send 172800** = 48h)

Response JSON shape:
```
{ "status": "success", "data": { "url": "https://tmpfiles.org/{id}/{name}" } }
```

Invocation via Bash:
```bash
curl -s -F "file=@/tmp/outputs/<artifact>" -F "expire=172800" https://tmpfiles.org/api/v1/upload
```

Parse `data.url` from the JSON response and surface it verbatim in chat.

**Fallback**: if the upload fails (non-200, network error, malformed JSON), fall back to `register_asset(file_path=...)` and link the registered asset id. **Never** reply with a raw `/tmp/outputs/...` local path — the user cannot retrieve it.

---

## Per-step input gates — summary

| Step | Required inputs | If missing |
|---|---|---|
| 1 | reference video | `web_fetch` URLs; if no fetchable source, ask user to upload |
| 1 | product info (if subject-swapping) | `AskUserQuestion` once for brand / title / description / PDP |
| 2 | ad plan (markdown or tmpfiles URL) | ask user to paste plan or URL |
| 2 | user reference images (faces / products) | `list_assets`; if absent and required, ask |
| 3 | ad plan + step-2 image pack | ask user to re-upload or re-run step 2 |
| 3 | `voice_asset_id` + `kling_voice_id` per speech scene | re-run setup_persona |
| 4 | step-3 scene pack (video + audio per scene) | ask user to re-upload or re-run step 3 |

Always state which inputs are present, which are missing, and what you're about to do **before** firing any production tool.

---

## Hard rules / do-not-regress

1. **Step 1 is text-only.** Do not call `generate_image`, `setup_persona`, `pro_director`, `music_generate`, or `assemble_video` while delivering the plan.
2. **Personas come from `setup_persona`, never `generate_image`.** Reuse the plan's `style_direction` string verbatim across persona setup and every scene.
3. **No text overlays in scene descriptions.** Overlays are recorded in the plan and applied only by `assemble_video` in step 4.
4. **Parallel scene generation.** Step 3 dispatches all `pro_director` calls in the same turn.
5. **Use `<label>:audio` from the director, not upstream audio**, in `assemble_video`.
6. **Every deliverable goes to tmpfiles.** Never reply with a `/tmp/outputs/` local path. Fall back to `register_asset` + asset id if tmpfiles is down.
7. **`expire=172800`** on every tmpfiles upload (48 h).
8. **Per-step input gates are mandatory.** If the user jumps into step 2/3/4, verify inputs before running anything; ask via `AskUserQuestion` if missing.
9. **Free-trial duration cap (20 s) applies to production runs (steps 2–4), not to plan text.** If the reference is longer and the session is free-trial, ask once: trim vs upgrade.
10. **Model names in the plan are a deliverable** — Claude, Nano Banana 2 / GPT Image 2.5 画质版 (gpt-image-2.5-sunburst), Seedance 2.0 Pro / Kling O3 / Kling 3.0. Include them in the plan; the user asked for them by name.
11. **3-attempt QA cap** per generated image; surface failure to the user on the third miss instead of looping silently.
12. **Single-step invocations are first-class.** If the user asks for "just the plan" or "just the images", stop at that step. Do not auto-continue.