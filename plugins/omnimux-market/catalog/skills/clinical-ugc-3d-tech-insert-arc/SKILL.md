# Clinical UGC + 3D Tech Insert Arc

A 45–55-second vertical (9:16) ad pattern that pairs raw everyday-life UGC with embedded 3D mechanism animations to create a "proof sandwich": the audience sees real pain → gets technical validation → sees real relief.

---

## 1. When to Use This Pattern

**Best fit:**
- Body-wellness products with an engineered mechanism (support wear, orthotics, posture aids, heated wraps, ergonomic gear)
- Pain points that are visually invisible but universally felt (recurring everyday aches, fatigue, soreness tied to a daily routine)
- An audience that experiences a repeatable, routine-linked physical discomfort
- Products with a textured or structured surface that photographs/renders distinctively
- Offer with urgency: percentage-off + money-back guarantee

**Poor fit:**
- Purely aesthetic products (colour cosmetics, hair styling) — no mechanism to animate
- Audiences who respond better to performance/sport framing
- Products where the pain point is too clinical for UGC tone (prescription, medical device)
- Sub-20-second formats — the arc needs ≥40 seconds to breathe

---

## 2. Hook & Opening (0–8 s)

**Structural move: Pain-Confession POV Question**

The video opens on a close-up of the pain site — not the product. The subject is in a recognisable everyday environment (workspace, transit, home routine). A kinetic pill-style text question appears *above* the subject's eyeline (position_y_ratio ≈ 0.12) in the first 1.5 seconds. The subject then confesses the pain in first-person VO.

**Invented generic example (for a neutral hypothetical wrist-support product):**
> Hook overlay text: *"Why Do My Hands Go Numb By Noon?"*
> VO: *"I'm typing all morning and by lunch my wrists just… give out."*

**The move:** The question does the pattern-interrupt (stops the scroll because it names a felt-but-unspoken pain); the VO confession validates it as a real person's story, not a pitch. The product is **not shown** in this beat.

**Swap rule:** Replace the pain site, environment, and timing with your product's. Keep the pill text as a question. Keep the subject's face slightly below centre-frame so the pill sits clearly above them with breathing room.

---

## 3. Narrative Arc

| Beat | Duration | Name | Visual | VO Tone |
|------|----------|------|--------|---------|
| 1 | 0–8 s | **Pain Confession** | Close-up of pain site; everyday environment; no product | First-person, vulnerable, matter-of-fact |
| 2 | 8–16 s | **Clinical Proof Bridge** | Multi-cut: real-life consequence clips intercut with 3D cross-section/diagram animation labelled with the underlying problem | Narrator pivots to explanatory; calm, slightly authoritative |
| 3 | 16–26 s | **Before/After Contrast** | Split-screen or hard cut: before (grey/dull/pained) vs after (warm/bright/relieved); 3D gradient animation (problem colour → relief colour) | "But when I found [product]…" — shift to cautious hope |
| 4 | 26–34 s | **Mechanism Close-Up** | Extreme close-up of product texture/surface; 3D force-arrows or pressure-gauge overlay showing how it works | Confident, slightly clinical — the "science bit" |
| 5 | 34–41 s | **Lifestyle Payoff** | Subject doing the same activity that was painful — now easy, relaxed, light; a soft colour-grade glow on the product area | Relieved, almost surprised; casual not hype |
| 6 | 41–46 s | **Social Proof / Comfort Badge** | Tight or low-angle shot; text badge ("ALL DAY COMFORT" or equivalent) | Soft sign-off; almost whispered |
| 7 | 46–50 s | **CTA** | Full-body clean shot; large offer text + guarantee pill; no spoken captions (mute_captions: true) | VO reads offer once, then silence to let text land |

**Arc name:** Problem → Clinical Proof → Before/After → Mechanism → Payoff → Badge → Offer.

---

## 4. Visual Style Spec

**Register:** UGC-primary with clinical 3D inserts. Not polished brand-film. Not pure talking-head. The rawness is intentional and must be preserved.

