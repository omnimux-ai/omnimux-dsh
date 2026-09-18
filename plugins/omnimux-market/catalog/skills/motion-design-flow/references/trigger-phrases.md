# Motion Design Flow — Trigger Phrases

**Single source of truth for phrase-pattern routing.** All Step 0 / Hard Rule routing logic in `SKILL.md` references THIS file. When adding or correcting a trigger phrase, edit it HERE — `SKILL.md` carries pointers, not duplicates.

---

## Foundation Mode triggers — route to MDC7

If brief contains ANY phrase below AND an image is attached → STOP, route to MDC7 Foundation Mode (`motion-design-cases.md`). Do NOT enter Step 0d.B Style Ref pipeline.

**English:**
- `this is the foundation`
- `build from this`
- `foundation for the reel`
- `concept basis`
- `these images ARE the reel`
- `not a reference, the foundation`
- `use this as foundation`
- `use this photo as foundation`
- `as foundation`
- `as basis`
- `this is the basis`
- `use this photo as basis`
- `preserve the subject`
- `keep the subject`

**Russian:**
- `это основа`
- `из этого создать`
- `это база`
- `не референс это основа`
- `эти картинки основа`
- `строим из этого`
- `используй как основу`
- `сохрани субъект`

---

## Style Reference Mode triggers — route to MDC2 Style Ref TAKE-5

If brief contains ANY phrase below AND an image is attached AND no Foundation phrase matched → Style Ref Mode (Step 0d.B).

