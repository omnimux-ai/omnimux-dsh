# Visual World Lock — Subject / Material / Style Triple Lock

**Hard Rule #16 reference file.** Visual World Lock doctrine for motion design reels. Introduced v1.8.0 to close 17-finding regression batch where text-to-video boards without natural anchor (MDC2 default / MDC4 / MDC6 default) silently fell through to 6 disconnected environments or 6 parallel decorated beats.

---

## Doctrine

All panels in a single reel must inhabit ONE coherent visual world. Three locks fire together:

### 1. Subject LOCK

Same subject motif carried across panels. Different panels show DIFFERENT MOMENTS within the same subject world, not different subjects.

**Critical clarification (v1.8.2 — closes VF-23 cube-jelly subject-treadmill regression):**

Subject LOCK preserves subject IDENTITY (geometry / material / character signature) across panels — but does NOT mean same subject in identical environment × 6 panels with only pose variation. **Subject LOCK ≠ Same-Scene LOCK.**

Each panel must render a DIFFERENT scene / micro-environment / interaction context within the locked subject world. See Hard Rule #19 SCENE VARIATION mandate.

**Reference patterns for scene variation done right:**
- **BRAMBLE thorns world**: 6 different SCENE CONTEXTS within thorn material identity — thorn breaking ground / spiked perfume bottle / thorn crown / corridor of thorns / thorn tentacle / thorny wordmark. One material world, 6 distinct scenes.
- **LOOK CLOSER model**: one subject, 6 dramatically different framings + scene moments (eye macro / mid action portrait / hair macro / face confrontation / wide warrior pose / spike collar macro).
- **PIERCE energy drink**: 6 different subjects within locked chain+lightning aesthetic (arrow / chain / shatter / can / silhouette / wordmark). Material world locked, subject-moments varied.

**Anti-pattern (VF-23):**
- **Cube-jelly TILLY-style v1.8.1 broken state**: same cube-jelly subject in identical dark void background × 6 panels with only pose/zoom variation (drifting / spotting / reaching / blooming / pulsing / joined). Subject LOCK satisfied + scene variation missing = subject-treadmill = monotonous output.

**Validated wins (subject locked through reel):**
- BRAMBLE perfume — thorns as universal motif (thorn through ground / spiked bottle / thorn crown / thorn corridor / thorn tentacle / thorny wordmark)
- T2 RAYE music label — chrome wordmark + sparkles as universal motif
- T4 AXIS architecture studio — concrete + brass architectural world (gallery / sketch / model / corridor / inlay / embossed wordmark)
- T7 IRIS — iridescent rainbow cat sculpture preserved as hero subject
- T8 OBSIDIAN nootropic — brain anatomy specimen (5 views character sheet → 9-shot 3×3 hero scenes)

**Validated failures (subject NOT locked, system rendered 6 disconnected scenes):**
- T6 RUSH retest v2 (FIX-9 corrected direction) — system rendered highway / gamer setup / industrial concrete / electrical panel / urban rooftop / billboard = 6 different environments, no single subject world. Brand "RUSH" had no material identity, only labels on environments.

### 2. Material LOCK

Same material identity language across panels. **Material must be brand-DNA-derived, NOT generic genre defaults.**

**Brand-DNA material identity examples:**
- BRAMBLE perfume → thorns (provocative / wounding / ungovernable — uniquely BRAMBLE)
- OBSIDIAN nootropic → brain anatomy (cognitive function — uniquely OBSIDIAN)
- IRIS → iridescent rainbow-prismatic glass with concentric line texture (uniquely IRIS)
- RUSH energy drink → electric current / voltage discharge / plasma arc (uniquely RUSH — extracted from brand essence "energy", not from generic "energy drink" genre)

**Generic genre default examples (BANNED — these could belong to ANY brand in the same genre):**
- Generic "Y2K chrome" for any energy drink (could be Red Bull, Monster, Rockstar — not unique to RUSH)
- Generic "luxury gold + ivory" for any architectural studio
- Generic "minimalist white grid" for any tech SaaS
- Generic "halftone B&W kinetic" for any music label

**Extraction procedure:**

When brief gives a brand name + domain, extract material essence from brand specifics before writing storyboard:
1. What is unique to THIS brand vs other brands in the same genre?
2. What material / texture / object / structure embodies that uniqueness?
3. Can the material be photographed / rendered / illustrated as a coherent visual through 6 different panel moments?

If extracted material could belong to any brand in the same genre → re-extract from brand specifics until material is uniquely-this-brand.

### 3. Style LOCK

Same lighting register, same atmospheric world, same reference tier across all panels. Six panels should feel like one director's eye / one studio session / one shoot day — not six disconnected scenes.

