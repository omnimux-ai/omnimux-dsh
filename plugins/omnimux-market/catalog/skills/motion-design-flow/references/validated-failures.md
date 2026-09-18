# Motion Design Flow — Validated Failure Cases

Production-grade failures from past batches that drove specific rule additions in `SKILL.md`. Rules in SKILL.md cite cases here as `see validated-failures.md § <case-id>` instead of carrying postmortem prose inline.

Each entry: **what happened**, **the silent bug**, **the rule that closed it**.

---

## § VF-1 — v1.5.8: URL → bake-into-text shortcut

**Batch:** 5 reels, all 5 had Pinterest / CDN URL refs.

**What happened:** the agent saw a URL in brief, attempted to register it directly. The URL string was rejected. The agent then reasoned: "registration needs an asset id, the URL was rejected → I'll skip it and bake the style into the text prompt instead." Submitted `generate_image` with no `image_urls`, style described in prose. Result: 0/5 style refs preserved — invented visuals from text alone.

**Silent bug:** Treating the rejection as a sign the URL pipeline is broken, instead of as a sign that the URL needs to be resolved to a registered asset id first.

**Rule:** Hard Rule #0 — resolve the URL to a registered asset id (via `list_assets` / `get_asset`) → pass it in `image_urls`. Text-only fallback explicitly FORBIDDEN.

---

## § VF-2 — v1.5.9: vision-describe fallback with empty `image_urls`

**Batch:** 4 files attached via `@image1`–`@image4`, brief used label references.

**What happened:** the agent vision-described each image into the prompt body (since the model can see images directly), then submitted `generate_image` with an empty `image_urls` array. No reference image actually passed to the image model. Invented brands appeared (OBBY1000 / NOVA / LAVIEJAART / FUTURE WITHIN), zero visual transfer from the attached files.

**Silent bug:** Vision describing is not the same as passing the asset. `@imageN` in brief is a LABEL the user uses to mark "which file goes with which task", NOT an asset id the tool can resolve.

**Rule:** Hard Rule #12 — empty `image_urls` when images attached is FORBIDDEN. Mandatory `list_assets` / `get_asset` resolution.

---

## § VF-3 — v1.6.x vibe-reel batch: urllib.request panic

**Batch:** 3 images attached, brief said `"based on these shots"` (no `@imageN`, no URL).

**What happened:** the agent tried to fetch the image data via a side channel, which failed. It then panicked, defaulted to vision-describing each image into the prompt, and submitted with empty `image_urls`. Visual fidelity lost.

**Silent bug:** Brief used generic phrasing without `@imageN` labels — the agent treated this as "no attachments to resolve" instead of "list assets via the dedicated tool".

**Rule:** Hard Rule #12 — mandatory `list_assets(media_type="image")` resolution **whenever any image is attached this turn**, regardless of brief phrasing.

---

## § VF-4 — v1.6.1 batch: Foundation route silently dropped

**Batch:** Multi-reel with `@image` attachments, briefs included Foundation phrases.

**What happened:** the agent saw `@image` attached, went straight to Step 0d.B Style Ref TAKE-5 pipeline. Style Ref applies atmospheric decomposition that erases subject identity. R1 dropped the dancer entirely. R2 contained the literal instruction `"DO NOT render the same tiger"` — the model wrote an anti-prompt because the routing had silently inverted the user's intent.

**Silent bug:** Style Ref and Foundation are mutually exclusive modes for attached images. Without a Foundation phrase check BEFORE Style Ref routing, the default falls through wrong.

**Rule:** Hard Rule #11 — Foundation phrase precedence runs FIRST when image is attached, before any Step 0d.B logic.

---

## § VF-5 — 2026-05-07 / 2026-05-08 baseline batch: real-brand stamp leak

**Cases:** T8 CRUSH (2026-05-07) — Saucony stamp from input shoe leaked across all 6 panels. T8 FORGE (2026-05-08 v1.7.2) — "LEATHELICA" stamp from input wallet leaked across all 6 panels.

**What happened:** Foundation Mode correctly preserved the subject silhouette, material, and form — but ALSO preserved real-world brand text printed on the product. The brand wordmark specified in the brief (CRUSH / FORGE) got drowned out by Saucony / LEATHELICA appearing on every shot.

