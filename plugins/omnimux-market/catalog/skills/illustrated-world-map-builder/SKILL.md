# Illustrated World Map Builder

## 1. When to use this pattern

**Use for:**
- Generating or regenerating the brand's campus illustration (full campus or individual buildings)
- Extending the campus with new buildings or locations
- Creating individual room/interior illustrations for each character's location
- Assembling the final composite world-map deliverables (clean base + full panel version)
- Any request referencing "the campus," "the academy map," "the world map," or specific campus buildings by name

**Not suited for:**
- Generic city-map or isometric illustration tasks unrelated to this brand universe
- Character portrait or fashion illustration (different visual system)
- Other brands — this skill is tuned to one brand's exact spelling rules and brand constraints

---

## 2. Visual Style Spec

**Core aesthetic:** Crisp modern premium illustrated city map / AAA game-map aesthetic. Think product-quality illustrated map you'd find inside a collector's edition game box or a luxury brand lookbook.

**NOT:**
- Painterly or watercolor — explicitly ban in every prompt
- Heavy brush strokes or impressionistic texture
- Street-level perspective (this is aerial/bird's-eye)

**Spec:**
- **Perspective:** Aerial isometric bird's-eye, tilted slightly (≈ 30–45° elevation). Anchor with the phrase "aerial bird's-eye isometric" in every generation prompt.
- **Lighting:** Warm golden-hour lighting across all buildings
- **Linework:** Sharp, clean, precise. Vibrant colors with clear architectural definition.
- **Camera grammar:** Locked-off overhead isometric. No handheld drift. No perspective warp.
- **Color palette:** Warm cream/sandstone for main academy, dark slate for auditorium roof, red brick for the academic hall, orange-cream for café awning, glass/teal for off-campus venue
- **Aspect ratio:** Always 16:9, resolution 2K or higher
- **Model:** gpt-image-2 (better than alternatives for architectural text rendering and map precision)

**Every generation prompt must include:**
```
Crisp modern premium illustrated city map style, AAA game-map aesthetic, NOT painterly, NOT watercolor, NOT heavy brush strokes, sharp clean linework, vibrant precise colors, aerial bird's-eye isometric perspective, warm golden-hour lighting
```

---

## 3. Brand & Spelling Rules (HARD)

The brand name has a commonly-mis-rendered spelling. The model's default completion tends to "correct" it toward the conventional spelling, so the exact brand spelling MUST be pinned in every prompt that mentions the brand name.

| Correct | Wrong — never use |
|---|---|
| THE BRAND NAME (all caps) | the model's auto-corrected spelling |
| The brand name (title case) | the model's auto-corrected spelling |
| THE FULL ACADEMY NAME | the auto-corrected full name |
| stylized logo variant (logo contexts only) | the auto-corrected spelling (any context) |

**Rationale:** The AI default completion tries to "fix" the brand spelling — it must be overridden explicitly in every prompt that mentions the academy name. Include the full correct spelling in the prompt even when it feels redundant.

---

## 4. Campus Building Specifications

These are locked. Do not deviate without explicit user approval.

### Main Academy Building (center)
- Grand classical columns
- Engraved full academy name on facade frieze
- Ornate monogram medallion crest in courtyard
- Iron gates, cherry blossom tree, street lamps

### Auditorium (right of main building)
- SOLID dark slate/black modern roof — NO glass, NOT transparent, NO glass ceiling, NO glass roof (this is the hardest constraint to hold — repeat in every prompt)
- Grand floor-to-ceiling lobby windows on street facade (lobby concept visible from outside — windows yes, glass roof no)
- Ornate "AUDITORIUM" lettering on facade

### Academic Hall (left of main building)
- Classic red brick academic building

### Broadcast Tower (top center)
- Tall metal antenna/broadcast tower structure

### Recording Studio (lower center)
- Ground-level studio space

### Campus Café (lower-left)
- Orange-cream striped awning
- NO storefront sign text on exterior
- Solid-roofed atrium extension with large arched side windows

### Off-Campus Venue (lower-right)
- FULL glass walls AND glass ceiling — both, explicitly stated
- Glowing warm interior visible through glass
- Clearly separated from campus across a wide road (physical separation is important)

### Prompt fragment for building constraints:
```
Auditorium: solid dark slate/metal roof, NO glass ceiling, NO glass roof, NOT transparent roof.
Off-campus venue ONLY: full glass walls AND glass ceiling, glowing warm interior, separated from campus by wide road.
Campus café: orange-cream striped awning, solid roof, NO sign text on exterior.
```

---

## 5. Generation Pattern

### Always generate TWO versions in parallel:

**Version A — Labeled (with callout boxes):**
- Location label callout boxes with building names
- Annotation lines pointing to each building
- Used in the full composite deliverable

**Version B — Clean (no labels):**
- Explicitly say: "NO text labels, NO callout boxes, NO annotation lines"
- Used as the clean base layer for designers

### Image-to-image continuity:
- Always reference the prior approved campus version as image_urls for I2I continuity
- Current approved reference: product:campus-map-v5 (labeled), product:campus-map-v5-clean (clean)
- Update these references as new approved versions are established

### Prompt structure template:
```
[STYLE ANCHOR: crisp modern premium illustrated city map, AAA game-map aesthetic, NOT painterly,
NOT watercolor, NOT heavy brush strokes, sharp clean linework, vibrant precise colors,
aerial bird's-eye isometric perspective, warm golden-hour lighting]

The brand's campus map. The academy name on the main building reads
exactly the brand's correct spelling — NOT the model's auto-corrected spelling.

Buildings: [paste building specs from Section 4]

[For labeled version]: Include location label callout boxes for each named building.
[For clean version]: NO text labels, NO callout boxes, NO annotation lines on the illustration.
```

---

## 6. Composite Assembly (Python/PIL)

Two final deliverables are assembled via Python/PIL script. Measurements are locked to the approved reference layout.

### Canvas
- Size: 2560 x 1440 px (16:9)

### Output 1 — Clean World Map
- Campus illustration (clean version) at full 2560x1440
- No overlays, no character panel
- Purpose: designer base layer

### Output 2 — Full World Map (composite)
```python
SPLIT_X = int(2560 * 0.645)  # approx 1649px

# Left panel  (0 to SPLIT_X):    Campus illustration — labeled version, cropped/scaled to fill
# Right panel (SPLIT_X to 2560): Character roster panel — cropped from reference composite
```

### Overlay layers (applied on top after panel split):
```python
# Bottom decorative strip (bottom 210px)
# Source: torn paper edge, decorative flower, a short tagline, a small accent word
# Blend: alpha_paste at 0.97 opacity
# Source reference: input:image-16 (reference composite)

# Top sparkle strip (top 80px)
# Source: short accent words, sparkles text/graphic strip
# Blend: screen blend at 0.88 opacity

# Top-left corner accent (200x220px)
# Source: music staff lines, star graphic
# Blend: screen blend at 0.75 opacity
```

### Asset references:
| Asset ID | Description |
|---|---|
| product:campus-map-v5 | Labeled campus illustration (current approved) |
| product:campus-map-v5-clean | Clean campus no labels |
| final:world-map-clean-v2 | Output 1 deliverable |
| final:world-map-full-v2 | Output 2 deliverable |
| input:image-16 | Reference composite (source for right panel and decorative overlays) |

Update these IDs as new approved versions are produced.

---

## 7. Character Roster & Room Assignments

Each character has a home location on campus. Use this table for both map labeling and future room interior illustrations. The names below are placeholder roster slots — swap in the brand's actual character names.

| Character | Location |
|---|---|
| Character 1 | Auditorium |
| Character 2 | Auditorium |
| Character 3 | Her Bedroom |
| Character 4 | Campus Café |
| Character 5 | Her Bedroom |
| Character 6 | Recording Studio |
| Character 7 | Off-Campus Venue |
| Character 8 | Broadcast Tower |
| Character 9 | Campus Café |

### Room interior illustrations (next phase)
When generating individual room interiors, each room's visual style should match the character's aesthetic/vibe from the character roster panel thumbnails. Match the color palette and mood visible in each thumbnail. Keep the same "crisp modern illustrated" style — do not drift to painterly.

---

## 8. Hard Rules / Do-Not-Regress

Each of the following is a hard constraint learned while iterating on this map.

1. **Spell the brand name with its exact correct spelling in every prompt.** The model defaults to the conventional/auto-corrected spelling. Override it explicitly every time, even mid-session.
2. **Auditorium roof is SOLID.** "Solid dark slate/metal roof, NO glass ceiling, NO glass roof, NOT transparent" must appear in every prompt that includes the auditorium. The model repeatedly attempted to add glass.
3. **Off-campus venue has BOTH glass walls AND glass ceiling.** Specify both explicitly to distinguish it from the café atrium (which has solid roof + arched side windows only).
4. **Aerial isometric perspective must be anchored.** Without "aerial bird's-eye isometric" the model drifts to street-level perspective.
5. **Style must explicitly say "NOT painterly NOT watercolor."** Omitting this causes drift toward illustrated/painted look on regeneration.
6. **gpt-image-2 is the correct model.** Use this model specifically for architectural text legibility and map precision.
7. **Campus café has NO exterior sign text.** The storefront shows only the orange-cream awning — no text on the building facade.
8. **Always generate two versions in parallel** (labeled + clean). Sequential generation risks inconsistency between versions.
9. **Composite split at exactly 64.5% (SPLIT_X = int(2560 * 0.645)).** Do not adjust without explicit user instruction. The right panel crop was tuned to this exact split.