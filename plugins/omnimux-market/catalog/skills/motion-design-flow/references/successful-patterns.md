# Successful Patterns — Validated Wins

Real generations that worked. When new request matches one of these cases — repeat prompt structure, don't invent from scratch.

---

## SP1. 10s handheld charcoal animation (validated working pattern)

**Case:** Multi-beat 10s motion design reel from multi-panel storyboard reference. Hand-drawn handheld aesthetic, cinematic indie studio feel.

**Original storyboard:** 6-panel grid, 16:9 wide, cream paper bg, charcoal sketches, terracotta orange + sand palette, "Anthropic handheld drawn" style.

**Validated production parameters:**
- `generate_scene_video` with `backend="seedance"`
- `duration: 10` (NOT 15s! — more compact, more dynamic)
- `aspect_ratio: "16:9"`
- `start_image: "<storyboard asset id>"`

**Prompt structure that worked (~280 words, sweet spot):**

```
@Image1 is a storyboard reference. Render only the contents inside the panels as ONE continuous full-frame cinematic video. Do not show the storyboard layout itself.

10-second hand-drawn handheld DYNAMIC animation, fast-paced indie studio aesthetic. Charcoal and pencil sketches on warm cream paper, expressive imperfect lines. Palette: cream #E8DDC9, terracotta orange #C66834, charcoal black #1C1612.

Camera: aggressive organic handheld throughout — pronounced micro-shake, fast push-ins, sharp pans, motion blur trails. Always alive, always moving.

CHOREOGRAPHY (10 seconds, fast cuts and energetic motion):

0-2s SHOT 1: charcoal-sketched hand reaches up toward warm orange orb, radiating charcoal lines aggressively burst outward from the orb perimeter. Orb pulses with rapid breath. Camera fast push-in.

TRANSITION 2.0-2.2s: lines explode outward across frame, whip-pan motion blur.

2-4s SHOT 2: orange circle is a network hub, charcoal lines branch out RAPIDLY to sketched geometric shapes — squares, circles, triangles draw onto frame quickly. Camera continues fast push-in toward network.

TRANSITION 4.0-4.2s: lines sweep diagonally with whoosh motion blur into next.

4-6s SHOT 3: wall of hand-drawn picture frames cascading on cream paper — mountains, text scribbles, profiles, graphs SLIDE IN from edges and overlap dynamically with depth. Camera handheld push-in toward focal frame.

TRANSITION 6.0-6.2s: focal frame zooms forward, surrounding frames blur out.

6-8s SHOT 4: solo charcoal line dynamically flows across cream paper with energy, looping elegantly, gaining an arrowhead with sharp motion blur trail. Camera follows fast.

TRANSITION 8.0-8.2s: line speeds up with motion blur into final shot.

8-10s SHOT 5: massive terracotta orange circle SLAMS onto cream paper with handwritten cursive script inside reading EXACTLY 'Ideas made real.' in cream/white. Charcoal radiating lines burst from circle perimeter. Camera handheld settles dynamically.

NO autosubs. NO captions. Generate without subtitles.
```

### Why it worked — extracted principles

**1. SHORT single anti-grid clause in first line.** One simple phrase — "@Image1 is a storyboard reference. Render only the contents inside the panels as ONE continuous full-frame cinematic video. Do not show the storyboard layout itself." — beat long bureaucratic lists of rules that the model ignored. Counter-intuitive but validated: multiple anti-grid repeats → model drowns in rules, forgets choreography.

**2. 10s, 5 shots × 2s — optimal duration for multi-beat motion.** Better than 6×2.5s in 15s. Each shot long enough to read, transitions sharp.

**3. Drop weakest shot.** Original storyboard had 6 shots, including close-up drawing hand with pencil (anatomy-heavy). Removed that shot — quality > completeness. AI draws hands poorly in close-up, better not give model a chance to fail.