**Silent bug:** Foundation Mode's "preserve subject" instruction is too aggressive — it copies brand-stamp pixels along with product geometry. Without an explicit clause to strip real brand text while preserving silhouette, Seedance shows whichever brand the input photo carried.

**Rule:** Hard Rule #11 Brand-stamp protection clause — Foundation Mode imagegen prompt MUST include "preserve silhouette/material, do NOT render real-world brand text/stamp/logo, render only the brief's specified BRAND wordmark on its reveal panel".

---

## § VF-6 — 2026-05-08 baseline batch: `@imageN` treated as UUID

**Cases:** T7 `@image1 for style and vibe` (car photo for VOLT brand) — generated generic black SUV, unrelated to attached car. T8 `@image2 — это основа` (shoe photo for CRUSH) — leaked Saucony branding pulled from training data instead of preserving the attached CRUSH shoe.

**What happened:** the agent read the `@imageN` text in brief as a directly-usable asset id and submitted `generate_image` with no asset-resolution call. With no actual reference passed in `image_urls`, the model invented visuals from training distribution.

**Silent bug:** Old Mode 3 wording in v1.7.x docs ambiguous on whether `@imageN` is a label or a handle.

**Rule:** Hard Rule #12 — `@imageN` is a label only; mandatory `list_assets` / `get_asset` resolution before submission.

---

## § VF-7 — v1.7.2–v1.7.4: Z-axis crash-zoom collapse

**Reels:** T1 KAYU / T5 ECHELON / T6 ECLAIR / HALCYON / FRESH / OBSIDIAN / STATIC.

**What happened:** Seedance has a strong default bias toward Z-axis zoom (push-in / pull-back). Without prescriptive constraints, multiple shots in a single reel all collapsed to uniform forward-backward zoom — "однотипный zoom in" feel across the 6 beats.

**Silent bug:** Generic camera vocabulary in the prompt ("smooth dolly push-in", "elegant push-in") let Seedance default to its training-distribution mean = Z-axis pulses.

**Rule:** Hard Rule #5a (ZOOM DISCIPLINE) — primary motion axis must rotate across X / Y / Orbital / Hold; count Z-axis shots per reel (≤2, never adjacent). Hard-banned vocabulary list. Mode A and Mode B PRIMARY moves explicitly enumerated per-mode.

---

## § VF-8 — v1.7.5a: hard-ban over-correction

**Reels:** HEARTH / PULSE.

**What happened:** v1.7.5a banned Z-axis zoom outright as a fix for VF-7. Result: HEARTH and PULSE rendered with too little camera motion — "мало движения" complaint. Over-correction in the opposite direction.

**Silent bug:** A hard ban is the wrong abstraction when the actual problem is variety, not the axis itself.

**Rule:** Hard Rule #5a (ZOOM DISCIPLINE, v1.7.5b) — Z-axis allowed for Mode A as a disciplined fallback ("Imperceptible dolly push-in 3-5cm over 2.5s with parallax differential"); allowed for Mode B via explicit DRAMATIC PUSH-THROUGH / VERTIGO PULL. Variety mandate across the 6 shots.

---

## § VF-9 — v1.7.10 T3 AXIS: variety mandate missed

**Reel:** T3 AXIS.

**What happened:** Every shot defaulted to Z-axis push-in despite the relaxed Mode A vocabulary from v1.7.5b. Reel read as one continuous push-in across all 6 beats.

**Silent bug:** Relaxing the Z-axis ban without ALSO enforcing per-shot axis variety meant the relaxed rule silently re-collapsed to default.

**Rule:** Hard Rule #5a — variety mandate strengthened. Across 6 shots: never adjacent Z-axis shots, ≥1 Y-axis, ≥1 X-axis, ≥1 Hold. If a reel ends up with 4+ Z-axis shots, the prompt has collapsed; rewrite.

---

## § VF-10 — v1.7.4 T9 DRIFT: hallucinated UI text

**Reel:** T9 DRIFT (UI/App demo format).

**What happened:** Brief named the character ("Jordan Lee") but left every other UI element unspecified. Skill silently invented the rest of the UI text. Seedance rendered "3 ive" as a garbled glyph inside a phone mockup card.

**Silent bug:** UI / kinetic typography / infographic formats need EVERY visible text element specified in detail (wording, font, size, position, color, animation curve). Without this, Seedance hallucinates UI text from training distribution.

