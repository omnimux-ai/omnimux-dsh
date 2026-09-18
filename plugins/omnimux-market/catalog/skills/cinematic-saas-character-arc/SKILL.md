# Cinematic SaaS Character-Arc Commercial

A premium brand-film pattern for B2B SaaS. One professional persona. Three acts. Real product UI composited onto real devices. Cinematic film look throughout.

---

## 1. When to use this pattern

**Suits:**
- B2B SaaS with a clear, relatable professional end-user (contractors, field workers, healthcare professionals, real-estate agents, finance advisors, etc.)
- Brands that want to evoke trust, craft, and authority rather than viral energy
- 16:9 horizontal format: YouTube pre-roll, LinkedIn video, website hero, CTV/OTT
- ~45–75 second runtime
- Client has real product screenshots available to composite

**Does NOT suit:**
- Consumer apps needing social-first energy (use a UGC-skeptic-pov pattern instead)
- Products with no visual workflow — no screens, no hands-on artifact
- Vertical/Reels format (aspect ratio and pacing assumptions differ)
- Brands wanting humor, irreverence, or lo-fi aesthetics

---

## 2. Hook & Opening

**Structural move: "Character establisher in their world."**  
Open on the professional arriving at or already inside the environment that defines their job — before the product appears. No logo. No product. Just their world, in documentary-quality light.

**Generic example:**  
*Scene 1: A field professional arrives at their worksite at golden hour. Camera pushes slowly toward them as they survey the surroundings. VO: "Some mornings, the work decides how the whole day goes."*

**The rule:** Swap the character archetype and environment for the new product's profession; keep the arrival/survey move and a VO line that names the universal truth of their work. The product must NOT appear in the first scene.

---

## 3. Narrative Arc

Three-act structure. Total target: 45–75 seconds.

| Beat | Target Duration | What Happens | Visual Tone |
|---|---|---|---|
| **Act 1 — Their World** | 8–10s | Character in their professional environment, pre-product. Establishes stakes and persona. | Wide-to-medium push. Golden hour or overcast nat-light. No UI. |
| **Act 2a — The Problem Moment** | 8–12s | Character doing the effortful version of their job — on paper, on spreadsheet, on the phone. Something is hard. | Tight on hands and face. Subtle tension in VO. |
| **Act 2b — Product In-Context** | 12–18s | Product UI appears on a real device in a real setting (truck cab, office desk, kitchen table). 2–3 device shots, each 4–6s. VO narrates the transformation. | Close-up on device screen; character visible but soft behind. |
| **Act 2c — World in Motion** | 6–10s | Character observing their domain with the product working. Camera stays CLOSE on character; environment stays bokeh. | Shallow DoF. Slight handheld. Character is subject, not background crew. |
| **Act 3a — The Close** | 8–10s | Character closes a deal, signs a client, delivers a result. Human warmth. | Two-shot or over-shoulder. Warm interior light. |
| **Act 3b — Satisfied State** | 4–6s | Character alone, at ease. VO delivers brand line. | Dark room, single source light — brand-color screen glow preferred. |
| **End Card** | 6–8s | Cinematic mood piece: silhouetted figure + brand-color ambient glow. Logo + tagline. NOT a screenshot of the app. | Full cinematic grade. Hold on logo. |

**Arc name:** problem-context → product-in-world → human-close → satisfied-resolution

---

## 4. Visual Style Spec

**Overall register:** Cinematic documentary-commercial. Apple product film × documentary realism × modern SaaS brand.

| Dimension | Spec |
|---|---|
| **Aspect ratio** | 16:9 anamorphic (subtle lens distortion at frame edges acceptable) |
| **Color science** | Kodak Portra 400 emulation: warm shadows, compressed highlights, slight desaturation in mids |
| **Grain** | Soft film grain — present but not distracting |
| **Depth of field** | Shallow throughout. Subject sharp; backgrounds 40–60% bokeh |
| **Contrast** | High contrast in Act 1 (harsh field light); progressively warmer and lower-contrast into Act 3 |
| **Camera grammar** | Locked-off or very slow push-in for establishing shots. Slight handheld for action/observe beats. NO fast handheld or shaky-cam. |
| **Shot length** | Act 1: 8–10s single shot. Act 2b product shots: 4–6s each. End card: 6–8s hold. Average ~6–7s/shot. No cut faster than 3s. |
| **On-screen text** | Editorial-clean captions, DM Sans or geometric sans-serif. Lower-thirds only — no kinetic full-screen text except end card logo/tagline. |
| **Crowd / environment avoidance** | NEVER attempt wide-angle shots of a busy site, crowd, or large machinery in motion. AI cannot render convincing crowds. Keep camera CLOSE on the character — busy environment is implied by soft bokeh behind them. |