**Note:** Style Ref is the **default** when an image is attached without Foundation phrasing. The list below documents the explicit signal phrases; resolution applies even when none are present (see Hard Rule #12).

**English:**
- `based on`
- `these images`
- `this shot`
- `these shots`
- `from the attached`
- `use this`
- `use the attached`
- `as reference`
- `as a reference`
- `as ref`
- `use this as reference`
- `use this photo as reference`
- `this photo`
- `the photo`
- `for style and vibe`

**Russian:**
- `эти картинки`
- `на основе этих`
- `для этого`
- `используй это фото`
- `как референс`
- `как основу` *(also a Foundation trigger — Foundation wins if both match)*

---

## Track B Product Commercial triggers — route to MDC8

If ANY trigger below matches → route to MDC8 (Track B), not Track A. Heavier pipeline (character sheet → 9-shot 3×3 → scene video × 1 take, N takes opt-in).

**Phrase triggers (English + Russian):**
- `product commercial`
- `product reel`
- `premium product`
- `luxury commercial`
- `tv-ad for [product]`
- `продакт коммершиал`
- `продукт-реклама`

**Reference-tier vocabulary triggers (any one in brief):**
- `Tom Ford` / `Cartier` / `Persol`
- `BMW` / `Apple commercial`
- `ASICS` / `Salomon` / `Nike`
- `Bot&Dolly`
- `ARRI Alexa` / `ProRes 4K cinema`
- `Octane render` / `Cinema 4D Octane`
- `Phase One IQ4`
- `motion-control camera` / `motion-control precision`
- `chiaroscuro luxury`
- `pure pitch black void`
- `Buck Studio` / `Pentagram`

**Explicit format triggers:**
- `9-shot` / `9 shots`
- `3×3 storyboard`
- `character sheet`
- `production storyboard`

**Plus:** Reference video URL provided in brief → Reference DNA decoding step kicks in (MDC8 step 1).

---

## MDC9 User-provided storyboard triggers — route to direct-to-video

If EITHER visual signal OR phrase below fires + an image is attached → Step 0a (image routing) mandatory `AskUserQuestion` (no silent auto-route).

**Visual signals (image reads as a multi-panel storyboard grid):**
- 6 thumbnails in 3×2 / 2×3 / 1×6 layout
- 9 thumbnails in 3×3 layout
- 4 thumbnails in 2×2 / 1×4 layout
- Hairline gutters between thumbnails
- Timecodes under panels (`0:00–0:02`, `0:02–0:05`)
- Panel number labels (`01` / `02` / `03`)
- Header / TONE / STYLE chrome strips
- `STORYBOARD` / `MOTION STORYBOARD` header text

**Phrase triggers:**
- `animate this storyboard` / `animate this board`
- `make video from this storyboard` / `make video from this board`
- `use this storyboard for video`
- `make video out of this board`
- `оживи борд` / `оживи раскадровку` / `оживи этот борд`
- `анимируй этот борд` / `анимируй эту раскадровку`

---

## Reference tier matrix triggers (v1.8.0, Hard Rule #14.1)

Use these triggers to pick the default-good register for text-to-video boards without SP-match. See `reference-tier-matrix.md` for full doctrine.

### Tier 1 — Premium 3D motion design triggers

- `kinetic concept reel`
- `premium 3D motion design`
- `designed 3D motion graphics`
- `material identity`
- `stylized 3D`
- `Octane render` / `Redshift render`
- `Buck Studio` / `ManvsMachine` / `Block & Tackle` / `Sucuk und Bratwurst` / `Polygon1993` / `Tendril 3D`
- Brand domains: energy drinks, tech / SaaS, FinTech, fashion drop, music label, AI / cognitive products

### Tier 2 — Editorial concept poster triggers

- `concept reel`
- `editorial poster`
- `restrained typography`
- `halftone aesthetic`
- `hand-drawn restraint`
- `textured paper ground`
- `silhouette + scale`
- `editorial illustration`
- `New Yorker style` / `Bloomberg Businessweek style` / `The Economist cover` / `Pentagram poster`
- Brand domains: NGO / activist / journalism / advocacy / education / cultural institutions

### Tier 3 — Illustrated motion triggers

- `illustrated motion`
- `2D motion design`
- `flat illustrated`
- `hand-feel illustrated`
- `character animation`
- `vector animation`
- `kawaii / cute illustration`
- `Buck 2D` / `Giant Ant` / `Oddfellows` / `Cento Lodigiani` / `Polynoid`
- Brand domains: wellness / meditation / health / education / kids products / playful CPG

### Tier 4 — Photographic cinematic (NARROW USE ONLY)

- `documentary brand film`
- `automotive commercial`
- `cinematic narrative brand film`
- `branded documentary`
- `Apple keynote style cinematic`

**NEVER default to Tier 4.** Use only when brand domain EXPLICITLY requires photographic register.

---

## Brand-DNA material identity extraction phrases (v1.8.0, Hard Rule #16)

When extracting Material LOCK from brand essence, look for trigger phrases that suggest specific material identity:

- `wear the [X]` / `embrace the [X]` → X = material identity (BRAMBLE: "wear the thorns" → thorns)
- `[X] makes / cuts / shapes / forges` → X = material identity
- `built from [X]` → X = material identity
- `crafted in [X]` → X = material identity
- Brand domain → material extraction:
  - Energy drink → lightning / voltage / plasma current (NOT generic Y2K chrome)
  - Nootropic / cognitive → brain anatomy / neural network / synapse (NOT generic chrome bottles)
  - Perfume / fragrance → sensorial substance specific to brand (BRAMBLE: thorns; HALCYON: golden light)
  - Architecture studio → primary building material (concrete / brass / glass)
  - Music label → genre-specific physical world (vinyl / mixing console / club volumetric)

**Generic material defaults BANNED:** see Hard Rule #16 brand-DNA material identity doctrine.

---

## Editorial chrome aesthetic license triggers (v1.8.0, Hard Rule #4.1)

SECONDARY tracked monospace accents (faux-data metadata, schematic calibration labels, faux-barcode strips, EST.YEAR tags, status indicators) are PERMITTED only when brief contains:

- `editorial-tech aesthetic`
- `schematic overlays`
- `faux-data metadata`
- `tracked monospace labels`
- `faux-barcode metadata`
- `calibration overlays`
- `production bible aesthetic`
- `editorial-poster register with metadata`

Without any of these phrases, SECONDARY tracked accents are FORBIDDEN. System fall-through into "premium domain implies editorial caption chrome" is the v1.7.17 regression pattern (T2 PLINTH / T4 FERN / T4 AXIS / T5 METRICS). See Hard Rule #4.1.

---

## Music / audio brand domain (Hard Rule #7)

When brand domain is music / audio / electronic / label / DJ, apply the music BAN list. Trigger words signaling music domain:

- `music brand` / `audio brand` / `electronic` / `label` / `DJ`
- `headphones` / `speakers` (audio hardware)
- `vinyl` / `turntable`
- Real-world reference: `Spotify` / `Apple Music` / `Soundcloud` / `Beatport`
- Brand name maps to known music genre

---

## Maintenance

When a recurring batch failure traces back to a missed routing trigger:

1. Identify the phrase the model SHOULD have matched
2. Add it to the right section above
3. Reference the failure in `validated-failures.md`
4. Bump SKILL.md version (patch)

Trigger phrase lists are case-insensitive and partial-match (substring). Match against the brief AND any quoted text from user messages this turn.