**Rule:** Hard Rule #2b (Detailed text spec mandate for UI/text-heavy formats) — every text element specified; agent must EITHER ask user for exact text OR propose+confirm before generation.

---

## § VF-11 — 2026-05-08 baseline batch: generic-cut transitions

**Batch:** Multiple reels.

**What happened:** Most reels rendered as choppy zoom-in / zoom-out between beats — no metamorphosis, no trajectory continuity. Each shot ended as a static frame, next began as a static frame, hard cut between.

**Silent bug:** Prompt specified camera moves per shot but did NOT specify a NAMED transition at each shot junction. Seedance defaulted to generic cuts.

**Rule:** Hard Rule #6 — every shot junction needs an explicit `TRANSITION [time]: [named type] + [medium/details]` line. Two families (camera-driven vs VFX-driven). Generic cut = FAIL.

---

## § VF-12 — 2026-05-08 baseline batch: vertical sheet aspect mismatch

**Cases:** T4 HALO / T10 PULSE (both 9:16 video) used 3:2 storyboard sheet. v1.7.2 follow-up: T4 VEIL same issue.

**What happened:** Storyboard sheet rendered as `aspect_ratio: "3:2"` (default), producing near-square panel cells. Video target was 9:16 vertical. Panel composition misaligned to vertical output. Seedance struggled to extract vertical framing from horizontally-shaped panel cells. Result: content compressed into middle third of frame.

**Silent bug:** Sheet aspect_ratio defaulted to "3:2" instead of inheriting from the Step 0c user answer.

**Rule:** Aspect ratio sync rule under Production parameters — Step 0c answer drives BOTH the Seedance aspect_ratio AND the imagegen storyboard sheet aspect_ratio. Verification step mandatory before submitting either call.

---

## § VF-13 — 2026-05-08 v1.7.2: same-template batch slop

**Cases:** T1 ATLAS / T7 TIDE / T8 FORGE — all three rendered as identical "single product hero floating in dark moody workshop" template, despite different brand briefs.

**What happened:** Three brand reels in one batch fell through to the default cinematic CGI commercial register. No SP-pattern match attempted. Same camera mode, same lighting, same background across all three. Reel-to-reel variety lost.

**Silent bug:** Default routing (cinematic MDC2) is unvalidated risk vs. SP patterns which are validated wins. Without an SP-match pass, three reels in a row produce AI batch slop.

**Rule:** Step 0d — SP-pattern match runs BEFORE default cinematic routing. Variety mandate for multi-reel batches: each reel uses a different SP / register / camera mode / palette.

---

## § VF-14 — v1.7.17 regression: invented editorial chrome on MDC2 default fall-through

**Batch:** T2 PLINTH (music) / T4 FERN (wellness) / T4 AXIS (architecture) / T5 METRICS (SaaS analytics) — all four MDC2 default route (no SP-match, no Foundation, no Style Ref).

**What happened:** Brief gave explicit text-beat list (`"three text beats: X / Y / Z"`). System rendered storyboard sheet with 6-9 text strings instead of 3. Extra strings were SECONDARY tracked monospace accents derived from brand description:
- T2 PLINTH: invented `"INDEPENDENT ELECTRONIC LABEL"` tagline
- T4 FERN: invented `"Crafted for the cup."` tagline
- T4 AXIS: invented `"01 — BERLIN"` + `"— THE STUDIO"` + `"BERLIN · COPENHAGEN"` + `"RESIDENTIAL ARCHITECTURE / EST. 2014"` (4 invented strings, including PRIMARY 4th text beat + invented EST date)
- T5 METRICS: invented `"Q1–Q4 2026"` + `"↗ active"` (2 invented SECONDARY accents)

**Silent bug:** Brand domain with strong editorial associations (music = subgenre tags, wellness = aspirational descriptors, architecture = location + EST.YEAR tags, SaaS = fiscal timeframes + status indicators) caused MDC2 default to fall through into "premium domain implies editorial caption chrome" pattern. Without explicit aesthetic trigger (`editorial-tech` / `schematic`), system silently invented domain-appropriate captions.

**Cross-stage propagation confirmed:** Invented copy from storyboard sheet propagated into Seedance prompt with TEXT PERSISTENCE doctrine locking it for full shot duration. T4 AXIS Seedance prompt contained all 4 invented strings + `TEXT PERSISTENCE: text stays at same size/position throughout shot, never fades`.

