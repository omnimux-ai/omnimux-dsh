# B2B SaaS Dark-Cinematic Executive Arc

A 4-beat narrative pattern for premium 30-second video ads targeting regulated-industry executives. The creative DNA: **calm authority + visual contrast + product-as-proof + frictionless CTA**. The product and brand are always swappable; the structure, tone, and visual grammar stay locked.

---

## 1. When to use this pattern

**Best fit:**
- Enterprise SaaS platforms in regulated verticals (fintech, insurance, healthcare, legal tech, GRC)
- Audience: Heads of Risk, Compliance, Model Validation, CROs, CTOs — skeptical, time-poor, politically exposed
- Platform: LinkedIn, YouTube pre-roll, conference loops, investor decks with embedded video
- Products whose core value is *defensibility*, *auditability*, or *reducing regulatory/operational risk*

**Poor fit:**
- Consumer brands or prosumer apps
- Products with a warm, aspirational, or lifestyle positioning
- Campaigns that need on-camera founders/users or UGC authenticity signals
- Fast-cut social-native content (TikTok, Reels) — pacing is too deliberate

---

## 2. Hook & Opening (Beat 1 — ~5 seconds)

**Structural move: Regulatory tension statement (Pattern interrupt via implied threat)**

The hook names the specific operational/regulatory pressure the audience lives with, stated flatly, with no editorializing. No question mark. No hype. It lands like a sentence in a board report.

**Invented generic example (neutral hypothetical product):**
> *"The audit clock starts the moment you go live."*

**Swap rule:** Replace the regulatory pressure noun (regulators / auditors / examiners / risk committees) and the operational noun (models / decisions / portfolios / approvals) for the new product's domain. Keep the flat declarative form. Keep the implicit threat of being *behind*.

**Visual grammar for Beat 1:**
- Dark background (near-black or deep navy), minimal scene — a single executive figure, an empty boardroom, or abstract data environment
- No text overlay competing with the spoken line — a brief hook overlay (block style, lower-third) may appear *after* the line lands, not simultaneous
- Camera: locked-off or very slow push-in
- No music swell yet; score sits very low (0.05–0.10 volume)

---

## 3. Narrative Arc — Beat-by-Beat

Total target: **30 seconds**. Four beats, hard ratios.

| Beat | Name | Duration | Visual Move | VO Pacing | Score |
|------|------|----------|-------------|-----------|-------|
| 1 | Hook / Tension | 5s | Single dark scene, exec environment | 2.5–3.5 w/s | Very low |
| 2 | Chaos → Order | 7s | Multi-cut: fragmented/manual state [Hard cut] → product in control | 2.5–3.0 w/s | Low, rising |
| 3 | Proof / Product | 15s | UI detail shots + authority environment (boardroom, trading floor, compliance room); multi-cut [Hard cut] between UI and context | 2.7–3.2 w/s | Moderate ambient |
| 4 | End Card | 3s | Logo on dark background, tagline, CTA line | Silent (no VO) | Muted or silent |

**Arc shape:** *Quiet dread → implied disorder → product resolves → authority symbol*

**Beat 2 — Chaos→Order move:**
Show the *before* state (fragmented spreadsheets, manual processes, alert fatigue, compliance chaos) for ~2–3s, then [Hard cut] to the product in a clean, controlled state. The visual contrast does more work than the VO here.

**Beat 3 — Proof:**
Let the product UI occupy significant screen time. Cut between close-up UI cards / dashboards and the authority environment (boardroom, executive meeting, regulatory review context) to signal real-world consequence. VO here carries the density of the value proposition — keep sentences tight, no filler phrases.

**Beat 4 — End Card:**
Logo only. Tagline below. CTA line at bottom. Silence or very low ambient pad. No VO, no captions. If the brand supplied an official logo asset, use it directly (product reference input) to preserve exact fidelity — do not attempt to recreate or stylize.

---

## 4. Visual Style Spec

