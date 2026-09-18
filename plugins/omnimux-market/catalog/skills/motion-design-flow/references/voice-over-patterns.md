# Voice-over Patterns — 2 validated modes

Seedance native audio gen is activated through dialog in quotes in prompt. This allows including narrator voice directly in video gen without external recording. Two validated tone modes from real sessions.

## Mode 1: Energetic Creator Tone

**Use case:** Apple ad for creators, brand promo, story-driven narrative, conversion-focused reels

**Tone characteristics:**
- Warm energetic creator (like young creative storyteller)
- Confident warm conversational pacing
- NOT corporate announcer (too formal)
- NOT whispered ASMR (too intimate)
- Apple ad-style delivery — friendly authority

**Pacing:**
- Comfortable: 2.0-2.5 wps
- ~29 words per 15s reel
- Sentences ~5-8 words each
- Natural breath rhythm between sentences

**Prompt phrase (drop in audio section):**
```
AUDIO: female voiceover narration in warm energetic creator tone (like a young creative storyteller, NOT corporate announcer, NOT whispered ASMR — confident warm conversational pacing, like Apple ad for creators).
```

**Example VO arc for 15s reel** (~29 words, 2.1 wps):

| Shot | Time | VO line |
|---|---|---|
| 1 | 0-2.5s | "Another night. Another scroll." (4 words) |
| 2 | 2.5-5s | "Then it hits you." (4 words) |
| 3 | 5-7.5s | "What if you could just... make it?" (7 words) |
| 4 | 7.5-10s | "One click. You're in." (4 words) |
| 5 | 10-12.5s | "Your imagination becomes the world." (5 words) |
| 6 | 12.5-13.7s | "[Brand]. Create without limits." (5 words) |
| 7 | 13.7-15s | *silent tail* |

**Validated on:**
- Handdrawn brand reel (procrastination → creation arc)

---

## Mode 3: Calm Authoritative Male Gravitas

**Use case:** Premium luxury product launches, documentary-style brand reels, editorial poster animations, halftone B&W premium reels, high-end audio/tech reels, anything requiring gravitas without energetic salesmanship

**Tone characteristics:**
- Mature confident male voice
- Deep warm gravitas
- Slower contemplative pacing
- Like Apple TV+ trailer narrator / Netflix documentary narrator / Patek Philippe luxury ad narrator
- NOT energetic salesman (too transactional)
- NOT whispered ASMR (too intimate)
- NOT corporate announcer (too formal)
- Confident premium gravitas with breathing space between phrases

**Pacing:**
- Premium contemplative: 1.5-1.8 wps
- ~16-22 words per 15s reel
- Short poetic phrases work best ("Sound takes form." / "Engineered without compromise.")
- Heavy use of periods for breath beats
- Avoid run-on sentences

**Prompt phrase (drop in audio section):**
```
AUDIO: MALE voiceover narration in CALM AUTHORITATIVE PREMIUM tone — mature confident male voice, deep warm gravitas, slower contemplative pacing, like Apple TV+ trailer narrator / Netflix documentary narrator / Patek Philippe luxury ad narrator. NOT energetic salesman, NOT whispered ASMR, NOT corporate announcer — confident premium gravitas with breathing space between phrases.
```

**Example VO arc for 15s premium reel** (~16 words):

| Shot | Time | VO line |
|---|---|---|
| 1 | 0-2s | "Sound takes form." (3 words) |
| 2 | 2-5s | "Yours. Finally heard." (3 words) |
| 3 | 5-7s | "Built to elevate." (3 words) |
| 4 | 7-10s | "Engineered without compromise." (3 words) |
| 5 | 10-12s | "Endless possibilities." (2 words) |
| 6 | 12-13.7s | "Hear differently." (2 words) |
| 7 | 13.7-15s | *silent tail* |

**Validated on:**
- Premium halftone B&W headphones reel
- Editorial poster brand reel (psychedelic ink illustration)
- Long-form luxury product launches

**Pairs especially well with:**
- Halftone B&W aesthetic + hyperkinetic motion (gravitas balances chaos)
- Editorial poster / illustrated motion (gravitas elevates poster art)
- Slow elegant cinematic camera (matched mood)
- Motion-control roboarm camera (precision + authority)

---

## Mode 2: Whispered Intimate ASMR

**Use case:** Philosophy reels, wellness brand reels, mental health content, intimate brand storytelling, contemplative product reels

**Tone characteristics:**
- Intimate whispered calm relaxed tone
- Soft breathy quiet voice
- Like ASMR philosophy reading
- Intimate close-mic whisper (like Headspace meditation)
- Calm sensual relaxed delivery
- Gentle pacing with breathing room between phrases
- NOT loud, NOT energetic announcer

**Pacing:**
- Slower: 1.0-1.5 wps
- ~17 words per 15s reel
- Truncated phrases with breath pauses
- Sentence fragments OK ("Another night...", "What if...")
- Lots of silence for breathing

**Prompt phrase (drop in audio section):**
```
AUDIO: female voiceover narration in INTIMATE WHISPERED CALM RELAXED tone — soft breathy quiet voice like ASMR philosophy reading, intimate close-mic whisper, gentle pacing with breathing room between phrases, NOT loud, NOT energetic announcer. Very calm sensual relaxed whisper. Narration is OFF-SCREEN — narrator is NOT visible, characters do NOT speak or move their mouths.
```