**Rule:** Hard Rule #4.1 — Text-string count guard + editorial chrome aesthetic license matrix. SECONDARY tracked accents permitted ONLY when brief explicitly triggers editorial-tech / schematic / faux-data aesthetic. Cross-stage handoff verification required.

---

## § VF-15 — v1.8.0 regression: palette override authority (T6 RUSH retest v3)

**Reel:** T6 RUSH retest v3 (FIX-10 Visual World Lock test with manual doctrine injection).

**What happened:** Brief locked `electric yellow #F4E300 + jet black #0A0A0A + neon pink #FF1F8F` palette. System spec swapped palette to `jet-black #0A0A0F + molten copper #D97A2C + plasma cyan-white #E8F4FF + arc-strike white #FFFFFF` because system reasoned that "real plasma is physically cyan-white, copper conductors are copper-colored". Yellow and pink colors from brief LOCK disappeared entirely from spec.

**Silent bug:** System exercised "best practice" creativity — recalibrated brief-locked palette to "domain-physically-accurate" version without user opt-in. Brief LOCK was treated as a suggestion rather than mandatory.

**Rule:** Hard Rule #9.1 — Palette LOCK override authority HARD GUARD. Brief-locked palette hex codes are final. NO replacement, NO recalibration to "more accurate" / "physics-accurate" / "domain-canonical" variant under any pretext. Creative palette interpretation is user opt-in only.

---

## § VF-16 — v1.7.17 regression: palette LOCK additive leak with cross-stage propagation (T3 VERDA)

**Reel:** T3 VERDA brand reel with URL Style Ref (MDC2 default).

**What happened:** Spec declared strict `4-color PALETTE LOCK: #0A1628 navy + #4A7A3E green + #E8669A pink + #FFFFFF white`. System then specified within its own spec body:
- Panel 02: `"Tiny red progress bar near upper edge at 30% fill"` — red not in palette
- Panel 04: `"Small yellow callout box bottom-right reads 'STATUS · OK'"` — yellow not in palette

Both red bar + yellow STATUS callout rendered on storyboard sheet, visible as palette LOCK self-violations.

**Cross-stage propagation confirmed:** Leak propagated from storyboard sheet into Seedance prompt unchanged. Seedance spec preserved both red and yellow accents.

**Silent bug:** System declared palette LOCK at top of spec then introduced additional accent colors within its own spec body under guise of "calibration chrome" / "schematic register" / "status indicator". Palette LOCK doctrine did not self-correct across stages.

**Rule:** Hard Rule #9.2 — Palette LOCK additive leak protection + cross-stage propagation guard. Count unique colors in spec vs declared LOCK; if delta > 0, strip extras OR absorb into LOCK explicitly. Storyboard → Seedance handoff verification mandatory.

---

## § VF-17 — v1.8.0 regression: T6 RUSH double-failure (AE-template + stock-photo-collage)

**Reel:** T6 RUSH original + T6 RUSH retest v2.

**T6 RUSH original (AE-template cliché):** Spec body adhered to all Hard Rules but visual register fell into AE Pre-comp explosion template — comic-style POW/BAM bursts (P02 POWER smash with pink shard explosion), glitch fragments (P03 HIT fragments), halo flash burst behind RUSH wordmark (P06 endcard). Aesthetic was 1980s arcade meets Y2K chrome cliché, not premium 2026 motion design.

**T6 RUSH retest v2 (stock-photography collage):** Doctrine injection pushed direction toward "ARRI Alexa / 35mm grain / photographed-not-rendered". System rendered 6 disconnected real-world environments — highway through windshield / gamer setup macro / industrial concrete loading bay / electrical panel macro / urban rooftop / billboard. Brand "RUSH" had no material identity, only labels on environments. Stock photography collage cobbled together as "concept arc".

**Silent bug:** AE-template cliché is one fall-through default; photographic cinematic register is the OTHER fall-through default. Motion design is a design discipline — photographic realism is the narrow exception, not the antidote to AE template cliché.

