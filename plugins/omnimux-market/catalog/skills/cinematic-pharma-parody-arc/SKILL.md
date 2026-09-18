# Cinematic Pharma Parody Arc

A creative mold for deadpan pharmaceutical-style parody ads. The joke lives entirely in the collision between hyper-sincere cinematic production value and an utterly absurd "condition" + "medication" concept. The product, brand name, and disorder name swap out for every new execution; the structure, tone, and grammar stay locked.

---

## 1. When to use this pattern

**Suits:**
- B2B SaaS, consulting, HR, finance, legal — any category where buyers are self-serious and the satire can punch at corporate culture.
- Viral/social campaigns that want earned media via absurdist humor.
- Founders or agencies building brand voice around irreverence and insider wit.
- 9:16 social (TikTok, Instagram Reels, YouTube Shorts) — the cinematic anamorphic aesthetic is maximally incongruous at phone scale, which amplifies the joke.

**Does not suit:**
- Products where the joke would punch down at real patients or marginalized groups.
- Direct-response campaigns that need a clear, literal CTA above humor.
- Brands that require brand-safety above all (Fortune 50 legal-heavy clients).

---

## 2. Hook & Opening

**Structural move: Silent Cinematic Immersion → Delayed VO Entry**

Scene 1 is completely silent. No voiceover. No music. Just a beautiful, inexplicable, slightly unhinged image — an executive in a clawfoot bathtub on a golden hilltop at dawn — held long enough (6–8 seconds) that the viewer leans in confused. The logo appears as a simple overlay. Then, and only then, does the VO begin — on Scene 2, not Scene 1.

**Invented example (neutral hypothetical product):**
> *Scene 1: Drone push-in on a lone executive seated at a grand piano in the middle of a desert salt flat at sunrise. The product logo fades in. No audio.*

**The move:** The visual absurdity does the hook work. The viewer's brain asks "what IS this?" — that question holds attention through the first VO line.

**Swap rule:** Replace the opening tableau with any equally incongruous image that signals luxury + absurdity for the new product's world. Keep the silence. Keep the drone push-in or locked wide shot. Keep the logo-as-only-text. Do not add VO to Scene 1.

---

## 3. Narrative Arc

Total runtime: ~50 seconds. Beat structure:

| Beat | Seconds | Description | Tone |
|---|---|---|---|
| **1 — Silent Immersion** | 0–8s | Dreamlike visual, logo only, no VO | Reverent silence |
| **2 — The Moment** | 8–16s | VO drops the euphemistic hook line. Cut to hard evidence of the "problem" (chart, document, telling tableau). | Warm, knowing, slightly conspiratorial |
| **3 — Disorder Diagnosis** | 16–28s | VO names and defines the fictional disorder in full clinical language. Symptoms listed earnestly. Visuals show the "sufferer" (the before-state). | Deadpan clinical, no winking |
| **4 — Euphoric Payoff** | 28–42s | Hard cut to the after-state. Product works. Triumphant team, champagne, rising charts. VO pivots to efficacy claims + a ridiculous fake stat. Upbeat music enters. | Celebratory, sincere, absurdly optimistic |
| **5 — Rapid-Fire Disclaimer** | 42–50s | Deep navy end card. Logo. Legal-speak disclaimer read at 1.75× speed (matching real pharma ads). | Deadpan, mechanical |

**Arc name:** Diagnosis → Disorder → Deliverance → Disclaimer (4-D arc)

The comedy depends on never breaking character. The VO must never wink. The more earnest, the funnier.

---

## 4. Visual Style Spec

- **Aesthetic:** Cinematic anamorphic. Reference: glossy prestige pharma TV spots, circa 2010–2018. NOT UGC. NOT handheld. Every frame should look like it costs $400k.
- **Color palette:** Golden-hour warm (amber, burnt sienna, soft ivory) for "before" and "after" outdoor scenes. Cool fluorescent desaturated for the "problem" boardroom scenes. Deep navy `#0a1628` for the end card.
- **Camera grammar:**
  - Scene 1: Drone push-in or slow dolly-in on wide shot. Locked horizon.
  - Scene 2–3: Clean corporate interiors, locked-off or very slow pan. Declining chart gets a hard cut close-up — the only fast edit before Beat 4.
  - Scene 4: Match-cut or hard cut to outdoors. Handheld allowed only for spontaneous-joy moments (laughing, champagne pour). Otherwise locked.
  - Scene 5: Completely static. No camera movement.
- **Shot length distribution:** Slow throughout (3–5s per shot) until Beat 4 payoff, which can cut slightly faster (2–3s). Beat 5 is a single static card.
- **On-screen text policy:**
  - Beat 1: Logo only, center frame, clean sans-serif, white, fade-in.
  - Beats 2–4: No lower-thirds. Captions only if accessibility required; use `appear_mode: "section"` so phrases build and stay visible rather than scrolling.
  - Beat 5: Logo top-center; disclaimer text bottom-third, small, same font. No kinetic animation.
