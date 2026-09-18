# Animated Two-Mascot Comedy Commercial — Creative Pattern

## 1. When to use this pattern

**Suits:**
- Recurring animated-mascot promotional spots built around a returning duo (primary use)
- B2B SaaS products where the value prop is a quantifiable savings/efficiency stat and the audience is a skeptical professional buyer
- Short-form (≤30 s) broadcast or pre-roll placements on YouTube, LinkedIn, CTV
- Any brief calling for an animated comedic duo in a classic-cartoon style

**Does not suit:**
- Consumer / retail products (wrong persona archetype)
- Serious/somber tone briefs
- Products without a quantifiable savings or efficiency stat to anchor the proof beat

---

## 2. Hook & Opening — "Problem Avalanche Panic"

**Archetype:** Physical-comedy problem interrupt. The everyman character is visibly overwhelmed by the tangible representation of a business pain (paperwork, clutter, chaos), establishing stakes in under 3 seconds before a word is spoken.

**Invented generic example:**
> Character A buried under an avalanche of paperwork at a cluttered desk, flailing, a coffee mug tipping dangerously, a desk gadget spinning off the edge.

**The move:** Open on Character A mid-panic. No preamble, no setup dialogue. The chaos *is* the hook. Visual comedy carries it; Character A's first spoken line names the problem aloud (e.g., "This pile of paperwork is gonna bury me alive!").

**Swap rule:** The product/problem subject changes per brief; Character A's panic animation and chaotic desk setup stay locked. Never open on a calm, composed Character A.

---

## 3. Narrative Arc

Beat-by-beat structure — target 30 seconds total:

| Beat | Label | Target Duration | Voice / Visual Tone |
|------|-------|-----------------|---------------------|
| 1 | **Comedy opener** | 0–6 s | Character A solo, warm fluorescent office chaos, physical comedy, alarmed delivery |
| 2 | **Product entry** | 6–13 s | Character B slides into frame with a device; cool monitor glow; deadpan pitch delivery — one clean product sentence, no filler |
| 3 | **Info / proof beat** | 13–22 s | Two-shot; Character A reacts (confused brow); Character B rattles the proof stat and savings percentage with effortless authority |
| 4 | **Punchline exchange** | 22–27 s | Character A wisecrack (self-deprecating); Character B dry closer — one line, no smile, exits frame or turns away |
| 5 | **End card** | 27–30 s | Brand gradient card, logo lockup, announcer VO only — no character dialogue |

**Arc name:** Problem → Expert Rescue → Data Proof → Comic Relief → Brand Close. Never rearrange; the data proof beat must precede the punchline, not follow it.

---

## 4. Visual Style Spec

- **Rendering style:** 3D-animated, classic-cartoon-adjacent broadcast commercial. Exaggerated cartoon proportions, expressive faces, smooth but slightly rubbery motion. NOT photorealistic. NOT flat 2D.
- **Color palette:**
  - Character A scenes: warm fluorescent office tones — cream walls, amber desk lamp glow, paper-white documents
  - Character B scenes / two-shots: cool monitor glow as key light, deep shadows, rich jewel-tone accents from a signature wardrobe element
  - End card: brand gradient background, white typography
- **Camera grammar:**
  - Beat 1: Wide establishing shot → crash zoom into Character A's panic face
  - Beat 2: Medium two-shot as Character B enters; subtle push-in on the device reveal
  - Beat 3: Locked-off two-shot; cut to Character A reaction close-up on the key stat
  - Beat 4: Medium two-shot; pull back slightly on Character B's exit line
  - End card: Static locked-off logo card, no camera move
- **Shot length distribution:** Beat 1 can hold 2–3 cuts; Beats 2–4 prefer longer takes (3–5 s per shot) to let comedy breathe; End card is a single static hold.
- **On-screen text:** Caption preset `zoom-punch` for all dialogue captions. End card: `mute_captions: true` — replace with manual text overlays (see End Card section below). No lower-thirds during character scenes.
- **Output:** 1920×1080, 16:9.

---

## 5. Voice & Persona

### Character A (everyman)
- **Archetype:** Bumbling everyman / likeable doofus
- **Tone:** Worried, eager, self-deprecating, warm
- **Voice spec:** Pick one distinctive regional accent — young male — and lock it. **Confirm the accent before proceeding.** If voice generation returns the wrong accent, retry until the intended accent is confirmed before proceeding.
- **Pacing:** Slightly faster than Character B; stumbles over multi-syllable words for comic effect
- **Sample lines (invented, generic — replace per brief):** "This is gonna bury me alive!" / "Wait — so I've been doin' it wrong this whole time?" / "I'm celebrating and I don't even know why."
- **Physical signature:** A pair of expressive appendages (e.g., ears or antennae) that move when excited. **Hard rule: such animations use hinge/pivot rotation only — never morph or generate new geometry.** Always include this note in Character A excitement scene prompts: *"existing two appendages rotate/pivot upward, NO new geometry."*