**Rule:** Hard Rule #14.1 — AI cliché ban expanded with TWO new clause families: (1) Kinetic typography mode — banned AE-template vocabulary (radial explosion bursts / halo glow auras / centered POW-BAM / shard debris); (2) Text-to-video without anchor — banned stock-photography collage / literal photo-real environments as "concept arc". Replace defaults with **premium designed 3D motion graphics tier** (Buck / ManvsMachine / Block & Tackle / Sucuk und Bratwurst / Polygon1993). See `references/reference-tier-matrix.md`.

---

## § VF-18 — v1.8.0 regression: Rule 10 sheet chrome restraint regression (T6 v4 + T7 IRIS double-confirmed)

**Reels:** T6 RUSH retest v4 + T7 IRIS Foundation Mode.

**What happened (T6 v4):** Storyboard sheet rendered with full chrome stack — top header (`15s MOTION STORYBOARD / RUSH / ENERGY DRINK — KINETIC TYPOGRAPHY / v1.0`), per-panel labels with timecodes above each thumbnail (`01 (0:00-0:02) Pre-impact letter fragments cascade in from right`), bottom strips (`TONE: Aggressive / Kinetic / Designed / Hard-Edge`, `STYLE: Druk-Wide / Y2K-Chrome / Designed-Type / 3D-Material`). Sheet chrome density violated PHOTOGRAPHIC FRAME PURITY at the SHEET-MARGINS level (chrome inside panel frames was clean — the violation was outside-frame chrome bloat).

**What happened (T7 IRIS):** Identical chrome stack — `15s MOTION STORYBOARD` + `IRIS / ICONIC IDENTITY` + panel labels with timecodes + `TONE: Iridescent / Contemplative / Refractive / Pure` + `STYLE: Glassmorphic / Prismatic / Editorial / Premium` + `IRIS · v1.0` corner tag.

**Silent bug:** PHOTOGRAPHIC FRAME PURITY doctrine (Rule 10) addressed INSIDE-frame chrome (no `CHAPTER X` / `SECTOR Y` / version stamps INSIDE photographic frames). It did NOT address sheet-margins chrome density. Heavy doctrine injection in brief made system legitimize full chrome stack as "integrated editorial-poster design feature".

**BRAMBLE benchmark reference:** BRAMBLE storyboard chrome was restrained — only brief panel labels (`01 · 0:00-0:02 — A single thorn breaks through — violent arrival.`). NO top header, NO TONE/STYLE strips, NO version tags.

**Rule:** Hard Rule #15 — Sheet chrome restraint. Storyboard sheet margins permitted ONLY brief panel labels (BRAMBLE-tier). Banned: top headers / TONE strips / STYLE strips / version tags / project title bars. Track B character sheet exception (Hard Rule #13) — character sheet is production bible, not storyboard sheet.

---

## § VF-19 — v1.8.0 regression: T6 RUSH retest v2 single-subject-world broken (6 environments)

**Reel:** T6 RUSH retest v2 (FIX-9 corrected direction — premium designed 3D motion design tier requested).

**What happened:** Storyboard rendered 6 disconnected environments instead of single visual world:
- P01: late-night highway through windshield (sodium-vapor streetlights)
- P02: gamer setup macro (monitor glow on RGB keyboard)
- P03: industrial concrete loading bay (neon underglow)
- P04: electrical panel macro (copper conductors + voltage arc)
- P05: urban night rooftop (high-speed lane markers)
- P06: highway billboard endcard

Brand "RUSH" had no material identity carried through panels — each panel was a stock-photography location with diegetic RUSH text label. No Subject LOCK, no Material LOCK, no Style LOCK.

**Silent bug:** System interpreted "concept arc" (exhaustion → ignition → surge → peak → resolve) as license to render 5 different environments + endcard. The transformation arc became transformation between WORLDS, not transformation within ONE world.

**BRAMBLE benchmark reference:** BRAMBLE thorns world preserved across all 6 panels — thorn breaking through ground / spiked perfume bottle / thorn crown / corridor of thorns / thorn tentacle / thorny wordmark. Different MOMENTS within ONE world, not different worlds.

**Rule:** Hard Rule #16 — Visual World Lock (Subject / Material / Style triple lock). For text-to-video routes without natural anchor (MDC2 default / MDC4 / MDC6 default), explicit Visual World Lock injection mandatory in imagegen prompt. See `references/visual-world-lock.md` for injection templates.

---

## § VF-20 — v1.8.0 regression: Foundation Mode pose monotony (T7 IRIS)