**Palette:**
- Primary: A deep navy to near-black base tone (use the brand's own dark base if supplied)
- Accent: A single cool electric blue / cyan highlight — used sparingly for UI highlights, on-screen text accents, data visualizations
- Prohibited: Warm tones (amber, orange, beige), bright white backgrounds, green
- No stock-photo smiles, no casual/lifestyle imagery, no founder selfies

**Camera grammar:**
- Locked-off or imperceptibly slow push-in for executive/environment shots
- Tight, purposeful reframes on UI close-ups (not handheld shake)
- No whip-pans, no speed ramps, no lens flares
- 16:9 cinematic framing throughout

**Shot length distribution:**
- Beat 1: 1 shot, full 5s
- Beat 2: 2–3 shots, ~2–3s each with hard cuts
- Beat 3: 3–5 shots, ~2–5s each; UI cards may hold longer if content-dense
- Beat 4: 1 static image, 3s

**On-screen text policy:**
- Font: Oswald, uppercase, weight 600+
- Placement: Lower-center zone (avoid covering executive faces or key UI elements)
- Color: White for standard overlay copy; the cool accent color for a single key accent phrase per scene
- Text overlays carry *storyboard copy* (restate the scene's thematic claim) — they do NOT duplicate the VO line verbatim
- End card: mute_captions = true (no auto-captions over logo card)
- Caption preset for VO: deep-blue background strip, DM Sans font, sentence case

**Hook overlay (Beat 1 only):**
- Block style (solid background chip)
- Lower-third placement — must not cover the executive's face
- Appears after the spoken hook line settles (~2–3s in), not at frame 0

---

## 5. Voice & Persona

**Persona archetype: Calm-authoritative narrator (voice-only)**
- No on-camera speaker. Narrator-only (`voice_only: true`)
- Voice profile: Middle-aged male, executive register — the voice of a senior partner or chief risk officer, not a pitchman
- Tone: Measured, slightly grave, zero enthusiasm, zero uptalk
- Pacing: 2.7–3.2 words/second across the full VO; never rush, never trail off

**Prohibited voice qualities:**
- Hype / excitement inflection
- Consumer ad "announcer" cadence
- Rising intonation at end of statements
- Filler phrases ("So, basically…", "What if I told you…")

**Sample-line phrasing register (invented, generic):**
- "The audit clock starts the moment you go live." ✓
- "Every decision arrives with the evidence to defend it." ✓
- "Ready before the question is asked." ✓ (short, declarative, present-tense)
- "Discover the amazing platform that transforms your workflow!" ✗

**VO word-count validation (do this before dispatching directors):**
Divide scene VO word count by scene duration in seconds. Target 2.5–3.5 w/s per scene. Adjust script if any scene falls outside this range.

---

## 6. CTA Mechanic

**Pattern: Low-friction exclusivity pilot**

The CTA is spoken at the close of Beat 3 (final VO line) and echoed as static text on the Beat 4 end card.

**Structure:** `[Action verb] + [low-friction commitment noun] + [implied exclusivity or limited access]`

**Invented generic example:**
- Spoken (end of Beat 3): *"Request your design-partner slot."*
- On-screen (Beat 4 end card): `Request your design-partner slot` + brand website URL

**Swap rule for new products:** Keep "apply for" or "request" (not "sign up" or "get") — it signals selectivity. Replace the entry-point noun with the equivalent controlled-access path ("founding pilot", "early access", "design partner cohort", "validated deployment"). Never use "free trial", "demo today", or "get started" — too consumer.

---

## 7. Hard Rules / Do-Not-Regress

Preserve these decisions in any adaptation:

1. **No on-camera talent with casual or positive expressions.** Even if a founder photo exists in brand assets, do not use it. Smiling/casual images are excluded by default — this is a hard creative constraint for regulated-industry buyers.

2. **Official logo asset must be used verbatim on end card.** If the client supplies a logo file, use it as a product reference input for the image end card director call. Do not attempt to recreate or stylize the logo — fidelity to the supplied asset is non-negotiable.

3. **VO pacing must be validated per-scene before any director dispatch.** Do the w/s math explicitly. Do not approximate. Scenes that run over 3.5 w/s will feel rushed against cinematic shot lengths; scenes under 2.0 w/s will feel padded.

4. **End card is a static image, not video.** Use `output_type: image` for the end card director call. It assembles faster, holds logo fidelity better, and gives the viewer a clean resting frame.

5. **Music at 0.10 volume or below.** The score is a textural foundation, not a presence. It must never compete with the narrator VO. Mute entirely on the end card.

6. **No warm tones anywhere.** Not in scene backgrounds, not in UI color grades, not in text overlays. If a reference image contains warm tones, direct away from them.

7. **Text overlays are thematic, not VO transcriptions.** Each scene's on-screen text states the scene's *claim* in its own words. It is not a subtitle. Captions handle VO transcription separately.

8. **Hook overlay must not cover the executive face.** Lower-third placement is mandatory. If the scene composition places a figure in the lower third, use a subtitle-zone placement below the safe zone instead.