**4. Aggressive verb language.** SLAMS / BURST / EXPLODE / RAPIDLY / SLIDE IN — concrete energy verbs give Seedance clear signal about motion intensity. "Smoothly transitions" → generic. "BURST outward" → punchy.

**5. Fast 0.2s transitions with motion blur.** Whip-pan / motion blur trail / diagonal sweep / zoom-forward + blur — film-grade transition vocabulary. Not "cuts" but concrete camera moves.

**6. Handheld camera throughout — massive style firepower.** Aggressive handheld masks AI imperfections (frame jitter scans like operator shake, micro-glitches read as charcoal grain). Indie animation studio aesthetic — this is "quirks = feature" mode.

**7. Total 250-300 words.** Sweet spot from choreography.md. Detailed enough for shot-by-shot, not so much that model loses focus.

### When to use SP1

- Multi-beat motion reel 10s
- Storyboard reference with 5-6 panels
- Hand-drawn / illustrated / charcoal / sketchy aesthetic
- When style is forgiving to imperfections (not sharp branded typography)
- When there's 1 final text moment in shot 6 (single text string OK, not more)

### When NOT to use SP1 as-is

- Sharp brand typography with pixel-locked text — SP1 handheld camera will distort text, need GRAPHIC OVERLAY MODE template instead
- 15s+ duration — add shots only if style consistent + minimal text
- Multiple text strings (>1) — recommended bottom-up pipeline (separate keyframes + MDC2 workflow)

---

## Anti-pattern correction logged from SP1

**Old skill recommendation (troubleshooting P1):**
> "Storyboard reference fallback: explicit instruction in first line + 5 repeats anti-grid through SKILL.md and prompt-templates T2"

**Updated skill recommendation:**
> "ONE simple phrase in first line. PERIOD. Multiple anti-grid repeats counterproductive — model drowns in rules and ignores choreography. See SP1 for validated working clause."

**Reason:** Session had 3 attempts on this storyboard — first 2 with long bureaucratic anti-grid rule list, both failed (Seedance showed grid in output). Third with SHORT clause + focused choreography — success. Empirical evidence > intuition.

---

## SP5: Premium Halftone B&W + Hyperkinetic + Match-Cut Transitions + Male VO

### Context

15-second premium audio brand reel in dithered halftone B&W aesthetic (Joy Division Unknown Pleasures style) with unusual combination:
- Halftone B&W aesthetic (usually pairs with slow elegant motion)
- Hyperkinetic chaos camera (usually pairs with color-rich brand reels)
- Combined → unique signature look where halftone smear on whip-pans gives premium texture
- Male calm authoritative gravitas VO for editorial documentary feel
- 5 dramatic match-cut transitions (object morph / push-through / collapse / morph / unfurl)

### What worked

- **Halftone hyperkinetic combo** — first validated combination. Joy Division aesthetic + Marvel intro pace = signature premium look. Halftone smear on whip-pan transitions = unique texture unobtainable with color-rich aesthetics.

- **Strict 1-bit B&W discipline** — multiple explicit clauses ("NO color, NO grayscale gradients, only pure black + white halftone dot patterns") keep model from drifting into regular grayscale on motion blur.

- **Male calm authoritative VO + chaos motion** — gravitas balances visual chaos. If energetic creator VO + chaos = too much energy. Authority + chaos = premium controlled drama.

- **5 match-cut transitions instead of generic whip-pans** — each transition has conceptual logic (orb-to-face, through-the-head, tunnel-collapse, cube-to-infinity, infinity-unfurl). Premium signature aesthetic.

- **Tight VO pacing** — ~16 words / 13.5s = 1.5 wps premium contemplative pace. Each phrase 2-3 words, period beats for breath. "Sound takes form. / Yours. Finally heard. / Built to elevate. / Engineered without compromise. / Endless possibilities. / Hear differently."

### Production parameters validated

