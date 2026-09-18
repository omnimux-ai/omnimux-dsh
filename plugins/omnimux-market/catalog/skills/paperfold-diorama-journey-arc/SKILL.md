# Paperfold Diorama Journey Arc

A cinematic ad pattern where every visual element — characters, environments, props, lighting — is rendered as folded paper and origami sculpture. The emotional journey (problem → aspiration blocked → discovery → resolution → CTA) is narrated by a single warm voice-over persona over gently animated paper-craft stills. The result feels handcrafted, premium, and deeply human.

---

## 1. When to use this pattern

**Best fit:**
- Financial services (home loans, equity, insurance, savings, debt relief)
- Home, family, and life-milestone products (real estate, moving, renovation, parenting)
- Health and wellness brands targeting households or couples
- Any brief calling for "warm," "artisan," "cinematic," or "handcrafted" visual language
- Brands that want to stand out from live-action UGC or standard motion-graphics
- Returning sessions where this aesthetic has already been approved for the brand

**Poor fit:**
- Youth/Gen-Z brands that need raw, lo-fi, or chaotic energy
- Tech products requiring screen recordings or UI walkthroughs
- Brands with strict photorealistic product-shot requirements
- Ads shorter than 20 seconds (the arc needs room to breathe)

---

## 2. Hook & opening

**Structural move: Quiet tension open — problem in miniature**

The ad opens on a single paper-craft scene that immediately communicates stress or struggle without dialogue. The image does the work; the VO arrives a beat later to name the feeling.

**Illustrative example (generic — invent fresh per product):**
> *Scene 1 image:* A paper-craft couple at a kitchen table surrounded by paper bills and a paper laptop, faces showing worry. Warm cream and muted teal palette. Slow push-in camera motion.
> *VO:* "Some months, no matter how careful we were, it never felt like enough."