**Style LOCK elements:**
- Same key light direction + color temperature
- Same shadow density + falloff
- Same atmospheric haze register (heavy / restrained / clean studio)
- Same color grade
- Same reference tier (Premium 3D motion / Editorial poster / Illustrated / Photographic) — see `reference-tier-matrix.md`

---

## Natural-lock routes vs explicit-injection routes

### Natural-lock routes (Visual World Lock fires automatically)

These routes inherently preserve subject + material + style through the pipeline:

| Route | Why naturally locked |
|---|---|
| MDC7 Foundation Mode | Subject preserved from user-attached image via @Image1 reference. Material and atmospheric register preserved by design. |
| MDC2 Style Reference Mode | Atmospheric register extracted from @Image1 via TAKE-5/6 doctrine. Subject is new but material/lighting/palette locked to reference. |
| MDC8 Track B Product Commercial | Character sheet generation creates 5-view subject reference → 9-shot pipeline preserves subject + material identity through every shot. |

For these routes, skill does NOT need to explicitly inject Visual World Lock — the natural mechanism preserves the triple lock.

### Explicit-injection routes (Visual World Lock requires manual prompt injection)

These routes have NO natural anchor and silently fall through to disconnected beats:

| Route | Failure pattern without explicit injection |
|---|---|
| MDC2 default (text-to-video brand reel, no URL ref) | 6 panels become 6 disconnected scenes — different environments, different lighting, different subjects |
| MDC4 infographic | 3 stat blocks + endcard become decorated stats with no unifying material world |
| MDC6 kinetic typography default | Letters slammed against void backgrounds — no brand-DNA material identity, generic AE template register |

For these routes, skill MUST explicitly inject Visual World Lock into the storyboard prompt body. See injection templates below.

---

## Injection templates for explicit-injection routes

When writing the `generate_image` storyboard prompt for MDC2 default / MDC4 / MDC6 default (no natural anchor), inject this block after the brief recitation and before the panel-by-panel breakdown:

```
VISUAL WORLD LOCK — single visual world across all 6 panels:

SUBJECT LOCK: [extract brand-DNA-specific subject motif from brief — what UNIQUELY embodies this brand?]. All 6 panels render DIFFERENT MOMENTS within the same subject world. No panel introduces a subject foreign to this world.

MATERIAL LOCK: [extract brand-DNA-derived material identity — NOT generic genre default]. Same material language carried through every panel — same surface treatment, same texture register, same physical substance feel.

STYLE LOCK: [pick reference tier per `reference-tier-matrix.md`]. Same lighting register (key direction + color temperature + shadow density), same atmospheric world, same reference tier through all 6 panels. Reads as one director's eye / one studio session.

BANNED: 6 disconnected environments, stock-photography collage cobbled together as concept arc, photographic real-world locations stitched together (highway / gamer setup / industrial / rooftop / billboard for one brand reel), generic genre material defaults.

REQUIRED: one coherent material world rendered from different angles / scales / moments / states across the 6 panels.
```

---

## Validated failure cases

- **§ VF-19** — T6 RUSH retest v2 (6-environments stock-photography collage). System interpreted FIX-9 corrected direction as "go photographic" and rendered 6 disconnected real-world environments. Closed by Hard Rule #16 + this doctrine.
- **§ VF-21** — T4 AXIS architecture brand reel. 6 panels DID inhabit one architectural world (concrete + brass) but invented secondary metadata (`01 — BERLIN` / `RESIDENTIAL ARCHITECTURE / EST. 2014`). Subject + Style LOCK held, Material LOCK partial. FIX-1 baseline strengthening covers the invented copy issue (Hard Rule #4.1).

---

## Pre-write checklist integration

Before writing storyboard prompt:

1. Identify route (Foundation / Style Ref / Track B = natural-locked; MDC2 default / MDC4 / MDC6 default = explicit injection required)
2. Extract Subject motif from brand essence (not from genre default)
3. Extract Material identity from brand specifics (test: could this material belong to any brand in the same genre? if yes, re-extract)
4. Pick Style LOCK reference tier from `reference-tier-matrix.md`
5. For explicit-injection routes: write Visual World Lock injection block into imagegen prompt before panel breakdown
6. Verify all 6 panel descriptions inhabit the same subject + material + style world

---

## Cross-references

- Hard Rule #16 — Visual World Lock triple lock (this file's doctrine)
- Hard Rule #4.1 — text-string count guard (related: invented editorial chrome breaks Subject/Material LOCK by introducing foreign metadata layer)
- Hard Rule #15 — Sheet chrome restraint (related: chrome stack densifies sheet OUTSIDE the visual world, breaks director's-eye coherence)
- `references/reference-tier-matrix.md` — 4-tier register selector for Style LOCK
- `references/r-type-vocabulary.md` — brand reveal types that respect Visual World Lock (R1 material assembly = wordmark forged from same material as world)
- `references/validated-failures.md § VF-19, § VF-21` — failure cases this doctrine closes