**CRITICAL clauses to prevent lipsync attempt:**
When there's a character with visible face in frame, Seedance may attempt to render mouth movements in sync with dialog. This kills whispered VO mood. To prevent:
1. `Narration is OFF-SCREEN`
2. `Narrator is NOT visible`
3. `Characters do NOT speak or move their mouths`

All three phrases in audio section. Without them model attempts lipsync even on handdrawn characters.

**Example VO arc for 15s reel** (~17 words with breathing space):

| Shot | Time | Whispered line |
|---|---|---|
| 1 | 0-2.5s | "Another night..." (2 words) |
| 2 | 2.5-5s | "Then... it hits you." (4 words with breath) |
| 3 | 5-7.5s | "What if..." (2 words with breath) |
| 4 | 7.5-10s | "One click. You're in." (4 words) |
| 5 | 10-12.5s | "Your world begins." (3 words) |
| 6 | 12.5-13.7s | "[Brand]." (1 word) |
| 7 | 13.7-15s | *silent tail* |

**Validated on:**
- Handdrawn brand reel (whispered version)
- Philosophy reels (SP4 in successful-patterns.md)

---

## Common VO pitfalls

### Pitfall 1: Word count too high
**Symptom:** Whisper cut mid-word, narrator doesn't finish phrase.
**Fix:** Reduce word count to 1.0-1.5 wps. Whispered ASMR requires MORE silence.

### Pitfall 2: Lipsync attempt on off-screen narrator
**Symptom:** Character on screen starts silently opening mouth in sync with narration.
**Fix:** All 3 clauses (off-screen / not visible / do not speak or move mouths) in audio section.

### Pitfall 3: Brand name pronunciation wobble
**Symptom:** a long "[multisyllable brand]" name sounds garbled in whisper.
**Fix:** Reframe — "Marketing Studio by [Brand]" or just short "[Brand AI]" instead of full name. In whisper especially important to keep dictation simple.

### Pitfall 4: Music in single-clip reel + VO
**Symptom:** Music conflicts with VO clarity.
**Fix:** Even in single-clip reel — generate with SFX-only, add music under VO in CapCut post.

### Pitfall 5: Tail pause cut through VO
**Symptom:** Last word VO extends into tail pause, no clean cut.
**Fix:** Narrator finishes by ~13.7s, last 1.3s silent. Mandatory phrase at end of CHOREOGRAPHY:
```
Female narrator [whispers/says] OFF-SCREEN finishing by 13.7s: "[final line]". 
[then]
13.7-15s MANDATORY SILENT TAIL PAUSE: hold final composition silently. NO narration, NO new motion.
```

---

## VO + Camera mode combinations

Not all VO modes work equally well with each camera mode:

| Camera mode | Energetic creator VO | Whispered ASMR VO | Male authoritative gravitas VO |
|---|---|---|---|
| Slow elegant | OK (mismatch energy) | **Excellent** (perfect pair) | **Excellent** (premium luxury) |
| Hyperkinetic chaos | **Excellent** (energy match) | Unusual (hypnotic contrast) | **Excellent** (gravitas balances chaos) |
| Motion-control roboarm | OK (cool detachment) | **Excellent** (intimate dystopia) | **Excellent** (authority + precision) |
| Circular orbital | **Excellent** (emotional warmth) | **Excellent** (contemplative depth) | OK (works for narrative) |
| Liquid illustrated motion | OK (creator energy in posters) | OK (intimate poster vibe) | **Excellent** (editorial gravitas) |
| Tutorial static | Skip VO (use CapCut overlay) | Skip VO | Skip VO |

**Unusual combos worth trying:**
- Hyperkinetic chaos + whispered ASMR = signature hypnotic vibe (visual energy contrasts with audio intimacy)
- Motion-control + energetic creator = subverts dystopia, becomes warm tech demo

---

## Multi-language VO

Seedance native audio supports 8+ languages with phoneme-level lipsync. For non-English VO:

```
AUDIO: [language] voiceover narration in [tone]. Narrator says in [language]: '[exact phrase]'.
```

Validated on Russian, English. Other languages — variable depending on model training.

**Critical:** Pronunciation accuracy is better when explicitly named: "narrator speaks Russian" vs assuming. Also useful: for Russian abbreviations write with spaces for letter-by-letter — "U G C", "A I", "T V".

---

## When to use VO vs SFX-only

**Use native Seedance VO when:**
- Single-clip ≤15s reel
- Brand name pronunciation simple
- Story arc requires narrator presence
- Tone (energetic / whispered) clearly specified

**Skip native VO + use CapCut overlay when:**
- Multi-chapter reel (>15s) — independent VO tracks won't sync
- Complex pronunciation / multilingual
- Need pixel-perfect timing
- Tutorial reels (motion from UI, narrator distracts)
- Need professional voice talent quality

**Hybrid approach:**
Generate Seedance with SFX-only + record VO externally + layer in CapCut. Most flexible, most predictable, but loses native lipsync benefit (which only matters if character actually speaking on-screen).
