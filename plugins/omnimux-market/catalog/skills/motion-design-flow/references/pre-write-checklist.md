# Pre-write Planning Checklist (v2.0)

**Internal reasoning pass — not user-facing output.** Run silently before writing any storyboard prompt or Seedance prompt. Do NOT output this checklist to the user unless explicitly asked.

---

## v2.0 Mode + Globals (HR-1 / HR-2 / HR-3 — check FIRST)

1. **Mode identified** — exactly one of: **MDC8 Product Reel / MDH High Motion Reel / MDT Typography Reel / MDI Infographic Reel**. If brief is ambiguous → ask the user via `AskUserQuestion` (Step 0a mode picker). No silent default.

2. **HR-1 IMAGE-GATE branch decided** — when image attached AND mode ∈ {MDH, MDT, MDI}, the gate ask was called and answered: **Style reference** (TAKE-6 atmospheric extraction; subject NOT preserved) OR **Build from this** (subject locked through all panels). Product Reel skips this gate.

3. **HR-2 MIN-TEXT verified per visible text element** — every in-frame text ≥10-12% panel height (cap-height of "cities" baseline). Latin sub-labels, tracked monospace dates, in-frame chrome captions = STRIPPED. Numeric values that ARE data (`$420` / `12K` / `84%`) stay headline-tier.

4. **HR-3 REALISM BAN applied** — for MDH / MDT / MDI: no photoreal humans, no documentary register, no ARRI Alexa / 35mm / iPhone editorial. Silhouettes, stylized 3D, illustrated 2D, abstract forms instead. Product Reel exempt — photoreal allowed.

## Doctrine spine

5. **Visual World Lock (HR-8)** — Subject / Material / Style triple lock identified + Scene Variation: each of 6 panels = different scene context within the locked subject world. Scale spread ≥3 distinct framings.

6. **Brand-DNA material identity** — extracted from brand specifics (not genre default). Test: could this material belong to any other brand in the same genre? If yes → re-extract.

7. **Palette LOCK (HR-9)** — 2-3 hex codes locked. Exact match against brief-locked palette (no recalibration). No additive accent colors slipping in under "calibration chrome" cover.

8. **Text discipline (HR-4 + HR-5)** — Pattern A / B / Hybrid declared. Text-string count = brief beat count (no invented `EST.YEAR` / location tags / category descriptors). Each text beat occupies a different semantic level on the {invitation / verb action / revelation / claim / identity} scale — no parallel synonyms.

9. **Master camera per mode (HR-6)** — MDC8 → motion-control roboarm / Mode A. MDH → **HYPERKINETIC CHAOS default** (Mode B). MDT → internal choreography (camera HOLDS, type animates). MDI → internal choreography (data state transitions). Adjacent shots NEVER share primary motion axis.

10. **Sheet chrome tier (HR-7)** — pick (a) MINIMAL / (b) PANEL-CAPTIONS / (c) FULL per mode default. MDH → (b). MDT 2D editorial → (c); MDT kinetic 3D → (b). MDI → (b). MDC8 → Track B character sheet doctrine.

11. **Tail freeze (HR-10)** — 13.7-15s pixel-identical hold. NO fade-to-black, NO darkening, camera motionless.

## Pre-flight production checks

12. **Aspect-ratio sync** — Step 0d answer drives BOTH imagegen sheet `aspect_ratio` AND Seedance `aspect_ratio` field. 16:9 video → 3:2 sheet. 9:16 → 9:16 sheet. 1:1 → 1:1 sheet. Defaulting to 3:2 for vertical/square = silent regression.

13. **Asset resolution** — when images attached, asset ids resolved via `list_assets` / `get_asset` and passed in `image_urls` (for `generate_image`) or `start_image` / `reference_images` (for `generate_scene_video` receiving the storyboard asset id). NEVER empty `image_urls` when images attached.

14. **Variety check (multi-reel batches)** — odd reels Pattern A, even reels Pattern B. Across batch, different SP register / different palette family / different camera mode where viable. No two reels in batch use the same R-type closer.

---

**Usage:** walk items 1-14 silently before writing the prompt. If any item is unanswerable from the brief → ask via `AskUserQuestion` before proceeding. Items 1 / 2 / 3 / 4 / 5 are HIGHEST LEVERAGE — silent guessing on these is the v2.0 most-common batch failure mode (mis-routed mode / missing image-gate / tiny chrome text leak / photoreal human in MDH / disconnected scenes).

**Why this is a separate file:** the checklist is reasoning instruction, not procedural step. Reading the file before writing IS the procedure; the items themselves are the reference material.
