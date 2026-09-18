# Podcast pipeline — troubleshooting

P0–P14 failure-mode diagnostics for the podcast producer pipeline.

Use when a chunk or storyboard fails QA. Each entry: symptom → root cause → fix protocol.

---

## Quick triage by symptom

| Symptom | Code | Fix § |
|---|---|---|
| Multi-chunk falls apart at splices, each chunk fine in isolation | **P0** | composite missing from chunk's `reference_images` |
| Each chunk feels like a separate mini-ad (cold-opens repeating) | **P0b** | lost episode spine — bridge chunks via dialog content |
| Silent tail appears in every chunk (intermediates end on dead air) | **P0d** | delete silent-tail directive from chunks K=1..N-1 |
| Storyboard came back colored / on cream paper / with marker | **P0e** | B&W clause missing or weakened in storyboard prompt |
| Reverse-angle close-up in storyboard or chunk | **P0f** | 180° rule violated — pick another shot, do not invent |
| Face wrong / drifts between chunks | **P1** | persona ref missing from `reference_images` |
| Mouth wrong (lipsync off) | **P2** | dialogue array mismatch or `[on-camera]` tag missing |
| Setting / room wrong | **P3** | composite missing from `reference_images[0]` |
| Listener identity wrong | **P4** | listener persona missing from `reference_images[2]` |
| Boring "two heads on camera" | **P5** | no storyboard as `start_image`, or all chunks same Pattern |
| Voice wrong (wrong speaker's voice playing) | **P6** | `voice_id` mismatch in `dialogue[]` entry |
| Eye contact wrong (speaker staring at lens) | **P8** | eye-line clause missing from composite / storyboard prompt |
| Refused generation (NSFW / sensitive) | **P10** | reword product / topic, avoid violence / explicit |
| Robotic mouth / unnatural pacing | **P11** | `delivery` field in dialogue[] too sparse |
| Background changes between chunks | **P12** | composite weak / not detailed enough |
| Visible jump cuts between chunks | **P13** | back-to-back same-pattern chunks; vary Pattern A/B/C |
| Mid-chunk dead air | **P13.5** | silence budget exceeded; add filler lines or `AUDIO CONTINUITY` |
| Wrong vibe (energy mismatch) | **P14** | persona archetype mismatch; recast |

---

## P0. Multi-chunk podcast falling apart at chunk boundaries (composite not passed)

**Symptoms:**
- Each chunk individually looks fine, but cutting them together is broken: speakers sit in slightly different spots chunk to chunk, room looks different, lighting shifts, mic arrangement changes.
- At every chunk-to-chunk splice the viewer feels a visible break even though faces are similar.
- "It looks like N different one-off videos pasted together" rather than one continuous episode.

**Severity:** episode-breaking — multi-chunk video does not hold together as one artifact.

**Root cause:** the composite from Step 2 was not passed as `reference_images[0]` on every `generate_scene_video` call. Hard Rule #10.

**Fix protocol:**

1. Verify `podcast:composite` exists in the asset registry.
2. For each chunk that's broken, re-run `generate_scene_video` with `reference_images=["podcast:composite", "persona:<speaker>", "persona:<listener>"]` — composite MUST be slot 0.
3. Re-author the `motion` field's LOCATION block to read: *"LOCATION: maintain studio / setting / lighting from the composite reference (first reference image) — same room, same chairs, same ambient lighting and palette throughout this chunk."*
4. Re-run all affected chunks with the composite attached — do NOT try to fix individual chunks without the composite; the issue is systemic.

---

## P0b. Multi-chunk feels like unrelated shorts (lost narrative spine)

**Symptoms:**
- Each chunk opens with a fresh "welcome back / today we're talking about…" hook even though there are N>1 chunks.
- Story facts or stakes contradict between chunks without an in-world reason.
- Viewer says it's "N separate short-form ideas" stitched as one timeline.

**Severity:** high — episode coherence breaks even if visuals match.

**Root cause:** chunk prompts lacked a shared episode arc; chunk K (where K ≥ 2) treated the segment as standalone.

**Fix protocol:**

1. In the **plan file**, write one `EPISODE_SPINE` sentence shared across all chunks; map each chunk to one outline beat.
2. For chunk K ≥ 2, rewrite Shot 1's first voiced line so it **answers or extends** whatever was left "open" before chunk K-1 ended. NO greetings, NO product re-introductions, NO fresh hooks.
3. Re-run affected chunks; do NOT regenerate composite / persona refs.

---

## P0d. Silent tail in every chunk (intermediates end on dead air)

**Symptoms:**
- Intermediate chunks (1 ≤ K < N) end with the visible listener holding their expression silently for 1+ seconds.
- The assembled video feels punctuated by awkward pauses at every chunk splice.

**Root cause:** a silent-tail directive (e.g. "hold the final close-up silently" / "ambient room tone only" / "silent tail") was copy-pasted into every chunk's motion field. The silent tail belongs ONLY on the final chunk. Hard Rule #12 violated.

**Fix protocol:**

1. In the motion field of chunks K=1..N-1, **delete** any silent-tail phrasing (e.g. "silent tail", "ambient room tone", "hold the final close-up silently", "silent hold", "clean editing tail").
2. Replace with: chunk ends mid-beat, on the current speaker's continuing line or on a listener mid-reaction (not silent).
3. Keep the short silent tail ONLY in chunk N's final shot directive.
4. Re-run only the affected chunks (1..N-1); chunk N is fine.

---

## P0e. Storyboard came back colored / on cream paper / with marker

**Symptoms:**
- Storyboard panels show skin tone, colored wardrobe, or accent colors.
- Paper background is cream, off-white, or sepia.
- Sketches look like colored marker drawings instead of pen-and-pencil black ink.

**Root cause:** the strict B&W clause is missing or weakened in the storyboard `prompt` field. The image model does NOT infer "no color" from the word *storyboard*.

**Fix protocol:**

1. Open the storyboard prompt; verify the verbatim B&W clause from [podcast-storyboard-prompt-guide.md](podcast-storyboard-prompt-guide.md) § *Color rule* is present near the top.
2. If absent or partial, paste the full clause:
   ```
   STRICTLY BLACK AND WHITE — bold black ink linework on PURE WHITE paper background (#FFFFFF), optional gray pencil shading for shadow / fabric / hair mass only. NO color anywhere — no cream tint, no off-white paper, no sepia, no watercolor wash, no colored markers, no accent colors, no color on faces, wardrobe, headphones, mics, set, headers, or footers. If hero references in the image_urls inputs are colored, convert them to grayscale in the sketch — keep facial structure, age, hair shape, glasses, build; drop skin tone, hair color, and wardrobe color. Hand-drawn pen-and-pencil planning sketch, NOT photorealism.
   ```
3. Re-run `generate_image` for the storyboard.

---

## P0f. Reverse-angle close-up (180° rule violated)

**Symptoms:**
- A close-up shows the opposite cheek of a speaker compared to the composite — e.g. composite shows the LEFT speaker's right cheek, but a chunk close-up shows their left cheek.
- Cuts feel disorienting; the speaker seems to teleport across the table.

**Root cause:** the storyboard prompt or chunk motion didn't enforce the 180° rule, or the desired shot was impossible from the composite-defined camera-side and a reverse angle was invented.

**Fix protocol:**

1. Identify which side of each speaker's face is shown in the composite (LEFT speaker → right cheek; RIGHT speaker → left cheek).
2. If a panel / chunk wants the impossible angle, **pick a different shot** — e.g. switch from a Pattern A speaker-CU to a Pattern B wide-to-tight CU on the same side.
3. Add to the storyboard prompt: *"180° rule: close-up uses the SAME side of the face as the composite reference shows; the camera does not cross the 180° line."*
4. Add to the chunk motion: *"camera stays on the same side of the 180° line as the composite (first reference image). No reverse-angle / opposite-cheek close-ups."*
5. Re-run.

---

## P1. Face wrong / drifts between chunks

**Symptoms:** Speakers' faces look slightly different chunk-to-chunk. Wardrobe / hair drifts.

**Root cause:** persona ref missing from `reference_images`, or `image_urls` order doesn't match the composite.

**Fix:** verify `reference_images = [podcast:composite, persona:<speaker>, persona:<listener>]` exactly. Speaker is slot 1, listener is slot 2. Swap per chunk by who's speaking.

---

## P2. Mouth wrong (lipsync off, wrong person's mouth moves)

**Symptoms:** The visible speaker's mouth doesn't match the audio. Or worse, the listener's mouth animates while audio is the speaker.

**Root cause:** `dialogue[]` entry missing or `[on-camera]` / `[silent]` tags not paired correctly.

**Fix:**
1. For listener close-up shots: the speaker line MUST be tagged `[voice-over, off-camera]` AND the visible listener MUST be tagged `[silent — mouth stays closed, not speaking this line, only micro-reaction]`.
2. Every `{{speak:persona:X}}…{{/speak}}` span in motion MUST have a matching `dialogue[]` entry.
3. The `speaker` field in each `dialogue[]` entry must match the persona id in the `{{speak:}}` span.

---

## P3. Setting / room wrong

**Symptoms:** Chunk's background is a different room than the composite shows.

**Root cause:** composite missing from `reference_images[0]`, or motion field's LOCATION block is too sparse.

**Fix:**
1. Confirm `reference_images[0] = "podcast:composite"`.
2. In motion field, add: *"LOCATION: maintain studio / chairs / table / microphones / lighting from the composite reference (first reference image) — same room throughout."*

---

## P4. Listener identity wrong (different person in the listener seat)

**Symptoms:** The listener close-up shows a different face than the persona reference.

**Root cause:** `reference_images[2]` (listener slot) missing or wrong asset id.

**Fix:** verify `reference_images = [podcast:composite, persona:<speaker>, persona:<listener>]` — slot 2 must be the listener for THIS chunk (swap per chunk).

---

## P5. Boring "two heads on camera"

**Symptoms:** Chunks all look the same — wide-two-shot on the speakers the entire time, no close-ups, no listener reactions.

**Root cause:** no storyboard as `start_image`, or all chunks use the same wide framing.

**Fix:**
1. Generate `podcast:storyboard:A` (and B / C if needed for monologue or reaction beats).
2. Set `start_image` to the storyboard for each chunk — the video model treats it as the narrative map.
3. Vary Pattern A / B / C across chunks; never repeat the same pattern more than 2 chunks in a row.

---

## P6. Voice wrong (wrong speaker's voice plays)

**Symptoms:** Audio sounds like the listener's voice, not the visible speaker's.

**Root cause:** `voice_id` in `dialogue[]` entry doesn't match the `speaker`.

**Fix:** verify each `dialogue[]` entry's `voice_id` matches the persona registry — `persona:<host>` → that persona's voice id; `persona:<guest>` → that persona's voice id. Misrouted `voice_id` is the #1 cause.

---

## P8. Eye contact wrong (speaker staring at lens)

**Symptoms:** The speaker in a chunk close-up looks directly at the camera lens (news-anchor stare). Composite shows both speakers staring forward.

**Root cause:** eye-line clause missing from composite / storyboard prompt.

**Fix:**
1. In composite prompt: *"both speakers visible in a single frame, mutual conversation eyeline — looking at each other, not at the camera."*
2. In storyboard prompt: *"In single-speaker close-ups, the visible speaker's gaze follows the off-frame partner — NOT the camera lens."*
3. In chunk motion: *"speaker's eyes and head turned toward the off-frame partner — NOT a flat-on talking-to-viewer stare."*
4. Re-run composite / storyboard / chunk in order.

---

## P10. Refused generation (NSFW / sensitive)

**Symptoms:** The video or image model returns "refused" / "policy violation" / NSFW error.

**Root cause:** the product or topic contains words that trigger moderation (e.g. weapons, violence, explicit content, controlled substances).

**Fix:**
1. Reword product references to a neutral, generic category term when a specific name or category trips moderation.
2. Avoid violence / explicit / controlled-substance vocabulary in dialog and prompt body.
3. If the product is genuinely in a moderation-sensitive category, escalate to the producer — this skill may not be the right delivery vehicle.

---

## P11. Robotic mouth / unnatural pacing

**Symptoms:** Lip movement looks mechanical, pauses are unnatural, the voice doesn't breathe.

**Root cause:** the `delivery` field in `dialogue[]` is too sparse — e.g. a single generic word like "conversational".

**Fix:** for each dialogue entry, set `delivery` to a specific, short tone description (roughly 2–6 words) that names the emotion, pace, and any vocal texture for that line. Specific delivery descriptions produce more natural model audio than generic ones.

---

## P12. Background changes between chunks (location drift)

**Symptoms:** Studio looks subtly different — wall color shifts, mic style varies, chair fabric changes.

**Root cause:** composite too sparse, or `reference_images[0]` order wrong.

**Fix:**
1. Re-author composite prompt with concrete material nouns (specific wall texture, specific chair material, specific mic shape).
2. Confirm `reference_images[0] = "podcast:composite"` on every chunk.
3. Add to motion: *"the room, chairs, microphones, and ambient lighting are exactly as shown in the composite reference (first reference image) — no improvisation on materials or layout."*

---

## P13. Visible jump cuts between chunks

**Symptoms:** The cut between chunk K and chunk K+1 feels jarring — same framing on both sides, no contrast, no breathing room.

**Root cause:** back-to-back chunks both end and open on a similar framing class (e.g. chunk K ends on a listener CU, chunk K+1 opens on a listener CU).

**Fix:**
1. Check storyboard pattern selection: if K used Pattern A (lands on listener CU) and K+1 opens with a listener CU, vary K+1 to Pattern B (opens on speaker CU).
2. Set design rule: inside one 4-panel storyboard, the first panel ≠ the last panel framing.
3. Between chunks, ensure the LAST shot of K and the FIRST shot of K+1 are different framing classes.

---

## P13.5. Mid-chunk dead air

**Symptoms:** A chunk has more than a couple of seconds of no spoken audio mid-chunk. Feels like a glitch.

**Root cause:** silence budget exceeded; either the dialogue array is too sparse or the motion has a "pause" beat without filler.

**Fix:**
1. Default ceiling: a short cap (≈2 consecutive seconds) of NO spoken audio inside the body of a chunk.
2. For longer silence (rare — only for an intentional dramatic pause), add ambient: insert an `AUDIO CONTINUITY` clause: *"AUDIO CONTINUITY: subtle room tone, light breath, micro-reaction — NOT silence."*
3. Or add filler dialog: a short interjection (e.g. "mm", "yeah", "right") from the listener.

---

## P14. Wrong vibe (energy mismatch)

**Symptoms:** The clip feels off — a speaker is too enthusiastic for the topic, or too flat for a comedy beat. Performances don't match the brief.

**Root cause:** persona archetype mismatch — the persona's `delivery` style doesn't fit the Conversation Premise.

**Fix:**
1. Recast: change one or both personas via `setup_persona` (producer-level — escalate this back to the producer).
2. If recasting is too expensive, adjust the `delivery` field in `dialogue[]` to dampen or boost energy (e.g. low-key vs. high-energy). But persona recast is more reliable.

---

## When in doubt

If a chunk fails QA and the symptom isn't in the table above:

1. Check Hard Rules 1–15 in [SKILL.md](../SKILL.md). 80% of failures are rule violations.
2. Compare the motion field against the **Per-chunk authoring checklist** in [podcast-clip-prompt-guide.md](podcast-clip-prompt-guide.md).
3. Validate `dialogue[]` entries — speaker / text / voice_id / delivery all present per spoken line.
4. If composite or storyboard are visually wrong, fix THOSE first — re-running chunks with broken upstream refs wastes video-generation budget.

If still stuck, return `is_success: false` to the producer with `reason: "<specific failure>"`; the producer may need to recast personas or rewrite the brief.