**Swap the subject, keep the move:**
Replace the kitchen-table-bills scene with whatever "stress moment" fits the new product (medical bills, a car that won't start, a crowded apartment). Keep the slow push-in, the warm palette, and the VO arriving after the image has already landed the emotion. The paper-craft rendering is non-negotiable — it's what makes the stress feel safe and story-like rather than harsh.

**Hook overlay style:** `script` (Pacifico handwritten font) — reinforces the personal-story, diary-entry feel of the opening.

---

## 3. Narrative arc

Five beats. Target total runtime: 28–35 seconds.

| Beat | Name | Target duration | Visual tone | VO tone |
|------|------|----------------|-------------|---------|
| 1 | **Problem** | 5–7 s | Intimate, slightly dim. Slow push-in. Paper figures hunched or tense. | Confessional, first-person plural ("we"). Quiet. |
| 2 | **Aspiration blocked** | 5–7 s | Exterior or wider shot. Paper environment feels large, figures small. Pull-back or locked-off. | Frustrated but not defeated. One concrete obstacle named. |
| 3 | **Discovery / solution** | 6–8 s | Over-the-shoulder POV showing a paper screen with key numbers visible. Slow push-in toward screen. | Shift to curiosity → relief. The product is named here, once, naturally. |
| 4 | **Resolution / joy** | 5–7 s | Bright, open. Pull-back to reveal the win (SOLD sign, open door, celebration). Figures upright, expressive. | Warm, grateful. Short sentences. |
| 5 | **CTA / deal close** | 4–6 s | Handshake, document signing, or brand-branded moment. Locked-off or very slow push-in. On-screen CTA card. | Calm, direct. One action. Brand URL spoken and shown. |

**Arc name:** Problem → Blocked Aspiration → Discovery → Resolution → CTA
*(Also works as: Struggle → Wall → Window → Win → Door)*

---

## 4. Visual style spec

### Aesthetic core
Every element in every image must be made of folded paper. This is non-negotiable and must be stated explicitly in every image generation prompt.

**Master prompt formula (copy and adapt per scene):**
```
Everything in the scene is made of folded paper — the [characters], their [clothing],
their [hair], the [environment], the [props], even the [lighting sources].
Geometric origami-style facets throughout. The entire image looks like an intricate
paper diorama or paper sculpture photographed in a studio. [Scene-specific emotional
moment]. [Color palette note]. Aspect ratio 9:16, cinematic.
```

See [references/scene-prompt-templates.md](references/scene-prompt-templates.md) for per-beat copy-paste prompts.

### Color palette
- **Base:** Warm creams and off-whites (paper stock feel)
- **Accent 1:** Soft blues and muted teals (calm, trustworthy)
- **Accent 2:** Muted golds (warmth, aspiration)
- **Avoid:** Saturated primaries, neon, stark black-and-white

### Camera grammar
| Scene type | Camera move |
|------------|-------------|
| Intimate / stress | Slow push-in |
| Blocked / exterior | Pull-back or locked-off |
| Discovery (screen POV) | Slow push-in toward screen |
| Celebration / reveal | Pull-back to reveal |
| CTA / close | Locked-off or very slow push-in |

### Shot length distribution
- Beats 1–2: longer holds (5–7 s each) — let the paper world breathe
- Beat 3: medium (6–8 s) — enough time to read on-screen numbers
- Beats 4–5: slightly shorter (4–7 s) — energy picks up toward resolution

### On-screen text policy
- **Hook overlay:** `script` style (Pacifico) — appears over Beat 1 only
- **Captions:** `editorial-clean` preset, `Alice` serif font — refined, pairs with paper aesthetic
- **Value comparison (Beat 3):** Show the old value crossed out in red + the new better value in teal on the paper screen in the image itself — communicates value prop visually without extra VO
- **CTA card (Beat 5):** Teal pill overlay with brand URL — on-screen and spoken

### No lip sync
VO-only delivery. Do not attempt lip-sync animation. The paper-craft style is incompatible with realistic mouth movement; VO-over-animated-still is cleaner and more cinematic.

---

## 5. Voice & persona

**Persona archetype:** Warm peer narrator — sounds like a friend who went through this and came out the other side. Not a spokesperson. Not a voiceover artist doing a "commercial voice."

**Tone:** Calm-authoritative with genuine warmth. Confessional in Beat 1, curious in Beat 3, grateful in Beat 4, direct in Beat 5.

**Pacing:** Unhurried. Pauses between sentences. Let the paper images carry weight between lines.

**Voice setup:** Single narrator persona, consistent across all scenes. Female or gender-neutral warm timbre works best. Lock the voice asset ID at setup and reuse it for every scene — do not vary the voice between beats.

**Sample phrasing rhythm (adapt subject, keep cadence):**
- Beat 1: *"We were doing everything right — but [obstacle]."*
- Beat 2: *"Every time we tried to [aspiration], something got in the way."*
- Beat 3: *"Then we found [product]. [One key fact]. That changed everything."*
- Beat 4: *"[Outcome]. We couldn't believe it."*
- Beat 5: *"If you're [in the same situation], [brand URL]. It's [reassurance]."*

**Phrasing tendencies to preserve as style anchors:**
- First-person plural ("we," "our") — makes the viewer feel included, not sold to
- Short declarative sentences in Beats 4–5 — punchy after the longer setup
- One concrete number or fact in Beat 3 — grounds the emotional arc in reality

---

## 6. CTA mechanic

**Type:** Soft spoken + on-screen card (dual delivery)

**Structure:**
1. VO names the brand and URL naturally in the last sentence of Beat 5
2. On-screen teal pill card appears simultaneously with brand URL (e.g., `theproduct.com`)
3. No aggressive "click now" or "limited time" language — the tone stays warm through the close

**Music behavior at CTA:** Music should be at its warmest/most uplifting peak during Beat 4, then settle slightly for Beat 5 so the spoken CTA is clear.

**Legal/reassurance line (if applicable):** Spoken softly after the URL — e.g., *"It's quick, secure, and there's no obligation."* Keep it brief; one sentence maximum.

---

## 7. Hard rules / do-not-regress

Treat these as locked rules for all future uses of this pattern:

1. **Persona approval gate is mandatory.** Generate all scene images first. Show them to the user. Wait for explicit approval before starting any video animation. Do not skip or abbreviate this gate.

2. **Character consistency across all images.** Every image prompt must specify the same hair color, clothing color, and body build for recurring characters. Inconsistency breaks the paper-world illusion.

3. **Over-the-shoulder POV for the discovery scene.** Beat 3 (discovery/solution) must use an over-the-shoulder angle showing the screen — not a front-facing shot of the couple looking at a laptop. The POV angle is more compelling and communicates "looking at the solution together."

4. **Value comparison is visual, not just spoken.** In the Beat 3 image, show the old value crossed out in red and the new better value in teal on the paper screen. Do not rely on VO alone to communicate the value prop.

5. **VO-only, no lip sync.** Never attempt lip-sync animation in this style. Paper-craft figures do not lip-sync; VO-over-animated-still is the correct delivery method.

6. **Single narrator voice, locked across all scenes.** Set up the persona voice once and reuse the same voice asset ID for every scene. Do not vary the voice.

7. **Music volume: 0.12.** Keep background music subtle. The VO and the paper-world visuals carry the emotion; music is texture, not foreground.

8. **Caption style: `editorial-clean` + `Alice` serif.** This pairing is the correct aesthetic match for the paperfold style. Do not substitute a sans-serif or kinetic caption style.

9. **Hook overlay: `script` (Pacifico).** The handwritten hook style is locked for this pattern. It signals "personal story" before a word is spoken.

10. **Brand context (apply when a specific brand is supplied):**
    - Surface the brand's one key value/figure in the Beat 3 value comparison
    - Add the brand's reassurance line (if any) softly after the URL in Beat 5
    - Carry any brand-supplied contact detail through to the CTA card only if requested
    - If the aesthetic is pre-approved for the brand, no need to re-pitch the style to the client

---

## References

- [Scene prompt templates](references/scene-prompt-templates.md) — copy-paste image prompt formulas for each of the 5 beats