---

## 5. Voice & Persona

### Narrator Voice
- **Tone:** Calm-authoritative. Not hushed. Not salesy. Speaks like a respected peer who has been in the industry.
- **Pacing:** Deliberate. Ellipses mark real pauses. Target **2.0–2.5 words/second** — do NOT write sparse one-line copy and expect it to fill long scenes. A 9-second scene needs ~18–22 words of VO.
- **Persona archetype:** Narrator-only (voice-over, never on-screen). The professional on screen is the actor; the narrator is the brand's conscience.
- **Sample phrasing rhythm:** *"Some mornings, the work decides how the whole day goes… one small detail, and a promise you intend to keep."* — declarative fragment → ellipsis pause → consequence clause.

### On-Screen Professional Persona
- **Archetype:** Mid-career expert. Not young-and-hungry, not gray-beard emeritus. Competence is visible in their hands and face, not stated.
- **Visual signature:** One consistent character throughout ALL scenes. Same wardrobe, same face. Do not introduce new characters in Acts 2–3.
- **How to define them:** Provide a full style_direction string to the director — age range, skin tone, hair, distinguishing accessories (wedding band, worn jacket, safety glasses pushed up, stethoscope, etc.). Repeat this string verbatim in every director call that features this persona.

---

## 6. Product UI in Video — The Compositing Rule

**Critical workflow finding:**

> **DO NOT** pass SaaS screenshots as a PRODUCT REFERENCE image to the director for scene generation. The director model cannot render readable, faithful UI from a reference image — it hallucinates plausible-but-wrong screens.

**The correct method — pre-composite via image-to-image generation:**
1. Take the real product screenshot.
2. Call the image generator with the screenshot as a reference URL and a prompt describing the device mockup in the scene environment (e.g., *"tablet on a truck hood, golden morning light, real product UI on screen, anamorphic shallow DoF, Portra color"*).
3. The result is a device-in-scene image with real UI composited in.
4. Use that composited image as the start frame for scene video generation, with a gentle push-in or rack-focus to the screen.

This is the **only reliable method** for showing real SaaS UI on-screen in a cinematic video. Apply it for every device shot in Act 2b.

---

## 7. CTA Mechanic

**Pattern: Soft spoken close + on-screen end card (no comment-bait).**

The close is earned through the narrative arc. The character seals a deal, the VO delivers the brand line, and the final end card carries the CTA as a static overlay.

- **Spoken CTA:** Woven into VO as a consequence statement, not a command. Example: *"This is how the best ones run their day."* — not *"Sign up today!"*
- **On-screen CTA:** Clean text overlay on end card. Logo + tagline + domain URL. Hold 6–8s.
- **Do NOT use** comment-bait, link-in-bio language, or urgency/scarcity mechanics — they break the cinematic register.

---

## 8. Music

- **Genre:** Cinematic orchestral instrumental. No lyrics.
- **Era feel:** 70s warmth — analog strings, understated brass. NOT modern epic trailer percussion or EDM builds.
- **Mix:** Duck under VO to approximately –18 dB. Bring up slightly during product-only shots with no VO. Fade out gently under end card hold.

---

## 9. Hard Rules / Do-Not-Regress

These are locked rules for every future application of this pattern:

1. **Brand color = the brand's exact color, not a generic equivalent.** Confirm the exact brand color (hex) before generating end card or color grade references. If the brand color is a deep, specific shade, match it precisely — not a visually "close enough" neighbor on the color wheel.
2. **End card = mood piece, never a UI screenshot.** The final scene is a cinematic atmosphere shot (silhouetted figure, brand-color ambient glow). Never animate or show the app UI as the end card — it makes the spot look like a demo video, not a brand film.
3. **Character is always the subject in world-in-motion shots.** When showing trades, crew, or activity, the camera stays on the professional character observing. Workers and activity are bokeh background. The professional is never replaced by a wide environment shot.
4. **One persona, consistent across all acts.** Use the same style_direction description verbatim in every scene featuring the professional. Do not switch characters between acts.
5. **VO copy density: 2.0–2.5 words/second minimum.** Each 8–10s scene needs 16–25 words of VO. Write full sentences; trim to rhythmic fragments; never trim below the density threshold.
6. **I2I compositing for all product UI.** Never trust the director to render faithful SaaS UI from a screenshot reference. Always pre-composite via image-to-image generation, then animate the result.
7. **No cut faster than 3 seconds.** This is a premium brand film. Fast-cut sequences are antithetical to the pattern.