- `generate_scene_video` with `backend="seedance"`
- `aspect_ratio: "16:9"`
- `duration: 15`
- `generate_audio: true`
- `start_image: "<storyboard asset id>"`
- 2 takes for variety (signature look high variance)
- Enhanced sandwich anti-grid pattern
- Tail pause 13.7-15s

### When to use SP5

- Premium audio / luxury tech / editorial brand reels requiring gravitas + signature texture
- Halftone B&W aesthetic with hyperkinetic energy demand
- Documentary-tier brand storytelling (Apple TV+ / Netflix doc / Patek Philippe ad reference)
- Reels where each transition should be a "wow" moment not just visual blur

### When NOT to use SP5

- Color-rich brand reels (halftone discipline kills color palette work)
- Light playful brands (gravitas tone too heavy)
- Tutorials or infographics (match-cut transitions overkill for UI/data)

---

## SP6: Liquid Illustrated Motion + Editorial Poster Animation

### Context

15-second hand-drawn brand reel in psychedelic ink illustration aesthetic (Saul Bass / Milton Glaser / A24 poster art) with:
- Strict 3-color palette (cream paper + black ink + pink accent)
- Liquid ink motion (motion from illustrated elements inside frame, NOT camera)
- 5 ink-driven dramatic transitions (organic shape morphs, not cuts)
- Male calm authoritative gravitas VO for editorial premium feel

### What worked

- **Liquid illustrated motion as philosophy** — fundamental shift from "camera moves through scene" to "scene moves while camera holds steady". Hyperkinetic camera shake kills hand-drawn aesthetic. Motion from ink shapes themselves gives "poster comes alive" vibe instead of "camera flies through illustration".