**Reel:** T7 IRIS Foundation Mode (iridescent rainbow cat sculpture preservation).

**What happened:** Brief specified narrative arc (`rest → twitch → ripple → flare → settled`) suggesting pose variation across 5 hero panels. System interpreted "preserve subject" as "preserve POSE" — all panels rendered identical sitting pose (facing left, head turned slightly toward viewer, eyes closed) at different framings (wide hero / medium close / wide hero / extreme macro / wide hero). Pose variation was actually FRAMING/ZOOM variation of same pose.

**Silent bug:** v1.7.12 pose variation patch prevented static clone × 6 but did not enforce different ACTION STATES. System preserved subject identity correctly per Foundation Mode doctrine but interpreted action arc as framing arc.

**Rule:** Hard Rule #18 — Foundation Mode pose variation REAL. Brief narrative arc states (rest / awakening / movement / peak / resolve / settled) MUST translate to different anatomical poses per panel — sitting / head turning up / arched back / paw raised / curled lying / standing — not the same pose at wide / medium / close framing. Atmospheric-only arcs (mood / lighting shift) may use framing variation; action arcs require pose variation.

---

## § VF-21 — v1.8.0 regression: T4 AXIS Material LOCK partial (subject + style held, material partial)

**Reel:** T4 AXIS architecture studio brand reel (MDC2 default route, no URL ref).