- **Aspect ratio:** 9:16 vertical for social delivery.

---

## 5. Voice & Persona

**Two separate entities — never conflate them:**

| Entity | Role | Style |
|---|---|---|
| **On-screen persona** | Visual protagonist (the "patient") | Silver-haired authority figure. Corporate archetype. Never speaks on camera. Reacts silently. |
| **Voiceover announcer** | Separate audio-only voice | Deep, male, warm baritone. Calm-authoritative. Measured pace — one beat of silence after each major clause. Never rushed until the disclaimer. |

**Tone:** Deadpan sincere. The VO actor believes every word. There is zero irony in the delivery. The comedy is entirely structural — clinical language applied to a ridiculous subject.

**Phrasing rhythms that define the pattern:**
- Open with a soft conditional: *"When the moment is right… you want to be ready."*
- Name the disorder with medical gravitas: *"[Brand Name] is clinically indicated for [Absurd Disorder Name] (ABD), a condition affecting…"*
- List symptoms in triads: *"characterized by [symptom], [symptom], and [symptom]."*
- Pivot to efficacy with a fake study: *"In a nine-year double-blind study of two thousand and forty-one executives…"* (numbers always spelled out in the TTS script)
- Soft CTA embedded in final VO line before disclaimer: *"Ask your [consultant/advisor/board] if [the product] is right for you."*

**Phonetic guidance for TTS (apply to any new execution):**
- Any word with unusual stress: spell it phonetically in the TTS input, e.g. `ho-moh-jeh-NAY-ih-tee` for *homogeneity*, `FLASS-id` for *flaccid*.
- Numbers: always spell out in full — `two thousand and forty-one`, not `2,041`.
- Generate and approve TTS audio **before** rendering any video — saves significant credits if pronunciation needs adjustment.

---

## 6. CTA Mechanic

**Pattern:** Soft spoken ask embedded at the tail of Beat 4 VO, followed by a silent logo end card.

- **Mechanic:** No hard CTA card. No "link in bio." No comment-bait. The ask is whispered into the body copy of the VO: *"Ask your [authority figure] if [the product] is right for you."* — directly mirroring real pharma ad language.
- **End card:** Logo only on deep navy. No URL. No button. The parody depends on the ad ending exactly like a real pharma spot — abruptly, with only the logo and the legal blur of the disclaimer.
- **What's interchangeable:** The specific "[authority figure]" noun (consultant, board, advisor, coach) swaps per product. The structure — soft ask → disclaimer blur → logo freeze — stays locked.

---

## 7. Hard Rules / Do-Not-Regress

These are hard rules for any future execution of this pattern.

1. **Generate TTS audio first, get approval, then render video.** Never render scene video before the voiceover audio has been heard and approved by the user. Regenerating video after fixing pronunciation wastes credits.

2. **Always use `generate_audio: false` on `generate_scene_video`.** Baked-in scene audio conflicts with the separately generated VO track. This applies even to Scene 1 (which is silent) — the video engine may bake in phantom audio regardless of `speech_status: silence`.

3. **Scene 1 must be silent — enforce at assembly, not just at generation.** Do not rely on the video engine to silence Scene 1. Ensure no audio track is assigned to it in the assembly step.

4. **`assemble_video` accepts only one `music_url`.** If the arc requires two distinct music moods (e.g. melancholy → celebratory), blend them before assembly: trim each track to the right length, concatenate them into a single audio file, and pass that single file to `assemble_video`.

5. **Use `playback_rate` per-scene in `assemble_video` for the disclaimer scene** — targeting approximately 1.75× to match real pharma ad pacing. Do not speed up the VO audio file itself; use the assembly-level parameter.

6. **Use `appear_mode: "section"` for captions on fast-speech scenes** so that phrases build on screen and remain visible rather than flickering past as single words.

7. **Use pixel coordinates (`x`, `y`, `width`) in `image_overlays` for logo placement.** Do not rely on named anchor positions — pixel control ensures the logo scales correctly across output resolutions.

8. **Final assembled video URLs are time-limited S3 links.** Always inform the user to download the final asset immediately. If persistence is needed, use `register_asset` to push to CDN before sharing the link.

9. **The fictional disorder name must follow real pharma naming conventions.** Use an acronym (three letters preferred), pair it with a dignified multi-syllable medical-sounding name, and have the VO spell out the full name before abbreviating. Example: *"Chronic Synergy Deficiency (CSD)"*.

10. **The on-screen "problem" scene must show the before-state with literal visual evidence** (a declining chart in frame, a document being reviewed, a telling environmental tableau) — not just a facial expression. The visual evidence is the punchline setup; the VO diagnosis is the punchline delivery.

---

## References

- See `references/tts-phonetics.md` for phonetic respelling guidelines and a starter library of commonly mispronounced corporate/medical terms.