- **Strict 3-color discipline** — explicit hex codes (#F5EDDF cream / black / #F5A89C pink) + multiple "NO additional colors" clauses keep model from introducing other colors on motion blur.

- **Bold display typography + ink-bleed text reveals** — heavy condensed sans-serif (Druk Wide / GT America Black reference) with subtle ink-bleed effect on text reveal — signature poster art aesthetic.

- **Ink-driven transitions** — 5 organic shape morphs between shots (ink reorganizes into profile silhouette → spiral → runner → typography → brand lockup). Each transition flows organically, not cut.

- **Male gravitas VO + poster aesthetic** — editorial gravitas voice elevates visual poster aesthetic. Energetic creator voice was too modern for retro 1960s psychedelic vibe. Whisper too intimate. Gravitas hits perfect editorial luxury note.

### Production parameters validated

- `generate_scene_video` with `backend="seedance"`
- `aspect_ratio: "16:9"`
- `duration: 15`
- `generate_audio: true`
- `start_image: "<storyboard asset id>"`
- 2 takes for variety (illustrated motion high variance)
- Enhanced sandwich anti-grid pattern
- Tail pause 13.7-15s

### When to use SP6

- Editorial poster brand reels (Saul Bass / Milton Glaser / A24 visual identity)
- Psychedelic ink illustration aesthetic
- Screen-print zine / woodblock print motion
- Hand-drawn 2D artwork "coming alive" reels
- Brand reels requiring timeless poster aesthetic instead of trendy hyperkinetic energy
- **Meditation / mindfulness / wellness brands with editorial ink illustration aesthetic** — black ink on cream paper, bold silhouettes, organic ink shape-morphs, male gravitas VO. Validated: SOLACE meditation brand, cream #F5EDDF + black ink + pink accent #F5A89C, 5 ink-driven shape-morph transitions, pipeline clean on first run. Key difference vs SP8: SP6 is for brands where editorial *poster gravity* is the identity (ink drama, bold silhouettes, contemplative typography panels); SP8 is for softer *botanical flat-illustration* wellness palettes (terracotta, sage, muted earth tones).

### When NOT to use SP6

- Photorealistic product reels (illustration aesthetic doesn't match)
- Tech / SaaS demos where visual modernity needed
- Reels where user expects camera dynamics — liquid illustrated motion may read as "static" if viewer doesn't understand aesthetic philosophy
- Multi-aesthetic brand reels — liquid illustrated motion needs sustained illustrated composition

---

## Anti-pattern correction logged from SP5 + SP6

---

## SP7: Cinematic Product Journey — Mixed Visual + Typography Panels

### Context

The highest-tier brand reels (Nike, a16z, Apple) are NOT pure product orbits. They alternate between panels where visuals carry the composition and panels where text is dominant — but text is NEVER the only thing in any panel.

This creates rhythm: visual → text-dominant → visual → text-dominant → brand lockup.

### The rule: text panels always carry a visual system element alongside the copy

A text-dominant panel is never text-on-void. The brand's signature animated element (particles, geometry, ink, ASCII shapes, architectural form, etc.) must occupy meaningful visual space in the same frame as the copy. Both coexist; neither dominates at the expense of the other.

Place text panels per chess Pattern A or B (see boards.md). Visual-only panels carry the rhythm between text moments.

### How to specify a text-dominant panel correctly

```
Panel [N]:
Text: "[2-4 word punch]" — [font character], fills [X]% of panel at [position]
Visual element: [brand signature element — particle burst / ink geometry / architectural form] — occupies [Y]% of panel, same visual plane as text
Both coexist in the frame.
```

Example (good): `Panel 03: Bold white 'THINK FIRST.' fills left 55% of frame. Behind and overlapping the text: fragmented compass rose ink geometry — the same compass from panel 01, now dissolving and reforming around the letterforms. Text reads clearly but the ink system is visibly present.`

### When to use SP7

- Any product brand reel (sneakers, tech, app, gadget)
- Any manifesto-style company reel (fintech, SaaS, startup)
- Any reel where "energy and rhythm" is requested
- Whenever user shows Nike/a16z/Apple style references

### AI Clichés to AVOID in visual panels

These are default AI outputs that signal "cheap render" — ban them from prompts:

- ✗ Glowing particles floating in black void
- ✗ Wet asphalt with neon reflections
- ✗ Wireframe rotating cube/sphere in void
- ✗ Generic digital tunnel / corridor
- ✗ Abstract particle cloud with no subject

Replace with:
- ✓ Actual product in dramatic cinematic lighting
- ✓ Human figure in scale with environment (tiny person, vast space)
- ✓ Metaphorical physical objects (staircase, portal, globe, arrow)
- ✓ Bold pure-color backgrounds with geometric shapes
- ✓ Real-world texture: concrete, sand, steel, fabric

---

### Old assumption (camera-vocabulary.md original)
> "Hyperkinetic chaos = max chaos brand reels. Slow elegant = premium. Don't mix camera modes within one reel."

### Updated insight from SP5 + SP6
> "Some signature aesthetics emerge from UNUSUAL camera mode combinations:
> - Halftone B&W (slow elegant aesthetic) + Hyperkinetic chaos camera = SP5 signature
> - Editorial poster (suggests slow camera) + Liquid illustrated motion (NEW Mode 5) = SP6 signature
>
> The rule isn't 'don't mix' — it's 'understand WHY a combination works'. Mixing for variety is bad. Mixing for signature aesthetic emergence is the highest tier of motion design."

---

## SP8: Flat Illustrated Wellness / Meditation Brand Reel — No VO

### Context

15-second wellness meditation brand reel in Anthropic editorial flat illustration style with:
- Strict 3-color palette (terracotta + cream + sage green)
- Mode 1 + Mode 5 blend (Slow Elegant camera + Liquid Illustrated Motion)
- Botanical illustrated elements animate within frame — NOT hyperkinetic camera
- Ambient SFX only, no voiceover, no music
- Organic shape-morph transitions (concentric rings ripple → orb unfurls → leaves collapse → typography bloom)

### What worked

- **Mode 1 + Mode 5 blend for illustrated wellness** — key insight: flat illustrated reels should NOT use Mode 4 (Circular Orbital), even though wellness genre is listed as a Mode 4 use case. Circular orbital camera feels cinematic/live-action and conflicts with "poster comes alive" flat illustration aesthetic. Mode 5's philosophy — scene moves while camera holds steady — is the correct choice when the aesthetic is flat illustration, not photorealistic 3D.

- **Strict 3-color discipline with flat illustration** — explicit hex codes (#C8614A terracotta / #F2EBD9 cream / #7B9E87 sage green) held cleanly through all 6 shots with no color drift. Botanical motif (sage leaves, sprigs, circle marks) unified the composition across shots.

- **Organic shape-morph transitions between illustration states** — circles expanding into the next shot, botanical leaves reorganizing into landscape geometry, landscape collapsing into typography. Matched the illustrated medium naturally, no cinematic camera-based transitions needed.

- **Typography panel (Shot 5) as rhythm break** — placing a pure typography panel at 0:10 after 4 illustration shots gives the reel a punch-moment before the brand lockup. Same SP7 rhythm principle applies inside an illustrated palette.

- **Ambient SFX only for no-VO meditation** — bowl resonance + wind tones + nature ambience sits cleanly under motion. Set `generate_audio: true` in params, explicit Audio clause in prompt. Clean result.

- **Silent tail pause 13.7–15s** — brand lockup holds static for clean edit tail. Critical for any outro with a wordmark.

### Production parameters validated

- `generate_scene_video` with `backend="seedance"`
- `aspect_ratio: "16:9"`
- `duration: 15`
- `generate_audio: true`
- `start_image: "<storyboard asset id>"`
- Storyboard via `generate_image`, `aspect_ratio: "3:2"`, `resolution: "2K"`
- Short single anti-grid clause (SP1 validated pattern)
- Tail pause 13.7–15s

### When to use SP8

- Wellness, meditation, mindfulness, yoga, mental health brand reels
- Flat illustrated aesthetic (Anthropic editorial, geometric illustration, botanical motif)
- No-VO versions of any illustrated brand reel — ambient SFX only
- 3-color discipline palette (earth tones, botanical palettes, muted pastels)
- Any brief that says "flat illustrated", "no photography", "poster-comes-alive", "clean geometric"

### When NOT to use SP8

- Photorealistic wellness / spa reels — use Mode 1 (Slow Elegant) with cinematic photography aesthetics instead
- Wellness reels with voiceover — sub in whispered ASMR or gravitas VO per voice-over-patterns.md, but keep Mode 5 camera if style is illustrated
- High-energy fitness / sport wellness — Mode 2 (Hyperkinetic) regardless of palette
- Circular narrative arc (character transforms, journey story) — Mode 4 (Circular Orbital) is correct there even for wellness; SP8 is palette + illustration style dependent, not genre-only

### Key correction to mode selection guide

**Old rule:** Wellness / mental health → Circular Orbital (Mode 4) + Slow Elegant (Mode 1)

**Updated rule:** Wellness / mental health split by aesthetic:
- **Flat illustrated / botanical / editorial** → Mode 1 + Mode 5 (SP8)
- **Cinematic / photorealistic / character journey** → Mode 4 + Mode 1 (original)

---

### Old assumption (transitions section)
> "Use whip-pans, glitch wipes, light bursts for dynamic transitions"

### Updated insight from SP5 + SP6
> "For PREMIUM signature reels — use conceptual match-cut transitions instead of generic visual blurs. Each transition should have logic (object morph / push-through / collapse / morph / unfurl). Not all reels need this — quick brand reels OK with whip-pans. But premium production quality demands conceptual transitions."

---

## SP9: Hyperkinetic Sport / Athletic Brand

### Context

15-second sport/athletic brand reel — generic athletic performance aesthetic in a bold saturated single-color palette (signature crimson red / electric blue / etc) with white and black accents. Photorealistic athlete in motion + product macro shot, dramatic athletic photography lighting + motion blur. Bold italic chunky condensed sans-serif typography. Text panels follow chess Pattern A or B per the standard rule (see boards.md).

### What works

- **MAXIMUM CHAOS DYNAMIC CAMERA** — hyperkinetic fly-throughs at speed, violent whip-pan transitions with motion blur, barrel-rolls, dramatic speed ramps from slow-mo at peak athletic moments to LIGHTNING FAST on transitions, stutter cuts with brief time-freeze on impact moments.
- **Per-shot transition with bass impact + whoosh SFX** — every shot ends with VIOLENT GLITCH WHIP-PAN / DRAMATIC STUTTER CUT / WHIP-PAN with light burst.
- **No real brand IP** — explicit verbatim guarantee in prompt: "NO real brand marks, NO swoosh logos, generic athletic design only".
- **Tail freeze 1-1.5s** — camera holds last frame static for clean edit handle.

### Production parameters validated

- `generate_scene_video` with `backend="seedance"`
- `aspect_ratio: "16:9"` (or `"9:16"` for Reels)
- `duration: 15`
- `generate_audio: true`
- `start_image: "<storyboard asset id>"`
- Enhanced sandwich anti-grid pattern (full paragraph, not single line — see clip-prompt template)
- 1.3s mandatory silent tail pause

### When to use SP9

- Sport / athletic / performance brand reels (sneakers, apparel, fitness equipment)
- Any "hero athlete in action + product macro" brand brief
- Bold saturated mono-color palette + motion blur photography aesthetic
- When the brief calls for "Nike-style energy" but with completely original IP-clean assets

### When NOT to use SP9

- Premium luxury / contemplative brands → use SP5 or SP6
- Wellness / atmospheric → use SP8 or SP13
- Tech / SaaS / AI → use SP10
- When the brief calls for narrative storytelling — SP9 is energy-driven, not story-driven

---

## SP10: Hyperkinetic Tech AI Brand (Apple keynote × Marvel intro)

### Context

15-second premium tech/AI brand reel for an app or platform. Pure black backgrounds with vibrant neon accent palette (signature lime / electric blue / deep purple / magenta highlights / white sparkles). 3D glass and chrome rendered app icons floating in space, hero brand icon at center, realistic studio-lit hand interactions. Premium editorial sans-serif + light italic serif typography mix. Apple keynote × Marvel intro × Behance hero promo production value.

### What works

- **Hand interaction shots** as anchors — hand cradling icon constellation (S1), hand pinching hero icon between thumb+index (S3), open palm holding floating hero icon with vertical light beam (S5). Real human warmth against tech aesthetic.
- **Hyperspeed warp tunnel dive** in mid-reel — camera dives through warp tunnel of light streaks at LIGHTNING SPEED, icons whooshing past at maximum motion blur. Brief stutter-freeze at peak velocity.
- **Hero icon at center + orbital ring** — bright lime/accent app icon centered with surrounding chrome icons forming circular orbital ring with motion blur trails. Energy rings spinning around hero.
- **Per-shot DRAMATIC transitions** — VIOLENT GLITCH WHIP-PAN with prismatic flare / DRAMATIC STUTTER CUT with frame-freeze / WHIP-PAN with light-bloom motion blur / LIGHT BURST WHIP-PAN with rising synth tension.
- **Brand panel** = static calm composition with hero brand icon centered + light italic serif "[BRAND] AI" wordmark. Pure black with subtle prismatic flares in corner. Camera holds steady. Place per chess Pattern A or B; tagline only if brief gave one.

### Production parameters validated

- `generate_scene_video` with `backend="seedance"`
- `aspect_ratio: "16:9"`
- `duration: 15`
- `generate_audio: true`
- Enhanced sandwich anti-grid pattern
- 1.3s mandatory silent tail pause
- 3D rendered icons + photoreal hand integration

### When to use SP10

- AI / SaaS / creative tool brand reels
- Tech product launches with hero app icon
- Premium AAA tech production aesthetic
- When brief mentions "Apple keynote vibe" / "Marvel intro" / "Behance hero promo"

### When NOT to use SP10

- Music brand → use SP5 or hybrid
- Sport → use SP9
- Wellness → use SP8 or SP13
- Editorial poster aesthetic → use SP6

---

## SP11: Hand-Drawn Chalk Philosophy (Vertical 3:4, Whispered VO)

⚠️ **Per-shot narration template, NOT a standard 6-panel storyboard.** This pattern uses one whispered VO line per shot in a 6-shot vertical format — text density rules in boards.md do not apply here. Use this template only when the brief explicitly asks for per-shot philosophical narration. For all standard 6-panel storyboards, use Pattern A or B from boards.md.

### Context

15-second hand-drawn intimate philosophy reel in vertical 3:4 portrait format (Instagram Stories / TikTok / Reels). Hand-drawn chalk-style aesthetic on pure black background with organic imperfect white chalk line strokes drawing simple stick figures and minimal scenes. Drawing-into-existence animation feel — lines appearing in real-time. ASMR contemplative philosophy vibe. Whispered intimate VO narration throughout.

### What works

- **Vertical 3:4 portrait format** — `aspect_ratio: "9:16"`. Composition is vertical: stick figure at center frame, scene below, sky above. Or top-to-bottom narrative reveal.
- **Pure black canvas + white chalk strokes** — minimal, almost zero color, drawing-into-existence aesthetic. Lines APPEAR as if drawn in real-time. Rough imperfect strokes.
- **Per-shot whispered narrator voice line** — one short philosophical statement per shot ("You don't need more time." / "It's everywhere." / "Just stand still." / "Build what matters."). Whispered, breathy, contemplative pacing with gentle silence between.
- **Smooth chalk-redraw transitions** — "chalk lines redraw into next scene" — organic transformation between shots, not violent cuts. Mode A signature.
- **Gentle smooth camera** — subtle slow drifts, quiet breathing motion, slow zoom-ins on key moments. NO aggressive shake. Headspace / contemplative philosophy reel cinematography.
- **Off-screen narrator** — narrator is NOT visible. Stick figures in chalk drawings do NOT speak or move their mouths. The voice exists outside the frame.

### Production parameters validated

- `generate_scene_video` with `backend="seedance"`
- `aspect_ratio: "9:16"` (vertical 3:4)
- `duration: 15`
- `generate_audio: true`
- Whispered VO with breathing space between phrases
- Subtle ambient SFX: gentle chalk stroke sounds, soft paper texture, quiet wind, distant nature ambience
- NO music, NO soundtrack, NO singing

### When to use SP11

- Philosophy / mindfulness / motivational content for short-form vertical platforms
- Brands selling presence, focus, slow living, attention reform
- When the brief calls for ASMR / Headspace / philosophy reading aesthetic
- Stick-figure / minimal illustration concept

### When NOT to use SP11

- Premium product reveals → use SP10 or other Mode B
- Sport → use SP9
- 16:9 horizontal formats → adapt SP1 charcoal handheld instead
- Energetic high-impact brands

---

## SP12: Minimalist Geometric Philosophy (Alternating Visual/Typography)

### Context

15-second minimalist geometric philosophy reel on pure black with clean white thin lines, circles, dots, small geometric shapes (NOT hand-drawn chalk — clean precise vector-style line work). Modern sans-serif typography (Inter / Helvetica class). ASMR contemplative philosophy vibe with whispered intimate VO. Alternating typography/visual shot structure.

### What works

- **Alternating shot structure** — odd shots = visual only (single dot / network constellation / sun rising), even shots = typography + abstract icon (left side text "Mastery / lives / forward.", right side white arrow). 6 shots = 3 visual + 3 typography. Solves "atmospheric without narrative" failure mode.
- **Long contemplative silent pauses between voice lines** — visual-only shots have NO voiceover, ambient drone only. Voice arrives only on typography shots. Silence is structural element.
- **3-line text spec format** — `typography reads EXACTLY 'Mastery' on first line + 'lives' on second line + 'forward.' on third line, white sans-serif`. Multi-line breakdown enforces exact glyph rendering.
- **Per-shot single voice line** + visual-only shots between — ASMR pacing with structural silence.
- **Smooth fade transitions** — Mode A signature. No violent whip-pans.
- **Subtle slow camera drifts** — drift right following arrow / slow zoom-in toward network / gentle drift upward / slow zoom-out settling. Each shot has gentle motion, never static.

### Production parameters validated

- `generate_scene_video` with `backend="seedance"`
- `aspect_ratio: "16:9"`
- `duration: 15`
- `generate_audio: true`
- Whispered intimate VO with long silences between
- Subtle ambient SFX: gentle hum, soft breath, quiet drone tones

### When to use SP12

- Philosophy / mindfulness / contemplative brand reels
- Tech brands wanting "calm intelligent" tone (NOT hyperkinetic)
- Editorial premium minimalism (Apple TV+ documentary feel)
- When alternating typography/visual structure suits the message
- Atmospheric reels that need narrative anchor through text

### When NOT to use SP12

- High-energy brands → use SP9 or SP10
- Hand-drawn aesthetic → use SP1 or SP11
- Color-rich brand worlds (SP12 is strict B&W)

---

## SP13: Hybrid Handdrawn Pastel + Hyperkinetic Camera (Wellness with Energy)

### Context

15-second handdrawn pastel/chalk illustrated wellness brand reel with HYPERKINETIC camera energy. Hybrid mode — Mode A aesthetic (handdrawn organic illustration, soft chalk pastel and colored pencil texture, hand-painted feel) + Mode B camera (hyperkinetic fly-throughs, violent whip-pans with chalk smear effects, dramatic speed ramps). Vibrant rainbow palette. Studio Ghibli meets Spotify Wrapped meets Headspace. Generic unbranded product (NO real brand logos) + black silhouette human figure with soul-glow at chest.

### What works

- **Hybrid mode legitimacy** — handdrawn aesthetic + hyperkinetic camera is NOT a contradiction when documented. Maintains wellness emotional warmth WHILE delivering energy and dynamism. For wellness brands that need "alive" not just "calm".
- **Black silhouette figure with stars inside body + chest glow** — anchor character device. Same figure across all 6 shots in different poses (contained / reaching / receiving / floating). Visual continuity.
- **Hand-painted typography** — white chalk-textured typography integrated into the illustration plane, hand-drawn organic feel rather than slammed-in graphic copy. Place per chess Pattern A or B with size/position variation across panels.
- **Per-shot dramatic transitions** with chalk smear / pastel-bloom / paint-splash effects — Mode B transitions but maintaining handdrawn aesthetic.
- **Cosmic dark green-teal background** with rainbow swirl edges — wellness palette with dramatic depth.
- **Generic unbranded product** — explicit guarantee in prompt: "NO real brand logos, generic [product type] design only".

### Production parameters validated

- `generate_scene_video` with `backend="seedance"`
- `aspect_ratio: "16:9"`
- `duration: 15`
- `generate_audio: true`
- Ambient SFX: cinematic whooshes, water-splash, soft chime impacts, wind tunnel ambience for swirl, bass drops
- 1.3s mandatory silent tail pause
- NO music, NO voiceover

### When to use SP13

- Wellness / lifestyle / drinks / supplements brand with emotional warmth requirement
- When brief calls for "Spotify Wrapped style" / "Headspace meets Apple TV+"
- Brands selling inner peace + energy combination
- When pure SP8 (slow elegant illustrated) feels too quiet for the brief

### When NOT to use SP13

- Tech / corporate / clinical → use SP10 or other Mode B
- Pure meditation / contemplative → use SP8 or SP11
- Sport → use SP9
- Hand-drawn aesthetic without energy → use SP1 charcoal