### Character B (deadpan expert)
- **Archetype:** Effortlessly superior expert / straight man
- **Tone:** Dry, warm-velvet deadpan — "like explaining something obvious to someone they're mildly fond of but shouldn't need to explain it to." Never robotic flat TTS. Never exasperated or mean. Mildly fond + barely concealing mild exasperation = the sweet spot.
- **Voice spec:** Young female, velvet monotone, naturally conversational. Delivery cue to pass to voice generation: *"dry warm velvet monotone, effortlessly superior, naturally conversational — like explaining something obvious to someone they're mildly fond of but shouldn't need to explain it to."*
- **Pacing:** Slightly slower than Character A; no rush, no upspeak. Stats delivered with the same flat calm as a weather report.
- **Physical signature:** A rich, deep, saturated coloring (deep, NOT pale/washed out) and a single bold signature wardrobe element (e.g., a satin cape) carrying a short brand tagline. Keep a small set of recurring props consistent across episodes.
- **Sample lines (invented, generic — replace per brief):** "That's what the product does." / "Fifteen to twenty percent savings. You're welcome." / "It's right there in the manual. Look into it."
- **Signature closer format:** One dry, slightly absurdist non-sequitur that rhymes or echoes the episode's punchline. Always Character B's last line. Always delivered without a smile.

### Narrator / Announcer (End Card)
- **Voice-only persona.** Warm, authoritative broadcast voice.
- **Single VO line format:** "[Product name] — by [Brand name]. Visit [brand URL]." (adapt as needed per episode brief)

---

## 6. Product Data / Proof-Term Rules

- **Savings stat:** Cite a single consistent range per campaign (e.g., 15%–20%). Do not invent additional ranges within a series.
- **Coined-term captions:** STT frequently mis-renders invented product/brand terms (a coined acronym may transcribe as a common similar-sounding word). Always pass `script_text` with the correct spelling when assembling captions for any line containing a coined term. Do not rely on auto-transcription for these words.
- **Product-name TTS:** If the product name is prone to mispronunciation, supply an explicit phonetic note (e.g., a rhyme cue) and pass it to voice generation for every line where a character or the announcer speaks the product name.

---

## 7. CTA Mechanic

- **Type:** Soft spoken + on-screen card (hybrid)
- **Mechanic:** No explicit "click here" or hard CTA during character dialogue. The product pitch in Beat 2 is the implicit CTA. The end card delivers the direct brand call: logo + URL visible on screen while the announcer reads it aloud.
- **End card spec:**
  - Background: brand gradient
  - Text overlay 1: Product name — bold display face, center
  - Text overlay 2: Brand name — clean sans face, lower-center
  - Text overlay 3: Brand URL — clean sans face, bottom-center
  - `mute_captions: true` on this scene
  - Music: bring up slightly (still under 0.10 vol)
  - Duration: ~3 s

---

## 8. Music & Pacing Fingerprint

- **Music style:** Light comedic orchestral bed — tuba + pizzicato strings + xylophone accents. Classic-cartoon-adjacent. Instrumental only; no vocals, no lyrics.
- **Music volume under dialogue:** 0.10
- **Target total runtime:** ≤30 s (hard ceiling). If assembly returns >30 s, trim the punchline beat first, then the proof beat — never cut the product entry or end card.
- **Words-per-second targets:** 2.5 w/s target; 1.5 w/s floor; 3.0 w/s ceiling. Scenes landing below 1.5 or above 3.0 w/s should have duration adjusted before assembly.
- **Sigh accommodation:** Any Character B scene that includes a sigh or pause add ~1 s to the raw duration estimate before passing to the director.
- **Two-speaker scenes:** Pass both persona voice IDs to the director for any scene where both characters speak.

---

## 9. Persona Setup (Each Session)

Character assets do not persist between sessions. Always regenerate both personas fresh:

1. **Character A** — `setup_persona` with full image + voice. Style direction: *"3D-animated classic-cartoon-adjacent broadcast commercial style, warm fluorescent office lighting, expressive cartoon rendering."* Voice: male, young, locked distinctive accent. Retry if the accent is wrong.
2. **Character B** — `setup_persona` with full image + voice. Style direction: *"3D-animated classic-cartoon-adjacent broadcast commercial style, cool monitor glow, glamorous deadpan energy, rich deep saturated coloring."* Voice: female, young, velvet deadpan.
3. **Announcer** — `setup_persona` voice-only. Warm authoritative broadcast voice.

---

## 10. Hard Rules / Do-Not-Regress

Each of these is a hard rule:

1. **Character A's expressive appendages: two of them, hinge rotation only.** Never generate new geometry. Always include note in image prompts: *"existing two appendages rotate/pivot upward, NO new geometry."*
2. **Character B's coloring must be deep/rich.** Markings/coloring must be deep and saturated, not pale or washed-out. If Character B renders pale, regenerate with explicit note: *"rich deep saturated coloring, NOT pale, NOT washed out."*
3. **Character A's voice must match the locked accent, not the wrong one.** Retry setup_persona until confirmed.
4. **Character B's voice must NOT sound like robotic flat TTS.** Delivery cue required every time: *"naturally conversational, velvet deadpan, NOT robotic."*
5. **Coined-term captions require script_text override.** STT mis-renders them as similar-sounding common words. Always correct via `script_text`.
6. **Mispronunciation-prone product names require a TTS phonetic note.** Always include the rhyme/phonetic cue.
7. **End card must use mute_captions: true** with manual text overlays. Do not allow auto-captions on the logo card.
8. **Total runtime ≤30 s.** If over, trim punchline beat first.
9. **Music is instrumental only.** No vocals, no lyrics, ever.
10. **Two-speaker scenes require both voice IDs passed to director.** Do not default to single-persona voice for dialogue scenes.