**What happened:** Storyboard correctly inhabited ONE architectural world (concrete + brushed brass + warm cream) across 6 panels. Subject LOCK held (architectural studio interior world). Style LOCK held (consistent warm directional light + dust motes + skylight wash). HOWEVER:
- Material LOCK partial — system invented 4 secondary text-string accents (`01 — BERLIN` + `— THE STUDIO` + `BERLIN · COPENHAGEN` + `RESIDENTIAL ARCHITECTURE / EST. 2014`) breaking Material world coherence by introducing foreign text metadata layer
- FIX-1 baseline failure (Hard Rule #4.1 covers this)

**Silent bug:** Visual World Lock TRIPLE (Subject / Material / Style) requires all three locks to fire together. Text metadata foreign to brand DNA breaks Material LOCK even when visual subject + style register are correct.

**Rule:** Hard Rule #16 — Visual World Lock triple lock with Hard Rule #4.1 text-string count guard. Both rules layer: visual subject + style + material identity preserved AND no foreign text metadata introduced.

---

## § VF-22 — v1.8.0 regression: TILLY zero-text + atmospheric closer rendered as subject-as-letters

**Reel:** TILLY Children's Book Club brand reel (MDC7 Foundation Mode, 3D chibi character preserved across 6 panels).

**What happened:**
- P01-P05: ZERO in-panel punch-line text. Panels show 3D chibi cat-creature in pose variation (HR-18 worked — different action poses across stages: standing / looking up / pointing / running / kneeling) but no atmospheric text anchor in any panel.
- P06: brand reveal rendered as 3D CLOUD SCULPTURE of letters "TILLY" — subject-as-letters approach. Letter glyphs formed from cloud-material substance, not clean typography.
- Sheet chrome: tier (c) FULL chrome present (top header `15s MOTION STORYBOARD / TILLY / CHILDREN'S BOOK CLUB` + panel labels with narrative captions + bottom strip `TONE: Whimsical / Curious / Gentle / Adventurous` + `STYLE: 3D Storybook / Pastel / Chibi / Cloudworld` + `TILLY · v1.0` corner tag) — chrome itself was actually correct for the illustrated-narrative register, but in concert with zero in-panel text, sheet read as "narrative description in margins, no concept inside frames".

**Silent bug — two-layer:**

1. **HR-1.5 text-anchor mandate not enforced in MDC7 Foundation Mode template.** boards.md Rule 1.5 declared text-anchor mandatory in every reel including concept/generic mode, but the rule was NOT vshito as a mandatory pre-panel check in the Required prompt template (Format A/B). MDC7 Foundation Mode pipeline (motion-design-cases.md) had Chrome layer mandate but no text-anchor mandate. System interpreted "atmospheric whimsical Foundation register" → "no in-panel text needed, captions in chrome margins are enough" → zero text output.

2. **Atmospheric integrated closer (v1.7.15 default) rendering ambiguity.** boards.md Brand Reveal Catalog described atmospheric closer = wordmark 15-22% integrated in scene, but did NOT explicitly forbid subject-as-letters rendering. System interpreted "TILLY wordmark integrated in cloud-world scene" → "render TILLY letters AS cloud sculptures" (scene-as-typography) instead of "render typography sitting IN cloud scene" (typography-in-scene). PIERCE benchmark shows the correct pattern (clean display sans wordmark IN atmospheric chain-sparks scene), TILLY broken state shows the wrong pattern (3D letters forged FROM scene material).

**Compounding v1.8.0 HR-15 over-correction:** v1.8.0 added HR-15 BRAMBLE-tier-only chrome restriction in response to VF-18 chrome bloat. This swung sheet doctrine in the opposite direction — "atmospheric / restrained register = strip chrome AND text". TILLY landed at the worst of both: text-less interior with chrome margins that didn't help anchor concept.

**Benchmark gap:** Three production benchmarks (LOOK CLOSER / PIERCE BREAK THROUGH / THE FUTURE OF AI) all show in-panel punch-line text on 1-3 panels at varying chrome tiers (zero / panel-captions / full). User comparison surfaced TILLY as regression vs all three.

**Rules:**

- **Hard Rule #1.5 enforcement vshito into boards.md Required prompt template Format A + B as TEXT-ANCHOR MANDATE pre-panel block** — explicit text-panel count guard by genre, zero text without user opt-out = FAIL.
- **MDC7 Foundation Mode addendum (motion-design-cases.md)** — text-anchor mandate STILL applies in Foundation Mode (subject preservation does NOT exempt). Atmospheric integrated closer = CLEAN TYPOGRAPHY in scene, not subject-as-letters.
- **Hard Rule #15 walked back to three-tier matrix (v1.8.1)** — LOOK CLOSER (a) / PIERCE (b) / Future of AI (c) all valid; BRAMBLE-only restriction was over-correction. Chrome bloat ban (multiple stacked strips / faux-data / invented metadata) remains.
- **boards.md Brand Reveal section clarified** — atmospheric integrated closer route 1 banned subject-as-letters rendering explicitly. Subject-as-letters requires explicit brief opt-in (`"wordmark forged from material world"` / `"brand letters carved/built/grown"`).
- **Pre-write-checklist items 18 (text-anchor count guard) + 19 (text escalation arc) + 20 (concept arc transition)** added as mandatory silent reasoning items.

---

## § VF-23 — v1.8.1 regression: subject-treadmill + atmospheric-arc text undershoot (cube-jelly Foundation)

**Reel:** TILLY-style cube-jelly Foundation Mode brand reel (whimsical 3D bioluminescent jellyfish subject, Pattern A subset {01, 05} = 2 text panels, atmospheric tier (a) MINIMAL chrome, concept mode no brand wordmark, journey arc `drifting → spotting → reaching → blooming → pulsing → joined`).

**What happened:**

Doctrine technically satisfied — the agent wrote prompt that respected v1.8.1 mandates:
- ✓ Subject LOCK fired (cube-jelly preserved across all 6 panels)
- ✓ Material LOCK fired (translucent frosted-glass + cyan core + soft teal tentacles consistent)
- ✓ Style LOCK fired (Pixar/Buck Studio premium 3D tier with shallow DoF + marine-snow atmosphere consistent)
- ✓ Atmospheric integrated closer P06 (concept mode no wordmark — correctly skipped subject-as-letters)
- ✓ Chrome tier (a) MINIMAL correctly applied (no margins chrome)
- ✓ Pattern A subset {01, 05} = 2 text panels (within "atmospheric Foundation 1-2 subset OK" rule)

But output was **rejected by user as "мало текста / нет сути / нет смысла / объект в каждом шоте"** (not enough text / no essence / no meaning / subject in every shot).

**Three failures within compliant doctrine:**

**Failure 1 — Text count undershoot for arc-driven reels.**
v1.8.1 genre table allowed "atmospheric / Foundation 1-2 text panels (subset OK)" without qualifying whether the reel has a narrative arc. The cube-jelly brief had clear journey arc (`drifting → spotting → reaching → blooming → pulsing → joined`) — that arc demands articulation across 3 text beats minimum, not 2. v1.8.1 rule was too loose: subset-OK for mood-only reels (acceptable), subset-OK for arc-driven reels (insufficient — arc demands full Pattern).

**Failure 2 — Text escalation cargo-cult.**
v1.8.1 HR-17 escalation arc check verified "each beat advances brand voice on a new semantic level" but enforcement was weak — it caught "different words" but missed "different semantic level". The output text beats were:
- P01: `INTO THE QUIET.`
- P05: `STILLNESS CALLS BACK.`

Both occupy semantic level 1 (invitation to quietness). QUIET ↔ STILLNESS are synonyms — exact same failure mode as VF-17 RUSH (`POWER → HIT → NOW = synonyms for "energy now"`). Different words, same level → parallel labels, not escalation.

**Failure 3 — Subject-treadmill (most critical).**
v1.8.1 HR-16 Subject LOCK was rendered as "different MOMENTS within the same subject world" — the agent interpreted literally as **same subject in identical environment × 6 panels with only pose/zoom variation**. All 6 cube-jelly panels showed subject-in-dark-void with slight pose changes (drifting alone / spotting spark / reaching / blooming / pulsing / joined by others) — but EVERY panel shared the same dark-void scene context.

Reference benchmarks do scene variation:
- BRAMBLE thorns world: 6 DIFFERENT SCENES (thorn breaking ground / spiked bottle / thorn crown / corridor / tentacle / wordmark) — one material world, 6 distinct scene contexts
- LOOK CLOSER model: 6 dramatically DIFFERENT framings (eye macro / mid action / hair macro / face / wide / collar macro) — one subject, 6 different cinematographies

Cube-jelly: one subject, **same scene × 6 timestamps** = subject-treadmill regression.

**Silent bugs:**

1. **Genre count rule didn't distinguish mood-only from arc-driven Foundation reels.** "Subset OK" was correct for purely contemplative atmospheric reels, wrong for arc-driven Foundation reels with explicit journey language.

2. **HR-17 cargo-cult — "different words" passed but "different semantic level" failed.** Need explicit semantic-level numbering (1-5 scale) + pre-write check that 3+ beats span ≥3 unique levels.

3. **HR-16 Subject LOCK wording allowed subject-treadmill interpretation.** "Different MOMENTS within same subject world" → the agent read literally as "same world, different timestamps". Needed explicit scene-variation mandate as separate doctrine.

**Rules:**

- **Hard Rule #1.5 v1.8.2 refinement (boards.md + pre-write-checklist item 22):** narrative-arc qualifier added. Mood-only reels keep 1-2 subset; arc-driven Foundation/atmospheric reels mandate full Pattern A or B (3 text panels minimum). Trigger for "WITH arc": narrative phrasing in brief (`journey` / `evolution` / `arc` / `progression` / `→` chains / multiple state nouns / `from X to Y` / explicit transformation language).

- **Hard Rule #17 v1.8.2 strengthening (SKILL.md + boards.md + pre-write-checklist item 23):** semantic-level spread check. Levels {1: invitation, 2: verb action, 3: revelation, 4: claim, 5: identity}. For 3+ beats, must span ≥3 distinct levels. Synonyms at same level = FAIL. Anti-examples added (POWER/HIT/NOW; QUIET/STILLNESS).

- **NEW Hard Rule #19 (SKILL.md + boards.md + pre-write-checklist item 21):** SCENE VARIATION MANDATE. Subject LOCK ≠ Same-Scene LOCK. Scale spread ≥3 framings across 6 panels. Micro-environment variation per panel. Subject-treadmill (same subject in identical environment × 6 panels with only pose/zoom variation) = FAIL. Reference patterns: BRAMBLE 6-scenes, LOOK CLOSER 6-framings, PIERCE 6-subjects-within-aesthetic.

- **MDC2.2 production-keyframes pipeline removed v1.8.2.** Unrelated to VF-23 directly, but bundled into same release. Pipeline was not viable for production; routing now goes through MDC2 default + clip-prompt 4-layer sandwich + Track B MDC8 for per-shot pixel control.

---

## How rules cite this file

Inline citation pattern in SKILL.md:

```
> see `validated-failures.md § VF-1` for the URL → text-bake shortcut case
```

When adding a new postmortem:

1. Append a new `## § VF-N` entry below the last one (numbering is append-only — never re-number)
2. Update the corresponding rule in SKILL.md to reference the new case
3. Bump SKILL.md version (patch)