| Dimension | Spec |
|-----------|------|
| Camera grammar | Handheld or slightly unstable. No gimbal-smooth. No bokeh. |
| Lighting | Flat/utilitarian for pain scenes. Warmer natural light for payoff scenes. Never soft-box studio. |
| Colour palette | Cool/desaturated for problem beats; warm/saturated for relief beats. 3D animations: problem = orange/red diagnostic; relief = teal/blue/purple. |
| Grain | Slight film grain acceptable and preferred — signals authenticity |
| Shot length | Pain beats: 2–3 s cuts. 3D animation inserts: 2–4 s. Payoff: 3–5 s lingering. CTA: single locked-off shot held to end. |
| On-screen text | **Hook:** pill-style, bold sans-serif (DM Sans or equivalent), position_y_ratio 0.10–0.14. **Scene badges:** small, clean, upper-third or lower-third, white or product-colour. **CTA:** large centred offer text (gold/warm accent colour) + white guarantee pill. **Captions:** clean-bold preset, word-appear mode, DM Sans — present on all scenes except CTA. |
| 3D insert style | Technical-diagnostic aesthetic: dark background, glowing cross-sections, labelled structure, animated force arrows or pressure gauges. Must feel like a pharmaceutical-style proof insert, not a lifestyle graphic. |
| Aspect ratio | 9:16 vertical only |

---

## 5. Voice & Persona

**Persona archetype:** Relatable peer — not influencer, not actress, not model. A real-looking person in the target demographic who happens to have discovered something. Unretouched skin is a **hard rule** (see §7).

**Tone arc:**
- Beats 1–2: Confessional, tired, slightly embarrassed. Speaks at ~2.5 words/second (measured cadence, not fast).
- Beats 3–4: Cautiously curious → mildly excited. Pace picks up slightly.
- Beats 5–6: Genuinely relieved. Quieter. Less "ad voice."
- Beat 7 (CTA): One clean offer sentence, then silence.

**Sample phrasing register (invented, generic):**
- *"I didn't think a little bit of support could actually feel like… nothing."*
- *"By the afternoon it felt the same as it did first thing in the morning."*
- *"Even my routine checkup picked up on the difference."*
- *"I almost didn't believe it until I'd used it for a week."*

**Avoid:** Influencer superlatives ("literally obsessed", "game changer"), shouted enthusiasm, any phrasing that signals ad-awareness.

**VO pacing target:** 2.5–3.0 words/second. Enforce this when writing VO scripts — count words and divide by scene duration.

---

## 6. CTA Mechanic

**Pattern:** Visual-text-primary close with a single spoken offer line, then silence.

- **Spoken:** One sentence naming the offer and the guarantee. Example: *"Right now, [Product] is [X]% off — and it's fully backed by a money-back guarantee."*
- **On-screen:** Large centred offer percentage (e.g. "[X]% OFF") with a bounce-in animation + a smaller white pill below it ("MONEY BACK GUARANTEE") with a fade-in.
- **Caption mute:** `mute_captions: true` on the CTA scene — the text cards are the message; captions would compete.
- **No link-in-bio, no comment-bait.** The offer is complete and self-contained. The platform click target handles the rest.

---

## 7. Hard Rules / Do-Not-Regress

These are locked constraints for the pattern:

1. **Unretouched skin is mandatory.** The persona must be specified with realistic skin texture — visible natural skin detail at the pain site if it is shown. No smoothing filters, no idealized complexion. If the generation engine smooths skin, push back explicitly in the persona prompt.
2. **Product is never shown in the hook beat (0–8 s).** The hook is about the pain, not the product. Introducing the product too early kills the authenticity signal.
3. **VO pacing ≤ 3.0 words/second.** Fast VO feels scripted. Count words per scene and flag any scene over 3.0 w/s before generation.
4. **3D inserts must use a diagnostic colour language** (orange/red for problem, teal/blue for relief). Do not use brand colours for the 3D animation — it will look like a logo sting, not a clinical proof point.
5. **CTA scene captions are always muted.** The large on-screen offer text and caption text fight each other. Captions off on CTA.
6. **Multi-cut scenes require reference_images for continuity.** Any scene with 2+ cuts must pass the cut start frames as reference images to the next director call to maintain visual coherence.
7. **Persona reference images must be excluded from content-flagged scenes.** If a scene depicts body parts and the generation engine returns a policy rejection, retry without persona reference images — the visual description in the motion prompt is sufficient.
8. **Music volume: 0.10–0.15.** The track is a subliminal underscore, not a featured element. At 0.12 the VO is clearly dominant. Do not mix music higher.
9. **Hook pill text sits above subject's head, not overlapping face.** position_y_ratio 0.10–0.14. Test if the subject's head is in the upper third — if so, push the pill to position_y_ratio 0.05.
10. **Full-body shots for support/coverage wear require showing the covered area clearly.** Avoid frames where the product area is cropped or obscured — the product's visual coverage is the proof.

---

See also: [Hook Library](references/hook-library.md) — a bank of pain-confession POV question hooks to adapt.